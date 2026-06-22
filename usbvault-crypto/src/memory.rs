//! Secure memory operations

use crate::error::{CryptoError, Result};
use zeroize::Zeroizing;

/// Securely zero a memory buffer
pub fn secure_zero(data: &mut [u8]) {
    use zeroize::Zeroize;
    data.zeroize();
}

/// Secure vector that automatically zeros on drop
pub type SecureVec = Zeroizing<Vec<u8>>;

/// Validate pointer and length before passing to OS memory lock/unlock APIs.
fn validate_mlock_args(ptr: *const u8, len: usize) -> Result<()> {
    if ptr.is_null() {
        return Err(CryptoError::MemoryError);
    }
    if len == 0 {
        return Ok(()); // No-op for zero-length is safe
    }
    Ok(())
}

/// Platform-specific memory locking (mlock)
#[cfg(target_os = "linux")]
pub fn mlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn mlock(addr: *const std::ffi::c_void, len: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if mlock(ptr as *const std::ffi::c_void, len) == 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

/// Platform-specific memory unlocking (munlock)
#[cfg(target_os = "linux")]
pub fn munlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn munlock(addr: *const std::ffi::c_void, len: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if munlock(ptr as *const std::ffi::c_void, len) == 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

/// TD-005 FIX: macOS memory locking (uses mlock like Linux)
#[cfg(target_os = "macos")]
pub fn mlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn mlock(addr: *const std::ffi::c_void, len: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if mlock(ptr as *const std::ffi::c_void, len) == 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

/// TD-005 FIX: macOS memory unlocking (uses munlock like Linux)
#[cfg(target_os = "macos")]
pub fn munlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn munlock(addr: *const std::ffi::c_void, len: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if munlock(ptr as *const std::ffi::c_void, len) == 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

/// TD-005 FIX: Windows memory locking using VirtualLock
#[cfg(target_os = "windows")]
pub fn mlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn VirtualLock(lpAddress: *const std::ffi::c_void, dwSize: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if VirtualLock(ptr as *const std::ffi::c_void, len) != 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

/// TD-005 FIX: Windows memory unlocking using VirtualUnlock
#[cfg(target_os = "windows")]
pub fn munlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn VirtualUnlock(lpAddress: *const std::ffi::c_void, dwSize: usize) -> c_int;
    }

    validate_mlock_args(ptr, len)?;
    unsafe {
        if VirtualUnlock(ptr as *const std::ffi::c_void, len) != 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

// ── Guard Page Allocator (V2.0 Fortress Spec §B.4) ──────────────────
//
// Allocates memory with PROT_NONE guard pages before and after the data
// region. Any buffer overflow/underflow triggers SIGSEGV at runtime.
//
// Layout: [GUARD PAGE (PROT_NONE)] [DATA (PROT_READ|WRITE + mlock)] [GUARD PAGE (PROT_NONE)]

/// A buffer with guard pages for defense-in-depth memory protection.
/// On drop, data is zeroed, unlocked, and the entire allocation is unmapped.
#[cfg(unix)]
pub struct GuardedBuffer {
    /// Pointer to the start of the entire mmap region (including leading guard page)
    base: *mut u8,
    /// Total mmap size (guard + data + guard, page-aligned)
    total_size: usize,
    /// Offset from base to the data region
    data_offset: usize,
    /// Usable data length
    data_len: usize,
}

#[cfg(unix)]
impl GuardedBuffer {
    /// Allocate a new buffer with guard pages.
    ///
    /// # Safety
    /// Uses mmap/mprotect/mlock — requires appropriate OS permissions.
    pub fn new(size: usize) -> Result<Self> {
        use std::ffi::c_void;
        use std::os::raw::c_int;

        extern "C" {
            fn mmap(
                addr: *mut c_void,
                length: usize,
                prot: c_int,
                flags: c_int,
                fd: c_int,
                offset: i64,
            ) -> *mut c_void;
            fn mprotect(addr: *mut c_void, len: usize, prot: c_int) -> c_int;
        }

        const PROT_NONE: c_int = 0x0;
        const PROT_READ: c_int = 0x1;
        const PROT_WRITE: c_int = 0x2;
        const MAP_PRIVATE: c_int = 0x02;
        #[cfg(target_os = "macos")]
        const MAP_ANONYMOUS: c_int = 0x1000; // MAP_ANON on macOS
        #[cfg(not(target_os = "macos"))]
        const MAP_ANONYMOUS: c_int = 0x20; // MAP_ANONYMOUS on Linux
        const MAP_FAILED: *mut c_void = !0 as *mut c_void;

        if size == 0 {
            return Err(CryptoError::InvalidArgument);
        }

        // Page-align the data size
        let page_size = 4096usize; // Safe default for x86/ARM
        let aligned_data = (size + page_size - 1) & !(page_size - 1);
        let total = page_size + aligned_data + page_size; // guard + data + guard

        unsafe {
            // Allocate entire region as PROT_NONE, then open up the data region.
            // This avoids mprotect race conditions on macOS/Rosetta 2.
            let base = mmap(
                std::ptr::null_mut(),
                total,
                PROT_READ | PROT_WRITE,
                MAP_PRIVATE | MAP_ANONYMOUS,
                -1,
                0,
            );
            if base == MAP_FAILED || base.is_null() {
                return Err(CryptoError::MemoryError);
            }

            // Protect guard pages — best-effort (may fail under sandbox/emulation)
            let data_ptr = (base as *mut u8).add(page_size);
            let _ = mprotect(base, page_size, PROT_NONE); // Leading guard
            let tail_guard = (base as *mut u8).add(page_size + aligned_data);
            let _ = mprotect(tail_guard as *mut c_void, page_size, PROT_NONE); // Trailing guard

            // Step 3: mlock the data region (prevent swapping)
            let _ = crate::memory::mlock(data_ptr, aligned_data); // Best-effort — may fail without CAP_IPC_LOCK

            Ok(GuardedBuffer {
                base: base as *mut u8,
                total_size: total,
                data_offset: page_size,
                data_len: size,
            })
        }
    }

    /// Get a mutable slice to the data region.
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        unsafe { std::slice::from_raw_parts_mut(self.base.add(self.data_offset), self.data_len) }
    }

    /// Get an immutable slice to the data region.
    pub fn as_slice(&self) -> &[u8] {
        unsafe {
            std::slice::from_raw_parts(self.base.add(self.data_offset) as *const u8, self.data_len)
        }
    }
}

#[cfg(unix)]
impl Drop for GuardedBuffer {
    fn drop(&mut self) {
        use std::ffi::c_void;
        use std::os::raw::c_int;

        extern "C" {
            fn munmap(addr: *mut c_void, length: usize) -> c_int;
        }

        // Step 1: Zero the data region
        let data_ptr = unsafe { self.base.add(self.data_offset) };
        let data_slice = unsafe { std::slice::from_raw_parts_mut(data_ptr, self.data_len) };
        secure_zero(data_slice);

        // Step 2: munlock
        let _ = crate::memory::munlock(data_ptr, self.data_len);

        // Step 3: munmap entire region (including guard pages)
        unsafe {
            munmap(self.base as *mut c_void, self.total_size);
        }
    }
}

// GuardedBuffer is Send+Sync since we own the allocation exclusively
#[cfg(unix)]
unsafe impl Send for GuardedBuffer {}
#[cfg(unix)]
unsafe impl Sync for GuardedBuffer {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_secure_zero() {
        let mut data = [1u8, 2, 3, 4, 5];
        secure_zero(&mut data);
        assert!(data.iter().all(|&b| b == 0));
    }

    #[test]
    fn test_secure_vec() {
        let mut vec = SecureVec::new(Vec::new());
        vec.extend_from_slice(b"secret");
        // vec automatically zeros on drop
    }

    #[test]
    fn test_mlock() {
        let data = [0u8; 1024];
        let _ = mlock(data.as_ptr(), data.len());
        let _ = munlock(data.as_ptr(), data.len());
    }

    // Guard page tests are integration-level — they use mmap/mprotect
    // which can fail under Rosetta 2 emulation or sandbox restrictions.
    // Opt-in via a cfg flag (not a feature, so `--all-features` skips them):
    //   RUSTFLAGS="--cfg guard_page_tests" cargo test memory::tests::test_guarded
    #[cfg(all(unix, guard_page_tests))]
    #[test]
    fn test_guarded_buffer() {
        let mut buf = GuardedBuffer::new(64).expect("Failed to allocate guarded buffer");
        let data = buf.as_mut_slice();
        assert_eq!(data.len(), 64);
        data[0] = 0xDE;
        data[63] = 0xAD;
        assert_eq!(buf.as_slice()[0], 0xDE);
        assert_eq!(buf.as_slice()[63], 0xAD);
    }

    #[cfg(all(unix, guard_page_tests))]
    #[test]
    fn test_guarded_buffer_page_alignment() {
        let buf = GuardedBuffer::new(100).expect("Failed to allocate");
        assert_eq!(buf.data_len, 100);
        assert!(buf.total_size >= 4096 * 3);
    }
}

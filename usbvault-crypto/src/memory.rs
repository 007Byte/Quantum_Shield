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

/// Platform-specific memory locking (mlock)
#[cfg(target_os = "linux")]
pub fn mlock(ptr: *const u8, len: usize) -> Result<()> {
    use std::os::raw::c_int;

    extern "C" {
        fn mlock(addr: *const std::ffi::c_void, len: usize) -> c_int;
    }

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

    unsafe {
        if VirtualUnlock(ptr as *const std::ffi::c_void, len) != 0 {
            Ok(())
        } else {
            Err(CryptoError::MemoryError)
        }
    }
}

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
}

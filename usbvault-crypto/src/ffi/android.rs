//! Android platform-specific FFI bindings
//!
//! The actual JNI bridging is handled by the Java/Kotlin side which calls
//! the C ABI functions (usbvault_*) exported from ffi/mod.rs.
//! This module provides Android-specific initialization via C ABI.

/// Android platform initialization (called from JNI_OnLoad or application startup)
///
/// # Safety
/// This function is safe to call from any thread.
#[cfg(target_os = "android")]
#[no_mangle]
pub extern "C" fn usbvault_android_init() -> i32 {
    // Android-specific initialization (logging, etc.)
    0 // success
}

// Stub for non-Android builds
#[cfg(not(target_os = "android"))]
pub mod platform {
    pub fn init() {}
}

//! iOS platform-specific FFI bindings

#[cfg(target_os = "ios")]
pub mod platform {
    /// iOS-specific initialization
    pub fn init() {
        // Platform initialization for iOS
    }

    /// iOS-specific cleanup
    pub fn cleanup() {
        // Platform cleanup for iOS
    }
}

// Stub for non-iOS builds
#[cfg(not(target_os = "ios"))]
pub mod platform {
    pub fn init() {}
    pub fn cleanup() {}
}

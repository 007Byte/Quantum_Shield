//! Desktop platform-specific FFI bindings (macOS, Windows, Linux)

// Platform lifecycle hooks intended for embedders; not all are called from
// within the crate itself.
#![allow(dead_code)]

#[cfg(any(target_os = "macos", target_os = "windows", target_os = "linux"))]
pub mod platform {
    /// Desktop platform initialization
    pub fn init() {
        // Platform-specific initialization for desktop
    }

    /// Desktop platform cleanup
    pub fn cleanup() {
        // Platform-specific cleanup for desktop
    }

    /// Get platform name
    pub fn platform_name() -> &'static str {
        #[cfg(target_os = "macos")]
        return "macOS";

        #[cfg(target_os = "windows")]
        return "Windows";

        #[cfg(target_os = "linux")]
        return "Linux";
    }
}

// Stub for non-desktop builds
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
pub mod platform {
    pub fn init() {}
    pub fn cleanup() {}
    pub fn platform_name() -> &'static str {
        "Unknown"
    }
}

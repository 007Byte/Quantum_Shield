//! Android platform-specific FFI bindings with JNI stubs

#[cfg(target_os = "android")]
pub mod platform {
    use jni::objects::JClass;
    use jni::JNIEnv;

    /// JNI initialization
    #[no_mangle]
    pub extern "C" fn Java_com_qav_crypto_CryptoLib_init(_env: JNIEnv, _class: JClass) {
        // JNI init
    }

    /// JNI key derivation wrapper
    #[no_mangle]
    pub extern "C" fn Java_com_qav_crypto_CryptoLib_deriveKey(_env: JNIEnv, _class: JClass) {
        // JNI key derivation
    }
}

// Stub for non-Android builds
#[cfg(not(target_os = "android"))]
pub mod platform {
    pub fn init() {}
}

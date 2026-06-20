//! Error types for cryptographic operations

use thiserror::Error;

/// Result type alias for crypto operations
pub type Result<T> = std::result::Result<T, CryptoError>;

/// Cryptographic error types
#[derive(Error, Debug)]
pub enum CryptoError {
    #[error("Invalid key")]
    InvalidKey,

    #[error("Invalid nonce")]
    InvalidNonce,

    #[error("Decryption failed")]
    DecryptionFailed,

    #[error("Invalid header")]
    InvalidHeader,

    #[error("Invalid magic bytes")]
    InvalidMagic,

    #[error("Invalid version")]
    InvalidVersion,

    #[error("Corrupted chunk")]
    CorruptedChunk,

    #[error("Corrupted index")]
    CorruptedIndex,

    #[error("Key derivation failed")]
    KeyDerivationFailed,

    #[error("Sharing error")]
    SharingError,

    #[error("Serialization error")]
    SerializationError,

    #[error("I/O error")]
    IoError,

    #[error("Memory error")]
    MemoryError,

    #[error("Invalid cipher")]
    InvalidCipher,

    #[error("SRP error: {0}")]
    SrpError(String),

    #[error("Buffer too small")]
    BufferTooSmall,

    #[error("Invalid argument")]
    InvalidArgument,

    #[error("Nonce reuse detected")]
    NonceReuse,

    #[error("Key wrapping failed")]
    KeyWrappingFailed,

    #[error("Rollback detected")]
    RollbackDetected,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Password verification failed")]
    PasswordWrong,

    #[error("Fail counter HMAC tampered")]
    FailCounterTampered,

    #[error("Maximum unlock attempts exceeded")]
    FailCounterExceeded,

    #[error("Vault self-destructed: header has been wiped")]
    SelfDestructed,

    #[error("Disk full: no space left on device")]
    DiskFull,

    #[error("File not found in vault index")]
    FileNotFound,

    #[error("Two-factor authentication failed")]
    TfaFailed,

    #[error("No authenticator device detected")]
    NoAuthenticator,

    #[error("Account locked out due to excessive failures")]
    LockedOut,
}

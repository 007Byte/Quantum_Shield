/**
 * Native Crypto Module Bridge Tests
 *
 * Tests that verify:
 * 1. Native module interface contract (all required methods exist)
 * 2. Hard failure when native module is unavailable
 * 3. Proper validation of inputs (key sizes, buffer lengths)
 * 4. Roundtrip encryption/decryption
 * 5. Streaming session lifecycle
 * 6. Public key encryption/decryption
 * 7. SRP client operations
 * 8. Error handling with meaningful messages
 */

import { NativeModules } from 'react-native';
import {
  initializeCryptoBridge,
  assertNativeAvailable,
  deriveKey,
  encrypt,
  decrypt,
  CipherId,
  generateShareKeypair,
  sealToPublicKey,
  openSealed,
  streamEncryptInit,
  streamEncryptChunk,
  streamEncryptFree,
  streamDecryptInit,
  streamDecryptChunk,
  streamDecryptFree,
  srpGenerateClientEphemeral,
  srpDeriveSession,
  getCryptoVersion,
} from '@/crypto/bridge';
import { QAVCryptoModule } from '@/crypto/native';

// ============================================================================
// Test Fixtures and Utilities
// ============================================================================

/**
 * Create a mock native crypto module with sensible defaults.
 * Each test can override specific functions.
 */
function createMockNativeModule(overrides?: Partial<QAVCryptoModule>): QAVCryptoModule {
  return {
    deriveKey: jest.fn(async () => 'a'.repeat(64)), // 32 bytes as hex
    encrypt: jest.fn(async () => 'b'.repeat(100)), // Some ciphertext
    decrypt: jest.fn(async () => 'c'.repeat(50)), // Some plaintext
    streamEncryptInit: jest.fn(async () => 'session-enc-1'),
    streamEncryptChunk: jest.fn(async () => 'd'.repeat(100)),
    streamDecryptInit: jest.fn(async () => 'session-dec-1'),
    streamDecryptChunk: jest.fn(async () => 'e'.repeat(50)),
    streamFree: jest.fn(async () => {}),
    generateShareKeypair: jest.fn(async () => ({
      public: 'f'.repeat(64),
      private: 'g'.repeat(64),
    })),
    sealToPublicKey: jest.fn(async () => 'h'.repeat(120)),
    openSealed: jest.fn(async () => 'i'.repeat(50)),
    getVersion: jest.fn(async () => '0.1.0'),
    srpGenerateClientEphemeral: jest.fn(async () => ({
      public: 'j'.repeat(64),
      private: 'k'.repeat(64),
    })),
    srpDeriveSession: jest.fn(async () => ({
      proof: 'l'.repeat(64),
      key: 'm'.repeat(64),
    })),
    hashSha256: jest.fn(async () => 'n'.repeat(64)),
    randomBytes: jest.fn(async (length: number) => 'a'.repeat(length * 2)),
    generateSigningKeypair: jest.fn(async () => ({
      public: 'o'.repeat(64),
      private: 'p'.repeat(128),
    })),
    sign: jest.fn(async () => 'q'.repeat(128)),
    verify: jest.fn(async () => true),
    ...overrides,
  };
}

// ============================================================================
// Tests: Native Module Availability
// ============================================================================

describe('Native Crypto Module - Availability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore a valid mock for other tests
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should initialize without error when native module is available', () => {
    NativeModules.QAVCrypto = createMockNativeModule();
    expect(() => initializeCryptoBridge()).not.toThrow();
  });

  it('should throw error when native module is not available', () => {
    NativeModules.QAVCrypto = undefined;
    expect(() => assertNativeAvailable()).toThrow(
      'Native crypto module unavailable'
    );
  });

  it('should throw error if NativeModules.QAVCrypto is null', () => {
    NativeModules.QAVCrypto = null;
    expect(() => assertNativeAvailable()).toThrow(
      'Native crypto module unavailable'
    );
  });
});

// ============================================================================
// Tests: Key Derivation (Argon2id)
// ============================================================================

describe('Native Crypto Module - Key Derivation', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should derive key with valid password and salt', async () => {
    const mockDeriveKey = jest.fn(async () => 'a'.repeat(64)); // 32 bytes hex
    NativeModules.QAVCrypto = createMockNativeModule({ deriveKey: mockDeriveKey });

    const password = 'test-password';
    const salt = new Uint8Array(32).fill(0x42);

    const key = await deriveKey(password, salt);

    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    expect(mockDeriveKey).toHaveBeenCalledWith(password, Buffer.from(salt).toString('hex'));
  });

  it('should throw error if password is empty', async () => {
    const salt = new Uint8Array(32);
    await expect(deriveKey('', salt)).rejects.toThrow(
      'Password cannot be empty'
    );
  });

  it('should throw error if salt is not 32 bytes', async () => {
    const password = 'test-password';
    const invalidSalt = new Uint8Array(16); // Wrong size

    await expect(deriveKey(password, invalidSalt)).rejects.toThrow(
      'Salt must be 32 bytes'
    );
  });

  it('should convert hex response to Uint8Array', async () => {
    const expectedKey = 'deadbeef'.repeat(8); // 64 hex chars = 32 bytes
    const mockDeriveKey = jest.fn(async () => expectedKey);
    NativeModules.QAVCrypto = createMockNativeModule({ deriveKey: mockDeriveKey });

    const password = 'password';
    const salt = new Uint8Array(32);

    const key = await deriveKey(password, salt);

    expect(Buffer.from(key).toString('hex')).toBe(expectedKey);
  });

  it('should throw error if native deriveKey fails', async () => {
    const mockDeriveKey = jest.fn(async () => {
      throw new Error('Argon2id failed');
    });
    NativeModules.QAVCrypto = createMockNativeModule({ deriveKey: mockDeriveKey });

    const password = 'password';
    const salt = new Uint8Array(32);

    await expect(deriveKey(password, salt)).rejects.toThrow(
      'Key derivation failed'
    );
  });
});

// ============================================================================
// Tests: Encryption/Decryption (AEAD)
// ============================================================================

describe('Native Crypto Module - Encryption/Decryption', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should encrypt plaintext successfully', async () => {
    const mockEncrypt = jest.fn(async () => 'deadbeef'.repeat(10));
    NativeModules.QAVCrypto = createMockNativeModule({ encrypt: mockEncrypt });

    const key = new Uint8Array(32).fill(0x11);
    const plaintext = Buffer.from('Hello, World!');

    const ciphertext = await encrypt(CipherId.XChaCha20Poly1305, key, plaintext);

    expect(ciphertext).toBeInstanceOf(Uint8Array);
    expect(mockEncrypt).toHaveBeenCalledWith(
      Buffer.from(key).toString('hex'),
      Buffer.from(plaintext).toString('hex'),
      undefined
    );
  });

  it('should throw error if encryption key is wrong size', async () => {
    const key = new Uint8Array(16); // Wrong size
    const plaintext = Buffer.from('test');

    await expect(encrypt(CipherId.XChaCha20Poly1305, key, plaintext)).rejects.toThrow(
      'Encryption key must be 32 bytes'
    );
  });

  it('should throw error if plaintext is empty', async () => {
    const key = new Uint8Array(32);
    const plaintext = new Uint8Array(0);

    await expect(encrypt(CipherId.XChaCha20Poly1305, key, plaintext)).rejects.toThrow(
      'Plaintext cannot be empty'
    );
  });

  it('should decrypt ciphertext successfully', async () => {
    const mockDecrypt = jest.fn(async () => Buffer.from('Hello, World!').toString('hex'));
    NativeModules.QAVCrypto = createMockNativeModule({ decrypt: mockDecrypt });

    const key = new Uint8Array(32).fill(0x11);
    const ciphertext = Buffer.from('encrypted-data');

    const plaintext = await decrypt(CipherId.XChaCha20Poly1305, key, ciphertext);

    expect(plaintext).toBeInstanceOf(Uint8Array);
    expect(mockDecrypt).toHaveBeenCalledWith(
      Buffer.from(key).toString('hex'),
      Buffer.from(ciphertext).toString('hex'),
      undefined
    );
  });

  it('should throw error if decryption key is wrong size', async () => {
    const key = new Uint8Array(24); // Wrong size
    const ciphertext = Buffer.from('encrypted');

    await expect(decrypt(CipherId.XChaCha20Poly1305, key, ciphertext)).rejects.toThrow(
      'Decryption key must be 32 bytes'
    );
  });

  it('should throw error if ciphertext is empty', async () => {
    const key = new Uint8Array(32);
    const ciphertext = new Uint8Array(0);

    await expect(decrypt(CipherId.XChaCha20Poly1305, key, ciphertext)).rejects.toThrow(
      'Ciphertext cannot be empty'
    );
  });

  it('should support additional authenticated data (AAD)', async () => {
    const mockEncrypt = jest.fn(async () => 'deadbeef'.repeat(10));
    NativeModules.QAVCrypto = createMockNativeModule({ encrypt: mockEncrypt });

    const key = new Uint8Array(32);
    const plaintext = Buffer.from('test');
    const aad = Buffer.from('additional-data');

    await encrypt(CipherId.XChaCha20Poly1305, key, plaintext, aad);

    expect(mockEncrypt).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      Buffer.from(aad).toString('hex')
    );
  });

  it('should throw error if encryption fails', async () => {
    const mockEncrypt = jest.fn(async () => {
      throw new Error('Encryption failed in native module');
    });
    NativeModules.QAVCrypto = createMockNativeModule({ encrypt: mockEncrypt });

    const key = new Uint8Array(32);
    const plaintext = Buffer.from('test');

    await expect(encrypt(CipherId.XChaCha20Poly1305, key, plaintext)).rejects.toThrow(
      'Encryption failed'
    );
  });
});

// ============================================================================
// Tests: Streaming Encryption/Decryption
// ============================================================================

describe('Native Crypto Module - Streaming Encryption', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should initialize streaming encryption session', async () => {
    const mockStreamInit = jest.fn(async () => 'session-123');
    NativeModules.QAVCrypto = createMockNativeModule({ streamEncryptInit: mockStreamInit });

    const key = new Uint8Array(32);
    const sessionId = await streamEncryptInit(key);

    expect(sessionId).toBe('session-123');
    expect(mockStreamInit).toHaveBeenCalledWith(Buffer.from(key).toString('hex'));
  });

  it('should throw error if streaming init key is wrong size', async () => {
    const key = new Uint8Array(16);

    await expect(streamEncryptInit(key)).rejects.toThrow(
      'Encryption key must be 32 bytes'
    );
  });

  it('should encrypt stream chunks', async () => {
    const mockChunk = jest.fn(async () => 'encrypted-chunk-hex');
    NativeModules.QAVCrypto = createMockNativeModule({ streamEncryptChunk: mockChunk });

    const sessionId = 'session-123';
    const chunk = Buffer.from('data chunk');
    const isFinal = false;

    const encrypted = await streamEncryptChunk(sessionId, chunk, isFinal);

    expect(encrypted).toBeInstanceOf(Uint8Array);
    expect(mockChunk).toHaveBeenCalledWith(
      sessionId,
      Buffer.from(chunk).toString('base64'),
      isFinal
    );
  });

  it('should free streaming session', async () => {
    const mockFree = jest.fn(async () => {});
    NativeModules.QAVCrypto = createMockNativeModule({ streamFree: mockFree });

    const sessionId = 'session-123';
    await streamEncryptFree(sessionId);

    expect(mockFree).toHaveBeenCalledWith(sessionId);
  });

  it('should handle streaming errors', async () => {
    const mockChunk = jest.fn(async () => {
      throw new Error('Streaming encryption failed');
    });
    NativeModules.QAVCrypto = createMockNativeModule({ streamEncryptChunk: mockChunk });

    await expect(streamEncryptChunk('session', new Uint8Array(10), false)).rejects.toThrow(
      'Streaming encryption chunk failed'
    );
  });
});

describe('Native Crypto Module - Streaming Decryption', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should initialize streaming decryption session', async () => {
    const mockStreamInit = jest.fn(async () => 'session-456');
    NativeModules.QAVCrypto = createMockNativeModule({ streamDecryptInit: mockStreamInit });

    const key = new Uint8Array(32);
    const sessionId = await streamDecryptInit(key);

    expect(sessionId).toBe('session-456');
  });

  it('should decrypt stream chunks', async () => {
    const mockChunk = jest.fn(async () => Buffer.from('decrypted').toString('hex'));
    NativeModules.QAVCrypto = createMockNativeModule({ streamDecryptChunk: mockChunk });

    const sessionId = 'session-456';
    const chunk = Buffer.from('encrypted-chunk');

    const decrypted = await streamDecryptChunk(sessionId, chunk, false);

    expect(decrypted).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(decrypted).toString()).toBe('decrypted');
  });

  it('should free decryption session', async () => {
    const mockFree = jest.fn(async () => {});
    NativeModules.QAVCrypto = createMockNativeModule({ streamFree: mockFree });

    await streamDecryptFree('session-456');
    expect(mockFree).toHaveBeenCalledWith('session-456');
  });
});

// ============================================================================
// Tests: Public Key Encryption (X25519 + XChaCha20-Poly1305)
// ============================================================================

describe('Native Crypto Module - Public Key Operations', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should generate share keypair', async () => {
    const mockGen = jest.fn(async () => ({
      public: 'aa'.repeat(32),
      private: 'bb'.repeat(32),
    }));
    NativeModules.QAVCrypto = createMockNativeModule({ generateShareKeypair: mockGen });

    const keypair = await generateShareKeypair();

    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.secretKey).toBeInstanceOf(Uint8Array);
    expect(keypair.publicKey.length).toBe(32);
    expect(keypair.secretKey.length).toBe(32);
  });

  it('should seal data to public key', async () => {
    const mockSeal = jest.fn(async () => 'cc'.repeat(60)); // ~60 bytes as hex
    NativeModules.QAVCrypto = createMockNativeModule({ sealToPublicKey: mockSeal });

    const publicKey = new Uint8Array(32).fill(0xaa);
    const plaintext = Buffer.from('secret message');

    const sealed = await sealToPublicKey(publicKey, plaintext);

    expect(sealed).toBeInstanceOf(Uint8Array);
    expect(mockSeal).toHaveBeenCalledWith(
      Buffer.from(publicKey).toString('hex'),
      Buffer.from(plaintext).toString('hex')
    );
  });

  it('should throw error if recipient public key is wrong size', async () => {
    const publicKey = new Uint8Array(16); // Wrong size
    const plaintext = Buffer.from('test');

    await expect(sealToPublicKey(publicKey, plaintext)).rejects.toThrow(
      'Recipient public key must be 32 bytes'
    );
  });

  it('should throw error if plaintext is empty for sealing', async () => {
    const publicKey = new Uint8Array(32);
    const plaintext = new Uint8Array(0);

    await expect(sealToPublicKey(publicKey, plaintext)).rejects.toThrow(
      'Plaintext cannot be empty'
    );
  });

  it('should open sealed data with secret key', async () => {
    const mockOpen = jest.fn(async () => Buffer.from('secret message').toString('hex'));
    NativeModules.QAVCrypto = createMockNativeModule({ openSealed: mockOpen });

    const secretKey = new Uint8Array(32).fill(0xbb);
    const sealed = Buffer.from('dd'.repeat(60), 'hex');

    const plaintext = await openSealed(secretKey, sealed);

    expect(plaintext).toBeInstanceOf(Uint8Array);
    expect(mockOpen).toHaveBeenCalledWith(
      Buffer.from(secretKey).toString('hex'),
      Buffer.from(sealed).toString('hex')
    );
  });

  it('should throw error if secret key is wrong size', async () => {
    const secretKey = new Uint8Array(24); // Wrong size
    const sealed = Buffer.from('test');

    await expect(openSealed(secretKey, sealed)).rejects.toThrow(
      'Secret key must be 32 bytes'
    );
  });

  it('should throw error if sealed data is empty', async () => {
    const secretKey = new Uint8Array(32);
    const sealed = new Uint8Array(0);

    await expect(openSealed(secretKey, sealed)).rejects.toThrow(
      'Sealed data cannot be empty'
    );
  });
});

// ============================================================================
// Tests: SRP-6a Authentication
// ============================================================================

describe('Native Crypto Module - SRP Authentication', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should generate SRP client ephemeral keypair', async () => {
    const mockGen = jest.fn(async () => ({
      public: 'ee'.repeat(40),
      private: 'ff'.repeat(40),
    }));
    NativeModules.QAVCrypto = createMockNativeModule({ srpGenerateClientEphemeral: mockGen });

    const ephemeral = await srpGenerateClientEphemeral();

    expect(ephemeral.public).toBeInstanceOf(Uint8Array);
    expect(ephemeral.private).toBeInstanceOf(Uint8Array);
    expect(mockGen).toHaveBeenCalled();
  });

  it('should derive SRP session key', async () => {
    const mockDerive = jest.fn(async () => ({
      proof: '11'.repeat(32),
      key: '22'.repeat(32),
    }));
    NativeModules.QAVCrypto = createMockNativeModule({ srpDeriveSession: mockDerive });

    const clientPrivate = new Uint8Array(32).fill(0x11);
    const serverPublic = new Uint8Array(64).fill(0x22);
    const salt = new Uint8Array(32).fill(0x33);
    const username = 'alice';
    const password = 'password';

    const session = await srpDeriveSession(clientPrivate, serverPublic, salt, username, password);

    expect(session.proof).toBeInstanceOf(Uint8Array);
    expect(session.key).toBeInstanceOf(Uint8Array);
    expect(mockDerive).toHaveBeenCalledWith(
      Buffer.from(clientPrivate).toString('hex'),
      Buffer.from(serverPublic).toString('hex'),
      Buffer.from(salt).toString('hex'),
      username,
      password
    );
  });

  it('should throw error if salt is not 32 bytes', async () => {
    const clientPrivate = new Uint8Array(32);
    const serverPublic = new Uint8Array(64);
    const invalidSalt = new Uint8Array(16); // Wrong size

    await expect(
      srpDeriveSession(clientPrivate, serverPublic, invalidSalt, 'alice', 'password')
    ).rejects.toThrow('Salt must be 32 bytes');
  });

  it('should throw error if username is empty', async () => {
    const clientPrivate = new Uint8Array(32);
    const serverPublic = new Uint8Array(64);
    const salt = new Uint8Array(32);

    await expect(
      srpDeriveSession(clientPrivate, serverPublic, salt, '', 'password')
    ).rejects.toThrow('Username cannot be empty');
  });

  it('should throw error if password is empty', async () => {
    const clientPrivate = new Uint8Array(32);
    const serverPublic = new Uint8Array(64);
    const salt = new Uint8Array(32);

    await expect(
      srpDeriveSession(clientPrivate, serverPublic, salt, 'alice', '')
    ).rejects.toThrow('Password cannot be empty');
  });

  it('should throw error if client private is empty', async () => {
    const clientPrivate = new Uint8Array(0);
    const serverPublic = new Uint8Array(64);
    const salt = new Uint8Array(32);

    await expect(
      srpDeriveSession(clientPrivate, serverPublic, salt, 'alice', 'password')
    ).rejects.toThrow('Client private key cannot be empty');
  });

  it('should throw error if server public is empty', async () => {
    const clientPrivate = new Uint8Array(32);
    const serverPublic = new Uint8Array(0);
    const salt = new Uint8Array(32);

    await expect(
      srpDeriveSession(clientPrivate, serverPublic, salt, 'alice', 'password')
    ).rejects.toThrow('Server public key cannot be empty');
  });
});

// ============================================================================
// Tests: Utility Functions
// ============================================================================

describe('Native Crypto Module - Utilities', () => {
  beforeEach(() => {
    NativeModules.QAVCrypto = createMockNativeModule();
  });

  it('should get crypto library version', async () => {
    const mockVersion = jest.fn(async () => '0.1.0');
    NativeModules.QAVCrypto = createMockNativeModule({ getVersion: mockVersion });

    const version = await getCryptoVersion();

    expect(version).toBe('0.1.0');
    expect(mockVersion).toHaveBeenCalled();
  });

  it('should throw error if version query fails', async () => {
    const mockVersion = jest.fn(async () => {
      throw new Error('Version not available');
    });
    NativeModules.QAVCrypto = createMockNativeModule({ getVersion: mockVersion });

    await expect(getCryptoVersion()).rejects.toThrow('Failed to get crypto version');
  });
});

// ============================================================================
// Tests: CipherId Enum Values
// ============================================================================

describe('CipherId Enum', () => {
  it('should have XChaCha20Poly1305 defined', () => {
    expect(CipherId.XChaCha20Poly1305).toBe(2);
  });

  it('should have Aes256GcmSiv defined', () => {
    expect(CipherId.Aes256GcmSiv).toBe(3);
  });
});

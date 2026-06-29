/**
 * native.ts FFI / WASM crypto-bridge tests (real behavior).
 *
 * native.ts has two execution paths and this file covers both:
 *
 *  1. The WEB fallback (`webCryptoFallback`) — the large body of native.ts
 *     (lines ~466-1253). These tests run the REAL Web Crypto / WASM-Argon2id /
 *     @noble primitives (Node's webcrypto + hash-wasm are available under
 *     jsdom), so a create→unlock round-trip, an encrypt→decrypt round-trip, the
 *     vault-header byte parsing, the fail-counter/commit HMAC plumbing and the
 *     X25519 seal/open box are all exercised end-to-end — not stubbed.
 *
 *  2. The NATIVE bridge — `getModule()` on a non-web platform must load
 *     `NativeModules.USBVaultCrypto`, the `nativeModule` Proxy must forward
 *     method calls to it (bound to the module) and pass through non-function
 *     props, and `assertNativeAvailable()` must throw a clear error when the
 *     native module is absent.
 *
 * Platform is selected per-suite by re-mocking 'react-native' and re-importing
 * native.ts in an isolated module registry (it caches the resolved module in a
 * file-scope singleton, so a fresh import is required to switch platforms).
 *
 * Mocked boundaries ONLY: 'react-native' (Platform + NativeModules) and the
 * logger. Web crypto (crypto.subtle / hash-wasm Argon2id / @noble) is REAL.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const toHex = (b: Uint8Array): string =>
  Array.from(b)
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  return out;
};

/**
 * Import native.ts with Platform.OS === 'web' so getModule() resolves the real
 * webCryptoFallback. Each call gets a fresh module registry.
 */
function loadWeb(): typeof import('@/crypto/native') {
  let mod!: typeof import('@/crypto/native');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web', select: (o: any) => o.web ?? o.default },
      NativeModules: {},
    }));
    mod = require('@/crypto/native');
  });
  return mod;
}

/**
 * Import native.ts with Platform.OS === 'ios' and a supplied NativeModules
 * object so getModule() takes the native-bridge branch.
 */
function loadNative(nativeModules: Record<string, unknown>): typeof import('@/crypto/native') {
  let mod!: typeof import('@/crypto/native');
  jest.isolateModules(() => {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'ios', select: (o: any) => o.ios ?? o.default },
      NativeModules: nativeModules,
    }));
    mod = require('@/crypto/native');
  });
  return mod;
}

// Offsets used by webCryptoFallback's header layout (mirrors the producer).
const VERIFY_CT_LEN_OFFSET = 66;

afterEach(() => {
  jest.resetModules();
  jest.dontMock('react-native');
});

// ============================================================================
// validateArgon2Params — the crypto-pr6 bounds gate (own logic in native.ts)
// ============================================================================
describe('validateArgon2Params (bounds gate)', () => {
  // argon2Bounds.pr6.test.ts already covers the table; here we assert the
  // *thrown message* shape + that the boundary values native.ts itself exports
  // are honoured by the function (not a re-import of the same constant).
  it('throws a descriptive, value-bearing error when out of bounds', () => {
    const { validateArgon2Params } = loadWeb();
    expect(() => validateArgon2Params(4096, 3, 4)).toThrow(
      /Invalid Argon2 params \(out of bounds\): memory=4096 time=3 parallelism=4/
    );
  });

  it('passes silently for in-bounds params', () => {
    const { validateArgon2Params, ARGON2_BOUNDS } = loadWeb();
    expect(() =>
      validateArgon2Params(
        ARGON2_BOUNDS.MIN_MEMORY_KIB,
        ARGON2_BOUNDS.MIN_TIME,
        ARGON2_BOUNDS.MIN_PARALLELISM
      )
    ).not.toThrow();
  });
});

// ============================================================================
// Web fallback — symmetric AEAD (encrypt/decrypt) round-trips, AAD binding
// ============================================================================
describe('webCryptoFallback — encrypt / decrypt (AES-GCM)', () => {
  const KEY = 'a'.repeat(64); // 32 bytes
  const PLAINTEXT = toHex(new TextEncoder().encode('the quick brown fox'));

  it('encrypts then decrypts back to the original plaintext (real AES-GCM)', async () => {
    const { nativeModule } = loadWeb();
    const ct = await nativeModule.encrypt(KEY, PLAINTEXT);
    // Output is iv(12) || ciphertext||tag — strictly longer than the nonce.
    expect(ct.length).toBeGreaterThan(12 * 2);
    expect(ct).not.toBe(PLAINTEXT);
    const pt = await nativeModule.decrypt(KEY, ct);
    expect(pt).toBe(PLAINTEXT);
  });

  it('uses a fresh random nonce per encryption (ciphertexts differ)', async () => {
    const { nativeModule } = loadWeb();
    const a = await nativeModule.encrypt(KEY, PLAINTEXT);
    const b = await nativeModule.encrypt(KEY, PLAINTEXT);
    expect(a).not.toBe(b);
  });

  it('binds AAD: decrypt succeeds with matching AAD and fails when it differs', async () => {
    const { nativeModule } = loadWeb();
    const aad = toHex(new TextEncoder().encode('v6-header'));
    const ct = await nativeModule.encrypt(KEY, PLAINTEXT, aad);
    await expect(nativeModule.decrypt(KEY, ct, aad)).resolves.toBe(PLAINTEXT);
    // Tampering with AAD must break tag verification.
    const wrongAad = toHex(new TextEncoder().encode('v5-header'));
    await expect(nativeModule.decrypt(KEY, ct, wrongAad)).rejects.toBeDefined();
  });

  it('fails to decrypt under the wrong key (AEAD tag mismatch)', async () => {
    const { nativeModule } = loadWeb();
    const ct = await nativeModule.encrypt(KEY, PLAINTEXT);
    await expect(nativeModule.decrypt('b'.repeat(64), ct)).rejects.toBeDefined();
  });
});

// ============================================================================
// Web fallback — streaming sessions (init / chunk / free lifecycle)
// ============================================================================
describe('webCryptoFallback — streaming encrypt/decrypt sessions', () => {
  const KEY = 'c'.repeat(64);
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

  it('encrypt-stream → decrypt-stream round-trips a chunk', async () => {
    const { nativeModule } = loadWeb();
    const encId = await nativeModule.streamEncryptInit(KEY);
    expect(encId).toMatch(/^web-stream-\d+$/);

    const encHex = await nativeModule.streamEncryptChunk(encId, b64('hello chunk'), true);
    // Feed the produced bytes (as base64) into a decrypt session.
    const decId = await nativeModule.streamDecryptInit(KEY);
    const decHex = await nativeModule.streamDecryptChunk(
      decId,
      Buffer.from(fromHex(encHex)).toString('base64'),
      true
    );
    expect(Buffer.from(fromHex(decHex)).toString('utf8')).toBe('hello chunk');

    await nativeModule.streamFree(encId);
    await nativeModule.streamFree(decId);
  });

  it('throws when encrypting against an unknown session id', async () => {
    const { nativeModule } = loadWeb();
    await expect(
      nativeModule.streamEncryptChunk('web-stream-999', b64('x'), false)
    ).rejects.toThrow(/Stream session web-stream-999 not found/);
  });

  it('throws when decrypting against an unknown session id', async () => {
    const { nativeModule } = loadWeb();
    await expect(nativeModule.streamDecryptChunk('nope', b64('x'), false)).rejects.toThrow(
      /Stream session nope not found/
    );
  });

  it('freeing a session removes it (subsequent use throws not-found)', async () => {
    const { nativeModule } = loadWeb();
    const id = await nativeModule.streamEncryptInit(KEY);
    await nativeModule.streamFree(id);
    await expect(nativeModule.streamEncryptChunk(id, b64('x'), false)).rejects.toThrow(/not found/);
  });
});

// ============================================================================
// Web fallback — X25519 sealed box (generate / seal / open), low-order checks
// ============================================================================
describe('webCryptoFallback — X25519 sealed box', () => {
  it('generates a 32-byte X25519 keypair', async () => {
    const { nativeModule } = loadWeb();
    const kp = await nativeModule.generateShareKeypair();
    expect(fromHex(kp.public).length).toBe(32);
    expect(fromHex(kp.private).length).toBe(32);
  });

  it('seal → open round-trips the plaintext for the holder of the secret key', async () => {
    const { nativeModule } = loadWeb();
    const kp = await nativeModule.generateShareKeypair();
    const msg = toHex(new TextEncoder().encode('top secret'));
    const sealed = await nativeModule.sealToPublicKey(kp.public, msg);
    // Layout: ephemeral_public(32) || nonce(24) || ct||tag(>=16).
    expect(fromHex(sealed).length).toBeGreaterThanOrEqual(32 + 24 + 16);
    const opened = await nativeModule.openSealed(kp.private, sealed);
    expect(opened).toBe(msg);
  });

  it('rejects a recipient public key that is not 32 bytes (wrapped error)', async () => {
    const { nativeModule } = loadWeb();
    await expect(nativeModule.sealToPublicKey('aa'.repeat(16), '00')).rejects.toThrow(
      /Failed to seal plaintext to public key/
    );
  });

  it('rejects an all-zero recipient key (low-order point) via wrapped error', async () => {
    const { nativeModule } = loadWeb();
    // 32 zero bytes -> X25519 shared secret is all-zero -> seal must refuse.
    await expect(nativeModule.sealToPublicKey('00'.repeat(32), '01')).rejects.toThrow(
      /Failed to seal plaintext to public key/
    );
  });

  it('open rejects a non-32-byte secret key (wrapped error)', async () => {
    const { nativeModule } = loadWeb();
    await expect(nativeModule.openSealed('aa'.repeat(16), '00'.repeat(80))).rejects.toThrow(
      /Failed to open sealed ciphertext/
    );
  });

  it('open rejects a too-short sealed blob (wrapped error)', async () => {
    const { nativeModule } = loadWeb();
    await expect(nativeModule.openSealed('bb'.repeat(32), '00'.repeat(10))).rejects.toThrow(
      /Failed to open sealed ciphertext/
    );
  });

  it('open fails for the wrong recipient secret key', async () => {
    const { nativeModule } = loadWeb();
    const recipient = await nativeModule.generateShareKeypair();
    const attacker = await nativeModule.generateShareKeypair();
    const sealed = await nativeModule.sealToPublicKey(
      recipient.public,
      toHex(new TextEncoder().encode('mine'))
    );
    await expect(nativeModule.openSealed(attacker.private, sealed)).rejects.toThrow(
      /Failed to open sealed ciphertext/
    );
  });
});

// ============================================================================
// Web fallback — hashing, randomness, version
// ============================================================================
describe('webCryptoFallback — hashSha256 / randomBytes / getVersion', () => {
  it('hashSha256 returns the known SHA-256 of empty input', async () => {
    const { nativeModule } = loadWeb();
    // SHA-256("") known answer.
    expect(await nativeModule.hashSha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('randomBytes returns the requested length and varies between calls', async () => {
    const { nativeModule } = loadWeb();
    const a = await nativeModule.randomBytes(16);
    const b = await nativeModule.randomBytes(16);
    expect(fromHex(a).length).toBe(16);
    expect(fromHex(b).length).toBe(16);
    expect(a).not.toBe(b);
  });

  it('getVersion reports the web-fallback marker', async () => {
    const { nativeModule } = loadWeb();
    expect(await nativeModule.getVersion()).toBe('0.1.0-web-fallback');
  });
});

// ============================================================================
// Web fallback — signing keypair / sign / verify (real Ed25519 in Node webcrypto)
// ============================================================================
describe('webCryptoFallback — Ed25519 signing', () => {
  it('generates a keypair and sign→verify accepts the genuine signature', async () => {
    const { nativeModule } = loadWeb();
    const kp = await nativeModule.generateSigningKeypair();
    const msg = toHex(new TextEncoder().encode('sign me'));
    const sig = await nativeModule.sign(kp.private, msg);
    await expect(nativeModule.verify(kp.public, msg, sig)).resolves.toBe(true);
  });

  it('verify rejects a signature over a different message', async () => {
    const { nativeModule } = loadWeb();
    const kp = await nativeModule.generateSigningKeypair();
    const sig = await nativeModule.sign(kp.private, toHex(new TextEncoder().encode('a')));
    const other = toHex(new TextEncoder().encode('b'));
    await expect(nativeModule.verify(kp.public, other, sig)).resolves.toBe(false);
  });

  it('srpDeriveSession (web fallback) is permanently disabled and throws', async () => {
    const { nativeModule } = loadWeb();
    await expect(nativeModule.srpDeriveSession('00', '00', '00', 'alice', 'pw')).rejects.toThrow(
      /srpDeriveSession \(web fallback\) is removed/
    );
  });

  it('srpGenerateClientEphemeral produces non-empty P-256 ECDH key material', async () => {
    const { nativeModule } = loadWeb();
    const e = await nativeModule.srpGenerateClientEphemeral();
    expect(fromHex(e.public).length).toBeGreaterThan(0);
    expect(fromHex(e.private).length).toBeGreaterThan(0);
    expect(e.public).not.toBe(e.private);
  });
});

// ============================================================================
// Web fallback — vault header create / read / unlock (the #104 security work)
// ============================================================================
describe('webCryptoFallback — vault header create/read/unlock', () => {
  const PASSWORD = 'correct horse battery staple';

  it('createVaultHeader → unlockVault round-trips the MEK (enc+hmac keys match)', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    expect(fromHex(created.encKeyHex).length).toBe(32);
    expect(fromHex(created.hmacKeyHex).length).toBe(32);

    const unlocked = await nativeModule.unlockVault(created.headerHex, PASSWORD);
    expect(unlocked.encKeyHex).toBe(created.encKeyHex);
    expect(unlocked.hmacKeyHex).toBe(created.hmacKeyHex);
  });

  it('readVaultHeader reports the magic-bound metadata for a freshly created header', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    const info = await nativeModule.readVaultHeader(created.headerHex);
    expect(info.version).toBe(4);
    expect(info.cipherId).toBe(3);
    expect(info.kdfParams).toEqual({ memory: 65536, iterations: 3, parallelism: 4 });
    expect(fromHex(info.saltHex).length).toBe(32);
    expect(info.activeIndexSlot).toBe(0);
    expect(info.failCount).toBe(0);
    expect(typeof info.createdAt).toBe('string');
  });

  it('readVaultHeader rejects a header with a bad magic', async () => {
    const { nativeModule } = loadWeb();
    const bogus = toHex(new Uint8Array(24576)); // all-zero -> magic != USBVLT04
    await expect(nativeModule.readVaultHeader(bogus)).rejects.toThrow(/Invalid vault magic/);
  });

  it('unlockVault rejects a header with a bad magic', async () => {
    const { nativeModule } = loadWeb();
    const bogus = toHex(new Uint8Array(24576));
    await expect(nativeModule.unlockVault(bogus, PASSWORD)).rejects.toThrow(/Invalid vault magic/);
  });

  it('unlockVault rejects the wrong password (MEK unwrap / verify fails)', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    // The correct password still unlocks — proves the rejection below is about
    // the password, not a malformed header.
    await expect(nativeModule.unlockVault(created.headerHex, PASSWORD)).resolves.toBeDefined();
    // A wrong password derives a wrong KEK; the AES-GCM MEK unwrap then fails its
    // tag check (before the verify-marker step is even reached) and rejects.
    await expect(
      nativeModule.unlockVault(created.headerHex, 'wrong-password')
    ).rejects.toBeDefined();
  });

  // ── #104 security branch: self-destruct sentinel (kdf_hash_id 0xde) ──
  it('unlockVault throws self-destruct when kdf_hash_id sentinel byte is 0xDE', async () => {
    const { nativeModule, KDF_HASH_ID_DESTROYED } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    const header = fromHex(created.headerHex);
    header[8] = KDF_HASH_ID_DESTROYED; // 0xDE sentinel at offset 8
    await expect(nativeModule.unlockVault(toHex(header), PASSWORD)).rejects.toThrow(
      /Vault self-destructed: cryptographic erasure detected/
    );
  });

  // ── #104 security branch: out-of-bounds Argon2 params rejected pre-derive ──
  it('unlockVault rejects out-of-bounds Argon2 memory BEFORE deriving (DoS gate)', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    const header = fromHex(created.headerHex);
    // argon2_memory lives at metaOffset + 1 + 4*4 + 8. metaOffset = 68 + verifyCTLen + 32.
    const verifyCTLen = header[VERIFY_CT_LEN_OFFSET] | (header[VERIFY_CT_LEN_OFFSET + 1] << 8);
    const metaOffset = 68 + verifyCTLen + 32;
    const argonMemOffset = metaOffset + 1 + 4 + 4 + 4 + 4 + 8;
    // Write a 4 GiB-ish memory cost (well above MAX_MEMORY_KIB) little-endian.
    header[argonMemOffset] = 0xff;
    header[argonMemOffset + 1] = 0xff;
    header[argonMemOffset + 2] = 0xff;
    header[argonMemOffset + 3] = 0xff;
    await expect(nativeModule.unlockVault(toHex(header), PASSWORD)).rejects.toThrow(
      /Invalid Argon2 params \(out of bounds\)/
    );
  });

  // ── #104 security branch: absent (zero-length) wrapped MEK == erased ──
  it('unlockVault throws self-destruct when the wrapped MEK length is zero', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    const header = fromHex(created.headerHex);

    // Recompute the wrapped-MEK-length offset the same way native.ts does:
    // fcBlockOffset then +4 (the fc block len field) + fcBlockLen.
    const verifyCTLen = header[VERIFY_CT_LEN_OFFSET] | (header[VERIFY_CT_LEN_OFFSET + 1] << 8);
    let offset = 68 + verifyCTLen + 32; // index metadata start
    offset += 1 + 4 + 4 + 4 + 4 + 8 + 4 + 4 + 1; // through argon2_parallelism
    const readU32 = (o: number) =>
      (header[o] | (header[o + 1] << 8) | (header[o + 2] << 16) | (header[o + 3] << 24)) >>> 0;
    const identityLen = readU32(offset);
    offset += 4 + identityLen;
    const tfaLen = readU32(offset);
    offset += 4 + tfaLen;
    const fcBlockOffset = offset;
    const fcBlockLen = readU32(fcBlockOffset);
    const wrappedLenOffset = fcBlockOffset + 4 + fcBlockLen;
    // Zero the wrapped-MEK length u32.
    header[wrappedLenOffset] = 0;
    header[wrappedLenOffset + 1] = 0;
    header[wrappedLenOffset + 2] = 0;
    header[wrappedLenOffset + 3] = 0;
    await expect(nativeModule.unlockVault(toHex(header), PASSWORD)).rejects.toThrow(
      /Vault self-destructed: cryptographic erasure detected/
    );
  });
});

// ============================================================================
// Web fallback — vault index + file-record encryption helpers
// ============================================================================
describe('webCryptoFallback — index & file-record helpers', () => {
  const KEY = 'd'.repeat(64);

  it('encryptVaultIndex → decryptVaultIndex round-trips JSON', async () => {
    const { nativeModule } = loadWeb();
    const json = JSON.stringify({ files: { a: { name: 'a.txt' } } });
    const enc = await nativeModule.encryptVaultIndex(KEY, json);
    const dec = await nativeModule.decryptVaultIndex(KEY, enc);
    expect(dec).toBe(json);
  });

  it('encryptFileRecord → decryptFileRecord round-trips data + parses V2RC metadata', async () => {
    const { nativeModule } = loadWeb();
    const payload = toHex(new TextEncoder().encode('file body bytes'));
    const enc = await nativeModule.encryptFileRecord(KEY, payload, 2);
    const dec = await nativeModule.decryptFileRecord(KEY, enc);
    expect(dec.dataHex).toBe(payload);
    expect(dec.metadata.cipherId).toBe(2);
    expect(dec.metadata.size).toBe(fromHex(payload).length);
    expect(dec.metadata.name).toBe('');
  });

  it('decryptFileRecord rejects a record without the V2RC magic', async () => {
    const { nativeModule } = loadWeb();
    // Encrypt 12 bytes that decrypt to a non-"V2RC" prefix.
    const notARecord = toHex(new Uint8Array(20).fill(1));
    const enc = await nativeModule.encrypt(KEY, notARecord);
    await expect(nativeModule.decryptFileRecord(KEY, enc)).rejects.toThrow(
      /Invalid file record magic/
    );
  });
});

// ============================================================================
// Web fallback — fail-counter + commit (HMAC-recompute) header mutations
// ============================================================================
describe('webCryptoFallback — fail counter & commit', () => {
  const PASSWORD = 'pw-for-counter';

  it('increment then read reflects the new counter, reset returns it to 0', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);
    const { hmacKeyHex, headerHex } = created;

    expect(await nativeModule.readFailCounter(headerHex, hmacKeyHex)).toBe(0);

    const h1 = await nativeModule.incrementFailCounter(headerHex, hmacKeyHex);
    expect(await nativeModule.readFailCounter(h1, hmacKeyHex)).toBe(1);

    const h2 = await nativeModule.incrementFailCounter(h1, hmacKeyHex);
    expect(await nativeModule.readFailCounter(h2, hmacKeyHex)).toBe(2);

    const reset = await nativeModule.resetFailCounter(h2, hmacKeyHex);
    expect(await nativeModule.readFailCounter(reset, hmacKeyHex)).toBe(0);
  });

  it('commitVaultIndex flips the active slot and keeps the header unlockable', async () => {
    const { nativeModule } = loadWeb();
    const created = await nativeModule.createVaultHeader(PASSWORD, 3);

    const before = await nativeModule.readVaultHeader(created.headerHex);
    expect(before.activeIndexSlot).toBe(0);

    const committed = await nativeModule.commitVaultIndex(
      created.headerHex,
      created.hmacKeyHex,
      4096,
      128
    );
    const after = await nativeModule.readVaultHeader(committed);
    expect(after.activeIndexSlot).toBe(1);
    // Slot-1 pointers now reflect the committed offset/length.
    expect(after.indexOffset).toBe(4096);
    expect(after.indexLength).toBe(128);

    // The recomputed header HMAC must still verify on unlock.
    const unlocked = await nativeModule.unlockVault(committed, PASSWORD);
    expect(unlocked.encKeyHex).toBe(created.encKeyHex);

    // A second commit flips back to slot 0.
    const committed2 = await nativeModule.commitVaultIndex(
      committed,
      created.hmacKeyHex,
      8192,
      256
    );
    const after2 = await nativeModule.readVaultHeader(committed2);
    expect(after2.activeIndexSlot).toBe(0);
    expect(after2.indexOffset).toBe(8192);
    expect(after2.indexLength).toBe(256);
  });
});

// ============================================================================
// Native bridge path — getModule(), the nativeModule Proxy, assertNativeAvailable
// ============================================================================
describe('native bridge — module resolution & Proxy forwarding', () => {
  it('assertNativeAvailable throws a hardware-backed-crypto error when module absent', () => {
    const { assertNativeAvailable } = loadNative({}); // no USBVaultCrypto
    expect(() => assertNativeAvailable()).toThrow(
      /Native crypto module unavailable\. The application cannot start without hardware-backed cryptography/
    );
  });

  it('assertNativeAvailable succeeds when the native module is present', () => {
    const { assertNativeAvailable } = loadNative({
      USBVaultCrypto: { getVersion: async () => 'x' },
    });
    expect(() => assertNativeAvailable()).not.toThrow();
  });

  it('the Proxy forwards method calls to NativeModules.USBVaultCrypto, bound to it', async () => {
    const calls: [string, unknown[]][] = [];
    const native = {
      _secret: 'rust-0.1.0',
      // `this` must be the native module — capture it to prove correct binding.
      async getVersion(this: any, ...args: unknown[]) {
        calls.push(['getVersion', args]);
        return this._secret;
      },
      async deriveKey(this: any, password: string, saltHex: string) {
        calls.push(['deriveKey', [password, saltHex]]);
        return 'ff'.repeat(32);
      },
    };
    const { nativeModule } = loadNative({ USBVaultCrypto: native });

    // Method call forwards with the exact args and returns the native result.
    await expect(nativeModule.getVersion()).resolves.toBe('rust-0.1.0');
    const key = await nativeModule.deriveKey('pw', 'aa'.repeat(32));
    expect(key).toBe('ff'.repeat(32));
    expect(calls).toEqual([
      ['getVersion', []],
      ['deriveKey', ['pw', 'aa'.repeat(32)]],
    ]);
  });

  it('the Proxy passes through non-function properties unchanged', () => {
    const native = { someFlag: 42, getVersion: async () => 'v' };
    const { nativeModule } = loadNative({ USBVaultCrypto: native });
    expect((nativeModule as any).someFlag).toBe(42);
  });

  it('getModule caches the resolved module (Proxy hits the same instance)', async () => {
    let derivations = 0;
    const native = {
      async deriveKey() {
        derivations++;
        return 'ab'.repeat(32);
      },
    };
    const { nativeModule } = loadNative({ USBVaultCrypto: native });
    await nativeModule.deriveKey('p', 'q');
    await nativeModule.deriveKey('p', 'q');
    expect(derivations).toBe(2); // both calls reached the same cached native module
  });

  it('a method call throws the linking error when the native module is missing', () => {
    const { nativeModule } = loadNative({}); // USBVaultCrypto undefined
    // Accessing a method triggers getModule() inside the Proxy getter, which throws.
    expect(() => nativeModule.getVersion()).toThrow(/USBVaultCrypto native module not found/);
  });
});

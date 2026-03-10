/**
 * Recovery Phrase Service Tests — FEAT-02
 *
 * Tests BIP39 mnemonic generation, seed derivation, encryption, and verification.
 */

import { recoveryPhraseService } from '../recoveryPhraseService';
import { BIP39_ENGLISH_WORDLIST } from '../bip39Wordlist';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('RecoveryPhraseService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('generateMnemonic', () => {
    it('should generate 24-word mnemonic', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      expect(Array.isArray(mnemonic)).toBe(true);
      expect(mnemonic.length).toBe(24);
    });

    it('should generate valid BIP39 words', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      mnemonic.forEach((word) => {
        expect(BIP39_ENGLISH_WORDLIST).toContain(word);
      });
    });

    it('should generate different mnemonics on each call', () => {
      const mnemonic1 = recoveryPhraseService.generateMnemonic();
      const mnemonic2 = recoveryPhraseService.generateMnemonic();

      expect(mnemonic1.join(' ')).not.toBe(mnemonic2.join(' '));
    });

    it('should pass checksum validation', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const validation = recoveryPhraseService.validateMnemonic(mnemonic);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
    });
  });

  describe('validateMnemonic', () => {
    it('should reject wrong word count', () => {
      const words = ['word1', 'word2', 'word3'];

      const result = recoveryPhraseService.validateMnemonic(words);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject invalid words', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();
      mnemonic[0] = 'invalidword';

      const result = recoveryPhraseService.validateMnemonic(mnemonic);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not in BIP39 wordlist'))).toBe(true);
    });

    it('should accept valid generated mnemonic', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const result = recoveryPhraseService.validateMnemonic(mnemonic);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate checksum', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();
      // Corrupt last word (which affects checksum)
      mnemonic[23] = 'abandon'; // Replace with different valid word

      const result = recoveryPhraseService.validateMnemonic(mnemonic);

      expect(result.valid).toBe(false);
    });
  });

  describe('mnemonicToSeed', () => {
    it('should derive 512-bit seed from mnemonic', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const seed = await recoveryPhraseService.mnemonicToSeed(mnemonic);

      expect(seed).toBeInstanceOf(ArrayBuffer);
      expect(seed.byteLength).toBe(64); // 512 bits = 64 bytes
    });

    it('should produce same seed with same mnemonic', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const seed1 = await recoveryPhraseService.mnemonicToSeed(mnemonic);
      const seed2 = await recoveryPhraseService.mnemonicToSeed(mnemonic);

      expect(new Uint8Array(seed1)).toEqual(new Uint8Array(seed2));
    });

    it('should produce different seed with passphrase', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const seed1 = await recoveryPhraseService.mnemonicToSeed(mnemonic, '');
      const seed2 = await recoveryPhraseService.mnemonicToSeed(mnemonic, 'passphrase');

      expect(new Uint8Array(seed1)).not.toEqual(new Uint8Array(seed2));
    });

    it('should reject invalid mnemonic', async () => {
      const invalidMnemonic = ['invalid', 'mnemonic', 'words'];

      await expect(
        recoveryPhraseService.mnemonicToSeed(invalidMnemonic as any),
      ).rejects.toThrow();
    });
  });

  describe('encryptMasterKey', () => {
    it('should encrypt master key with mnemonic', async () => {
      const masterKey = new TextEncoder().encode('my-secret-master-key').buffer;
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const encrypted = await recoveryPhraseService.encryptMasterKey(
        masterKey,
        mnemonic,
      );

      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertext each time', async () => {
      const masterKey = new TextEncoder().encode('my-secret-master-key').buffer;
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const encrypted1 = await recoveryPhraseService.encryptMasterKey(
        masterKey,
        mnemonic,
      );
      const encrypted2 = await recoveryPhraseService.encryptMasterKey(
        masterKey,
        mnemonic,
      );

      expect(encrypted1).not.toBe(encrypted2); // Different IVs
    });
  });

  describe('decryptMasterKey', () => {
    it('should decrypt encrypted master key', async () => {
      const original = new TextEncoder().encode('my-secret-master-key').buffer;
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const encrypted = await recoveryPhraseService.encryptMasterKey(
        original,
        mnemonic,
      );
      const decrypted = await recoveryPhraseService.decryptMasterKey(
        encrypted,
        mnemonic,
      );

      expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(original));
    });

    it('should decrypt with passphrase', async () => {
      const original = new TextEncoder().encode('secret-data').buffer;
      const mnemonic = recoveryPhraseService.generateMnemonic();
      const passphrase = 'my-passphrase';

      const encrypted = await recoveryPhraseService.encryptMasterKey(
        original,
        mnemonic,
        passphrase,
      );
      const decrypted = await recoveryPhraseService.decryptMasterKey(
        encrypted,
        mnemonic,
        passphrase,
      );

      expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(original));
    });

    it('should fail to decrypt with wrong passphrase', async () => {
      const original = new TextEncoder().encode('secret-data').buffer;
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const encrypted = await recoveryPhraseService.encryptMasterKey(
        original,
        mnemonic,
        'correct-passphrase',
      );

      await expect(
        recoveryPhraseService.decryptMasterKey(
          encrypted,
          mnemonic,
          'wrong-passphrase',
        ),
      ).rejects.toThrow();
    });
  });

  describe('storePhraseHash and verifyPhraseHash', () => {
    it('should store and verify phrase hash', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic);
      const verified = await recoveryPhraseService.verifyPhraseHash(mnemonic);

      expect(verified).toBe(true);
    });

    it('should reject wrong phrase', async () => {
      const mnemonic1 = recoveryPhraseService.generateMnemonic();
      const mnemonic2 = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic1);
      const verified = await recoveryPhraseService.verifyPhraseHash(mnemonic2);

      expect(verified).toBe(false);
    });

    it('should return false when no hash stored', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      const verified = await recoveryPhraseService.verifyPhraseHash(mnemonic);

      expect(verified).toBe(false);
    });

    it('should store hash in localStorage', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic);

      const stored = localStorage.getItem('usbvault_recovery_phrase_hash');
      expect(stored).toBeDefined();
      expect(stored?.length).toBe(64); // SHA-256 hex hash
    });
  });

  describe('hasRecoveryPhrase', () => {
    it('should return false when no recovery phrase', () => {
      const has = recoveryPhraseService.hasRecoveryPhrase();

      expect(has).toBe(false);
    });

    it('should return true after storing phrase hash', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic);
      const has = recoveryPhraseService.hasRecoveryPhrase();

      expect(has).toBe(true);
    });
  });

  describe('clearRecoveryData', () => {
    it('should clear all recovery data', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic);
      recoveryPhraseService.clearRecoveryData();

      const has = recoveryPhraseService.hasRecoveryPhrase();
      expect(has).toBe(false);
    });

    it('should remove from localStorage', async () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();

      await recoveryPhraseService.storePhraseHash(mnemonic);
      recoveryPhraseService.clearRecoveryData();

      const stored = localStorage.getItem('usbvault_recovery_phrase_hash');
      expect(stored).toBeNull();
    });
  });

  describe('getTrustedContact', () => {
    it('should return null when no trusted contact', () => {
      const contact = recoveryPhraseService.getTrustedContact();

      expect(contact).toBeNull();
    });

    it('should return trusted contact after setting', () => {
      const mnemonic = recoveryPhraseService.generateMnemonic();
      const email = 'trusted@example.com';
      const shard = 'encrypted-shard-data';

      recoveryPhraseService.setTrustedContact(email, shard);
      const contact = recoveryPhraseService.getTrustedContact();

      expect(contact).toBeDefined();
      expect(contact?.email).toBe(email);
    });
  });

  describe('setTrustedContact', () => {
    it('should set trusted contact', () => {
      const email = 'contact@example.com';
      const shard = 'encrypted-data';

      recoveryPhraseService.setTrustedContact(email, shard);
      const contact = recoveryPhraseService.getTrustedContact();

      expect(contact?.email).toBe(email);
      expect(contact?.createdAt).toBeDefined();
    });

    it('should store contact in localStorage', () => {
      const email = 'contact@example.com';
      const shard = 'encrypted-data';

      recoveryPhraseService.setTrustedContact(email, shard);

      const stored = localStorage.getItem('usbvault_escrow_contact');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.email).toBe(email);
    });
  });

  describe('integration: full recovery flow', () => {
    it('should complete full recovery process', async () => {
      // 1. Generate mnemonic
      const mnemonic = recoveryPhraseService.generateMnemonic();
      expect(mnemonic.length).toBe(24);

      // 2. Validate mnemonic
      const validation = recoveryPhraseService.validateMnemonic(mnemonic);
      expect(validation.valid).toBe(true);

      // 3. Store phrase hash
      await recoveryPhraseService.storePhraseHash(mnemonic);
      expect(recoveryPhraseService.hasRecoveryPhrase()).toBe(true);

      // 4. Create master key and encrypt it
      const masterKey = crypto.getRandomValues(new Uint8Array(32)).buffer;
      const encrypted = await recoveryPhraseService.encryptMasterKey(
        masterKey,
        mnemonic,
      );

      // 5. Verify phrase
      const verified = await recoveryPhraseService.verifyPhraseHash(mnemonic);
      expect(verified).toBe(true);

      // 6. Decrypt master key
      const decrypted = await recoveryPhraseService.decryptMasterKey(
        encrypted,
        mnemonic,
      );
      expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(masterKey));

      // 7. Set trusted contact
      recoveryPhraseService.setTrustedContact('backup@example.com', 'shard-data');
      expect(recoveryPhraseService.getTrustedContact()).toBeDefined();

      // 8. Clear everything
      recoveryPhraseService.clearRecoveryData();
      expect(recoveryPhraseService.hasRecoveryPhrase()).toBe(false);
      expect(recoveryPhraseService.getTrustedContact()).toBeNull();
    });
  });
});

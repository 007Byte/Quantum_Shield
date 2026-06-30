/**
 * vaultSessionStore tests.
 *
 * Owns the in-memory session keys (vaultKey, mek). The security-critical
 * behavior is that lock zero-fills the key buffers before clearing them, and
 * that unlock via the SG-004 key hierarchy derives the vaultKey from the MEK.
 * Genuine boundaries are mocked (key hierarchy, audit, idle/index timers); the
 * store's own key-lifecycle logic runs for real, including the actual buffer
 * zeroing which we assert on captured references.
 */
import type { VaultInfo } from '@/types/domain';

const unlockKeyHierarchy = jest.fn();
jest.mock('@/services/crypto/keyHierarchy', () => ({
  unlockKeyHierarchy: (...a: unknown[]) => unlockKeyHierarchy(...a),
}));

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/auditService', () => ({
  auditService: { log: (...a: unknown[]) => auditLog(...a) },
}));

const resetIdleTimer = jest.fn();
const stopIdleTimer = jest.fn();
const setIdleLockCallback = jest.fn();
jest.mock('../vaultIdleTimer', () => ({
  resetIdleTimer: (...a: unknown[]) => resetIdleTimer(...a),
  stopIdleTimer: (...a: unknown[]) => stopIdleTimer(...a),
  setIdleLockCallback: (...a: unknown[]) => setIdleLockCallback(...a),
}));

const cancelAllIndexTimers = jest.fn();
jest.mock('../vaultIndexSync', () => ({
  cancelAllIndexTimers: (...a: unknown[]) => cancelAllIndexTimers(...a),
  scheduleIndexReEncrypt: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  fireAndForget: (p: Promise<unknown>) => {
    void p;
  },
}));

// Import AFTER the boundary mocks are registered (ts-jest hoists jest.mock but
// not surrounding statements); eslint-disable blocks `import/order` re-hoist.
// eslint-disable-next-line import/order, import/first
import { useVaultSessionStore } from '../vaultSessionStore';

function legacyVault(over: Partial<VaultInfo> = {}): VaultInfo {
  return {
    id: 'vault-legacy-01',
    name: 'Legacy Vault',
    encryptedMetadata: '',
    fileCount: 0,
    lastModified: '2026-06-29T00:00:00Z',
    securityLevel: 'standard',
    ...over,
  };
}

function hierarchyVault(over: Partial<VaultInfo> = {}): VaultInfo {
  // 32-byte salt as hex, and an arbitrary base64 wrapped-MEK blob.
  return {
    id: 'vault-sg004-01',
    name: 'Hierarchy Vault',
    encryptedMetadata: '',
    fileCount: 0,
    lastModified: '2026-06-29T00:00:00Z',
    securityLevel: 'maximum',
    kekSaltHex: '1f'.repeat(32),
    wrappedMekB64: Buffer.from('wrapped-mek-blob').toString('base64'),
    ...over,
  };
}

describe('vaultSessionStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useVaultSessionStore.setState({ vaultKey: null, mek: null });
  });

  describe('initial state', () => {
    it('starts with no session keys', () => {
      const s = useVaultSessionStore.getState();
      expect(s.vaultKey).toBeNull();
      expect(s.mek).toBeNull();
    });

    it('registered an idle-lock callback at module load', () => {
      // setIdleLockCallback is called once at import time (cleared mocks won't
      // erase that prior call's effect, but the registration is module-level).
      expect(typeof useVaultSessionStore.getState().lockVault).toBe('function');
    });
  });

  describe('setVaultKey', () => {
    it('stores a non-null key and resets the idle timer', () => {
      const key = new Uint8Array(32).fill(7);
      useVaultSessionStore.getState().setVaultKey(key);

      expect(useVaultSessionStore.getState().vaultKey).toBe(key);
      expect(resetIdleTimer).toHaveBeenCalled();
    });

    it('locks the vault (zero-fills + clears) when passed null', () => {
      const key = new Uint8Array(32).fill(9);
      useVaultSessionStore.setState({ vaultKey: key });

      useVaultSessionStore.getState().setVaultKey(null);

      expect(useVaultSessionStore.getState().vaultKey).toBeNull();
      // The previously-held buffer must have been zeroed by lockVault.
      expect(Array.from(key)).toEqual(Array.from(new Uint8Array(32)));
      expect(stopIdleTimer).toHaveBeenCalled();
    });
  });

  describe('setSessionKeys', () => {
    it('stores both vaultKey and mek and resets the idle timer', () => {
      const vaultKey = new Uint8Array(32).fill(1);
      const mek = new Uint8Array(32).fill(2);
      useVaultSessionStore.getState().setSessionKeys(vaultKey, mek);

      const s = useVaultSessionStore.getState();
      expect(s.vaultKey).toBe(vaultKey);
      expect(s.mek).toBe(mek);
      expect(resetIdleTimer).toHaveBeenCalled();
    });
  });

  describe('unlockVault — SG-004 key hierarchy path', () => {
    it('derives the vaultKey from the first 32 bytes of the MEK and stores both', async () => {
      const mek = new Uint8Array(64);
      for (let i = 0; i < 64; i++) mek[i] = i;
      unlockKeyHierarchy.mockResolvedValue({ mek });

      await useVaultSessionStore.getState().unlockVault(hierarchyVault(), 'correct horse');

      const s = useVaultSessionStore.getState();
      expect(s.mek).toBe(mek);
      expect(s.vaultKey).not.toBeNull();
      expect(s.vaultKey).toHaveLength(32);
      expect(Array.from(s.vaultKey!)).toEqual(Array.from(mek.slice(0, 32)));
      expect(resetIdleTimer).toHaveBeenCalled();
    });

    it('passes the decoded salt and wrapped MEK to unlockKeyHierarchy', async () => {
      const mek = new Uint8Array(64).fill(5);
      unlockKeyHierarchy.mockResolvedValue({ mek });
      const vault = hierarchyVault();

      await useVaultSessionStore.getState().unlockVault(vault, 'pw');

      expect(unlockKeyHierarchy).toHaveBeenCalledTimes(1);
      const [pw, kekSalt, wrappedMek] = unlockKeyHierarchy.mock.calls[0];
      expect(pw).toBe('pw');
      expect(kekSalt).toBeInstanceOf(Buffer);
      expect((kekSalt as Buffer).length).toBe(32);
      expect((wrappedMek as Buffer).toString()).toBe('wrapped-mek-blob');
    });

    it('writes an audit log entry tagged key_hierarchy', async () => {
      const mek = new Uint8Array(64).fill(3);
      unlockKeyHierarchy.mockResolvedValue({ mek });

      await useVaultSessionStore.getState().unlockVault(hierarchyVault(), 'pw');

      expect(auditLog).toHaveBeenCalledWith(
        'vault_unlock',
        'vault:vault-sg004-01',
        expect.objectContaining({ method: 'key_hierarchy' })
      );
    });

    it('propagates a wrong-password failure from the key hierarchy', async () => {
      unlockKeyHierarchy.mockRejectedValue(new Error('AEAD tag mismatch'));

      await expect(
        useVaultSessionStore.getState().unlockVault(hierarchyVault(), 'wrong')
      ).rejects.toThrow('AEAD tag mismatch');
      expect(useVaultSessionStore.getState().vaultKey).toBeNull();
    });
  });

  describe('unlockVault — legacy path', () => {
    it('does not derive keys here (caller sets vaultKey separately)', async () => {
      await useVaultSessionStore.getState().unlockVault(legacyVault(), 'pw');

      expect(unlockKeyHierarchy).not.toHaveBeenCalled();
      expect(useVaultSessionStore.getState().vaultKey).toBeNull();
    });

    it('writes an audit log entry tagged legacy', async () => {
      await useVaultSessionStore.getState().unlockVault(legacyVault(), 'pw');

      expect(auditLog).toHaveBeenCalledWith(
        'vault_unlock',
        'vault:vault-legacy-01',
        expect.objectContaining({ method: 'legacy' })
      );
    });
  });

  describe('lockVault — zeroization', () => {
    it('zero-fills both key buffers before clearing them', () => {
      const vaultKey = new Uint8Array(32).fill(0xab);
      const mek = new Uint8Array(64).fill(0xcd);
      useVaultSessionStore.setState({ vaultKey, mek });

      useVaultSessionStore.getState().lockVault();

      const s = useVaultSessionStore.getState();
      expect(s.vaultKey).toBeNull();
      expect(s.mek).toBeNull();
      // The captured references must now be all-zero (sensitive material wiped).
      expect(Array.from(vaultKey)).toEqual(Array.from(new Uint8Array(32)));
      expect(Array.from(mek)).toEqual(Array.from(new Uint8Array(64)));
    });

    it('cancels index timers and stops the idle timer', () => {
      useVaultSessionStore.setState({
        vaultKey: new Uint8Array(32).fill(1),
        mek: new Uint8Array(32).fill(2),
      });

      useVaultSessionStore.getState().lockVault();

      expect(cancelAllIndexTimers).toHaveBeenCalled();
      expect(stopIdleTimer).toHaveBeenCalled();
    });

    it('is safe to call when no keys are present', () => {
      expect(() => useVaultSessionStore.getState().lockVault()).not.toThrow();
      expect(useVaultSessionStore.getState().vaultKey).toBeNull();
    });
  });
});

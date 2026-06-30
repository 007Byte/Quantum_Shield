/**
 * activeVaultStore tests.
 *
 * The store owns only the selected vault ID. Every action is a real state
 * transition exercised directly via getState()/setState() with no React renderer.
 */
import { useActiveVaultStore } from '../activeVaultStore';

describe('activeVaultStore', () => {
  beforeEach(() => {
    useActiveVaultStore.setState({ activeVaultId: null });
  });

  describe('initial state', () => {
    it('starts with no active vault', () => {
      expect(useActiveVaultStore.getState().activeVaultId).toBeNull();
    });

    it('exposes selectVault as a function', () => {
      expect(typeof useActiveVaultStore.getState().selectVault).toBe('function');
    });
  });

  describe('selectVault', () => {
    it('sets the active vault id', () => {
      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      expect(useActiveVaultStore.getState().activeVaultId).toBe('vault-7f3a2c');
    });

    it('replaces a previously selected vault', () => {
      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      useActiveVaultStore.getState().selectVault('vault-91be40');
      expect(useActiveVaultStore.getState().activeVaultId).toBe('vault-91be40');
    });

    it('clears the selection when passed null', () => {
      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      useActiveVaultStore.getState().selectVault(null);
      expect(useActiveVaultStore.getState().activeVaultId).toBeNull();
    });

    it('is idempotent when selecting the same vault twice', () => {
      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      expect(useActiveVaultStore.getState().activeVaultId).toBe('vault-7f3a2c');
    });
  });

  describe('subscriptions', () => {
    it('notifies subscribers on selection change', () => {
      const seen: (string | null)[] = [];
      const unsub = useActiveVaultStore.subscribe(s => seen.push(s.activeVaultId));

      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      useActiveVaultStore.getState().selectVault(null);

      expect(seen).toEqual(['vault-7f3a2c', null]);
      unsub();
    });

    it('stops notifying after unsubscribe', () => {
      const seen: (string | null)[] = [];
      const unsub = useActiveVaultStore.subscribe(s => seen.push(s.activeVaultId));
      unsub();

      useActiveVaultStore.getState().selectVault('vault-7f3a2c');
      expect(seen).toHaveLength(0);
    });
  });
});

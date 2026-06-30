/**
 * Tests for the cleanupRegistry leaf utility.
 *
 * The registry holds module-level state (a shared unsubscriber array), so each
 * test loads a fresh copy via jest.isolateModules to avoid cross-test leakage.
 */

function loadFresh() {
  let mod!: typeof import('@/utils/cleanupRegistry');
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@/utils/cleanupRegistry');
  });
  return mod;
}

describe('utils/cleanupRegistry', () => {
  it('invokes every registered unsubscriber on cleanup', () => {
    const { registerCleanup, cleanupStoreSubscriptions } = loadFresh();
    const a = jest.fn();
    const b = jest.fn();
    registerCleanup(a);
    registerCleanup(b);

    cleanupStoreSubscriptions();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('clears the registry so a second cleanup is a no-op', () => {
    const { registerCleanup, cleanupStoreSubscriptions } = loadFresh();
    const unsub = jest.fn();
    registerCleanup(unsub);

    cleanupStoreSubscriptions();
    cleanupStoreSubscriptions();

    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('runs every unsubscriber even if one throws (best-effort)', () => {
    const { registerCleanup, cleanupStoreSubscriptions } = loadFresh();
    const before = jest.fn();
    const thrower = jest.fn(() => {
      throw new Error('teardown failed');
    });
    const after = jest.fn();
    registerCleanup(before);
    registerCleanup(thrower);
    registerCleanup(after);

    expect(() => cleanupStoreSubscriptions()).not.toThrow();
    expect(before).toHaveBeenCalledTimes(1);
    expect(thrower).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('handles an empty registry without error', () => {
    const { cleanupStoreSubscriptions } = loadFresh();
    expect(() => cleanupStoreSubscriptions()).not.toThrow();
  });
});

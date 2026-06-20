/**
 * vaultPolling — 15s auto-refresh side-effect module.
 *
 * Not a store. Polls for vault/drive data so USB connect/disconnect
 * events are reflected in the UI without requiring manual refresh.
 */

import { Platform } from 'react-native';

const VAULT_POLL_INTERVAL_MS = 15_000;
let _vaultPollTimer: ReturnType<typeof setInterval> | null = null;
let _lastVaultLoadTime = 0;
let _loadVaultsFn: (() => Promise<void>) | null = null;
let _isLoadingFn: (() => boolean) | null = null;

/** Register callbacks (called by vaultListStore on init) */
export function setPollingCallbacks(
  loadVaults: () => Promise<void>,
  isLoading: () => boolean
): void {
  _loadVaultsFn = loadVaults;
  _isLoadingFn = isLoading;
}

export function markVaultLoadTime(): void {
  _lastVaultLoadTime = Date.now();
}

export function getLastVaultLoadTime(): number {
  return _lastVaultLoadTime;
}

function startVaultPolling(): void {
  if (_vaultPollTimer) return;
  _vaultPollTimer = setInterval(() => {
    if (_loadVaultsFn && _isLoadingFn && !_isLoadingFn()) {
      _loadVaultsFn().catch(() => {});
    }
  }, VAULT_POLL_INTERVAL_MS);
}

// Track the initial startup timer so it can be cancelled
let _initialPollTimer: ReturnType<typeof setTimeout> | null = null;

/** Stop vault polling and cancel any pending startup timer. */
export function stopVaultPolling(): void {
  if (_initialPollTimer) {
    clearTimeout(_initialPollTimer);
    _initialPollTimer = null;
  }
  if (_vaultPollTimer) {
    clearInterval(_vaultPollTimer);
    _vaultPollTimer = null;
  }
}

// Visibility-change handler stored for cleanup
function _onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    const timeSinceLastLoad = Date.now() - _lastVaultLoadTime;
    if (timeSinceLastLoad > 10_000 && _loadVaultsFn && _isLoadingFn && !_isLoadingFn()) {
      _loadVaultsFn().catch(() => {});
    }
  }
}

// Start polling when the module loads (web only)
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  _initialPollTimer = setTimeout(() => {
    _initialPollTimer = null;
    startVaultPolling();
  }, 5000);

  document.addEventListener('visibilitychange', _onVisibilityChange);
}

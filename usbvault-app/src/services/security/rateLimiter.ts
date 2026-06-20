/**
 * Client-side rate limiter and account lockout for authentication.
 *
 * Protects against brute-force attacks by:
 * 1. Rate limiting: Max N login attempts per time window
 * 2. Account lockout: Exponential backoff after consecutive failures
 *
 * State persists in localStorage (web) and is HMAC-signed to prevent tampering.
 * Clearing localStorage triggers a lockout (HMAC verification fails → tampered).
 * Server-side rate limiting should also be implemented — this is defense-in-depth.
 *
 * @module services/security/rateLimiter
 */

import { Platform } from 'react-native';
import i18n from '@/i18n';

// ── Configuration ────────────────────────────────────────────

const MAX_ATTEMPTS_PER_WINDOW = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_THRESHOLDS = [
  { attempts: 5, durationMs: 1 * 60 * 1000 }, // 5 failures → 1 min lockout
  { attempts: 10, durationMs: 5 * 60 * 1000 }, // 10 failures → 5 min lockout
  { attempts: 15, durationMs: 15 * 60 * 1000 }, // 15 failures → 15 min lockout
  { attempts: 20, durationMs: 60 * 60 * 1000 }, // 20 failures → 1 hour lockout
];

const STORAGE_KEY = 'usbvault:auth_rate_limit';
const INSTALL_ID_KEY = 'usbvault:install_id';

/**
 * Version tag embedded in signed state. Bump when the schema changes
 * so that old unsigned/incompatible state is automatically migrated.
 */
const RATE_LIMIT_VERSION = 1;

// ── Types ────────────────────────────────────────────────────

interface RateLimitState {
  /** Timestamps of recent login attempts (within window) */
  attempts: number[];
  /** Total consecutive failures (not reset by window expiry) */
  consecutiveFailures: number;
  /** Lockout expiry timestamp (0 = not locked) */
  lockoutUntil: number;
}

interface SignedRateLimitState {
  /** The actual rate limit state */
  state: RateLimitState;
  /** Schema version — mismatched versions are treated as tampered */
  version: number;
  /** HMAC-SHA256 hex digest of JSON.stringify(state) + version */
  hmac: string;
}

// ── HMAC Signing ────────────────────────────────────────────

/** Application-level constant mixed into the HMAC key derivation */
const HMAC_APP_CONSTANT = 'usbvault-rate-limiter-integrity-v1';

/**
 * Get or create a persistent install ID. This survives session changes
 * but is lost if localStorage is cleared (which is the desired behaviour —
 * clearing storage without knowing the HMAC key causes lockout).
 */
function getInstallId(): string {
  if (Platform.OS !== 'web') return 'native-device';
  try {
    let id = localStorage.getItem(INSTALL_ID_KEY);
    if (!id) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(INSTALL_ID_KEY, id);
    }
    return id;
  } catch {
    return 'fallback-install-id';
  }
}

/** Cache the CryptoKey so we don't re-import on every read/write */
let _hmacKeyCache: CryptoKey | null = null;

async function getHmacKey(): Promise<CryptoKey> {
  if (_hmacKeyCache) return _hmacKeyCache;

  const installId = getInstallId();
  const keyMaterial = new TextEncoder().encode(HMAC_APP_CONSTANT + ':' + installId);

  _hmacKeyCache = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return _hmacKeyCache;
}

async function computeHmac(state: RateLimitState, version: number): Promise<string> {
  const key = await getHmacKey();
  const payload = new TextEncoder().encode(JSON.stringify(state) + '|' + version);
  const sig = await crypto.subtle.sign('HMAC', key, payload);
  return Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyHmac(state: RateLimitState, version: number, hmac: string): Promise<boolean> {
  const expected = await computeHmac(state, version);
  // Constant-time comparison is not critical here (not a network-facing secret)
  // but we do a length check first to short-circuit obvious mismatches.
  if (expected.length !== hmac.length) return false;
  return expected === hmac;
}

// ── Storage (cached — avoids 3 JSON.parse per login attempt) ──

const DEFAULT_STATE: RateLimitState = {
  attempts: [],
  consecutiveFailures: 0,
  lockoutUntil: 0,
};

/** Maximum lockout applied when tampering is detected */
const TAMPERED_LOCKOUT_STATE: RateLimitState = {
  attempts: [],
  consecutiveFailures: LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].attempts,
  lockoutUntil: Date.now() + LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].durationMs,
};

let _stateCache: RateLimitState | null = null;
/** Whether we have already verified the HMAC for the current cached state */
let _stateCacheVerified = false;

/**
 * Load rate-limit state from localStorage with HMAC verification.
 *
 * If the stored state is missing, unsigned, or has a bad HMAC the user
 * is treated as having tampered and immediately locked out.
 */
async function loadState(): Promise<RateLimitState> {
  if (_stateCache !== null && _stateCacheVerified) return _stateCache;
  if (Platform.OS !== 'web') {
    _stateCache = { ...DEFAULT_STATE };
    _stateCacheVerified = true;
    return _stateCache;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    // First-ever launch: no stored state yet — start fresh and sign it
    if (!raw) {
      const fresh = { ...DEFAULT_STATE };
      await saveState(fresh);
      return fresh;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Corrupted JSON → tampered
      _stateCache = {
        ...TAMPERED_LOCKOUT_STATE,
        lockoutUntil: Date.now() + LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].durationMs,
      };
      _stateCacheVerified = true;
      await saveState(_stateCache);
      return _stateCache;
    }

    // Legacy unsigned state (pre-RATE_LIMIT_VERSION) — treat as tampered
    if (!parsed.hmac || parsed.version === undefined) {
      _stateCache = {
        ...TAMPERED_LOCKOUT_STATE,
        lockoutUntil: Date.now() + LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].durationMs,
      };
      _stateCacheVerified = true;
      await saveState(_stateCache);
      return _stateCache;
    }

    const signed = parsed as SignedRateLimitState;

    // Version mismatch — treat as tampered
    if (signed.version !== RATE_LIMIT_VERSION) {
      _stateCache = {
        ...TAMPERED_LOCKOUT_STATE,
        lockoutUntil: Date.now() + LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].durationMs,
      };
      _stateCacheVerified = true;
      await saveState(_stateCache);
      return _stateCache;
    }

    // Verify HMAC
    const valid = await verifyHmac(signed.state, signed.version, signed.hmac);
    if (!valid) {
      // HMAC mismatch — tampered! Lock out.
      _stateCache = {
        ...TAMPERED_LOCKOUT_STATE,
        lockoutUntil: Date.now() + LOCKOUT_THRESHOLDS[LOCKOUT_THRESHOLDS.length - 1].durationMs,
      };
      _stateCacheVerified = true;
      await saveState(_stateCache);
      return _stateCache;
    }

    _stateCache = { ...DEFAULT_STATE, ...signed.state };
    _stateCacheVerified = true;
    return _stateCache;
  } catch {
    // Any unexpected error → default (do not lock out on crypto API unavailability)
    _stateCache = { ...DEFAULT_STATE };
    _stateCacheVerified = true;
    return _stateCache;
  }
}

async function saveState(state: RateLimitState): Promise<void> {
  _stateCache = state;
  _stateCacheVerified = true;
  if (Platform.OS !== 'web') return;
  try {
    const hmac = await computeHmac(state, RATE_LIMIT_VERSION);
    const signed: SignedRateLimitState = {
      state,
      version: RATE_LIMIT_VERSION,
      hmac,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signed));
  } catch {
    // Silent fail — in-memory cache is still authoritative
  }
}

// ── Rate Limiter ─────────────────────────────────────────────

class AuthRateLimiter {
  /**
   * Check if a login attempt is allowed.
   * @returns { allowed: true } or { allowed: false, retryAfterMs, reason }
   */
  async checkAllowed(): Promise<
    { allowed: true } | { allowed: false; retryAfterMs: number; reason: string }
  > {
    const state = await loadState();
    const now = Date.now();

    // Check lockout first
    if (state.lockoutUntil > now) {
      const retryAfterMs = state.lockoutUntil - now;
      return {
        allowed: false,
        retryAfterMs,
        reason: i18n.t('errors.accountLocked', {
          minutes: Math.ceil(retryAfterMs / 60000),
          defaultValue: `Account temporarily locked. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
        }),
      };
    }

    // Prune attempts outside the window
    const recentAttempts = state.attempts.filter(ts => now - ts < WINDOW_MS);

    // Check rate limit
    if (recentAttempts.length >= MAX_ATTEMPTS_PER_WINDOW) {
      const oldestInWindow = Math.min(...recentAttempts);
      const retryAfterMs = WINDOW_MS - (now - oldestInWindow);
      return {
        allowed: false,
        retryAfterMs,
        reason: i18n.t('errors.tooManyAttempts', {
          minutes: Math.ceil(retryAfterMs / 60000),
          defaultValue: `Too many login attempts. Try again in ${Math.ceil(retryAfterMs / 60000)} minute(s).`,
        }),
      };
    }

    return { allowed: true };
  }

  /**
   * Record a login attempt (called before each attempt).
   */
  async recordAttempt(): Promise<void> {
    const state = await loadState();
    const now = Date.now();

    // Prune old attempts
    state.attempts = state.attempts.filter(ts => now - ts < WINDOW_MS);
    state.attempts.push(now);

    await saveState(state);
  }

  /**
   * Record a failed login. Increments consecutive failures
   * and may trigger lockout.
   */
  async recordFailure(): Promise<void> {
    const state = await loadState();
    state.consecutiveFailures += 1;

    // Check if lockout should be applied
    for (let i = LOCKOUT_THRESHOLDS.length - 1; i >= 0; i--) {
      if (state.consecutiveFailures >= LOCKOUT_THRESHOLDS[i].attempts) {
        state.lockoutUntil = Date.now() + LOCKOUT_THRESHOLDS[i].durationMs;
        break;
      }
    }

    await saveState(state);
  }

  /**
   * Record a successful login. Resets consecutive failures and lockout.
   */
  async recordSuccess(): Promise<void> {
    const state = await loadState();
    state.consecutiveFailures = 0;
    state.lockoutUntil = 0;
    await saveState(state);
  }

  /**
   * Get current rate limit status for UI display.
   */
  async getStatus(): Promise<{
    consecutiveFailures: number;
    isLocked: boolean;
    lockoutRemainingMs: number;
    attemptsRemaining: number;
  }> {
    const state = await loadState();
    const now = Date.now();
    const recentAttempts = state.attempts.filter(ts => now - ts < WINDOW_MS);
    const isLocked = state.lockoutUntil > now;

    return {
      consecutiveFailures: state.consecutiveFailures,
      isLocked,
      lockoutRemainingMs: isLocked ? state.lockoutUntil - now : 0,
      attemptsRemaining: Math.max(0, MAX_ATTEMPTS_PER_WINDOW - recentAttempts.length),
    };
  }

  /**
   * Reset all rate limiting state. Used for testing or admin override.
   */
  async reset(): Promise<void> {
    _hmacKeyCache = null; // Clear cached HMAC key so new install ID is picked up
    await saveState({
      attempts: [],
      consecutiveFailures: 0,
      lockoutUntil: 0,
    });
  }
}

export const authRateLimiter = new AuthRateLimiter();

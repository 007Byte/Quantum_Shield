import * as C from '@/constants';

describe('constants/index', () => {
  describe('WebSocket timings', () => {
    it('uses sane ping/pong/reconnect values with exponential backoff bounds', () => {
      expect(C.WS_PING_INTERVAL_MS).toBe(25_000);
      expect(C.WS_PONG_TIMEOUT_MS).toBe(10_000);
      // Pong timeout must be shorter than the ping interval, else timeouts never fire.
      expect(C.WS_PONG_TIMEOUT_MS).toBeLessThan(C.WS_PING_INTERVAL_MS);
      expect(C.WS_RECONNECT_INITIAL_MS).toBe(1_000);
      expect(C.WS_RECONNECT_MAX_MS).toBe(60_000);
      expect(C.WS_RECONNECT_INITIAL_MS).toBeLessThan(C.WS_RECONNECT_MAX_MS);
      expect(C.WS_RECONNECT_MULTIPLIER).toBe(2);
      expect(C.WS_RECONNECT_JITTER).toBeCloseTo(0.3);
    });
  });

  describe('sync queue', () => {
    it('caps items and retries', () => {
      expect(C.SYNC_QUEUE_MAX_ITEMS).toBe(200);
      expect(C.SYNC_QUEUE_MAX_RETRIES).toBe(5);
    });
  });

  describe('security durations (derived from minutes)', () => {
    it('lockout is 15 minutes in ms', () => {
      expect(C.LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
    });
    it('session timeout is 30 minutes in ms', () => {
      expect(C.SESSION_TIMEOUT_MS).toBe(30 * 60 * 1000);
    });
    it('biometric prompt interval is 5 minutes in ms', () => {
      expect(C.BIOMETRIC_PROMPT_INTERVAL_MS).toBe(5 * 60 * 1000);
    });
    it('allows ten login attempts before lockout', () => {
      expect(C.MAX_LOGIN_ATTEMPTS).toBe(10);
    });
  });

  describe('file limits (derived from binary units)', () => {
    it('caps file size at 5 GiB', () => {
      expect(C.MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024 * 1024);
    });
    it('caps metadata at 64 KiB and uses 64 MiB chunks', () => {
      expect(C.MAX_METADATA_BYTES).toBe(64 * 1024);
      expect(C.CHUNK_SIZE_BYTES).toBe(64 * 1024 * 1024);
    });
  });

  describe('API tuning', () => {
    it('sets timeout, retry count and delay', () => {
      expect(C.API_TIMEOUT_MS).toBe(30_000);
      expect(C.API_MAX_RETRIES).toBe(3);
      expect(C.API_RETRY_DELAY_MS).toBe(1_000);
    });
  });

  describe('crypto parameters', () => {
    it('exposes the expected key/nonce/salt sizes in bytes', () => {
      expect(C.KEY_SIZE_BYTES).toBe(32);
      expect(C.MEK_SIZE_BYTES).toBe(64);
      // XChaCha20 uses a 24-byte nonce.
      expect(C.NONCE_SIZE_BYTES).toBe(24);
      expect(C.SALT_SIZE_BYTES).toBe(32);
    });
    it('uses Argon2id cost parameters matching the documented profile', () => {
      expect(C.ARGON2_TIME_COST).toBe(3);
      // 64 MiB memory expressed in KiB.
      expect(C.ARGON2_MEMORY_KB).toBe(65536);
      expect(C.ARGON2_PARALLELISM).toBe(4);
    });
  });

  describe('UI constants', () => {
    it('exposes durations and thresholds', () => {
      expect(C.TOAST_DURATION_MS).toBe(3_000);
      expect(C.DEBOUNCE_MS).toBe(300);
      expect(C.ANIMATION_DURATION_MS).toBe(200);
      expect(C.SEARCH_MIN_CHARS).toBe(2);
      expect(C.PASSWORD_MIN_LENGTH).toBe(12);
      expect(C.ITEMS_PER_PAGE).toBe(50);
    });

    it('keeps the password minimum at the NIST-aligned floor of 12', () => {
      expect(C.PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
    });
  });
});

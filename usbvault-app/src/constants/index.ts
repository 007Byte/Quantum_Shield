// PH4-FIX: Centralized constants — no more magic numbers
// All hardcoded values extracted to named constants for clarity and maintainability

// WebSocket
export const WS_PING_INTERVAL_MS = 25_000;
export const WS_PONG_TIMEOUT_MS = 10_000;
export const WS_RECONNECT_INITIAL_MS = 1_000;
export const WS_RECONNECT_MAX_MS = 60_000;
export const WS_RECONNECT_MULTIPLIER = 2;
export const WS_RECONNECT_JITTER = 0.3;

// Sync Queue
export const SYNC_QUEUE_MAX_ITEMS = 200;
export const SYNC_QUEUE_MAX_RETRIES = 5;

// Security
export const MAX_LOGIN_ATTEMPTS = 10;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
export const BIOMETRIC_PROMPT_INTERVAL_MS = 5 * 60 * 1000;

// File Limits
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_METADATA_BYTES = 64 * 1024;
export const CHUNK_SIZE_BYTES = 64 * 1024 * 1024;

// API
export const API_TIMEOUT_MS = 30_000;
export const API_MAX_RETRIES = 3;
export const API_RETRY_DELAY_MS = 1_000;

// Crypto
export const KEY_SIZE_BYTES = 32;
export const MEK_SIZE_BYTES = 64;
export const NONCE_SIZE_BYTES = 24;
export const SALT_SIZE_BYTES = 32;
export const ARGON2_TIME_COST = 3;
export const ARGON2_MEMORY_KB = 65536;
export const ARGON2_PARALLELISM = 4;

// UI
export const TOAST_DURATION_MS = 3_000;
export const DEBOUNCE_MS = 300;
export const ANIMATION_DURATION_MS = 200;
export const SEARCH_MIN_CHARS = 2;
export const PASSWORD_MIN_LENGTH = 12;
export const ITEMS_PER_PAGE = 50;

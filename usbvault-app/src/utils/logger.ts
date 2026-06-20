/**
 * Lightweight logger that silences output in production builds.
 * Replace all direct console.* calls with logger.* to keep
 * security-sensitive service internals out of release bundles.
 *
 * Uses lazy delegation so jest.spyOn(console, ...) still works in tests.
 */

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

function noop(..._args: unknown[]) {}

/* eslint-disable no-console -- logger is the approved console wrapper */
export const logger = {
  debug: IS_DEV ? (...args: unknown[]) => console.debug(...args) : noop,
  log: IS_DEV ? (...args: unknown[]) => console.log(...args) : noop,
  info: IS_DEV ? (...args: unknown[]) => console.info(...args) : noop,
  warn: IS_DEV ? (...args: unknown[]) => console.warn(...args) : noop,
  error: IS_DEV ? (...args: unknown[]) => console.error(...args) : noop,
};
/* eslint-enable no-console */

/**
 * Fire-and-forget a promise. Logs errors but never throws.
 * Use for background operations where the caller doesn't need the result
 * (audit logging, analytics, cache warming, etc.).
 */
export function fireAndForget(
  promise: Promise<unknown>,
  label?: string | Record<string, unknown>
): void {
  promise.catch((err: unknown) => {
    const tag = typeof label === 'string' ? label : label ? JSON.stringify(label) : '';
    logger.error(`[fireAndForget]${tag ? ` ${tag}:` : ''}`, err);
  });
}

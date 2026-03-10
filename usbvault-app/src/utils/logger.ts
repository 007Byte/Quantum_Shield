/**
 * Lightweight logger that silences output in production builds.
 * Replace all direct console.* calls with logger.* to keep
 * security-sensitive service internals out of release bundles.
 *
 * Uses lazy delegation so jest.spyOn(console, ...) still works in tests.
 */

const IS_DEV = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

function noop(..._args: unknown[]) {}

export const logger = {
  debug: IS_DEV ? (...args: unknown[]) => console.debug(...args) : noop,
  log:   IS_DEV ? (...args: unknown[]) => console.log(...args)   : noop,
  info:  IS_DEV ? (...args: unknown[]) => console.info(...args)  : noop,
  warn:  IS_DEV ? (...args: unknown[]) => console.warn(...args)  : noop,
  error: IS_DEV ? (...args: unknown[]) => console.error(...args) : noop,
};

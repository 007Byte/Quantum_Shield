/**
 * Platform setup for QAV
 *
 * MUST be imported before any code that uses Node.js globals (Buffer, process, etc.).
 * This file ensures cross-platform compatibility between React Native (native) and web.
 *
 * FIX: "Key derivation failed: Buffer is not defined" on web platform.
 * The Rust FFI bridge (crypto/bridge.ts) uses Buffer extensively for hex/base64
 * encoding. On native platforms, React Native provides Buffer globally.
 * On web, we must provide it explicitly from the 'buffer' npm package.
 *
 * IMPORTANT: Uses static `import` (not dynamic `require`) so Metro bundler
 * properly includes the buffer package in the bundle.
 */

import { Buffer as BufferImpl } from 'buffer';

// Make Buffer available globally on platforms that don't provide it (web)
if (typeof globalThis.Buffer === 'undefined') {
  // @ts-expect-error Assigning Buffer constructor to globalThis
  globalThis.Buffer = BufferImpl;
}

// Process shim (some dependencies expect process.env)
if (typeof globalThis.process === 'undefined') {
  // @ts-expect-error Minimal process shim for web compatibility
  globalThis.process = { env: {}, version: '', platform: 'browser' };
}

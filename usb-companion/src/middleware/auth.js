/**
 * Authentication & anti-DNS-rebinding middleware for the USB Companion.
 *
 * CRIT-1 remediation. The companion exposes privileged, destructive USB
 * operations over a loopback HTTP port. CORS and loopback binding alone are
 * NOT sufficient access controls:
 *   - CORS is browser-enforced, so any local process (curl, malware, another
 *     app) can call the API directly.
 *   - The bound interface does not stop DNS-rebinding: a malicious website can
 *     rebind its hostname to 127.0.0.1 and have the victim's browser issue
 *     state-changing requests that execute server-side.
 *
 * Two server-enforced gates close this:
 *   1. requireAuth      — bearer token required on every protected route.
 *   2. validateHost     — Host header must be loopback (defeats DNS rebinding
 *                         even when CORS does not apply, e.g. same-origin or
 *                         no-CORS requests).
 *
 * The token is established at startup (see getCompanionToken) and handed to
 * the legitimate client out-of-band via a user-only (0600) token file.
 */

import crypto from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';

/**
 * Resolve the directory that holds the companion token file.
 * Honors XDG_CONFIG_HOME, otherwise ~/.config/usbvault.
 */
function tokenDir() {
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'usbvault');
}

function tokenFilePath() {
  return join(tokenDir(), 'companion-token');
}

/**
 * Cached token for this process. Resolved once at startup.
 */
let cachedToken = null;
let cachedTokenBuf = null;

/**
 * Establish the bearer token for this companion instance.
 *
 * Source order:
 *   1. process.env.USBVAULT_COMPANION_TOKEN — caller-supplied (e.g. the
 *      Electron main process spawns the companion with this set and already
 *      knows the value).
 *   2. Otherwise, generate a fresh random token and persist it to a
 *      user-only (0600) file so the legitimate client can read it.
 *
 * SECURITY: the token value is NEVER logged — only its source/location.
 *
 * @returns {string} the active token
 */
export function getCompanionToken() {
  if (cachedToken) return cachedToken;

  const envToken = process.env.USBVAULT_COMPANION_TOKEN;
  if (envToken && envToken.length > 0) {
    cachedToken = envToken;
    cachedTokenBuf = Buffer.from(cachedToken, 'utf8');
    logger.info('Companion auth token loaded from USBVAULT_COMPANION_TOKEN env var.');
    return cachedToken;
  }

  // No env token: generate a strong random token and persist it 0600 so the
  // legitimate client running as the same user can read it out-of-band.
  const token = crypto.randomBytes(32).toString('base64url');
  const dir = tokenDir();
  const file = tokenFilePath();
  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
    // mode 0600 — owner read/write only. wx is not used because we intentionally
    // overwrite any stale token from a previous run.
    writeFileSync(file, token, { encoding: 'utf8', mode: 0o600 });
    logger.info('Companion auth token generated and written (mode 0600).', {
      tokenFile: file,
    });
  } catch (err) {
    // If we cannot persist, fail closed: a token nobody can read makes the
    // service unusable rather than open. Surface the error loudly.
    logger.error('Failed to write companion auth token file — companion will reject all requests.', {
      tokenFile: file,
      error: err.message,
    });
    throw err;
  }

  cachedToken = token;
  cachedTokenBuf = Buffer.from(cachedToken, 'utf8');
  return cachedToken;
}

/**
 * Read the persisted token without (re)generating one. Useful for tests /
 * clients running in the same process. Returns null if no file exists.
 */
export function readPersistedToken() {
  const file = tokenFilePath();
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').trim();
}

/**
 * Constant-time comparison of a presented token against the active token.
 * Length is compared via the same timingSafeEqual call by padding to equal
 * length buffers; we first guard on length to avoid throwing, but do so
 * without short-circuiting on content.
 */
function tokenMatches(presented) {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const presentedBuf = Buffer.from(presented, 'utf8');
  const expectedBuf = cachedTokenBuf;
  if (!expectedBuf) return false;
  // crypto.timingSafeEqual requires equal-length buffers. Compare lengths
  // first (length is not secret for a fixed-size token), then content in
  // constant time.
  if (presentedBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(presentedBuf, expectedBuf);
}

/**
 * Express middleware: require a valid bearer token.
 * Responds 401 if the Authorization header is missing or invalid.
 *
 * Allows CORS preflight (OPTIONS) through so the browser can complete the
 * preflight handshake before sending the credentialed request.
 */
export function requireAuth(req, res, next) {
  if (req.method === 'OPTIONS') return next();

  const header = req.headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const presented = match ? match[1].trim() : null;

  if (!tokenMatches(presented)) {
    logger.warn('Rejected request: missing or invalid companion auth token', {
      path: req.path,
      method: req.method,
      requestId: req.requestId,
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'A valid companion bearer token is required.',
    });
  }

  next();
}

/**
 * Express middleware: validate the Host header against a loopback allowlist.
 *
 * This defeats DNS rebinding: even if an attacker site rebinds its hostname to
 * 127.0.0.1, the browser still sends the attacker's hostname in Host, which is
 * rejected here with 403 before any handler runs.
 *
 * Accepts: localhost, 127.0.0.1, [::1] — optionally with the bound port.
 *
 * @param {number} port the port the server is bound to
 */
export function validateHost(port) {
  // Host header is "<host>" or "<host>:<port>". IPv6 literal is "[::1]".
  const allowedHosts = new Set([
    'localhost',
    '127.0.0.1',
    '[::1]',
    '::1',
  ]);

  return function hostValidator(req, res, next) {
    const hostHeader = req.headers['host'];
    if (!hostHeader || typeof hostHeader !== 'string') {
      return res.status(403).json({ error: 'Forbidden', message: 'Missing Host header.' });
    }

    // Split host:port. For IPv6 the host is wrapped in [], so only split on the
    // final colon when it is not inside brackets.
    let host = hostHeader;
    let portPart = null;
    if (hostHeader.startsWith('[')) {
      // [::1] or [::1]:3001
      const close = hostHeader.indexOf(']');
      if (close === -1) {
        return res.status(403).json({ error: 'Forbidden', message: 'Malformed Host header.' });
      }
      host = hostHeader.slice(0, close + 1);
      const rest = hostHeader.slice(close + 1);
      if (rest.startsWith(':')) portPart = rest.slice(1);
    } else {
      const idx = hostHeader.lastIndexOf(':');
      if (idx !== -1) {
        host = hostHeader.slice(0, idx);
        portPart = hostHeader.slice(idx + 1);
      }
    }

    const hostOk = allowedHosts.has(host);
    const portOk = portPart === null || portPart === String(port);

    if (!hostOk || !portOk) {
      logger.warn('Rejected request: non-loopback Host header (possible DNS rebinding)', {
        host: hostHeader,
        path: req.path,
        method: req.method,
        requestId: req.requestId,
      });
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Requests must target the loopback interface.',
      });
    }

    next();
  };
}

/**
 * Health check endpoint for monitoring, readiness probes, and version negotiation.
 *
 * The `apiVersion` field enables frontend compatibility checks:
 *   - Frontend checks apiVersion on connect
 *   - If incompatible, shows a clear upgrade message instead of opaque 404s
 *
 * Bump API_VERSION when:
 *   - Adding new endpoints the frontend depends on
 *   - Changing request/response schemas in breaking ways
 *   - Removing or renaming existing endpoints
 *
 * Do NOT bump for:
 *   - Bug fixes, performance improvements
 *   - Adding optional fields to existing responses
 *   - New endpoints the frontend doesn't use yet
 */

import { Router } from 'express';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json (single source of truth)
let packageVersion = '1.0.0';
try {
  const require = createRequire(import.meta.url);
  const pkg = require(join(__dirname, '..', '..', 'package.json'));
  packageVersion = pkg.version;
} catch {
  // Fallback to hardcoded version if package.json can't be read
}

/**
 * API compatibility version.
 * Increment this when making breaking changes to the companion API.
 * The frontend will check this and warn users if their companion is outdated.
 */
const API_VERSION = 1;

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'usb-companion',
    version: packageVersion,
    apiVersion: API_VERSION,
    platform: process.platform,
    arch: process.arch,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /companion/health
 * Called by frontend's isCompanionAvailable() to verify the companion is running.
 */
healthRouter.get('/companion/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

/**
 * GET /companion/version
 * Called by frontend's companionVersion() and isApiVersionMismatch().
 */
healthRouter.get('/companion/version', (req, res) => {
  res.json({
    version: packageVersion,
    name: '@usbvault/usb-companion',
    apiVersion: API_VERSION,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
  });
});

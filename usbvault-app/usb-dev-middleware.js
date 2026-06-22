/**
 * USB Dev Middleware for Metro/Expo Dev Server
 *
 * Proxies all /usb/* requests to the USB Companion Service running on
 * localhost:3001. This eliminates CORS issues during development by
 * serving USB API responses from the same origin as the app (localhost:8081).
 *
 * In production (Electron/Tauri), the frontend talks directly to the
 * companion service or an embedded equivalent.
 *
 * Proxied endpoints (all handled by usb-companion service):
 *   GET  /usb/drives                        — List connected USB drives
 *   GET  /usb/vaults                        — Discover provisioned vaults
 *   GET  /usb/vault/:vaultId/files          — List vault files
 *   POST /usb/vault/:vaultId/files          — Upload file to vault
 *   DELETE /usb/vault/:vaultId/files/:fileId — Delete vault file
 *   POST /usb/provision                     — Provision an encrypted vault
 *   POST /usb/reset                         — Reset/wipe a drive
 *   GET  /health                            — Health check
 */

const http = require('http');

const COMPANION_HOST = '127.0.0.1';
const COMPANION_PORT = 3001;

/**
 * Proxy a request to the USB Companion Service.
 * Streams the request body and response body to avoid buffering large files.
 */
function proxyToCompanion(req, res) {
  const proxyOpts = {
    hostname: COMPANION_HOST,
    port: COMPANION_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${COMPANION_HOST}:${COMPANION_PORT}`,
    },
    // Provisioning can take minutes (full format zeros entire disk)
    timeout: req.url.includes('/provision') ? 600000 : 120000,
  };

  const proxyReq = http.request(proxyOpts, proxyRes => {
    // Remove security headers from companion that could interfere
    // (CSP, CORP, etc. are companion-level and not relevant for same-origin dev)
    const headers = { ...proxyRes.headers };
    delete headers['content-security-policy'];
    delete headers['cross-origin-resource-policy'];
    delete headers['cross-origin-opener-policy'];
    delete headers['strict-transport-security'];
    delete headers['x-frame-options'];
    // Keep CORS permissive for dev
    headers['access-control-allow-origin'] = '*';
    headers['access-control-allow-methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['access-control-allow-headers'] =
      'Content-Type, Authorization, X-Request-ID, X-File-Name';

    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', err => {
    console.error('[USB Proxy] Companion service unreachable:', err.message);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'USB Companion Service unavailable',
        message: `Cannot reach companion at ${COMPANION_HOST}:${COMPANION_PORT}. Is it running? Start with: cd usb-companion && node src/server.js`,
      })
    );
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.writeHead(504, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'USB Companion Service timeout',
        message: 'The companion service did not respond in time.',
      })
    );
  });

  // Stream request body to companion (important for file uploads)
  req.pipe(proxyReq, { end: true });
}

// ── Middleware Factory ─────────────────────────────────────────────────

function createUsbMiddleware(metroMiddleware) {
  console.log(
    `[USB Proxy] Proxying /usb/* and /health to companion at ${COMPANION_HOST}:${COMPANION_PORT}`
  );

  return function usbMiddleware(req, res, next) {
    // Handle CORS preflight for USB endpoints
    if (req.url.startsWith('/usb/') || req.url === '/health') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-File-Name',
          'Access-Control-Max-Age': '86400',
        });
        res.end();
        return;
      }
    }

    // Proxy all /usb/* and /health requests to the companion service
    if (req.url.startsWith('/usb/') || req.url === '/health') {
      proxyToCompanion(req, res);
      return;
    }

    // Not a USB route — pass to Metro
    metroMiddleware(req, res, next);
  };
}

module.exports = { createUsbMiddleware };

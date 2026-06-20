/**
 * Configuration — all tunables in one place.
 * Environment variables override defaults for production flexibility.
 */

export const config = {
  // Server binding — ALWAYS localhost for security (never expose to network).
  // The companion runs on the same machine as the browser.
  host: process.env.USB_COMPANION_HOST || '127.0.0.1',
  port: parseInt(process.env.USB_COMPANION_PORT || '3001', 10),

  // CORS — only allow the Expo dev server and production origins
  allowedOrigins: (process.env.USB_COMPANION_ORIGINS || 'http://localhost:8081,http://localhost:8082,http://localhost:8083,http://localhost:19006,http://localhost:3000,https://app.usbvault.io').split(','),

  // Logging
  logLevel: process.env.USB_COMPANION_LOG_LEVEL || 'info',

  // USB detection
  // On Linux: lsblk, on macOS: diskutil, on Windows: wmic/PowerShell
  // Auto-detected from process.platform
  platform: process.platform,

  // Command timeouts (ms) — prevent hung subprocesses
  commandTimeout: parseInt(process.env.USB_COMPANION_CMD_TIMEOUT || '10000', 10),

  // Provisioning timeout — formatting can take minutes on large drives
  provisionTimeout: parseInt(process.env.USB_COMPANION_PROVISION_TIMEOUT || '300000', 10),

  // Wipe timeout — secure wipe with multiple passes can take a long time
  wipeTimeout: parseInt(process.env.USB_COMPANION_WIPE_TIMEOUT || '600000', 10),
};

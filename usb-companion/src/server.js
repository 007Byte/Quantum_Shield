/**
 * USBVault Local USB Companion Service
 *
 * A security-first local service that bridges the OS USB subsystem
 * to the USBVault frontend application. Runs on the user's machine
 * and exposes REST endpoints for USB drive detection, vault provisioning,
 * and drive reset/wipe operations.
 *
 * Architecture:
 *   Frontend (Expo/RNW) ──HTTP──▶ USB Companion (this) ──OS──▶ lsblk/diskutil/WMI
 *
 * Security principles:
 *   - Localhost-only binding (never exposed to network)
 *   - Rate limiting on all endpoints
 *   - Input validation and sanitization
 *   - Audit logging of all operations
 *   - No secrets in logs
 *   - Principle of least privilege for OS commands
 *   - CORS restricted to known origins
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usbRouter } from './routes/usb.js';
import { healthRouter } from './routes/health.js';
import { requestLogger, errorHandler, notFoundHandler } from './middleware/handlers.js';
import { requireAuth, validateHost, getCompanionToken } from './middleware/auth.js';
import { logger } from './utils/logger.js';
import { config } from './utils/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();

// ── Auth Token Bootstrap ──────────────────────────────────────────────
// Establish the bearer token before any route is registered. Reads
// USBVAULT_COMPANION_TOKEN if set, otherwise generates one and persists it to
// a user-only (0600) file. Never logs the token value, only its location.
// Fails closed (throws) if the token cannot be established/persisted.
getCompanionToken();

// ── Standalone Mode Detection ─────────────────────────────────────────
// Detect early so Helmet CSP can adapt
const staticDir = join(__dirname, '..', 'static');
const isStandaloneMode = existsSync(staticDir) || process.env.USB_STANDALONE_MODE === 'true';

// ── Security Middleware ────────────────────────────────────────────────

// Host-header allowlist FIRST: reject any request whose Host is not loopback.
// This defeats DNS rebinding even for requests CORS does not cover, and runs
// before any handler so rebound state-changing requests never execute.
app.use(validateHost(config.port));

// Helmet: sets secure HTTP headers (CSP, HSTS, X-Content-Type-Options, etc.)
// In standalone mode, relax CSP to allow Expo's inline scripts and blob: URLs
const standaloneCSP = isStandaloneMode;
app.use(helmet({
  contentSecurityPolicy: standaloneCSP ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'http://localhost:*', 'ws://localhost:*'],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: restrict to known frontend origins only
app.use(cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-File-Name'],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24h
}));

// Rate limiting: prevent abuse even on localhost
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,            // 300 requests per minute (was 60 — too low for SPA page loads)
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  keyGenerator: () => 'localhost', // Single key since localhost-only
});
app.use(limiter);

// Stricter rate limit for destructive USB operations
const destructiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many USB write operations. Please wait before retrying.' },
  keyGenerator: () => 'localhost-destructive',
});

// Body parsing with size limits
app.use(express.json({ limit: '50mb' })); // Must handle encrypted file payloads (was 2kb — broke file uploads)

// Request logging
app.use(requestLogger);

// ── Routes ──────────────────────────────────────────────────────────────

app.use('/health', healthRouter);
app.use('/', healthRouter);          // mount at root so /companion/health and /companion/version resolve

// Bearer-token auth gate on ALL privileged /usb/* routes. /health and
// /companion/{health,version} are intentionally left unauthenticated so the
// frontend can probe availability/version negotiation before it has the token.
app.use('/usb', requireAuth, usbRouter(destructiveLimiter));

// ── USB-Only Standalone Mode (Self-Hosted Web App) ──────────────────────
// When a static/ directory exists (from `npm run export:usb`), serve the
// web app directly from the companion service. This enables the PORTABLE
// principle: double-click launcher → browser opens → full app, no install.

if (isStandaloneMode && existsSync(staticDir)) {
  logger.info('USB Standalone Mode: serving static web app from ' + staticDir);

  // Serve static assets (JS, CSS, images)
  app.use(express.static(staticDir, {
    maxAge: '1h',
    etag: true,
  }));

  // SPA catch-all: any non-API route serves index.html (client-side routing)
  app.get('*', (req, res, next) => {
    // Don't catch API routes
    if (req.path.startsWith('/usb/') || req.path.startsWith('/health') || req.path.startsWith('/companion/')) {
      return next();
    }
    const indexPath = join(staticDir, 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
} else if (isStandaloneMode) {
  logger.warn('USB Standalone Mode enabled but static/ directory not found. Run: npm run export:usb');
}

// ── Error Handling ──────────────────────────────────────────────────────

app.use(notFoundHandler);
app.use(errorHandler);

// ── Start ───────────────────────────────────────────────────────────────

const server = app.listen(config.port, config.host, () => {
  logger.info(`USB Companion Service started`, {
    host: config.host,
    port: config.port,
    platform: process.platform,
    nodeVersion: process.version,
    pid: process.pid,
  });
  logger.info(`Allowed origins: ${config.allowedOrigins.join(', ')}`);
});

// Graceful shutdown
const shutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
  // Force exit after 5s if graceful shutdown fails
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

export default app;

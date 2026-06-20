/**
 * Express middleware — request logging, error handling, 404.
 */

import { randomUUID } from 'node:crypto';
import { logger } from '../utils/logger.js';

/**
 * Request logger — logs every request with timing and request ID.
 */
export function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId,
      userAgent: req.headers['user-agent']?.substring(0, 100),
    });
  });

  next();
}

/**
 * 404 handler — catches unmatched routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.path} is not a valid endpoint`,
    endpoints: [
      'GET    /health',
      'GET    /usb/drives',
      'POST   /usb/provision',
      'POST   /usb/reset',
      'GET    /usb/vault/:vaultId/files',
      'POST   /usb/vault/:vaultId/files',
      'DELETE /usb/vault/:vaultId/files/:fileId',
    ],
  });
}

/**
 * Global error handler — catches unhandled errors.
 * SECURITY: Never expose stack traces to clients in production.
 */
export function errorHandler(err, req, res, _next) {
  const isDev = process.env.NODE_ENV !== 'production';

  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    requestId: req.requestId,
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: isDev ? err.message : 'An unexpected error occurred',
    ...(isDev && { stack: err.stack }),
    requestId: req.requestId,
  });
}

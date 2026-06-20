/**
 * Structured logger with audit trail support.
 * Uses winston for production-grade logging with JSON format
 * for easy ingestion by SIEM/log aggregation systems.
 */

import winston from 'winston';
import { config } from './config.js';

const { combine, timestamp, json, printf, colorize } = winston.format;

// Production: JSON structured logs (machine-readable)
const productionFormat = combine(
  timestamp({ format: 'ISO' }),
  json()
);

// Development: human-readable colored output
const developmentFormat = combine(
  timestamp({ format: 'HH:mm:ss.SSS' }),
  colorize(),
  printf(({ timestamp: ts, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${metaStr}`;
  })
);

const isDev = process.env.NODE_ENV !== 'production';

export const logger = winston.createLogger({
  level: config.logLevel,
  format: isDev ? developmentFormat : productionFormat,
  defaultMeta: { service: 'usb-companion' },
  transports: [
    new winston.transports.Console(),
  ],
});

/**
 * Audit logger — logs security-relevant events with structured metadata.
 * In production, these would be shipped to a SIEM system.
 *
 * SECURITY: Never log passwords, keys, or recovery phrases.
 */
export const audit = {
  log(action, details = {}) {
    logger.info(`[AUDIT] ${action}`, {
      audit: true,
      action,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...details,
    });
  },

  warn(action, details = {}) {
    logger.warn(`[AUDIT] ${action}`, {
      audit: true,
      action,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...details,
    });
  },

  error(action, details = {}) {
    logger.error(`[AUDIT] ${action}`, {
      audit: true,
      action,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...details,
    });
  },
};

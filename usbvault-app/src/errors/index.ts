// PH4-FIX: Structured error handling for TypeScript client

import { logger } from '@/utils/logger';

export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYMENT_REQUIRED = 'PAYMENT_REQUIRED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  OFFLINE = 'OFFLINE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INVALID_INPUT = 'INVALID_INPUT',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  KEY_ROTATION_FAILED = 'KEY_ROTATION_FAILED',
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, string>,
    public readonly statusCode?: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AppError';
    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static fromApiResponse(
    response: { code: string; message: string; details?: Record<string, string> },
    statusCode: number
  ): AppError {
    return new AppError(
      (response.code as ErrorCode) || ErrorCode.INTERNAL_ERROR,
      response.message || 'An unexpected error occurred',
      response.details,
      statusCode
    );
  }

  static networkError(cause?: Error): AppError {
    return new AppError(
      ErrorCode.NETWORK_ERROR,
      'Network request failed',
      undefined,
      undefined,
      cause
    );
  }

  static timeout(operation: string): AppError {
    return new AppError(ErrorCode.TIMEOUT, `Operation timed out: ${operation}`);
  }

  static encryptionFailed(detail: string, cause?: Error): AppError {
    return new AppError(
      ErrorCode.ENCRYPTION_FAILED,
      `Encryption failed: ${detail}`,
      undefined,
      undefined,
      cause
    );
  }

  static decryptionFailed(detail: string, cause?: Error): AppError {
    return new AppError(
      ErrorCode.DECRYPTION_FAILED,
      `Decryption failed: ${detail}`,
      undefined,
      undefined,
      cause
    );
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    return new AppError(ErrorCode.UNAUTHORIZED, message, undefined, 401);
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    return new AppError(ErrorCode.FORBIDDEN, message, undefined, 403);
  }

  static notFound(message: string = 'Not found'): AppError {
    return new AppError(ErrorCode.NOT_FOUND, message, undefined, 404);
  }

  static validation(message: string, details?: Record<string, string>): AppError {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, details, 400);
  }

  isRetryable(): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.RATE_LIMITED,
      ErrorCode.INTERNAL_ERROR,
      ErrorCode.SERVICE_UNAVAILABLE,
    ].includes(this.code);
  }

  isAuthError(): boolean {
    return [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN].includes(this.code);
  }

  isCryptographicError(): boolean {
    return [
      ErrorCode.ENCRYPTION_FAILED,
      ErrorCode.DECRYPTION_FAILED,
      ErrorCode.KEY_ROTATION_FAILED,
    ].includes(this.code);
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      statusCode: this.statusCode,
      name: this.name,
    };
  }
}

// PH4-FIX: Error handler utility — never silently swallow errors
export function handleError(error: unknown, context: string): AppError {
  if (error instanceof AppError) {
    logger.error(`[${context}] ${error.code}: ${error.message}`, error.details);
    return error;
  }
  if (error instanceof Error) {
    logger.error(`[${context}] Untyped error: ${error.message}`, error);
    return new AppError(ErrorCode.INTERNAL_ERROR, error.message, undefined, undefined, error);
  }
  logger.error(`[${context}] Unknown error:`, error);
  return new AppError(ErrorCode.INTERNAL_ERROR, String(error));
}

// PH4-FIX: Type guard for AppError
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

// PH4-FIX: Safe error extraction utility
export function getErrorMessage(
  error: unknown,
  defaultMessage = 'An unexpected error occurred'
): string {
  if (isAppError(error)) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return defaultMessage;
}

// PH4-FIX: Safe error code extraction
export function getErrorCode(error: unknown): ErrorCode {
  if (isAppError(error)) {
    return error.code;
  }
  return ErrorCode.INTERNAL_ERROR;
}

// PH4-FIX: Safe HTTP status code extraction
export function getErrorStatusCode(error: unknown): number {
  if (isAppError(error)) {
    return error.statusCode || 500;
  }
  return 500;
}

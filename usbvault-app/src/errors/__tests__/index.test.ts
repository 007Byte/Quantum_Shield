import {
  AppError,
  ErrorCode,
  handleError,
  isAppError,
  getErrorMessage,
  getErrorCode,
  getErrorStatusCode,
} from '@/errors';

// logger is a genuine boundary (writes to console); silence it so handleError
// tests don't pollute output, and assert it is actually invoked.
import { logger } from '@/utils/logger';

describe('errors/AppError', () => {
  describe('construction', () => {
    it('is an Error subclass with name AppError and a working instanceof', () => {
      const err = new AppError(ErrorCode.BAD_REQUEST, 'bad');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.name).toBe('AppError');
      expect(err.message).toBe('bad');
      expect(err.code).toBe(ErrorCode.BAD_REQUEST);
    });

    it('preserves the prototype chain across rethrow boundaries', () => {
      let caught: unknown;
      try {
        throw new AppError(ErrorCode.NOT_FOUND, 'gone');
      } catch (e) {
        caught = e;
      }
      expect(caught instanceof AppError).toBe(true);
    });

    it('carries details, statusCode and cause', () => {
      const cause = new Error('root');
      const err = new AppError(
        ErrorCode.VALIDATION_ERROR,
        'invalid',
        { field: 'email' },
        400,
        cause
      );
      expect(err.details).toEqual({ field: 'email' });
      expect(err.statusCode).toBe(400);
      expect(err.cause).toBe(cause);
    });
  });

  describe('static factories', () => {
    it('fromApiResponse maps code/message/details and falls back on missing code', () => {
      const err = AppError.fromApiResponse(
        { code: 'CONFLICT', message: 'dup', details: { id: '7' } },
        409
      );
      expect(err.code).toBe(ErrorCode.CONFLICT);
      expect(err.message).toBe('dup');
      expect(err.details).toEqual({ id: '7' });
      expect(err.statusCode).toBe(409);

      const fallback = AppError.fromApiResponse({ code: '', message: '' }, 500);
      expect(fallback.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(fallback.message).toBe('An unexpected error occurred');
    });

    it('networkError sets the code and preserves the cause', () => {
      const cause = new Error('ECONNREFUSED');
      const err = AppError.networkError(cause);
      expect(err.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(err.message).toBe('Network request failed');
      expect(err.cause).toBe(cause);
    });

    it('timeout embeds the operation name', () => {
      const err = AppError.timeout('vault sync');
      expect(err.code).toBe(ErrorCode.TIMEOUT);
      expect(err.message).toBe('Operation timed out: vault sync');
    });

    it('encryptionFailed and decryptionFailed embed the detail and cause', () => {
      const cause = new Error('aead');
      const enc = AppError.encryptionFailed('bad key', cause);
      expect(enc.code).toBe(ErrorCode.ENCRYPTION_FAILED);
      expect(enc.message).toBe('Encryption failed: bad key');
      expect(enc.cause).toBe(cause);

      const dec = AppError.decryptionFailed('tag mismatch');
      expect(dec.code).toBe(ErrorCode.DECRYPTION_FAILED);
      expect(dec.message).toBe('Decryption failed: tag mismatch');
    });

    it('unauthorized/forbidden/notFound use defaults and correct status codes', () => {
      expect(AppError.unauthorized().message).toBe('Unauthorized');
      expect(AppError.unauthorized().statusCode).toBe(401);
      expect(AppError.unauthorized('nope').message).toBe('nope');

      expect(AppError.forbidden().statusCode).toBe(403);
      expect(AppError.notFound().statusCode).toBe(404);
      expect(AppError.notFound('missing vault').message).toBe('missing vault');
    });

    it('validation carries a 400 status and details', () => {
      const err = AppError.validation('check inputs', { name: 'required' });
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.statusCode).toBe(400);
      expect(err.details).toEqual({ name: 'required' });
    });
  });

  describe('classification helpers', () => {
    it('isRetryable is true for transient codes only', () => {
      expect(AppError.networkError().isRetryable()).toBe(true);
      expect(AppError.timeout('x').isRetryable()).toBe(true);
      expect(new AppError(ErrorCode.RATE_LIMITED, 'slow').isRetryable()).toBe(true);
      expect(new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'down').isRetryable()).toBe(true);
      expect(new AppError(ErrorCode.INTERNAL_ERROR, 'oops').isRetryable()).toBe(true);

      expect(AppError.unauthorized().isRetryable()).toBe(false);
      expect(AppError.validation('bad').isRetryable()).toBe(false);
    });

    it('isAuthError is true for unauthorized and forbidden', () => {
      expect(AppError.unauthorized().isAuthError()).toBe(true);
      expect(AppError.forbidden().isAuthError()).toBe(true);
      expect(AppError.notFound().isAuthError()).toBe(false);
    });

    it('isCryptographicError is true for crypto codes', () => {
      expect(AppError.encryptionFailed('x').isCryptographicError()).toBe(true);
      expect(AppError.decryptionFailed('x').isCryptographicError()).toBe(true);
      expect(new AppError(ErrorCode.KEY_ROTATION_FAILED, 'rot').isCryptographicError()).toBe(true);
      expect(AppError.networkError().isCryptographicError()).toBe(false);
    });
  });

  describe('toJSON', () => {
    it('serializes the public fields', () => {
      const err = new AppError(ErrorCode.NOT_FOUND, 'gone', { id: '1' }, 404);
      expect(err.toJSON()).toEqual({
        code: ErrorCode.NOT_FOUND,
        message: 'gone',
        details: { id: '1' },
        statusCode: 404,
        name: 'AppError',
      });
    });
  });
});

describe('errors helpers', () => {
  describe('handleError', () => {
    let errorSpy: jest.SpyInstance;
    beforeEach(() => {
      errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    });
    afterEach(() => errorSpy.mockRestore());

    it('returns an AppError as-is and logs it with its code', () => {
      const original = AppError.validation('bad');
      const result = handleError(original, 'AuthService');
      expect(result).toBe(original);
      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy.mock.calls[0][0] as string).toContain('AuthService');
      expect(errorSpy.mock.calls[0][0] as string).toContain(ErrorCode.VALIDATION_ERROR);
    });

    it('wraps a plain Error into an INTERNAL_ERROR AppError preserving the cause', () => {
      const plain = new Error('disk full');
      const result = handleError(plain, 'Sync');
      expect(result).toBeInstanceOf(AppError);
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(result.message).toBe('disk full');
      expect(result.cause).toBe(plain);
    });

    it('wraps a non-Error value, stringifying it', () => {
      const result = handleError('weird string failure', 'Boot');
      expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(result.message).toBe('weird string failure');
    });
  });

  describe('isAppError', () => {
    it('discriminates AppError from other values', () => {
      expect(isAppError(AppError.notFound())).toBe(true);
      expect(isAppError(new Error('plain'))).toBe(false);
      expect(isAppError('string')).toBe(false);
      expect(isAppError(null)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('extracts the message from AppError, Error and string', () => {
      expect(getErrorMessage(AppError.timeout('op'))).toBe('Operation timed out: op');
      expect(getErrorMessage(new Error('plain'))).toBe('plain');
      expect(getErrorMessage('raw')).toBe('raw');
    });

    it('returns the default for unknown shapes', () => {
      expect(getErrorMessage({ weird: true })).toBe('An unexpected error occurred');
      expect(getErrorMessage(undefined, 'custom default')).toBe('custom default');
    });
  });

  describe('getErrorCode', () => {
    it('returns the AppError code or INTERNAL_ERROR fallback', () => {
      expect(getErrorCode(AppError.forbidden())).toBe(ErrorCode.FORBIDDEN);
      expect(getErrorCode(new Error('x'))).toBe(ErrorCode.INTERNAL_ERROR);
    });
  });

  describe('getErrorStatusCode', () => {
    it('returns the AppError status, defaulting to 500', () => {
      expect(getErrorStatusCode(AppError.unauthorized())).toBe(401);
      // AppError without a statusCode falls back to 500.
      expect(getErrorStatusCode(new AppError(ErrorCode.INTERNAL_ERROR, 'x'))).toBe(500);
      expect(getErrorStatusCode('not an error')).toBe(500);
    });
  });
});

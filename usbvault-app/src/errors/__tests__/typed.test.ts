import { RateLimitError, extractAxiosError } from '@/errors/typed';

describe('errors/typed', () => {
  describe('RateLimitError', () => {
    it('is an Error with name RateLimitError carrying backoff metadata', () => {
      const err = new RateLimitError('Too many attempts', 4500, 7);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.name).toBe('RateLimitError');
      expect(err.message).toBe('Too many attempts');
      expect(err.backoffRemaining).toBe(4500);
      expect(err.failCount).toBe(7);
    });

    it('is catchable as a RateLimitError after being thrown', () => {
      let caught: unknown;
      try {
        throw new RateLimitError('locked out', 1000, 3);
      } catch (e) {
        caught = e;
      }
      expect(caught instanceof RateLimitError).toBe(true);
      expect((caught as RateLimitError).failCount).toBe(3);
    });
  });

  describe('extractAxiosError', () => {
    it('pulls response, code and message from an axios-shaped error', () => {
      const axiosLike = {
        response: { status: 429, data: { code: 'RATE_LIMITED', message: 'slow down' } },
        code: 'ERR_BAD_RESPONSE',
        message: 'Request failed with status code 429',
      };
      const result = extractAxiosError(axiosLike);
      expect(result.response).toBe(axiosLike.response);
      expect(result.response?.status).toBe(429);
      expect(result.response?.data?.code).toBe('RATE_LIMITED');
      expect(result.code).toBe('ERR_BAD_RESPONSE');
      expect(result.message).toBe('Request failed with status code 429');
    });

    it('coerces non-string code/message to undefined', () => {
      const result = extractAxiosError({ code: 123, message: { nested: true } });
      expect(result.code).toBeUndefined();
      expect(result.message).toBeUndefined();
      expect(result.response).toBeUndefined();
    });

    it('returns an empty object for null, undefined and primitives', () => {
      expect(extractAxiosError(null)).toEqual({});
      expect(extractAxiosError(undefined)).toEqual({});
      expect(extractAxiosError('a plain string')).toEqual({});
      expect(extractAxiosError(42)).toEqual({});
    });

    it('handles an object with no axios fields gracefully', () => {
      const result = extractAxiosError({ unrelated: 'value' });
      expect(result.response).toBeUndefined();
      expect(result.code).toBeUndefined();
      expect(result.message).toBeUndefined();
    });
  });
});

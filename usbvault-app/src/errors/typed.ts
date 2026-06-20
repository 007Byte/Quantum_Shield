/**
 * Typed error classes for USBVault.
 *
 * Replaces `(err as any).property` patterns with proper typed errors
 * that carry structured metadata.
 */

/**
 * Thrown when a user exceeds the allowed number of authentication attempts.
 * Carries backoff timing so the UI can show a countdown.
 */
export class RateLimitError extends Error {
  readonly backoffRemaining: number;
  readonly failCount: number;

  constructor(message: string, backoffRemaining: number, failCount: number) {
    super(message);
    this.name = 'RateLimitError';
    this.backoffRemaining = backoffRemaining;
    this.failCount = failCount;
  }
}

/**
 * Type guard for extracting Axios-style error response data safely
 * without casting to `any`.
 */
export interface AxiosErrorShape {
  response?: {
    status?: number;
    data?: {
      code?: string;
      message?: string;
      [key: string]: unknown;
    };
  };
  code?: string;
  message?: string;
}

/**
 * Safely extract Axios error properties without `as any`.
 */
export function extractAxiosError(err: unknown): AxiosErrorShape {
  if (typeof err === 'object' && err !== null) {
    const e = err as Record<string, unknown>;
    const response = e.response as AxiosErrorShape['response'] | undefined;
    return {
      response,
      code: typeof e.code === 'string' ? e.code : undefined,
      message: typeof e.message === 'string' ? e.message : undefined,
    };
  }
  return {};
}

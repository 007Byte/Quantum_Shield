/**
 * Tests for the logger wrapper and fireAndForget helper.
 *
 * console is a genuine boundary; we spy on it rather than asserting output.
 * The IS_DEV branch is captured at module import time from the __DEV__ global
 * (true under jest.setup), so the dev-path delegation is what we verify here.
 */
import { logger, fireAndForget } from '@/utils/logger';

describe('utils/logger', () => {
  describe('logger delegation (dev build)', () => {
    const methods: [keyof typeof logger, 'debug' | 'log' | 'info' | 'warn' | 'error'][] = [
      ['debug', 'debug'],
      ['log', 'log'],
      ['info', 'info'],
      ['warn', 'warn'],
      ['error', 'error'],
    ];

    it.each(methods)('logger.%s delegates to console.%s with all args', (loggerFn, consoleFn) => {
      const spy = jest.spyOn(console, consoleFn).mockImplementation(() => {});
      logger[loggerFn]('message', { extra: 1 });
      expect(spy).toHaveBeenCalledWith('message', { extra: 1 });
      spy.mockRestore();
    });
  });

  describe('fireAndForget', () => {
    it('resolves silently without logging on success', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      fireAndForget(Promise.resolve('ok'), 'sync');
      await Promise.resolve();
      await Promise.resolve();
      expect(errSpy).not.toHaveBeenCalled();
      errSpy.mockRestore();
    });

    it('logs a rejected promise with a string label prefix', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const boom = new Error('background failure');
      fireAndForget(Promise.reject(boom), 'audit-write');

      // Allow the rejection microtask + the .catch handler to run.
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(errSpy).toHaveBeenCalledWith('[fireAndForget] audit-write:', boom);
      errSpy.mockRestore();
    });

    it('serializes an object label into the log tag', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const boom = new Error('queue error');
      fireAndForget(Promise.reject(boom), { op: 'flush', queue: 'sync' });

      await new Promise(resolve => setTimeout(resolve, 0));

      const firstArg = errSpy.mock.calls[0][0] as string;
      expect(firstArg).toContain('[fireAndForget]');
      expect(firstArg).toContain('"op":"flush"');
      expect(firstArg).toContain('"queue":"sync"');
      expect(errSpy.mock.calls[0][1]).toBe(boom);
      errSpy.mockRestore();
    });

    it('logs without a tag suffix when no label is provided', async () => {
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const boom = new Error('untagged');
      fireAndForget(Promise.reject(boom));

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(errSpy).toHaveBeenCalledWith('[fireAndForget]', boom);
      errSpy.mockRestore();
    });
  });
});

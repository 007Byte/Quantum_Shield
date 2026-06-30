/**
 * Tests for the USB debug tracer.
 *
 * console is a genuine boundary and is silenced via spies. The exported
 * `usbDebug` is a process-wide singleton, so each test clears its buffer first.
 * We focus on the real behaviour: argument/result sanitization (redacting
 * secrets and binary data), entry/exit/error pairing, the trace dump, and
 * aggregate stats.
 */
import { usbDebug } from '@/utils/usbDebugTracer';

describe('utils/usbDebugTracer', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    usbDebug.clearTraces();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('sanitizeArgs (via traceEntry)', () => {
    it('redacts keys that look like secrets', () => {
      usbDebug.traceEntry('unlock', {
        password: 'hunter2',
        masterKey: 'deadbeef',
        hmacKey: '00ff00ff',
        encryptionAlgo: 'aes',
        secretToken: 'sshh',
        driveId: 'disk2',
      });
      const [entry] = usbDebug.getTraces();
      expect(entry.args.password).toBe('[REDACTED]');
      expect(entry.args.masterKey).toBe('[REDACTED]');
      expect(entry.args.hmacKey).toBe('[REDACTED]');
      expect(entry.args.encryptionAlgo).toBe('[REDACTED]');
      expect(entry.args.secretToken).toBe('[REDACTED]');
      // Non-sensitive primitives pass through untouched.
      expect(entry.args.driveId).toBe('disk2');
    });

    it('summarizes Uint8Array and ArrayBuffer args by size', () => {
      usbDebug.traceEntry('write', {
        payload: new Uint8Array(32),
        buffer: new ArrayBuffer(16),
      });
      const [entry] = usbDebug.getTraces();
      expect(entry.args.payload).toBe('[Binary: 32 bytes]');
      expect(entry.args.buffer).toBe('[Binary: 16 bytes]');
    });

    it('recursively sanitizes nested objects and arrays', () => {
      usbDebug.traceEntry('config', {
        nested: { password: 'p', label: 'ok' },
        list: [new Uint8Array(8), { secret: 's', value: 1 }, 'plain'],
      });
      const [entry] = usbDebug.getTraces();
      expect((entry.args.nested as Record<string, unknown>).password).toBe('[REDACTED]');
      expect((entry.args.nested as Record<string, unknown>).label).toBe('ok');
      const list = entry.args.list as unknown[];
      expect(list[0]).toBe('[Binary: 8 bytes]');
      expect((list[1] as Record<string, unknown>).secret).toBe('[REDACTED]');
      expect((list[1] as Record<string, unknown>).value).toBe(1);
      expect(list[2]).toBe('plain');
    });

    it('treats non-object args as empty', () => {
      usbDebug.traceEntry('noargs');
      const [entry] = usbDebug.getTraces();
      expect(entry.args).toEqual({});
      expect(entry.method).toBe('noargs');
      expect(entry.success).toBe(false);
    });
  });

  describe('traceExit', () => {
    it('records a sanitized result, marks success and pairs with the entry', () => {
      usbDebug.traceEntry('listDrives', { refresh: true });
      usbDebug.traceExit('listDrives', { drives: ['d1', 'd2'] });
      const [entry] = usbDebug.getTraces();
      expect(entry.success).toBe(true);
      expect(entry.result).toEqual({ drives: ['d1', 'd2'] });
      expect(entry.duration).toBeGreaterThanOrEqual(0);
    });

    it('redacts binary results to a size summary', () => {
      usbDebug.traceEntry('read');
      usbDebug.traceExit('read', new Uint8Array(64));
      const [entry] = usbDebug.getTraces();
      expect(entry.result).toBe('[Binary result: 64 bytes]');
    });

    it('redacts password/secret fields within object results', () => {
      usbDebug.traceEntry('open');
      usbDebug.traceExit('open', { password: 'p', secret: 's', ok: true });
      const [entry] = usbDebug.getTraces();
      const result = entry.result as Record<string, unknown>;
      expect(result.password).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.ok).toBe(true);
    });

    it('does nothing when there is no matching open entry', () => {
      usbDebug.traceExit('neverStarted', { x: 1 });
      expect(usbDebug.getTraces()).toHaveLength(0);
    });
  });

  describe('traceError', () => {
    it('records the error message and marks the entry failed', () => {
      usbDebug.traceEntry('eject');
      usbDebug.traceError('eject', new Error('device busy'));
      const [entry] = usbDebug.getTraces();
      expect(entry.error).toBe('device busy');
      expect(entry.success).toBe(false);
    });

    it('stringifies non-Error values', () => {
      usbDebug.traceEntry('format');
      usbDebug.traceError('format', 'raw failure');
      const [entry] = usbDebug.getTraces();
      expect(entry.error).toBe('raw failure');
    });
  });

  describe('getStats', () => {
    it('aggregates totals, success/failure counts and average duration', () => {
      usbDebug.traceEntry('a');
      usbDebug.traceExit('a', 'ok');
      usbDebug.traceEntry('b');
      usbDebug.traceError('b', new Error('fail'));
      usbDebug.traceEntry('c'); // left open → counts as not successful

      const stats = usbDebug.getStats();
      expect(stats.totalOperations).toBe(3);
      expect(stats.successfulOperations).toBe(1);
      expect(stats.failedOperations).toBe(2);
      expect(typeof stats.averageDuration).toBe('number');
      expect(Number.isInteger(stats.averageDuration)).toBe(true);
    });

    it('returns zero average duration with no operations', () => {
      const stats = usbDebug.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('dumpTrace', () => {
    it('renders a header plus success and failure markers with args/result/error', () => {
      usbDebug.traceEntry('mount', { driveId: 'd1' });
      usbDebug.traceExit('mount', { mounted: true });
      usbDebug.traceEntry('unmount');
      usbDebug.traceError('unmount', new Error('in use'));

      const dump = usbDebug.dumpTrace();
      expect(dump).toContain('=== USB Debug Trace Dump ===');
      expect(dump).toContain('mount');
      expect(dump).toContain('Args:');
      expect(dump).toContain('Result:');
      expect(dump).toContain('Error: in use');
      expect(dump).toContain('✓');
      expect(dump).toContain('✗');
    });
  });

  describe('getTraces and clearTraces', () => {
    it('returns a defensive copy of the trace buffer', () => {
      usbDebug.traceEntry('x');
      const traces = usbDebug.getTraces();
      traces.push({
        timestamp: '',
        method: 'injected',
        args: {},
        duration: 0,
        success: false,
      });
      expect(usbDebug.getTraces()).toHaveLength(1);
    });

    it('empties the buffer and the operation timers', () => {
      usbDebug.traceEntry('y');
      usbDebug.clearTraces();
      expect(usbDebug.getTraces()).toHaveLength(0);
      expect(usbDebug.getStats().totalOperations).toBe(0);
    });
  });
});

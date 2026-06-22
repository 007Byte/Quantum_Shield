/**
 * USB Debug Tracer — Comprehensive Operation Logging
 *
 * Logs every USB operation with timestamps, arguments, results, and timing.
 * All traces stored in global array accessible via window.__USB_DEBUG_TRACE.
 * Includes sanitization to prevent logging binary data or sensitive secrets.
 */

export interface TraceEntry {
  timestamp: string;
  method: string;
  args: Record<string, any>;
  result?: any;
  error?: string;
  duration: number; // milliseconds
  success: boolean;
}

class USBDebugTracer {
  private traces: TraceEntry[] = [];
  private operationStarts: Map<string, number> = new Map();

  constructor() {
    // Expose traces globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).__USB_DEBUG_TRACE = this.traces;
    }
  }

  /**
   * Sanitize arguments for logging — remove binary data, passwords, sensitive info
   */
  private sanitizeArgs(args: any): Record<string, any> {
    if (!args || typeof args !== 'object') {
      return {};
    }

    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(args)) {
      // Skip sensitive keys entirely
      if (
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('hmac') ||
        key.toLowerCase().includes('encryption')
      ) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Binary data: log type and size only
      if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        const size = value instanceof Uint8Array ? value.length : (value as ArrayBuffer).byteLength;
        sanitized[key] = `[Binary: ${size} bytes]`;
        continue;
      }

      // Objects: recursively sanitize
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeArgs(value);
        continue;
      }

      // Arrays: map each element
      if (Array.isArray(value)) {
        sanitized[key] = value.map(v => {
          if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
            const size = v instanceof Uint8Array ? v.length : (v as ArrayBuffer).byteLength;
            return `[Binary: ${size} bytes]`;
          }
          if (typeof v === 'object' && v !== null) {
            return this.sanitizeArgs(v);
          }
          return v;
        });
        continue;
      }

      // Primitives: pass through
      sanitized[key] = value;
    }

    return sanitized;
  }

  /**
   * Sanitize result value — redact binary data
   */
  private sanitizeResult(result: any): any {
    if (result instanceof Uint8Array || result instanceof ArrayBuffer) {
      const size = result instanceof Uint8Array ? result.length : (result as ArrayBuffer).byteLength;
      return `[Binary result: ${size} bytes]`;
    }

    if (typeof result === 'object' && result !== null && !Array.isArray(result)) {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(result)) {
        if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret')) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = this.sanitizeResult(value);
        }
      }
      return sanitized;
    }

    if (Array.isArray(result)) {
      return result.map(v => this.sanitizeResult(v));
    }

    return result;
  }

  /**
   * Log method entry — start timer and record arguments
   */
  traceEntry(method: string, args: any = {}): void {
    const operationId = `${method}:${Date.now()}:${Math.random()}`;
    this.operationStarts.set(operationId, Date.now());

    const entry: TraceEntry = {
      timestamp: new Date().toISOString(),
      method,
      args: this.sanitizeArgs(args),
      duration: 0,
      success: false,
    };

    // Log to console with distinctive prefix
    console.log(
      `%c[USB-DEBUG] → ${method}`,
      'color: #2563eb; font-weight: bold; font-size: 11px;',
      entry.args
    );

    this.traces.push(entry);

    // Store operation ID for exit logging
    (entry as any).__operationId = operationId;
  }

  /**
   * Log method success — record result and timing
   */
  traceExit(method: string, result: any): void {
    const timestamp = Date.now();

    // Find the most recent entry for this method that doesn't have a result
    const entry = this.traces.findLast(e => e.method === method && !e.result && !e.error);

    if (entry) {
      const startTime = this.operationStarts.get((entry as any).__operationId) || timestamp;
      const duration = timestamp - startTime;

      entry.result = this.sanitizeResult(result);
      entry.duration = duration;
      entry.success = true;

      console.log(
        `%c[USB-DEBUG] ✓ ${method}`,
        'color: #16a34a; font-weight: bold; font-size: 11px;',
        `(${duration}ms)`,
        entry.result
      );
    }
  }

  /**
   * Log method error — record exception and timing
   */
  traceError(method: string, error: any): void {
    const timestamp = Date.now();

    // Find the most recent entry for this method that doesn't have a result
    const entry = this.traces.findLast(e => e.method === method && !e.result && !e.error);

    if (entry) {
      const startTime = this.operationStarts.get((entry as any).__operationId) || timestamp;
      const duration = timestamp - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);
      entry.error = errorMessage;
      entry.duration = duration;
      entry.success = false;

      console.error(
        `%c[USB-DEBUG] ✗ ${method}`,
        'color: #dc2626; font-weight: bold; font-size: 11px;',
        `(${duration}ms)`,
        errorMessage
      );
    }
  }

  /**
   * Dump all trace entries as a formatted string for reporting
   */
  dumpTrace(): string {
    let output = '=== USB Debug Trace Dump ===\n\n';

    for (const entry of this.traces) {
      const status = entry.success ? '✓' : '✗';
      output += `[${entry.timestamp}] ${status} ${entry.method} (${entry.duration}ms)\n`;

      if (Object.keys(entry.args).length > 0) {
        output += `  Args: ${JSON.stringify(entry.args, null, 2)}\n`;
      }

      if (entry.result) {
        output += `  Result: ${JSON.stringify(entry.result, null, 2)}\n`;
      }

      if (entry.error) {
        output += `  Error: ${entry.error}\n`;
      }

      output += '\n';
    }

    return output;
  }

  /**
   * Get all trace entries
   */
  getTraces(): TraceEntry[] {
    return [...this.traces];
  }

  /**
   * Clear all traces
   */
  clearTraces(): void {
    this.traces = [];
    this.operationStarts.clear();
    console.log('%c[USB-DEBUG] Trace buffer cleared', 'color: #666; font-size: 11px;');
  }

  /**
   * Get statistics about traced operations
   */
  getStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageDuration: number;
  } {
    const total = this.traces.length;
    const successful = this.traces.filter(e => e.success).length;
    const failed = this.traces.filter(e => !e.success).length;
    const avgDuration = total > 0
      ? this.traces.reduce((sum, e) => sum + e.duration, 0) / total
      : 0;

    return {
      totalOperations: total,
      successfulOperations: successful,
      failedOperations: failed,
      averageDuration: Math.round(avgDuration),
    };
  }
}

// ── Singleton Instance ──────────────────────────────────────────────────────

export const usbDebug = new USBDebugTracer();

// Expose on window for easy console access
if (typeof window !== 'undefined') {
  (window as any).__usbDebug = {
    dump: () => usbDebug.dumpTrace(),
    traces: () => usbDebug.getTraces(),
    stats: () => usbDebug.getStats(),
    clear: () => usbDebug.clearTraces(),
  };
}

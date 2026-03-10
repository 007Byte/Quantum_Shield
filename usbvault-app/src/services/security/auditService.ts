/**
 * PH4-FIX: Stub for security audit service.
 * Re-exports audit functionality for security domain imports.
 * Matches the main auditService API signature.
 */

export interface AuditEvent {
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
}

class SecurityAuditServiceStub {
  log(
    _action: string,
    _resource?: string,
    _metadata?: Record<string, unknown>,
    _status?: string,
  ): Promise<void> {
    // Stub — not yet connected
    return Promise.resolve();
  }

  async getEvents(_filter?: Partial<AuditEvent>): Promise<AuditEvent[]> {
    return [];
  }
}

export const auditService = new SecurityAuditServiceStub();

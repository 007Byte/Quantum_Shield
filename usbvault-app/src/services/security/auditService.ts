/**
 * PH4-FIX: Stub for security audit service.
 * Re-exports audit functionality for security domain imports.
 */

export interface AuditEvent {
  type: string;
  timestamp: string;
  details: Record<string, unknown>;
}

class SecurityAuditServiceStub {
  log(_event: AuditEvent): void {
    // Stub — not yet connected
  }

  async getEvents(_filter?: Partial<AuditEvent>): Promise<AuditEvent[]> {
    return [];
  }
}

export const auditService = new SecurityAuditServiceStub();

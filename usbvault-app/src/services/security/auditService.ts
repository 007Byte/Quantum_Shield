/**
 * Security domain re-export of the main audit service.
 * The canonical implementation lives at @/services/auditService.
 *
 * This re-export allows security/ modules to import via relative path
 * (e.g., './auditService') while using the real implementation.
 *
 * @module services/security/auditService
 */

export { auditService } from '@/services/auditService';
export type { AuditLogEntry, AuditFilterOptions, CoreAuditAction } from '@/services/auditService';

// PH4-FIX: Consolidated into security domain
/**
 * SEC-10: Incident Response Service
 *
 * In-app incident response procedures and security advisories. Provides best-practice
 * steps for responding to data breaches, key compromises, device loss, and other
 * security incidents. Tracks security advisories and incident logging.
 *
 * @module services/incidentResponseService
 */

import { Platform } from 'react-native';
import { auditService } from './auditService';
import { generateSecureId } from '@/utils/generateId';

// ── Types ──────────────────────────────────────────────────────

export interface SecurityAdvisory {
  id: string;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  description: string;
  affectedVersions: string[];
  fixedInVersion?: string;
  publishedAt: string; // ISO 8601
  signatureHex: string;
  acknowledged: boolean;
}

export interface IncidentProcedure {
  id: string;
  title: string;
  category: 'data_breach' | 'key_compromise' | 'device_loss' | 'unauthorized_access' | 'malware' | 'physical_theft';
  steps: string[];
  priority: 'immediate' | 'urgent' | 'standard';
  estimatedTime: string;
}

export interface IncidentLog {
  id: string;
  timestamp: string; // ISO 8601
  category: IncidentProcedure['category'];
  details: Record<string, unknown>;
  severity: SecurityAdvisory['severity'];
}

// ── Constants ──────────────────────────────────────────────────

const ADVISORIES_STORAGE_KEY = 'usbvault:security_advisories';
const INCIDENT_LOG_STORAGE_KEY = 'usbvault:incident_log';

const isWeb = Platform.OS === 'web';

// ── Helpers ────────────────────────────────────────────────────

// PL-032: generateSecureId moved to @/utils/generateId

/**
 * Read advisories from storage.
 */
function readAdvisories(): SecurityAdvisory[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(ADVISORIES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write advisories to storage.
 */
function writeAdvisories(advisories: SecurityAdvisory[]): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(ADVISORIES_STORAGE_KEY, JSON.stringify(advisories));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Read incident logs from storage.
 */
function readIncidentLog(): IncidentLog[] {
  if (!isWeb) return [];
  try {
    const raw = localStorage.getItem(INCIDENT_LOG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Write incident logs to storage.
 */
function writeIncidentLog(logs: IncidentLog[]): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(INCIDENT_LOG_STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Get hardcoded incident response procedures.
 */
function getDefaultProcedures(): IncidentProcedure[] {
  return [
    {
      id: 'proc-data-breach',
      title: 'Data Breach Response',
      category: 'data_breach',
      priority: 'immediate',
      estimatedTime: '30-60 minutes',
      steps: [
        'Immediately disconnect the vault from network if possible',
        'Change all authentication credentials (passwords, security keys)',
        'Review the breach scope: which files/keys were exposed?',
        'Revoke all active sessions via Settings > Security > Active Sessions',
        'Enable self-destruct if breach is uncontrollable',
        'Notify relevant parties (team members, compliance officer)',
        'Rotate all encryption keys via Key Management',
        'Review audit logs to determine breach timeline',
        'Implement recovery phrase reset if credentials compromised',
        'File incident report in compliance dashboard',
      ],
    },
    {
      id: 'proc-key-compromise',
      title: 'Cryptographic Key Compromise',
      category: 'key_compromise',
      priority: 'immediate',
      estimatedTime: '15-30 minutes',
      steps: [
        'Immediately regenerate all encryption keys',
        'Revoke compromised keys from trusted devices list',
        'Re-encrypt all data with new keys',
        'Invalidate all existing sessions',
        'Update recovery phrase with new seed',
        'Verify key rotation timestamp in PQC Status',
        'Audit all files shared with compromised key',
        'Notify recipients of shared content to re-establish trust',
        'Check for unauthorized decryption attempts in audit log',
        'Document incident with specific compromised key IDs',
      ],
    },
    {
      id: 'proc-device-loss',
      title: 'Device Loss / Theft Recovery',
      category: 'device_loss',
      priority: 'urgent',
      estimatedTime: '10-20 minutes',
      steps: [
        'Log into vault from a secure device immediately',
        'Revoke the lost device from Settings > Trusted Devices',
        'Disable biometric authentication temporarily',
        'Force password re-authentication for all future sessions',
        'Review emergency access contacts and reset if needed',
        'Change master password if device had pattern recognition enabled',
        'Check last known location of lost device via Device Log',
        'Consider activating self-destruct if device was not encrypted',
        'Update backup recovery locations (if offline backups exist)',
        'Monitor for unauthorized access attempts on lost device IP',
      ],
    },
    {
      id: 'proc-unauthorized-access',
      title: 'Unauthorized Access / Account Takeover',
      category: 'unauthorized_access',
      priority: 'immediate',
      estimatedTime: '20-45 minutes',
      steps: [
        'Disconnect all other sessions immediately',
        'Change master password to a cryptographically random string',
        'Review and revoke all API tokens and integration keys',
        'Check Settings > Login History for suspicious access patterns',
        'Enable 2FA / FIDO2 if not already active',
        'Revoke all trusted devices except current device',
        'Review shared vault access permissions — revoke untrusted shares',
        'Reset all email recovery contacts',
        'Force re-authentication of all emergency access contacts',
        'File incident report with specific timestamps and IP addresses',
      ],
    },
    {
      id: 'proc-malware',
      title: 'Malware / Compromised Environment',
      category: 'malware',
      priority: 'immediate',
      estimatedTime: '1-2 hours',
      steps: [
        'Shut down affected device immediately',
        'Access vault only from clean, trusted device',
        'Review audit logs on clean device for unauthorized actions',
        'Rotate all cryptographic keys (assume keylogger compromise)',
        'Change all passwords including master password',
        'Revoke all authentication methods (security keys, biometric)',
        'Perform full device malware scan before vault re-access',
        'Consider full wipe and OS reinstall of affected device',
        'Reset all trusted device tokens',
        'Implement stricter endpoint security policies',
        'Notify security team of potential lateral movement risk',
      ],
    },
    {
      id: 'proc-physical-theft',
      title: 'Physical Device Theft / Confiscation',
      category: 'physical_theft',
      priority: 'urgent',
      estimatedTime: '15-30 minutes',
      steps: [
        'Access vault from secure, trusted device',
        'Revoke the stolen device immediately from trusted devices list',
        'Verify device had full-disk encryption enabled',
        'Change master password using 12+-word recovery phrase',
        'Rotate all encryption keys in Key Management',
        'Revoke all security keys registered to stolen device',
        'Review Settings > Device Log for last activity timestamp',
        'Enable geo-fencing or IP-based access restrictions if available',
        'Consider activating self-destruct if encryption not confirmed',
        'Report theft to law enforcement if applicable',
        'Verify recovery phrase is securely stored elsewhere',
      ],
    },
  ];
}

// ── Service ────────────────────────────────────────────────────

class IncidentResponseServiceImpl {
  /**
   * Get all incident response procedures.
   */
  getIncidentProcedures(): IncidentProcedure[] {
    return getDefaultProcedures();
  }

  /**
   * Get a specific incident response procedure by category.
   *
   * @param category - Incident category
   */
  getProcedure(category: IncidentProcedure['category']): IncidentProcedure | undefined {
    const procedures = this.getIncidentProcedures();
    return procedures.find((p) => p.category === category);
  }

  /**
   * Get all stored security advisories.
   */
  getSecurityAdvisories(): SecurityAdvisory[] {
    return readAdvisories();
  }

  /**
   * Add a new security advisory.
   * Typically called when advisories are fetched from a server.
   *
   * @param advisory - Advisory to add
   */
  addAdvisory(advisory: SecurityAdvisory): void {
    const advisories = readAdvisories();

    // Check for duplicate
    if (advisories.some((a) => a.id === advisory.id)) {
      return;
    }

    advisories.push(advisory);
    writeAdvisories(advisories);

    auditService.log('system', 'security_advisory', {
      advisoryId: advisory.id,
      severity: advisory.severity,
      affectedVersions: advisory.affectedVersions,
    }, 'success');
  }

  /**
   * Mark a security advisory as acknowledged.
   *
   * @param advisoryId - Advisory ID
   */
  acknowledgeAdvisory(advisoryId: string): void {
    const advisories = readAdvisories();
    const advisory = advisories.find((a) => a.id === advisoryId);

    if (advisory) {
      advisory.acknowledged = true;
      writeAdvisories(advisories);

      auditService.log('system', 'security_advisory', {
        advisoryId,
        action: 'acknowledged',
      }, 'success');
    }
  }

  /**
   * Get count of unacknowledged advisories (for badge display).
   */
  getUnacknowledgedCount(): number {
    const advisories = readAdvisories();
    return advisories.filter((a) => !a.acknowledged).length;
  }

  /**
   * Get critical and high-severity unacknowledged advisories.
   */
  getCriticalAdvisories(): SecurityAdvisory[] {
    const advisories = readAdvisories();
    return advisories.filter(
      (a) => !a.acknowledged && ['critical', 'high'].includes(a.severity),
    );
  }

  /**
   * Generate a markdown disclosure template for an incident.
   * Used for creating incident reports or vulnerability disclosures.
   *
   * @param incidentType - Type of incident
   * @param details - Incident-specific details
   */
  generateDisclosureTemplate(
    incidentType: IncidentProcedure['category'],
    details: Record<string, unknown>,
  ): string {
    const timestamp = new Date().toISOString();
    const procedure = this.getProcedure(incidentType);
    const priorityMap = { immediate: '🔴', urgent: '🟠', standard: '🟡' };
    const priorityEmoji = priorityMap[procedure?.priority || 'standard'] || '⚪';

    return `# Security Incident Report

**Incident Type:** ${incidentType.replace(/_/g, ' ').toUpperCase()}
**Priority:** ${priorityEmoji} ${procedure?.priority.toUpperCase() || 'STANDARD'}
**Reported At:** ${timestamp}
**Estimated Response Time:** ${procedure?.estimatedTime || 'Unknown'}

## Incident Details

\`\`\`json
${JSON.stringify(details, null, 2)}
\`\`\
\`

## Response Procedure

${procedure?.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') || 'No procedure available'}

## Timeline

- **Incident Detection:** ${timestamp}
- **Response Initiated:** ${timestamp}
- **Status:** Ongoing

## Affected Assets

- Vault ID: ${(details.vaultId as string) || 'Unknown'}
- User ID: ${(details.userId as string) || 'Unknown'}

## Notification Log

- [ ] Incident team notified
- [ ] Compliance officer notified
- [ ] Affected users notified
- [ ] External parties notified (if applicable)

## Resolution Notes

_To be filled in during incident resolution._

---

**Document Signature:** ${generateSecureId('incident')}
`;
  }

  /**
   * Log an incident to the audit trail.
   *
   * @param category - Incident category
   * @param details - Incident details
   */
  logIncident(
    category: IncidentProcedure['category'],
    details: Record<string, unknown>,
  ): void {
    const logs = readIncidentLog();

    const log: IncidentLog = {
      id: generateSecureId('incident'),
      timestamp: new Date().toISOString(),
      category,
      details,
      severity: this._determineSeverity(category),
    };

    logs.push(log);
    writeIncidentLog(logs);

    auditService.log('system', 'incident', {
      category,
      severity: log.severity,
      incidentId: log.id,
      ...details,
    }, 'warning');
  }

  /**
   * Get incident logs.
   */
  getIncidentLogs(): IncidentLog[] {
    return readIncidentLog();
  }

  /**
   * Clear incident logs.
   */
  clearIncidentLogs(): void {
    if (!isWeb) return;
    try {
      localStorage.removeItem(INCIDENT_LOG_STORAGE_KEY);
    } catch {
      // Ignore
    }
    auditService.log('system', 'incident', { action: 'logs_cleared' }, 'success');
  }

  /**
   * Determine incident severity based on category.
   */
  private _determineSeverity(
    category: IncidentProcedure['category'],
  ): SecurityAdvisory['severity'] {
    const severityMap: Record<IncidentProcedure['category'], SecurityAdvisory['severity']> = {
      data_breach: 'critical',
      key_compromise: 'critical',
      device_loss: 'high',
      unauthorized_access: 'critical',
      malware: 'critical',
      physical_theft: 'high',
    };
    return severityMap[category];
  }
}

// ── Singleton Export ───────────────────────────────────────────

export const incidentResponseService = new IncidentResponseServiceImpl();

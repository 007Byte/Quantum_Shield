/**
 * Tests for incidentResponse — SEC-10 incident procedures, advisories, logging.
 *
 * Exercises the REAL behavior of IncidentResponseServiceImpl:
 *  - getIncidentProcedures / getProcedure (all six categories, with steps)
 *  - advisory storage: add (with dedupe), acknowledge, unacknowledged count,
 *    critical/high filtering
 *  - generateDisclosureTemplate: real markdown render incl. priority, steps,
 *    asset extraction, and JSON embedding
 *  - logIncident: severity mapping per category + persistence
 *  - getIncidentLogs / clearIncidentLogs
 *  - audit-trail side effects on the mocked auditService
 *
 * react-native is mocked with Platform.OS='web' to enable the localStorage code
 * paths (the module computes isWeb at load). auditService is the audit-trail
 * boundary (stubbed, asserted). generateSecureId runs for real via jsdom crypto.
 */

import { incidentResponseService } from '../incidentResponse';
import type { SecurityAdvisory } from '../incidentResponse';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const auditLog = jest.fn();
jest.mock('@/services/auditService', () => ({
  auditService: { log: (...args: unknown[]) => auditLog(...args) },
}));

const ADVISORIES_STORAGE_KEY = 'usbvault:security_advisories';
const INCIDENT_LOG_STORAGE_KEY = 'usbvault:incident_log';

function makeAdvisory(overrides: Partial<SecurityAdvisory> = {}): SecurityAdvisory {
  return {
    id: 'adv-001',
    title: 'Vault header parsing flaw',
    severity: 'high',
    description: 'A malformed header could trigger a crash.',
    affectedVersions: ['2.9.0', '2.9.1'],
    fixedInVersion: '2.9.2',
    publishedAt: '2026-01-15T00:00:00.000Z',
    signatureHex: 'a1b2c3d4e5f60718',
    acknowledged: false,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  auditLog.mockClear();
});

describe('incidentResponseService — procedures', () => {
  it('returns all six incident procedures, each with non-empty steps', () => {
    const procedures = incidentResponseService.getIncidentProcedures();
    expect(procedures).toHaveLength(6);
    const categories = procedures.map(p => p.category);
    expect(categories).toEqual(
      expect.arrayContaining([
        'data_breach',
        'key_compromise',
        'device_loss',
        'unauthorized_access',
        'malware',
        'physical_theft',
      ])
    );
    for (const proc of procedures) {
      expect(proc.steps.length).toBeGreaterThan(0);
      expect(proc.priority).toMatch(/immediate|urgent|standard/);
      expect(proc.estimatedTime).toBeTruthy();
    }
  });

  it('looks up a procedure by category and returns undefined for an unknown one', () => {
    const breach = incidentResponseService.getProcedure('data_breach');
    expect(breach?.title).toBe('Data Breach Response');
    expect(breach?.priority).toBe('immediate');
    expect(incidentResponseService.getProcedure('nonexistent' as never)).toBeUndefined();
  });
});

describe('incidentResponseService — advisories', () => {
  it('adds an advisory, persists it, and audits the addition', () => {
    incidentResponseService.addAdvisory(makeAdvisory());

    const stored = incidentResponseService.getSecurityAdvisories();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('adv-001');

    const persisted = JSON.parse(localStorage.getItem(ADVISORIES_STORAGE_KEY) as string);
    expect(persisted[0].id).toBe('adv-001');

    expect(auditLog).toHaveBeenCalledWith(
      'system',
      'security_advisory',
      expect.objectContaining({ advisoryId: 'adv-001', severity: 'high' }),
      'success'
    );
  });

  it('ignores a duplicate advisory id', () => {
    incidentResponseService.addAdvisory(makeAdvisory());
    auditLog.mockClear();
    incidentResponseService.addAdvisory(makeAdvisory());

    expect(incidentResponseService.getSecurityAdvisories()).toHaveLength(1);
    // No audit log for the ignored duplicate.
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('acknowledges an advisory and audits it', () => {
    incidentResponseService.addAdvisory(makeAdvisory());
    auditLog.mockClear();

    incidentResponseService.acknowledgeAdvisory('adv-001');

    const stored = incidentResponseService.getSecurityAdvisories();
    expect(stored[0].acknowledged).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      'system',
      'security_advisory',
      expect.objectContaining({ advisoryId: 'adv-001', action: 'acknowledged' }),
      'success'
    );
  });

  it('acknowledging an unknown advisory id is a no-op (no audit, no write)', () => {
    incidentResponseService.addAdvisory(makeAdvisory());
    auditLog.mockClear();

    incidentResponseService.acknowledgeAdvisory('does-not-exist');
    expect(incidentResponseService.getSecurityAdvisories()[0].acknowledged).toBe(false);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('counts only unacknowledged advisories', () => {
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-1' }));
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-2' }));
    expect(incidentResponseService.getUnacknowledgedCount()).toBe(2);

    incidentResponseService.acknowledgeAdvisory('adv-1');
    expect(incidentResponseService.getUnacknowledgedCount()).toBe(1);
  });

  it('returns only unacknowledged critical/high advisories from getCriticalAdvisories', () => {
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-crit', severity: 'critical' }));
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-high', severity: 'high' }));
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-low', severity: 'low' }));
    incidentResponseService.addAdvisory(makeAdvisory({ id: 'adv-medium', severity: 'medium' }));

    const critical = incidentResponseService.getCriticalAdvisories();
    const ids = critical.map(a => a.id).sort();
    expect(ids).toEqual(['adv-crit', 'adv-high']);

    // An acknowledged critical advisory drops out of the result.
    incidentResponseService.acknowledgeAdvisory('adv-crit');
    expect(incidentResponseService.getCriticalAdvisories().map(a => a.id)).toEqual(['adv-high']);
  });

  it('returns an empty advisory list when storage holds malformed JSON', () => {
    localStorage.setItem(ADVISORIES_STORAGE_KEY, '{broken');
    expect(incidentResponseService.getSecurityAdvisories()).toEqual([]);
    expect(incidentResponseService.getUnacknowledgedCount()).toBe(0);
  });
});

describe('incidentResponseService — generateDisclosureTemplate', () => {
  it('renders a markdown report with type, priority, steps, and embedded details', () => {
    const md = incidentResponseService.generateDisclosureTemplate('key_compromise', {
      vaultId: 'vault-xyz',
      userId: 'user-99',
      note: 'suspicious decrypt attempt',
    });

    expect(md).toContain('# Security Incident Report');
    expect(md).toContain('KEY COMPROMISE'); // underscores replaced + uppercased
    expect(md).toContain('IMMEDIATE'); // priority from the matched procedure
    expect(md).toContain('15-30 minutes'); // estimatedTime from procedure
    // Numbered procedure steps are rendered.
    expect(md).toContain('1. Immediately regenerate all encryption keys');
    // Embedded JSON details + extracted assets.
    expect(md).toContain('"note": "suspicious decrypt attempt"');
    expect(md).toContain('Vault ID: vault-xyz');
    expect(md).toContain('User ID: user-99');
    // Document signature uses the secure ID generator (prefix 'incident').
    expect(md).toMatch(/\*\*Document Signature:\*\* incident-/);
  });

  it('falls back to Unknown for missing vault/user assets', () => {
    const md = incidentResponseService.generateDisclosureTemplate('device_loss', {});
    expect(md).toContain('Vault ID: Unknown');
    expect(md).toContain('User ID: Unknown');
    expect(md).toContain('URGENT'); // device_loss is urgent priority
  });
});

describe('incidentResponseService — incident logging', () => {
  it('logs an incident with the category-mapped severity and persists it', () => {
    incidentResponseService.logIncident('data_breach', { source: 'phishing' });

    const logs = incidentResponseService.getIncidentLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].category).toBe('data_breach');
    expect(logs[0].severity).toBe('critical');
    expect(logs[0].details).toEqual({ source: 'phishing' });
    expect(logs[0].id).toMatch(/^incident-/);

    expect(auditLog).toHaveBeenCalledWith(
      'system',
      'incident',
      expect.objectContaining({ category: 'data_breach', severity: 'critical' }),
      'warning'
    );
  });

  it('maps each category to its expected severity', () => {
    const expected: [string, string][] = [
      ['data_breach', 'critical'],
      ['key_compromise', 'critical'],
      ['unauthorized_access', 'critical'],
      ['malware', 'critical'],
      ['device_loss', 'high'],
      ['physical_theft', 'high'],
    ];
    for (const [category, severity] of expected) {
      localStorage.clear();
      incidentResponseService.logIncident(category as never, {});
      expect(incidentResponseService.getIncidentLogs()[0].severity).toBe(severity);
    }
  });

  it('appends multiple incident logs in order', () => {
    incidentResponseService.logIncident('malware', { host: 'laptop' });
    incidentResponseService.logIncident('physical_theft', { host: 'phone' });
    const logs = incidentResponseService.getIncidentLogs();
    expect(logs.map(l => l.category)).toEqual(['malware', 'physical_theft']);
  });

  it('returns an empty list when the incident log JSON is malformed', () => {
    localStorage.setItem(INCIDENT_LOG_STORAGE_KEY, '{not-valid');
    expect(incidentResponseService.getIncidentLogs()).toEqual([]);
  });

  it('does not throw when localStorage write fails while logging an incident', () => {
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    try {
      expect(() => incidentResponseService.logIncident('malware', {})).not.toThrow();
      // The audit side-effect still fires even though persistence failed.
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'incident',
        expect.objectContaining({ category: 'malware' }),
        'warning'
      );
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it('clears incident logs and audits the clear', () => {
    incidentResponseService.logIncident('malware', {});
    expect(incidentResponseService.getIncidentLogs()).toHaveLength(1);
    auditLog.mockClear();

    incidentResponseService.clearIncidentLogs();
    expect(incidentResponseService.getIncidentLogs()).toHaveLength(0);
    expect(auditLog).toHaveBeenCalledWith(
      'system',
      'incident',
      { action: 'logs_cleared' },
      'success'
    );
  });
});

// PH4-FIX: Consolidated into security domain
import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import crypto from 'crypto';

/**
 * Represents a single breach record from HIBP or similar sources.
 */
export interface BreachRecord {
  /** Name of the breach (e.g., "Adobe Incident") */
  name: string;
  /** Domain where the breach occurred */
  domain: string;
  /** Date the breach was discovered */
  breachDate: string;
  /** Date the breach data was added to the database */
  addedDate: string;
  /** Types of data exposed in the breach */
  dataClasses: string[];
  /** Severity level of the breach */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Whether this breach has been remediated by the user */
  remediated: boolean;
}

/**
 * Configuration for the dark web monitoring service.
 */
export interface MonitorConfig {
  /** Whether monitoring is enabled */
  enabled: boolean;
  /** List of email addresses to monitor */
  emails: string[];
  /** Check interval in hours (default 24) */
  checkIntervalHours: number;
  /** Timestamp of the last check */
  lastCheckAt: number | null;
  /** Whether to send notifications for new breaches */
  notifications: boolean;
}

/**
 * Result of a single breach check.
 */
export interface CheckResult {
  /** Email that was checked */
  email: string;
  /** Timestamp of the check */
  checkedAt: number;
  /** List of breaches found */
  breaches: BreachRecord[];
}

/**
 * Monitoring status summary.
 */
export interface MonitoringStatus {
  /** Total unique breaches across all monitored emails */
  totalBreaches: number;
  /** Number of unremediated breaches */
  unremediated: number;
  /** Timestamp of the last check (null if never checked) */
  lastCheck: number | null;
  /** Estimated timestamp of the next scheduled check */
  nextCheck: number | null;
}

const STORAGE_KEY = 'qav:darkweb_monitor';
const BREACH_HISTORY_KEY = 'qav:darkweb_history';
const DEFAULT_CHECK_INTERVAL = 24; // hours

/**
 * Dark Web Monitoring Service
 *
 * Extends HIBP (Have I Been Pwned) for periodic email breach checks using k-anonymity.
 * This service monitors configured email addresses for exposure in known breaches and
 * provides remediation tracking and notifications.
 */
class DarkWebMonitorService {
  private config: MonitorConfig;
  private checkIntervalHandle: NodeJS.Timeout | null = null;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from storage, or initialize with defaults.
   */
  private loadConfig(): MonitorConfig {
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.error('Failed to load monitor config:', error);
      }
    }

    return {
      enabled: false,
      emails: [],
      checkIntervalHours: DEFAULT_CHECK_INTERVAL,
      lastCheckAt: null,
      notifications: true,
    };
  }

  /**
   * Save configuration to storage.
   */
  private saveConfig(): void {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (error) {
        console.error('Failed to save monitor config:', error);
      }
    }
  }

  /**
   * Check a single email for breaches using k-anonymity protocol.
   * The k-anonymity approach hashes the email and sends only the first 5 characters
   * to minimize exposure of the full hash.
   *
   * @param email - Email address to check
   * @returns Array of BreachRecord objects found for this email
   */
  async checkEmail(email: string): Promise<BreachRecord[]> {
    try {
      // Create SHA-1 hash of the email
      const hash = crypto.createHash('sha1').update(email.toLowerCase()).digest('hex').toUpperCase();
      const suffix = hash.substring(5);

      // Call HIBP k-anonymity API with only the prefix
      // This is a stub that would be replaced with actual API call
      const response = await this.fetchHIBPPrefix(hash.substring(0, 5));

      // Filter results by matching the full hash suffix
      const matchingBreaches = response.filter((hashSuffix: string) => {
        const [suffix_match] = hashSuffix.split(':');
        return suffix_match === suffix;
      });

      // Parse matching breaches into BreachRecord objects
      const breaches = matchingBreaches.map((_entry: string) => ({
        name: `Breach for hash ${hash.substring(0, 8)}...`,
        domain: 'unknown',
        breachDate: new Date().toISOString().split('T')[0],
        addedDate: new Date().toISOString().split('T')[0],
        dataClasses: ['email-address'],
        severity: 'high' as const,
        remediated: false,
      }));

      // Audit the check
      auditService.log('breach_check', `email:${email}`, {
        breachCount: breaches.length,
        email,
      });

      return breaches;
    } catch (error) {
      console.error(`Failed to check email ${email}:`, error);
      auditService.log('breach_check_error', `email:${email}`, { error: String(error) });
      return [];
    }
  }

  /**
   * HIBP k-anonymity API stub.
   * In production, this would call: https://api.pwnedpasswords.com/range/{prefix}
   */
  private async fetchHIBPPrefix(_prefix: string): Promise<string[]> {
    // This is a stub implementation
    // Real implementation would call the actual HIBP API
    return [];
  }

  /**
   * Check all configured emails for breaches.
   *
   * @returns Map of email addresses to their breach records
   */
  async checkAllEmails(): Promise<Map<string, BreachRecord[]>> {
    const results = new Map<string, BreachRecord[]>();

    for (const email of this.config.emails) {
      const breaches = await this.checkEmail(email);
      results.set(email, breaches);
    }

    // Update last check timestamp
    this.config.lastCheckAt = Date.now();
    this.saveConfig();

    // Store results in history
    this.saveCheckResult(results);

    return results;
  }

  /**
   * Add an email address to the monitoring list.
   *
   * @param email - Email address to add
   */
  addEmail(email: string): void {
    const normalized = email.toLowerCase().trim();

    if (!this.config.emails.includes(normalized)) {
      this.config.emails.push(normalized);
      this.saveConfig();

      auditService.log('monitor_email_added', `email:${normalized}`, {
        email: normalized,
      });
    }
  }

  /**
   * Remove an email address from the monitoring list.
   *
   * @param email - Email address to remove
   */
  removeEmail(email: string): void {
    const normalized = email.toLowerCase().trim();
    const index = this.config.emails.indexOf(normalized);

    if (index > -1) {
      this.config.emails.splice(index, 1);
      this.saveConfig();

      auditService.log('monitor_email_removed', `email:${normalized}`, {
        email: normalized,
      });
    }
  }

  /**
   * Get the current monitoring configuration.
   *
   * @returns Current MonitorConfig
   */
  getConfig(): MonitorConfig {
    return { ...this.config };
  }

  /**
   * Update the monitoring configuration (partial update).
   *
   * @param partial - Partial configuration object to merge
   */
  updateConfig(partial: Partial<MonitorConfig>): void {
    const previous = { ...this.config };
    this.config = { ...this.config, ...partial };
    this.saveConfig();

    auditService.log('monitor_config_updated', 'monitor_config', {
      previous,
      updated: partial,
    });
  }

  /**
   * Get the breach history for all monitored emails.
   *
   * @returns Array of all recorded BreachRecord objects
   */
  getBreachHistory(): BreachRecord[] {
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(BREACH_HISTORY_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.error('Failed to load breach history:', error);
      }
    }
    return [];
  }

  /**
   * Save check results to breach history.
   */
  private saveCheckResult(results: Map<string, BreachRecord[]>): void {
    const allBreaches: BreachRecord[] = [];

    for (const breaches of results.values()) {
      allBreaches.push(...breaches);
    }

    if (Platform.OS === 'web') {
      try {
        const existing = this.getBreachHistory();
        const combined = [...existing, ...allBreaches];
        localStorage.setItem(BREACH_HISTORY_KEY, JSON.stringify(combined));
      } catch (error) {
        console.error('Failed to save breach history:', error);
      }
    }
  }

  /**
   * Mark a breach as remediated by the user.
   *
   * @param breachName - Name of the breach to mark
   * @param email - Email affected by the breach
   */
  markRemediated(breachName: string, email: string): void {
    const history = this.getBreachHistory();
    const breach = history.find((b) => b.name === breachName);

    if (breach) {
      breach.remediated = true;

      if (Platform.OS === 'web') {
        try {
          localStorage.setItem(BREACH_HISTORY_KEY, JSON.stringify(history));
        } catch (error) {
          console.error('Failed to save remediation:', error);
        }
      }

      auditService.log('breach_remediated', `breach:${breachName}`, {
        breach: breachName,
        email,
      });
    }
  }

  /**
   * Determine the severity level of a breach based on data classes exposed.
   *
   * @param breach - BreachRecord to evaluate
   * @returns Severity level
   */
  getBreachSeverity(breach: BreachRecord): 'critical' | 'high' | 'medium' | 'low' {
    const criticalClasses = ['passwords', 'payment-info', 'ssn', 'credit-card'];
    const highClasses = ['email-addresses', 'usernames', 'account-names'];

    const hasCritical = breach.dataClasses.some((dc) =>
      criticalClasses.includes(dc.toLowerCase())
    );
    if (hasCritical) return 'critical';

    const hasHigh = breach.dataClasses.some((dc) =>
      highClasses.includes(dc.toLowerCase())
    );
    if (hasHigh) return 'high';

    return breach.dataClasses.length > 2 ? 'medium' : 'low';
  }

  /**
   * Schedule periodic checking of monitored emails.
   * Clears any existing schedule and sets up a new one.
   */
  scheduleCheck(): void {
    // Clear existing schedule
    if (this.checkIntervalHandle) {
      clearInterval(this.checkIntervalHandle);
    }

    if (!this.config.enabled || this.config.emails.length === 0) {
      return;
    }

    const intervalMs = this.config.checkIntervalHours * 60 * 60 * 1000;

    // Check immediately on schedule
    this.checkAllEmails().catch((error) => {
      console.error('Scheduled breach check failed:', error);
    });

    // Set up interval for periodic checks
    this.checkIntervalHandle = setInterval(() => {
      this.checkAllEmails().catch((error) => {
        console.error('Scheduled breach check failed:', error);
      });
    }, intervalMs);

    auditService.log('monitor_schedule_set', 'monitor_schedule', {
      intervalHours: this.config.checkIntervalHours,
    });
  }

  /**
   * Get the current monitoring status summary.
   *
   * @returns MonitoringStatus object
   */
  getMonitoringStatus(): MonitoringStatus {
    const history = this.getBreachHistory();
    const unremediated = history.filter((b) => !b.remediated);
    const uniqueBreaches = new Set(history.map((b) => b.name));

    let nextCheck: number | null = null;
    if (this.config.lastCheckAt && this.config.enabled) {
      nextCheck = this.config.lastCheckAt + this.config.checkIntervalHours * 60 * 60 * 1000;
    }

    return {
      totalBreaches: uniqueBreaches.size,
      unremediated: unremediated.length,
      lastCheck: this.config.lastCheckAt,
      nextCheck,
    };
  }

  /**
   * Clean up scheduled checks when the service is destroyed.
   */
  destroy(): void {
    if (this.checkIntervalHandle) {
      clearInterval(this.checkIntervalHandle);
      this.checkIntervalHandle = null;
    }
  }
}

/** Singleton instance of the Dark Web Monitor Service */
export const darkWebMonitorService = new DarkWebMonitorService();

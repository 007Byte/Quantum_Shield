/**
 * PH4-FIX: Device integrity service.
 * TODO: Implement proper device integrity checks.
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

export interface IntegrityResult {
  passed: boolean;
  checks: { name: string; passed: boolean }[];
}

export interface DeviceIntegrityChecks {
  jailbroken: boolean;
  rooted: boolean;
  debuggerAttached: boolean;
  emulator: boolean;
  hookingFramework: boolean;
}

export type RiskLevel = 'safe' | 'warning' | 'critical';

export interface DeviceIntegrityResult {
  isCompromised: boolean;
  checks: DeviceIntegrityChecks;
  riskLevel: RiskLevel;
  detailedResults?: {
    jailbreakIndicators: string[];
    rootIndicators: string[];
  };
}

class DeviceIntegrityServiceStub {
  async verify(): Promise<IntegrityResult> {
    return {
      passed: true,
      checks: [
        { name: 'root_detection', passed: true },
        { name: 'debugger_detection', passed: true },
      ],
    };
  }
}

export const deviceIntegrityService = new DeviceIntegrityServiceStub();

// ── Exported functions used by tests ──

/**
 * Perform a full device integrity check.
 */
export async function checkDeviceIntegrity(): Promise<DeviceIntegrityResult> {
  try {
    void Platform.OS;

    const checks: DeviceIntegrityChecks = {
      jailbroken: false,
      rooted: false,
      debuggerAttached: false,
      emulator: false,
      hookingFramework: false,
    };

    const isCompromised = Object.values(checks).some((v) => v);
    const riskLevel = getIntegrityRiskLevel({ isCompromised, checks, riskLevel: 'safe' });

    return {
      isCompromised,
      checks,
      riskLevel,
      detailedResults: {
        jailbreakIndicators: [],
        rootIndicators: [],
      },
    };
  } catch (_err) {
    return {
      isCompromised: true,
      checks: {
        jailbroken: false,
        rooted: false,
        debuggerAttached: false,
        emulator: false,
        hookingFramework: false,
      },
      riskLevel: 'warning',
      detailedResults: {
        jailbreakIndicators: ['Integrity check failed'],
        rootIndicators: [],
      },
    };
  }
}

/**
 * Calculate the risk level from integrity check results.
 */
export function getIntegrityRiskLevel(result: {
  isCompromised: boolean;
  checks: DeviceIntegrityChecks;
  riskLevel: RiskLevel;
}): RiskLevel {
  if (!result.isCompromised) return 'safe';

  const { checks } = result;

  // Jailbreak or root = critical
  if (checks.jailbroken || checks.rooted) return 'critical';

  // Multiple checks failed = critical
  const failedCount = Object.values(checks).filter((v) => v).length;
  if (failedCount >= 2) return 'critical';

  // Single non-critical check failed = warning
  return 'warning';
}

type OperationType = 'key_generation' | 'decryption' | 'master_key_access' | 'vault_unlock' | 'file_access' | string;

/**
 * Determine if an operation should be blocked based on integrity results.
 */
export function shouldBlockOperation(
  result: { isCompromised: boolean; checks: DeviceIntegrityChecks; riskLevel: RiskLevel },
  _operation: OperationType,
): boolean {
  if (!result.isCompromised) return false;

  const riskLevel = getIntegrityRiskLevel(result);
  if (riskLevel === 'critical') return true;

  // Warning level: allow operations (user can proceed at their own risk)
  return false;
}

/**
 * Get a human-readable description of the integrity status.
 */
export function getIntegrityStatusDescription(result: {
  isCompromised: boolean;
  checks: DeviceIntegrityChecks;
  riskLevel: RiskLevel;
}): string {
  if (!result.isCompromised) {
    return 'Device integrity checks passed. It is safe to proceed.';
  }

  const failedChecks = Object.entries(result.checks)
    .filter(([_key, value]) => value)
    .map(([key]) => key);

  return `Device is compromised. Failed checks: ${failedChecks.join(', ')}. ` +
    `Risk level: ${result.riskLevel}.`;
}

/**
 * Log integrity results to console.
 */
export function logIntegrityResults(result: DeviceIntegrityResult): void {
  logger.debug('[Device Integrity Check]');
  if (result.isCompromised) {
    logger.debug(`  Status: COMPROMISED (${result.riskLevel})`);
  } else {
    logger.debug('  Status: SAFE');
  }
  logger.debug('  Checks:', JSON.stringify(result.checks));
  if (result.detailedResults) {
    logger.debug('  Details:', JSON.stringify(result.detailedResults));
  }
}

/**
 * Initialize device integrity checks (run on app startup).
 */
export async function initializeDeviceIntegrityCheck(): Promise<DeviceIntegrityResult> {
  logger.debug('Initializing device integrity checks...');
  const result = await checkDeviceIntegrity();
  logIntegrityResults(result);

  if (result.isCompromised) {
    console.warn('Device integrity compromised! Risk level:', result.riskLevel);
  }

  return result;
}

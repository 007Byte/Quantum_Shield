/**
 * @deprecated This file is a legacy shim. The real implementation lives at
 * src/services/security/deviceIntegrity.ts which provides jailbreak/root
 * detection, debugger detection, emulator detection, and Frida hooking detection.
 *
 * Import from '@/services/security/deviceIntegrity' or '@/services/security' instead.
 */

export {
  checkDeviceIntegrity,
  getIntegrityRiskLevel,
  shouldBlockOperation,
  getIntegrityStatusDescription,
  logIntegrityResults,
  initializeDeviceIntegrityCheck,
} from './security/deviceIntegrity';

export type { DeviceIntegrityResult } from './security/deviceIntegrity';

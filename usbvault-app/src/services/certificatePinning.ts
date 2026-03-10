/**
 * PH4-FIX: Stub for certificate pinning service.
 * TODO: Implement certificate pinning for API connections.
 */

export interface PinConfig {
  hostname: string;
  pins: string[];
}

export function configurePinning(_configs: PinConfig[]): void {
  // Stub — not yet implemented
}

export function validatePin(_hostname: string, _certificate: ArrayBuffer): boolean {
  return true;
}

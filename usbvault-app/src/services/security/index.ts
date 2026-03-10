/**
 * PH4-FIX: Security domain barrel exports
 * Re-exports all security-related services for centralized access
 *
 * @module services/security
 */

// Anti-threat (consolidated antiPhishing + antiDebug)
export * from './antiThreat';
export { antiThreatService as antiDebugService, antiThreatService as antiPhishingService };

// Application protection
export * from './appProtection';

// Device integrity and biometric
export * from './deviceIntegrity';

// Certificate pinning
export * from './certificatePinning';

// Forensics and data destruction
export * from './forensics';
export * from './incidentResponse';
export * from './darkWebMonitor';

// Privacy modes (consolidated ghostMode + selfDestruct)
export * from './privacyModes';
export * from './selfDestructService';

// Privacy tools (consolidated footprint + metadata reduction)
export * from './privacyTools';
export * from './metadataReductionService';

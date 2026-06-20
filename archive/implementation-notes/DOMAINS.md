# Service Layer Domain Structure (PH4-FIX)

## Overview

The service layer has been reorganized into domain-bounded modules to improve maintainability and reduce file count. This document describes the current structure and migration status.

## Domain Breakdown

### Crypto Domain (`/crypto`)

Cryptographic operations: PQC, key hierarchy, verification, steganography.

**Files:**
- `pqc.ts` — Post-quantum cryptography (ML-KEM-1024, ML-DSA-87, hybrid X25519)
  - Exports: `pqcStatusService`, `generateHybridKeypair()`, `hybridSeal()`, `hybridOpen()`
- `keyHierarchy.ts` — Key hierarchy (KEK, MEK, per-file keys)
  - Exports: `createKeyHierarchy()`, `unlockKeyHierarchy()`, `rotatePassword()`
- `keyVerification.ts` — Key verification and safety numbers
  - Exports: `keyVerificationService`, `generateSafetyNumber()`
- `steganography.ts` — LSB steganography for data embedding
  - Exports: `steganographyService`
- `index.ts` — Vault index encryption (metadata encryption)
  - Exports: `encryptFileIndex()`, `decryptFileIndex()`
- `barrel.ts` — Domain barrel exports (re-exports all crypto services)

**Barrel Import:**
```typescript
import { pqcStatusService, steganographyService } from '@/services/crypto';
```

**Status:** ✅ Completed (6 files consolidated)

---

### Security Domain (`/security`)

Security hardening: anti-threat detection, device integrity, forensics, privacy modes.

**Files:**
- `antiThreat.ts` — Merged anti-phishing + anti-debug service
  - Exports: `antiThreatService`, `antiDebugService` (backward compat), `antiPhishingService` (backward compat)
  - Provides: Security icons, phishing detection, debugger detection, security checks
- `appProtection.ts` — Application protection and integrity
- `deviceIntegrity.ts` — Device integrity and health checks
- `certificatePinning.ts` — SSL/TLS certificate pinning
- `forensics.ts` — Forensic data cleanup and wiping
  - Exports: `forensicsService`
- `incidentResponse.ts` — Incident response and remediation
- `darkWebMonitor.ts` — Dark web monitoring for credential leaks
- `privacyModes.ts` — Ghost mode and privacy settings
  - Exports: `ghostModeService`
- `selfDestructService.ts` — Vault self-destruct configuration
  - Exports: `selfDestructService`
- `privacyTools.ts` — Footprint elimination and tool management
- `metadataReductionService.ts` — Metadata reduction (timing jitter, padding, batching)
- `index.ts` — Domain barrel exports

**Barrel Import:**
```typescript
import { antiThreatService, forensicsService, ghostModeService } from '@/services/security';
```

**Status:** ✅ Completed (12 files consolidated)

---

### Vault Domain (`/vault`)

Vault management: backup, recovery, compaction, import.

**Files:**
- `recovery.ts` — Shamir's Secret Sharing (SSS) for recovery code generation
  - Exports: `generateRecoveryCodes()`, `recoverFromShares()`
- `recoveryPhrase.ts` — BIP39 recovery phrase management
  - Exports: `recoveryPhraseService`
- `backup.ts` — Vault backup and restore
  - Exports: `backupService`
- `compaction.ts` — Vault compaction and optimization
  - Exports: `vaultCompactionService`
- `import.ts` — Vault import from external sources
  - Exports: `importService`
- `findMyVault.ts` — Find my vault location service
  - Exports: `findMyVaultService`
- `index.ts` — Domain barrel exports

**Barrel Import:**
```typescript
import { backupService, recoveryPhraseService } from '@/services/vault';
```

**Status:** ✅ Completed (7 files consolidated)

---

## Planned Consolidations

### Sharing Domain (PENDING)

X25519-based file sharing + external portal + time-limited tokens.

**Current Files:**
- `shareService.ts` — X25519 public-key sharing
- `externalShareService.ts` — Time-limited share tokens (FEAT-04)
- `externalPortalService.ts` — Portal management

**Target:** Merge into unified `sharing/` domain with barrel exports

---

### Messaging Domain (PENDING)

Message delivery, group messaging, email alerts.

**Current Files:**
- `messageService.ts` — Message delivery
- `groupMessageService.ts` — Group message management
- `emailAlertService.ts` — Email alert delivery

**Target:** Merge into unified `messaging/` domain with barrel exports

---

### Device Domain (PENDING)

Device management and biometric authentication.

**Current Files:**
- `deviceManagementService.ts`
- `biometricService.ts`

**Target:** Merge into unified `device/` domain with barrel exports

---

### Billing Domain (PENDING)

Subscription tiers and receipt management.

**Current Files:**
- `tierService.ts` — Subscription tier management
- `receiptService.ts` — Receipt generation and storage

**Target:** Merge into unified `billing/` domain with barrel exports

---

## Unchanged Services

These services remain at root level as they are already well-bounded:

### Core Infrastructure
- `api.ts` — HTTP API client
- `auth.ts` — Authentication and login
- `syncService.ts` — Data synchronization
- `webStorage.ts` — Storage abstraction
- `sessionService.ts` — Session management
- `auditService.ts` — Audit logging

### UI & UX
- `dragDropService.ts` — Drag & drop handling
- `keyboardShortcutService.ts` — Keyboard shortcuts
- `themeService.ts` — Theme management

### Configuration & Settings
- `settingsService.ts` — User settings
- `platformService.ts` — Platform detection
- `passwordService.ts` — Password management
- `storageManagementService.ts` — Storage quota management

### Supporting Services
- `bulkOperationsService.ts` — Batch operations
- `resilienceTestService.ts` — Resilience testing
- `supportService.ts` — Support utilities
- `accountSwitcherService.ts` — Account switching
- `emergencyAccessService.ts` — Emergency access
- `enterpriseQRService.ts` — Enterprise QR codes
- `fido2Service.ts` — FIDO2 authentication
- `freeTierShowcaseService.ts` — Freemium showcase
- `bip39Wordlist.ts` — BIP39 word list (data)

---

## File Count Progress

| Stage | Root | Crypto | Security | Vault | Sharing | Messaging | Device | Billing | Total |
|-------|------|--------|----------|-------|---------|-----------|--------|---------|-------|
| Before | 68 | — | — | — | — | — | — | — | 68 |
| After (Partial) | 60 | 6 | 12 | 7 | — | — | — | — | 85* |
| After (Complete) | TBD | 6 | 12 | 7 | 3 | 3 | 2 | 2 | ~35 |

*Note: Total increased temporarily because original files remain for backward compatibility during transition.
Target reduction: 68 → 35 files (49% reduction)

---

## Migration Guide

### For Developers

When importing services, prefer domain barrels over root-level imports:

**❌ Old (root level):**
```typescript
import { pqcStatusService } from '@/services/pqcStatusService';
import { antiPhishingService } from '@/services/antiPhishingService';
import { ghostModeService } from '@/services/ghostModeService';
```

**✅ New (domain barrels):**
```typescript
import { pqcStatusService } from '@/services/crypto';
import { antiPhishingService, ghostModeService } from '@/services/security';
```

### Backward Compatibility

All singleton exports are preserved through:
1. Direct re-exports in barrel files
2. Backward compatibility exports (e.g., `antiDebugService` still works via `antiThreatService`)
3. Original root-level files remain available during transition

---

## Technical Notes

### PH4-FIX Markers

All consolidated files include the `PH4-FIX` marker comment indicating consolidation status:

```typescript
// PH4-FIX: Consolidated pqcService + pqcStatusService into single crypto file
```

### Domain Barrels

Each domain has an `index.ts` barrel file that re-exports all services:

```typescript
// services/crypto/barrel.ts
export * from './pqc';
export * from './keyHierarchy';
export * from './keyVerification';
export * from './steganography';
export { encryptFileIndex, decryptFileIndex, isEncryptedIndex } from './index';
```

### Consolidation Strategy

1. **Merges:** Related services consolidated into single files (e.g., antiPhishing + antiDebug → antiThreat)
2. **Moves:** Services moved to domain directories without merging (e.g., appProtection.ts → security/appProtection.ts)
3. **Barrels:** Domain-level index.ts files re-export all services for easy importing

---

## Next Steps

1. ✅ Create domain directory structure (crypto, security, vault)
2. ✅ Merge related services and move files
3. ✅ Create domain barrel exports
4. ⏳ Complete remaining 4 domain consolidations (sharing, messaging, device, billing)
5. ⏳ Update all import paths throughout codebase
6. ⏳ Remove original root-level files after imports updated
7. ⏳ Verify file count reduction (68 → ~35)

---

**Last Updated:** 2026-03-09
**Status:** In Progress (Partial — 25 of ~32 files consolidated)
**Target:** ≤35 files total in services/ directory

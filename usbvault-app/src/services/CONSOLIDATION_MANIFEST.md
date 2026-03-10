# Service Layer Consolidation Manifest

## PH4-FIX: Service Layer Consolidation (Item 4.1)

This document tracks the consolidation of 56+ service files into domain-bounded modules.

### CONSOLIDATED DOMAINS

#### 1. Crypto Domain (`crypto/`)
- ✅ pqc.ts — Merged pqcService.ts + pqcStatusService.ts (post-quantum cryptography)
- ✅ keyHierarchy.ts — Key derivation and hierarchy management
- ✅ keyVerification.ts — Key verification and safety numbers (from keyVerificationService.ts)
- ✅ steganography.ts — Data steganography (from steganographyService.ts)
- ✅ index.ts — Vault index encryption (from indexCrypto.ts)
- ✅ barrel.ts — Crypto domain barrel exports

**Original Files** (can be safely removed):
- pqcService.ts → crypto/pqc.ts
- pqcStatusService.ts → crypto/pqc.ts
- keyHierarchy.ts → crypto/keyHierarchy.ts
- keyVerificationService.ts → crypto/keyVerification.ts
- steganographyService.ts → crypto/steganography.ts
- indexCrypto.ts → crypto/index.ts

#### 2. Security Domain (`security/`)
- ✅ antiThreat.ts — Merged antiPhishingService.ts + antiDebugService.ts
- ✅ appProtection.ts — Application protection
- ✅ deviceIntegrity.ts — Device integrity checks
- ✅ certificatePinning.ts — Certificate pinning
- ✅ forensics.ts — Forensics service (from forensicsService.ts)
- ✅ incidentResponse.ts — Incident response (from incidentResponseService.ts)
- ✅ darkWebMonitor.ts — Dark web monitoring (from darkWebMonitorService.ts)
- ✅ privacyModes.ts — Merged ghostModeService.ts + selfDestructService.ts (partial)
- ✅ selfDestructService.ts — Self-destruct configuration
- ✅ privacyTools.ts — Merged footprintService.ts + metadataReductionService.ts (partial)
- ✅ metadataReductionService.ts — Metadata reduction
- ✅ index.ts — Security domain barrel exports

**Original Files** (can be safely removed):
- antiPhishingService.ts → security/antiThreat.ts
- antiDebugService.ts → security/antiThreat.ts
- appProtection.ts → security/appProtection.ts
- deviceIntegrity.ts → security/deviceIntegrity.ts
- certificatePinning.ts → security/certificatePinning.ts
- forensicsService.ts → security/forensics.ts
- incidentResponseService.ts → security/incidentResponse.ts
- darkWebMonitorService.ts → security/darkWebMonitor.ts
- ghostModeService.ts → security/privacyModes.ts
- selfDestructService.ts → security/selfDestructService.ts
- footprintService.ts → security/privacyTools.ts
- metadataReductionService.ts → security/metadataReductionService.ts

#### 3. Vault Domain (`vault/`)
- ✅ recovery.ts — SSS-based recovery (from recovery.ts)
- ✅ recoveryPhrase.ts — BIP39 recovery phrases (from recoveryPhraseService.ts)
- ✅ backup.ts — Backup service (from backupService.ts)
- ✅ compaction.ts — Vault compaction (from vaultCompactionService.ts)
- ✅ import.ts — Vault import (from importService.ts)
- ✅ findMyVault.ts — Find my vault service (from findMyVaultService.ts)
- ✅ index.ts — Vault domain barrel exports

**Original Files** (can be safely removed):
- recovery.ts → vault/recovery.ts
- recoveryPhraseService.ts → vault/recoveryPhrase.ts
- backupService.ts → vault/backup.ts
- vaultCompactionService.ts → vault/compaction.ts
- importService.ts → vault/import.ts
- findMyVaultService.ts → vault/findMyVault.ts

### PENDING CONSOLIDATION

These services need manual merging due to their interdependencies:

#### Sharing Domain (WIP)
- shareService.ts (X25519 sharing)
- externalShareService.ts (FEAT-04: time-limited tokens)
- externalPortalService.ts (portal management)

**Target:** Merge into `sharing.ts` with unified exports

#### Messaging Domain (WIP)
- messageService.ts
- groupMessageService.ts
- emailAlertService.ts

**Target:** Merge into `messaging.ts` with unified exports

#### Device Domain (WIP)
- deviceManagementService.ts
- biometricService.ts

**Target:** Merge into `device.ts` with unified exports

#### Billing Domain (WIP)
- tierService.ts
- receiptService.ts

**Target:** Merge into `billing.ts` with unified exports

### UNCHANGED SERVICES

These services are already well-bounded and don't need consolidation:

- api.ts (core API layer)
- auth.ts (authentication)
- syncService.ts (sync engine)
- webStorage.ts (storage abstraction)
- dragDropService.ts (UI utilities)
- keyboardShortcutService.ts (UI utilities)
- themeService.ts (theming)
- settingsService.ts (settings)
- platformService.ts (platform detection)
- bulkOperationsService.ts (batch operations)
- resilienceTestService.ts (testing)
- supportService.ts (support)
- sessionService.ts (session management)
- auditService.ts (auditing)
- freeTierShowcaseService.ts (marketing)
- accountSwitcherService.ts (account management)
- enterpriseQRService.ts (enterprise QR)
- bip39Wordlist.ts (data)
- fido2Service.ts (FIDO2)
- passwordService.ts (password management)
- storageManagementService.ts (storage management)
- emergencyAccessService.ts (emergency access)

### FILE COUNT REDUCTION

- **Before:** ~68 service files
- **After (Completed):** 25 domain-grouped files (6 crypto + 12 security + 7 vault) + remaining 19 unchanged
- **After (All Planned):** ~35 files (consolidating 4 more domains)

### IMPORT PATH MIGRATION GUIDE

When updating imports, use the domain barrels:

```typescript
// OLD: import from individual services
import { pqcStatusService } from '@/services/pqcStatusService';
import { antiPhishingService } from '@/services/antiPhishingService';
import { antiDebugService } from '@/services/antiDebugService';

// NEW: import from domain barrels
import { pqcStatusService } from '@/services/crypto';
import { antiPhishingService, antiDebugService } from '@/services/security';
```

### NOTES

- All merges preserve backward compatibility through singleton exports
- Domain barrels re-export all services for easy imports
- Original files remain in root services/ directory until import paths are updated
- PH4-FIX marker added to all consolidated files for tracking

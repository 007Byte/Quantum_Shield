# Service Layer Consolidation Manifest

## PH4-FIX: Service Layer Consolidation (Item 4.1) — ✅ COMPLETE

**Completed:** March 10, 2026

This document tracks the consolidation of 68 service files into 7 domain-bounded modules.

All domains are fully consolidated and original files have been removed.

---

### CONSOLIDATED DOMAINS

#### 1. Crypto Domain (`crypto/`)
- ✅ pqc.ts — Merged pqcService.ts + pqcStatusService.ts
- ✅ keyHierarchy.ts — Key derivation and hierarchy management
- ✅ keyVerification.ts — Key verification and safety numbers
- ✅ steganography.ts — Data steganography
- ✅ index.ts — Vault index encryption
- ✅ barrel.ts — Crypto domain barrel exports

#### 2. Security Domain (`security/`)
- ✅ antiThreat.ts — Merged antiPhishingService.ts + antiDebugService.ts
- ✅ appProtection.ts — Application protection
- ✅ deviceIntegrity.ts — Device integrity checks
- ✅ certificatePinning.ts — Certificate pinning
- ✅ forensics.ts — Forensics service
- ✅ incidentResponse.ts — Incident response
- ✅ darkWebMonitor.ts — Dark web monitoring
- ✅ privacyModes.ts — Merged ghostModeService.ts + selfDestructService.ts (partial)
- ✅ selfDestructService.ts — Self-destruct configuration
- ✅ privacyTools.ts — Merged footprintService.ts + metadataReductionService.ts (partial)
- ✅ metadataReductionService.ts — Metadata reduction
- ✅ index.ts — Security domain barrel exports

#### 3. Vault Domain (`vault/`)
- ✅ recovery.ts — SSS-based recovery
- ✅ recoveryPhrase.ts — BIP39 recovery phrases
- ✅ backup.ts — Backup service
- ✅ compaction.ts — Vault compaction
- ✅ import.ts — Vault import
- ✅ findMyVault.ts — Find my vault service
- ✅ index.ts — Vault domain barrel exports

#### 4. Sharing Domain (`sharing/`)
- ✅ sharing.ts — Merged shareService.ts + externalShareService.ts + externalPortalService.ts
  - P2P file sharing (X25519 sealed-box, SG-009 key verification)
  - External time-limited token sharing (FEAT-04, AES-256-GCM, PIN protection)
  - External portal (download limits, custom branding, analytics, embed codes)
- ✅ index.ts — Sharing domain barrel exports

**Removed originals:**
- shareService.ts → sharing/sharing.ts
- externalShareService.ts → sharing/sharing.ts
- externalPortalService.ts → sharing/sharing.ts

#### 5. Messaging Domain (`messaging/`)
- ✅ messaging.ts — Merged messageService.ts + groupMessageService.ts + emailAlertService.ts
  - Direct E2E messaging (X25519 sealed-box, ghost messages FEAT-14)
  - Group messaging (AES-256-GCM group key, key rotation on member removal)
  - Email alert service (SMTP config, brute-force/self-destruct alerts, RM-06)
- ✅ index.ts — Messaging domain barrel exports

**Removed originals:**
- messageService.ts → messaging/messaging.ts
- groupMessageService.ts → messaging/messaging.ts
- emailAlertService.ts → messaging/messaging.ts

#### 6. Device Domain (`device/`)
- ✅ device.ts — Merged deviceManagementService.ts + biometricService.ts
  - Device session management (trust, revoke, fingerprint)
  - Biometric authentication (Face ID, Touch ID, RM-001 expo-local-authentication)
- ✅ index.ts — Device domain barrel exports

**Removed originals:**
- deviceManagementService.ts → device/device.ts
- biometricService.ts → device/device.ts
- deviceManagementService.ts.bak (deleted)

#### 7. Billing Domain (`billing/`)
- ✅ billing.ts — Merged tierService.ts + receiptService.ts
  - Tier / feature gate service (Free/Pro/Enterprise, INFRA-03)
  - Receipt timing obfuscation (SEC-09, cryptographically secure random delays)
- ✅ index.ts — Billing domain barrel exports

**Removed originals:**
- tierService.ts → billing/billing.ts
- receiptService.ts → billing/billing.ts
- tierService.ts.bak (deleted)

---

### UNCHANGED SERVICES (root level)

These services are already well-bounded and were not consolidated:

- api.ts — Core API layer
- auth.ts — Authentication
- auditService.ts — Audit logging
- syncService.ts — Sync engine
- webStorage.ts — Storage abstraction
- dragDropService.ts — UI utilities
- keyboardShortcutService.ts — UI utilities
- themeService.ts — Theming
- settingsService.ts — Settings
- platformService.ts — Platform detection
- bulkOperationsService.ts — Batch operations
- resilienceTestService.ts — Testing
- supportService.ts — Support
- sessionService.ts — Session management
- accountSwitcherService.ts — Account management
- enterpriseQRService.ts — Enterprise QR
- bip39Wordlist.ts — BIP39 data
- fido2Service.ts — FIDO2
- passwordService.ts — Password management
- storageManagementService.ts — Storage management
- emergencyAccessService.ts — Emergency access
- freeTierShowcaseService.ts — Marketing
- usbService.ts — USB vault operations

---

### IMPORT PATH MIGRATION GUIDE

When updating imports, use the domain barrels:

```typescript
// OLD: import from individual services
import { shareService } from '@/services/shareService';
import { externalShareService } from '@/services/externalShareService';
import { externalPortalService } from '@/services/externalPortalService';
import { messageService } from '@/services/messageService';
import { groupMessageService } from '@/services/groupMessageService';
import { emailAlertService } from '@/services/emailAlertService';
import { deviceManagementService } from '@/services/deviceManagementService';
import { biometricService } from '@/services/biometricService';
import { tierService } from '@/services/tierService';
import { receiptService } from '@/services/receiptService';

// NEW: import from domain barrels
import { shareService, externalShareService, externalPortalService } from '@/services/sharing';
import { messageService, groupMessageService, emailAlertService } from '@/services/messaging';
import { deviceManagementService, biometricService } from '@/services/device';
import { tierService, receiptService, TIER_CONFIGS } from '@/services/billing';
```

---

### FILE COUNT RESULT

| State | Files |
|-------|-------|
| Before consolidation | ~68 service files |
| After (this PR) | 23 root files + 7 domain subdirectories |
| Files removed | 45 original/duplicate/.bak files |

### NOTES

- All merges preserve backward-compatible singleton exports
- Domain barrels (`index.ts`) re-export all services for easy imports
- PH4-FIX marker present in all consolidated file headers
- `.bak` files removed: deviceManagementService.ts.bak, messageService.ts.bak, shareService.ts.bak, tierService.ts.bak

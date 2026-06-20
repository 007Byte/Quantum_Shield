/**
 * Zero-Trace Feature — Shared Types
 * @module features/zero-trace/domain/zero-trace.types
 */

import type { ForensicsFinding, CategoryStatus } from '@/services/security/forensics';
import type { GhostModeSettings } from '@/services/security/privacyModes';
import type { Feather } from '@expo/vector-icons';

// ── Scan Results ────────────────────────────────────────────────────

export interface ScanResults {
  count: number;
  artifacts: ForensicsFinding[];
  riskLevel: string;
  categoryStatuses: CategoryStatus[];
}

export interface OsScanResults {
  artifacts: string[];
  count: number;
}

export interface CleanupSummary {
  tiersAttempted: number;
  tiersCompleted: number;
  details: string[];
}

// ── Component Props ─────────────────────────────────────────────────

export type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

export interface ScanPanelProps {
  companionAvailable: boolean;
  cleaning: boolean;
  scanning: boolean;
  cleanupSummary: CleanupSummary | null;
  onFullCleanup: () => void;
  onDismissSummary: () => void;
  t: (key: string) => string | undefined;
}

export interface ArtifactListProps {
  appScanResults: ScanResults | null;
  osScanResults: OsScanResults | null;
  scanning: boolean;
  cleaning: boolean;
  onAppScan: () => void;
  onAppClean: () => void;
  onOsScan: () => void;
  onOsClean: () => void;
  t: (key: string) => string | undefined;
}

export interface CleanupTiersProps {
  companionAvailable: boolean;
  scanning: boolean;
  cleaning: boolean;
  settings: GhostModeSettings;
  appScanResults: ScanResults | null;
  osScanResults: OsScanResults | null;
  osCleaners: { label: string; icon: string }[];
  adminCleaners: string[];
  adminState: { elevating: boolean };
  onGhostModeToggle: () => void;
  onUpdateSetting: (key: keyof GhostModeSettings, value: boolean) => void;
  onAppScan: () => void;
  onAppClean: () => void;
  onOsScan: () => void;
  onOsClean: () => void;
  onAdminClean: () => void;
  t: (key: string) => string | undefined;
}

export interface GhostModePanelProps {
  settings: GhostModeSettings;
  onToggle: () => void;
  onUpdateSetting: (key: keyof GhostModeSettings, value: boolean) => void;
  t: (key: string) => string | undefined;
}

// Re-export upstream types for convenience
export type { ForensicsFinding, CategoryStatus, GhostModeSettings };

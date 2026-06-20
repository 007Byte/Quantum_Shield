/**
 * Zero-Trace Feature — State Machine Hook
 *
 * Owns ALL state and business logic for the zero-trace screen.
 * Components receive data exclusively through the returned object.
 *
 * @module features/zero-trace/hooks/useZeroTrace
 */

import { useState, useCallback, useEffect } from 'react';
import { logger } from '@/utils/logger';
import { forensicsService } from '@/services/security/forensics';
import { ghostModeService } from '@/services/security/privacyModes';
import type { GhostModeSettings } from '@/services/security/privacyModes';
import { usbService } from '@/services/usbService';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { useAdminElevation } from '@/hooks/useAdminElevation';
import { useInAppModal } from '@/components/common';
import { useLanguage } from '@/hooks/useLanguage';

import type { ScanResults, OsScanResults, CleanupSummary } from '../domain/zero-trace.types';
import {
  humanizeCategory,
  getPlatformKey,
  OS_CLEANERS,
  ADMIN_CLEANERS,
} from '../domain/zero-trace.data';

export function useZeroTrace() {
  const { t } = useLanguage();
  const { modal, showConfirm, showSuccess, showError } = useInAppModal();
  const admin = useAdminElevation();

  // ── State ──────────────────────────────────────────────────────────

  const [companionAvailable, setCompanionAvailable] = useState(false);
  const [settings, setSettings] = useState<GhostModeSettings>(
    ghostModeService.getGhostModeSettings()
  );
  const [appScanResults, setAppScanResults] = useState<ScanResults | null>(null);
  const [osScanResults, setOsScanResults] = useState<OsScanResults | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupSummary, setCleanupSummary] = useState<CleanupSummary | null>(null);

  // Volume paths from vault store
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const volumePaths: string[] = currentVault?.mountPoint ? [currentVault.mountPoint] : [];

  // Platform config
  const platformKey = getPlatformKey();
  const osCleaners = OS_CLEANERS[platformKey] ?? OS_CLEANERS.macos;
  const adminCleaners = ADMIN_CLEANERS[platformKey] ?? ADMIN_CLEANERS.macos;

  // ── Effects ────────────────────────────────────────────────────────

  useEffect(() => {
    usbService.isCompanionAvailable().then(setCompanionAvailable);
    setSettings(ghostModeService.getGhostModeSettings());
  }, []);

  // ── Settings Handlers ──────────────────────────────────────────────

  const updateSetting = useCallback((key: keyof GhostModeSettings, value: boolean) => {
    ghostModeService.updateGhostModeSettings({ [key]: value });
    setSettings(ghostModeService.getGhostModeSettings());
  }, []);

  const handleGhostModeToggle = useCallback(async () => {
    if (!settings.enabled) {
      showConfirm(
        t('zeroTrace.pageTitle') || 'Zero-Trace Mode',
        t('zeroTrace.enableConfirm') ||
          'Enable Ghost Mode? This activates clipboard auto-clean, metadata sanitization, memory scrubbing, and journal cleanup.',
        async () => {
          try {
            await ghostModeService.enableGhostMode();
            setSettings(ghostModeService.getGhostModeSettings());
          } catch (err) {
            logger.error('[ZeroTrace] Enable failed:', err);
          }
        }
      );
    } else {
      showConfirm(
        t('zeroTrace.pageTitle') || 'Zero-Trace Mode',
        t('zeroTrace.disableConfirm') ||
          'Disable Ghost Mode? Your digital footprints will no longer be automatically cleaned.',
        async () => {
          try {
            await ghostModeService.disableGhostMode();
            setSettings(ghostModeService.getGhostModeSettings());
          } catch (err) {
            logger.error('[ZeroTrace] Disable failed:', err);
          }
        }
      );
    }
  }, [settings.enabled, t, showConfirm]);

  // ── Scan / Clean Handlers ──────────────────────────────────────────

  const handleAppScan = useCallback(async () => {
    setScanning(true);
    try {
      const report = await forensicsService.scan();
      const categoryStatuses = forensicsService.getCategoryStatuses();
      setAppScanResults({
        count: report.findings.length,
        artifacts: report.findings.map((finding, idx) => ({
          id: `finding-${idx}`,
          severity: 'medium',
          description: finding,
          canRemediate: true,
        })),
        riskLevel: report.riskLevel,
        categoryStatuses,
      });
      if (report.findings.length === 0) {
        showSuccess(
          t('zeroTrace.pageTitle') || 'Zero-Trace Mode',
          t('zeroTrace.noTraces') || 'No forensic traces detected. System appears clean.'
        );
      }
    } catch (err) {
      logger.error('[ZeroTrace] App scan failed:', err);
      showError(
        t('zeroTrace.pageTitle') || 'Zero-Trace Mode',
        t('zeroTrace.scanFailed') || 'App trace scan failed. Please try again.'
      );
    } finally {
      setScanning(false);
    }
  }, [t, showSuccess, showError]);

  const handleAppClean = useCallback(() => {
    showConfirm(
      t('zeroTrace.cleanAppTitle') || 'Clean App Traces',
      t('zeroTrace.cleanAppConfirm') ||
        'This will clean all accessible app-level trace categories.',
      async () => {
        setCleaning(true);
        try {
          const result = await forensicsService.wipeTraces();
          const skippedCount = result.categoriesSkipped.length;
          let message = `Cleaned: ${result.categoriesCleaned.map(humanizeCategory).join(', ') || 'none'}.`;
          if (skippedCount > 0) {
            message += ` Skipped: ${result.categoriesSkipped.map(s => humanizeCategory(s.category)).join(', ')}.`;
          }
          if (result.errors.length > 0) {
            message += ` Errors: ${result.errors.length}.`;
          }
          showSuccess(t('zeroTrace.cleanAppTitle') || 'Clean App Traces', message);
          // Re-scan to show updated state
          const report = await forensicsService.scan();
          const categoryStatuses = forensicsService.getCategoryStatuses();
          setAppScanResults({
            count: report.findings.length,
            artifacts: report.findings.map((finding, idx) => ({
              id: `finding-${idx}`,
              severity: 'medium',
              description: finding,
              canRemediate: true,
            })),
            riskLevel: report.riskLevel,
            categoryStatuses,
          });
        } catch (err) {
          logger.error('[ZeroTrace] App clean failed:', err);
        } finally {
          setCleaning(false);
        }
      }
    );
  }, [showConfirm, showSuccess, t]);

  const handleOsScan = useCallback(async () => {
    setScanning(true);
    try {
      const artifacts = await usbService.scanArtifacts(volumePaths);
      setOsScanResults({
        artifacts: artifacts.map(a => a.description),
        count: artifacts.length,
      });
      if (artifacts.length === 0) {
        showSuccess(
          t('zeroTrace.osScanTitle') || 'OS Trace Scan',
          t('zeroTrace.noOsTraces') || 'No OS-level artifacts detected.'
        );
      }
    } catch (err) {
      logger.error('[ZeroTrace] OS scan failed:', err);
      showError(
        t('zeroTrace.osScanTitle') || 'OS Trace Scan',
        t('zeroTrace.osScanFailed') || 'OS trace scan failed. Is the companion running?'
      );
    } finally {
      setScanning(false);
    }
  }, [volumePaths, t, showSuccess, showError]);

  const handleOsClean = useCallback(() => {
    showConfirm(
      t('zeroTrace.osCleanTitle') || 'Clean OS Traces',
      t('zeroTrace.osCleanConfirm') ||
        'This will clean OS-level forensic artifacts via the USB Companion.',
      async () => {
        setCleaning(true);
        try {
          const result = await usbService.runZeroTrace(volumePaths);
          let msg = `Cleaned: ${result.cleaned > 0 ? result.cleaned : 'none'}.`;
          if (result.failed > 0) msg += `\n\nPartial errors (${result.failed})`;
          showSuccess(t('zeroTrace.osCleanTitle') || 'Clean OS Traces', msg);
          // Re-scan to show updated state
          const artifacts = await usbService.scanArtifacts(volumePaths);
          setOsScanResults({
            artifacts: artifacts.map(a => a.description),
            count: artifacts.length,
          });
        } catch (err) {
          logger.error('[ZeroTrace] OS clean failed:', err);
        } finally {
          setCleaning(false);
        }
      }
    );
  }, [showConfirm, showSuccess, volumePaths, t]);

  const handleAdminClean = useCallback(async () => {
    const needsAdmin = await admin.requestElevation();
    if (!needsAdmin) {
      setCleaning(true);
      try {
        const result = await usbService.runZeroTraceElevated(volumePaths);
        let msg = `Admin cleanup complete.\n\nCleaned: ${result.cleaned > 0 ? result.cleaned : 'none'}.`;
        if (result.failed > 0) msg += `\n\nPartial errors (${result.failed})`;
        showSuccess(t('zeroTrace.adminCleanTitle') || 'Admin Cleanup', msg);
      } catch (err) {
        logger.error('[ZeroTrace] Admin clean failed:', err);
      } finally {
        setCleaning(false);
      }
    }
  }, [admin, volumePaths, showSuccess, t]);

  const handleAdminSubmit = useCallback(() => {
    admin.submit(async () => {
      const result = await usbService.runZeroTraceElevated(volumePaths);
      let msg = `Admin cleanup complete.\n\nCleaned: ${result.cleaned > 0 ? result.cleaned : 'none'}.`;
      if (result.failed > 0) msg += `\n\nPartial errors (${result.failed})`;
      showSuccess(t('zeroTrace.adminCleanTitle') || 'Admin Cleanup', msg);
    });
  }, [admin, volumePaths, showSuccess, t]);

  // ── Full Cleanup Handler ───────────────────────────────────────────

  const handleFullCleanup = useCallback(async () => {
    setCleaning(true);
    setCleanupSummary(null);
    const details: string[] = [];
    let tiersCompleted = 0;
    let tiersAttempted = 1;

    // Tier 1: App-level (always)
    try {
      const result = await forensicsService.wipeTraces();
      details.push(`App: ${result.categoriesCleaned.length} categories cleaned`);
      tiersCompleted++;
    } catch (err) {
      details.push(`App: failed - ${err instanceof Error ? err.message : 'Unknown error'}`);
      logger.error('[ZeroTrace] Full cleanup Tier 1 failed:', err);
    }

    // Tier 2: OS-level (if companion available)
    if (companionAvailable) {
      tiersAttempted++;
      try {
        const result = await usbService.runZeroTrace(volumePaths);
        details.push(`OS: ${result.cleaned} artifacts cleaned`);
        tiersCompleted++;
      } catch (err) {
        details.push(`OS: failed - ${err instanceof Error ? err.message : 'Unknown error'}`);
        logger.error('[ZeroTrace] Full cleanup Tier 2 failed:', err);
      }
    }

    // Tier 3: Admin-level (if companion available, prompt for admin)
    if (companionAvailable) {
      tiersAttempted++;
      try {
        const needsAdmin = await admin.requestElevation();
        if (needsAdmin) {
          details.push('Admin: awaiting password (see modal)');
        } else {
          const result = await usbService.runZeroTraceElevated(volumePaths);
          details.push(`Admin: ${result.cleaned} artifacts cleaned`);
          tiersCompleted++;
        }
      } catch (err) {
        details.push(`Admin: failed - ${err instanceof Error ? err.message : 'Unknown error'}`);
        logger.error('[ZeroTrace] Full cleanup Tier 3 failed:', err);
      }
    }

    setAppScanResults(null);
    setOsScanResults(null);
    setCleanupSummary({ tiersAttempted, tiersCompleted, details });
    setCleaning(false);
  }, [companionAvailable, volumePaths, admin]);

  const dismissCleanupSummary = useCallback(() => setCleanupSummary(null), []);

  // ── Return ─────────────────────────────────────────────────────────

  return {
    // Translation
    t,

    // Modal
    modal,

    // State
    companionAvailable,
    settings,
    appScanResults,
    osScanResults,
    scanning,
    cleaning,
    cleanupSummary,

    // Platform config
    osCleaners,
    adminCleaners,

    // Admin elevation
    admin,

    // Actions
    updateSetting,
    handleGhostModeToggle,
    handleAppScan,
    handleAppClean,
    handleOsScan,
    handleOsClean,
    handleAdminClean,
    handleAdminSubmit,
    handleFullCleanup,
    dismissCleanupSummary,
  };
}

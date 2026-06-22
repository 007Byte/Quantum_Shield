/**
 * State machine hook for the setup-usb wizard.
 * Owns ALL mutable state and business logic; components are pure renderers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'expo-router';
import { useInAppModal } from '@/components/common';
import { useAdminElevation } from '@/hooks/useAdminElevation';
import { useLanguage } from '@/hooks/useLanguage';
import { usbService, USBDrive } from '@/services/usbService';
import { CipherId } from '@/crypto/bridge';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { logger } from '@/utils/logger';
import { validatePassword } from '@/utils/passwordPolicy';

import type {
  SetupState,
  FileSystemId,
  PasswordStrength,
  CompanionStatus,
} from '../domain/setup-usb.types';
import { INITIAL_STATE, FILE_SYSTEMS, ALGORITHMS } from '../domain/setup-usb.data';

// ── Password strength helper ─────────────────────────────────────────────
// Password strength indicator colors — semantic (green/amber/red)
function getStrength(password: string, t: (key: string) => string): PasswordStrength {
  if (!password) return { strength: 0, label: t('setupUsb.enterPassword'), color: '#4B5563' };
  try {
    const result = validatePassword(password, {});
    const pct = Math.round((result.score / 5) * 100);
    const level = result.level;
    const label =
      level === 'weak'
        ? t('setupUsb.weak')
        : level === 'fair'
          ? t('setupUsb.fair')
          : level === 'good'
            ? t('setupUsb.good')
            : t('setupUsb.strong');
    const color =
      level === 'weak'
        ? '#EF4444'
        : level === 'fair'
          ? '#F59E0B'
          : level === 'good'
            ? '#3B82F6'
            : '#10B981';
    return { strength: pct, label, color };
  } catch {
    let s = 0;
    if (password.length >= 8) s += 20;
    if (password.length >= 12) s += 20;
    if (password.length >= 16) s += 20;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s += 20;
    if (/[0-9]/.test(password)) s += 10;
    if (/[^A-Za-z0-9]/.test(password)) s += 10;
    const label =
      s < 40
        ? t('setupUsb.weak')
        : s < 60
          ? t('setupUsb.fair')
          : s < 80
            ? t('setupUsb.good')
            : t('setupUsb.strong');
    const color = s < 40 ? '#EF4444' : s < 60 ? '#F59E0B' : s < 80 ? '#3B82F6' : '#10B981';
    return { strength: s, label, color };
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────
export function useSetupWizard() {
  const { t } = useLanguage();
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();
  const admin = useAdminElevation();

  // ── Drive state ──────────────────────────────────────────────────────
  const [drives, setDrives] = useState<USBDrive[]>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus>('checking');
  const [companionVersionMismatch, setCompanionVersionMismatch] = useState<boolean>(false);
  const [companionVersionStr, setCompanionVersionStr] = useState<string | null>(null);

  // ── Wizard state ─────────────────────────────────────────────────────
  const [state, setState] = useState<SetupState>({ ...INITIAL_STATE });
  const [provisioning, setProvisioning] = useState(false);
  const [showPlatformFS, setShowPlatformFS] = useState(false);

  // ── Resilient drive loading with companion health pre-check ─────────
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  const loadDrives = useCallback(async () => {
    setLoadingDrives(true);
    setDriveError(null);

    // Step 1: Check if the companion service is reachable
    const companionUp = await usbService.isCompanionAvailable();

    if (!isMountedRef.current) return;

    if (!companionUp) {
      setCompanionStatus('disconnected');
      setDriveError(null); // Don't show a generic error — the UI handles disconnected state
      setDrives([]);
      setLoadingDrives(false);
      return;
    }

    setCompanionStatus('connected');

    // Step 2: Enumerate drives (companion is confirmed reachable)
    try {
      const list = await usbService.listDrives();
      if (!isMountedRef.current) return;
      setDrives(list);
      setDriveError(null);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg = err instanceof Error ? err.message : t('setupUsb.failedDetect');
      // Classify: if the error looks like a connection issue, mark companion as down
      const isConnectionError =
        msg.toLowerCase().includes('network error') ||
        msg.toLowerCase().includes('econnrefused') ||
        msg.toLowerCase().includes('unavailable') ||
        msg.toLowerCase().includes('timeout');
      if (isConnectionError) {
        setCompanionStatus('disconnected');
        setDriveError(null);
      } else {
        setDriveError(msg);
      }
    } finally {
      if (isMountedRef.current) setLoadingDrives(false);
    }
  }, [t]);

  // Initial load
  useEffect(() => {
    loadDrives();
  }, [loadDrives]);

  // Auto-retry polling: when companion is disconnected, keep retrying every 4s
  useEffect(() => {
    if (companionStatus !== 'disconnected') {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      return;
    }

    retryTimerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadDrives();
    }, 4000);

    return () => {
      if (retryTimerRef.current) {
        clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [companionStatus, loadDrives]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Resolve companion version info when connected ──────────────────
  useEffect(() => {
    if (companionStatus !== 'connected') {
      setCompanionVersionMismatch(false);
      setCompanionVersionStr(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const [mismatch, version] = await Promise.all([
          usbService.isApiVersionMismatch(),
          usbService.companionVersion().catch(() => null),
        ]);
        if (!cancelled && isMountedRef.current) {
          setCompanionVersionMismatch(mismatch);
          setCompanionVersionStr(version);
        }
      } catch {
        // Non-fatal — version info is advisory
        if (!cancelled && isMountedRef.current) {
          setCompanionVersionMismatch(false);
          setCompanionVersionStr(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companionStatus]);

  // ── Reset state on tab navigation ────────────────────────────────────
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname === '/setup-usb' && prevPathnameRef.current !== pathname) {
      setState({ ...INITIAL_STATE });
      admin.cancel();
      setProvisioning(false);
      loadDrives();
    }
    prevPathnameRef.current = pathname;
  }, [pathname, loadDrives]);

  // ── Field setters ────────────────────────────────────────────────────
  const setField = useCallback(<K extends keyof SetupState>(key: K, value: SetupState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const selectDrive = useCallback((id: string) => setField('selectedDriveId', id), [setField]);
  const setVaultName = useCallback((v: string) => setField('vaultName', v), [setField]);
  const setPartitionName = useCallback((v: string) => setField('partitionName', v), [setField]);
  const setFormatType = useCallback((v: 'quick' | 'full') => setField('formatType', v), [setField]);
  const setFileSystem = useCallback((v: FileSystemId) => setField('fileSystem', v), [setField]);
  const setAlgorithm = useCallback((v: string) => setField('algorithm', v), [setField]);
  const setPassword = useCallback((v: string) => setField('password', v), [setField]);
  const setPasswordConfirm = useCallback((v: string) => setField('passwordConfirm', v), [setField]);
  const toggleShowPassword = useCallback(
    () => setState(prev => ({ ...prev, showPassword: !prev.showPassword })),
    []
  );
  const toggleShowPasswordConfirm = useCallback(
    () => setState(prev => ({ ...prev, showPasswordConfirm: !prev.showPasswordConfirm })),
    []
  );
  const togglePlatformFS = useCallback(() => setShowPlatformFS(prev => !prev), []);

  // ── Navigation ───────────────────────────────────────────────────────
  const handleNext = useCallback(() => {
    if (state.currentStep === 0 && !state.selectedDriveId) {
      showError(t('setupUsb.selectionRequired'), t('setupUsb.selectDriveContinue'));
      return;
    }
    if (state.currentStep === 2) {
      if (!state.password) {
        showError(t('setupUsb.passwordRequired'), t('setupUsb.enterMasterPassword'));
        return;
      }
      if (state.password !== state.passwordConfirm) {
        showError(t('setupUsb.passwordsNoMatch'), t('setupUsb.passwordsNoMatchDesc'));
        return;
      }
      if (state.password.length < 8) {
        showError(t('setupUsb.passwordTooShort'), t('setupUsb.passwordTooShortDesc'));
        return;
      }
    }
    setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
  }, [
    state.currentStep,
    state.selectedDriveId,
    state.password,
    state.passwordConfirm,
    showError,
    t,
  ]);

  const handleBack = useCallback(() => {
    setState(prev => {
      const nextStep = Math.max(0, prev.currentStep - 1);
      if (prev.currentStep === 2 && nextStep < 2) {
        return {
          ...prev,
          currentStep: nextStep,
          password: '',
          passwordConfirm: '',
          showPassword: false,
          showPasswordConfirm: false,
        };
      }
      return { ...prev, currentStep: nextStep };
    });
  }, []);

  // ── Provisioning ─────────────────────────────────────────────────────
  const doProvision = useCallback(
    async (overrideAdminPassword?: string) => {
      setProvisioning(true);
      try {
        const validFileSystems: Record<FileSystemId, 'exfat' | 'ntfs' | 'ext4' | 'apfs'> = {
          exfat: 'exfat',
          ntfs: 'ntfs',
          ext4: 'ext4',
          apfs: 'apfs',
        };
        const fsValue = validFileSystems[state.fileSystem];
        const provisionFileSystem: 'exfat' | 'ntfs' | 'ext4' =
          fsValue === 'apfs' ? 'exfat' : (fsValue as 'exfat' | 'ntfs' | 'ext4');

        const result = await usbService.provisionVault({
          driveId: state.selectedDriveId!,
          formatType: state.formatType,
          fileSystem: provisionFileSystem,
          masterPassword: state.password,
          vaultName: state.vaultName || undefined,
          partitionName: state.partitionName || undefined,
          cipherAlgorithm: state.algorithm,
          adminPassword: overrideAdminPassword,
        });

        admin.cancel();

        // Write real crypto header via vaultOrchestrator (single source of truth)
        if (result.secureMountPoint && state.password) {
          try {
            const cipherMap: Record<string, CipherId> = {
              'AES-256-GCM-SIV': CipherId.Aes256GcmSiv,
              'XChaCha20-Poly1305': CipherId.XChaCha20Poly1305,
            };
            const selectedCipher = cipherMap[state.algorithm] || CipherId.Aes256GcmSiv;

            await vaultOrchestrator.provision(
              result.secureMountPoint,
              state.password,
              selectedCipher
            );
          } catch (cryptoErr) {
            const cryptoMsg = cryptoErr instanceof Error ? cryptoErr.message : String(cryptoErr);
            logger.error('[SetupUSB] VAULT.bin crypto init FAILED — vault is NOT encrypted!', {
              error: cryptoMsg,
            });
            throw new Error(
              `Vault formatted but crypto initialization failed: ${cryptoMsg}. ` +
                'Please try again. The USB drive may need to be reformatted.'
            );
          }

          // Unmount SECURE partition after crypto init
          try {
            await usbService.unmountSecure(state.selectedDriveId!);
          } catch (_unmountErr) {
            // Non-fatal
          }
        }

        // Show recovery phrase
        const phraseText = result.recoveryPhrase
          ? result.recoveryPhrase.map((w: string, i: number) => `${i + 1}. ${w}`).join('\n')
          : '';
        const successMsg = phraseText
          ? `Vault initialized successfully!\n\nRecovery Phrase (write this down — shown only once):\n\n${phraseText}\n\nSecure partition: ${result.secureMountPoint ?? 'mounted'}`
          : t('setupUsb.initSuccess');

        showSuccess(t('setupUsb.initializeVault'), successMsg);
        setState({ ...INITIAL_STATE });
        loadDrives();
      } catch (err: unknown) {
        if (admin.handleError(err)) return;
        admin.cancel();

        const errObj = err as Error & { code?: string };
        const msg = errObj.message || t('setupUsb.initFailed');
        showError(t('setupUsb.initFailed'), msg);
      } finally {
        setProvisioning(false);
      }
    },
    [state, admin, loadDrives, showSuccess, showError, t]
  );

  const handleInitializeVault = useCallback(() => {
    showConfirm(t('setupUsb.initializeVault'), t('setupUsb.warning'), async () => {
      const needsAdmin = await admin.requestElevation();
      if (needsAdmin) return;
      doProvision();
    });
  }, [showConfirm, t, admin, doProvision]);

  // ── Derived values ───────────────────────────────────────────────────
  const steps = [
    'setupUsb.detectUsb',
    'setupUsb.formatOptions',
    'setupUsb.setMasterPassword',
    'setupUsb.initialize',
  ].map(key => t(key));
  const selectedDrive = drives.find(d => d.id === state.selectedDriveId);
  const strength = getStrength(state.password, t);
  const passwordsMatch = !!(state.password && state.password === state.passwordConfirm);
  const selectedAlgo = ALGORITHMS.find(a => a.id === state.algorithm) ?? ALGORITHMS[0];
  const universalFS = FILE_SYSTEMS.filter(f => f.category === 'universal');
  const platformFS = FILE_SYSTEMS.filter(f => f.category === 'platform');

  return {
    // Translation
    t,

    // Modal
    modal,

    // Admin elevation
    admin,

    // Drive state
    drives,
    loadingDrives,
    driveError,
    companionStatus,
    companionVersionMismatch,
    companionVersion: companionVersionStr,
    loadDrives,

    // Wizard state
    state,
    provisioning,
    showPlatformFS,

    // Field setters
    selectDrive,
    setVaultName,
    setPartitionName,
    setFormatType,
    setFileSystem,
    setAlgorithm,
    setPassword,
    setPasswordConfirm,
    toggleShowPassword,
    toggleShowPasswordConfirm,
    togglePlatformFS,

    // Navigation
    handleNext,
    handleBack,
    handleInitializeVault,
    doProvision,

    // Derived
    steps,
    selectedDrive,
    strength,
    passwordsMatch,
    selectedAlgo,
    universalFS,
    platformFS,
  };
}

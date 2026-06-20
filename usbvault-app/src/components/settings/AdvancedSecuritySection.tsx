import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { vaultCompactionService } from '@/services/vault/compaction';
import { webOnly } from '@/utils/webStyle';
import { useLanguage } from '@/hooks/useLanguage';
import { formatFileSize } from '@/utils/fileHelpers';
import { logger } from '@/utils/logger';

export function AdvancedSecuritySection() {
  const { t } = useLanguage();
  const [ghostMode, setGhostMode] = useState(false);
  const [selfDestruct, setSelfDestruct] = useState(false);
  const [selfDestructAttempts, setSelfDestructAttempts] = useState(10);
  const [keyProvider, setKeyProvider] = useState<'software' | 'hardware' | 'hybrid'>('software');
  const [autoBackup, setAutoBackup] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const { modal, showAlert, showConfirm, dismiss } = useInAppModal();

  useEffect(() => {
    const s = settingsService.load();
    setGhostMode(s.ghostModeEnabled);
    setSelfDestruct(s.selfDestructEnabled);
    setSelfDestructAttempts(s.selfDestructAttempts);
    setKeyProvider(s.keyProvider);
    setAutoBackup(s.autoBackupEnabled);
    setBackupFrequency(s.backupFrequency);
  }, []);

  const handleGhostModeToggle = () => {
    const newVal = !ghostMode;
    if (newVal) {
      showConfirm(
        t('advancedSecurity.enableGhostMode'),
        t('advancedSecurity.ghostModeDescription'),
        () => {
          setGhostMode(true);
          settingsService.set('ghostModeEnabled', true);
          auditService.log('settings_change', 'ghost_mode', { enabled: true }).catch(() => {});
          dismiss();
        },
        t('advancedSecurity.enable')
      );
    } else {
      setGhostMode(false);
      settingsService.set('ghostModeEnabled', false);
      auditService.log('settings_change', 'ghost_mode', { enabled: false }).catch(() => {});
    }
  };

  const handleSelfDestructToggle = () => {
    const newVal = !selfDestruct;
    if (newVal) {
      showConfirm(
        t('advancedSecurity.enableSelfDestruct'),
        t('advancedSecurity.selfDestructDescription', { attempts: selfDestructAttempts }),
        () => {
          setSelfDestruct(true);
          settingsService.set('selfDestructEnabled', true);
          auditService
            .log('settings_change', 'self_destruct', {
              enabled: true,
              attempts: selfDestructAttempts,
            })
            .catch(() => {});
          dismiss();
        },
        t('advancedSecurity.enableSelfDestruct')
      );
    } else {
      setSelfDestruct(false);
      settingsService.set('selfDestructEnabled', false);
      auditService.log('settings_change', 'self_destruct', { enabled: false }).catch(() => {});
    }
  };

  const handleSelfDestructAttemptsChange = () => {
    const options = ['3', '5', '10', '15'];
    showAlert(
      t('advancedSecurity.failedAttemptsTitle'),
      t('advancedSecurity.failedAttemptsDescription'),
      [
        ...options.map(opt => ({
          text: opt,
          onPress: () => {
            const num = parseInt(opt, 10);
            setSelfDestructAttempts(num);
            settingsService.set('selfDestructAttempts', num);
            dismiss();
          },
        })),
        { text: t('common.cancel'), onPress: () => dismiss(), style: 'cancel' as const },
      ]
    );
  };

  const handleKeyProviderChange = () => {
    const options: Array<{ label: string; value: 'software' | 'hardware' | 'hybrid' }> = [
      { label: t('advancedSecurity.keySoftware'), value: 'software' },
      { label: t('advancedSecurity.keyHardware'), value: 'hardware' },
      { label: t('advancedSecurity.keyHybrid'), value: 'hybrid' },
    ];
    showAlert(t('advancedSecurity.keyProvider'), t('advancedSecurity.keyProviderDescription'), [
      ...options.map(opt => ({
        text: opt.label,
        onPress: () => {
          setKeyProvider(opt.value);
          settingsService.set('keyProvider', opt.value);
          auditService.log('settings_change', 'key_provider', { value: opt.value }).catch(() => {});
          dismiss();
        },
      })),
      { text: t('common.cancel'), onPress: () => dismiss(), style: 'cancel' as const },
    ]);
  };

  const handleBackupToggle = () => {
    const newVal = !autoBackup;
    setAutoBackup(newVal);
    settingsService.set('autoBackupEnabled', newVal);
    auditService.log('settings_change', 'auto_backup', { enabled: newVal }).catch(() => {});
  };

  const handleBackupFrequencyChange = () => {
    const options: Array<{ label: string; value: 'daily' | 'weekly' | 'monthly' }> = [
      { label: t('advancedSecurity.daily'), value: 'daily' },
      { label: t('advancedSecurity.weekly'), value: 'weekly' },
      { label: t('advancedSecurity.monthly'), value: 'monthly' },
    ];
    showAlert(
      t('advancedSecurity.backupFrequency'),
      t('advancedSecurity.backupFrequencyDescription'),
      [
        ...options.map(opt => ({
          text: opt.label,
          onPress: () => {
            setBackupFrequency(opt.value);
            settingsService.set('backupFrequency', opt.value);
            dismiss();
          },
        })),
        { text: t('common.cancel'), onPress: () => dismiss(), style: 'cancel' as const },
      ]
    );
  };

  const handleExportBackup = () => {
    // Simulate backup export
    const backupData = {
      version: '3.0',
      timestamp: new Date().toISOString(),
      encrypted: true,
      pqc: true,
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usbvault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    settingsService.set('lastBackupAt', new Date().toISOString());
    auditService.log('settings_change', 'backup_export').catch(() => {});
    showAlert(t('advancedSecurity.backupExported'), t('advancedSecurity.backupExportedMessage'));
  };

  const handleVaultCompaction = () => {
    showConfirm(
      t('advancedSecurity.compactVault'),
      t('advancedSecurity.compactVaultDescription'),
      async () => {
        try {
          // FIX: Actually perform compaction instead of no-op.
          // Use orchestrator for USB vaults (VAULT.bin), localStorage service for local vaults.
          if (vaultOrchestrator.isUnlocked()) {
            const result = await vaultOrchestrator.compactVault();
            logger.info('[Settings] USB vault compaction completed', result);
            showAlert(
              t('advancedSecurity.compactionComplete'),
              `Reclaimed ${formatFileSize(result.spaceSaved)} (${formatFileSize(result.oldSize)} → ${formatFileSize(result.newSize)})`
            );
          } else {
            // Local vault: use localStorage compaction service
            const result = await vaultCompactionService.compact();
            logger.info('[Settings] Local vault compaction completed', result);
            showAlert(
              t('advancedSecurity.compactionComplete'),
              t('advancedSecurity.compactionCompleteMessage')
            );
          }
          auditService.log('settings_change', 'vault_compaction').catch(() => {});
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          logger.error('[Settings] Vault compaction failed', { error: msg });
          showAlert('Compaction Failed', msg);
        }
      },
      t('advancedSecurity.compactNow')
    );
  };

  const providerLabel =
    keyProvider === 'software'
      ? t('advancedSecurity.keySoftwareShort')
      : keyProvider === 'hardware'
        ? t('advancedSecurity.keyHardwareShort')
        : t('advancedSecurity.keyHybridShort');

  return (
    <>
      <InAppModal config={modal} />

      {/* Ghost Mode & Self-Destruct */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="eye-off" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('advancedSecurity.advancedProtection')}
          </Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('advancedSecurity.ghostMode')}</Text>
            <Text style={styles.settingMeta}>{t('advancedSecurity.ghostModeMeta')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, ghostMode && styles.toggleOn]}
            onPress={handleGhostModeToggle}
          >
            <View style={styles.toggleCircle} />
          </TouchableOpacity>
        </View>

        {ghostMode && (
          <View style={local.statusRow}>
            <View style={local.statusDot} />
            <Text style={local.statusText}>{t('advancedSecurity.ghostModeActive')}</Text>
          </View>
        )}

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('advancedSecurity.selfDestruct')}</Text>
            <Text style={styles.settingMeta}>{t('advancedSecurity.selfDestructMeta')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, selfDestruct && local.toggleDestructive]}
            onPress={handleSelfDestructToggle}
          >
            <View style={styles.toggleCircle} />
          </TouchableOpacity>
        </View>

        {selfDestruct && (
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              styles.settingRow,
              state.hovered && { backgroundColor: 'rgba(239,68,68,0.06)' },
            ]}
            onPress={handleSelfDestructAttemptsChange}
          >
            <Text style={styles.settingLabel}>{t('advancedSecurity.failedAttemptsTitle')}</Text>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
              onPress={handleSelfDestructAttemptsChange}
            >
              <Text style={styles.selectText}>{selfDestructAttempts}</Text>
              <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
            </Pressable>
          </Pressable>
        )}
      </View>

      {/* Key Provider */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="cpu" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('advancedSecurity.keyManagement')}
          </Text>
        </View>

        <Pressable
          style={styles.settingRow}
          onPress={handleKeyProviderChange}
          accessibilityRole="button"
        >
          <View>
            <Text style={styles.settingLabel}>{t('advancedSecurity.keyProvider')}</Text>
            <Text style={styles.settingMeta}>{t('advancedSecurity.keyProviderMeta')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
            onPress={handleKeyProviderChange}
          >
            <Text style={styles.selectText}>{providerLabel}</Text>
            <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
          </Pressable>
        </Pressable>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('advancedSecurity.pqcTitle')}</Text>
            <Text style={styles.settingMeta}>{t('advancedSecurity.pqcAlgorithms')}</Text>
          </View>
          <View style={styles.enabledBadge}>
            <Feather name="check" size={14} color={dashboardColors.green} />
            <Text style={styles.enabledText}>{t('advancedSecurity.active')}</Text>
          </View>
        </View>
      </View>

      {/* Backup & Restore */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="hard-drive" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('advancedSecurity.backupMaintenance')}
          </Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('advancedSecurity.autoBackup')}</Text>
            <Text style={styles.settingMeta}>{t('advancedSecurity.autoBackupMeta')}</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, autoBackup && styles.toggleOn]}
            onPress={handleBackupToggle}
          >
            <View style={styles.toggleCircle} />
          </TouchableOpacity>
        </View>

        {autoBackup && (
          <Pressable
            style={styles.settingRow}
            onPress={handleBackupFrequencyChange}
            accessibilityRole="button"
          >
            <Text style={styles.settingLabel}>{t('advancedSecurity.backupFrequency')}</Text>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
              onPress={handleBackupFrequencyChange}
            >
              <Text style={styles.selectText}>
                {backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)}
              </Text>
              <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
            </Pressable>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleExportBackup}
        >
          <Feather name="download" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>{t('advancedSecurity.exportBackup')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleVaultCompaction}
        >
          <Feather name="minimize-2" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>{t('advancedSecurity.compactVaultStorage')}</Text>
        </Pressable>
      </View>
    </>
  );
}

const local = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderRadius: 8,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22D3EE',
    ...webOnly({ boxShadow: '0 0 8px rgba(34,211,238,0.8)' }),
  },
  statusText: {
    fontSize: 12,
    color: 'rgba(34,211,238,0.9)',
    fontWeight: '500',
  },
  toggleDestructive: {
    backgroundColor: '#EF4444',
    justifyContent: 'flex-end',
  },
});

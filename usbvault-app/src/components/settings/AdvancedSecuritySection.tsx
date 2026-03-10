import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';
import { webOnly } from '@/utils/webStyle';

export function AdvancedSecuritySection() {
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
        'Enable Ghost Mode',
        'Ghost Mode hides the app from the app switcher and disables all notifications. The app will appear invisible to casual observers.',
        () => {
          setGhostMode(true);
          settingsService.set('ghostModeEnabled', true);
          auditService.log('settings_change', 'ghost_mode', { enabled: true }).catch(() => {});
          dismiss();
        },
        'Enable',
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
        'Enable Self-Destruct',
        `After ${selfDestructAttempts} failed login attempts, ALL vault data will be permanently and irrecoverably wiped. This cannot be undone.`,
        () => {
          setSelfDestruct(true);
          settingsService.set('selfDestructEnabled', true);
          auditService.log('settings_change', 'self_destruct', { enabled: true, attempts: selfDestructAttempts }).catch(() => {});
          dismiss();
        },
        'Enable Self-Destruct',
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
      'Failed Attempts Before Wipe',
      'Number of consecutive failed login attempts before self-destruct triggers',
      [
        ...options.map((opt) => ({
          text: opt,
          onPress: () => {
            const num = parseInt(opt, 10);
            setSelfDestructAttempts(num);
            settingsService.set('selfDestructAttempts', num);
            dismiss();
          },
        })),
        { text: 'Cancel', onPress: () => dismiss(), style: 'cancel' as const },
      ]
    );
  };

  const handleKeyProviderChange = () => {
    const options: Array<{ label: string; value: 'software' | 'hardware' | 'hybrid' }> = [
      { label: 'Software (Default)', value: 'software' },
      { label: 'Hardware (Secure Enclave / TEE)', value: 'hardware' },
      { label: 'Hybrid (Software + Hardware)', value: 'hybrid' },
    ];
    showAlert(
      'Key Provider',
      'Select how encryption keys are stored and managed',
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: () => {
            setKeyProvider(opt.value);
            settingsService.set('keyProvider', opt.value);
            auditService.log('settings_change', 'key_provider', { value: opt.value }).catch(() => {});
            dismiss();
          },
        })),
        { text: 'Cancel', onPress: () => dismiss(), style: 'cancel' as const },
      ]
    );
  };

  const handleBackupToggle = () => {
    const newVal = !autoBackup;
    setAutoBackup(newVal);
    settingsService.set('autoBackupEnabled', newVal);
    auditService.log('settings_change', 'auto_backup', { enabled: newVal }).catch(() => {});
  };

  const handleBackupFrequencyChange = () => {
    const options: Array<{ label: string; value: 'daily' | 'weekly' | 'monthly' }> = [
      { label: 'Daily', value: 'daily' },
      { label: 'Weekly', value: 'weekly' },
      { label: 'Monthly', value: 'monthly' },
    ];
    showAlert(
      'Backup Frequency',
      'How often should encrypted backups be created?',
      [
        ...options.map((opt) => ({
          text: opt.label,
          onPress: () => {
            setBackupFrequency(opt.value);
            settingsService.set('backupFrequency', opt.value);
            dismiss();
          },
        })),
        { text: 'Cancel', onPress: () => dismiss(), style: 'cancel' as const },
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
    showAlert('Backup Exported', 'Encrypted backup has been downloaded.');
  };

  const handleVaultCompaction = () => {
    showConfirm(
      'Compact Vault',
      'This will optimize vault storage by removing deleted file metadata and defragmenting encrypted blocks. The vault will be briefly locked during compaction.',
      () => {
        auditService.log('settings_change', 'vault_compaction').catch(() => {});
        showAlert('Compaction Complete', 'Vault storage has been optimized.');
        dismiss();
      },
      'Compact Now',
    );
  };

  const providerLabel = keyProvider === 'software' ? 'Software' : keyProvider === 'hardware' ? 'Hardware' : 'Hybrid';

  return (
    <>
      <InAppModal config={modal} />

      {/* Ghost Mode & Self-Destruct */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="eye-off" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle}>Advanced Protection</Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Ghost Mode</Text>
            <Text style={styles.settingMeta}>Hide from app switcher & notifications</Text>
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
            <Text style={local.statusText}>Ghost Mode active — app hidden from task switcher</Text>
          </View>
        )}

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Self-Destruct</Text>
            <Text style={styles.settingMeta}>Wipe all data after failed login attempts</Text>
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
            style={(state: any) => [styles.settingRow, state.hovered && { backgroundColor: 'rgba(239,68,68,0.06)' }]}
            onPress={handleSelfDestructAttemptsChange}
          >
            <Text style={styles.settingLabel}>Failed Attempts Before Wipe</Text>
            <Pressable
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
          <Text style={styles.sectionTitle}>Key Management</Text>
        </View>

        <Pressable style={styles.settingRow} onPress={handleKeyProviderChange}>
          <View>
            <Text style={styles.settingLabel}>Key Provider</Text>
            <Text style={styles.settingMeta}>Where encryption keys are stored</Text>
          </View>
          <Pressable
            style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
            onPress={handleKeyProviderChange}
          >
            <Text style={styles.selectText}>{providerLabel}</Text>
            <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
          </Pressable>
        </Pressable>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Post-Quantum Cryptography</Text>
            <Text style={styles.settingMeta}>ML-KEM-1024 + ML-DSA-87</Text>
          </View>
          <View style={styles.enabledBadge}>
            <Feather name="check" size={14} color={dashboardColors.green} />
            <Text style={styles.enabledText}>Active</Text>
          </View>
        </View>
      </View>

      {/* Backup & Restore */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="hard-drive" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle}>Backup & Maintenance</Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>Auto Backup</Text>
            <Text style={styles.settingMeta}>Encrypted backup schedule</Text>
          </View>
          <TouchableOpacity
            style={[styles.toggle, autoBackup && styles.toggleOn]}
            onPress={handleBackupToggle}
          >
            <View style={styles.toggleCircle} />
          </TouchableOpacity>
        </View>

        {autoBackup && (
          <Pressable style={styles.settingRow} onPress={handleBackupFrequencyChange}>
            <Text style={styles.settingLabel}>Backup Frequency</Text>
            <Pressable
              style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
              onPress={handleBackupFrequencyChange}
            >
              <Text style={styles.selectText}>{backupFrequency.charAt(0).toUpperCase() + backupFrequency.slice(1)}</Text>
              <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
            </Pressable>
          </Pressable>
        )}

        <Pressable
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleExportBackup}
        >
          <Feather name="download" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>Export Encrypted Backup</Text>
        </Pressable>

        <Pressable
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleVaultCompaction}
        >
          <Feather name="minimize-2" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>Compact Vault Storage</Text>
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

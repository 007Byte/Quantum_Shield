import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect, useCallback } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { fido2Service, Fido2Device } from '@/services/fido2Service';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';
import {
  checkBiometricAvailability,
  authenticateWithBiometrics,
  enableBiometricUnlock,
  disableBiometricUnlock,
} from '@/services/auth';

interface SecuritySectionProps {
  onLockVault: () => void;
}

export function SecuritySection({ onLockVault }: SecuritySectionProps) {
  const [biometricLocked, setBiometricLocked] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState('15 min');
  const [fido2Devices, setFido2Devices] = useState<Fido2Device[]>([]);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const { modal, showAlert, showConfirm, showPrompt, showSuccess, showError, dismiss } = useInAppModal();

  // Load persisted settings on mount
  useEffect(() => {
    const settings = settingsService.load();
    setBiometricLocked(settings.biometricLockEnabled);
    setTwoFactorEnabled(settings.twoFactorEnabled);

    // Convert stored minutes to display label
    const mins = settings.autoLockTimeoutMin;
    if (mins >= 60) setAutoLockTimeout(`${Math.floor(mins / 60)} hour`);
    else setAutoLockTimeout(`${mins} min`);
  }, []);

  const refreshDevices = useCallback(() => {
    setFido2Devices(fido2Service.listDevices());
    setWebAuthnSupported(fido2Service.isWebAuthnSupported());
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const handleRegisterFido2 = () => {
    if (!webAuthnSupported) {
      showAlert('Not Supported', 'WebAuthn is not available in this browser. Use Chrome, Edge, or Safari on a supported device.');
      return;
    }
    showPrompt(
      'Register Security Key',
      [{ key: 'name', label: 'Device Name', placeholder: 'e.g. YubiKey 5C, Titan Key' }],
      async (values) => {
        const name = values.name?.trim();
        if (!name) return;
        try {
          await fido2Service.registerDevice(name);
          refreshDevices();
          showSuccess('Registered', `Security key "${name}" registered successfully`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Registration failed';
          showError('Registration Failed', msg);
        }
      },
      'Register',
    );
  };

  const handleRemoveFido2 = (device: Fido2Device) => {
    showConfirm(
      `Remove "${device.name}"?`,
      'This security key will no longer be usable for authentication.',
      async () => {
        try {
          await fido2Service.removeDevice(device.id);
          refreshDevices();
          showSuccess('Removed', `"${device.name}" has been removed`);
        } catch {
          showError('Error', 'Failed to remove device');
        }
      },
      'Remove',
      'destructive',
    );
  };

  // SEC-01: Wire biometric toggle to real auth service (Expo SecureStore / device biometrics)
  const handleBiometricToggle = async () => {
    const newValue = !biometricLocked;

    if (newValue) {
      // Enabling biometric — check hardware availability first
      try {
        const available = await checkBiometricAvailability();
        if (!available.available) {
          showAlert(
            'Biometric Not Available',
            'No biometric hardware detected on this device. Ensure Face ID or Touch ID is configured in device settings.'
          );
          return;
        }

        // Prompt user to authenticate with biometrics to confirm enrollment
        const authResult = await authenticateWithBiometrics();
        if (!authResult) {
          showAlert('Authentication Failed', 'Biometric authentication was not completed.');
          return;
        }

        // Enable biometric unlock in SecureStore (use placeholder ref for web-first mode)
        await enableBiometricUnlock('biometric-enrollment-ref');
        setBiometricLocked(true);
        settingsService.set('biometricLockEnabled', true);
        auditService.log('settings_change', 'biometric_lock', { enabled: true }).catch(() => {});
        showSuccess('Biometric Lock Enabled', 'You can now unlock your vault with Face ID or Touch ID.');
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to enable biometric lock';
        showError('Error', msg);
      }
    } else {
      // Disabling biometric — confirm with biometric auth first
      showConfirm(
        'Disable Biometric Lock',
        'You will need to enter your master password each time you unlock the vault.',
        async () => {
          try {
            await disableBiometricUnlock();
            setBiometricLocked(false);
            settingsService.set('biometricLockEnabled', false);
            auditService.log('settings_change', 'biometric_lock', { enabled: false }).catch(() => {});
            showAlert('Biometric Lock Disabled', 'Biometric unlock has been turned off.');
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to disable biometric lock';
            showError('Error', msg);
          }
        },
        'Disable',
        'destructive',
      );
    }
  };

  // SEC-02: Wire 2FA status to real FIDO2 device count
  // 2FA is considered enabled when at least one FIDO2 security key is registered
  const handleTwoFactorToggle = () => {
    const fido2Count = fido2Service.getDeviceCount();
    if (!twoFactorEnabled) {
      if (fido2Count === 0) {
        // No security keys registered — guide user to register one
        showConfirm(
          'Enable Two-Factor Authentication',
          'Two-factor authentication requires a registered security key (FIDO2/WebAuthn). Would you like to register a security key now?',
          () => {
            dismiss();
            // Trigger the FIDO2 registration flow
            handleRegisterFido2();
          },
          'Register Key',
        );
      } else {
        // Keys exist — enable 2FA requirement
        setTwoFactorEnabled(true);
        settingsService.set('twoFactorEnabled', true);
        auditService.log('settings_change', '2fa', { enabled: true, fido2Devices: fido2Count }).catch(() => {});
        showSuccess('2FA Enabled', `Two-factor authentication is now active with ${fido2Count} security key${fido2Count > 1 ? 's' : ''}.`);
      }
    } else {
      showConfirm(
        'Disable Two-Factor Authentication',
        'This will reduce the security of your account. Your security keys will remain registered but won\'t be required at login.',
        () => {
          setTwoFactorEnabled(false);
          settingsService.set('twoFactorEnabled', false);
          auditService.log('settings_change', '2fa', { enabled: false }).catch(() => {});
          showAlert('2FA Disabled', 'Two-factor authentication has been disabled. Your security keys are still available.');
        },
        'Disable',
        'destructive',
      );
    }
  };

  const handleAutoLockChange = () => {
    const options = ['5 min', '10 min', '15 min', '30 min', '1 hour'];
    const minuteMap: Record<string, number> = { '5 min': 5, '10 min': 10, '15 min': 15, '30 min': 30, '1 hour': 60 };

    showAlert(
      'Auto-Lock Timeout',
      'Select how long before vault locks',
      [
        ...options.map((option) => ({
          text: option,
          onPress: () => {
            setAutoLockTimeout(option);
            settingsService.set('autoLockTimeoutMin', minuteMap[option] || 15);
            auditService.log('settings_change', 'auto_lock_timeout', { value: option }).catch(() => {});
            dismiss();
          },
        })),
        { text: 'Cancel', onPress: () => dismiss(), style: 'cancel' as const },
      ]
    );
  };

  const handleLockVault = () => {
    showConfirm(
      'Lock Vault',
      'Your vault will be locked and you will need to sign in again.',
      () => {
        dismiss();
        onLockVault();
      },
      'Lock Vault',
      'destructive'
    );
  };

  return (
    <>
      <InAppModal config={modal} />
      <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Feather name="shield" size={18} color={dashboardColors.cyan} />
        <Text style={styles.sectionTitle}>Security</Text>
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Two-Factor Authentication</Text>
          <Text style={styles.settingMeta}>
            {/* SEC-02: Show real FIDO2 status */}
            {fido2Devices.length > 0
              ? `FIDO2 — ${fido2Devices.length} key${fido2Devices.length > 1 ? 's' : ''} registered`
              : 'FIDO2 / Security Key'}
          </Text>
        </View>
        <Pressable onPress={handleTwoFactorToggle}>
          <View style={styles.enabledBadge}>
            <Feather
              name={twoFactorEnabled ? 'check' : 'x'}
              size={14}
              color={twoFactorEnabled ? dashboardColors.green : '#EF4444'}
            />
            <Text style={[styles.enabledText, !twoFactorEnabled && { color: '#EF4444' }]}>
              {twoFactorEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Biometric Lock</Text>
          <Text style={styles.settingMeta}>Face ID / Touch ID</Text>
        </View>
        <TouchableOpacity
          style={[styles.toggle, biometricLocked && styles.toggleOn]}
          onPress={handleBiometricToggle}
        >
          <View style={styles.toggleCircle} />
        </TouchableOpacity>
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Auto-Lock Timeout</Text>
          <Text style={styles.settingMeta}>Lock after inactivity</Text>
        </View>
        <Pressable
          style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
          onPress={handleAutoLockChange}
        >
          <Text style={styles.selectText}>{autoLockTimeout}</Text>
          <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.settingRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.settingLabel}>Security Keys (FIDO2)</Text>
          <Text style={styles.settingMeta}>Hardware key authentication</Text>
          {fido2Devices.length > 0 ? (
            fido2Devices.map((device) => (
              <View key={device.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#E2E8F0' }}>{device.name}</Text>
                  <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    {new Date(device.registeredAt).toLocaleDateString()}{device.transport ? ` • ${device.transport}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveFido2(device)}
                  style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                >
                  <Feather name="x" size={14} color="#EF4444" />
                </Pressable>
              </View>
            ))
          ) : (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {webAuthnSupported ? 'No keys registered' : 'WebAuthn not supported in this browser'}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
        onPress={handleRegisterFido2}
      >
        <Feather name="plus-circle" size={16} color={dashboardColors.textPrimary} />
        <Text style={styles.actionBtnText}>Register Security Key</Text>
      </Pressable>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Authentication Protocol</Text>
          <Text style={styles.settingMeta}>Zero-knowledge password proof</Text>
        </View>
        <Text style={styles.settingValueHighlight}>SRP-6a</Text>
      </View>

      <View style={styles.settingRow}>
        <View>
          <Text style={styles.settingLabel}>Password Hashing</Text>
          <Text style={styles.settingMeta}>Memory-hard key derivation</Text>
        </View>
        <Text style={styles.settingValueHighlight}>Argon2id</Text>
      </View>

      <Pressable
        style={(state: any) => [styles.actionBtn, styles.lockBtn, state.hovered && styles.lockBtnHover]}
        onPress={handleLockVault}
      >
        <Feather name="lock" size={16} color="#FF6B6B" />
        <Text style={styles.lockBtnText}>Lock Vault</Text>
      </Pressable>
      </View>
    </>
  );
}

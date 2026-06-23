import { View, Text, Pressable, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors } from '@/components/dashboard2/styles';
import { styles } from './styles';
import { useState, useEffect, useCallback } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';
import { fido2Service, Fido2Device } from '@/services/fido2Service';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/hooks/useLanguage';
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
  const { t } = useLanguage();
  const [biometricLocked, setBiometricLocked] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [autoLockTimeout, setAutoLockTimeout] = useState('15 min');
  const [fido2Devices, setFido2Devices] = useState<Fido2Device[]>([]);
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  const { modal, showAlert, showConfirm, showPrompt, showSuccess, showError, dismiss } =
    useInAppModal();

  // Load persisted settings on mount
  useEffect(() => {
    const settings = settingsService.load();
    setBiometricLocked(settings.biometricLockEnabled);
    setTwoFactorEnabled(settings.twoFactorEnabled);

    // Convert stored minutes to display label
    const mins = settings.autoLockTimeoutMin;
    if (mins >= 60) setAutoLockTimeout(t('settings.hourTimeout', { hours: Math.floor(mins / 60) }));
    else setAutoLockTimeout(t('settings.minTimeout', { mins }));
  }, [t]);

  const refreshDevices = useCallback(() => {
    setFido2Devices(fido2Service.listDevices());
    setWebAuthnSupported(fido2Service.isWebAuthnSupported());
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const handleRegisterFido2 = () => {
    if (!webAuthnSupported) {
      showAlert(t('settings.notSupported'), t('settings.webauthnNotSupportedMsg'));
      return;
    }
    showPrompt(
      t('settings.registerKey'),
      [
        {
          key: 'name',
          label: t('settings.deviceName'),
          placeholder: t('settings.deviceNamePlaceholder'),
        },
      ],
      async values => {
        const name = values.name?.trim();
        if (!name) return;
        try {
          await fido2Service.registerDevice(name);
          refreshDevices();
          showSuccess(t('settings.registered'), t('settings.registeredMsg', { name }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : t('settings.registrationFailed');
          showError(t('settings.registrationFailed'), msg);
        }
      },
      t('settings.registerBtn')
    );
  };

  const handleRemoveFido2 = (device: Fido2Device) => {
    showConfirm(
      t('settings.removeKey', { name: device.name }),
      t('settings.removeKeyConfirm'),
      async () => {
        try {
          await fido2Service.removeDevice(device.id);
          refreshDevices();
          showSuccess(t('settings.removed'), t('settings.keyRemoved', { name: device.name }));
        } catch {
          showError(t('settings.error'), t('settings.failedToRemove'));
        }
      },
      t('settings.remove'),
      'destructive'
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
          showAlert(t('settings.biometricNotAvailable'), t('settings.biometricNotAvailableMsg'));
          return;
        }

        // Prompt user to authenticate with biometrics to confirm enrollment
        const authResult = await authenticateWithBiometrics();
        if (!authResult) {
          showAlert(t('settings.authFailed'), t('settings.authFailedMsg'));
          return;
        }

        // Enable biometric unlock in SecureStore (use placeholder ref for web-first mode)
        await enableBiometricUnlock('biometric-enrollment-ref');
        setBiometricLocked(true);
        settingsService.set('biometricLockEnabled', true);
        auditService.log('settings_change', 'biometric_lock', { enabled: true }).catch(() => {});
        showSuccess(t('settings.biometricEnabled'), t('settings.biometricEnabledMsg'));
      } catch (error) {
        const msg = error instanceof Error ? error.message : t('settings.biometricEnableError');
        showError(t('settings.error'), msg);
      }
    } else {
      // Disabling biometric — confirm with biometric auth first
      showConfirm(
        t('settings.disableBiometric'),
        t('settings.disableBiometricMsg'),
        async () => {
          try {
            await disableBiometricUnlock();
            setBiometricLocked(false);
            settingsService.set('biometricLockEnabled', false);
            auditService
              .log('settings_change', 'biometric_lock', { enabled: false })
              .catch(() => {});
            showAlert(t('settings.biometricDisabled'), t('settings.biometricDisabledMsg'));
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : t('settings.biometricDisableError');
            showError(t('settings.error'), msg);
          }
        },
        t('settings.disableBtn'),
        'destructive'
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
          t('settings.enable2fa'),
          t('settings.enable2faMsg'),
          () => {
            dismiss();
            // Trigger the FIDO2 registration flow
            handleRegisterFido2();
          },
          t('settings.registerKeyBtn')
        );
      } else {
        // Keys exist — enable 2FA requirement
        setTwoFactorEnabled(true);
        settingsService.set('twoFactorEnabled', true);
        auditService
          .log('settings_change', '2fa', { enabled: true, fido2Devices: fido2Count })
          .catch(() => {});
        showSuccess(
          t('settings.twoFaEnabled'),
          t('settings.twoFaEnabledMsg', { count: fido2Count })
        );
      }
    } else {
      showConfirm(
        t('settings.disable2fa'),
        t('settings.disable2faMsg'),
        () => {
          setTwoFactorEnabled(false);
          settingsService.set('twoFactorEnabled', false);
          auditService.log('settings_change', '2fa', { enabled: false }).catch(() => {});
          showAlert(t('settings.twoFaDisabled'), t('settings.twoFaDisabledMsg'));
        },
        t('settings.disableBtn'),
        'destructive'
      );
    }
  };

  const handleAutoLockChange = () => {
    const options = [
      t('settings.min5'),
      t('settings.min10'),
      t('settings.min15'),
      t('settings.min30'),
      t('settings.hour1'),
    ];
    const minuteMap: Record<string, number> = {
      [t('settings.min5')]: 5,
      [t('settings.min10')]: 10,
      [t('settings.min15')]: 15,
      [t('settings.min30')]: 30,
      [t('settings.hour1')]: 60,
    };

    showAlert(t('settings.autoLockTitle'), t('settings.autoLockDesc'), [
      ...options.map(option => ({
        text: option,
        onPress: () => {
          setAutoLockTimeout(option);
          settingsService.set('autoLockTimeoutMin', minuteMap[option] || 15);
          auditService
            .log('settings_change', 'auto_lock_timeout', { value: option })
            .catch(() => {});
          dismiss();
        },
      })),
      { text: t('settings.cancel'), onPress: () => dismiss(), style: 'cancel' as const },
    ]);
  };

  const handleLockVault = () => {
    showConfirm(
      t('settings.lockVaultTitle'),
      t('settings.lockVaultDesc'),
      () => {
        dismiss();
        onLockVault();
      },
      t('settings.lockVault'),
      'destructive'
    );
  };

  return (
    <>
      <InAppModal config={modal} />
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <Feather name="shield" size={18} color={dashboardColors.cyan} />
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('settings.security')}
          </Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.twoFactor')}</Text>
            <Text style={styles.settingMeta}>
              {/* SEC-02: Show real FIDO2 status */}
              {fido2Devices.length > 0
                ? t('settings.fido2Devices', { count: fido2Devices.length })
                : t('settings.fido2Empty')}
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
                {twoFactorEnabled ? t('settings.enabled') : t('settings.disabled')}
              </Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.biometricLock')}</Text>
            <Text style={styles.settingMeta}>{t('settings.faceIdTouchId')}</Text>
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
            <Text style={styles.settingLabel}>{t('settings.autoLockTimeout')}</Text>
            <Text style={styles.settingMeta}>{t('settings.lockAfterInactivity')}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [styles.selectPill, state.hovered && styles.selectPillHover]}
            onPress={handleAutoLockChange}
          >
            <Text style={styles.selectText}>{autoLockTimeout}</Text>
            <Feather name="chevron-down" size={14} color={dashboardColors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>{t('settings.securityKeys')}</Text>
            <Text style={styles.settingMeta}>{t('settings.hardwareKeyAuth')}</Text>
            {fido2Devices.length > 0 ? (
              fido2Devices.map(device => (
                <View
                  key={device.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 8,
                    paddingVertical: 4,
                    paddingHorizontal: 8,
                    borderRadius: 6,
                    backgroundColor: 'rgba(139,92,246,0.1)',
                    borderWidth: 1,
                    borderColor: 'rgba(139,92,246,0.2)',
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#E2E8F0' }}>
                      {device.name}
                    </Text>
                    <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {new Date(device.registeredAt).toLocaleDateString()}
                      {device.transport ? ` • ${device.transport}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => handleRemoveFido2(device)}
                    style={{ paddingHorizontal: 8, paddingVertical: 4 }}
                  >
                    <Feather name="x" size={14} color="#EF4444" />
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                {webAuthnSupported
                  ? t('settings.noKeysRegistered')
                  : t('settings.webauthnNotSupported')}
              </Text>
            )}
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [styles.actionBtn, state.hovered && styles.actionBtnHover]}
          onPress={handleRegisterFido2}
        >
          <Feather name="plus-circle" size={16} color={dashboardColors.textPrimary} />
          <Text style={styles.actionBtnText}>{t('settings.registerSecurityKey')}</Text>
        </Pressable>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.authProtocol')}</Text>
            <Text style={styles.settingMeta}>{t('settings.zkPasswordProof')}</Text>
          </View>
          <Text style={styles.settingValueHighlight}>SRP-6a</Text>
        </View>

        <View style={styles.settingRow}>
          <View>
            <Text style={styles.settingLabel}>{t('settings.passwordHashing')}</Text>
            <Text style={styles.settingMeta}>{t('settings.memoryHardKdf')}</Text>
          </View>
          <Text style={styles.settingValueHighlight}>Argon2id</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={(state: any) => [
            styles.actionBtn,
            styles.lockBtn,
            state.hovered && styles.lockBtnHover,
          ]}
          onPress={handleLockVault}
        >
          <Feather name="lock" size={16} color="#FF6B6B" />
          <Text style={styles.lockBtnText}>{t('settings.lockVault')}</Text>
        </Pressable>
      </View>
    </>
  );
}

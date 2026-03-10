import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import { usbService, USBDrive } from '@/services/usbService';
import { validatePassword } from '@/utils/passwordPolicy';

// ── Constants ──────────────────────────────────────────────────────────

const steps = ['Detect USB', 'Format Options', 'Set Master Password', 'Initialize'];

interface SetupState {
  currentStep: number;
  selectedDriveId: string | null;
  formatType: 'quick' | 'full';
  fileSystem: 'exfat' | 'ntfs' | 'ext4';
  password: string;
  passwordConfirm: string;
  showPassword: boolean;
  showPasswordConfirm: boolean;
}

// ── Password strength helper ───────────────────────────────────────────

function getStrength(password: string): { strength: number; label: string; color: string } {
  if (!password) return { strength: 0, label: 'Enter a password', color: '#4B5563' };
  try {
    const result = validatePassword(password, {});
    // score 0-5
    const pct = Math.round((result.score / 5) * 100);
    const level = result.level;
    const label = level === 'weak' ? 'Weak' : level === 'fair' ? 'Fair' : level === 'good' ? 'Good' : 'Strong';
    const color = level === 'weak' ? '#EF4444' : level === 'fair' ? '#F59E0B' : level === 'good' ? '#3B82F6' : '#10B981';
    return { strength: pct, label, color };
  } catch {
    // Fallback scoring by length + complexity
    let s = 0;
    if (password.length >= 8)  s += 20;
    if (password.length >= 12) s += 20;
    if (password.length >= 16) s += 20;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s += 20;
    if (/[0-9]/.test(password)) s += 10;
    if (/[^A-Za-z0-9]/.test(password)) s += 10;
    const label = s < 40 ? 'Weak' : s < 60 ? 'Fair' : s < 80 ? 'Good' : 'Strong';
    const color = s < 40 ? '#EF4444' : s < 60 ? '#F59E0B' : s < 80 ? '#3B82F6' : '#10B981';
    return { strength: s, label, color };
  }
}

// ── Component ──────────────────────────────────────────────────────────

export default function SetupUSB() {
  const { modal, showSuccess, showError, showConfirm } = useInAppModal();

  const [drives, setDrives] = useState<USBDrive[]>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  const [state, setState] = useState<SetupState>({
    currentStep: 0,
    selectedDriveId: null,
    formatType: 'quick',
    fileSystem: 'exfat',
    password: '',
    passwordConfirm: '',
    showPassword: false,
    showPasswordConfirm: false,
  });

  // ── Load drives ──────────────────────────────────────────────────────

  const loadDrives = useCallback(async () => {
    setLoadingDrives(true);
    setDriveError(null);
    try {
      const list = await usbService.listDrives();
      setDrives(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to detect USB drives';
      setDriveError(msg);
    } finally {
      setLoadingDrives(false);
    }
  }, []);

  useEffect(() => { loadDrives(); }, [loadDrives]);

  // ── Navigation ───────────────────────────────────────────────────────

  const handleNext = () => {
    if (state.currentStep === 0 && !state.selectedDriveId) {
      showError('Selection Required', 'Please select a USB drive to continue.');
      return;
    }
    if (state.currentStep === 2) {
      if (!state.password) {
        showError('Password Required', 'Please enter a master password.');
        return;
      }
      if (state.password !== state.passwordConfirm) {
        showError('Passwords Do Not Match', 'The passwords you entered do not match.');
        return;
      }
      if (state.password.length < 8) {
        showError('Password Too Short', 'Master password must be at least 8 characters.');
        return;
      }
    }
    setState(prev => ({ ...prev, currentStep: prev.currentStep + 1 }));
  };

  const handleBack = () => {
    setState(prev => ({ ...prev, currentStep: Math.max(0, prev.currentStep - 1) }));
  };

  // ── Initialize vault ─────────────────────────────────────────────────

  const handleInitializeVault = () => {
    const drive = drives.find(d => d.id === state.selectedDriveId);
    showConfirm(
      'Initialize Vault',
      `This will format "${drive?.name ?? 'the selected drive'}" and create an encrypted vault. All existing data will be erased. This cannot be undone.`,
      async () => {
        setProvisioning(true);
        try {
          await usbService.provisionVault({
            driveId: state.selectedDriveId!,
            formatType: state.formatType,
            fileSystem: state.fileSystem,
            masterPassword: state.password,
          });
          showSuccess('Vault Initialized', 'Your encrypted USB vault has been created successfully.');
          setState({
            currentStep: 0,
            selectedDriveId: null,
            formatType: 'quick',
            fileSystem: 'exfat',
            password: '',
            passwordConfirm: '',
            showPassword: false,
            showPasswordConfirm: false,
          });
          loadDrives();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Vault initialization failed. Please try again.';
          showError('Initialization Failed', msg);
        } finally {
          setProvisioning(false);
        }
      }
    );
  };

  // ── Derived values ────────────────────────────────────────────────────

  const selectedDrive = drives.find(d => d.id === state.selectedDriveId);
  const strength = getStrength(state.password);
  const passwordsMatch = state.password && state.password === state.passwordConfirm;

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <ShellLayout>
      <View style={styles.contentArea}>

        {/* Header */}
        <View style={[styles.headerArea, { backgroundColor: 'rgba(8,5,20,0.3)' }]}>
          <View>
            <Text style={styles.pageTitle}>Setup USB</Text>
            <Text style={styles.pageSubtitle}>Provision a new USB drive as an encrypted vault</Text>
          </View>
          <View style={styles.desktopBadge}>
            <Text style={styles.badgeText}>Desktop Only</Text>
          </View>
        </View>

        {/* Step indicator */}
        <View style={[styles.stepIndicatorContainer, { backgroundColor: 'rgba(8,5,20,0.4)' }]}>
          <View style={styles.stepIndicator}>
            {steps.map((_, index) => (
              <View key={index} style={styles.stepWrapper}>
                <View
                  style={[
                    styles.stepCircle,
                    index <= state.currentStep && { backgroundColor: '#22D3EE', borderColor: '#22D3EE' },
                    index === state.currentStep && webOnly({ boxShadow: '0 0 12px rgba(34,211,238,0.5)' }),
                  ]}
                >
                  {index < state.currentStep ? (
                    <Feather name="check" size={16} color="#08051C" />
                  ) : (
                    <Text style={styles.stepNumber}>{index + 1}</Text>
                  )}
                </View>
                {index < steps.length - 1 && (
                  <View style={[styles.stepLine, index < state.currentStep && { backgroundColor: '#22D3EE' }]} />
                )}
              </View>
            ))}
          </View>
          <View style={styles.stepLabels}>
            {steps.map((label, index) => (
              <Text
                key={index}
                style={[styles.stepLabel, index <= state.currentStep && styles.stepLabelActive]}
              >
                {label}
              </Text>
            ))}
          </View>
        </View>

        {/* ── Step 1: Detect USB ───────────────────────────────────────── */}
        {state.currentStep === 0 && (
          <View style={styles.stepContent}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="disc" size={24} color="#22D3EE" />
                <Text style={styles.cardTitle}>Detect USB Drives</Text>
                <Pressable style={styles.refreshBtn} onPress={loadDrives} disabled={loadingDrives}>
                  {loadingDrives
                    ? <ActivityIndicator size="small" color="#22D3EE" />
                    : <Feather name="refresh-cw" size={16} color="#22D3EE" />
                  }
                </Pressable>
              </View>
              <Text style={styles.cardDescription}>Select a USB drive to provision as your encrypted vault</Text>

              {loadingDrives ? (
                <View style={styles.centerState}>
                  <ActivityIndicator size="large" color="#22D3EE" />
                  <Text style={styles.stateLabel}>Scanning for USB drives…</Text>
                </View>
              ) : driveError ? (
                <View style={styles.errorState}>
                  <Feather name="alert-circle" size={32} color="#EF4444" />
                  <Text style={styles.errorStateText}>{driveError}</Text>
                  <Pressable style={styles.retryBtn} onPress={loadDrives}>
                    <Text style={styles.retryBtnText}>Try Again</Text>
                  </Pressable>
                </View>
              ) : drives.length === 0 ? (
                <View style={styles.centerState}>
                  <Feather name="hard-drive" size={36} color="rgba(34,211,238,0.3)" />
                  <Text style={styles.stateLabel}>No USB drives detected</Text>
                  <Text style={styles.stateHint}>Insert a USB drive and tap Refresh</Text>
                  <Pressable style={styles.retryBtn} onPress={loadDrives}>
                    <Feather name="refresh-cw" size={14} color="#22D3EE" />
                    <Text style={styles.retryBtnText}>Refresh</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.driveList}>
                  {drives.map(drive => (
                    <Pressable
                      key={drive.id}
                      style={[
                        styles.driveItem,
                        state.selectedDriveId === drive.id && styles.driveItemSelected,
                        !drive.available && styles.driveItemDisabled,
                      ]}
                      onPress={() => drive.available && setState(prev => ({ ...prev, selectedDriveId: drive.id }))}
                      disabled={!drive.available}
                    >
                      <View style={[styles.driveRadio, state.selectedDriveId === drive.id && styles.driveRadioSelected]}>
                        {state.selectedDriveId === drive.id && <View style={styles.driveRadioDot} />}
                      </View>
                      <View style={styles.driveInfo}>
                        <View style={styles.driveNameRow}>
                          <Text style={[styles.driveName, !drive.available && { color: '#6B7280' }]}>{drive.name}</Text>
                          {drive.hasVault && (
                            <View style={styles.vaultBadge}>
                              <Text style={styles.vaultBadgeText}>Has Vault</Text>
                            </View>
                          )}
                          {!drive.available && (
                            <View style={styles.unavailableBadge}>
                              <Text style={styles.unavailableBadgeText}>In Use</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.driveDevice}>
                          {drive.device} · {drive.capacity}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Step 2: Format Options ──────────────────────────────────── */}
        {state.currentStep === 1 && (
          <View style={styles.stepContent}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="hard-drive" size={24} color="#22D3EE" />
                <Text style={styles.cardTitle}>Format Options</Text>
              </View>
              <Text style={styles.cardDescription}>Choose how to format your USB drive</Text>

              <Text style={styles.optionGroupLabel}>Format Type</Text>
              <View style={styles.radioGroup}>
                {([
                  { value: 'quick', label: 'Quick Format', desc: 'Fast formatting — recommended for most users' },
                  { value: 'full',  label: 'Full Format',  desc: 'Secure wipe and format (slower, overwrites all data)' },
                ] as const).map(opt => (
                  <Pressable
                    key={opt.value}
                    style={[styles.radioItem, state.formatType === opt.value && styles.radioItemSelected]}
                    onPress={() => setState(prev => ({ ...prev, formatType: opt.value }))}
                  >
                    <View style={[styles.radioButton, state.formatType === opt.value && styles.radioButtonSelected]}>
                      {state.formatType === opt.value && <View style={styles.radioDot} />}
                    </View>
                    <View>
                      <Text style={styles.radioLabel}>{opt.label}</Text>
                      <Text style={styles.radioDescription}>{opt.desc}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.optionGroupLabel, { marginTop: 20 }]}>File System</Text>
              <View style={styles.pillGroup}>
                {(['exfat', 'ntfs', 'ext4'] as const).map(fs => (
                  <Pressable
                    key={fs}
                    style={[styles.pill, state.fileSystem === fs && styles.pillSelected]}
                    onPress={() => setState(prev => ({ ...prev, fileSystem: fs }))}
                  >
                    <Text style={[styles.pillText, state.fileSystem === fs && styles.pillTextSelected]}>
                      {fs.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── Step 3: Set Master Password ─────────────────────────────── */}
        {state.currentStep === 2 && (
          <View style={styles.stepContent}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="lock" size={24} color="#22D3EE" />
                <Text style={styles.cardTitle}>Set Master Password</Text>
              </View>
              <Text style={styles.cardDescription}>Create a strong master password to protect your vault</Text>

              {/* Master password field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Master Password</Text>
                <View style={styles.inputRow}>
                  <Feather name="lock" size={16} color="#22D3EE" style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    secureTextEntry={!state.showPassword}
                    value={state.password}
                    onChangeText={text => setState(prev => ({ ...prev, password: text }))}
                    placeholder="Enter master password"
                    placeholderTextColor="#4B5563"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setState(prev => ({ ...prev, showPassword: !prev.showPassword }))}>
                    <Feather name={state.showPassword ? 'eye-off' : 'eye'} size={16} color="#6B7280" />
                  </Pressable>
                </View>
              </View>

              {/* Confirm password field */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Confirm Password</Text>
                <View style={[
                  styles.inputRow,
                  state.passwordConfirm && !passwordsMatch && styles.inputRowError,
                ]}>
                  <Feather name="lock" size={16} color={state.passwordConfirm && !passwordsMatch ? '#EF4444' : '#22D3EE'} style={styles.inputIcon} />
                  <TextInput
                    style={styles.textInput}
                    secureTextEntry={!state.showPasswordConfirm}
                    value={state.passwordConfirm}
                    onChangeText={text => setState(prev => ({ ...prev, passwordConfirm: text }))}
                    placeholder="Confirm master password"
                    placeholderTextColor="#4B5563"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable onPress={() => setState(prev => ({ ...prev, showPasswordConfirm: !prev.showPasswordConfirm }))}>
                    <Feather name={state.showPasswordConfirm ? 'eye-off' : 'eye'} size={16} color="#6B7280" />
                  </Pressable>
                </View>
                {state.passwordConfirm && !passwordsMatch && (
                  <Text style={styles.fieldError}>Passwords do not match</Text>
                )}
                {state.passwordConfirm && passwordsMatch && (
                  <View style={styles.fieldOk}>
                    <Feather name="check-circle" size={13} color="#10B981" />
                    <Text style={styles.fieldOkText}>Passwords match</Text>
                  </View>
                )}
              </View>

              {/* Strength bar */}
              {state.password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthHeader}>
                    <Text style={styles.strengthLabelText}>Password Strength</Text>
                    <Text style={[styles.strengthValue, { color: strength.color }]}>{strength.label}</Text>
                  </View>
                  <View style={styles.strengthBar}>
                    <View style={[styles.strengthFill, { width: `${strength.strength}%` as any, backgroundColor: strength.color }]} />
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Step 4: Review & Initialize ─────────────────────────────── */}
        {state.currentStep === 3 && (
          <View style={styles.stepContent}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Feather name="check-square" size={24} color="#22D3EE" />
                <Text style={styles.cardTitle}>Review & Initialize</Text>
              </View>
              <Text style={styles.cardDescription}>Verify your selections before creating the vault</Text>

              <View style={styles.summaryContainer}>
                {[
                  { icon: 'disc',       label: 'USB Drive',    value: selectedDrive?.name ?? '—' },
                  { icon: 'hard-drive', label: 'Format Type',  value: state.formatType === 'quick' ? 'Quick Format' : 'Full Format' },
                  { icon: 'database',   label: 'File System',  value: state.fileSystem.toUpperCase() },
                  { icon: 'shield',     label: 'Encryption',   value: 'AES-256-GCM · Post-Quantum (ML-KEM-1024)' },
                ].map(item => (
                  <View key={item.label} style={styles.summaryItem}>
                    <View style={styles.summaryIcon}>
                      <Feather name={item.icon as any} size={16} color="#22D3EE" />
                    </View>
                    <View>
                      <Text style={styles.summaryLabel}>{item.label}</Text>
                      <Text style={styles.summaryValue}>{item.value}</Text>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.warningBox}>
                <Feather name="alert-triangle" size={18} color="#EF4444" />
                <View style={styles.warningContent}>
                  <Text style={styles.warningTitle}>Warning</Text>
                  <Text style={styles.warningText}>
                    This will permanently erase all existing data on {selectedDrive?.name ?? 'the selected drive'} and cannot be undone.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Navigation buttons */}
        <View style={styles.navigationContainer}>
          <Pressable
            style={[styles.navButton, styles.backButton, state.currentStep === 0 && styles.navButtonDisabled]}
            onPress={handleBack}
            disabled={state.currentStep === 0 || provisioning}
          >
            <Feather name="arrow-left" size={16} color={state.currentStep === 0 ? '#4B4563' : '#B8B3D1'} />
            <Text style={[styles.navButtonText, state.currentStep === 0 && styles.navButtonTextDisabled]}>Back</Text>
          </Pressable>

          {state.currentStep < steps.length - 1 ? (
            <Pressable
              style={[styles.navButton, styles.nextButton]}
              onPress={handleNext}
              disabled={provisioning}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <Feather name="arrow-right" size={16} color="#08051C" />
            </Pressable>
          ) : (
            <Pressable
              style={[
                styles.navButton,
                styles.initializeButton,
                webOnly({ background: 'linear-gradient(135deg,#8B5CF6 0%,#7C3AED 100%)', boxShadow: '0 8px 24px rgba(139,92,246,0.4)' }),
                provisioning && styles.navButtonDisabled,
              ]}
              onPress={handleInitializeVault}
              disabled={provisioning}
            >
              {provisioning
                ? <ActivityIndicator size="small" color="#F5F3FF" />
                : <>
                    <Text style={styles.initializeButtonText}>Initialize Vault</Text>
                    <Feather name="check" size={16} color="#F5F3FF" />
                  </>
              }
            </Pressable>
          )}
        </View>

        <View style={{ height: dashboardSpacing.xl }} />
      </View>
      <InAppModal config={modal} />
    </ShellLayout>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  contentArea: { paddingRight: 10 },

  headerArea: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: 16,
    marginBottom: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.1)',
  },
  pageTitle: { fontSize: 32, fontWeight: '700', color: '#F5F3FF', marginBottom: dashboardSpacing.sm },
  pageSubtitle: { fontSize: 14, color: '#B8B3D1' },
  desktopBadge: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 8,
    backgroundColor: '#EA580C',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#F5F3FF' },

  stepIndicatorContainer: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.lg,
    borderRadius: 16,
    marginBottom: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.1)',
  },
  stepIndicator: { flexDirection: 'row', alignItems: 'center', marginBottom: dashboardSpacing.lg, justifyContent: 'center' },
  stepWrapper: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: 'rgba(8,5,20,0.5)',
  },
  stepNumber: { fontSize: 16, fontWeight: '600', color: '#B8B3D1' },
  stepLine: {
    width: 32, height: 2,
    backgroundColor: 'rgba(34,211,238,0.2)',
    marginHorizontal: dashboardSpacing.sm,
  },
  stepLabels: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  stepLabel: { fontSize: 12, color: '#B8B3D1', fontWeight: '500', textAlign: 'center', marginHorizontal: dashboardSpacing.sm },
  stepLabelActive: { color: '#22D3EE', fontWeight: '600' },

  stepContent: { marginBottom: dashboardSpacing.lg },
  card: {
    padding: dashboardSpacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderColor: 'rgba(34,211,238,0.1)',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: dashboardSpacing.md },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#F5F3FF', marginLeft: dashboardSpacing.md, flex: 1 },
  cardDescription: { fontSize: 13, color: '#B8B3D1', marginBottom: dashboardSpacing.lg },

  refreshBtn: { padding: 6 },

  // Empty / error states
  centerState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  stateLabel: { fontSize: 14, color: '#B8B3D1', fontWeight: '500' },
  stateHint: { fontSize: 12, color: '#6B7280' },
  errorState: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  errorStateText: { fontSize: 13, color: '#EF4444', textAlign: 'center', maxWidth: 300 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,211,238,0.4)', marginTop: 4 },
  retryBtnText: { fontSize: 13, fontWeight: '600', color: '#22D3EE' },

  // Drive list
  driveList: { gap: dashboardSpacing.md },
  driveItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.md,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.15)',
    ...webOnlyTransition,
  },
  driveItemSelected: { borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.08)' },
  driveItemDisabled: { opacity: 0.45 },
  driveRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#B8B3D1',
    justifyContent: 'center', alignItems: 'center',
    marginRight: dashboardSpacing.md,
  },
  driveRadioSelected: { borderColor: '#22D3EE' },
  driveRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22D3EE' },
  driveInfo: { flex: 1 },
  driveNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  driveName: { fontSize: 14, fontWeight: '600', color: '#F5F3FF' },
  driveDevice: { fontSize: 12, color: '#B8B3D1' },
  vaultBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(139,92,246,0.2)' },
  vaultBadgeText: { fontSize: 10, fontWeight: '600', color: '#A78BFA' },
  unavailableBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(239,68,68,0.15)' },
  unavailableBadgeText: { fontSize: 10, fontWeight: '600', color: '#EF4444' },

  // Format options
  optionGroupLabel: { fontSize: 13, fontWeight: '600', color: '#F5F3FF', marginBottom: dashboardSpacing.md },
  radioGroup: { gap: dashboardSpacing.md },
  radioItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.md,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.15)',
    ...webOnlyTransition,
  },
  radioItemSelected: { borderColor: '#22D3EE', backgroundColor: 'rgba(34,211,238,0.08)' },
  radioButton: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: '#B8B3D1',
    justifyContent: 'center', alignItems: 'center',
    marginRight: dashboardSpacing.md,
  },
  radioButtonSelected: { borderColor: '#22D3EE' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22D3EE' },
  radioLabel: { fontSize: 14, fontWeight: '600', color: '#F5F3FF', marginBottom: 2 },
  radioDescription: { fontSize: 12, color: '#B8B3D1' },
  pillGroup: { flexDirection: 'row', gap: dashboardSpacing.md },
  pill: {
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.sm,
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: 'rgba(8,5,20,0.5)',
    ...webOnlyTransition,
  },
  pillSelected: { backgroundColor: '#22D3EE', borderColor: '#22D3EE' },
  pillText: { fontSize: 12, fontWeight: '600', color: '#22D3EE' },
  pillTextSelected: { color: '#08051C' },

  // Password fields
  fieldGroup: { marginBottom: dashboardSpacing.lg },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#B8B3D1', marginBottom: dashboardSpacing.sm },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.md,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
    backgroundColor: 'rgba(34,211,238,0.05)',
    gap: dashboardSpacing.sm,
  },
  inputRowError: { borderColor: 'rgba(239,68,68,0.5)', backgroundColor: 'rgba(239,68,68,0.05)' },
  inputIcon: { flexShrink: 0 },
  textInput: {
    flex: 1,
    fontSize: 14, color: '#F5F3FF',
    ...webOnly({ outline: 'none' }),
  },
  fieldError: { marginTop: 5, fontSize: 12, color: '#EF4444' },
  fieldOk: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  fieldOkText: { fontSize: 12, color: '#10B981' },

  // Strength bar
  strengthContainer: { marginBottom: dashboardSpacing.lg },
  strengthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: dashboardSpacing.sm },
  strengthLabelText: { fontSize: 12, fontWeight: '600', color: '#B8B3D1' },
  strengthValue: { fontSize: 12, fontWeight: '600' },
  strengthBar: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: 'rgba(34,211,238,0.1)' },
  strengthFill: { height: '100%', borderRadius: 3 },

  // Summary
  summaryContainer: { gap: dashboardSpacing.md, marginBottom: dashboardSpacing.lg },
  summaryItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(34,211,238,0.05)',
    borderWidth: 1, borderColor: 'rgba(34,211,238,0.15)',
    gap: dashboardSpacing.md,
  },
  summaryIcon: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(34,211,238,0.1)' },
  summaryLabel: { fontSize: 11, fontWeight: '600', color: '#B8B3D1', marginBottom: 2 },
  summaryValue: { fontSize: 14, fontWeight: '600', color: '#F5F3FF' },

  // Warning
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: dashboardSpacing.md, paddingVertical: dashboardSpacing.md,
    borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    gap: dashboardSpacing.md,
  },
  warningContent: { flex: 1 },
  warningTitle: { fontSize: 12, fontWeight: '600', color: '#EF4444', marginBottom: 4 },
  warningText: { fontSize: 12, color: '#EF4444', lineHeight: 17 },

  // Nav buttons
  navigationContainer: { flexDirection: 'row', gap: dashboardSpacing.md, marginTop: dashboardSpacing.xl, justifyContent: 'space-between' },
  navButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: dashboardSpacing.lg, paddingVertical: dashboardSpacing.md,
    borderRadius: 12, gap: dashboardSpacing.sm,
    ...webOnlyTransition,
  },
  backButton: { backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)' },
  nextButton: { backgroundColor: '#22D3EE', borderWidth: 1, borderColor: '#22D3EE' },
  nextButtonText: { fontSize: 14, fontWeight: '600', color: '#08051C' },
  navButtonText: { fontSize: 14, fontWeight: '600', color: '#B8B3D1' },
  navButtonTextDisabled: { color: '#4B4563' },
  navButtonDisabled: { opacity: 0.45 },
  initializeButton: { borderWidth: 1, borderColor: 'rgba(139,92,246,0.5)', backgroundColor: 'rgba(139,92,246,0.5)' },
  initializeButtonText: { fontSize: 14, fontWeight: '600', color: '#F5F3FF' },
});

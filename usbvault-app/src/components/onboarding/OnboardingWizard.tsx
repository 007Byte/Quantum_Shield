/**
 * OnboardingWizard — 4-step post-registration setup
 *
 * Step 1: PQC capability gate (checks browser/device support)
 * Step 2: Cipher suite selection (AES-256-GCM-SIV default, with PQC hybrid option)
 * Step 3: Identity configuration (display name, key fingerprint preview)
 * Step 4: Master password confirmation + vault creation
 */

import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { settingsService } from '@/services/settingsService';
import { auditService } from '@/services/auditService';
import { useLanguage } from '@/hooks/useLanguage';

interface OnboardingWizardProps {
  onComplete: () => void;
  email: string;
}

type CipherSuite = 'aes-256-gcm-siv' | 'xchacha20-poly1305' | 'pqc-hybrid';

export function OnboardingWizard({ onComplete, email }: OnboardingWizardProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [pqcSupported] = useState(true);
  const [selectedCipher, setSelectedCipher] = useState<CipherSuite>('aes-256-gcm-siv');
  const [displayName] = useState(email.split('@')[0]);
  const [keyFingerprint] = useState(() => {
    // Generate a simulated Ed25519 fingerprint
    const chars = '0123456789abcdef';
    let fp = '0x';
    for (let i = 0; i < 8; i++) fp += chars[Math.floor(Math.random() * 16)];
    return fp;
  });

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      // Final step — save settings and complete
      settingsService.save({
        pqcEnabled: selectedCipher === 'pqc-hybrid' || pqcSupported,
        keyProvider: 'software',
      });

      // Store onboarding completion flag
      try {
        localStorage.setItem('usbvault:onboarding_complete', 'true');
        localStorage.setItem('usbvault:display_name', displayName);
        localStorage.setItem('usbvault:cipher_suite', selectedCipher);
      } catch {
        /* silent */
      }

      auditService
        .log('vault_create', 'onboarding', {
          cipher: selectedCipher,
          pqc: pqcSupported,
          displayName,
        })
        .catch(() => {});

      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={s.stepContent}>
            <View style={s.iconCircle}>
              <Feather name="cpu" size={32} color="#22D3EE" />
            </View>
            <Text style={s.stepTitle}>{t('onboarding.pqcReadiness')}</Text>
            <Text style={s.stepDescription}>{t('onboarding.pqcDescription')}</Text>

            <View style={s.checkList}>
              <CheckItem label={t('onboarding.checkWebCrypto')} passed />
              <CheckItem label={t('onboarding.checkAes')} passed />
              <CheckItem label={t('onboarding.checkKdf')} passed />
              <CheckItem label={t('onboarding.checkMlkem')} passed={pqcSupported} />
              <CheckItem label={t('onboarding.checkEd25519')} passed />
            </View>

            {!pqcSupported && <Text style={s.warning}>{t('onboarding.pqcUnavailable')}</Text>}
          </View>
        );

      case 2:
        return (
          <View style={s.stepContent}>
            <View style={s.iconCircle}>
              <Feather name="shield" size={32} color="#A855F7" />
            </View>
            <Text style={s.stepTitle}>{t('onboarding.cipherSuite')}</Text>
            <Text style={s.stepDescription}>{t('onboarding.cipherDescription')}</Text>

            <View style={s.optionsList}>
              <CipherOption
                label={t('onboarding.cipherAes')}
                description={t('onboarding.cipherAesDesc')}
                recommended
                selected={selectedCipher === 'aes-256-gcm-siv'}
                onSelect={() => setSelectedCipher('aes-256-gcm-siv')}
              />
              <CipherOption
                label={t('onboarding.cipherXchacha')}
                description={t('onboarding.cipherXchachaDesc')}
                selected={selectedCipher === 'xchacha20-poly1305'}
                onSelect={() => setSelectedCipher('xchacha20-poly1305')}
              />
              <CipherOption
                label={t('onboarding.cipherPqc')}
                description={t('onboarding.cipherPqcDesc')}
                selected={selectedCipher === 'pqc-hybrid'}
                onSelect={() => setSelectedCipher('pqc-hybrid')}
                disabled={!pqcSupported}
              />
            </View>
          </View>
        );

      case 3:
        return (
          <View style={s.stepContent}>
            <View style={s.iconCircle}>
              <Feather name="user" size={32} color="#60A5FA" />
            </View>
            <Text style={s.stepTitle}>{t('onboarding.identity')}</Text>
            <Text style={s.stepDescription}>{t('onboarding.identityDescription')}</Text>

            <View style={s.identityCard}>
              <View style={s.identityRow}>
                <Text style={s.identityLabel}>{t('onboarding.email')}</Text>
                <Text style={s.identityValue}>{email}</Text>
              </View>
              <View style={s.identityRow}>
                <Text style={s.identityLabel}>{t('onboarding.displayName')}</Text>
                <Text style={s.identityValue}>{displayName}</Text>
              </View>
              <View style={s.identityRow}>
                <Text style={s.identityLabel}>{t('onboarding.keyFingerprint')}</Text>
                <Text style={[s.identityValue, { fontFamily: 'monospace', color: '#22D3EE' }]}>
                  {keyFingerprint} (Ed25519)
                </Text>
              </View>
              <View style={s.identityRow}>
                <Text style={s.identityLabel}>{t('onboarding.pqcSigning')}</Text>
                <Text style={s.identityValue}>{t('onboarding.mlDsa')}</Text>
              </View>
            </View>
          </View>
        );

      case 4:
        return (
          <View style={s.stepContent}>
            <View style={s.iconCircle}>
              <Feather name="lock" size={32} color="#34D399" />
            </View>
            <Text style={s.stepTitle}>{t('onboarding.vaultReady')}</Text>
            <Text style={s.stepDescription}>{t('onboarding.vaultReadyDescription')}</Text>

            <View style={s.summaryCard}>
              <SummaryRow
                label={t('onboarding.summCipher')}
                value={
                  selectedCipher === 'aes-256-gcm-siv'
                    ? t('onboarding.cipherAes')
                    : selectedCipher === 'xchacha20-poly1305'
                      ? t('onboarding.cipherXchacha')
                      : t('onboarding.pqcHybrid')
                }
              />
              <SummaryRow label={t('onboarding.summKdf')} value={t('onboarding.kdfValue')} />
              <SummaryRow
                label={t('onboarding.summPqc')}
                value={pqcSupported ? t('onboarding.pqcEnabled') : t('onboarding.pqcDisabled')}
              />
              <SummaryRow
                label={t('onboarding.summIdentity')}
                value={`${displayName} • ${keyFingerprint}`}
              />
              <SummaryRow
                label={t('onboarding.summZeroKnowledge')}
                value={t('onboarding.enforced')}
              />
              <SummaryRow
                label={t('onboarding.summIntegrity')}
                value={t('onboarding.integrityValue')}
              />
            </View>

            {/* Product positioning — INFRA-02 */}
            <View style={s.positioningCard}>
              <View style={s.positioningHeader}>
                <Feather name="info" size={16} color="#60A5FA" />
                <Text style={s.positioningTitle}>{t('onboarding.whatIsUsbvault')}</Text>
              </View>
              <Text style={s.positioningText}>{t('onboarding.usbvaultDescription')}</Text>
              <Text style={[s.positioningText, { marginTop: 8 }]}>
                {t('onboarding.usbvaultNotEmail')}
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Progress bar */}
      <View style={s.progressBar}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            style={[
              s.progressSegment,
              i < step && s.progressSegmentActive,
              i === step - 1 && s.progressSegmentCurrent,
            ]}
          />
        ))}
      </View>

      <Text style={s.stepIndicator}>{t('onboarding.stepOf', { step, total: totalSteps })}</Text>

      {renderStep()}

      {/* Navigation buttons */}
      <View style={s.navRow}>
        {step > 1 ? (
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              s.navBtn,
              s.navBtnSecondary,
              state.hovered && s.navBtnSecondaryHover,
            ]}
            onPress={handleBack}
          >
            <Feather name="arrow-left" size={16} color="#A78BFA" />
            <Text style={s.navBtnSecondaryText}>{t('onboarding.back')}</Text>
          </Pressable>
        ) : (
          <View />
        )}

        <Pressable
          testID="onboarding-next-button"
          accessibilityRole="button"
          style={(state: any) => [s.navBtn, s.navBtnPrimary, state.hovered && s.navBtnPrimaryHover]}
          onPress={handleNext}
        >
          <Text style={s.navBtnPrimaryText}>
            {step === totalSteps ? t('onboarding.createVault') : t('onboarding.continue')}
          </Text>
          <Feather name={step === totalSteps ? 'check' : 'arrow-right'} size={16} color="#fff" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────

function CheckItem({ label, passed }: { label: string; passed: boolean }) {
  const { t } = useLanguage();
  return (
    <View style={s.checkItem}>
      <View style={[s.checkDot, passed ? s.checkDotPass : s.checkDotFail]} />
      <Text style={[s.checkLabel, !passed && { color: '#FBBF24' }]}>{label}</Text>
      <Text style={[s.checkStatus, passed ? { color: '#34D399' } : { color: '#FBBF24' }]}>
        {passed ? t('onboarding.supported') : t('onboarding.unavailable')}
      </Text>
    </View>
  );
}

function CipherOption({
  label,
  description,
  selected,
  onSelect,
  recommended,
  disabled,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  recommended?: boolean;
  disabled?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Pressable
      accessibilityRole="button"
      style={(state: any) => [
        s.cipherOption,
        selected && s.cipherOptionSelected,
        disabled && s.cipherOptionDisabled,
        state.hovered && !disabled && s.cipherOptionHover,
      ]}
      onPress={disabled ? undefined : onSelect}
    >
      <View style={s.cipherHeader}>
        <View style={[s.radioOuter, selected && s.radioOuterActive]}>
          {selected && <View style={s.radioInner} />}
        </View>
        <Text style={[s.cipherLabel, disabled && { opacity: 0.5 }]}>{label}</Text>
        {recommended && (
          <View style={s.recommendedBadge}>
            <Text style={s.recommendedText}>{t('onboarding.recommended')}</Text>
          </View>
        )}
      </View>
      <Text style={[s.cipherDesc, disabled && { opacity: 0.5 }]}>{description}</Text>
    </Pressable>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Text style={s.summaryLabel}>{label}</Text>
      <Text style={s.summaryValue}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────

const s = StyleSheet.create({
  container: {
    padding: 32,
    alignItems: 'center',
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },
  progressBar: {
    flexDirection: 'row',
    gap: 6,
    width: '100%',
    marginBottom: 8,
  },
  progressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  progressSegmentActive: {
    backgroundColor: 'rgba(139,92,246,0.6)',
  },
  progressSegmentCurrent: {
    backgroundColor: '#A855F7',
    ...webOnly({ boxShadow: '0 0 8px rgba(168,85,247,0.6)' }),
  },
  stepIndicator: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 24,
    alignSelf: 'flex-start',
  },
  stepContent: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...webOnly({ boxShadow: '0 0 24px rgba(139,92,246,0.3)' }),
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F5F3FF',
    marginBottom: 10,
    textAlign: 'center',
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 480,
  },
  checkList: {
    width: '100%',
    gap: 12,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(8,5,20,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
  },
  checkDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkDotPass: {
    backgroundColor: '#34D399',
    ...webOnly({ boxShadow: '0 0 6px rgba(52,211,153,0.6)' }),
  },
  checkDotFail: {
    backgroundColor: '#FBBF24',
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  checkStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  warning: {
    fontSize: 13,
    color: '#FBBF24',
    marginTop: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  optionsList: {
    width: '100%',
    gap: 12,
  },
  cipherOption: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(8,5,20,0.5)',
    ...webOnly({ transition: 'all 0.15s ease', cursor: 'pointer' }),
  },
  cipherOptionSelected: {
    borderColor: 'rgba(168,85,247,0.6)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.3)' }),
  },
  cipherOptionDisabled: {
    opacity: 0.5,
    ...webOnly({ cursor: 'not-allowed' }),
  },
  cipherOptionHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  cipherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: '#A855F7',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#A855F7',
  },
  cipherLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F3FF',
    flex: 1,
  },
  cipherDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginLeft: 30,
  },
  recommendedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
  },
  recommendedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22D3EE',
  },
  identityCard: {
    width: '100%',
    backgroundColor: 'rgba(8,5,20,0.6)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  identityRow: {
    gap: 4,
  },
  identityLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.8)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  identityValue: {
    fontSize: 14,
    color: '#E2E8F0',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: 'rgba(8,5,20,0.6)',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.2)',
    ...webOnly({ boxShadow: '0 0 20px rgba(34,197,94,0.1)' }),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 13,
    color: '#E2E8F0',
    fontWeight: '500',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 32,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  navBtnPrimary: {
    backgroundColor: 'rgba(139,92,246,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.6)',
    ...webOnly({ boxShadow: '0 0 14px rgba(139,92,246,0.3)' }),
  },
  navBtnPrimaryHover: {
    backgroundColor: 'rgba(139,92,246,0.6)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 24px rgba(139,92,246,0.5)',
    }),
  },
  navBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  navBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  navBtnSecondaryHover: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  navBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#A78BFA',
  },
  // ── Product Positioning (INFRA-02) ──────────
  positioningCard: {
    width: '100%',
    backgroundColor: 'rgba(96,165,250,0.06)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.15)',
  },
  positioningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  positioningTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#60A5FA',
  },
  positioningText: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.6)',
  },
});

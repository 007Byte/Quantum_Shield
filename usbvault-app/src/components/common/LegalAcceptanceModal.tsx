/**
 * LegalAcceptanceModal — Requires users to accept Privacy Policy and Terms of Service.
 *
 * WS1: Renders a full-screen modal with scrollable legal text, a checkbox for
 * agreement, and an Accept button. Cannot be dismissed — user must accept to proceed.
 */

import { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  PRIVACY_POLICY_TEXT,
  TERMS_OF_SERVICE_TEXT,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  PRIVACY_POLICY_DATE,
  TERMS_DATE,
} from '@/constants/legal';

interface LegalAcceptanceModalProps {
  visible: boolean;
  onAccept: () => void;
}

export function LegalAcceptanceModal({ visible, onAccept }: LegalAcceptanceModalProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const focusTrapRef = useFocusTrap(visible);
  const [agreed, setAgreed] = useState(false);
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>('privacy');

  const handleAccept = () => {
    if (!agreed) return;
    onAccept();
  };

  return (
    <Modal transparent animationType="fade" visible={visible}>
      <View style={s.overlay} ref={focusTrapRef}>
        <View style={[s.card, resolveLayerStyle(theme.L4.base)]}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Feather name="shield" size={24} color={theme.semantic.accentPrimary} />
            </View>
            <Text style={[s.title, { color: theme.L4.base.text.primary }]}>
              {t('legal.acceptTitle')}
            </Text>
            <Text style={[s.subtitle, { color: theme.L4.base.text.secondary }]}>
              {t('legal.acceptMessage')}
            </Text>
          </View>

          {/* Tab Switcher */}
          <View style={s.tabRow}>
            <Pressable
              accessibilityRole="button"
              style={[s.tab, activeTab === 'privacy' && s.tabActive]}
              onPress={() => setActiveTab('privacy')}
            >
              <Feather
                name="lock"
                size={14}
                color={activeTab === 'privacy' ? theme.semantic.cyan : theme.L4.base.text.muted}
              />
              <Text
                style={[
                  s.tabText,
                  {
                    color: activeTab === 'privacy' ? theme.semantic.cyan : 'rgba(255,255,255,0.55)',
                  },
                  activeTab === 'privacy' && s.tabTextActive,
                ]}
              >
                {t('legal.privacyPolicy')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[s.tab, activeTab === 'terms' && s.tabActive]}
              onPress={() => setActiveTab('terms')}
            >
              <Feather
                name="file-text"
                size={14}
                color={activeTab === 'terms' ? theme.semantic.cyan : theme.L4.base.text.muted}
              />
              <Text
                style={[
                  s.tabText,
                  { color: activeTab === 'terms' ? theme.semantic.cyan : 'rgba(255,255,255,0.55)' },
                  activeTab === 'terms' && s.tabTextActive,
                ]}
              >
                {t('legal.termsOfService')}
              </Text>
            </Pressable>
          </View>

          {/* Version badge */}
          <View style={s.versionRow}>
            <Text style={[s.versionText, { color: theme.L4.base.text.muted }]}>
              {t('legal.version')}{' '}
              {activeTab === 'privacy' ? PRIVACY_POLICY_VERSION : TERMS_VERSION}
              {'  |  '}
              {t('legal.lastUpdated')} {activeTab === 'privacy' ? PRIVACY_POLICY_DATE : TERMS_DATE}
            </Text>
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={[s.scrollArea, resolveLayerStyle(theme.L3.base)]}
            contentContainerStyle={s.scrollContent}
            showsVerticalScrollIndicator
          >
            <Text style={[s.legalText, { color: theme.L4.base.text.primary }]}>
              {activeTab === 'privacy' ? PRIVACY_POLICY_TEXT : TERMS_OF_SERVICE_TEXT}
            </Text>
          </ScrollView>

          {/* Checkbox */}
          <Pressable
            style={s.checkboxRow}
            onPress={() => setAgreed(!agreed)}
            accessibilityRole="button"
          >
            <View style={[s.checkbox, agreed && s.checkboxChecked]}>
              {agreed && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={[s.checkboxLabel, { color: theme.L4.base.text.primary }]}>
              {t('legal.iAgree')}
            </Text>
          </Pressable>

          {/* Accept Button */}
          <Pressable
            accessibilityRole="button"
            style={(state: any) => [
              s.acceptBtn,
              {
                backgroundColor: agreed ? 'rgba(139,92,246,0.45)' : 'rgba(139,92,246,0.15)',
                borderColor: agreed ? 'rgba(139,92,246,0.6)' : 'rgba(139,92,246,0.2)',
              },
              !agreed && s.acceptBtnDisabled,
              agreed && state.hovered && s.acceptBtnHover,
            ]}
            onPress={handleAccept}
            disabled={!agreed}
          >
            <Feather
              name="check-circle"
              size={18}
              color={agreed ? '#fff' : 'rgba(255,255,255,0.5)'}
            />
            <Text
              style={[
                s.acceptBtnText,
                { color: agreed ? '#F5F3FF' : 'rgba(255,255,255,0.5)' },
                !agreed && s.acceptBtnTextDisabled,
              ]}
            >
              {t('legal.accept')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ backdropFilter: 'blur(8px)' }),
  },
  card: {
    width: '92%',
    maxWidth: 540,
    maxHeight: '90%',
    borderRadius: 22,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  tabActive: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {},
  versionRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  versionText: {
    fontSize: 11,
  },
  scrollArea: {
    maxHeight: 320,
    borderRadius: 14,
    marginBottom: 16,
  },
  scrollContent: {
    padding: 16,
  },
  legalText: {
    fontSize: 12,
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    ...webOnly({ cursor: 'pointer' }),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ transition: 'all 0.15s ease' }),
  },
  checkboxChecked: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(139,92,246,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.6)',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow: '0 0 14px rgba(139,92,246,0.3)',
    }),
  },
  acceptBtnDisabled: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.2)',
    ...webOnly({
      cursor: 'not-allowed',
      boxShadow: 'none',
    }),
  },
  acceptBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.6)',
    borderColor: 'rgba(139,92,246,0.8)',
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 24px rgba(139,92,246,0.5), 0 0 40px rgba(34,211,238,0.2)',
    }),
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  acceptBtnTextDisabled: {},
});

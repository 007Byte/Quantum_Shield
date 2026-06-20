/**
 * Terms of Service screen — WS1: In-app display of the terms of service.
 */

import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { TERMS_OF_SERVICE_TEXT, TERMS_VERSION, TERMS_DATE } from '@/constants/legal';

export default function TermsOfServiceScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <ShellLayout>
      <View style={[styles.contentWrapper, resolveLayerStyle(theme.L2.base)]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Feather name="file-text" size={24} color={theme.semantic.cyan} />
            <Text
              style={[styles.title, { color: theme.L2.base.text.primary }]}
              accessibilityRole="header"
            >
              {t('legal.termsOfService')}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: theme.L2.base.text.secondary }]}>
              {t('legal.version')} {TERMS_VERSION}
            </Text>
            <Text style={[styles.metaDot, { color: theme.L2.base.text.secondary }]}>
              {'  \u2022  '}
            </Text>
            <Text style={[styles.metaText, { color: theme.L2.base.text.secondary }]}>
              {t('legal.lastUpdated')} {TERMS_DATE}
            </Text>
          </View>
        </View>

        {/* Content */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
        >
          <Text style={[styles.legalText, { color: 'rgba(255,255,255,0.75)' }]}>
            {TERMS_OF_SERVICE_TEXT}
          </Text>
        </ScrollView>
      </View>
    </ShellLayout>
  );
}

const styles = StyleSheet.create({
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flex: 1,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  header: {
    marginBottom: dashboardSpacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
  },
  metaDot: {
    fontSize: 12,
  },
  scrollArea: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  scrollContent: {
    padding: 20,
  },
  legalText: {
    fontSize: 13,
    lineHeight: 20,
  },
});

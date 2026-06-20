import { StyleSheet, Text, View } from 'react-native';
import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '@/hooks/useLanguage';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme } from '@/theme/engine';
import { webOnly } from '@/utils/webStyle';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import {
  ToolCard,
  FileShredderTool,
  HashCheckerTool,
  SecureNotepadTool,
  QRCodeGeneratorTool,
  TextEncryptorTool,
  ChecksumValidatorTool,
} from '@/components/tools';
import type { ToolCategory } from '@/components/tools';

// ─── Full tool categories (matches original design) ──────────────────────────

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    id: 'security',
    titleKey: 'tools.categorySecurity',
    icon: 'shield',
    tools: [
      {
        id: 'defense',
        titleKey: 'tools.security.defense',
        descKey: 'tools.security.defenseDesc',
        icon: 'layers',
        color: '#8B5CF6',
        action: { type: 'navigate', route: '/(tabs)/defense' },
      },
      {
        id: 'brute-force',
        titleKey: 'tools.security.bruteForce',
        descKey: 'tools.security.bruteForceDesc',
        icon: 'shield',
        color: '#EF4444',
        action: { type: 'navigate', route: '/(tabs)/brute-force' },
      },
      {
        id: 'zero-trace',
        titleKey: 'tools.security.zeroTrace',
        descKey: 'tools.security.zeroTraceDesc',
        icon: 'eye-off',
        color: '#8B5CF6',
        action: { type: 'navigate', route: '/(tabs)/zero-trace' },
      },
      {
        id: 'health-check',
        titleKey: 'tools.security.healthCheck',
        descKey: 'tools.security.healthCheckDesc',
        icon: 'activity',
        color: '#22C55E',
        action: { type: 'navigate', route: '/(tabs)/health-check' },
      },
    ],
  },
  {
    id: 'usb',
    titleKey: 'tools.categoryUsb',
    icon: 'hard-drive',
    tools: [
      {
        id: 'setup-usb',
        titleKey: 'tools.usb.setupUsb',
        descKey: 'tools.usb.setupUsbDesc',
        icon: 'disc',
        color: '#22D3EE',
        action: { type: 'navigate', route: '/(tabs)/setup-usb' },
      },
      {
        id: 'reset-usb',
        titleKey: 'tools.usb.resetUsb',
        descKey: 'tools.usb.resetUsbDesc',
        icon: 'refresh-cw',
        color: '#EF4444',
        action: { type: 'navigate', route: '/(tabs)/reset-usb' },
      },
    ],
  },
  {
    id: 'backup',
    titleKey: 'tools.categoryBackup',
    icon: 'save',
    tools: [
      {
        id: 'backup-vault',
        titleKey: 'tools.backup.backupVault',
        descKey: 'tools.backup.backupVaultDesc',
        icon: 'upload-cloud',
        color: '#22D3EE',
        action: { type: 'navigate', route: '/(tabs)/backup' },
      },
      {
        id: 'restore-vault',
        titleKey: 'tools.backup.restoreVault',
        descKey: 'tools.backup.restoreVaultDesc',
        icon: 'download-cloud',
        color: '#8B5CF6',
        action: { type: 'navigate', route: '/(tabs)/restore' },
      },
    ],
  },
  {
    id: 'utility',
    titleKey: 'tools.categoryUtility',
    icon: 'tool',
    tools: [
      {
        id: 'file-shredder',
        titleKey: 'tools.utility.fileShredder',
        descKey: 'tools.utility.fileShredderDesc',
        icon: 'trash-2',
        color: '#EF4444',
        action: { type: 'inline', id: 'file-shredder' },
      },
      {
        id: 'hash-checker',
        titleKey: 'tools.utility.hashChecker',
        descKey: 'tools.utility.hashCheckerDesc',
        icon: 'check-circle',
        color: '#22D3EE',
        action: { type: 'inline', id: 'hash-checker' },
      },
      {
        id: 'secure-notepad',
        titleKey: 'tools.utility.secureNotepad',
        descKey: 'tools.utility.secureNotepadDesc',
        icon: 'edit-3',
        color: '#8B5CF6',
        action: { type: 'inline', id: 'secure-notepad' },
      },
      {
        id: 'qr-code-generator',
        titleKey: 'tools.utility.qrGenerator',
        descKey: 'tools.utility.qrGeneratorDesc',
        icon: 'grid',
        color: '#22C55E',
        action: { type: 'inline', id: 'qr-code-generator' },
      },
      {
        id: 'text-encryptor',
        titleKey: 'tools.utility.textEncryptor',
        descKey: 'tools.utility.textEncryptorDesc',
        icon: 'lock',
        color: '#22D3EE',
        action: { type: 'inline', id: 'text-encryptor' },
      },
      {
        id: 'checksum-validator',
        titleKey: 'tools.utility.checksumValidator',
        descKey: 'tools.utility.checksumValidatorDesc',
        icon: 'file-text',
        color: '#8B5CF6',
        action: { type: 'inline', id: 'checksum-validator' },
      },
    ],
  },
];

// ─── Inline tool renderer ─────────────────────────────────────────────────────

function InlineTool({ id }: { id: string }) {
  switch (id) {
    case 'file-shredder':
      return <FileShredderTool />;
    case 'hash-checker':
      return <HashCheckerTool />;
    case 'secure-notepad':
      return <SecureNotepadTool />;
    case 'qr-code-generator':
      return <QRCodeGeneratorTool />;
    case 'text-encryptor':
      return <TextEncryptorTool />;
    case 'checksum-validator':
      return <ChecksumValidatorTool />;
    default:
      return null;
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

function ToolsScreen() {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToolPress = useCallback(
    (tool: { action: { type: string; route?: string; id?: string }; id: string }) => {
      if (tool.action.type === 'navigate' && tool.action.route) {
        router.navigate(tool.action.route as any);
      } else {
        // Toggle inline expansion
        setExpandedId(prev => (prev === tool.id ? null : tool.id));
      }
    },
    [router]
  );

  return (
    <ShellLayout>
      <View style={styles.contentArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text
            style={[styles.pageTitle, { color: theme.L2.base.text.primary }]}
            accessibilityRole="header"
          >
            {t('tools.pageTitle')}
          </Text>
          <Text style={[styles.pageSubtitle, { color: theme.L2.base.text.secondary }]}>
            {t('tools.pageSubtitle')}
          </Text>
        </View>

        {/* Categories */}
        {TOOL_CATEGORIES.map(category => (
          <View key={category.id} style={styles.categorySection}>
            {/* Category Header */}
            <View style={styles.categoryHeader}>
              <Feather
                name={category.icon as any}
                size={18}
                color={theme.L2.base.text.primary}
              />
              <Text style={[styles.categoryTitle, { color: theme.L2.base.text.primary }]}>
                {t(category.titleKey)}
              </Text>
              <View style={[styles.countBadge, { backgroundColor: theme.semantic.purple + '30' }]}>
                <Text style={[styles.countBadgeText, { color: theme.semantic.purple }]}>
                  {category.tools.length}
                </Text>
              </View>
            </View>

            {/* Tools grid within category */}
            <View style={styles.toolsGrid}>
              {category.tools.map(tool => {
                const isExpanded = expandedId === tool.id;
                return (
                  <View
                    key={tool.id}
                    style={[styles.toolSlot, isExpanded && styles.toolSlotExpanded]}
                  >
                    <ToolCard
                      tool={tool}
                      t={t}
                      onPress={() => handleToolPress(tool)}
                      isExpanded={isExpanded}
                    />
                    {isExpanded && tool.action.type === 'inline' && (
                      <View style={[styles.expandedPanel, { borderLeftColor: tool.color }]}>
                        <InlineTool id={tool.action.type === 'inline' ? tool.action.id : ''} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </ShellLayout>
  );
}

export default withErrorBoundary(ToolsScreen, 'Tools');

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
  },
  header: {
    marginBottom: dashboardSpacing.xl,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 16,
    fontWeight: '400',
  },

  // ── Category Section ────────────────────────────────
  categorySection: {
    marginBottom: dashboardSpacing.xl,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: dashboardSpacing.md,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Tools Grid ──────────────────────────────────────
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dashboardSpacing.md,
  },
  toolSlot: {
    width: '48%',
    minWidth: 260,
  },
  toolSlotExpanded: {
    width: '100%',
  },
  expandedPanel: {
    marginTop: dashboardSpacing.sm,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: dashboardSpacing.md,
    backgroundColor: 'rgba(14,10,34,0.55)',
    ...webOnly({
      backdropFilter: 'blur(18px)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 0 20px rgba(139,92,246,0.08)',
    }),
  },
});

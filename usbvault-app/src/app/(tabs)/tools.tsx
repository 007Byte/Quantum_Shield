import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ToolCard {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

// ─── Tools Data ────────────────────────────────────────────────────────────────

const TOOLS: ToolCard[] = [
  {
    id: 'file-shredder',
    title: 'File Shredder',
    description: 'Securely delete files with multi-pass overwrite to prevent recovery.',
    icon: 'trash-2',
    color: '#EF4444',
  },
  {
    id: 'hash-checker',
    title: 'Hash Checker',
    description: 'Verify file integrity with SHA-256/512 cryptographic checksums.',
    icon: 'check-circle',
    color: '#22D3EE',
  },
  {
    id: 'secure-notepad',
    title: 'Secure Notepad',
    description: 'Encrypted scratchpad for sensitive notes and temporary data storage.',
    icon: 'edit-3',
    color: '#8B5CF6',
  },
  {
    id: 'qr-code-generator',
    title: 'QR Code Generator',
    description: 'Generate QR codes for secure vault sharing and quick access.',
    icon: 'grid',
    color: '#22C55E',
  },
  {
    id: 'text-encryptor',
    title: 'Text Encryptor',
    description: 'Encrypt/decrypt text snippets with post-quantum cryptography algorithms.',
    icon: 'lock',
    color: '#22D3EE',
  },
  {
    id: 'checksum-validator',
    title: 'Checksum Validator',
    description: 'Validate file checksums against known hashes for verification.',
    icon: 'file-text',
    color: '#8B5CF6',
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function ToolsScreen() {
  const { modal, showSuccess } = useInAppModal();

  const handleLaunchTool = () => {
    showSuccess('Coming Soon', 'This tool will be available in a future update');
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />
          <View style={styles.mainCol}>
            <TopBar />
            <View style={styles.contentArea}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.pageTitle}>Tools</Text>
                <Text style={styles.pageSubtitle}>Power utilities for advanced file and security operations</Text>
              </View>

              {/* Tools Grid */}
              <View style={styles.toolsGrid}>
                {TOOLS.map((tool) => (
                  <ToolCardComponent
                    key={tool.id}
                    tool={tool}
                    onPress={handleLaunchTool}
                  />
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
      <InAppModal config={modal} />
    </View>
  );
}

// ─── Tool Card Component ───────────────────────────────────────────────────────

function ToolCardComponent({ tool, onPress }: { tool: ToolCard; onPress: () => void }) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <Pressable
      style={(state: any) => [
        styles.toolCard,
        state.hovered && styles.toolCardHovered,
        isPressed && styles.toolCardPressed,
      ]}
      onPress={onPress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
    >
      {/* Icon Circle */}
      <View style={[styles.iconCircle, { backgroundColor: `${tool.color}15` }]}>
        <Feather
          name={tool.icon as any}
          size={28}
          color={tool.color}
        />
      </View>

      {/* Title */}
      <Text style={styles.toolTitle}>{tool.title}</Text>

      {/* Description */}
      <Text style={styles.toolDescription}>{tool.description}</Text>

      {/* Launch Button */}
      <Pressable
        style={(state: any) => [
          styles.launchButton,
          state.hovered && styles.launchButtonHovered,
        ]}
        onPress={onPress}
      >
        <Text style={styles.launchButtonText}>Launch</Text>
      </Pressable>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow: '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },

  // Header
  header: {
    marginBottom: dashboardSpacing.xl,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 16,
    color: dashboardColors.textSecondary,
    fontWeight: '400',
  },

  // Tools Grid
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dashboardSpacing.lg,
  },

  // Tool Card
  toolCard: {
    width: '48%',
    backgroundColor: dashboardColors.panel,
    borderWidth: 1,
    borderColor: dashboardColors.borderPurple,
    borderRadius: 18,
    padding: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...webOnly({
      backdropFilter: 'blur(18px)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.58), 0 0 25px rgba(139,92,246,0.18)',
      cursor: 'pointer',
      transition: 'all 0.25s ease',
    }),
  },
  toolCardHovered: {
    backgroundColor: dashboardColors.panelStrong,
    borderColor: 'rgba(139,92,246,0.6)',
    ...webOnly({
      boxShadow: '0 0 40px rgba(139,92,246,0.5), 0 0 80px rgba(34,211,238,0.35)',
      transform: 'translateY(-4px)',
    }),
  },
  toolCardPressed: {
    ...webOnly({
      transform: 'translateY(-2px)',
    }),
  },

  // Icon Circle
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },

  // Title
  toolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
    textAlign: 'center',
  },

  // Description
  toolDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: dashboardSpacing.lg,
    flex: 1,
  },

  // Launch Button
  launchButton: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.sm,
    backgroundColor: 'rgba(139,92,246,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.6)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      boxShadow: '0 0 14px rgba(139,92,246,0.3)',
    }),
  },
  launchButtonHovered: {
    backgroundColor: 'rgba(139,92,246,0.55)',
    borderColor: 'rgba(139,92,246,0.8)',
    ...webOnly({
      boxShadow: '0 0 24px rgba(139,92,246,0.5), 0 0 40px rgba(34,211,238,0.2)',
      transform: 'translateY(-1px)',
    }),
  },

  launchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
});

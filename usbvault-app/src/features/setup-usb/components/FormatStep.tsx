/**
 * Step 2 — Filesystem options, format type, and encryption algorithm.
 * Pure presentational component; all data arrives via props.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import type { FormatStepProps } from '../domain/setup-usb.types';
import { ALGORITHMS, FILE_SYSTEMS, FORMAT_TYPES } from '../domain/setup-usb.data';

export function FormatStep({
  vaultName,
  partitionName,
  formatType,
  fileSystem,
  algorithm,
  showPlatformFS,
  onChangeVaultName,
  onChangePartitionName,
  onChangeFormatType,
  onChangeFileSystem,
  onChangeAlgorithm,
  onTogglePlatformFS,
  t,
}: FormatStepProps) {
  const { theme } = useTheme();
  const styles = getFormatStepStyles(theme);

  const universalFS = FILE_SYSTEMS.filter(f => f.category === 'universal');
  const platformFSList = FILE_SYSTEMS.filter(f => f.category === 'platform');

  return (
    <View style={styles.stepContent}>
      <View
        style={[
          styles.card,
          resolveLayerStyle(theme.L2.base),
          {
            backgroundColor: theme.name === 'dark' ? 'rgba(8,5,20,0.55)' : 'rgba(255,255,255,0.6)',
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Feather name="hard-drive" size={24} color={theme.semantic.cyan} />
          <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
            {t('setupUsb.formatOptionsTitle')}
          </Text>
        </View>
        <Text style={[styles.cardDescription, { color: theme.L2.base.text.secondary }]}>
          {t('setupUsb.formatOptionsDesc')}
        </Text>

        {/* ── Vault Name ───────────────────────────────────────────── */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.optionGroupLabel, { color: theme.L2.base.text.primary }]}>
            Vault Name
          </Text>
          <View style={styles.inputRow}>
            <Feather name="edit-3" size={16} color={theme.semantic.cyan} style={styles.inputIcon} />
            <TextInput
              accessibilityLabel="My Vault"
              style={[styles.textInput, { color: theme.L2.base.text.primary }]}
              value={vaultName}
              onChangeText={onChangeVaultName}
              placeholder="My Vault"
              placeholderTextColor={theme.name === 'dark' ? '#4B5563' : '#A0A8B2'}
              maxLength={32}
            />
          </View>
          <Text style={[styles.fieldHint, { color: theme.L2.base.text.muted }]}>
            {vaultName.trim()
              ? `Logical vault identifier: "${vaultName.trim()}"`
              : 'Leave blank for default name (USBVault). Max 32 characters.'}
          </Text>
        </View>

        {/* ── Partition Name ────────────────────────────────────────── */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.optionGroupLabel, { color: theme.L2.base.text.primary }]}>
            Partition Name
          </Text>
          <View style={styles.inputRow}>
            <Feather
              name="hard-drive"
              size={16}
              color={theme.semantic.cyan}
              style={styles.inputIcon}
            />
            <TextInput
              accessibilityLabel="USBVAULT"
              style={[styles.textInput, { color: theme.L2.base.text.primary }]}
              value={partitionName}
              onChangeText={onChangePartitionName}
              placeholder="USBVAULT"
              placeholderTextColor={theme.name === 'dark' ? '#4B5563' : '#A0A8B2'}
              maxLength={11}
            />
          </View>
          <Text style={[styles.fieldHint, { color: theme.L2.base.text.muted }]}>
            {partitionName.trim()
              ? `Drive will appear as: ${
                  partitionName
                    .replace(/[^a-zA-Z0-9 _-]/g, '')
                    .trim()
                    .toUpperCase()
                    .slice(0, 11) || 'USBVAULT'
                }`
              : 'Name shown in Finder / File Explorer for the visible partition. Max 11 characters. Defaults to USBVAULT.'}
          </Text>
        </View>

        {/* ── Format Type ──────────────────────────────────────────── */}
        <Text style={[styles.optionGroupLabel, { color: theme.L2.base.text.primary }]}>
          {t('setupUsb.formatType')}
        </Text>
        <View style={styles.radioGroup}>
          {FORMAT_TYPES.map(opt => (
            <Pressable
              accessibilityRole="button"
              key={opt.value}
              style={[styles.radioItem, formatType === opt.value && styles.radioItemSelected]}
              onPress={() => onChangeFormatType(opt.value)}
            >
              <View
                style={[styles.radioButton, formatType === opt.value && styles.radioButtonSelected]}
              >
                {formatType === opt.value && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.radioLabelRow}>
                  <Feather
                    name={opt.icon}
                    size={14}
                    color={
                      formatType === opt.value ? theme.semantic.cyan : theme.L2.base.text.secondary
                    }
                  />
                  <Text style={[styles.radioLabel, { color: theme.L2.base.text.primary }]}>
                    {t(opt.labelKey)}
                  </Text>
                  <Text style={[styles.radioTime, { color: theme.L2.base.text.muted }]}>
                    {opt.time}
                  </Text>
                </View>
                <Text style={[styles.radioDescription, { color: theme.L2.base.text.secondary }]}>
                  {opt.desc}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* ── File System ──────────────────────────────────────────── */}
        <Text
          style={[styles.optionGroupLabel, { marginTop: 24, color: theme.L2.base.text.primary }]}
        >
          {t('setupUsb.fileSystem')}
        </Text>

        {/* Universal (recommended) */}
        <View style={styles.fsSection}>
          <View style={styles.fsSectionHeader}>
            <Feather name="globe" size={14} color={theme.semantic.success} />
            <Text style={[styles.fsSectionLabel, { color: theme.L2.base.text.primary }]}>
              Universal
            </Text>
            <View style={[styles.tagBadge, { backgroundColor: `${theme.semantic.success}26` }]}>
              <Text style={[styles.tagBadgeText, { color: theme.semantic.success }]}>
                Recommended
              </Text>
            </View>
          </View>
          {universalFS.map(fs => (
            <Pressable
              accessibilityRole="button"
              key={fs.id}
              style={[styles.fsItem, fileSystem === fs.id && styles.fsItemSelected]}
              onPress={() => onChangeFileSystem(fs.id)}
            >
              <View
                style={[styles.radioButton, fileSystem === fs.id && styles.radioButtonSelected]}
              >
                {fileSystem === fs.id && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.fsNameRow}>
                  <Text style={[styles.fsName, { color: theme.L2.base.text.primary }]}>
                    {fs.name}
                  </Text>
                  <Text style={[styles.fsPlatforms, { color: theme.L2.base.text.muted }]}>
                    {fs.platforms}
                  </Text>
                </View>
                <Text style={[styles.fsDescription, { color: theme.L2.base.text.secondary }]}>
                  {fs.description}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        {/* Platform-specific (expandable) */}
        <Pressable
          style={styles.platformToggle}
          onPress={onTogglePlatformFS}
          accessibilityRole="button"
        >
          <View style={styles.fsSectionHeader}>
            <Feather name="monitor" size={14} color={theme.L2.base.text.secondary} />
            <Text style={[styles.fsSectionLabel, { color: theme.L2.base.text.secondary }]}>
              Platform-Specific
            </Text>
          </View>
          <Feather
            name={showPlatformFS ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={theme.L2.base.text.secondary}
          />
        </Pressable>

        {showPlatformFS && (
          <View style={styles.fsSection}>
            {platformFSList.map(fs => (
              <Pressable
                accessibilityRole="button"
                key={fs.id}
                style={[styles.fsItem, fileSystem === fs.id && styles.fsItemSelected]}
                onPress={() => onChangeFileSystem(fs.id)}
              >
                <View
                  style={[styles.radioButton, fileSystem === fs.id && styles.radioButtonSelected]}
                >
                  {fileSystem === fs.id && <View style={styles.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.fsNameRow}>
                    <Text style={[styles.fsName, { color: theme.L2.base.text.primary }]}>
                      {fs.name}
                    </Text>
                    <Text style={[styles.fsPlatforms, { color: theme.L2.base.text.muted }]}>
                      {fs.platforms}
                    </Text>
                  </View>
                  <Text style={[styles.fsDescription, { color: theme.L2.base.text.secondary }]}>
                    {fs.description}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── Encryption Algorithm ─────────────────────────────────── */}
        <Text
          style={[styles.optionGroupLabel, { marginTop: 24, color: theme.L2.base.text.primary }]}
        >
          Encryption Algorithm
        </Text>
        <View style={styles.algoGroup}>
          {ALGORITHMS.map(algo => (
            <Pressable
              accessibilityRole="button"
              key={algo.id}
              style={[styles.algoCard, algorithm === algo.id && styles.algoCardSelected]}
              onPress={() => onChangeAlgorithm(algo.id)}
            >
              <View style={styles.algoHeader}>
                <View style={styles.algoIconWrap}>
                  <Feather
                    name={algo.icon as any}
                    size={18}
                    color={
                      algorithm === algo.id ? theme.semantic.cyan : theme.L2.base.text.secondary
                    }
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.algoNameRow}>
                    <Text
                      style={[
                        styles.algoName,
                        {
                          color:
                            algorithm === algo.id
                              ? theme.L2.base.text.primary
                              : theme.L2.base.text.secondary,
                        },
                      ]}
                    >
                      {algo.name}
                    </Text>
                    <View style={[styles.tagBadge, { backgroundColor: `${algo.tagColor}20` }]}>
                      <Text style={[styles.tagBadgeText, { color: algo.tagColor }]}>
                        {algo.tag}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.algoDesc, { color: theme.L2.base.text.muted }]}>
                    {algo.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radioButton,
                    { marginLeft: 8 },
                    algorithm === algo.id && styles.radioButtonSelected,
                  ]}
                >
                  {algorithm === algo.id && <View style={styles.radioDot} />}
                </View>
              </View>
              {algorithm === algo.id && (
                <View style={styles.algoSpecs}>
                  <Feather name="info" size={12} color={theme.L2.base.text.muted} />
                  <Text style={[styles.algoSpecsText, { color: theme.L2.base.text.muted }]}>
                    {algo.specs}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
export function getFormatStepStyles(theme: any) {
  return StyleSheet.create({
    stepContent: { marginBottom: dashboardSpacing.lg },
    card: {
      padding: dashboardSpacing.lg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}1a`,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: dashboardSpacing.md,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginLeft: dashboardSpacing.md,
      flex: 1,
    },
    cardDescription: {
      fontSize: 13,
      marginBottom: dashboardSpacing.lg,
    },

    fieldGroup: { marginBottom: dashboardSpacing.lg },
    fieldHint: { fontSize: 11, marginTop: 6 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: dashboardSpacing.md,
      paddingVertical: dashboardSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}33`,
      backgroundColor: `${theme.semantic.cyan}0d`,
      gap: dashboardSpacing.sm,
    },
    inputIcon: { flexShrink: 0 },
    textInput: {
      flex: 1,
      fontSize: 14,
      ...webOnly({ outline: 'none' }),
    },

    optionGroupLabel: {
      fontSize: 13,
      fontWeight: '600',
      marginBottom: dashboardSpacing.md,
    },
    radioGroup: { gap: dashboardSpacing.md },
    radioItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: dashboardSpacing.md,
      paddingVertical: dashboardSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}26`,
      ...webOnlyTransition,
    },
    radioItemSelected: {
      borderColor: theme.semantic.cyan,
      backgroundColor: `${theme.semantic.cyan}14`,
    },
    radioButton: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.L2.base.text.muted,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: dashboardSpacing.md,
      marginTop: 2,
      flexShrink: 0,
    },
    radioButtonSelected: { borderColor: theme.semantic.cyan },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.semantic.cyan,
    },
    radioLabel: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },
    radioLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 4,
    },
    radioTime: { fontSize: 11, marginLeft: 'auto' },
    radioDescription: { fontSize: 12, lineHeight: 17 },

    fsSection: { gap: dashboardSpacing.sm, marginBottom: dashboardSpacing.md },
    fsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: dashboardSpacing.sm,
    },
    fsSectionLabel: { fontSize: 12, fontWeight: '600' },
    fsItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: dashboardSpacing.md,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}1f`,
      ...webOnlyTransition,
    },
    fsItemSelected: {
      borderColor: theme.semantic.cyan,
      backgroundColor: `${theme.semantic.cyan}14`,
    },
    fsNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    fsName: { fontSize: 13, fontWeight: '600' },
    fsPlatforms: { fontSize: 11 },
    fsDescription: { fontSize: 11, lineHeight: 15 },
    platformToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: dashboardSpacing.sm,
      marginBottom: dashboardSpacing.sm,
    },

    tagBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    tagBadgeText: { fontSize: 10, fontWeight: '600' },

    algoGroup: { gap: dashboardSpacing.md },
    algoCard: {
      paddingHorizontal: dashboardSpacing.md,
      paddingVertical: dashboardSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}26`,
      ...webOnlyTransition,
    },
    algoCardSelected: {
      borderColor: theme.semantic.cyan,
      backgroundColor: `${theme.semantic.cyan}14`,
    },
    algoHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    algoIconWrap: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: `${theme.semantic.cyan}1a`,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: dashboardSpacing.md,
      flexShrink: 0,
    },
    algoNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
      flexWrap: 'wrap',
    },
    algoName: { fontSize: 13, fontWeight: '600' },
    algoDesc: { fontSize: 11, lineHeight: 15 },
    algoSpecs: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${theme.semantic.cyan}1a`,
    },
    algoSpecsText: { fontSize: 11, flex: 1 },
  });
}

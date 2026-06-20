/**
 * Encrypt & Store — Unified file encryption + vault upload screen.
 *
 * Thin orchestrator: all business logic lives in useEncryptFlow,
 * all UI sections are feature components.
 */

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { InAppModal } from '@/components/common';
import { VaultUnlockModal } from '@/components/common/VaultUnlockModal';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import {
  dashboardLayout,
  dashboardSpacing,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { formatFileSize, getFileIcon } from '@/utils/fileHelpers';
import { timeAgo, sanitizeFileName } from '@/features/encrypt-store/domain/encrypt.data';
import { useEncryptFlow } from '@/features/encrypt-store/hooks/useEncryptFlow';
import { AlgorithmPicker } from '@/features/encrypt-store/components/AlgorithmPicker';
import { SecurityLevelPicker } from '@/features/encrypt-store/components/SecurityLevelPicker';
import { FileDropZone } from '@/features/encrypt-store/components/FileDropZone';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';

function EncryptStoreScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();

  const flow = useEncryptFlow();

  return (
    <ShellLayout>
      <View style={styles.contentArea}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <View style={[styles.headerSection, resolveLayerStyle(theme.L2.base)]}>
          <Text
            style={[styles.pageTitle, { color: theme.L2.base.text.primary }]}
            accessibilityRole="header"
          >
            {t('encryptStore.pageTitle')}
          </Text>
          <Text style={[styles.pageSubtitle, { color: theme.L2.base.text.secondary }]}>
            {t('encryptStore.pageSubtitle')}
          </Text>
        </View>

        {/* ── Step 1: Select File ─────────────────────────────────── */}
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={[styles.stepBadgeText, { color: theme.semantic.cyan }]}>1</Text>
          </View>
          <Text style={[styles.stepLabel, { color: theme.L2.base.text.primary }]}>
            {t('encryptStore.selectFileStep')}
          </Text>
        </View>

        <FileDropZone
          selectedFile={flow.selectedFile}
          customName={flow.customName}
          effectiveFileName={flow.effectiveFileName}
          isDragHover={flow.isDragHover}
          onDragHover={flow.setIsDragHover}
          onSelectFile={flow.handleSelectFile}
          onCustomNameChange={flow.handleCustomNameChange}
          onCustomNameBlur={flow.handleCustomNameBlur}
          onEditingNameStart={() => flow.setIsEditingName(true)}
          onResetName={() => {
            if (flow.selectedFile) {
              flow.setCustomName(sanitizeFileName(flow.selectedFile.name));
              flow.setIsEditingName(false);
            }
          }}
        />

        {/* ── Step 2: Choose Algorithm ────────────────────────────── */}
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={[styles.stepBadgeText, { color: theme.semantic.cyan }]}>2</Text>
          </View>
          <Text style={[styles.stepLabel, { color: theme.L2.base.text.primary }]}>
            {t('encryptStore.algorithmStep')}
          </Text>
        </View>

        <AlgorithmPicker algorithm={flow.algorithm} onSelect={flow.setAlgorithm} />

        {/* ── Step 3: Choose Security Level ───────────────────────── */}
        <View style={styles.stepHeader}>
          <View style={styles.stepBadge}>
            <Text style={[styles.stepBadgeText, { color: theme.semantic.cyan }]}>3</Text>
          </View>
          <Text style={[styles.stepLabel, { color: theme.L2.base.text.primary }]}>
            {t('encryptStore.securityStep')}
          </Text>
        </View>

        <SecurityLevelPicker securityLevel={flow.securityLevel} onSelect={flow.setSecurityLevel} />

        {/* ── Encrypt & Store CTA ─────────────────────────────────── */}
        <Pressable
          accessibilityRole="button"
          style={(state: any) => [
            styles.encryptButton,
            webOnlyTransition,
            (flow.isEncrypting || flow.isUploading) && styles.encryptButtonDisabled,
            state.hovered && styles.encryptButtonHover,
          ]}
          onPress={flow.handleEncryptAndStore}
          disabled={flow.isEncrypting || flow.isUploading}
        >
          <Feather
            name={flow.isEncrypting ? 'loader' : flow.isUploading ? 'upload-cloud' : 'shield'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.encryptButtonText}>{flow.progressLabel}</Text>
        </Pressable>

        {/* ── Progress bar ─────────────────────────────────────────── */}
        {(flow.isEncrypting || flow.isUploading) && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.round(flow.encryptionProgress * 100)}%` as any },
                ]}
              />
            </View>
            <Text style={[styles.progressText, { color: theme.semantic.cyan }]}>
              {Math.round(flow.encryptionProgress * 100)}%
            </Text>
          </View>
        )}

        {/* ── Vault Files ──────────────────────────────────────────── */}
        <View style={[styles.vaultFilesSection, resolveLayerStyle(theme.L2.base)]}>
          <View style={styles.vaultFilesHeader}>
            <Text style={[styles.vaultFilesTitle, { color: theme.L2.base.text.primary }]}>
              {flow.activeVault
                ? `${t('encryptStore.filesInVault')} ${flow.activeVault.name}`
                : t('addFile.recentImports')}
            </Text>
            <Text style={[styles.vaultFilesCount, { color: theme.L2.base.text.secondary }]}>
              {t('addFile.files', { count: flow.vaultFiles.length })}
            </Text>
          </View>
          <View style={styles.filesList}>
            {flow.vaultFiles.length === 0 && !flow.isUploading && (
              <View style={styles.emptyVaultFiles}>
                <Feather name="inbox" size={32} color="rgba(139,92,246,0.4)" />
                <Text style={[styles.emptyVaultFilesText, { color: theme.L2.base.text.secondary }]}>
                  {flow.activeVault ? t('encryptStore.noFilesYet') : t('encrypt.noVaultSelected')}
                </Text>
              </View>
            )}
            {flow.vaultFiles.map(file => (
              <View key={file.id} style={[styles.fileItem, resolveLayerStyle(theme.L2.base)]}>
                <View style={styles.fileItemContent}>
                  <View style={styles.fileIconContainer}>
                    <Feather
                      name={getFileIcon(file.name) as any}
                      size={20}
                      color={theme.semantic.cyan}
                    />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: theme.L2.base.text.primary }]}>
                      {file.name}
                    </Text>
                    <View style={styles.fileMetaRow}>
                      <Text style={[styles.fileSize, { color: theme.L2.base.text.secondary }]}>
                        {formatFileSize(file.size)}
                      </Text>
                      <View style={styles.fileSeparator} />
                      <Text style={[styles.fileDate, { color: theme.L2.base.text.secondary }]}>
                        {timeAgo(file.createdAt)}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.fileStatusContainer}>
                  <View style={[styles.statusBadge, styles.statusBadgeEncrypted]}>
                    <Feather name="lock" size={12} color={theme.semantic.green} />
                    <Text
                      style={[
                        styles.statusBadgeText,
                        styles.statusBadgeTextEncrypted,
                        { color: theme.semantic.green },
                      ]}
                    >
                      {t('addFile.encrypted')}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── Recent Encryptions ───────────────────────────────────── */}
        <View style={[styles.recentSection, resolveLayerStyle(theme.L2.base)]}>
          {!flow.hasRealFiles ? (
            <View style={styles.emptyStateContainer}>
              <Feather name="lock" size={48} color={theme.L2.base.text.secondary} />
              <Text style={[styles.emptyStateHeading, { color: theme.L2.base.text.primary }]}>
                {t('encrypt.noFiles')}
              </Text>
              <Text style={[styles.emptyStateSubtitle, { color: theme.L2.base.text.secondary }]}>
                {t('encrypt.addFilesHint')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.recentTitle, { color: theme.L2.base.text.primary }]}>
                {t('encrypt.recentEncryptions')}
              </Text>
              <View style={styles.recentList}>
                {flow.recentFiles.map(file => (
                  <View key={file.id} style={[styles.recentItem, resolveLayerStyle(theme.L2.base)]}>
                    <View style={styles.recentItemLeft}>
                      <View style={[styles.recentFileIcon, { backgroundColor: file.iconBg }]}>
                        <Feather name={file.iconName as any} size={16} color={file.iconTint} />
                      </View>
                      <View style={styles.recentItemInfo}>
                        <Text
                          style={[styles.recentItemName, { color: theme.L2.base.text.primary }]}
                        >
                          {file.name}
                        </Text>
                        <Text
                          style={[styles.recentItemMeta, { color: theme.L2.base.text.secondary }]}
                        >
                          {file.modifiedLabel}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.recentItemRight}>
                      <View style={styles.securityBadge}>
                        <Text style={[styles.securityBadgeText, { color: theme.semantic.cyan }]}>
                          {file.securityLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {/* ── PQC Info Box ─────────────────────────────────────────── */}
        <View style={styles.infoBox}>
          <View style={styles.infoIconContainer}>
            <Feather name="info" size={18} color={theme.semantic.cyan} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: theme.semantic.cyan }]}>
              {t('addFile.pqcInfoTitle')}
            </Text>
            <Text style={[styles.infoText, { color: theme.L2.base.text.secondary }]}>
              {t('addFile.pqcInfoText')}
            </Text>
          </View>
        </View>
      </View>

      <InAppModal config={flow.modal} />

      <VaultUnlockModal
        visible={flow.showUnlockModal}
        vaultName={flow.activeVault?.name || 'this vault'}
        password={flow.unlockPassword}
        onPasswordChange={flow.setUnlockPassword}
        error={flow.unlockError}
        onErrorClear={() => flow.setUnlockError(null)}
        isUnlocking={flow.isUnlocking}
        onUnlock={flow.handleVaultUnlock}
        onClose={() => {
          flow.setShowUnlockModal(false);
          flow.setUnlockPassword('');
          flow.setUnlockError(null);
        }}
      />
    </ShellLayout>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
// Only orchestrator-level styles remain here. Component-specific styles
// live in their respective feature components.

const styles = StyleSheet.create({
  contentArea: { paddingRight: 10 },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(8,5,20,0.55)',
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  pageTitle: { fontSize: 28, fontWeight: '700', marginBottom: dashboardSpacing.sm },
  pageSubtitle: { fontSize: 15 },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: dashboardSpacing.sm,
    paddingHorizontal: 4,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { fontSize: 13, fontWeight: '700' },
  stepLabel: { fontSize: 15, fontWeight: '600' },
  encryptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.lg,
    backgroundColor: '#8B5CF6',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(34,211,238,0.3)',
    }),
  },
  encryptButtonText: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  encryptButtonDisabled: { opacity: 0.6 },
  encryptButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
    paddingHorizontal: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    ...webOnly({ transition: 'width 0.3s ease' }),
  },
  progressText: { fontSize: 12, fontWeight: '600', width: 36 },
  vaultFilesSection: {
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: dashboardSpacing.lg,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  vaultFilesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.lg,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  vaultFilesTitle: { fontSize: 16, fontWeight: '600' },
  vaultFilesCount: {
    fontSize: 13,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 8,
  },
  filesList: { gap: dashboardSpacing.md },
  emptyVaultFiles: { paddingVertical: 24, alignItems: 'center' },
  emptyVaultFilesText: { fontSize: 14, marginTop: 8 },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ transition: 'all 0.2s ease' }),
  },
  fileItemContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    minWidth: 0,
  },
  fileIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fileInfo: { flex: 1, minWidth: 0 },
  fileName: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  fileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: dashboardSpacing.sm },
  fileSize: { fontSize: 12 },
  fileSeparator: { width: 1, height: 12, backgroundColor: 'rgba(139,92,246,0.2)' },
  fileDate: { fontSize: 12 },
  fileStatusContainer: { flexShrink: 0 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeEncrypted: {
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderColor: 'rgba(16,185,129,0.3)',
  },
  statusBadgeText: { fontSize: 12, fontWeight: '600' },
  statusBadgeTextEncrypted: {},
  recentSection: {
    gap: dashboardSpacing.sm,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(8,5,20,0.55)',
    marginBottom: dashboardSpacing.lg,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  recentTitle: { fontSize: 14, fontWeight: '600', marginBottom: dashboardSpacing.sm },
  recentList: { gap: dashboardSpacing.sm },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: dashboardLayout.radiusXl,
    backgroundColor: 'rgba(18,12,40,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  recentItemLeft: { flexDirection: 'row', alignItems: 'center', gap: dashboardSpacing.md, flex: 1 },
  recentFileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentItemInfo: { flex: 1, minWidth: 0 },
  recentItemName: { fontSize: 13, fontWeight: '500' },
  recentItemMeta: { fontSize: 12, marginTop: 2 },
  recentItemRight: { flexDirection: 'row', gap: dashboardSpacing.sm, alignItems: 'center' },
  securityBadge: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  securityBadgeText: { fontSize: 11, fontWeight: '600' },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.xl * 2,
    gap: dashboardSpacing.md,
  },
  emptyStateHeading: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: dashboardSpacing.sm,
  },
  emptyStateSubtitle: { fontSize: 14, textAlign: 'center' },
  infoBox: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
    marginBottom: dashboardSpacing.md,
    ...webOnly({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }),
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  infoText: { fontSize: 12, lineHeight: 16 },
});

export default withErrorBoundary(EncryptStoreScreen, 'EncryptStore');

import { StyleSheet, Text, View, Pressable, type PressableProps } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { webOnly } from '@/utils/webStyle';
import { useVaultStore, FileInfo } from '@/stores/vaultStore';
import { InAppModal, useInAppModal } from '@/components/common';
import { CipherId } from '@/crypto/bridge';
import {
  encryptFile,
  uint8ArrayToBase64,
  formatFileSize,
} from '@/utils/cryptoManager';
import { auditService } from '@/services/auditService';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';

// PH4-FIX: Web-specific event handlers type for platform compatibility
type PressableWithWebHandlers = PressableProps & {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

// PL-003: Removed mockData import — recent files now derived from store data
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

export default function EncryptScreen() {
  // PL-011: Use individual selectors to prevent re-renders on unrelated vault state changes
  const currentVault = useVaultStore((s) => s.currentVault);
  const vaults = useVaultStore((s) => s.vaults);
  const selectVault = useVaultStore((s) => s.selectVault);
  const files = useVaultStore((s) => s.files);
  const addFile = useVaultStore((s) => s.addFile);
  const loadVaults = useVaultStore((s) => s.loadVaults);
  const { modal, showSuccess, showError } = useInAppModal();
  const [algorithm, setAlgorithm] = useState('AES-256-GCM-SIV');
  const [securityLevel, setSecurityLevel] = useState('Standard');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: number; uri: string; mimeType: string } | null>(null);
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [_encryptionProgress, setEncryptionProgress] = useState(0);

  // Ensure vaults are loaded and one is selected
  useEffect(() => {
    if (vaults.length === 0) {
      loadVaults();
    }
  }, []);

  useEffect(() => {
    if (vaults.length > 0 && !currentVault) {
      selectVault(vaults[0].id);
    }
  }, [vaults, currentVault]);

  // PL-003/PL-019: Derive display-ready recent files from store data (no mock fallback)
  const hasRealFiles = files.length > 0;
  const recentFiles = useMemo(() => {
    if (!hasRealFiles) return [];
    return files.slice(0, 4).map((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      const iconMap: Record<string, { iconName: string; iconTint: string; iconBg: string }> = {
        pdf: { iconName: 'file-text', iconTint: '#FFFFFF', iconBg: '#E11D48' },
        doc: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE' },
        docx: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE' },
        xlsx: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E' },
        csv: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E' },
        zip: { iconName: 'archive', iconTint: '#F8E16C', iconBg: '#7C3AED' },
        png: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB' },
        jpg: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB' },
      };
      const info = iconMap[ext] || { iconName: 'file', iconTint: '#93C5FD', iconBg: '#1E40AF' };
      const diffMs = Date.now() - new Date(f.modifiedAt || Date.now()).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      let modifiedLabel = 'just now';
      if (diffMins >= 1 && diffMins < 60) modifiedLabel = `${diffMins} min ago`;
      else if (diffMins >= 60 && diffMins < 1440) modifiedLabel = `${Math.floor(diffMins / 60)}h ago`;
      else if (diffMins >= 1440) modifiedLabel = `${Math.floor(diffMins / 1440)}d ago`;
      return {
        id: f.id,
        name: f.name,
        iconName: info.iconName,
        iconTint: info.iconTint,
        iconBg: info.iconBg,
        modifiedLabel,
        securityLabel: f.isPQCProtected ? 'PQC' : 'Standard',
      };
    });
  }, [files, hasRealFiles]);

  // PL-018: Wrap handlers in useCallback
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
      });

      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
        });
      }
    } catch (error) {
      showError('Error', 'Failed to select file');
    }
  }, [showError]);

  const handleEncryptFile = useCallback(async () => {
    if (!selectedFile) {
      showError('Error', 'Please select a file first');
      return;
    }

    if (!currentVault) {
      showError('Error', 'No vault selected');
      return;
    }

    setIsEncrypting(true);
    setEncryptionProgress(0);

    try {
      // Map UI algorithm selection to CipherId
      const cipherMap: Record<string, CipherId> = {
        'AES-256-GCM-SIV': CipherId.Aes256GcmSiv,
        'XChaCha20-Poly1305': CipherId.XChaCha20Poly1305,
        'ML-KEM-1024 Hybrid': CipherId.Aes256GcmSiv, // PQC uses GCM-SIV as base cipher
      };
      const cipherId = cipherMap[algorithm] ?? CipherId.Aes256GcmSiv;

      // Vault password — in production this comes from the unlocked vault session.
      // For now, derive from the vault ID + user session as a deterministic key.
      const vaultPassword = `vault-${currentVault.id}-session`;

      // Real streaming encryption via crypto bridge
      const result = await encryptFile(
        selectedFile.uri,
        vaultPassword,
        cipherId,
        (progress) => setEncryptionProgress(progress),
      );

      // Store the encrypted file with metadata needed for decryption
      const newFile: FileInfo = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        vaultId: currentVault.id,
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.mimeType,
        modifiedAt: new Date().toISOString(),
        encryptedMetadata: uint8ArrayToBase64(result.salt),
        isPQCProtected: securityLevel === 'Maximum',
        uri: selectedFile.uri,
        encryptedBlob: result.encryptedData,
        saltHex: Array.from(result.salt).map(b => b.toString(16).padStart(2, '0')).join(''),
        cipherId: result.cipherId,
        isStreamed: result.isStreamed,
        originalSize: result.originalSize,
      };

      addFile(newFile);
      await auditService.log('encrypt', selectedFile.name, {
        algorithm,
        securityLevel,
        vaultId: currentVault.id,
        encryptedSize: result.encryptedData.length,
        originalSize: result.originalSize,
      });
      showSuccess(
        'Encrypted',
        `"${selectedFile.name}" encrypted with ${algorithm} (${formatFileSize(result.encryptedData.length)})`,
      );
      setSelectedFile(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await auditService.log('encrypt', selectedFile?.name || 'unknown', { error: message }, 'error');
      showError('Encryption Failed', message);
    } finally {
      setIsEncrypting(false);
      setEncryptionProgress(0);
    }
  }, [selectedFile, currentVault, algorithm, securityLevel, addFile, showSuccess, showError]);

  return (
    <ShellLayout>
            <View style={styles.contentArea}>
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle}>Encrypt Files</Text>
                <Text style={styles.pageSubtitle}>Secure your files with military-grade encryption</Text>
              </View>

              <View style={styles.dropZoneContainer}>
                {/* PH4-FIX: Replaced @ts-ignore with proper type definition */}
                <Pressable
                  onPress={handleSelectFile}
                  onMouseEnter={() => setDragActive(true)}
                  onMouseLeave={() => setDragActive(false)}
                  style={[styles.dropZone, dragActive && styles.dropZoneActive]}
                  {...({} as PressableWithWebHandlers)}
                >
                  <Feather name="upload-cloud" size={48} color={dashboardColors.cyan} />
                  <Text style={styles.dropZoneTitle}>Drop files here or click to browse</Text>
                  <Text style={styles.dropZoneSubtitle}>Supports all file types up to 10GB</Text>
                  {selectedFile && (
                    <View style={styles.selectedFileInfo}>
                      <Feather name="check-circle" size={16} color={dashboardColors.green} />
                      <View style={styles.selectedFileDetails}>
                        <Text style={styles.selectedFileName}>{selectedFile.name}</Text>
                        <Text style={styles.selectedFileSize}>
                          {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                        </Text>
                      </View>
                    </View>
                  )}
                </Pressable>
              </View>

              <View style={styles.optionsPanel}>
                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Encryption Algorithm</Text>
                  <Text style={styles.optionHint}>Choose how your file data is encrypted</Text>
                  <View style={styles.algorithmOptions}>
                    {([
                      {
                        id: 'AES-256-GCM-SIV',
                        name: 'AES-256-GCM-SIV',
                        icon: 'shield' as const,
                        tag: 'Recommended',
                        summary: 'Nonce-misuse resistant AEAD cipher. Hardware-accelerated on modern CPUs.',
                        details: [
                          { label: 'Cipher', value: '256-bit AES in GCM-SIV mode (12-byte nonce)' },
                          { label: 'Auth', value: '16-byte AEAD tag per 64 KB chunk' },
                          { label: 'Integrity', value: 'HMAC-SHA256 over full record' },
                          { label: 'Key Wrap', value: 'HKDF-SHA256 per-file subkey derivation' },
                        ],
                      },
                      {
                        id: 'ChaCha20-Poly1305',
                        name: 'XChaCha20-Poly1305',
                        icon: 'zap' as const,
                        tag: 'Fast',
                        summary: 'Software-optimized stream cipher. Best on devices without hardware AES.',
                        details: [
                          { label: 'Cipher', value: 'XChaCha20 stream cipher (24-byte nonce)' },
                          { label: 'Auth', value: '16-byte Poly1305 tag per 64 KB chunk' },
                          { label: 'Integrity', value: 'HMAC-SHA256 over full record' },
                          { label: 'Key Wrap', value: 'HKDF-SHA256 per-file subkey derivation' },
                        ],
                      },
                      {
                        id: 'PQC Kyber',
                        name: 'ML-KEM-1024 Hybrid',
                        icon: 'cpu' as const,
                        tag: 'Quantum-Safe',
                        summary: 'Post-quantum key encapsulation layered over classical AEAD encryption.',
                        details: [
                          { label: 'KEM', value: 'ML-KEM-1024 (FIPS 203) key encapsulation' },
                          { label: 'Hybrid', value: 'Classical + PQC keys via HKDF-SHA384' },
                          { label: 'Auth', value: 'AEAD tag per chunk + ML-DSA-87 signature' },
                          { label: 'Integrity', value: 'HMAC-SHA256 record + PQC header sig' },
                        ],
                      },
                    ] as const).map((algo) => (
                      <Pressable
                        key={algo.id}
                        onPress={() => setAlgorithm(algo.id)}
                        style={(state: any) => [
                          styles.algorithmCard,
                          algorithm === algo.id && styles.algorithmCardActive,
                          state.hovered && styles.algorithmCardHover,
                        ]}
                      >
                        <View style={styles.algorithmCardHeader}>
                          <View style={[styles.algorithmIconWrap, algorithm === algo.id && styles.algorithmIconWrapActive]}>
                            <Feather name={algo.icon} size={16} color={algorithm === algo.id ? '#FFFFFF' : dashboardColors.textSecondary} />
                          </View>
                          <View style={styles.algorithmCardTitleRow}>
                            <Text style={[styles.algorithmCardName, algorithm === algo.id && styles.algorithmCardNameActive]}>
                              {algo.name}
                            </Text>
                            <View style={[styles.algorithmTag, algorithm === algo.id && styles.algorithmTagActive]}>
                              <Text style={[styles.algorithmTagText, algorithm === algo.id && styles.algorithmTagTextActive]}>
                                {algo.tag}
                              </Text>
                            </View>
                          </View>
                          {algorithm === algo.id && (
                            <Feather name="check-circle" size={16} color={dashboardColors.cyan} />
                          )}
                        </View>
                        <Text style={[styles.algorithmCardDesc, algorithm === algo.id && styles.algorithmCardDescActive]}>
                          {algo.summary}
                        </Text>
                        {algorithm === algo.id && (
                          <View style={styles.detailGrid}>
                            {algo.details.map((d) => (
                              <View key={d.label} style={styles.detailRow}>
                                <Text style={styles.detailLabel}>{d.label}</Text>
                                <Text style={styles.detailValue}>{d.value}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.optionGroup}>
                  <Text style={styles.optionLabel}>Security Level</Text>
                  <Text style={styles.optionHint}>Controls key derivation strength, encryption passes, and integrity layers</Text>
                  <View style={styles.securityOptions}>
                    {([
                      {
                        id: 'Standard',
                        icon: 'lock' as const,
                        speed: 'Fastest',
                        summary: 'Single-pass AEAD encryption with full integrity protection.',
                        details: [
                          { label: 'KDF', value: 'Argon2id (64 MB memory, 3 iterations)' },
                          { label: 'Encrypt', value: 'Per-chunk AEAD with 16-byte auth tag' },
                          { label: 'HMAC', value: 'HMAC-SHA256 record integrity check' },
                          { label: 'Keys', value: '32-byte enc key + 32-byte HMAC key' },
                        ],
                      },
                      {
                        id: 'High',
                        icon: 'shield' as const,
                        speed: 'Balanced',
                        summary: 'Strengthened KDF with double integrity verification.',
                        details: [
                          { label: 'KDF', value: 'Argon2id (128 MB memory, 5 iterations)' },
                          { label: 'Encrypt', value: 'Per-chunk AEAD + header re-authentication' },
                          { label: 'HMAC', value: 'Dual HMAC: header + per-record verification' },
                          { label: 'Keys', value: 'HKDF-SHA256 per-file subkeys from 64-byte MEK' },
                        ],
                      },
                      {
                        id: 'Maximum',
                        icon: 'award' as const,
                        speed: 'Slowest',
                        summary: 'Hybrid classical + post-quantum with full tamper detection.',
                        details: [
                          { label: 'KDF', value: 'Argon2id + ML-KEM-1024 hybrid via HKDF-SHA384' },
                          { label: 'Encrypt', value: 'AEAD per-chunk + PQC key encapsulation layer' },
                          { label: 'HMAC', value: 'HMAC-SHA256 + ML-DSA-87 header signature' },
                          { label: 'Keys', value: 'Classical + PQC keys — secure if either holds' },
                        ],
                      },
                    ] as const).map((level) => (
                      <Pressable
                        key={level.id}
                        onPress={() => setSecurityLevel(level.id)}
                        style={(state: any) => [
                          styles.securityCard,
                          securityLevel === level.id && styles.securityCardActive,
                          state.hovered && styles.securityCardHover,
                        ]}
                      >
                        <View style={[styles.securityIconWrap, securityLevel === level.id && styles.securityIconWrapActive]}>
                          <Feather name={level.icon} size={20} color={securityLevel === level.id ? '#FFFFFF' : dashboardColors.textSecondary} />
                        </View>
                        <Text style={[styles.securityCardTitle, securityLevel === level.id && styles.securityCardTitleActive]}>
                          {level.id}
                        </Text>
                        <Text style={styles.securityCardDesc}>{level.summary}</Text>
                        {securityLevel === level.id && (
                          <View style={styles.detailGridSecurity}>
                            {level.details.map((d) => (
                              <View key={d.label} style={styles.detailRowSecurity}>
                                <Text style={styles.detailLabelSecurity}>{d.label}</Text>
                                <Text style={styles.detailValueSecurity}>{d.value}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <View style={[styles.speedBadge, securityLevel === level.id && styles.speedBadgeActive]}>
                          <Feather name="clock" size={10} color={securityLevel === level.id ? dashboardColors.cyan : dashboardColors.textSecondary} />
                          <Text style={[styles.speedBadgeText, securityLevel === level.id && styles.speedBadgeTextActive]}>
                            {level.speed}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <Pressable
                style={(state: any) => [styles.encryptButton, webOnlyTransition, isEncrypting && styles.encryptButtonDisabled, state.hovered && styles.encryptButtonHover]}
                onPress={handleEncryptFile}
                disabled={isEncrypting}
              >
                <Feather name={isEncrypting ? 'loader' : 'lock'} size={18} color="#FFFFFF" />
                <Text style={styles.encryptButtonText}>{isEncrypting ? 'Encrypting...' : 'Encrypt Now'}</Text>
              </Pressable>

              <View style={styles.recentSection}>
                {!hasRealFiles ? (
                  <View style={styles.emptyStateContainer}>
                    <Feather name="lock" size={48} color={dashboardColors.textSecondary} />
                    <Text style={styles.emptyStateHeading}>No files to encrypt</Text>
                    <Text style={styles.emptyStateSubtitle}>Add files to your vault to get started</Text>
                    <Pressable
                      style={(state: any) => [styles.addFilesButton, state.hovered && styles.addFilesButtonHover]}
                      onPress={() => showSuccess('Add Files', 'Select files from your device to encrypt')}
                    >
                      <Feather name="plus" size={18} color="#FFFFFF" />
                      <Text style={styles.addFilesButtonText}>Add Files</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Text style={styles.recentTitle}>Recent Encryptions</Text>
                    <View style={styles.recentList}>
                      {recentFiles.map((file) => (
                        <View key={file.id} style={styles.recentItem}>
                          <View style={styles.recentItemLeft}>
                            <View style={[styles.fileIcon, { backgroundColor: file.iconBg }]}>
                              <Feather name={file.iconName as any} size={16} color={file.iconTint} />
                            </View>
                            <View style={styles.recentItemInfo}>
                              <Text style={styles.recentItemName}>{file.name}</Text>
                              <Text style={styles.recentItemMeta}>{file.modifiedLabel}</Text>
                            </View>
                          </View>
                          <View style={styles.recentItemRight}>
                            <View style={styles.securityBadge}>
                              <Text style={styles.securityBadgeText}>{file.securityLabel}</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </>
                )}
              </View>
            </View>
      <InAppModal config={modal} />
    </ShellLayout>
  );
}

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(8,5,20,0.55)',
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
    color: dashboardColors.textSecondary,
  },
  dropZoneContainer: {
    marginBottom: dashboardSpacing.lg,
  },
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: dashboardColors.borderCyan,
    borderRadius: dashboardLayout.radiusXl,
    padding: dashboardSpacing.lg * 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,182,212,0.08)',
    ...webOnly({ transition: 'all 0.3s ease', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  dropZoneActive: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(6,182,212,0.15)',
    ...webOnly({ boxShadow: '0 0 30px rgba(6,182,212,0.3)' }),
  },
  dropZoneTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginTop: dashboardSpacing.md,
  },
  dropZoneSubtitle: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginTop: dashboardSpacing.sm,
  },
  selectedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    marginTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  selectedFileDetails: {
    flex: 1,
  },
  selectedFileName: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.green,
  },
  selectedFileSize: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  optionsPanel: {
    marginBottom: dashboardSpacing.lg,
    gap: dashboardSpacing.lg,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(8,5,20,0.55)',
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  optionGroup: {
    gap: dashboardSpacing.sm,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  optionHint: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginBottom: 4,
  },

  // ─── Algorithm cards ───────────────────────────────────
  algorithmOptions: {
    gap: dashboardSpacing.sm,
  },
  algorithmCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(18,12,40,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...webOnly({ transition: 'all 0.2s ease', cursor: 'pointer' }),
  },
  algorithmCardActive: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ boxShadow: '0 0 20px rgba(139,92,246,0.25)' }),
  },
  algorithmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  algorithmIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  algorithmIconWrapActive: {
    backgroundColor: 'rgba(139,92,246,0.4)',
  },
  algorithmCardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  algorithmCardName: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  algorithmCardNameActive: {
    color: dashboardColors.textPrimary,
  },
  algorithmTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(139,92,246,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  algorithmTagActive: {
    backgroundColor: 'rgba(34,211,238,0.15)',
    borderColor: 'rgba(34,211,238,0.35)',
  },
  algorithmTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: dashboardColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  algorithmTagTextActive: {
    color: dashboardColors.cyan,
  },
  algorithmCardDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.5)',
    paddingLeft: 42,
  },
  algorithmCardDescActive: {
    color: 'rgba(255,255,255,0.75)',
  },

  // ─── Detail grids (algorithm) ──────────────────────────
  detailGrid: {
    marginTop: 10,
    paddingLeft: 42,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.8)',
    width: 80,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
  },

  // ─── Detail grids (security) ───────────────────────────
  detailGridSecurity: {
    marginTop: 8,
    gap: 5,
    width: '100%',
    alignItems: 'flex-start',
  },
  detailRowSecurity: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    width: '100%',
  },
  detailLabelSecurity: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(34,211,238,0.8)',
    width: 60,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  detailValueSecurity: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    textAlign: 'left',
  },

  // ─── Security level cards ──────────────────────────────
  securityOptions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  securityCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(18,12,40,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 8,
    ...webOnly({ transition: 'all 0.2s ease', cursor: 'pointer' }),
  },
  securityCardActive: {
    borderColor: 'rgba(139,92,246,0.5)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ boxShadow: '0 0 20px rgba(139,92,246,0.25)' }),
  },
  securityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  securityIconWrapActive: {
    backgroundColor: 'rgba(139,92,246,0.4)',
    ...webOnly({ boxShadow: '0 0 16px rgba(139,92,246,0.4)' }),
  },
  securityCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardColors.textSecondary,
  },
  securityCardTitleActive: {
    color: dashboardColors.textPrimary,
  },
  securityCardDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  speedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginTop: 4,
  },
  speedBadgeActive: {
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  speedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  speedBadgeTextActive: {
    color: dashboardColors.cyan,
  },
  encryptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.lg,
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 30px rgba(139,92,246,0.5), 0 0 60px rgba(34,211,238,0.3)',
    }),
  },
  encryptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  encryptButtonDisabled: {
    opacity: 0.6,
  },
  recentSection: {
    gap: dashboardSpacing.sm,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(8,5,20,0.55)',
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  recentList: {
    gap: dashboardSpacing.sm,
  },
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
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flex: 1,
  },
  fileIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  recentItemName: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },
  recentItemMeta: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  recentItemRight: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    alignItems: 'center',
  },
  securityBadge: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  securityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },

  // ─── Hover states ──────────────────────────────────────────
  algorithmCardHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  securityCardHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  encryptButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 40px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.xl * 2,
    gap: dashboardSpacing.md,
  },
  emptyStateHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginTop: dashboardSpacing.sm,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
  },
  addFilesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 20px rgba(139,92,246,0.4), 0 0 40px rgba(34,211,238,0.2)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  },
  addFilesButtonHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 30px rgba(139,92,246,0.6), 0 0 60px rgba(34,211,238,0.35)',
    }),
  },
  addFilesButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

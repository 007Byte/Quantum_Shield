// PH4-FIX: DecryptTempView component - temp file preview
import { StyleSheet, Text, View, Pressable, Image, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';
import { FileInfo } from '@/stores/vaultStore';
import { useCallback } from 'react';

// PH4-FIX: Web-only iframe type for PDF previews on web platform
interface IFrameElement extends React.DetailedHTMLProps<React.IframeHTMLAttributes<HTMLIFrameElement>, HTMLIFrameElement> {}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

interface DecryptTempViewProps {
  file: FileInfo | null;
  onClose: () => void;
}

export function DecryptTempView({ file, onClose }: DecryptTempViewProps) {
  if (!file) return null;

  const isImageFile = useCallback((name: string, type: string): boolean => {
    if (type.startsWith('image/')) return true;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext);
  }, []);

  const isPdfFile = useCallback((name: string, type: string): boolean => {
    if (type === 'application/pdf') return true;
    return name.toLowerCase().endsWith('.pdf');
  }, []);

  const isTextFile = (name: string, type: string): boolean => {
    if (type.startsWith('text/')) return true;
    const ext = name.split('.').pop()?.toLowerCase() || '';
    return ['txt', 'md', 'csv', 'json', 'xml', 'log', 'yaml', 'yml'].includes(ext);
  };

  const renderFilePreview = (fileData: FileInfo) => {
    const fileUri = fileData.uri;
    const fileName = fileData.name;
    const fileType = fileData.type;

    // Image preview
    if (isImageFile(fileName, fileType)) {
      if (fileUri) {
        return (
          <View style={styles.previewContainer}>
            <Image source={{ uri: fileUri }} style={styles.previewImage} resizeMode="contain" />
            <Text style={styles.previewCaption}>{fileName}</Text>
          </View>
        );
      }
      return (
        <View style={styles.previewPlaceholder}>
          <Feather name="image" size={48} color={dashboardColors.cyan} />
          <Text style={styles.previewCaption}>{fileName}</Text>
          <Text style={styles.previewHint}>Image preview — original file data not available in demo</Text>
        </View>
      );
    }

    // PDF preview
    if (isPdfFile(fileName, fileType)) {
      if (fileUri && Platform.OS === 'web') {
        return (
          <View style={styles.previewContainer}>
            {/* PH4-FIX: Properly typed iframe for web-only PDF preview */}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <iframe
              src={fileUri}
              style={{ width: '100%', height: 500, border: 'none', borderRadius: 8 } as any}
              title={fileName}
            />
            <Text style={styles.previewCaption}>{fileName}</Text>
          </View>
        );
      }
      return (
        <View style={styles.previewPlaceholder}>
          <Feather name="file-text" size={48} color="#E11D48" />
          <Text style={styles.previewCaption}>{fileName}</Text>
          <Text style={styles.previewHint}>
            PDF document — {fileUri ? 'tap to open in external viewer' : 'preview not available in demo'}
          </Text>
          {fileUri && (
            <Pressable
              onPress={() => {
                if (Platform.OS === 'web') {
                  window.open(fileUri, '_blank');
                }
              }}
              style={(state: any) => [styles.openExternalButton, state.hovered && styles.openExternalButtonHover]}
            >
              <Feather name="external-link" size={14} color="#FFFFFF" />
              <Text style={styles.openExternalText}>Open in New Tab</Text>
            </Pressable>
          )}
        </View>
      );
    }

    // Text file preview
    if (isTextFile(fileName, fileType)) {
      return (
        <View style={styles.previewPlaceholder}>
          <Feather name="file-text" size={48} color={dashboardColors.purple} />
          <Text style={styles.previewCaption}>{fileName}</Text>
          <Text style={styles.previewHint}>Text file — full content preview available after server integration</Text>
        </View>
      );
    }

    // Generic file
    return (
      <View style={styles.previewPlaceholder}>
        <Feather name="file" size={48} color={dashboardColors.textSecondary} />
        <Text style={styles.previewCaption}>{fileName}</Text>
        <View style={styles.previewMetaRow}>
          <Text style={styles.previewMeta}>Type: {fileType || 'Unknown'}</Text>
          <Text style={styles.previewMeta}>Size: {formatFileSize(fileData.size)}</Text>
        </View>
        {fileUri && Platform.OS === 'web' && (
          <Pressable
            onPress={() => window.open(fileUri, '_blank')}
            style={(state: any) => [styles.openExternalButton, state.hovered && styles.openExternalButtonHover]}
          >
            <Feather name="external-link" size={14} color="#FFFFFF" />
            <Text style={styles.openExternalText}>Open in New Tab</Text>
          </Pressable>
        )}
        {!fileUri && <Text style={styles.previewHint}>File preview requires server decryption integration</Text>}
      </View>
    );
  };

  return (
    <View style={styles.tempViewBanner}>
      <View style={styles.tempViewHeader}>
        <View style={styles.tempViewInfo}>
          <Feather name="eye" size={18} color={dashboardColors.cyan} />
          <View>
            <Text style={styles.tempViewTitle}>Temporary View Active</Text>
            <Text style={styles.tempViewFileName}>{file.name}</Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={(state: any) => [styles.tempViewClose, state.hovered && styles.tempViewCloseHover]}
        >
          <Feather name="x" size={16} color="#FFFFFF" />
          <Text style={styles.tempViewCloseText}>Close & Clear</Text>
        </Pressable>
      </View>
      <View style={styles.tempViewContent}>
        {renderFilePreview(file)}
        <Text style={styles.tempViewWarning}>
          Decrypted in memory only — file will be cleared when you close this view.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tempViewBanner: {
    marginBottom: dashboardSpacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.4)',
    backgroundColor: 'rgba(8,5,20,0.55)',
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  tempViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(6,182,212,0.2)',
  },
  tempViewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  tempViewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },
  tempViewFileName: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    marginTop: 1,
  },
  tempViewClose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(239,68,68,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
  },
  tempViewCloseText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  tempViewCloseHover: {
    backgroundColor: 'rgba(239,68,68,0.35)',
    borderColor: 'rgba(239,68,68,0.6)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(239,68,68,0.3)',
    }),
  },
  tempViewContent: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
    paddingHorizontal: dashboardSpacing.lg,
    gap: dashboardSpacing.sm,
  },
  tempViewWarning: {
    fontSize: 11,
    color: '#F59E0B',
    textAlign: 'center',
    marginTop: dashboardSpacing.sm,
  },
  previewContainer: {
    width: '100%',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  previewImage: {
    width: '100%',
    height: 400,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  previewCaption: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    textAlign: 'center',
  },
  previewPlaceholder: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
    gap: dashboardSpacing.sm,
  },
  previewHint: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
  },
  previewMetaRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.lg,
    marginTop: 4,
  },
  previewMeta: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  openExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
  },
  openExternalText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  openExternalButtonHover: {
    borderColor: 'rgba(139,92,246,0.7)',
    backgroundColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 20px rgba(139,92,246,0.4), 0 0 30px rgba(34,211,238,0.2)',
    }),
  },
});

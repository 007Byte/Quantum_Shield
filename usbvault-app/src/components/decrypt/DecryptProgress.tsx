// PH4-FIX: DecryptProgress component - progress indicator
import { StyleSheet, Text, View } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';

interface DecryptProgressProps {
  isDecrypting: boolean;
  progress: number;
}

export function DecryptProgress({ isDecrypting, progress }: DecryptProgressProps) {
  if (!isDecrypting) return null;

  return (
    <View style={styles.container}>
      <View style={styles.progressBarBg}>
        <View
          style={[styles.progressBarFill, { width: `${Math.round(progress * 100)}%` } as any]}
        />
      </View>
      <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: dashboardSpacing.md,
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(139,92,246,0.15)',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    ...webOnly({
      background: 'linear-gradient(90deg, #8B5CF6 0%, #22D3EE 100%)',
      transition: 'width 0.3s ease',
    }),
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.cyan,
    textAlign: 'center',
  },
});

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import { useTheme } from '@/theme/engine';

interface WipeOptionsProps {
  secureWipeEnabled: boolean;
  onToggleSecureWipe: (enabled: boolean) => void;
  panelStyle: any;
  labels: {
    deletionOptions: string;
    quickDelete: string;
    quickDeleteDesc: string;
    secureWipe: string;
    secureWipeLabel: string;
    irreversible: string;
  };
}

export function WipeOptions({
  secureWipeEnabled,
  onToggleSecureWipe,
  panelStyle,
  labels,
}: WipeOptionsProps) {
  const { theme } = useTheme();
  return (
    <View style={[styles.panelCard, panelStyle]}>
      <Text style={[styles.panelTitle, { color: theme.L2.base.text.primary }]}>
        {labels.deletionOptions}
      </Text>

      <View style={styles.optionGroup}>
        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={() => onToggleSecureWipe(false)}
        >
          <View style={styles.optionLeft}>
            <Feather name="zap" size={20} color={theme.semantic.purple} />
            <View style={styles.optionText}>
              <Text style={[styles.optionName, { color: theme.L2.base.text.primary }]}>
                {labels.quickDelete}
              </Text>
              <Text style={[styles.optionDescription, { color: theme.L2.base.text.secondary }]}>
                {labels.quickDeleteDesc}
              </Text>
            </View>
          </View>
          <View style={[styles.radioButton, !secureWipeEnabled && styles.radioButtonSelected]}>
            {!secureWipeEnabled && <View style={styles.radioButtonDot} />}
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          style={styles.optionRow}
          onPress={() => onToggleSecureWipe(true)}
        >
          <View style={styles.optionLeft}>
            <Feather name="shield" size={20} color={theme.semantic.purple} />
            <View style={styles.optionText}>
              <Text style={[styles.optionName, { color: theme.L2.base.text.primary }]}>
                {labels.secureWipe}
              </Text>
              <Text style={[styles.optionDescription, { color: theme.L2.base.text.secondary }]}>
                {labels.secureWipeLabel}
              </Text>
            </View>
          </View>
          <View style={[styles.radioButton, secureWipeEnabled && styles.radioButtonSelected]}>
            {secureWipeEnabled && <View style={styles.radioButtonDot} />}
          </View>
        </Pressable>
      </View>

      {/* Warning Banner */}
      <View style={styles.warningBanner}>
        <Feather name="alert-circle" size={18} color="#d97706" />
        <Text style={styles.warningText}>{labels.irreversible}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelCard: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(124, 58, 237, 0.2)',
    borderWidth: 1,
    borderRadius: 12,
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.md,
    ...webOnlyTransition,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#a78bfa',
  },
  optionGroup: {
    gap: 12,
    marginBottom: dashboardSpacing.md,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(124, 58, 237, 0.05)',
    borderColor: 'rgba(124, 58, 237, 0.1)',
    borderWidth: 1,
  },
  optionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionText: {
    flex: 1,
  },
  optionName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#a78bfa',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderColor: '#7c3aed',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    backgroundColor: 'transparent',
  },
  radioButtonSelected: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: '#7c3aed',
  },
  radioButtonDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7c3aed',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderColor: 'rgba(217, 119, 6, 0.2)',
    borderWidth: 1,
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#f59e0b',
    fontWeight: '500',
  },
});

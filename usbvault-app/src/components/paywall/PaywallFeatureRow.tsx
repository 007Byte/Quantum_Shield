/**
 * PaywallFeatureRow — Single feature comparison row for the paywall.
 * Shows a feature label with check/cross icons per tier.
 */

import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface PaywallFeatureRowProps {
  label: string;
  free: boolean;
  pro: boolean;
  enterprise: boolean;
  colors: any;
}

export function PaywallFeatureRow({
  label,
  free,
  pro,
  enterprise,
  colors,
}: PaywallFeatureRowProps) {
  const renderIcon = (available: boolean) => (
    <View style={styles.iconCell}>
      <Feather
        name={available ? 'check' : 'x'}
        size={16}
        color={available ? colors.success : colors.textMuted}
      />
    </View>
  );

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      {renderIcon(free)}
      {renderIcon(pro)}
      {renderIcon(enterprise)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: {
    flex: 1,
    fontSize: 13,
  },
  iconCell: {
    width: 70,
    alignItems: 'center',
  },
});

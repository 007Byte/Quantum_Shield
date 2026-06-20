import { StyleSheet, Text, View, FlatList } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import { useTheme } from '@/theme/engine';
import type { DeleteHistoryEntry } from '../domain/remove-file.types';

interface DeleteHistoryProps {
  history: DeleteHistoryEntry[];
  panelStyle: any;
  labels: {
    deletionHistory: string;
    secureWipeLabel: string;
    quickDelete: string;
    noHistory: string;
  };
}

export function DeleteHistory({ history, panelStyle, labels }: DeleteHistoryProps) {
  const { theme } = useTheme();
  const renderHistoryItem = ({ item }: { item: DeleteHistoryEntry }) => (
    <View style={styles.historyItem}>
      <View style={styles.historyIconContainer}>
        <Feather
          name={item.method === 'secure' ? 'lock' : 'trash-2'}
          size={16}
          color={theme.semantic.purple}
        />
      </View>
      <View style={styles.historyInfo}>
        <Text style={[styles.historyFilename, { color: theme.L2.base.text.primary }]}>
          {item.filename}
        </Text>
        <Text style={[styles.historyDetails, { color: theme.L2.base.text.secondary }]}>
          {item.date} • {item.method === 'secure' ? labels.secureWipeLabel : labels.quickDelete}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.panelCard, panelStyle]}>
      <Text style={[styles.panelTitle, { color: theme.L2.base.text.primary }]}>
        {labels.deletionHistory}
      </Text>

      {history.length > 0 ? (
        <FlatList
          data={history}
          renderItem={renderHistoryItem}
          keyExtractor={item => item.id}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.emptyState}>
          <Feather name="inbox" size={40} color={theme.L2.base.text.muted} />
          <Text style={[styles.emptyStateText, { color: theme.L2.base.text.secondary }]}>
            {labels.noHistory}
          </Text>
        </View>
      )}
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
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomColor: 'rgba(124, 58, 237, 0.1)',
    borderBottomWidth: 1,
    gap: 12,
  },
  historyIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyInfo: {
    flex: 1,
  },
  historyFilename: {
    fontSize: 14,
    fontWeight: '500',
    color: '#a78bfa',
    marginBottom: 4,
  },
  historyDetails: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
  },
});

import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getAllTransactions,
  getTotalSpent,
  getTransactionsGroupedByCategory,
  type CategoryTotal,
  type TransactionEntity,
} from '@/db/transactions';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-gifted-charts';

const PALETTE = ['#ff7300', '#3f8efc', '#2ecc71', '#e74c3c', '#9b59b6'];

export default function TabTwoScreen() {
  const db = useSQLiteContext();
  const [totalCents, setTotalCents] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<TransactionEntity[]>([]);

  useFocusEffect(
    useCallback(() => {
      getTotalSpent(db).then(setTotalCents);
      getTransactionsGroupedByCategory(db).then(setCategoryTotals);
      getAllTransactions(db).then(setTransactions);
    }, [db]),
  );

  return (
    // NativeTabs（src/components/app-tabs.tsx）已经给每个页面自动包了一层
    // 只处理 bottom 安全区的 SafeAreaView（flex: 1）。这里只需要再处理
    // top/left/right，不能再叠加 bottom padding，否则底部会被吃掉两次，
    // 导致下面的 FlatList 可用高度比预期矮一截。
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ThemedView style={styles.header}>
        <ThemedText type="title">总消费：${(totalCents / 100).toFixed(2)}</ThemedText>

        <PieChart
          data={categoryTotals.map((c, i) => ({
            value: c.total_amount_cents,
            text: c.category + ` $${(c.total_amount_cents / 100).toFixed(2)}`,
            color: PALETTE[i % PALETTE.length],
          }))}
          showText
          textColor="#fff"
          textSize={12}
        />
      </ThemedView>

      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ThemedView style={styles.listItem}>
            <ThemedView style={styles.listItemRow}>
              <ThemedText style={styles.listItemCategory}>{item.category}</ThemedText>
              <ThemedText style={styles.listItemAmount}>
                ${(item.amountCents / 100).toFixed(2)}
              </ThemedText>
            </ThemedView>

            <ThemedText style={styles.listItemDate} themeColor="textSecondary">
              {new Date(item.createdAt).toLocaleDateString()}
            </ThemedText>

            {item.note && <ThemedText style={styles.listItemNote}>{item.note}</ThemedText>}
          </ThemedView>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  list: {
    flex: 1,
    alignSelf: 'stretch',
  },
  listContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
  },
  listItem: {
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  listItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  listItemCategory: {
    fontSize: 18,
    fontWeight: '600',
  },
  listItemAmount: {
    fontSize: 18,
    fontWeight: '600',
  },
  listItemDate: {
    fontSize: 14,
    marginTop: Spacing.half,
  },
  listItemNote: {
    fontSize: 15,
    marginTop: Spacing.half,
  },
});

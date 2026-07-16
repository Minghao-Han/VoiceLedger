import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { safeAreaStyles } from '@/app/index';
import { getAllTransactions, getTotalSpent, getTransactionsGroupedByCategory, TransactionEntity, type CategoryTotal } from '@/db/transactions';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-gifted-charts';


export default function TabTwoScreen() {
  const db = useSQLiteContext();
  const [totalCents, setTotalCents] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);
  const [transactions, setTransactions] = useState<TransactionEntity[]>([]);

  useFocusEffect(
    useCallback(() => {
      // 三个查询各自独立发起、互不等待，跟之前讲的一样。000000000000000
      getTotalSpent(db).then(setTotalCents);
      getTransactionsGroupedByCategory(db).then(setCategoryTotals);
      getAllTransactions(db).then(setTransactions);
    }, [db]),
  );
  const PALETTE = ['#ff7300', '#3f8efc', '#2ecc71', '#e74c3c', '#9b59b6'];

  return (
    <>  
      {/* <ThemedView style={styles.container}>  */}
        <SafeAreaView style={safeAreaStyles.safeArea}>  
          <ThemedView style={styles.centerGroup}> 
            <ThemedText type="title">总消费：${(totalCents / 100).toFixed(2)}</ThemedText>

            <PieChart
              data={categoryTotals.map((c, i) => ({
                value: c.total_amount_cents,
                text: c.category+` $${(c.total_amount_cents / 100).toFixed(2)}`,
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
            renderItem={({ item }) => (
              
              <ThemedView style={styles.listItem}>
                <ThemedView style={styles.listItemRow}>
                  <ThemedText style={styles.listItemCategory}>{item.category}</ThemedText>
                  <ThemedText style={styles.listItemAmount}>${(item.amountCents / 100).toFixed(2)}</ThemedText>
                </ThemedView>

                <ThemedText style={styles.listItemDate} themeColor="textSecondary">
                  {new Date(item.createdAt).toLocaleDateString()}
                </ThemedText>

                {item.note && <ThemedText style={styles.listItemNote}>{item.note}</ThemedText>}
              </ThemedView>
            )}
          />
        </SafeAreaView> 
      {/* </ThemedView> */}
    </>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  centerGroup: {
    // flex: 1,
    // justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
  list: {
    height: 400, // 先写死一个数字，不用 flex，纯粹测试
    // flex: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgb(255, 0, 0)', // 调试用
  },
  listItem: {
    paddingVertical: Spacing.two,
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

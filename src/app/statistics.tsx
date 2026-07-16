import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { safeAreaStyles } from '@/app/index';
import { getTotalSpent, getTransactionsGroupedByCategory, type CategoryTotal } from '@/db/transactions';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useFocusEffect } from 'expo-router';
import { PieChart } from 'react-native-gifted-charts';


export default function TabTwoScreen() {
  const db = useSQLiteContext();
  const [totalCents, setTotalCents] = useState(0);
  const [categoryTotals, setCategoryTotals] = useState<CategoryTotal[]>([]);

  useFocusEffect(
    useCallback(() => {
      getTotalSpent(db).then(setTotalCents);
      getTransactionsGroupedByCategory(db).then(setCategoryTotals);
    }, [db]),
  );
  const PALETTE = ['#ff7300', '#3f8efc', '#2ecc71', '#e74c3c', '#9b59b6'];

  return (
    <>  
      <ThemedView style={styles.container}> 
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
        </SafeAreaView> 
      </ThemedView>
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
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.three,
  },
});

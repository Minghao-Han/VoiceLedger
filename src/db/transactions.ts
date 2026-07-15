import type { SQLiteDatabase } from 'expo-sqlite';

export type NewTransaction = {
  amountCents: number;
  currency: 'USD' | 'RMB';
  category: string;
  note?: string;
};

export async function insertTransaction(db: SQLiteDatabase, data: NewTransaction) {
  await db.runAsync(
    'INSERT INTO transactions (amount_cents, currency, category, note, created_at) VALUES (?, ?, ?, ?, ?)',
    data.amountCents,
    data.currency,
    data.category,
    data.note ?? null,
    Date.now(),
  );
}

export async function getTransactionsGroupedByCategory(db: SQLiteDatabase) {
  const result = await db.runAsync(`
    SELECT category, SUM(amount_cents) as total_amount_cents
    FROM transactions
    GROUP BY category
  `);
  return result;
}

export async function getTotalSpent(db: SQLiteDatabase): Promise<number> {
  // 1. 使用 getFirstAsync 获取单行数据，并定义返回的类型结构
  const result = await db.getFirstAsync<{ total_spent: number | null }>(`
    SELECT SUM(amount_cents) as total_spent
    FROM transactions
  `);

  // 2. 如果表中没有数据，SUM 可能会返回 null，所以用 ?? 兜底
  return result?.total_spent ?? 0;
}
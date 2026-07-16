import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDb(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      category TEXT NOT NULL,
      note TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
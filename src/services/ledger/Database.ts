import { QuickSQLiteConnection, open } from 'react-native-quick-sqlite';
import { DEFAULT_CATEGORIES } from './Schema';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'kaikei.sqlite';

export class Database {
  private static instance: QuickSQLiteConnection;

  public static getInstance(): QuickSQLiteConnection {
    if (!Database.instance) {
      Database.instance = open({ name: DB_NAME });
    }
    return Database.instance;
  }

  public static init(): void {
    const db = Database.getInstance();

    // Enable WAL mode for concurrency
    db.execute('PRAGMA journal_mode = WAL');

    // Create Categories Table
    db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE,
        keywords TEXT NOT NULL, -- JSON array
        budgetLimit REAL,
        isCustom BOOLEAN DEFAULT 0
      );
    `);

    // Create Expenses Table
    db.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        description TEXT,
        categoryId TEXT NOT NULL,
        source TEXT NOT NULL,
        rawText TEXT,
        transactionId TEXT UNIQUE, -- Add transactionId
        isVerified BOOLEAN DEFAULT 0,
        synced BOOLEAN DEFAULT 0,
        FOREIGN KEY(categoryId) REFERENCES categories(id)
      );
    `);

    // Create Ignored Transactions Table
    db.execute(`
      CREATE TABLE IF NOT EXISTS ignored_transactions (
        transactionId TEXT PRIMARY KEY NOT NULL
      );
    `);

    // Check for transactionId column and migrate if missing
    try {
      const tableInfo = db.execute('PRAGMA table_info(expenses)');
      // row: { cid, name, type, notnull, dflt_value, pk }
      const hasTransactionId = tableInfo.rows?._array.some((col: any) => col.name === 'transactionId');

      if (!hasTransactionId) {
        console.log('Migrating: Adding transactionId column to expenses...');
        db.execute('ALTER TABLE expenses ADD COLUMN transactionId TEXT');
        console.log('Migrating: Creating unique index for transactionId...');
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_transactionId ON expenses(transactionId)');
        console.log('Migration successful.');
      } else {
        console.log('Database is up to date (transactionId exists).');
      }
    } catch (e) {
      console.error('Migration failed:', e);
    }

    // Seed Defaults if empty
    const result = db.execute('SELECT COUNT(*) as count FROM categories');
    if (result.rows?._array[0].count === 0) {
      console.log('Seeding default categories...');
      DEFAULT_CATEGORIES.forEach(cat => {
        const id = uuidv4(); // We'll need a UUID generator. Using simple random for now if uuid missing
        db.execute(
          'INSERT INTO categories (id, name, keywords, isCustom) VALUES (?, ?, ?, ?)',
          [id, cat.name, JSON.stringify(cat.keywords), cat.isCustom ? 1 : 0]
        );
      });
    }
  }
}

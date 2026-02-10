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

    // Initial Index Creation (moved from migrations for new installs)
    db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_recipient_nocase ON expenses(recipient COLLATE NOCASE)');
    db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
    db.execute('CREATE INDEX IF NOT EXISTS idx_unverified_raw ON expenses(id) WHERE isVerified = 0 AND rawText IS NOT NULL');

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

      // 2. Migration: excludeFromAnalytics (for internal transfers)
      const hasExcludeCol = tableInfo.rows?._array.some((col: any) => col.name === 'excludeFromAnalytics');
      if (!hasExcludeCol) {
        console.log('Migrating: Adding excludeFromAnalytics column...');
        db.execute('ALTER TABLE expenses ADD COLUMN excludeFromAnalytics BOOLEAN DEFAULT 0');
      }

      // 3. Migration: type (income vs expense)
      const hasTypeCol = tableInfo.rows?._array.some((col: any) => col.name === 'type');
      if (!hasTypeCol) {
        console.log('Migrating: Adding type column...');
        db.execute("ALTER TABLE expenses ADD COLUMN type TEXT DEFAULT 'expense'");
      }

      // 4. Migration: sender and recipient
      const hasSenderCol = tableInfo.rows?._array.some((col: any) => col.name === 'sender');
      if (!hasSenderCol) {
        console.log('Migrating: Adding sender column...');
        db.execute("ALTER TABLE expenses ADD COLUMN sender TEXT");
      }

      const hasRecipientCol = tableInfo.rows?._array.some((col: any) => col.name === 'recipient');
      if (!hasRecipientCol) {
        console.log('Migrating: Adding recipient column...');
        db.execute("ALTER TABLE expenses ADD COLUMN recipient TEXT");
      }

      // 6. Migration: Index on recipient (for Smart Suggestions)
      // Use NOCASE to match the query using COLLATE NOCASE
      console.log('Migrating: Checking recipient index...');
      db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_recipient_nocase ON expenses(recipient COLLATE NOCASE)');

      // 7. Migration: Index on Date (for general sorting speed)
      console.log('Migrating: Checking date index...');
      db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');

      // 5. Migration: isVerified
      const hasVerifiedCol = tableInfo.rows?._array.some((col: any) => col.name === 'isVerified');
      if (!hasVerifiedCol) {
        console.log('Migrating: Adding isVerified column...');
        db.execute("ALTER TABLE expenses ADD COLUMN isVerified BOOLEAN DEFAULT 0");
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

  public async executeAsync(sql: string, params: any[] = []): Promise<any> {
    const db = Database.getInstance();
    // QuickSQLite 8.x supports executeAsync. 
    // Note: The types might differ slightly, returning a Promise<QueryResult>
    return db.executeAsync(sql, params);
  }
}

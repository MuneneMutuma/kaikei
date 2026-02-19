import { open } from '@op-engineering/op-sqlite';
import { DEFAULT_CATEGORIES } from './Schema';
import { v4 as uuidv4 } from 'uuid';
import { KeyManager } from '../security/KeyManager';

const DB_NAME = 'kaikei_v2.sqlite';

export class Database {
  private static instance: any;

  public static getInstance(): any {
    if (!Database.instance) {
      throw new Error("Database not initialized. Call init() first.");
    }
    return Database.instance;
  }

  // Helper to normalize row access
  public static getRows(result: any): any[] {
    if (result.rows?._array) return result.rows._array;
    if (Array.isArray(result.rows)) return result.rows;
    // Fallback for iterator
    const items = [];
    if (result.rows && typeof result.rows.length === 'number') {
      for (let i = 0; i < result.rows.length; i++) {
        // @ts-ignore
        if (result.rows.item) items.push(result.rows.item(i));
      }
    }
    return items;
  }

  private static initPromise: Promise<void> | null = null;

  public static async init(): Promise<void> {
    if (Database.instance) return;
    if (Database.initPromise) return Database.initPromise;

    Database.initPromise = (async () => {
      try {
        const encryptionKey = await KeyManager.getEncryptionKey();

        Database.instance = open({
          name: DB_NAME,
          encryptionKey: encryptionKey
        });

        const db = Database.instance;
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

        // Create Settings Table (Phase 4)
        db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT
        );
      `);


        // Create Expenses Table (Comprehensive Schema v2)
        db.execute(`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY NOT NULL,
          amount REAL NOT NULL,
          date TEXT NOT NULL,
          description TEXT,
          categoryId TEXT NOT NULL,
          source TEXT NOT NULL,
          rawText TEXT,
          transactionId TEXT UNIQUE,
          excludeFromAnalytics BOOLEAN DEFAULT 0,
          type TEXT DEFAULT 'expense',
          sender TEXT,
          recipient TEXT,
          isVerified BOOLEAN DEFAULT 0,
          synced BOOLEAN DEFAULT 0,
          isBusiness BOOLEAN DEFAULT 0,
          FOREIGN KEY(categoryId) REFERENCES categories(id)
        );
      `);

        // Create Ignored Transactions Table
        db.execute(`
        CREATE TABLE IF NOT EXISTS ignored_transactions (
          transactionId TEXT PRIMARY KEY NOT NULL
        );
      `);

        // Indices
        try {
          db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_recipient_nocase ON expenses(recipient COLLATE NOCASE)');
          db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)');
          db.execute('CREATE INDEX IF NOT EXISTS idx_unverified_raw ON expenses(id) WHERE isVerified = 0 AND rawText IS NOT NULL');
          db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_transactionId ON expenses(transactionId)');
          db.execute('CREATE INDEX IF NOT EXISTS idx_expenses_is_business ON expenses(isBusiness)');
        } catch (e) {
          // ignore
        }

        // Seed Defaults if empty
        // Expectation: Ensure default categories exist.
        // We use INSERT OR IGNORE on the unique 'name' column.
        DEFAULT_CATEGORIES.forEach(cat => {
          const id = uuidv4();
          // SQLite INSERT OR IGNORE will skip if 'name' exists (UNIQUE constraint)
          db.execute(
            'INSERT OR IGNORE INTO categories (id, name, keywords, isCustom) VALUES (?, ?, ?, ?)',
            [id, cat.name, JSON.stringify(cat.keywords), cat.isCustom ? 1 : 0]
          );
        });

        // --- Migrations for Existing Databases ---
        // Check column existence before adding to avoid exceptions
        // Robust check + Safe catch
        try {
          const tableInfo = db.execute('PRAGMA table_info(expenses)');
          const existingColumns = new Set<string>();

          // Use existing helper or robust iteration
          const rows = Database.getRows(tableInfo);
          rows.forEach((r: any) => existingColumns.add(r.name));

          if (!existingColumns.has('isVerified')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN isVerified BOOLEAN DEFAULT 0');
            } catch (e) { /* ignore duplicate column error */ }
          }

          if (!existingColumns.has('synced')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN synced BOOLEAN DEFAULT 0');
            } catch (e) { /* ignore duplicate column error */ }
          }

          if (!existingColumns.has('isBusiness')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN isBusiness BOOLEAN DEFAULT 0');
              console.log("Migrated: Added isBusiness column");
            } catch (e) { /* ignore duplicate column error */ }
          }
        } catch (e) {
          console.warn("Migration check failed", e);
        }

      } catch (e) {
        console.error("Database initialization failed", e);
        throw e;
      } finally {
        Database.initPromise = null; // Allow retry if failed? Or keep it locked? 
        // Better to keep instance check as primary, initPromise as transient. 
        // If successful, instance is set. If failed, promise clears and allows retry.
      }
    })();

    return Database.initPromise;
  }
  public static async executeAsync(sql: string, params: any[] = []): Promise<any> {
    const db = Database.getInstance();
    return db.executeAsync(sql, params);
  }
}

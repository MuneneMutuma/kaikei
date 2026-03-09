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

        // Create Budgets Table
        db.execute(`
        CREATE TABLE IF NOT EXISTS budgets (
          id TEXT PRIMARY KEY NOT NULL,
          period TEXT NOT NULL,
          cycleType TEXT NOT NULL DEFAULT 'monthly',
          totalLimit REAL,
          UNIQUE(period, cycleType)
        );
      `);

        // Create Budget Lines Table
        db.execute(`
        CREATE TABLE IF NOT EXISTS budget_lines (
          id TEXT PRIMARY KEY NOT NULL,
          budgetId TEXT NOT NULL,
          categoryId TEXT NOT NULL,
          limitAmount REAL NOT NULL,
          isLocked BOOLEAN DEFAULT 0,
          FOREIGN KEY(budgetId) REFERENCES budgets(id) ON DELETE CASCADE,
          FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE CASCADE,
          UNIQUE(budgetId, categoryId)
        );
      `);

        // Create Category Tags Table (Global)
        db.execute(`
          CREATE TABLE IF NOT EXISTS category_tags (
            id TEXT PRIMARY KEY NOT NULL,
            categoryId TEXT NOT NULL,
            name TEXT NOT NULL,
            FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE CASCADE,
            UNIQUE(categoryId, name)
          );
        `);

        // Create Budget Breakdowns Table
        db.execute(`
          CREATE TABLE IF NOT EXISTS budget_breakdowns (
            id TEXT PRIMARY KEY NOT NULL,
            budgetLineId TEXT NOT NULL,
            tagId TEXT NOT NULL,
            plannedAmount REAL NOT NULL,
            actualAmount REAL DEFAULT NULL,
            isUnplanned BOOLEAN DEFAULT 0,
            FOREIGN KEY(budgetLineId) REFERENCES budget_lines(id) ON DELETE CASCADE,
            FOREIGN KEY(tagId) REFERENCES category_tags(id) ON DELETE CASCADE,
            UNIQUE(budgetLineId, tagId)
          );
        `);

        // Create Expense Allocations Table for Parent-Child Splitting
        db.execute(`
          CREATE TABLE IF NOT EXISTS expense_allocations (
            id TEXT PRIMARY KEY NOT NULL,
            expenseId TEXT NOT NULL,
            categoryId TEXT NOT NULL,
            tagId TEXT,
            amount REAL NOT NULL,
            note TEXT,
            FOREIGN KEY(expenseId) REFERENCES expenses(id) ON DELETE CASCADE,
            FOREIGN KEY(categoryId) REFERENCES categories(id) ON DELETE CASCADE,
            FOREIGN KEY(tagId) REFERENCES category_tags(id) ON DELETE SET NULL
          );
        `);

        // Create Expense Tags Table for Contextual Multi-Tagging
        db.execute(`
          CREATE TABLE IF NOT EXISTS expense_tags (
            id TEXT PRIMARY KEY NOT NULL,
            expenseId TEXT NOT NULL,
            tagId TEXT NOT NULL,
            FOREIGN KEY(expenseId) REFERENCES expenses(id) ON DELETE CASCADE,
            FOREIGN KEY(tagId) REFERENCES category_tags(id) ON DELETE CASCADE,
            UNIQUE(expenseId, tagId)
          );
        `);

        // Create Goals Table
        db.execute(`
        CREATE TABLE IF NOT EXISTS goals (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          targetAmount REAL NOT NULL,
          currentAmount REAL DEFAULT 0,
          targetDate TEXT NOT NULL,
          categoryId TEXT,
          isCompleted BOOLEAN DEFAULT 0,
          FOREIGN KEY(categoryId) REFERENCES categories(id)
        );
      `);

        // Create Insights Table
        db.execute(`
        CREATE TABLE IF NOT EXISTS insights (
          id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          metric TEXT,
          icon TEXT,
          score REAL DEFAULT 0,
          created_at INTEGER NOT NULL,
          source TEXT NOT NULL,
          context_data TEXT, -- JSON
          is_archived BOOLEAN DEFAULT 0
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

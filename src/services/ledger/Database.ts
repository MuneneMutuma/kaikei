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
            FOREIGN KEY(budgetLineId) REFERENCES budget_lines(id) ON DELETE CASCADE,
            FOREIGN KEY(tagId) REFERENCES category_tags(id) ON DELETE CASCADE,
            UNIQUE(budgetLineId, tagId)
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

        // --- Migrations for Existing Databases ---
        // 1. Categories Migrations
        try {
          const catInfo = db.execute('PRAGMA table_info(categories)');
          const existingCatCols = new Set<string>();
          Database.getRows(catInfo).forEach((r: any) => existingCatCols.add(r.name));

          if (!existingCatCols.has('parentId')) {
            try {
              db.execute('ALTER TABLE categories ADD COLUMN parentId TEXT DEFAULT NULL');
            } catch (e) { /* ignore duplicate column error */ }
          }
        } catch (e) {
          console.warn("Categories migration failed", e);
        }

        // 2. Expenses Migrations
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

          if (!existingColumns.has('parentId')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN parentId TEXT DEFAULT NULL');
              console.log("Migrated: Added parentId column to expenses");
            } catch (e) { /* ignore duplicate column error */ }
          }

          if (!existingColumns.has('budgetBreakdownId')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN budgetBreakdownId TEXT DEFAULT NULL');
              console.log("Migrated: Added budgetBreakdownId column to expenses");
            } catch (e) { /* ignore duplicate column error */ }
          }

          if (!existingColumns.has('tagId')) {
            try {
              db.execute('ALTER TABLE expenses ADD COLUMN tagId TEXT DEFAULT NULL');
              console.log("Migrated: Added tagId column to expenses");
            } catch (e) { /* ignore duplicate column error */ }
          }

          // 3. Global Tagging Migration
          try {
            const bbInfo = db.execute('PRAGMA table_info(budget_breakdowns)');
            const columns = Database.getRows(bbInfo);
            const hasItemName = columns.some((c: any) => c.name === 'itemName');
            const hasTagId = columns.some((c: any) => c.name === 'tagId');

            if (hasItemName && !hasTagId) {
              console.log("Starting Global Tagging Migration...");

              // 1. Create temporary tags for ALL existing breakdowns
              const oldBreakdowns = Database.getRows(db.execute(`
                SELECT bb.*, bl.categoryId 
                FROM budget_breakdowns bb 
                JOIN budget_lines bl ON bb.budgetLineId = bl.id
              `));

              for (const bb of oldBreakdowns) {
                const tagId = uuidv4();
                // Create or get global tag
                db.execute(`
                  INSERT OR IGNORE INTO category_tags (id, categoryId, name) 
                  VALUES (?, ?, ?)
                `, [tagId, bb.categoryId, bb.itemName]);

                // Get the actual id (whether just created or already existed)
                const tagRow = Database.getRows(db.execute(
                  'SELECT id FROM category_tags WHERE categoryId = ? AND name = ?',
                  [bb.categoryId, bb.itemName]
                ))[0];
                const actualTagId = tagRow?.id || tagId;

                // Update expenses that were linked to this specific breakdown
                db.execute('UPDATE expenses SET tagId = ? WHERE budgetBreakdownId = ?', [actualTagId, bb.id]);
              }

              // 2. Re-create budget_breakdowns with tagId
              // We'll do this by creating a temp table
              db.execute('CREATE TABLE budget_breakdowns_new (id TEXT PRIMARY KEY NOT NULL, budgetLineId TEXT NOT NULL, tagId TEXT NOT NULL, plannedAmount REAL NOT NULL)');

              db.execute(`
                INSERT INTO budget_breakdowns_new (id, budgetLineId, tagId, plannedAmount)
                SELECT bb.id, bb.budgetLineId, ct.id, bb.plannedAmount
                FROM budget_breakdowns bb
                JOIN budget_lines bl ON bb.budgetLineId = bl.id
                JOIN category_tags ct ON bl.categoryId = ct.categoryId AND bb.itemName = ct.name
              `);

              db.execute('DROP TABLE budget_breakdowns');
              db.execute('ALTER TABLE budget_breakdowns_new RENAME TO budget_breakdowns');
              console.log("Global Tagging Migration completed.");
            }
          } catch (e) {
            console.warn("Global Tagging migration failed", e);
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

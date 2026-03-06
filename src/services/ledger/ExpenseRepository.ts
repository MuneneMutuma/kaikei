import { Database } from './Database';
import { Expense, Category, PERSONA_DEFAULTS, ExpenseAllocation } from './Schema';
import { v4 as uuidv4 } from 'uuid';
import { parseMpesaMessage } from '../../utils/mpesaParser';

export class ExpenseRepository {
    private db = Database.getInstance();

    /**
    /**
     * Add a new expense (with optional allocations)
     */
    public async addExpense(
        expense: Omit<Expense, 'id' | 'synced' | 'allocations'> | Omit<Expense, 'id' | 'synced' | 'isVerified' | 'allocations'>,
        allocations?: { categoryId: string, tagId?: string, amount: number, note?: string }[]
    ): Promise<Expense> {
        const id = uuidv4();
        const isVerified = 'isVerified' in expense ? expense.isVerified : false;
        // Default to false (Personal) if not provided
        const isBusiness = expense.isBusiness || false;

        await this.db.execute('BEGIN TRANSACTION');
        try {
            // Use INSERT OR IGNORE to prevent crashing on duplicate transactionIds
            const result = await this.db.execute(
                `INSERT OR IGNORE INTO expenses (
                    id, amount, date, description, categoryId, source, rawText, transactionId, excludeFromAnalytics, type, sender, recipient, isVerified, synced, isBusiness, parentId, budgetBreakdownId, tagId
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    expense.amount,
                    expense.date,
                    expense.description,
                    expense.categoryId,
                    expense.source,
                    expense.rawText || null,
                    expense.transactionId || null,
                    expense.excludeFromAnalytics ? 1 : 0,
                    expense.type || 'expense',
                    expense.sender || null,
                    expense.recipient || null,
                    isVerified ? 1 : 0,
                    0,
                    isBusiness ? 1 : 0,
                    expense.parentId || null,
                    expense.budgetBreakdownId || null,
                    expense.tagId || null
                ]
            );

            if (result.rowsAffected && result.rowsAffected > 0) {
                console.log(`[ExpenseRepository] Inserted tx: ${expense.transactionId || id}`);

                // Insert contextual multi-tags if provided
                if (expense.tags && expense.tags.length > 0) {
                    for (const tagId of expense.tags) {
                        await this.db.execute(
                            'INSERT INTO expense_tags (id, expenseId, tagId) VALUES (?, ?, ?)',
                            [uuidv4(), id, tagId]
                        );
                    }
                }

                // Insert allocations if provided and expense was actually inserted
                if (allocations && allocations.length > 0) {
                    for (const alloc of allocations) {
                        await this.db.execute(
                            'INSERT INTO expense_allocations (id, expenseId, categoryId, tagId, amount, note) VALUES (?, ?, ?, ?, ?, ?)',
                            [uuidv4(), id, alloc.categoryId, alloc.tagId || null, alloc.amount, alloc.note || null]
                        );
                    }
                }
            } else {
                console.warn(`[ExpenseRepository] Insert IGNORED for tx: ${expense.transactionId} (Duplicate or Invalid Category ${expense.categoryId})`);
            }

            await this.db.execute('COMMIT');
        } catch (e) {
            await this.db.execute('ROLLBACK');
            throw e;
        }

        const newExpense: Expense = {
            id,
            amount: expense.amount,
            date: expense.date,
            description: expense.description,
            categoryId: expense.categoryId,
            source: expense.source,
            rawText: expense.rawText || undefined,
            transactionId: expense.transactionId || undefined,
            excludeFromAnalytics: expense.excludeFromAnalytics || false,
            type: expense.type || 'expense',
            sender: expense.sender || undefined,
            recipient: expense.recipient || undefined,
            isVerified,
            synced: false,
            isBusiness,
            parentId: expense.parentId || undefined,
            budgetBreakdownId: expense.budgetBreakdownId || undefined,
            tagId: expense.tagId || undefined,
            tags: expense.tags || []
        };

        return newExpense;
    }


    /**
     * Splits an existing transaction into multiple sub-allocations.
     */
    public async splitTransaction(parentId: string, allocations: { categoryId: string, tagId?: string, amount: number, note?: string }[]): Promise<void> {
        const db = this.db;

        // Fetch parent to make sure it exists
        const parentRes = await db.execute('SELECT * FROM expenses WHERE id = ? OR transactionId = ?', [parentId, parentId]);
        const parent = Database.getRows(parentRes)[0] as Expense | undefined;

        if (!parent) {
            throw new Error(`Parent transaction ${parentId} not found`);
        }

        await db.execute('BEGIN TRANSACTION');
        try {
            // Delete existing allocations for this parent (to resync them)
            await db.execute('DELETE FROM expense_allocations WHERE expenseId = ?', [parent.id]);

            // Add new allocations
            for (const alloc of allocations) {
                await db.execute(
                    'INSERT INTO expense_allocations (id, expenseId, categoryId, tagId, amount, note) VALUES (?, ?, ?, ?, ?, ?)',
                    [uuidv4(), parent.id, alloc.categoryId, alloc.tagId || null, alloc.amount, alloc.note || null]
                );
            }

            // Ensure parent is marked verified since it's actively categorized now
            await db.execute(
                'UPDATE expenses SET isVerified = 1 WHERE id = ?',
                [parent.id]
            );

            await db.execute('COMMIT');
        } catch (e) {
            await db.execute('ROLLBACK');
            throw e;
        }
    }

    /**
     * Deletes all split allocations for a parent transaction.
     */
    public async deleteSplitsForParent(parentId: string): Promise<void> {
        await this.db.execute('DELETE FROM expense_allocations WHERE expenseId = ?', [parentId]);
    }

    /**
     * Get all allocations for a parent transaction
     */
    public async getSplitsForParent(parentId: string): Promise<ExpenseAllocation[]> {
        // Fetch allocations and join with categories for UI display if needed
        const result = await this.db.execute(
            `SELECT ea.*, c.name as categoryName, ct.name as tagName
             FROM expense_allocations ea 
             LEFT JOIN categories c ON ea.categoryId = c.id
             LEFT JOIN category_tags ct ON ea.tagId = ct.id
             WHERE ea.expenseId = ?`,
            [parentId]
        );
        return Database.getRows(result) as (ExpenseAllocation & { categoryName?: string, tagName?: string })[];
    }

    /**
     * Get Recent Expenses
     * @param limit Number of expenses to return
     */
    public async getRecentExpenses(limit: number = 5): Promise<Expense[]> {
        const result = await this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
           ORDER BY e.date DESC
           LIMIT ?`,
            [limit]
        );

        return Database.getRows(result).map(row => ({
            ...row,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            type: row.type || 'expense',
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    /**
     * Get All Expenses (for Visual Analytics)
     */
    public async getAllExpenses(): Promise<Expense[]> {
        const result = await this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
           ORDER BY e.date DESC`
        );

        return Database.getRows(result).map(row => ({
            ...row,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            type: row.type || 'expense',
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    /**
     * Get all expenses for a specific month
     * @param monthStr "YYYY-MM"
     */
    public async getExpensesByMonth(monthStr: string): Promise<Expense[]> {
        // DEBUG: RAW DUMP
        try {
            const allResult = await this.db.execute('SELECT * FROM expenses');
            const allRows = Database.getRows(allResult);
            if (allRows.length > 0) {
                // console.log(`[ExpenseRepository] FIRST 5 ROWS:`, JSON.stringify(allRows.slice(0, 5), null, 2));
            }
        } catch (e) {
            console.error("[ExpenseRepository] Dump failed:", e);
        }

        const result = await this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE datetime(e.date, 'localtime') LIKE ? 
           AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            ORDER BY e.date DESC`,
            [`${monthStr}%`]
        );

        return Database.getRows(result).map(row => ({
            ...row,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            type: row.type || 'expense',
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    async existsByTransactionId(txId: string): Promise<boolean> {
        const results = await this.db.execute(
            `SELECT 1 FROM expenses WHERE transactionId = ? LIMIT 1`,
            [txId]
        );
        return Database.getRows(results).length > 0;
    }

    /**
     * Get Category by Name (for auto-categorization)
     */
    /**
     * Get Category by Name (for auto-categorization)
     */
    public async getCategoryByName(name: string): Promise<Category | null> {
        const result = await this.db.execute('SELECT * FROM categories WHERE name = ? LIMIT 1', [name]);
        const rows = Database.getRows(result);
        if (rows.length > 0) {
            const row = rows[0];
            return {
                ...row,
                keywords: JSON.parse(row.keywords),
                isCustom: !!row.isCustom,
                parentId: row.parentId || undefined
            };
        }
        return null;
    }

    /**
     * Get All Categories
     * @param topLevelOnly If true, only returns categories without a parentId (ignores legacy sub-cats)
     */
    public async getAllCategories(topLevelOnly: boolean = false): Promise<Category[]> {
        const query = topLevelOnly
            ? 'SELECT * FROM categories WHERE parentId IS NULL ORDER BY name ASC'
            : 'SELECT * FROM categories ORDER BY name ASC';

        const result = await this.db.execute(query);
        return Database.getRows(result).map(row => ({
            ...row,
            keywords: JSON.parse(row.keywords),
            isCustom: !!row.isCustom
        }));
    }

    public async addCategory(name: string, keywords: string[] = [], budgetLimit?: number, isCustom: boolean = true): Promise<Category> {
        const id = uuidv4();
        const keywordsStr = JSON.stringify(keywords);

        await this.db.execute(
            `INSERT INTO categories (id, name, keywords, budgetLimit, isCustom) VALUES (?, ?, ?, ?, ?)`,
            [id, name, keywordsStr, budgetLimit || null, isCustom ? 1 : 0]
        );

        return {
            id,
            name,
            keywords,
            budgetLimit,
            isCustom
        };
    }

    async deleteExpense(id: string): Promise<void> {
        await this.db.execute('DELETE FROM expenses WHERE id = ?', [id]);
    }

    async deleteByTransactionId(txId: string): Promise<void> {
        await this.db.execute('DELETE FROM expenses WHERE transactionId = ?', [txId]);
    }

    async clearAll(): Promise<void> {
        await this.db.execute('DELETE FROM expenses');
    }

    // --- Ignored / Personal Transactions ---

    async ignoreTransaction(txId: string): Promise<void> {
        await this.db.execute('INSERT OR IGNORE INTO ignored_transactions (transactionId) VALUES (?)', [txId]);
    }

    async unIgnoreTransaction(txId: string): Promise<void> {
        await this.db.execute('DELETE FROM ignored_transactions WHERE transactionId = ?', [txId]);
    }

    async getIgnoredTransactionIds(): Promise<Set<string>> {
        const result = await this.db.execute('SELECT transactionId FROM ignored_transactions');
        const ids = new Set<string>();
        const rows = Database.getRows(result);
        for (let i = 0; i < rows.length; i++) {
            ids.add(rows[i].transactionId);
        }
        return ids;
    }

    async getAllTransactionIds(): Promise<Set<string>> {
        const result = await this.db.execute('SELECT transactionId FROM expenses WHERE transactionId IS NOT NULL');
        const ids = new Set<string>();
        const rows = Database.getRows(result);
        for (let i = 0; i < rows.length; i++) {
            ids.add(rows[i].transactionId);
        }
        return ids;
    }

    // --- Updates ---

    async updateExpense(id: string, updates: Partial<Pick<Expense, 'description' | 'categoryId' | 'amount' | 'isVerified' | 'excludeFromAnalytics' | 'isBusiness' | 'budgetBreakdownId' | 'tagId' | 'tags'>>): Promise<void> {
        const sets: string[] = [];
        const args: any[] = [];

        if (updates.description !== undefined) {
            sets.push('description = ?');
            args.push(updates.description);
        }
        if (updates.categoryId !== undefined) {
            sets.push('categoryId = ?');
            args.push(updates.categoryId);
        }
        if (updates.amount !== undefined) {
            sets.push('amount = ?');
            args.push(updates.amount);
        }
        if (updates.isVerified !== undefined) {
            sets.push('isVerified = ?');
            args.push(updates.isVerified ? 1 : 0);
        }
        if (updates.excludeFromAnalytics !== undefined) {
            sets.push('excludeFromAnalytics = ?');
            args.push(updates.excludeFromAnalytics ? 1 : 0);
        }
        if (updates.isBusiness !== undefined) {
            sets.push('isBusiness = ?');
            args.push(updates.isBusiness ? 1 : 0);
        }
        if (updates.budgetBreakdownId !== undefined) {
            sets.push('budgetBreakdownId = ?');
            args.push(updates.budgetBreakdownId);
        }
        if (updates.tagId !== undefined) {
            sets.push('tagId = ?');
            args.push(updates.tagId);
        }

        if (updates.tags !== undefined) {
            await this.db.execute('DELETE FROM expense_tags WHERE expenseId = ?', [id]);
            for (const tId of updates.tags) {
                await this.db.execute(
                    'INSERT INTO expense_tags (id, expenseId, tagId) VALUES (?, ?, ?)',
                    [uuidv4(), id, tId]
                );
            }
        }

        if (sets.length === 0) return;

        args.push(id);
        await this.db.execute(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, args);
    }

    /**
     * RAG Helper: Find the last categorized transaction for a recipient.
     * Prioritizes user-verified (isVerified=1) corrections over auto-categorized items.
     */
    public async getLastTransactionForRecipient(recipient: string): Promise<Expense | null> {
        if (!recipient) return null;

        const result = await this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
             FROM expenses e
             JOIN categories c ON e.categoryId = c.id
             WHERE (e.recipient = ? COLLATE NOCASE OR e.sender = ? COLLATE NOCASE OR e.description LIKE ?)
             AND c.name != 'Other'
             AND e.isVerified = 1
             ORDER BY e.date DESC
             LIMIT 1`,
            [recipient, recipient, `%${recipient}%`]
        );

        const rows = Database.getRows(result);
        if (rows.length > 0) {
            const row = rows[0];
            return {
                ...row,
                isVerified: !!row.isVerified,
                excludeFromAnalytics: !!row.excludeFromAnalytics,
                isBusiness: !!row.isBusiness,
                tags: row.tagsArr ? row.tagsArr.split(',') : []
            } as Expense;
        }
        return null;
    }

    /**
     * Smart Onboarding: Get frequent uncategorized recipients
     */
    public async getFrequentRecipients(limit: number = 5): Promise<{ recipient: string; count: number; sampleAmount: number; sampleDate: string; rawText: string }[]> {
        const result = await this.db.execute(
            `SELECT recipient, COUNT(*) as count, MAX(amount) as sampleAmount, MAX(date) as sampleDate, MAX(rawText) as rawText
             FROM expenses 
             WHERE recipient IS NOT NULL 
             AND recipient NOT IN ('M-PESA', 'Unknown', 'Equitel', 'M-Shwari', 'POCHI')
             AND (
                 categoryId IS NULL 
                 OR categoryId = 'unknown_cat' 
                 OR categoryId IN (SELECT id FROM categories WHERE name = 'Other')
             )
             AND (excludeFromAnalytics = 0 OR excludeFromAnalytics IS NULL)
             GROUP BY recipient 
             ORDER BY count DESC 
             LIMIT ?`,
            [limit]
        );

        return Database.getRows(result) as { recipient: string; count: number; sampleAmount: number; sampleDate: string; rawText: string }[];
    }

    /**
     * Smart Onboarding: Get all uncategorized expenses for a specific recipient
     */
    public async getUncategorizedExpensesByRecipient(recipient: string): Promise<Expense[]> {
        const result = await this.db.executeAsync(
            `SELECT e.*,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
             FROM expenses e
             WHERE e.recipient = ? COLLATE NOCASE
             AND (
                 e.categoryId IS NULL 
                 OR e.categoryId = 'unknown_cat' 
                 OR e.categoryId IN (SELECT id FROM categories WHERE name = 'Other')
             )
             AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
             ORDER BY e.date DESC
             LIMIT 100`,
            [recipient]
        );

        console.log("[ExpenseRepository] Uncategorized Expenses:", result.rows);
        return Database.getRows(result).map(row => ({
            ...row,
            isVerified: !!row.isVerified,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    /**
     * Smart Onboarding: Bulk categorize by recipient
     */
    public async bulkUpdateCategory(recipient: string, categoryId: string, isVerified: boolean): Promise<number> {
        const result = await this.db.execute(
            `UPDATE expenses 
             SET categoryId = ?, isVerified = ? 
             WHERE recipient = ? COLLATE NOCASE`,
            [categoryId, isVerified ? 1 : 0, recipient]
        );
        return result.rowsAffected || 0;
    }

    public getExpensesInDateRange(startDate: string, endDate: string): Expense[] {
        const result = this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE datetime(e.date, 'localtime') >= ? AND datetime(e.date, 'localtime') <= ? AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
           ORDER BY e.date DESC`,
            [startDate, endDate]
        );
        return Database.getRows(result).map(row => ({
            ...row,
            isVerified: !!row.isVerified,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    private get effectiveExpensesCTE() {
        return `
            WITH AllocatedTotals AS (
                SELECT expenseId, SUM(amount) as totalAllocated
                FROM expense_allocations
                GROUP BY expenseId
            ),
            EffectiveExpenses AS (
                SELECT e.id, e.categoryId, e.type, e.excludeFromAnalytics, e.date, 
                       (e.amount - COALESCE(at.totalAllocated, 0)) as effectiveAmount
                FROM expenses e
                LEFT JOIN AllocatedTotals at ON e.id = at.expenseId
                WHERE (e.amount - COALESCE(at.totalAllocated, 0)) > 0
                UNION ALL
                SELECT ea.id, ea.categoryId, e.type, e.excludeFromAnalytics, e.date, ea.amount as effectiveAmount
                FROM expense_allocations ea
                JOIN expenses e ON ea.expenseId = e.id
            )
        `;
    }

    public async getCategoryTotals(startDate: string, endDate: string): Promise<{ name: string; total: number }[]> {
        const result = await this.db.execute(
            `${this.effectiveExpensesCTE}
            SELECT c.name, SUM(e.effectiveAmount) as total
            FROM EffectiveExpenses e
            JOIN categories c ON e.categoryId = c.id
            WHERE datetime(e.date, 'localtime') >= ? AND datetime(e.date, 'localtime') <= ? 
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            AND e.type = 'expense'
            GROUP BY c.id
            ORDER BY total DESC`,
            [startDate, endDate]
        );
        return Database.getRows(result) as { name: string; total: number }[];
    }

    public async getDailyTotals(startDate: string, endDate: string): Promise<{ day: string; total: number }[]> {
        // SQLite: SUBSTR(date, 1, 10) extracts 'YYYY-MM-DD'
        const result = await this.db.execute(
            `${this.effectiveExpensesCTE}
            SELECT SUBSTR(datetime(date, 'localtime'), 1, 10) as day, SUM(effectiveAmount) as total
            FROM EffectiveExpenses
            WHERE SUBSTR(datetime(date, 'localtime'), 1, 10) >= ? 
            AND SUBSTR(datetime(date, 'localtime'), 1, 10) <= ?
            AND (excludeFromAnalytics = 0 OR excludeFromAnalytics IS NULL)
            AND type = 'expense'
            GROUP BY day
            ORDER BY day ASC`,
            [startDate, endDate]
        );
        return Database.getRows(result) as { day: string; total: number }[];
    }


    public async getUncategorizedExpenses(limit: number = 20): Promise<Expense[]> {
        // Debug: Check total unverified count
        try {
            const countRes = await this.db.execute(`SELECT COUNT(*) as c FROM expenses WHERE isVerified = 0`);
            const total = Database.getRows(countRes)[0].c;
            console.log(`[ExpenseRepository] Total unverified expenses in DB: ${total}`);
        } catch (e) {
            console.warn('[ExpenseRepository] Failed to count unverified:', e);
        }

        // Broadened: Fetch ANY unverified expense (NULL category, Orphans, 'Other', manual unchecked)
        // Added c.id IS NULL to catch orphans (categoryId exists but no matching category)
        const result = await this.db.execute(
            `SELECT e.*, c.name as categoryName,
               (SELECT GROUP_CONCAT(tagId) FROM expense_tags et WHERE et.expenseId = e.id) as tagsArr
             FROM expenses e
             LEFT JOIN categories c ON e.categoryId = c.id
             WHERE e.isVerified = 0
             AND (e.categoryId IS NULL OR c.id IS NULL OR c.name = 'Other' OR c.name = 'Uncategorized')
             AND e.recipient != 'MPESA'
             ORDER BY RANDOM()
             LIMIT ?`,
            [limit]
        );
        const rows = Database.getRows(result);
        console.log(`[ExpenseRepository] getUncategorizedExpenses returned ${rows.length} items`);
        return rows.map(row => ({
            ...row,
            isVerified: !!row.isVerified,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            isBusiness: !!row.isBusiness,
            tags: row.tagsArr ? row.tagsArr.split(',') : []
        })) as Expense[];
    }

    public async scanAndFlagInternalTransfers() {
        // Optimized: ONLY fetch transactions that haven't been verified/processed yet
        const result = this.db.execute(
            `SELECT id, rawText FROM expenses 
             WHERE rawText IS NOT NULL AND isVerified = 0`
        );

        const rows = Database.getRows(result);
        if (rows.length === 0) return;

        console.log(`Scanning ${rows.length} unverified transactions...`);

        // Use a single transaction for all updates to prevent disk I/O bottleneck
        this.db.execute('BEGIN TRANSACTION');
        try {
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const parsed = parseMpesaMessage(row.rawText);
                if (!parsed) continue;

                const isInternal = parsed.type === 'internal' || parsed.direction === 'internal';
                // M-Pesa Centric Logic:
                let correctType = 'expense';
                if (parsed.direction === 'in') {
                    correctType = 'income';
                } else if (isInternal) {
                    // Internal TO Mpesa (from Pochi/Mshwari) = Income/Deposit to main wallet
                    if (parsed.to?.toUpperCase() === 'M-PESA') {
                        correctType = 'income';
                    }
                }

                // Update row: Mark as verified so we don't scan again
                this.db.execute(
                    `UPDATE expenses SET excludeFromAnalytics = ?, type = ?, isVerified = 1 WHERE id = ?`,
                    [isInternal ? 1 : 0, correctType, row.id]
                );
            }
            this.db.execute('COMMIT');
            console.log("Batch update committed.");
        } catch (e) {
            this.db.execute('ROLLBACK');
            console.error("Batch update failed", e);
        }
    }

    /**
     * Export all data for backup — complete DB dump
     */
    public async exportDataAsJSON(): Promise<string> {
        const expensesResult = await this.db.execute('SELECT * FROM expenses');
        const expenses = Database.getRows(expensesResult);

        const categoriesResult = await this.db.execute('SELECT * FROM categories');
        const categories = Database.getRows(categoriesResult);

        const settingsResult = await this.db.execute('SELECT * FROM settings');
        const settings = Database.getRows(settingsResult);

        const ignoredResult = await this.db.execute('SELECT * FROM ignored_transactions');
        const ignored_transactions = Database.getRows(ignoredResult);

        return JSON.stringify({
            version: 1,
            exportedAt: new Date().toISOString(),
            expenses,
            categories,
            settings,
            ignored_transactions,
        }, null, 2);
    }

    /**
     * Import data from a JSON backup — full restore.
     * Clears all existing data and replaces with the backup.
     */
    public async importDataFromJSON(json: string): Promise<{ expenses: number; categories: number; settings: number; ignored: number }> {
        const data = JSON.parse(json);

        // Validate structure
        if (!data.expenses || !data.categories) {
            throw new Error('Invalid backup file: missing expenses or categories.');
        }

        const db = this.db;

        try {
            db.execute('BEGIN TRANSACTION');

            // 1. Clear all tables (children first due to FK)
            db.execute('DELETE FROM expenses');
            db.execute('DELETE FROM ignored_transactions');
            db.execute('DELETE FROM settings');
            db.execute('DELETE FROM categories');

            // 2. Insert categories first (FK dependency for expenses)
            for (const cat of data.categories) {
                db.execute(
                    'INSERT INTO categories (id, name, keywords, budgetLimit, isCustom) VALUES (?, ?, ?, ?, ?)',
                    [cat.id, cat.name, cat.keywords, cat.budgetLimit ?? null, cat.isCustom ?? 0]
                );
            }

            // 3. Insert expenses
            for (const exp of data.expenses) {
                db.execute(
                    `INSERT INTO expenses (id, amount, date, description, categoryId, source, rawText, transactionId, excludeFromAnalytics, type, sender, recipient, isVerified, synced)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        exp.id, exp.amount, exp.date, exp.description ?? null,
                        exp.categoryId, exp.source, exp.rawText ?? null,
                        exp.transactionId ?? null, exp.excludeFromAnalytics ?? 0,
                        exp.type ?? 'expense', exp.sender ?? null, exp.recipient ?? null,
                        exp.isVerified ?? 0, exp.synced ?? 0,
                    ]
                );
            }

            // 4. Insert settings (if present)
            if (Array.isArray(data.settings)) {
                for (const setting of data.settings) {
                    db.execute(
                        'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
                        [setting.key, setting.value]
                    );
                }
            }

            // 5. Insert ignored transactions (if present)
            if (Array.isArray(data.ignored_transactions)) {
                for (const ig of data.ignored_transactions) {
                    db.execute(
                        'INSERT OR IGNORE INTO ignored_transactions (transactionId) VALUES (?)',
                        [ig.transactionId]
                    );
                }
            }

            db.execute('COMMIT');

            return {
                expenses: data.expenses.length,
                categories: data.categories.length,
                settings: data.settings?.length ?? 0,
                ignored: data.ignored_transactions?.length ?? 0,
            };
        } catch (e) {
            db.execute('ROLLBACK');
            throw e;
        }
    }

    /**
     * Get Financial Summary for Advice Context
     */
    public async getFinancialSummary(month: number, year: number): Promise<{ totalIncome: number, totalExpense: number, topCategories: { name: string, amount: number }[] }> {
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;

        // 1. Get Monthly Totals
        // Note: Income might not have allocations, but it's safe to use the CTE
        const expensesResult = await this.db.execute(
            `${this.effectiveExpensesCTE}
            SELECT type, SUM(effectiveAmount) as total 
            FROM EffectiveExpenses 
            WHERE datetime(date, 'localtime') LIKE ? 
            AND (excludeFromAnalytics = 0 OR excludeFromAnalytics IS NULL)
            GROUP BY type`,
            [`${monthStr}%`]
        );
        const rows = Database.getRows(expensesResult);

        let totalIncome = 0;
        let totalExpense = 0;

        rows.forEach(r => {
            if (r.type === 'income') totalIncome = r.total;
            else if (r.type === 'expense') totalExpense = r.total;
        });

        // 2. Get Top Categories
        const catResult = await this.db.execute(
            `${this.effectiveExpensesCTE}
            SELECT c.name, SUM(e.effectiveAmount) as total
             FROM EffectiveExpenses e
             JOIN categories c ON e.categoryId = c.id
             WHERE datetime(e.date, 'localtime') LIKE ? 
             AND e.type = 'expense'
             AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
             GROUP BY c.name
             ORDER BY total DESC
             LIMIT 3`,
            [`${monthStr}%`]
        );

        const topCategories = Database.getRows(catResult).map(r => ({
            name: r.name,
            amount: r.total
        }));

        return {
            totalIncome,
            totalExpense,
            topCategories
        };
    }

    /**
     * Get Daily Breakdowns for a Date Range (Batch Fetch for Tooltip)
     * Returns a map: { "YYYY-MM-DD": [ { name, amount, color } ] }
     */
    public async getDailyBreakdownInRange(startDate: string, endDate: string): Promise<Record<string, { name: string; amount: number; color: string }[]>> {
        const result = await this.db.execute(
            `${this.effectiveExpensesCTE}
            SELECT 
                SUBSTR(datetime(e.date, 'localtime'), 1, 10) as day,
                COALESCE(c.name, 'Uncategorized') as name, 
                SUM(e.effectiveAmount) as total
             FROM EffectiveExpenses e
             LEFT JOIN categories c ON e.categoryId = c.id
             WHERE SUBSTR(datetime(e.date, 'localtime'), 1, 10) >= ? 
             AND SUBSTR(datetime(e.date, 'localtime'), 1, 10) <= ?
             AND e.type = 'expense'
             AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
             GROUP BY day, c.id
             ORDER BY day ASC, total DESC`,
            [startDate, endDate + 'T23:59:59']
        );

        const rows = Database.getRows(result);
        const map: Record<string, { name: string; amount: number; color: string }[]> = {};

        rows.forEach((r: any) => {
            if (!map[r.day]) map[r.day] = [];
            // Limit to top 3 per day here to save memory, or client side?
            // Doing it here saves JS processing time if the query returns many rows.
            // Limit removed for prototype visualization
            map[r.day].push({
                name: r.name,
                amount: r.total,
                color: '#4682B4' // Default SteelBlue, replaced in UI
            });
        });

        return map;
    }
    /**
     * Get Rich Context for AI Advice (Current + 3 Months History)
     */
    public async getAdviceContext(): Promise<{
        currentMonth: { total: number, breakdown: { name: string, total: number }[] },
        history: { month: string, total: number }[],
        insights: string[], // Pre-calculated insights (e.g. "Fuel is up 20%")
        topTransactions: Expense[] // NEW: For citing specific large expenses
    }> {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        // 1. Current Month Data
        const currentSummary = await this.getFinancialSummary(currentMonth, currentYear);
        const currentStart = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
        const currentEnd = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];
        const currentBreakdown = await this.getCategoryTotals(currentStart, currentEnd + ' 23:59:59');

        // 2. Historical Data (Last 3 Months)
        const history: { month: string, total: number }[] = [];
        const categoryavgs: Record<string, number[]> = {};

        for (let i = 1; i <= 3; i++) {
            const d = new Date(currentYear, currentMonth - 1 - i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const label = d.toLocaleString('default', { month: 'short' });

            const summary = await this.getFinancialSummary(m, y);
            history.push({ month: label, total: summary.totalExpense });

            // Accumulate category totals for averaging
            // Optimization: Only do this for top categories if perf is issue? 
            // For now, fetch breakdown for history too.
            const start = `${y}-${m.toString().padStart(2, '0')}-01`;
            const end = new Date(y, m, 0).toISOString().split('T')[0];
            const breakdown = await this.getCategoryTotals(start, end + ' 23:59:59');

            breakdown.forEach(cat => {
                if (!categoryavgs[cat.name]) categoryavgs[cat.name] = [];
                categoryavgs[cat.name].push(cat.total);
            });
        }

        // 3. Generate Rule-Based Insights (Speed + Transparency)
        const insights: string[] = [];

        // Trend Analysis
        const avgHistory = history.reduce((sum, h) => sum + h.total, 0) / (history.length || 1);
        if (currentSummary.totalExpense > avgHistory * 1.15) {
            insights.push(`Total spending is ${Math.round((currentSummary.totalExpense / avgHistory - 1) * 100)}% higher than your 3-month average.`);
        }

        // Category Spikes
        currentBreakdown.forEach(cat => {
            const hist = categoryavgs[cat.name];
            if (hist && hist.length > 0) {
                const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
                if (cat.total > avg * 1.2 && cat.total > 1000) { // Spike > 20% and significant amount
                    insights.push(`${cat.name} usage is unusually high (${Math.round((cat.total / avg - 1) * 100)}% above normal).`);
                }
            }
        });

        // 4. NEW: Top Transactions (Largest 5 this month)
        const topTxResult = await this.db.execute(
            `${this.effectiveExpensesCTE}
             SELECT e.id, e.description, e.source, e.effectiveAmount as amount, e.date, 
                    e.isVerified, e.isBusiness, c.name as categoryName 
             FROM EffectiveExpenses e
             LEFT JOIN categories c ON e.categoryId = c.id
             WHERE datetime(e.date, 'localtime') LIKE ? 
             AND e.type = 'expense'
             AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
             ORDER BY e.effectiveAmount DESC
             LIMIT 5`,
            [`${currentYear}-${currentMonth.toString().padStart(2, '0')}%`]
        );
        const topTransactions = Database.getRows(topTxResult) as Expense[];

        return {
            currentMonth: {
                total: currentSummary.totalExpense,
                breakdown: currentBreakdown
            },
            history: history.reverse(), // Oldest first
            insights,
            topTransactions
        };
    }

    /**
     * Ensure Categories for Persona exist
     */
    public async ensureCategoriesForPersona(persona: string): Promise<number> {
        const defaults = PERSONA_DEFAULTS[persona];
        if (!defaults) return 0;

        const existing = await this.getAllCategories();
        const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
        let added = 0;

        for (const cat of defaults) {
            if (!existingNames.has(cat.name.toLowerCase())) {
                await this.addCategory(cat.name, cat.keywords, cat.budgetLimit);
                added++;
            }
        }
        return added;
    }

    /**
     * Mark a transaction as reversed (exclude from analytics)
     */
    public async markAsReversed(transactionId: string): Promise<boolean> {
        const result = await this.db.execute(
            `UPDATE expenses SET excludeFromAnalytics = 1 WHERE transactionId = ?`,
            [transactionId]
        );
        return (result.rowsAffected || 0) > 0;
    }

    /**
     * Migration: Mark all existing categorized expenses (not 'Other') as verified.
     * Use this to align existing data with user's assertion that "current labels are verified".
     */
    public async verifyExistingCategorizedExpenses(): Promise<number> {
        // 1. GLOBAL RESET: Set everything to unverified first.
        await this.db.execute(`UPDATE expenses SET isVerified = 0`);

        // 2. STRICT VERIFY: Only verify items that match ALL criteria:
        //    - Not NULL/Empty categoryId
        //    - Not named 'Other' or 'Uncategorized'
        //    - Category ID actually exists in the categories table
        const result = await this.db.execute(
            `UPDATE expenses 
             SET isVerified = 1 
             WHERE categoryId IS NOT NULL 
             AND categoryId != ''
             AND categoryId NOT IN (SELECT id FROM categories WHERE name IN ('Other', 'Uncategorized'))
             AND EXISTS (SELECT 1 FROM categories c WHERE c.id = expenses.categoryId)`
        );

        return result.rowsAffected || 0;
    }

    /**
     * Settings Management (SQLite)
     */
    public async getSetting(key: string): Promise<string | null> {
        const result = await this.db.execute(
            `SELECT value FROM settings WHERE key = ?`,
            [key]
        );
        const rows = Database.getRows(result);
        return rows.length > 0 ? rows[0].value : null;
    }

    public async setSetting(key: string, value: string): Promise<void> {
        await this.db.execute(
            `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
            [key, value]
        );
    }
}

import { Database } from './Database';
import { Expense, Category } from './Schema';
import { v4 as uuidv4 } from 'uuid';
import { parseMpesaMessage } from '../../utils/mpesaParser';

export class ExpenseRepository {
    private db = Database.getInstance();

    /**
     * Add a new expense
     */
    public async addExpense(expense: Omit<Expense, 'id' | 'isVerified' | 'synced'>): Promise<Expense> {
        const id = uuidv4();

        // Use INSERT OR IGNORE to prevent crashing on duplicate transactionIds
        const result = await this.db.execute(
            `INSERT OR IGNORE INTO expenses (
                id, amount, date, description, categoryId, source, rawText, transactionId, excludeFromAnalytics, type, sender, recipient
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                expense.recipient || null
            ]
        );

        if (result.rowsAffected && result.rowsAffected > 0) {
            console.log(`[ExpenseRepository] Inserted tx: ${expense.transactionId}`);
        } else {
            console.warn(`[ExpenseRepository] Insert IGNORED for tx: ${expense.transactionId} (Duplicate or Invalid Category ${expense.categoryId})`);
        }

        const newExpense: Expense = {
            id,
            ...expense,
            rawText: expense.rawText || undefined,
            transactionId: expense.transactionId || undefined,
            excludeFromAnalytics: expense.excludeFromAnalytics || false,
            type: expense.type || 'expense',
            sender: expense.sender || undefined,
            recipient: expense.recipient || undefined,
            isVerified: false,
            synced: false
        };

        return newExpense;
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
            `SELECT e.*, c.name as categoryName 
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE e.date LIKE ? 
           AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            ORDER BY e.date DESC`,
            [`${monthStr}%`]
        );

        return Database.getRows(result).map(row => ({
            ...row,
            excludeFromAnalytics: !!row.excludeFromAnalytics,
            type: row.type || 'expense'
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
                isCustom: !!row.isCustom
            };
        }
        return null;
    }

    /**
     * Get All Categories
     */
    public async getAllCategories(): Promise<Category[]> {
        const result = await this.db.execute('SELECT * FROM categories ORDER BY name ASC');
        return Database.getRows(result).map(row => ({
            ...row,
            keywords: JSON.parse(row.keywords),
            isCustom: !!row.isCustom
        }));
    }

    public async addCategory(name: string, isCustom: boolean = true): Promise<Category> {
        const id = uuidv4();
        const keywordsStr = JSON.stringify([]); // Empty keywords for custom category

        await this.db.execute(
            `INSERT INTO categories (id, name, keywords, isCustom) VALUES (?, ?, ?, ?)`,
            [id, name, keywordsStr, isCustom ? 1 : 0]
        );

        return {
            id,
            name,
            keywords: [],
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

    // --- Updates ---

    async updateExpense(id: string, updates: Partial<Pick<Expense, 'description' | 'categoryId' | 'amount' | 'isVerified'>>): Promise<void> {
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

        if (sets.length === 0) return;

        args.push(id);
        await this.db.execute(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`, args);
    }

    /**
     * RAG Helper: Find the last categorized transaction for a recipient
     */
    public async getLastTransactionForRecipient(recipient: string): Promise<Expense | null> {
        if (!recipient) return null;

        const result = this.db.execute(
            `SELECT e.*, c.name as categoryName 
             FROM expenses e
             JOIN categories c ON e.categoryId = c.id
             WHERE (e.recipient = ? COLLATE NOCASE OR e.sender = ? COLLATE NOCASE OR e.description LIKE ?)
             AND c.name != 'Other'
             ORDER BY e.date DESC
             LIMIT 1`,
            [recipient, recipient, `%${recipient}%`]
        );

        const rows = Database.getRows(result);
        if (rows.length > 0) {
            return rows[0] as Expense;
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
            `SELECT e.*
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
        return Database.getRows(result) as Expense[];
    }

    /**
     * Smart Onboarding: Bulk categorize by recipient
     */
    public async bulkUpdateCategory(recipient: string, categoryId: string): Promise<number> {
        const result = await this.db.execute(
            `UPDATE expenses 
             SET categoryId = ?, isVerified = 1 
             WHERE recipient = ? COLLATE NOCASE`,
            [categoryId, recipient]
        );
        return result.rowsAffected || 0;
    }

    public getExpensesInDateRange(startDate: string, endDate: string): Expense[] {
        const result = this.db.execute(
            `SELECT e.*, c.name as categoryName 
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE e.date >= ? AND e.date <= ? AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
           ORDER BY e.date DESC`,
            [startDate, endDate]
        );
        return Database.getRows(result) as Expense[];
    }

    public getCategoryTotals(startDate: string, endDate: string): { name: string; total: number }[] {
        const result = this.db.execute(
            `SELECT c.name, SUM(e.amount) as total
            FROM expenses e
            JOIN categories c ON e.categoryId = c.id
            WHERE e.date >= ? AND e.date <= ? 
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            AND e.type = 'expense'
            GROUP BY c.id
            ORDER BY total DESC`,
            [startDate, endDate]
        );
        return Database.getRows(result) as { name: string; total: number }[];
    }

    public getDailyTotals(startDate: string, endDate: string): { day: string; total: number }[] {
        // SQLite: SUBSTR(date, 1, 10) extracts 'YYYY-MM-DD'
        const result = this.db.execute(
            `SELECT SUBSTR(date, 1, 10) as day, SUM(amount) as total
            FROM expenses
            WHERE date >= ? AND date <= ? 
            AND (excludeFromAnalytics = 0 OR excludeFromAnalytics IS NULL)
            AND type = 'expense'
            GROUP BY day
            ORDER BY day ASC`,
            [startDate, endDate]
        );
        return Database.getRows(result) as { day: string; total: number }[];
    }

    public getUncategorizedExpenses(limit: number = 20): Expense[] {
        // Get 'Other' category ID first or assume we filter by it.
        // Better: Join with categories and check name='Other'
        const result = this.db.execute(
            `SELECT e.*, c.name as categoryName 
             FROM expenses e
             JOIN categories c ON e.categoryId = c.id
             WHERE c.name = 'Other' 
             LIMIT ?`,
            [limit]
        );
        return Database.getRows(result) as Expense[];
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
                    // Internal TO Mpesa = Income
                    if (parsed.to?.toUpperCase() === 'M-PESA' || parsed.direction === 'in') {
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
     * Export all data for backup
     */
    public async exportDataAsJSON(): Promise<string> {
        const expensesResult = await this.db.execute('SELECT * FROM expenses');
        const expenses = Database.getRows(expensesResult);

        const categoriesResult = await this.db.execute('SELECT * FROM categories');
        const categories = Database.getRows(categoriesResult);

        return JSON.stringify({ expenses, categories }, null, 2);
    }

    /**
     * Get Financial Summary for Advice Context
     */
    public async getFinancialSummary(month: number, year: number): Promise<{ totalIncome: number, totalExpense: number, topCategories: { name: string, amount: number }[] }> {
        const monthStr = `${year}-${month.toString().padStart(2, '0')}`;

        // 1. Get Monthly Totals
        // Note: We use the existing async logic pattern
        const expensesResult = await this.db.execute(
            `SELECT type, SUM(amount) as total 
             FROM expenses 
             WHERE date LIKE ? 
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
            `SELECT c.name, SUM(e.amount) as total
             FROM expenses e
             JOIN categories c ON e.categoryId = c.id
             WHERE e.date LIKE ? 
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

}

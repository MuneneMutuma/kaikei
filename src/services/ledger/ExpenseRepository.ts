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
        await this.db.execute(
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

        return id;
    }

    /**
     * Get all expenses for a specific month
     * @param monthStr "YYYY-MM"
     */
    public getExpensesByMonth(monthStr: string): Expense[] {
        const result = this.db.execute(
            `SELECT e.*, c.name as categoryName 
           FROM expenses e 
           LEFT JOIN categories c ON e.categoryId = c.id
           WHERE e.date LIKE ? 
            ORDER BY e.date DESC`,
            [`${monthStr}%`]
        );

        return (result.rows?._array || []).map(row => ({
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
        return (results.rows?.length ?? 0) > 0;
    }

    /**
     * Get Category by Name (for auto-categorization)
     */
    public getCategoryByName(name: string): Category | null {
        const result = this.db.execute('SELECT * FROM categories WHERE name = ? LIMIT 1', [name]);
        if (result.rows && result.rows.length > 0) {
            const row = result.rows._array[0];
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
    public getAllCategories(): Category[] {
        const result = this.db.execute('SELECT * FROM categories ORDER BY name ASC');
        return (result.rows?._array || []).map(row => ({
            ...row,
            keywords: JSON.parse(row.keywords),
            isCustom: !!row.isCustom
        }));
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
        if (result.rows) {
            for (let i = 0; i < result.rows.length; i++) {
                ids.add(result.rows.item(i).transactionId);
            }
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

        if (result.rows && result.rows.length > 0) {
            return result.rows.item(0) as Expense;
        }
        return null;
    }

    /**
     * Smart Onboarding: Get frequent uncategorized recipients
     */
    public getFrequentRecipients(limit: number = 5): { recipient: string; count: number; sampleAmount: number; sampleDate: string; rawText: string }[] {
        const result = this.db.execute(
            `SELECT recipient, COUNT(*) as count, MAX(amount) as sampleAmount, MAX(date) as sampleDate, MAX(rawText) as rawText
             FROM expenses 
             WHERE recipient IS NOT NULL 
             AND recipient NOT IN ('M_PESA', 'Unknown', 'Equitel', 'M-Shwari')
             AND (categoryId IS NULL OR categoryId IN (SELECT id FROM categories WHERE name = 'Other'))
             GROUP BY recipient 
             ORDER BY count DESC 
             LIMIT ?`,
            [limit]
        );
        return (result.rows?._array || []) as { recipient: string; count: number; sampleAmount: number; sampleDate: string; rawText: string }[];
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
        return (result.rows?._array || []) as Expense[];
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
        return (result.rows?._array || []) as { name: string; total: number }[];
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
        return (result.rows?._array || []) as { day: string; total: number }[];
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
        return (result.rows?._array || []) as Expense[];
    }

    public async scanAndFlagInternalTransfers() {
        // Optimized: Only fetch rows with rawText to re-validate
        const result = this.db.execute(
            `SELECT id, rawText, type, excludeFromAnalytics FROM expenses 
             WHERE rawText IS NOT NULL`
        );

        if (!result.rows) return;

        const internalUpdates: string[] = [];
        const incomeUpdates: string[] = [];
        const expenseUpdates: string[] = [];

        for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            const parsed = parseMpesaMessage(row.rawText);
            if (!parsed) continue;

            const isInternal = parsed.type === 'internal' || parsed.direction === 'internal';

            // 1. Fix Exclude Flag
            if (isInternal && !row.excludeFromAnalytics) {
                internalUpdates.push(row.id);
            }

            // 2. Fix Type (Income vs Expense)
            // M-Pesa Centric: 
            // Internal TO Mpesa = Income
            // Internal FROM Mpesa = Expense
            // Normal Income = parsed.direction == 'in'
            let correctType = 'expense';
            if (parsed.direction === 'in') {
                correctType = 'income';
            } else if (isInternal) {
                // Determine if incoming to mpesa
                if (parsed.to?.toUpperCase() === 'M-PESA' || parsed.direction === 'in') {
                    correctType = 'income';
                }
            }

            if (row.type !== correctType) {
                if (correctType === 'income') incomeUpdates.push(row.id);
                else expenseUpdates.push(row.id);
            }
        }

        // Apply Updates
        const BATCH_SIZE = 100;

        if (internalUpdates.length > 0) {
            console.log(`Auto-Correction: Flagging ${internalUpdates.length} internal transfers.`);
            for (let i = 0; i < internalUpdates.length; i += BATCH_SIZE) {
                const batch = internalUpdates.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '?').join(',');
                await this.db.execute(`UPDATE expenses SET excludeFromAnalytics = 0 WHERE id IN (${placeholders})`, batch);
            }
        }

        if (incomeUpdates.length > 0) {
            console.log(`Auto-Correction: Fixing ${incomeUpdates.length} transactions to INCOME.`);
            for (let i = 0; i < incomeUpdates.length; i += BATCH_SIZE) {
                const batch = incomeUpdates.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '?').join(',');
                await this.db.execute(`UPDATE expenses SET type = 'income' WHERE id IN (${placeholders})`, batch);
            }
        }

        if (expenseUpdates.length > 0) {
            console.log(`Auto-Correction: Fixing ${expenseUpdates.length} transactions to EXPENSE.`);
            for (let i = 0; i < expenseUpdates.length; i += BATCH_SIZE) {
                const batch = expenseUpdates.slice(i, i + BATCH_SIZE);
                const placeholders = batch.map(() => '?').join(',');
                await this.db.execute(`UPDATE expenses SET type = 'expense' WHERE id IN (${placeholders})`, batch);
            }
        }
    }

}

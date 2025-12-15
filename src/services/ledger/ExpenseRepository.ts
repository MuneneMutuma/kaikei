import { Database } from './Database';
import { Expense, Category } from './Schema';
import { v4 as uuidv4 } from 'uuid';

export class ExpenseRepository {
    private db = Database.getInstance();

    /**
     * Add a new expense
     */
    public async addExpense(expense: Omit<Expense, 'id' | 'isVerified' | 'synced'>): Promise<Expense> {
        const id = uuidv4();
        const newExpense: Expense = {
            ...expense,
            id,
            isVerified: false,
            synced: false
        };

        const query = `
            INSERT INTO expenses (id, amount, date, description, categoryId, source, rawText, transactionId, isVerified, synced)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await this.db.execute(query, [
            newExpense.id,
            newExpense.amount,
            newExpense.date,
            newExpense.description,
            newExpense.categoryId,
            newExpense.source,
            newExpense.rawText || null,
            newExpense.transactionId || null,
            newExpense.isVerified ? 1 : 0,
            newExpense.synced ? 1 : 0
        ]);

        return newExpense;
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

        return (result.rows?._array || []) as Expense[];
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
}

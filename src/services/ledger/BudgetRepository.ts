import { Database } from './Database';
import { Budget, BudgetLine, BudgetBreakdown } from './Schema';
import * as uuid from 'uuid';
import { v4 as uuidv4 } from 'uuid';

export class BudgetRepository {
    private db = Database.getInstance();

    /**
     * Get or create a budget for the given period and cycle.
     */
    public async getOrCreateBudget(period: string, cycleType: 'monthly' | 'weekly' | 'daily' = 'monthly'): Promise<Budget> {
        // Try to find existing
        const result = await this.db.execute(
            `SELECT * FROM budgets WHERE period = ? AND cycleType = ? LIMIT 1`,
            [period, cycleType]
        );
        const rows = Database.getRows(result);

        if (rows.length > 0) {
            return rows[0] as Budget;
        }

        // Create new
        const id = uuidv4();
        await this.db.execute(
            `INSERT INTO budgets (id, period, cycleType) VALUES (?, ?, ?)`,
            [id, period, cycleType]
        );

        return {
            id,
            period,
            cycleType
        };
    }

    /**
     * Insert or update a category limit for a specific budget.
     */
    public async upsertBudgetLine(budgetId: string, categoryId: string, limitAmount: number): Promise<BudgetLine> {
        // Check if line exists
        const result = await this.db.execute(
            `SELECT id FROM budget_lines WHERE budgetId = ? AND categoryId = ? LIMIT 1`,
            [budgetId, categoryId]
        );
        const rows = Database.getRows(result);

        if (rows.length > 0) {
            const lineId = rows[0].id;
            // Update existing limit
            await this.db.execute(
                `UPDATE budget_lines SET limitAmount = ? WHERE id = ?`,
                [limitAmount, lineId]
            );
            return {
                id: lineId,
                budgetId,
                categoryId,
                limitAmount
            };
        } else {
            // Insert new line
            const id = uuidv4();
            await this.db.execute(
                `INSERT INTO budget_lines (id, budgetId, categoryId, limitAmount) VALUES (?, ?, ?, ?)`,
                [id, budgetId, categoryId, limitAmount]
            );
            return {
                id,
                budgetId,
                categoryId,
                limitAmount
            };
        }
    }

    /**
     * Get the active budget dashboard for a specific month.
     * Combines the budget line limits with the ACTUAL expense spending from the `expenses` table.
     * @param monthStr format: "YYYY-MM"
     */
    public async getMonthlyBudgetDashboard(monthStr: string): Promise<BudgetLine[]> {
        // 1. Ensure a budget exists for this month
        const budget = await this.getOrCreateBudget(monthStr, 'monthly');

        // 2. Query budget lines JOINED with categories and SUM of expenses
        const plannedQuery = `
            SELECT 
                bl.id,
                bl.budgetId,
                bl.categoryId,
                bl.limitAmount,
                c.name as categoryName,
                COALESCE(
                    (SELECT SUM(amount) FROM expenses e 
                     WHERE e.categoryId = bl.categoryId 
                     AND e.type = 'expense'
                     AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
                     AND datetime(e.date, 'localtime') LIKE ?)
                , 0) as spentAmount,
                0 as isUnplanned
            FROM budget_lines bl
            JOIN categories c ON bl.categoryId = c.id
            WHERE bl.budgetId = ?
        `;

        // 3. Query "Ghost" spending (categories with spend but no budget line)
        const unplannedQuery = `
            SELECT 
                NULL as id,
                ? as budgetId,
                c.id as categoryId,
                0 as limitAmount,
                c.name as categoryName,
                SUM(e.amount) as spentAmount,
                1 as isUnplanned
            FROM categories c
            JOIN expenses e ON c.id = e.categoryId
            LEFT JOIN budget_lines bl ON c.id = bl.categoryId AND bl.budgetId = ?
            WHERE bl.id IS NULL
            AND datetime(e.date, 'localtime') LIKE ?
            AND e.type = 'expense'
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            GROUP BY c.id
            HAVING spentAmount > 0
        `;

        const [plannedResult, unplannedResult] = await Promise.all([
            this.db.execute(plannedQuery, [`${monthStr}%`, budget.id]),
            this.db.execute(unplannedQuery, [budget.id, budget.id, `${monthStr}%`])
        ]);

        const planned = Database.getRows(plannedResult) as BudgetLine[];
        const unplanned = Database.getRows(unplannedResult) as BudgetLine[];

        return [...planned, ...unplanned].sort((a, b) => (a.categoryName || '').localeCompare(b.categoryName || ''));
    }

    /**
     * Find a budget line for a specific category and month.
     */
    public async getBudgetLine(categoryId: string, month: string): Promise<BudgetLine | null> {
        const result = await this.db.execute(
            `SELECT bl.* FROM budget_lines bl
             JOIN budgets b ON bl.budgetId = b.id
             WHERE bl.categoryId = ? AND b.period = ? LIMIT 1`,
            [categoryId, month]
        );
        const rows = Database.getRows(result);
        return rows.length > 0 ? rows[0] as BudgetLine : null;
    }

    /**
     * Find a budget line and its breakdowns for a category.
     * If none exist, returns a virtual general breakdown if requested.
     */
    public async getBudgetWithBreakdowns(categoryId: string, month: string, createIfMissing = false): Promise<{ line: BudgetLine, breakdowns: (BudgetBreakdown & { itemName: string })[] } | null> {
        let line = await this.getBudgetLine(categoryId, month);

        if (!line && createIfMissing) {
            // Create a default budget line with 0 limit if missing, so we can link to it
            line = await this.createDefaultBudgetLine(categoryId, month);
        }

        if (!line) return null;

        const breakdowns = await this.getBudgetBreakdowns(line.id);

        if (breakdowns.length === 0 && createIfMissing) {
            const generalTag = await this.getOrCreateTag(categoryId, 'General');
            const general = await this.ensureBreakdown(line.id, generalTag.id);
            return { line, breakdowns: [{ ...general, itemName: 'General' }] };
        }

        return { line, breakdowns };
    }

    private async createDefaultBudgetLine(categoryId: string, month: string): Promise<BudgetLine> {
        const id = uuidv4();
        // We need a budgetId. We'll pick the one for this month, or create a monthly container.
        let budgetId: string;
        const result = await this.db.execute('SELECT id FROM budgets WHERE period = ?', [month]);
        const budgets = Database.getRows(result);
        if (budgets.length > 0) {
            budgetId = (budgets[0] as any).id;
        } else {
            budgetId = uuidv4();
            // Using INSERT OR IGNORE to be extremely safe
            await this.db.execute('INSERT OR IGNORE INTO budgets (id, period, totalLimit) VALUES (?, ?, ?)', [budgetId, month, 0]);

            // Re-fetch to get the true ID if we ignored the insert
            const verifyResult = await this.db.execute('SELECT id FROM budgets WHERE period = ?', [month]);
            const verifyRows = Database.getRows(verifyResult);
            budgetId = verifyRows[0]?.id || budgetId;
        }

        await this.db.execute(
            'INSERT OR IGNORE INTO budget_lines (id, budgetId, categoryId, limitAmount) VALUES (?, ?, ?, ?)',
            [id, budgetId, categoryId, 0]
        );
        return { id, budgetId, categoryId, limitAmount: 0, spentAmount: 0 };
    }

    private async ensureBreakdown(lineId: string, tagId: string): Promise<BudgetBreakdown> {
        const id = uuidv4();
        await this.db.execute(
            'INSERT OR IGNORE INTO budget_breakdowns (id, budgetLineId, tagId, plannedAmount) VALUES (?, ?, ?, ?)',
            [id, lineId, tagId, 0]
        );
        const result = await this.db.execute('SELECT * FROM budget_breakdowns WHERE budgetLineId = ? AND tagId = ?', [lineId, tagId]);
        return Database.getRows(result)[0] as BudgetBreakdown;
    }

    private async ensureGeneralBreakdown(lineId: string): Promise<BudgetBreakdown> {
        // Find categoryId for this line
        const lineResult = await this.db.execute('SELECT categoryId FROM budget_lines WHERE id = ?', [lineId]);
        const categoryId = Database.getRows(lineResult)[0]?.categoryId;
        if (!categoryId) throw new Error("Line not found");

        const tag = await this.getOrCreateTag(categoryId, 'General');
        return this.ensureBreakdown(lineId, tag.id);
    }

    public async deleteBudgetLine(lineId: string): Promise<void> {
        // Cascade: breakdowns first
        await this.db.execute('DELETE FROM budget_breakdowns WHERE budgetLineId = ?', [lineId]);
        // Then the line
        await this.db.execute('DELETE FROM budget_lines WHERE id = ?', [lineId]);
    }

    /**
     * Fetch planning breakdowns for a specific budget line
     */
    public async getBudgetBreakdowns(budgetLineId: string): Promise<(BudgetBreakdown & { itemName: string })[]> {
        const result = await this.db.execute(
            `SELECT bb.*, ct.name as itemName 
             FROM budget_breakdowns bb 
             JOIN category_tags ct ON bb.tagId = ct.id
             WHERE bb.budgetLineId = ?
             ORDER BY ct.name ASC`,
            [budgetLineId]
        );
        return Database.getRows(result) as (BudgetBreakdown & { itemName: string })[];
    }

    /**
     * Save planning breakdowns for a budget line.
     * This replaces all existing breakdowns for the line to ensure sync.
     */
    public async saveBudgetBreakdowns(budgetLineId: string, items: { tagId: string, plannedAmount: number }[]): Promise<void> {
        try {
            await this.db.execute('DELETE FROM budget_breakdowns WHERE budgetLineId = ?', [budgetLineId]);

            for (const { tagId, plannedAmount } of items) {
                const id = uuidv4();
                await this.db.execute(
                    `INSERT INTO budget_breakdowns (id, budgetLineId, tagId, plannedAmount) VALUES (?, ?, ?, ?)`,
                    [id, budgetLineId, tagId, plannedAmount]
                );
            }
        } catch (e) {
            console.error("Failed to save budget breakdowns", e);
            throw e;
        }
    }

    /**
     * Auto-suggest budgets based on average spending over the last 3 months.
     * This allows quick onboarding for new users.
     */
    public async suggestBudgetLimits(currentMonth: string): Promise<{ categoryId: string, categoryName: string, suggestedLimit: number }[]> {
        // A complex SQLite query could do moving averages, but for simplicity
        // we'll find all spending in the last 90 days, group by category, and divide by 3.

        // Approximate 3 months ago from currentMonth (YYYY-MM)
        const [yearStr, monthStrPart] = currentMonth.split('-');
        let yearNum = parseInt(yearStr);
        let monthNum = parseInt(monthStrPart);

        monthNum -= 3;
        if (monthNum <= 0) {
            monthNum += 12;
            yearNum -= 1;
        }

        const threeMonthsAgoStr = `${yearNum}-${monthNum.toString().padStart(2, '0')}-01`;

        const result = await this.db.execute(`
            SELECT 
                e.categoryId, 
                c.name as categoryName,
                SUM(e.amount) as totalThreeMonths
            FROM expenses e
            JOIN categories c ON e.categoryId = c.id
            WHERE datetime(e.date, 'localtime') >= ?
            AND e.type = 'expense'
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            GROUP BY e.categoryId
            HAVING totalThreeMonths > 0
            ORDER BY totalThreeMonths DESC
            LIMIT 10
        `, [threeMonthsAgoStr]);

        const rows = Database.getRows(result);

        return rows.map((r: any) => {
            // Quick heuristic: Average the 3 months, then round up to the nearest 500 for a cleaner budget look
            const exactAverage = r.totalThreeMonths / 3;
            const roundedUp = Math.ceil(exactAverage / 500) * 500;
            return {
                categoryId: r.categoryId,
                categoryName: r.categoryName,
                suggestedLimit: roundedUp
            };
        });
    }

    /**
     * Add a single breakdown item to a budget line.
     * Useful for dynamic creation from expense entry flows.
     */
    public async addBreakdownItem(budgetLineId: string, itemName: string, categoryId: string, plannedAmount: number = 0): Promise<BudgetBreakdown> {
        const tag = await this.getOrCreateTag(categoryId, itemName);
        return this.ensureBreakdown(budgetLineId, tag.id);
    }

    /**
     * Get or create a global tag for a category.
     */
    public async getOrCreateTag(categoryId: string, name: string): Promise<{ id: string, categoryId: string, name: string }> {
        const id = uuidv4();
        await this.db.execute(
            'INSERT OR IGNORE INTO category_tags (id, categoryId, name) VALUES (?, ?, ?)',
            [id, categoryId, name.trim()]
        );
        const result = await this.db.execute(
            'SELECT * FROM category_tags WHERE categoryId = ? AND name = ?',
            [categoryId, name.trim()]
        );
        return Database.getRows(result)[0];
    }

    /**
     * Get all global tags for a category.
     */
    public async getCategoryTags(categoryId: string): Promise<{ id: string, name: string }[]> {
        const result = await this.db.execute(
            'SELECT id, name FROM category_tags WHERE categoryId = ? ORDER BY name ASC',
            [categoryId]
        );
        return Database.getRows(result);
    }
}

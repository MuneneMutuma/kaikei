import { Database } from './Database';
import { Budget, BudgetLine, BudgetBreakdown } from './Schema';
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
        // SQLite trick: Ensure we only sum expenses in the matching month that aren't excluded.
        const dashboardQuery = `
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
                , 0) as spentAmount
            FROM budget_lines bl
            JOIN categories c ON bl.categoryId = c.id
            WHERE bl.budgetId = ?
            ORDER BY c.name ASC
        `;

        const result = await this.db.execute(dashboardQuery, [`${monthStr}%`, budget.id]);
        return Database.getRows(result) as BudgetLine[];
    }

    public async deleteBudgetLine(lineId: string): Promise<void> {
        await this.db.execute('DELETE FROM budget_lines WHERE id = ?', [lineId]);
    }

    /**
     * Fetch planning breakdowns for a specific budget line
     */
    public async getBudgetBreakdowns(budgetLineId: string): Promise<BudgetBreakdown[]> {
        const result = await this.db.execute(
            `SELECT bb.*, c.name as categoryName
             FROM budget_breakdowns bb
             JOIN categories c ON bb.categoryId = c.id
             WHERE bb.budgetLineId = ?
             ORDER BY c.name ASC`,
            [budgetLineId]
        );
        return Database.getRows(result) as BudgetBreakdown[];
    }

    /**
     * Save planning breakdowns for a budget line.
     * This replaces all existing breakdowns for the line to ensure sync.
     */
    public async saveBudgetBreakdowns(budgetLineId: string, breakdowns: { categoryId: string, plannedAmount: number }[]): Promise<void> {
        try {
            // Use a transaction if possible, or execute sequentially
            await this.db.execute('DELETE FROM budget_breakdowns WHERE budgetLineId = ?', [budgetLineId]);

            for (const { categoryId, plannedAmount } of breakdowns) {
                const id = uuidv4();
                await this.db.execute(
                    `INSERT INTO budget_breakdowns (id, budgetLineId, categoryId, plannedAmount) VALUES (?, ?, ?, ?)`,
                    [id, budgetLineId, categoryId, plannedAmount]
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
}

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

        const effectiveExpensesCTE = `
            WITH AllocatedTotals AS (
                SELECT expenseId, SUM(amount) as totalAllocated
                FROM expense_allocations
                GROUP BY expenseId
            ),
            EffectiveExpenses AS (
                -- 1. Unsplit expenses OR the unallocated remainder of split expenses
                SELECT 
                    e.id, 
                    e.categoryId, 
                    e.type, 
                    e.excludeFromAnalytics, 
                    e.date, 
                    (e.amount - COALESCE(at.totalAllocated, 0)) as effectiveAmount
                FROM expenses e
                LEFT JOIN AllocatedTotals at ON e.id = at.expenseId
                WHERE (e.amount - COALESCE(at.totalAllocated, 0)) > 0
                
                UNION ALL
                
                -- 2. The allocations themselves
                SELECT 
                    ea.id, 
                    ea.categoryId, 
                    e.type, 
                    e.excludeFromAnalytics, 
                    e.date,
                    ea.amount as effectiveAmount
                FROM expense_allocations ea
                JOIN expenses e ON ea.expenseId = e.id
            )
        `;

        // 2. Query budget lines JOINED with categories and SUM of effective expenses
        const plannedQuery = `
            ${effectiveExpensesCTE}
            SELECT 
                bl.id,
                bl.budgetId,
                bl.categoryId,
                bl.limitAmount,
                c.name as categoryName,
                COALESCE(
                    (SELECT SUM(effectiveAmount) FROM EffectiveExpenses e 
                     WHERE e.categoryId = bl.categoryId 
                     AND e.type = 'expense'
                     AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
                     AND datetime(e.date, 'localtime') LIKE ?)
                , 0) as spentAmount,
                COALESCE(
                    (SELECT SUM(actualAmount) FROM budget_breakdowns bb WHERE bb.budgetLineId = bl.id)
                , 0) as itemizedAmount,
                0 as isUnplanned,
                bl.isLocked
            FROM budget_lines bl
            JOIN categories c ON bl.categoryId = c.id
            WHERE bl.budgetId = ?
        `;

        // 3. Query "Ghost" spending (categories with spend but no budget line)
        const unplannedQuery = `
            ${effectiveExpensesCTE}
            SELECT 
                NULL as id,
                ? as budgetId,
                c.id as categoryId,
                0 as limitAmount,
                c.name as categoryName,
                SUM(e.effectiveAmount) as spentAmount,
                0 as itemizedAmount,
                1 as isUnplanned,
                0 as isLocked
            FROM categories c
            JOIN EffectiveExpenses e ON c.id = e.categoryId
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
            `SELECT bl.*, c.name as categoryName FROM budget_lines bl
             JOIN budgets b ON bl.budgetId = b.id
             JOIN categories c ON bl.categoryId = c.id
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
    public async getBudgetWithBreakdowns(categoryId: string, month: string, createIfMissing = false): Promise<{ line: BudgetLine, breakdowns: BudgetBreakdown[] } | null> {
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
            return { line, breakdowns: [{ ...general, tagName: 'General' }] };
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
    public async getBudgetBreakdowns(budgetLineId: string): Promise<BudgetBreakdown[]> {
        // We need to fetch the month from the parent line to filter expenses
        const lineRes = await this.db.execute(
            `SELECT bl.categoryId, b.period 
             FROM budget_lines bl 
             JOIN budgets b ON bl.budgetId = b.id 
             WHERE bl.id = ?`,
            [budgetLineId]
        );
        const lineMeta = Database.getRows(lineRes)[0];
        if (!lineMeta) return [];

        const monthStr = lineMeta.period; // "YYYY-MM"

        const result = await this.db.execute(
            `SELECT 
                bb.*, 
                ct.name as rawTagName,
                -- 1. Sum expenses linked to this tag (direct or via multi-tag table)
                (SELECT COALESCE(SUM(e.amount), 0) 
                 FROM expenses e 
                 WHERE (e.tagId = bb.tagId OR EXISTS (SELECT 1 FROM expense_tags et WHERE et.expenseId = e.id AND et.tagId = bb.tagId))
                 AND datetime(e.date, 'localtime') LIKE ? 
                 AND e.type = 'expense'
                 AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
                ) as linkedExpenseTotal,
                -- 2. Sum splits/allocations linked to this tag
                (SELECT COALESCE(SUM(ea.amount), 0) 
                 FROM expense_allocations ea
                 JOIN expenses e ON ea.expenseId = e.id
                 WHERE ea.tagId = bb.tagId
                 AND datetime(e.date, 'localtime') LIKE ?
                 AND e.type = 'expense'
                 AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
                ) as linkedAllocationTotal
             FROM budget_breakdowns bb 
             JOIN category_tags ct ON bb.tagId = ct.id
             WHERE bb.budgetLineId = ?
             ORDER BY ct.name ASC`,
            [`${monthStr}%`, `${monthStr}%`, budgetLineId]
        );

        const rows = Database.getRows(result);
        return rows.map((r: any) => {
            const linked = (r.linkedExpenseTotal || 0) + (r.linkedAllocationTotal || 0);
            return {
                ...r,
                tagName: this.formatTagName(r.rawTagName),
                isUnplanned: !!r.isUnplanned,
                // actualAmount is now EXCLUSIVELY the manual input from the UI
                actualAmount: r.actualAmount || 0,
                // linkedAmount is the live M-Pesa total for verification
                linkedAmount: linked
            };
        }) as BudgetBreakdown[];
    }

    private formatTagName(name: string): string {
        if (!name) return "";
        return name.split(' ').map(sub => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase()).join(' ');
    }

    /**
 * Save planning breakdowns for a budget line.
 * This replaces all existing breakdowns for the line to ensure sync.
 * Preserves actualAmount if provided in the items.
 */
    public async saveBudgetBreakdowns(budgetLineId: string, items: { tagId: string, plannedAmount: number, actualAmount?: number | null }[]): Promise<void> {
        try {
            await this.db.execute('DELETE FROM budget_breakdowns WHERE budgetLineId = ?', [budgetLineId]);

            for (const { tagId, plannedAmount, actualAmount } of items) {
                const id = uuidv4();
                await this.db.execute(
                    `INSERT INTO budget_breakdowns (id, budgetLineId, tagId, plannedAmount, actualAmount) VALUES (?, ?, ?, ?, ?)`,
                    [id, budgetLineId, tagId, plannedAmount, actualAmount ?? null]
                );
            }
        } catch (e) {
            console.error("Failed to save budget breakdowns", e);
            throw e;
        }
    }

    /**
     * Add a single breakdown item.
     */
    public async addBreakdownItem(budgetLineId: string, tagId: string, plannedAmount: number, actualAmount: number = 0, isUnplanned: boolean = false): Promise<void> {
        const id = uuidv4();
        await this.db.execute(
            `INSERT INTO budget_breakdowns (id, budgetLineId, tagId, plannedAmount, actualAmount, isUnplanned) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, budgetLineId, tagId, plannedAmount, actualAmount, isUnplanned ? 1 : 0]
        );
    }

    /**
     * Delete a single breakdown item.
     */
    public async deleteBreakdownItem(breakdownId: string): Promise<void> {
        await this.db.execute('DELETE FROM budget_breakdowns WHERE id = ?', [breakdownId]);
    }

    /**
     * Update the plannedAmount for a specific breakdown item.
     */
    public async updateBreakdownPlannedAmount(breakdownId: string, plannedAmount: number): Promise<void> {
        await this.db.execute(
            'UPDATE budget_breakdowns SET plannedAmount = ? WHERE id = ?',
            [plannedAmount, breakdownId]
        );
    }

    /**
     * Update the actualAmount for a specific breakdown item in the Sandbox.
     */
    public async updateBreakdownActualAmount(breakdownId: string, actualAmount: number): Promise<void> {
        await this.db.execute(
            'UPDATE budget_breakdowns SET actualAmount = ? WHERE id = ?',
            [actualAmount, breakdownId]
        );
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
     * Get or create a global tag for a category.
     * Normalizes names to Title Case and handles case-insensitive lookup.
     */
    public async getOrCreateTag(categoryId: string, name: string): Promise<{ id: string, categoryId: string, name: string }> {
        const trimmedName = name.trim();

        // Try to find existing first (case-insensitive)
        const existing = await this.db.execute(
            'SELECT * FROM category_tags WHERE categoryId = ? AND name = ? COLLATE NOCASE LIMIT 1',
            [categoryId, trimmedName]
        );
        const rows = Database.getRows(existing);
        if (rows.length > 0) {
            return rows[0];
        }

        const id = uuidv4();
        await this.db.execute(
            'INSERT OR IGNORE INTO category_tags (id, categoryId, name) VALUES (?, ?, ?)',
            [id, categoryId, trimmedName]
        );

        // Return the one that exists (might be the one we just inserted or a concurrent one)
        const final = await this.db.execute(
            'SELECT * FROM category_tags WHERE categoryId = ? AND name = ? COLLATE NOCASE',
            [categoryId, trimmedName]
        );
        return Database.getRows(final)[0];
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

    /**
     * Rigorous Deduplication and Trimming of Tags
     * Designed to be triggered manually to clean up stubborn databases.
     */
    public async deduplicateAndTrimTags(): Promise<{ merged: number, deleted: number }> {
        const db = this.db;
        let mergedCount = 0;
        let deletedCount = 0;

        try {
            await db.execute('BEGIN TRANSACTION');

            // 1. Fetch all existing tags
            const allTagsResult = await db.execute('SELECT id, categoryId, name FROM category_tags');
            const allTags = Database.getRows(allTagsResult);

            const tagMap = new Map<string, { id: string, name: string, categoryId: string }[]>();

            // 2. Group them by categoryId and heavily normalized name
            allTags.forEach((tag: any) => {
                const normalizedName = tag.name.trim().toLowerCase();
                const key = `${tag.categoryId}:${normalizedName}`;
                if (!tagMap.has(key)) tagMap.set(key, []);
                tagMap.get(key)?.push(tag);
            });

            // 3. Process groups
            for (const [key, duplicates] of tagMap.entries()) {
                // If there's only one tag, just ensure it's trimmed in the DB
                if (duplicates.length === 1) {
                    const single = duplicates[0];
                    const trimmed = single.name.trim();
                    if (single.name !== trimmed) {
                        await db.execute('UPDATE category_tags SET name = ? WHERE id = ?', [trimmed, single.id]);
                    }
                    continue;
                }

                // If >1 tag, we need to merge
                // Pick the first one as canonical. Better yet, pick the one that is already Title Case if possible.
                // For simplicity, we just take the first, but we ensure its name is trimmed.
                const canonical = duplicates[0];
                const canonicalTrimmedName = canonical.name.trim();

                const toDelete = duplicates.slice(1);

                // Ensure the canonical one is clean
                if (canonical.name !== canonicalTrimmedName) {
                    await db.execute('UPDATE category_tags SET name = ? WHERE id = ?', [canonicalTrimmedName, canonical.id]);
                }

                for (const redundant of toDelete) {
                    // Update all references
                    await db.execute('UPDATE expenses SET tagId = ? WHERE tagId = ?', [canonical.id, redundant.id]);
                    await db.execute('UPDATE expense_allocations SET tagId = ? WHERE tagId = ?', [canonical.id, redundant.id]);
                    await db.execute('UPDATE budget_breakdowns SET tagId = ? WHERE tagId = ?', [canonical.id, redundant.id]);
                    await db.execute('UPDATE expense_tags SET tagId = ? WHERE tagId = ?', [canonical.id, redundant.id]);

                    // Delete the redundant tag
                    await db.execute('DELETE FROM category_tags WHERE id = ?', [redundant.id]);

                    mergedCount++;
                    deletedCount++;
                }
            }

            await db.execute('COMMIT');
            return { merged: mergedCount, deleted: deletedCount };
        } catch (e) {
            await db.execute('ROLLBACK');
            console.error("Deduplication failed", e);
            throw e;
        }
    }

    /**
     * Toggle the lock status of a budget line.
     */
    public async toggleBudgetLock(lineId: string, isLocked: boolean): Promise<void> {
        await this.db.execute(
            'UPDATE budget_lines SET isLocked = ? WHERE id = ?',
            [isLocked ? 1 : 0, lineId]
        );
    }

    /**
     * Fetch all transactions in a category/month that are NOT yet linked to a budget breakdown tag.
     */
    /**
     * Fetch all transactions in a category/month that are NOT yet fully linked to budget breakdown tags.
     * Calculates 'unallocatedBalance' for each transaction by subtracting existing splits.
     */
    public async getUnclaimedTransactions(categoryId: string, monthStr: string, budgetLineId: string): Promise<any[]> {
        const query = `
            WITH AllocatedTotals AS (
                SELECT expenseId, SUM(amount) as totalAllocated
                FROM expense_allocations
                GROUP BY expenseId
            )
            SELECT 
                e.*, 
                c.name as categoryName,
                (e.amount - COALESCE(at.totalAllocated, 0)) as unallocatedBalance
            FROM expenses e
            JOIN categories c ON e.categoryId = c.id
            LEFT JOIN AllocatedTotals at ON e.id = at.expenseId
            WHERE e.categoryId = ? 
            AND datetime(e.date, 'localtime') LIKE ?
            AND e.type = 'expense'
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            AND (
                -- 1. Not tagged at all
                (e.tagId IS NULL AND at.expenseId IS NULL)
                OR 
                -- 2. Partially tagged/allocated (has balance left)
                (e.amount - COALESCE(at.totalAllocated, 0)) > 0.01
            )
            ORDER BY e.date DESC
        `;
        const result = await this.db.execute(query, [categoryId, `${monthStr}%`]);
        return Database.getRows(result);
    }

    /**
     * Assign a tag to an expense, effectively "claiming" it for a breakdown item.
     */
    /**
     * Assign a tag to an expense, effectively "claiming" it for a breakdown item.
     */
    public async claimTransaction(expenseId: string, tagId: string): Promise<void> {
        await this.db.execute(
            'UPDATE expenses SET tagId = ?, isVerified = 1 WHERE id = ?',
            [tagId, expenseId]
        );
    }

    /**
     * Create a split allocation for a transaction.
     */
    public async allocateTransaction(expenseId: string, categoryId: string, tagId: string, amount: number): Promise<void> {
        await this.db.execute(
            'INSERT INTO expense_allocations (id, expenseId, categoryId, tagId, amount) VALUES (?, ?, ?, ?, ?)',
            [uuidv4(), expenseId, categoryId, tagId, amount]
        );
        // Mark parent as verified since we are actively splitting it
        await this.db.execute(
            'UPDATE expenses SET isVerified = 1 WHERE id = ?',
            [expenseId]
        );
    }

    /**
     * Remove a link between a transaction and a tag.
     * This handles both direct tagId on expenses and expense_allocations.
     */
    public async removeTransactionLink(expenseId: string, tagId: string): Promise<void> {
        // 1. Check if it's a direct tag link
        const directResult = await this.db.execute(
            'SELECT id FROM expenses WHERE id = ? AND tagId = ?',
            [expenseId, tagId]
        );
        if (Database.getRows(directResult).length > 0) {
            await this.db.execute(
                'UPDATE expenses SET tagId = NULL WHERE id = ?',
                [expenseId]
            );
        }

        // 2. Check and delete allocations
        await this.db.execute(
            'DELETE FROM expense_allocations WHERE expenseId = ? AND tagId = ?',
            [expenseId, tagId]
        );
    }

    /**
     * Fetch ALL transactions in a category/month for reconciliation.
     * Includes metadata and unallocatedBalance.
     */
    public async getTransactionsForReconciliation(categoryId: string, monthStr: string): Promise<any[]> {
        const query = `
            WITH AllocatedTotals AS (
                SELECT expenseId, SUM(amount) as totalAllocated
                FROM expense_allocations
                GROUP BY expenseId
            )
            SELECT 
                e.*, 
                c.name as categoryName,
                CASE 
                    WHEN e.tagId IS NOT NULL THEN 0 
                    ELSE (e.amount - COALESCE(at.totalAllocated, 0)) 
                END as unallocatedBalance,
                -- Return list of current tags for this expense
                (SELECT GROUP_CONCAT(tagId) FROM expense_tags WHERE expenseId = e.id) as legacyTags,
                
                (SELECT GROUP_CONCAT(ct.name) 
                 FROM expense_tags et 
                 JOIN category_tags ct ON et.tagId = ct.id 
                 WHERE et.expenseId = e.id) as legacyTagNames,
                 
                (SELECT ct.name 
                 FROM category_tags ct 
                 WHERE ct.id = e.tagId) as directTagName,
                 
                e.tagId as directTagId,
                
                (SELECT GROUP_CONCAT(ct.name) 
                 FROM expense_allocations ea 
                 JOIN category_tags ct ON ea.tagId = ct.id 
                 WHERE ea.expenseId = e.id) as allocationTagNames,
                 
                (SELECT GROUP_CONCAT(tagId) FROM expense_allocations WHERE expenseId = e.id) as allocationTags
            FROM expenses e
            JOIN categories c ON e.categoryId = c.id
            LEFT JOIN AllocatedTotals at ON e.id = at.expenseId
            WHERE e.categoryId = ? 
            AND datetime(e.date, 'localtime') LIKE ?
            AND e.type = 'expense'
            AND (e.excludeFromAnalytics = 0 OR e.excludeFromAnalytics IS NULL)
            ORDER BY e.date DESC
        `;
        const result = await this.db.execute(query, [categoryId, `${monthStr}%`]);
        return Database.getRows(result);
    }
}

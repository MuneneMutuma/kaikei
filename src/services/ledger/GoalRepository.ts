import { Database } from './Database';
import { Goal } from './Schema';
import { v4 as uuidv4 } from 'uuid';

export class GoalRepository {
    private db = Database.getInstance();

    async addGoal(goal: Omit<Goal, 'id' | 'currentAmount' | 'isCompleted'>): Promise<Goal> {
        const id = uuidv4();
        const sql = `
            INSERT INTO goals (id, name, targetAmount, currentAmount, targetDate, categoryId, isCompleted)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [id, goal.name, goal.targetAmount, 0, goal.targetDate, goal.categoryId || null, 0];
        await this.db.executeAsync(sql, params);

        return {
            id,
            ...goal,
            currentAmount: 0,
            isCompleted: false
        };
    }

    async updateGoalProgress(id: string, currentAmount: number): Promise<void> {
        const sql = `UPDATE goals SET currentAmount = ? WHERE id = ?`;
        await this.db.executeAsync(sql, [currentAmount, id]);

        // Auto-complete if target reached
        const checkSql = `SELECT targetAmount FROM goals WHERE id = ?`;
        const res = await this.db.executeAsync(checkSql, [id]);
        const goal = Database.getRows(res)[0];

        if (goal && currentAmount >= goal.targetAmount) {
            await this.db.executeAsync(`UPDATE goals SET isCompleted = 1 WHERE id = ?`, [id]);
        }
    }

    async getActiveGoals(): Promise<Goal[]> {
        const sql = `SELECT * FROM goals WHERE isCompleted = 0 ORDER BY targetDate ASC`;
        const res = await this.db.executeAsync(sql);
        return Database.getRows(res).map(row => ({
            ...row,
            isCompleted: !!row.isCompleted
        }));
    }

    async deleteGoal(id: string): Promise<void> {
        const sql = `DELETE FROM goals WHERE id = ?`;
        await this.db.executeAsync(sql, [id]);
    }
}

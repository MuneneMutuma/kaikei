
import { Database } from '../ledger/Database';
import { Insight, InsightType, Citation } from './InsightGenerator';

export class InsightRepository {
    private db = Database.getInstance();

    constructor() { }

    async saveInsight(insight: Insight): Promise<void> {
        await this.db.execute(
            `INSERT OR REPLACE INTO insights (id, type, title, description, metric, icon, score, created_at, source, context_data, is_archived)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                insight.id,
                insight.type,
                insight.title,
                insight.description,
                insight.metric || null,
                insight.icon || null,
                insight.score || 0,
                Date.now(), // created_at
                insight.source || (insight.isLlmGenerated ? 'local_llm' : 'rule'), // Use provided source or fallback
                JSON.stringify(insight.citations || []),
                0 // is_archived default
            ]
        );
    }

    async getActiveInsights(limit: number = 20): Promise<Insight[]> {
        const result = await this.db.execute(
            `SELECT * FROM insights WHERE is_archived = 0 ORDER BY created_at DESC LIMIT ?`,
            [limit]
        );
        const rows = Database.getRows(result);

        return rows.map(row => ({
            id: row.id,
            type: row.type as InsightType,
            title: row.title,
            description: row.description,
            metric: row.metric,
            icon: row.icon,
            score: row.score,
            citations: row.context_data ? JSON.parse(row.context_data) as Citation[] : [],
            isLlmGenerated: row.source.includes('llm'),
            // Extract checking for 'source' specifically if needed in UI later
            source: row.source
        }));
    }

    async archiveInsight(id: string): Promise<void> {
        await this.db.execute(
            `UPDATE insights SET is_archived = 1 WHERE id = ?`,
            [id]
        );
    }

    async deleteInsight(id: string): Promise<void> {
        await this.db.execute(
            `DELETE FROM insights WHERE id = ?`,
            [id]
        );
    }

    async getInsights(status: 'active' | 'archived' = 'active', limit: number = 50): Promise<Insight[]> {
        const isArchived = status === 'archived' ? 1 : 0;
        const result = await this.db.execute(
            `SELECT * FROM insights WHERE is_archived = ? ORDER BY created_at DESC LIMIT ?`,
            [isArchived, limit]
        );
        const rows = Database.getRows(result);

        return rows.map(row => ({
            id: row.id,
            type: row.type as InsightType,
            title: row.title,
            description: row.description,
            metric: row.metric,
            icon: row.icon,
            score: row.score,
            citations: row.context_data ? JSON.parse(row.context_data) as Citation[] : [],
            isLlmGenerated: row.source.includes('llm'),
            source: row.source
        }));
    }

    async exists(id: string): Promise<boolean> {
        const result = await this.db.execute(
            `SELECT 1 FROM insights WHERE id = ? LIMIT 1`,
            [id]
        );
        return Database.getRows(result).length > 0;
    }
}

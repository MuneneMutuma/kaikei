import { ExpenseRepository } from "../ledger/ExpenseRepository";
import { Expense } from "../ledger/Schema";
import { LlmClient } from "../llm/LlmClient";
import { SettingsRepository } from "../settings/SettingsRepository";
import { InsightRepository } from "./InsightRepository";
import { BudgetRepository } from "../ledger/BudgetRepository";

export type InsightType = 'alert' | 'opportunity' | 'success' | 'info';

export interface Citation {
    type: string;
    id: string;
    label: string;
}

export interface Insight {
    id: string;
    type: InsightType;
    title: string;
    description: string;
    category?: string;
    metric?: string; // e.g. "+15%"
    actionLabel?: string;
    icon?: string; // Lucide icon name to map in UI
    confidence?: number;
    score?: number; // For sorting
    citations?: Citation[];
    isLlmGenerated?: boolean;
    source?: string; // e.g. 'rule', 'local_llm'
    created_at?: number;
}

export class InsightGenerator {
    private repo: ExpenseRepository;
    private settings: SettingsRepository;
    private insightRepo: InsightRepository;
    private budgetRepo: BudgetRepository;

    constructor() {
        this.repo = new ExpenseRepository();
        this.settings = new SettingsRepository();
        this.insightRepo = new InsightRepository();
        this.budgetRepo = new BudgetRepository();
    }

    /**
     * Unified entry point. Use specific methods for granular control.
     */
    async generateInsights(): Promise<Insight[]> {
        // Run checks
        await this.generateMonthlyInsights();
        await this.generateDailyInsights();
        await this.generateBudgetInsights();

        // Return ALL active insights from DB
        return this.insightRepo.getActiveInsights();
    }

    /**
     * 1. Monthly Analysis (Historical Trends)
     * Compares current month vs last month.
     */
    async generateMonthlyInsights(): Promise<void> {
        const generated: Insight[] = [];
        const now = new Date();
        const currentMonthIso = this.toMonthStr(now);
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthIso = this.toMonthStr(lastMonthDate);

        // Fetch Data
        const currentExpenses = await this.repo.getExpensesByMonth(currentMonthIso);
        const lastMonthExpenses = await this.repo.getExpensesByMonth(lastMonthIso);

        const currentTotal = currentExpenses.reduce((sum, e) => sum + e.amount, 0);
        const lastTotal = lastMonthExpenses.reduce((sum, e) => sum + e.amount, 0);

        // Rule: Spending Spike (Lowered threshold for testing: 5% increase)
        if (lastTotal > 0 && currentTotal > lastTotal * 1.05) {
            const id = `mom-spike-${currentMonthIso}`;
            if (!(await this.insightRepo.exists(id))) {
                generated.push({
                    id,
                    type: 'alert',
                    title: 'Spending Alert',
                    description: `You've spent ${Math.round(((currentTotal - lastTotal) / lastTotal) * 100)}% more than last month.`,
                    metric: `+${Math.round(((currentTotal - lastTotal) / lastTotal) * 100)}%`,
                    icon: 'TrendingUp',
                    score: 10,
                    source: 'rule',
                    citations: [
                        { type: 'month', id: currentMonthIso, label: `This Month: ${currentTotal}` },
                        { type: 'month', id: lastMonthIso, label: `Last Month: ${lastTotal}` }
                    ]
                });
            }
        }

        // Rule: Category Analysis
        const categories = ['Fuel', 'Stock', 'Food', 'Airtime', 'Entertainment', 'Shopping'];
        for (const cat of categories) {
            const curCatTotal = this.getCategoryTotal(currentExpenses, cat);
            const lastCatTotal = this.getCategoryTotal(lastMonthExpenses, cat);

            // Threshold: > 200 KES and > 10% increase (Lowered for visibility)
            if (curCatTotal > 200 && lastCatTotal > 0) {
                if (curCatTotal > lastCatTotal * 1.1) {
                    const id = `cat-spike-${cat}-${currentMonthIso}`;
                    if (!(await this.insightRepo.exists(id))) {
                        generated.push({
                            id,
                            type: 'alert',
                            title: `High ${cat} Costs`,
                            description: `${cat} costs are trending up.`,
                            category: cat,
                            icon: this.getIconForCategory(cat),
                            score: 8,
                            source: 'rule',
                            citations: [
                                { type: 'category', id: cat, label: `Current: ${curCatTotal.toLocaleString()}` },
                                { type: 'category', id: cat, label: `Avg: ${lastCatTotal.toLocaleString()}` }
                            ]
                        });
                    }
                }
            }
        }

        for (const insight of generated) {
            await this.insightRepo.saveInsight(insight);
        }
    }

    /**
     * 2. Daily Analysis (Immediate Feedback)
     * Checks yesterday/today for unusual activity.
     */
    async generateDailyInsights(): Promise<void> {
        // Placeholder for daily logic (e.g., "Yesterday you spent 0! Good job!")
        // For now, we will use this slot to ensure at least ONE insight exists if DB is empty
        const active = await this.insightRepo.getActiveInsights();
        if (active.length === 0) {
            const id = `welcome-insight-${Date.now()}`;
            await this.insightRepo.saveInsight({
                id,
                type: 'info',
                title: 'Welcome to Smart Insights',
                description: 'As you track expenses, I will analyze your habits here.',
                icon: 'Sparkles',
                score: 5,
                source: 'rule'
            });
        }
    }

    /**
     * Budget Analysis (Real-time Feedback)
     * Checks if current month expenses exceed active budget limits.
     */
    async generateBudgetInsights(): Promise<void> {
        const generated: Insight[] = [];
        const now = new Date();
        const currentMonthIso = this.toMonthStr(now);

        const budgets = await this.budgetRepo.getMonthlyBudgetDashboard(currentMonthIso);

        for (const b of budgets) {
            const safeSpent = b.spentAmount || 0;
            const limit = b.limitAmount;

            if (limit <= 0) continue;

            const percentage = safeSpent / limit;

            if (percentage >= 1.0) {
                const id = `budget-breach-${b.categoryId}-${currentMonthIso}`;
                if (!(await this.insightRepo.exists(id))) {
                    generated.push({
                        id,
                        type: 'alert',
                        title: `${b.categoryName} Over Budget`,
                        description: `You have exceeded your ${b.categoryName} limit of ${limit.toLocaleString()}.`,
                        metric: `>100%`,
                        icon: 'AlertCircle',
                        score: 10,
                        source: 'rule',
                    });
                }
            } else if (percentage >= 0.8) {
                const id = `budget-warn-${b.categoryId}-${currentMonthIso}`;
                if (!(await this.insightRepo.exists(id))) {
                    generated.push({
                        id,
                        type: 'alert',
                        title: `${b.categoryName} Budget Warning`,
                        description: `You have used ${Math.round(percentage * 100)}% of your ${b.categoryName} budget.`,
                        metric: `${Math.round(percentage * 100)}%`,
                        icon: 'AlertTriangle',
                        score: 7,
                        source: 'rule',
                    });
                }
            }
        }

        for (const insight of generated) {
            await this.insightRepo.saveInsight(insight);
        }
    }

    /**
     * 3. User Initiated (Force LLM)
     * Triggered by FAB. Forces a fresh analysis using the preferred model (Local/Cloud).
     */
    async generateUserInitiatedAdvice(preferCloud: boolean = false): Promise<Insight | null> {
        try {
            const userSettings = await this.settings.getUserSettings();
            const persona = userSettings.userPersona || 'Standard';

            // Gather Context
            const now = new Date();
            const currentMonthIso = this.toMonthStr(now);
            const currentExpenses = await this.repo.getExpensesByMonth(currentMonthIso);
            const currentTotal = currentExpenses.reduce((sum, e) => sum + e.amount, 0);

            // Gather Budget Context
            const budgets = await this.budgetRepo.getMonthlyBudgetDashboard(currentMonthIso);
            const budgetContext = budgets.map(b =>
                `${b.categoryName}: Spent ${(b.spentAmount || 0).toLocaleString()} of ${b.limitAmount.toLocaleString()} limit`
            ).join('\n');

            // Build Prompt
            const prompt = `
            Analyze these spending totals for ${currentMonthIso}:
            Total: ${currentTotal}
            Top Categories: ${this.getTopCategories(currentExpenses)}
            
            Current Budgets:
            ${budgetContext || 'No budgets set.'}
            
            Based on the persona "${persona}", give one specific, actionable piece of advice to optimize spending or stay within budget.
            Keep it under 2 sentences.
            `;

            console.log(`[InsightGenerator] Requesting Advice (Cloud: ${preferCloud})...`);

            // Pass the preferCloud flag to LlmClient
            const llmResult = await LlmClient.getInstance().generateStructuredAdvice(persona, prompt, preferCloud);

            if (llmResult && llmResult.advice) {
                const insight: Insight = {
                    id: `user-advice-${Date.now()}`,
                    type: 'opportunity',
                    title: 'Strategic Advice',
                    description: llmResult.advice,
                    icon: 'Lightbulb',
                    score: 9,
                    citations: llmResult.citations || [],
                    isLlmGenerated: true,
                    // Accurately label the source
                    source: preferCloud ? 'cloud_llm' : 'local_llm'
                };

                await this.insightRepo.saveInsight(insight);
                return insight;
            }
        } catch (e) {
            console.error("User initiated advice failed", e);
        }
        return null;
    }

    private toMonthStr(d: Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    private getCategoryTotal(expenses: Expense[], categoryPartial: string): number {
        return expenses
            .filter(e => (e.categoryName || '').toLowerCase().includes(categoryPartial.toLowerCase()))
            .reduce((sum, e) => sum + e.amount, 0);
    }

    private getTopCategories(expenses: Expense[]): string {
        const map: Record<string, number> = {};
        expenses.forEach(e => {
            const c = e.categoryName || 'Other';
            map[c] = (map[c] || 0) + e.amount;
        });
        return Object.entries(map)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ');
    }

    private getIconForCategory(cat: string): string {
        const map: Record<string, string> = {
            'Fuel': 'Fuel',
            'Stock': 'ShoppingBasket',
            'Food': 'Utensils',
            'Airtime': 'Smartphone',
            'Entertainment': 'Film',
            'Shopping': 'ShoppingBag'
        };
        return map[cat] || 'AlertCircle';
    }
}

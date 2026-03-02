export interface Category {
    id: string;
    parentId?: string; // Optional: Links a sub-category to a top-level bucket
    name: string;
    keywords: string[]; // JSON stringified array in DB
    budgetLimit?: number;
    isCustom: boolean; // false for default categories (Fuel, Food)
}

export interface Expense {
    id: string;
    amount: number;
    date: string; // ISO String
    description: string;
    categoryId: string;
    source: 'mpesa' | 'voice' | 'manual';
    rawText?: string;
    transactionId?: string;
    isVerified: boolean;
    synced: boolean;
    isBusiness: boolean; // New Field: Personal (false) vs Business (true)
    categoryName?: string; // Optional join field
    excludeFromAnalytics?: boolean;
    type: 'income' | 'expense' | 'transfer';
    sender?: string;
    recipient?: string;
    account?: string; // e.g. M-Shwari, Pochi, KCB
}

export interface Budget {
    id: string;
    period: string; // "YYYY-MM" for monthly, or a standard start date string for weekly/daily 
    cycleType: 'monthly' | 'weekly' | 'daily';
    totalLimit?: number; // Optional overall cap
}

export interface BudgetLine {
    id: string;
    budgetId: string;
    categoryId: string;
    limitAmount: number;
    // For UI convenience in joined queries:
    categoryName?: string;
    spentAmount?: number;
}

export interface BudgetBreakdown {
    id: string;
    budgetLineId: string; // FK to budget_lines
    categoryId: string;   // FK to categories (the sub-category)
    plannedAmount: number;
    // For UI convenience
    categoryName?: string;
}

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
    { name: 'Fuel', keywords: ['fuel', 'shell', 'total', 'rubis', 'petrol', 'diesel'], isCustom: false },
    { name: 'Stock', keywords: ['stock', 'wholesale', 'depot', 'supplies', 'soko', 'market'], isCustom: false },
    { name: 'Food', keywords: ['food', 'lunch', 'dinner', 'breakfast', 'hotel', 'restaurant', 'cafe', 'tea'], isCustom: false },
    { name: 'Transport', keywords: ['transport', 'fare', 'matatu', 'bodaboda', 'uber', 'bolt'], isCustom: false },
    { name: 'Airtime', keywords: ['airtime', 'data', 'bundle', 'safaricom', 'credit'], isCustom: false },
    { name: 'Rent', keywords: ['rent', 'house', 'stall', 'shop'], isCustom: false },
    { name: 'Utilities', keywords: ['kplc', 'token', 'water', 'internet', 'garbage', 'security'], isCustom: false },
    { name: 'Labor', keywords: ['labor', 'wage', 'salary', 'fundi', 'worker'], isCustom: false },
    { name: 'Loans', keywords: ['loan', 'fuliza', 'mshwari', 'kcb', 'equity', 'bank'], isCustom: false },
    { name: 'Other', keywords: [], isCustom: false },
];

export const PERSONA_DEFAULTS: Record<string, Omit<Category, 'id'>[]> = {
    'Mama Mboga': [
        { name: 'Stock', keywords: ['stock', 'soko', 'marikiti', 'supplies'], isCustom: false },
        { name: 'Spoilage', keywords: ['spoilage', 'rotten', 'waste', 'dump'], isCustom: false },
        { name: 'Market Fees', keywords: ['market', 'council', 'kanjo', 'fee', 'cess'], isCustom: false },
        { name: 'Transport', keywords: ['transport', 'fare', 'nduthhi', 'mzigo'], isCustom: false },
        { name: 'Airtime', keywords: ['airtime', 'data', 'bundle'], isCustom: false },
    ],
    'Bodaboda Rider': [
        { name: 'Fuel', keywords: ['fuel', 'petrol', 'shell', 'total', 'oil'], isCustom: false },
        { name: 'Service', keywords: ['service', 'mechanic', 'oil change', 'plug'], isCustom: false },
        { name: 'Repairs', keywords: ['repair', 'puncture', 'tyre', 'tube', 'spoke'], isCustom: false },
        { name: 'Fines', keywords: ['fine', 'police', 'cop', 'bond'], isCustom: false },
        { name: 'Loan', keywords: ['loan', 'daily', 'repayment', 'asset'], isCustom: false },
        { name: 'Food', keywords: ['lunch', 'tea'], isCustom: false },
    ],
    'Mochi': [
        { name: 'Materials', keywords: ['leather', 'glue', 'sole', 'thread', 'polish'], isCustom: false },
        { name: 'Labor', keywords: ['labor', 'fundi', 'helper'], isCustom: false },
        { name: 'Rent', keywords: ['rent', 'stall'], isCustom: false },
        { name: 'Transport', keywords: ['transport', 'delivery'], isCustom: false },
        { name: 'Utilities', keywords: ['power', 'token'], isCustom: false },
    ],
    'User': DEFAULT_CATEGORIES // Fallback
};

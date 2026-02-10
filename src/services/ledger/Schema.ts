export interface Category {
    id: string;
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
    synced: boolean;
    categoryName?: string; // Optional join field
    excludeFromAnalytics?: boolean;
    type: 'income' | 'expense';
    sender?: string;
    recipient?: string;
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

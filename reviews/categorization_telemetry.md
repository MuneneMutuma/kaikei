# Categorization Telemetry & Feedback Loop

## Objective
To track and analyze how transactions are being categorized (Method) and entered (Input Source) to improve the AI's performance and identify gaps in the "Fuzzy First" strategy.

## Proposed Data Schema Changes

### 1. New Columns for `expenses` Table
We should add the following columns to the `expenses` SQLite table to persist telemetry data:

```sql
ALTER TABLE expenses ADD COLUMN categorizationMethod TEXT; -- 'fuzzy', 'llm-local', 'llm-cloud', 'regex', 'manual'
ALTER TABLE expenses ADD COLUMN inputType TEXT; -- 'voice', 'text', 'sms'
ALTER TABLE expenses ADD COLUMN confidenceScore REAL; -- 0.0 to 1.0
```

### 2. TypeScript Interface Update (`Schema.ts`)
```typescript
export interface Expense {
    // ... existing fields
    categorizationMethod?: 'fuzzy' | 'llm-local' | 'llm-cloud' | 'regex' | 'manual';
    inputType?: 'voice' | 'text' | 'sms';
    confidenceScore?: number;
}
```

## Categorization Logic & Telemetry Tags

### Methods
- **`fuzzy`**: High-confidence match via Levenshtein distance (e.g. "Contribtion" -> "Contributions").
- **`llm-local`**: Categorized by on-device Qwen 0.5B model (Privacy-first).
- **`llm-cloud`**: Categorized by HuggingFace Remote Inference (Fallback for complex semantics).
- **`regex`**: Keyword matching or simple pattern recognition.
- **`manual`**: User manually selected the category (Correction).

### Implementation Strategy
1. **Capture**: The `NaturalLanguageParser` determines the method and returns it in the `ParsedExpense` object.
2. **Propagate**: `AddExpenseScreen` and `VoiceInput` pass this metadata to `ExpenseRepository`.
3. **Persist**: `ExpenseRepository` writes these fields to the DB.
4. **Analyze**: detailed reports can show:
   - % of transactions handled by Fuzzy (Fastest).
   - % of transactions falling back to Cloud (indicating Local LLM gaps).
   - Common corrections (identifying where Fuzzy/LLM failed).

## Future Feedback Loop
- **Auto-Learning**: specific corrections (e.g., User correcting "Food" to "Groceries" 5 times) can automatically generate a new `Keyword` for the specific category, effectively "promoting" that correction to the Fuzzy layer for instant future matching.

# Global Tagging Architecture

This document outlines the architectural changes implemented to support global tagging and decoupled budget planning.

## Objective

The goal was to decouple transaction "identity" (Tags) from monthly "planning" (Budget Breakdowns). This allows:
1.  **Ad-hoc Tagging**: Tagging any transaction with a category-specific label, even if it wasn't budgeted for.
2.  **Persistent Identity**: Reusing the same "Avocado" tag across multiple months for better analytics.
3.  **Flexible Planning**: Linking global tags to specific monthly budget lines when planning.

## Database Schema Diagram

```mermaid
erDiagram
    BUDGET ||--o{ BUDGET_LINE : "contains"
    CATEGORY ||--o{ BUDGET_LINE : "is budgeted for"
    CATEGORY ||--o{ CATEGORY_TAG : "has global tags"
    BUDGET_LINE ||--o{ BUDGET_BREAKDOWN : "details"
    CATEGORY_TAG ||--o{ BUDGET_BREAKDOWN : "planned via"
    EXPENSE }o--|| CATEGORY : "belongs to"
    EXPENSE }o--|| CATEGORY_TAG : "optionally tagged"

    BUDGET {
        string id
        string period "YYYY-MM"
    }

    BUDGET_LINE {
        string id
        string budgetId "FK to BUDGET"
        string categoryId "FK to CATEGORY"
        float limitAmount "Total for category"
    }

    CATEGORY_TAG {
        string id
        string categoryId "The parent (e.g. Food)"
        string name "The identity (e.g. Eating Out)"
    }

    BUDGET_BREAKDOWN {
        string id
        string budgetLineId "FK to BUDGET_LINE"
        string tagId "FK to CATEGORY_TAG"
        float plannedAmount "How much specifically for this tag"
    }
```

## Database Schema Changes

### [NEW] `category_tags` Table
This table stores the unique identity of items within a category.
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | TEXT (UUID) | Primary Key |
| `categoryId` | TEXT | Link to the parent category |
| `name` | TEXT | The name of the tag (e.g., "Charcoal", "Eating Out") |

### [MODIFIED] `budget_breakdowns` Table
Decoupled from hardcoded strings and linked to the new tag system.
| Column | Change | Description |
| :--- | :--- | :--- |
| `itemName` | **DELETED** | Removed in favor of `tagId` |
| `tagId` | **ADDED** | Link to the persistent `category_tags` record |

### [MODIFIED] `expenses` Table
Added support for granular tagging.
| Column | Change | Description |
| :--- | :--- | :--- |
| `tagId` | **ADDED** | (Optional) Link to a `category_tags` record |

## Repository Layer Updates

### `BudgetRepository.ts`
- **`getOrCreateTag(categoryId, name)`**: The "Hub" function ensure tags are unique per category.
- **`getCategoryTags(categoryId)`**: Fetches all tags used or planned for a category.
- **`getBudgetWithBreakdowns`**: Refactored to include both planned items and spending against those tags.

### `ExpenseRepository.ts`
- **`addExpense` / `updateExpense`**: Now support persisting the `tagId`.

## UI Integration

1.  **Tag Selection**: Replaced the "Budget Allocation" step with a "Transaction Tag" step in the manual entry and detail modals.
2.  **Visual Indicators**: Tags that are part of the current month's budget are marked with a bullet (•).
3.  **Dynamic Creation**: "New Tag" option in the UI allows creating a `category_tags` entry without exiting the transaction flow.

## Data Migration

Upon the first run of this architecture, the system automatically:
1.  Creates the `category_tags` table.
2.  Iterates through existing `budget_breakdowns`.
3.  Creates a new `category_tag` for each unique `itemName`.
4.  Updates the `budget_breakdowns` to link to these new tags via `tagId`.

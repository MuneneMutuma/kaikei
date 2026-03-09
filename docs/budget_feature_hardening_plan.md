# Kaikei: Budget Feature Hardening & Deployment Plan (Updated v2)

**Date:** March 2026
**Current Branch:** `feature/budget`
**Status:** ~65/100 (Beta-Ready, Needs Hardening)

## 1. Executive Synthesis
The budget feature is architecturally sound but needs "production-grade" resilience. Based on user feedback, we are prioritizing the resolution of keyboard-modal conflicts by transitioning input-heavy workflows to full screens. We are also shifting to a strict Test-Driven Development (TDD) approach, hardening the database schema with proper constraints, and keeping all development on the `feature/budget` branch.

---

## 2. Preliminary Phase: Keyboard-Modal Conflict Resolution
**Objective**: Eliminate UI friction caused by keyboard overlap in modals/sheets.

### 2.1 Convert Modals to Full Screens
- **Action**: Transition the following from modals/sheets to dedicated screens:
  - `BudgetSetupModal` -> `BudgetSetupScreen` (for creating/editing budget limits).
  - `AddItemSheet` in `BudgetDetailScreen` -> `BudgetBreakdownAddScreen` (for adding planned/unplanned items).
  - `ReviewTransactionsSheet` -> `BudgetReconcileScreen` (for linking transactions).
- **Navigation**: Update `App.tsx` and `RootStackParamList` to include these new routes.

---

## 3. Phase P0: Production Safeguards & DDL Hardening
**Objective**: Guarantee data integrity and schema correctness.

### 3.1 Schema Audit & Critical DDL Fixes
- **DDL Malformation**: Confirmed that `REFERENCES budget_lines(?)` is invalid SQLite DDL. `(?)` is not a standard placeholder for parameterization in `CREATE TABLE` statements.
- **Action**: Update `Database.ts` to strictly declare:
  - `budgetLineId TEXT NOT NULL REFERENCES budget_lines(id) ON DELETE CASCADE`
  - `tagId TEXT NOT NULL REFERENCES category_tags(id) ON DELETE CASCADE`
- **Uniqueness Enforcement**: Ensure `UNIQUE(categoryId, name)` and `UNIQUE(budgetLineId, tagId)` are strictly enforced. Transition away from manual "dev-time" deduplication logic in favor of schema-level guarantees.

---

## 4. Phase P1: Performance & Telemetry
**Objective**: Scalability for 10k+ transactions.

### 4.1 Indexing & Query Optimization
- **Action**: Add an indexed `monthKey` column (`YYYY-MM`) to the `expenses` table to avoid expensive `LIKE` scans.
- **Action**: Add telemetry for LLM auto-classifier accuracy and budget action success rates.

---

## 5. Phase P2: Test-Driven Development (TDD)
**Objective**: Build a comprehensive safety net for all budget-related logic.

### 5.1 Extensive Test Suite
- **Action**: Create a `tests/` directory and implement:
  - **Unit Tests**: For `BudgetRepository` methods (totals calculation, allocation logic).
  - **Integration Tests**: For database migrations and schema constraints.
  - **UI Tests**: For navigation flows and screen rendering using React Native Testing Library.
- **Coverage**: Aim for high coverage of the budget domain before considering the feature "Production Ready".

---

## 6. Strategic Features (Post-Hardening)
- **AI Auto-Tagging**: Ingest `category_tags` into the LLM prompt.
- **Rollover UI**: Prompt for unused budget rollovers at the start of a new month.
- **Tag Analytics**: Visual historical charts for specific category tags.

---

## 7. Git Workflow
- All work will be conducted and committed on the `feature/budget` branch. 
- Commit messages will be granular and descriptive of the hardening step taken.

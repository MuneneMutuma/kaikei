# Implementation Plan - Offline AI & Model Management

## Goal
Enable offline AI advice using the local Qwen 0.5B model and provide a dedicated screen for managing the AI model (download/delete/test).

## Proposed Changes

### 1. New Screen: `AiManagementScreen.tsx`
*   **Location**: `src/screens/AiManagementScreen.tsx`
*   **Purpose**: Replace the hidden `ModelDownloadScreen` with a proper settings page.
*   **Features**:
    *   Model Status (Ready/Missing/Downloading).
    *   Action Buttons (Download, Delete, Test).
    *   Progress Bar.
    *   Explanation of what the "Offline Brain" does.
    *   [Future] Toggle for "Use Local AI for Advice" (default: Auto/Fallback).

### 2. Update `ProfileScreen.tsx`
*   **Location**: `src/screens/ProfileScreen.tsx`
*   **Change**: Add a new menu item "AI & Intelligence" under Settings.
*   **Action**: Navigates to `AiManagement` (add to Stack in `App.tsx`).

### 3. Update `LlmClient.ts`
*   **Location**: `src/services/llm/LlmClient.ts`
*   **Change**: Add `chatCompletion` or `generateText` method.
*   **Logic**: Keep `categorize` as-is (JSON). Add a **NEW method** `generateText` or `chatCompletion` that returns natural language text for advice. This separates concerns: one for data entry (JSON), one for advisory (Text).
*   **Prompting**: Qwen 0.5B is small. We need a very concise prompt for advice.

### 4. Update `AdviceScreen.tsx`
*   **Location**: `src/screens/AdviceScreen.tsx`
*   **Change**: Implement Hybrid AI Logic.
*   **Logic**:
    1.  Try `HuggingFaceService.getAIAdvice` (Cloud - High Quality).
    2.  If it fails (Network Error), check `ModelManager.isModelReady()`.
    3.  If Ready -> Call `LlmClient.generateAdvice`.
    4.  If Not Ready -> Show "Offline & No Model" error.

### 5. Config Changes
*   **Location**: `App.tsx`
*   **Change**: Register `AiManagement` in `RootStackParamList`.

## 6. Design Pivot: Assistant Feed (Post-Research)
Based on research into fintech for emerging markets, the UI was overhauled to be:
*   **Actionable**: Structured JSON advice linked to specific actions ("Analyze Spending").
*   **Feed-Based**: "Insights" instead of a dashboard.
*   **Persona-Driven**: Clear greetings and context.
*   **Implementation**: `HuggingFaceService` updated to return `{ title, advice, category }`. `AdviceScreen` rewritten to render Insight Cards.

## 7. Refinement: Hybrid Natural Language (Post-Pivot)
*   **Goal**: Restore Online/Offline toggle while keeping the "Natural Language" advice format.
*   **Change**: `AdviceScreen` now supports switching between Local (Full Breakdown) and Cloud (Summary) sources.
*   **Output**: Both sources return plain text advice (no JSON).

## 8. Feature: Persona-Specific Categories
*   **Goal**: Tailor the expense tracking experience to the specific business needs of each persona.
*   **Proposed Changes**:
    1.  **Schema Update**: Define `PERSONA_DEFAULTS` mapping each persona to a unique set of categories.
        - **Mama Mboga**: *Stock, Spoilage, Market Fees, Transport, Airtime*.
        - **Bodaboda**: *Fuel, Service/Repair, Fines, Daily Target, Loan*.
        - **Mochi**: *Materials, Labor, Rent, Transport, Utilities*.
    2.  **Logic**: deeply integrate `userPersona` into `CategoryService`.
        - When persona is selected, automatically inject missing relevant categories.
        - Prioritize these categories in UI dropdowns.
    3.  **AI Integration**: Feed the *Persona-Specific List* to the LLM (Local & Cloud) for accurate categorization.
*   **Migration**: Existing data remains untouched; new categories become available.

## Verification Plan

### Manual Verification
1.  **AI Management**:
    *   Go to Profile -> Settings -> AI & Intelligence.
    *   Verify UI looks good.
    *   Delete Model -> Verify status updates.
    *   Download Model -> Verify progress bar and completion.
    *   Test Model -> Verify simple inference works.

2.  **Offline Advice**:
    *   Turn off WiFi/Data.
    *   Go to Advice Screen.
    *   Tap "Get Advice".
    *   Verify it doesn't crash and returns text (likely shorter/simpler than cloud).
    *   Verify "Offline Mode" indicator (optional UI tweak).

3.  **Online Advice**:
    *   Turn on WiFi.
    *   Verify Cloud Advice still works (higher quality).

# Unified Input Overhaul (Step-based UX) - Phase 3: Harmony & Stability
## User Review Required
> [!NOTE]
> Fixing visual inconsistencies and critical voice crashes.

## Proposed Changes
### Header Harmony
- **Typography**: Switch "Add Expense" title to 24px (from 28px) to match `ScreenHeader`.
- **Metrics**: Adjust `paddingHorizontal` to 20 (from 24) and `paddingTop` to `insets.top + 10`.
- **Progress Bar**: Move the linear progress bar *inside* the header or make it transparent-backed to avoid the "different shade" look.
- **Styling**: Remove any ad-hoc background colors that differ from the main screen surface.

# Unified Input Overhaul (Step-based UX) - Phase 5: Dynamic Categories & Voice Precision
## User Review Required
> [!IMPORTANT]
> Transitioning to Database-driven categories to ensure the UI and Voice engine share the exact same definitions.

## Proposed Changes
### Category Synchronization (Single Source of Truth)
- **`src/screens/AddExpenseScreen.tsx`**: 
    - Fetch all categories from `ExpenseRepository` on mount.
    - Remove reliance on hardcoded `CATEGORIES` array.
- **`src/screens/CategoryStep.tsx`**:
    - Update to receive `categories` as a prop.
    - Implement a `getCategoryIcon` and `getCategoryColor` helper to map DB names to visual assets.
    - Rename "Meals" (UI) to "Food" (DB) or ensure mapping handles synonyms.

### Voice Parsing Precision
- **`src/services/parser/NaturalLanguageParser.ts`**:
    - Enhance `categorizeByKeywords` to be case-insensitive (already is, but double-check).
    - Add logging to track which keyword triggered a match.
    - Ensure it uses the exact `keywords` array from the DB record.

# Unified Input Overhaul (Step-based UX) - Phase 6: Category UI Optimization
## User Review Required
> [!IMPORTANT]
> Redesigning the category selection layout to handle large numbers of categories without burying critical actions like "Import SMS".

## Proposed Changes
### Layout Restructuring
- **`src/screens/CategoryStep.tsx`**:
    - **Quick Action Bar**: Move "Import SMS" and "New Category" to a dedicated horizontal scroll list at the top.
    - **Categorized Grid**: Use a vertical scroll for the main category grid.
    - **Visual Depth**: Add subtle section headers (e.g., "Actions" and "Categories") for better visual hierarchy.
    - **Responsiveness**: Ensure the grid fills the remaining screen space efficiently.

# Unified Input Overhaul (Step-based UX) - Phase 7: Navigation Harmony & Voice UX
## User Review Required
> [!IMPORTANT]
> Transitioning from a "Floating Orb" to an **Integrated Ambient Footer** to honor the requirement for both robust voice input and inclusive "big tap" alternatives.

## Proposed Changes
### Navigation Harmony (The "Back Handshake")
- **`src/screens/AddExpenseScreen.tsx`**:
    - **Back Stack**: Intercept the Android hardware back button and system swipe gestures.
    - **Logic**: If the user is on Step 2 (Amount) or Step 3 (Confirm), move one step back. 
    - **Consistency**: This makes the step-based wizard feel like a single cohesive "Task View" rather than three separate screens.

### Voice UX: The "Integrated Supportive Layer"
- **Design Strategy**: Instead of Voice being a separate "Mode", treat it as a **Global Assistant** that is always reachable.
- **Ambient Footer**:
    - **Stationary Center**: The Mic button is now a solid part of the footer bar, not floating.
    - **Expansion Animation**: When recording starts, the footer bar "breathes" (expands vertically) and shifts to a glassmorphism/glow effect.
    - **Visual Waveform**: Integrate a 3-bar subtle pulse (using `Moti`) to show the user "I am listening to you" vs "I am thinking."
- **Hybrid Handoff**: 
    - If the user uses Voice but the LLM misses the category, the app lands on **Step 1 (Category)** but keeps the Voice-extracted Amount/Note pre-filled. This perfectly merges "Voice" with "Big Taps" for correction.

# Unified Input Overhaul (Step-based UX) - Phase 21: Intelligent & Fuzzy Categorization
## User Review Required
> [!IMPORTANT]
> User requested "Fuzzy First" strategy for speed.
> Flow: Regex (Amount) -> Fuzzy Match (Category) -> LLM (Fallback) -> Manual.

## Proposed Changes
### NaturalLanguageParser.ts
- **Step 1: Regex**: Extract amount and cleaned description immediately.
- **Step 2: Fuzzy Match**: Use `levenshteinDistance` to match description words against Category Names & Keywords.
    - If match score is high (<= 2 edits), auto-accept.
- **Step 3: Hybrid LLM**:
    - **A. Local LLM**: Tried first (if downloaded). Privacy-friendly.
    - **B. Remote LLM**: Fallback if Local is unavailable or uncertain.

### Telemetry (New)
- **Documentation**: Created `reviews/categorization_telemetry.md` detailing DB Schema changes for future dev.
- **Logging**: Added verbose logs distinguishing `fuzzy`, `llm-local`, `llm-cloud`, and `regex`.

## Verification Plan
### Manual Verification
1.  **Fuzzy**: Say "Contribution". Log: `[Parser] ⚡ MATCH: FUZZY...`
2.  **Remote**: Say "Burger". Log: `[Parser] 🧠 MATCH: REMOTE LLM...`

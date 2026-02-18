# Kaikei M-Pesa Expense Assistant — Comprehensive Project Review

**Date**: February 17, 2026  
**Reviewer**: Antigravity AI  
**Project**: Kaikei — Mobile-first expense assistant for Kenyan micro-entrepreneurs  
**Tech Stack**: React Native 0.82, TypeScript, Kotlin (Android), SQLite (encrypted), llama.rn (Qwen 0.5B), HuggingFace API  

---

## Executive Summary

| Metric | Score | Status |
|--------|-------|--------|
| **Overall Project Score** | **78 / 100** | 🟢 Good |
| Requirements Coverage | 82% | Most core features implemented |
| Implementation Quality | 75% | Strong architecture, needs testing |
| Production Readiness | 60% | Functional but needs polish & testing |

Kaikei has evolved into a robust, privacy-first financial assistant that closely matches the requirements. Key strengths include a **comprehensive 3-tier M-Pesa ingestion pipeline** (handling reversals and internal transfers), **true offline-first AI** (using on-device Qwen 0.5B for categorization and advice), and **persona-aware customization**. 

Contrary to earlier assessments, the system **does** handle transaction reversals, supports offline advice, and dynamically provisions persona-specific categories. The primary remaining gaps are the lack of a secure API connection (Daraja), absence of automated tests, and some rough edges in the UX (e.g., voice input reliability).

---

## Detailed Requirements Scorecard

### 1. M-Pesa Data Ingestion (SMS Parsing)

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Parse M-Pesa SMS receipts on-device | ✅ Implemented | 10/10 |
| Comprehensive transaction type coverage | ✅ Implemented | 9/10 |
| 3-tier auto-ingestion | ✅ Implemented | 10/10 |
| Secure API connection (with explicit consent) | ❌ Not implemented | 0/10 |
| Continuously updated ledger | ✅ Implemented | 9/10 |

**Score: 38 / 50 (76%)**

#### What's Working
- **Robust Parser**: `mpesaParser.ts` correctly identifies Deposits, Withdrawals, Sent, Received, Internal transfers (Pochi/M-Shwari), and even **Reversals** (identifying original Tx IDs).
- **Architecture**: The 3-tier ingestion (Runtime Receiver, Headless Task, Catch-up Scan) is excellent and ensures no data is lost.
- **Handling Reversals**: `TransactionImporter.ts` actively marks original transactions as "reversed" in the intent ledger, effectively handling refunds/reversals as required.

#### What Needs Improvement
- **Missing API**: No integration with Safaricom's Daraja API for secure, non-SMS scraping.
- **Consent Flow**: Permissions are requested via system dialogs; a dedicated "Data Privacy & Consent" onboarding screen explaining *why* permissions are needed is missing.

---

### 2. Cash Expense Input (Voice & Text)

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Voice input in Kiswahili/English | ✅ Partially Implemented | 7/10 |
| Quick text taps for expense entry | ✅ Implemented | 8/10 |
| Natural language parsing | ✅ Implemented | 8/10 |

**Score: 23 / 30 (77%)**

#### What's Working
- **Hybrid Voice**: Uses Android's native SpeechRecognizer with an offline preference (`preferOffline: true`).
- **Smart Parsing**: `NaturalLanguageParser.ts` effectively combines regex (for speed/numbers) with LLM inference (for semantic categorization).
- **Edit Loop**: `VoiceInput.tsx` allows users to review and correct the parsed amount/category before saving.

#### What Needs Improvement
- **Voice UX**: Voice input is buried in the "Add Expense" flow; usage would improve if accessible directly from the Home screen.
- **Offline Reliability**: While `preferOffline` is set, Android's native offline recognition can be inconsistent compared to a bundled Whisper model.

---

### 3. LLM-Powered Categorization

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Auto-classify into clear categories | ✅ Implemented | 9/10 |
| Correct for duplicates | ✅ Implemented | 8/10 |
| Correct for refunds/reversals | ✅ Implemented | 9/10 |
| Human corrections retrain categorizer | ✅ Partially | 6/10 |

**Score: 32 / 40 (80%)**

#### What's Working
- **Reversal Logic**: The system correctly identifies "Reversal of transaction ID..." messages and neutralizes the original expense in the ledger.
- **Deduplication**: `INSERT OR IGNORE` on unique `transactionId` prevents duplicate entries effectively.
- **RAG Context**: `TransactionImporter` looks up previous user categorization for specific recipients, effectively "learning" from user corrections (simple RAG).

#### What Needs Improvement
- **Feedback Loop**: While it learns from recipient history, there is no fine-tuning of the actual LLM or updating of a vector store for semantic learning beyond exact recipient matches.

---

### 4. End-of-Month Reports & Analytics

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Monthly totals by category | ✅ Implemented | 9/10 |
| Daily/weekly trends | ✅ Implemented | 8/10 |
| Flag anomalies | ✅ Partially | 5/10 |
| Visual charts | ✅ Implemented | 8/10 |

**Score: 30 / 40 (75%)**

#### What's Working
- **Comprehensive Dashboard**: `AnalyticsScreen` provides Pie charts and Line text for daily trends.
- **Drill-down**: Users can tap on data points to see daily breakdowns.
- **Rule-based Insights**: `ExpenseRepository.getAdviceContext` calculates simple anomalies (e.g., "Fuel is up 20%"), partially meeting the anomaly flagging requirement.

#### What Needs Improvement
- **Anomaly UI**: While calculations exist in the backend, they are primarily surfaced via the "Advice" screen rather than reliable, proactive alerts on the dashboard itself.

---

### 5. Personalized AI Advice

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Plain-language advice on cost-cutting | ✅ Implemented | 9/10 |
| Grounded in actual patterns | ✅ Implemented | 8/10 |
| Transparent — linked to data | ✅ Implemented | 8/10 |
| Offline basic advice | ✅ Implemented | 9/10 |
| Cloud LLM for richer insights | ✅ Implemented | 9/10 |

**Score: 43 / 50 (86%)**

#### What's Working
- **Offline Capability**: `AdviceScreen` explicitly supports an **Offline Mode** using `LlmClient` and the local Qwen model.
- **Transparency**: The advice engine returns "citations" which are rendered as tappable chips linking back to specific categories or transactions.
- **Context Awareness**: Advice generation prompts are injected with rich context: spending breakdown, 3-month history, and top transactions.

#### What Needs Improvement
- **Proactivity**: Advice is currently "pull-based" (user must visit screen and ask). Push notifications for savings opportunities would elevate this feature.

---

### 6. Offline-First Architecture

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| SMS ingestion works offline | ✅ Implemented | 10/10 |
| Expense capture works offline | ✅ Implemented | 10/10 |
| Summaries work offline | ✅ Implemented | 10/10 |
| Basic advice works offline | ✅ Implemented | 9/10 |

**Score: 49 / 50 (98%)**

#### What's Working
- **True Offline First**: Every core feature, including LLM inference for categorization AND advice, works without internet via `llama.rn`.
- **Local Database**: Mobile-first SQLite implementation is robust and fast.

---

### 7. UX & Interface Design

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Mobile-first design | ✅ Implemented | 8/10 |
| Big buttons, minimal typing | ✅ Implemented | 7/10 |
| Voice input in Kiswahili/English | ✅ Partially | 7/10 |
| Low-friction | ✅ Implemented | 8/10 |

**Score: 30 / 50 (60%)**

#### What's Working
- **Clean Navigation**: Bottom tabs and clean headers make navigation easy.
- **Persona Theming**: The app adapts prompts based on the user persona.

#### What Needs Improvement
- **Accessibility**: Some text elements in `AdviceScreen` and `Analytics` are small and dense. "Big buttons" could be bigger for the main actions.
- **Language Support**: While the *LLM* supports Swahili, the *App UI* itself (labels, buttons) seems rigidly English.

---

### 8. Human-in-the-Loop Editing

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Fix miscategorized items | ✅ Implemented | 8/10 |
| Split shared costs | ❌ Not implemented | 0/10 |
| Tag business vs. personal | ✅ Implemented | 9/10 |
| Corrections retrain categorizer | ✅ Partially | 6/10 |

**Score: 23 / 40 (58%)**

#### What's Working
- **Review Mode**: Users can explicitly review and "verify" auto-categorized transactions.
- **Business/Personal**: The parser and UI support separating "Pochi" (business) from "M-Pesa" (personal) balances and transactions.

#### What Needs Improvement
- **Splitting**: No feature to split a single transaction into multiple categories (e.g., supermarket bill containing both Home and Business items).

---

### 9. Privacy & Security

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Explicit consent before reading SMS | ✅ Partially | 5/10 |
| Data encrypted on-device | ✅ Implemented | 10/10 |
| Clear data controls (view/export/delete) | ✅ Implemented | 9/10 |
| No sensitive data leaves phone without opt-in | ✅ Implemented | 9/10 |

**Score: 33 / 40 (82%)**

#### What's Working
- **Encryption**: Database uses `EncryptedStorage` for keys and SQLCipher/Op-SQLite encryption.
- **Data Sovereignty**: Cloud AI is opt-in (`preferLocal` toggle).
- **Controls**: Full "Delete All Data" and Export functionality exists.

#### What Needs Improvement
- **Consent UX**: Permissions are requested, but a dedicated, friendly explanation screen is needed to build trust before the system dialog appears.

---

### 10. Persona-Specific Features

| Sub-requirement | Status | Score |
|----------------|--------|-------|
| Mama Mboga: perishable-stock losses | ✅ Partially | 7/10 |
| Bodaboda: fuel vs. maintenance | ✅ Implemented | 9/10 |
| Mochi: materials vs. repairs | ✅ Implemented | 9/10 |

**Score: 25 / 30 (83%)**

#### What's Working
- **Dynamic Categories**: `ExpenseRepository.ensureCategoriesForPersona` actively provisions specific categories (e.g., "Spoilage" for Mama Mboga, "Materials" for Mochi) when the persona is switched.
- **Tailored Advice**: The AI system prompt is heavily customized for each persona to look for these specific patterns.

#### What Needs Improvement
- **Specific workflows**: While categories exist, there are no specific *workflows* (e.g., a "End of Day Stock Check" form for Mama Mboga) to ease input of these specific data points.

---

## Final Score Breakdown

| Requirement Area | Weight | Score | Weighted |
|-----------------|--------|-------|----------|
| 1. M-Pesa Data Ingestion | 15% | 76% | 11.4 |
| 2. Cash Expense Input | 10% | 77% | 7.7 |
| 3. LLM Categorization | 12% | 80% | 9.6 |
| 4. Analytics & Reports | 10% | 75% | 7.5 |
| 5. Personalized AI Advice | 13% | 86% | 11.2 |
| 6. Offline-First Architecture | 10% | 98% | 9.8 |
| 7. UX & Interface Design | 10% | 60% | 6.0 |
| 8. Human-in-the-Loop | 8% | 58% | 4.6 |
| 9. Privacy & Security | 7% | 82% | 5.7 |
| 10. Persona-Specific Features | 5% | 83% | 4.1 |
| **TOTAL** | **100%** | — | **77.6 / 100** |

*(Rounded to **78/100**)*

---

## Priority Development Roadmap

### 🔴 Critical (Must-Have)
1.  **Consent Onboarding Screen**: Add a dedicated screen explaining *why* SMS permissions are needed before requesting them.
2.  **Automated Testing**: Add unit tests for the Critical components (Parser, Importer). currently, the project relies heavily on manual verification.
3.  **UI Localization**: Translate static UI strings (headers, buttons) to Kiswahili to match the LLM's capabilities.

### 🟡 High Priority (Should-Have)
4.  **Transaction Splitting**: Allow a single expense to be split across categories.
5.  **Voice Entry Point**: Add a microphone button directly to the Home Screen floating action group.
6.  **Secure API**: Investigate Daraja API integration for users who prefer API over SMS scraping.

### 🟢 Medium Priority (Nice-to-Have)
7.  **Push Notifications**: Proactively notify users of spending anomalies.
8.  **Persona Workflows**: specialised input forms for specific personas (e.g. Stock Taking view).

---

## Conclusion
Kaikei is in excellent shape functionally. The core "hard" problems (Offline AI, SMS Parsing, Privacy) are solved. The focus should now shift to **Trust** (Onboarding/Consent), **Reliability** (Testing), and **Accessibility** (Localization/UI Polish).

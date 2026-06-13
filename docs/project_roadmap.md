# Project Roadmap - Greetings Application

This document outlines the development plan for the production-ready Greetings Application.

## Completed Tasks

- [x] **Step 1: Model Recurrence & Calendar Logic Fixes**
  - Implemented correct logic for yearly, monthly, weekly, and once-off events in [`src/services/storage.ts`](src/services/storage.ts).
  - Updated `getDaysToEvent` and `isEventToday` to handle recurrence and date filtering correctly.
- [x] **Step 2: Implement Dedicated Quick Generator (On-Demand) Tab ("מחולל מהיר ⚡")**
  - Added a "Quick Generator" navigation tab in [`src/App.tsx`](src/App.tsx).
  - Refactored `handleOpenQuickGenerator` to initialize the tab state directly, removing the redundant modal popup.

## Pending Tasks

- [ ] **Step 3: Refine First/Last Name Separation & Relationship-Based Omission**
- [ ] **Step 4: Add Post-processing to Clean Gemini Greetings & Strip AI Meta-remarks**
- [ ] **Step 5: Implement Real Google OAuth2 Login with Configurable Client ID & Scopes (People, Calendar)**
- [ ] **Step 6: Create Google Contacts & Google Calendar Sync/Import Wizard (with Approvals)**
- [ ] **Step 7: Add Native Phone Contacts & Calendar API Hooks (Capacitor/Cordova compatible)**
- [ ] **Step 8: Expand Personal Request Textarea Size and UI/UX Styles**
- [ ] **Step 9: Write Comprehensive Handover/Architecture Documentation (`docs/project_architecture.md`)**

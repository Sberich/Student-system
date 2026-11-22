# Phase 1: Security & Data Integrity (P0 Fixes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate PDPA risks, remove hardcoded user credentials/URLs, prevent assignment ID collisions and silent score purges, fix `workPre` manual override overwrites, store per-subject grading config in Settings, and fix memory leaks.

**Architecture:**
- **Zero-Config Privacy:** Empty default `gasUrl` and `spreadsheetUrl`. First-run setup modal prompts user for their own Web App URL & PIN, with an optional "Try Offline Demo" mode.
- **Collision-Free IDs:** Monotonic assignment ID generator tracking historical max IDs across assignments and submissions.
- **Non-Destructive Gradebook Safety:** Automatic snapshot backup before structural modifications; replace silent purging with an Orphan Record Registry with soft warning.
- **Explicit Gradebook Work Attribution:** Separate auto-computed assignment submission scores from manual `workPre` overrides.
- **Per-Subject Grading Configuration:** Store `ratio` (70/30 vs 80/20) and `finalDivisor` inside each subject object in `settings.subjects` and sync to Google Sheets `Settings`.
- **Clean Event Lifecycle:** Properly detach `keydown` listeners on modal dismiss and guard global numpad keys.

**Tech Stack:** Vanilla JavaScript (ES6+), HTML5, CSS3, Google Apps Script (V8), Service Worker Cache API.

## Global Constraints
- Must remain 100% offline-first and backward-compatible with existing teacher data.
- Never delete or overwrite teacher data without an automated local snapshot backup.
- Never expose personal Google Spreadsheet or Script URLs in public source files.
- All modern modal popups must follow the established custom UI style (no native `alert()` or `confirm()`).

## Review Focus
1. **First-run on fresh device:** Opening app with cleared `localStorage` must show setup wizard and not crash, not freeze, and not query another teacher's sheet.
2. **Assignment deletion & recreation:** Deleting assignment `A25` and creating a new assignment must generate a new unique ID (not `A25`), and old submissions must not resurface.
3. **Manual workPre score preservation:** Manually editing `workPre` in the gradebook must persist across tab switches, pulls, and refreshes, without getting clobbered by assignment check sums.
4. **Subject config consistency:** Switching between a 70/30 subject and an 80/20 subject must compute according to that subject's specific ratio on all devices.
5. **Modal cleanup:** Opening and closing modern modals multiple times must not accumulate `keydown` listeners on `window`.

---

### Task 1: Zero-Config Privacy & First-Run Setup Wizard

**Files:**
- Modify: `student-grading-system/frontend/app.js`
- Modify: `student-grading-system/README.md`
- Test: Open in browser subagent with fresh/empty `localStorage`.

- [ ] **Step 1.1:** In `frontend/app.js`, change `DEFAULT_GAS_URL` and `SPREADSHEET_URL` to empty strings `''`.
- [ ] **Step 1.2:** In `frontend/app.js`, sanitize `DEFAULT_SUBJECTS` to generic defaults (e.g., General Social Studies, Thai History) without hardcoded teacher-specific personal assignments.
- [ ] **Step 1.3:** Fix `activeSubject` initialization: if `activeSubject` is not found in `appState.settings.subjects`, set it to `appState.settings.subjects[0].code` (fallback to `''`).
- [ ] **Step 1.4:** Implement `checkFirstRunWizard()` in `frontend/app.js`: if `!appState.settings.gasUrl` and no students exist, present a welcoming setup modal:
  - Options: "🔗 เชื่อมต่อ Google Sheets ของฉัน" (Enter Web App URL & PIN) or "🚀 ทดลองใช้งานแบบออฟไลน์ (Offline Demo)".
- [ ] **Step 1.5:** In `README.md`, remove personal Google Sheet and Script Editor URLs, replacing them with generic placeholders `<YOUR_WEB_APP_URL>` and instructions.
- [ ] **Step 1.6:** Verify with browser subagent: fresh localStorage opens setup modal cleanly without error.

---

### Task 2: Collision-Free Assignment IDs & Orphan Cleanup

**Files:**
- Modify: `student-grading-system/frontend/app.js`

- [ ] **Step 2.1:** In `frontend/app.js`, locate `handleAddAssignment` and `generateAssignmentId`.
- [ ] **Step 2.2:** Update ID generation logic to scan:
  - All existing `appState.assignments`
  - All existing keys in `appState.submissions` (regex matching `A(\d+)_`)
  - `appState.settings.lastAssignmentSeq || 0`
  - Generate `A` + `max(found + 1, seq + 1)` and update `appState.settings.lastAssignmentSeq`.
- [ ] **Step 2.3:** When an assignment is deleted in `handleDeleteAssignment`, also clean up or archive associated submissions from `appState.submissions` with undo support.
- [ ] **Step 2.4:** Verify: creating A1..A5, deleting A5, and creating a new assignment assigns `A6`, never reusing `A5`.

---

### Task 3: Stop Silent Purging & Implement Orphan Safety Snapshot

**Files:**
- Modify: `student-grading-system/frontend/app.js`
- Modify: `student-grading-system/backend/Code.js`

- [ ] **Step 3.1:** Implement `createStateSnapshot(reason)` in `frontend/app.js` that keeps the last 3 state snapshots in `localStorage` under `educator_state_snapshots` before any batch operation.
- [ ] **Step 3.2:** Modify `purgeInvalidGradebookRecords`:
  - Do NOT silently delete records.
  - Detect invalid keys (mismatched student ID or room) and store them in `appState.orphanGradebookRecords`.
  - If orphans exist, show a non-intrusive notice in the Gradebook header: `⚠️ มีคะแนนตกค้าง ${count} รายการ [ตรวจสอบ/กู้คืน]`.
- [ ] **Step 3.3:** In `deleteSubject`, update confirmation modal to be honest: if subject is deleted from app, explain that scores in sheet will remain until full sync.
- [ ] **Step 3.4:** In `backend/Code.js`, ensure `handleSaveGradebook` does not silently truncate rows without reporting `skipped` count in its JSON response.

---

### Task 4: Fix `workPre` & `_autoWork` Manual Override Protection

**Files:**
- Modify: `student-grading-system/frontend/app.js`

- [ ] **Step 4.1:** In `getOrCreateGradeRecord`, inspect `_autoWork` logic.
- [ ] **Step 4.2:** Introduce `isManualWork: boolean` in the grade record:
  - If teacher manually edits `workPre` via cell input or touch numpad, set `rec.isManualWork = true`.
  - Only update `rec.workPre` from assignment submissions if `!rec.isManualWork`.
  - When in auto mode (`!rec.isManualWork`), if submissions are cleared (count = 0), `workPre` must update to 0 (remove the faulty `computedWork > 0` condition).
- [ ] **Step 4.3:** Add a small badge or toggle in the Gradebook table column header or cell tooltip allowing teachers to switch between "⚡ ดึงจากงานที่ส่งอัตโนมัติ" and "✏️ กรอกคะแนนเอง".

---

### Task 5: Per-Subject Grading Config (70/30 vs 80/20 & Final Divisor)

**Files:**
- Modify: `student-grading-system/frontend/app.js`
- Modify: `student-grading-system/backend/Code.js`

- [ ] **Step 5.1:** Update subject data schema:
  - Each subject in `settings.subjects` includes:
    `{ code: '...', name: '...', ratio: '70/30', finalDivisor: 2, classrooms: [...] }`
- [ ] **Step 5.2:** In `renderSettings`, add controls per subject to select Ratio (`70/30` or `80/20`) and Final Exam Divisor (`1` or `2`).
- [ ] **Step 5.3:** In `calculateGradeRecord` and `renderGradebook`, use the active subject's configured ratio and divisor rather than global `appState.gradebookRatio`.
- [ ] **Step 5.4:** In `backend/Code.js`, update `SHEET_SETTINGS` serialization to save and restore each subject's ratio and divisor.

---

### Task 6: Sync Guard, Backend Hardcoding & Lifecycle Cleanup

**Files:**
- Modify: `student-grading-system/frontend/app.js`
- Modify: `student-grading-system/frontend/index.html`
- Modify: `student-grading-system/backend/Code.js`

- [ ] **Step 6.1:** Fix `hasEverPulledFromBackend`: set to `true` on successful `pullFromGoogleSheets` or successful setup import.
- [ ] **Step 6.2:** In `backend/Code.js`:
  - Update `resetScoresMenuAction` to remove hardcoded `A19-A24` and `ส30212`. Let teacher choose which subject to reset or reset all scores cleanly with explicit sheet confirmation.
  - Fix `setNumberFormat('@')` in `handleSaveSubmissions` and `handleSaveGradebook` to execute before `setValues` so leading zeroes are preserved.
- [ ] **Step 6.3:** Fix event listeners in `frontend/app.js`:
  - In `showModernConfirm` and `showModernAlert`, capture keydown handler reference and remove it in `closeModal()`.
  - In `handleGlobalKeydown`, check `if (document.querySelector('.modern-confirm-overlay')) return;` so numpad keys don't trigger behind modals.
- [ ] **Step 6.4:** Remove duplicate service worker registration in `index.html`.
- [ ] **Step 6.5:** Bump version to `v=40` across all files.

---

### Task 7: Verification & Regression Testing

**Files:**
- Test via Browser Subagent & local dev server.

- [ ] **Step 7.1:** Test First-Run setup on clean storage.
- [ ] **Step 7.2:** Test Assignment ID creation, deletion, and recreation (no collision).
- [ ] **Step 7.3:** Test Gradebook manual score preservation and ratio calculation per subject.
- [ ] **Step 7.4:** Test Modal dismiss keydown cleanup.
- [ ] **Step 7.5:** Commit, push to `origin/main`, and verify deployment.

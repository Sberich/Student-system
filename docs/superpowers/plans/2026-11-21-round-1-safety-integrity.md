# Round 1: Safety, Data Integrity, and Core Bug Fixes Implementation Plan

> **Goal:** Eliminate security/PDPA risks, prevent fake data generation and accidental data overwrites on Google Sheets, fix critical grading calculation bugs, and resolve the "ค้างส่ง" auto-advance jump.

**Architecture:**
- **Security:** Remove public static student files from frontend. Secure Apps Script token checks.
- **Data Integrity:** Clean zero-initialization for grade records (no fake 58/1.5 scores). Guard sync to prevent pushing empty/seed data over real sheets. Replace `no-cors` with standard CORS checking `res.json()`.
- **Calculations:** Remove recurring midRaw mutation in `loadLocalState` and zero-sum fallback in `calculateGradeRecord`. Unique assignment ID generation.
- **Workflow:** Fix pending student queue index in `applyScore`.

---

## Tasks Checklist

- [ ] **Task 1: PDPA Security & Remove Public Student Files**
  - Delete `frontend/data/backup_grades_2569.json` and `frontend/data/backup_grades_2569.csv` (keeping private copies in `data/` for backend/testing only).
  - Update `loadOriginalSchoolGrades` in `frontend/app.js` to either accept local file upload or load from local file selector safely.
  - Verify Cloudflare Pages bundle no longer contains student PII.

- [ ] **Task 2: Backend Security Hardening (`backend/Code.js`)**
  - Remove public `action: 'setApiToken'`.
  - In `verifyToken_`: Require token match against `API_TOKEN` Script Property.
  - In `seedSampleData()`: Add confirmation warning to prevent accidental clearing of sheets.

- [ ] **Task 3: Eliminate Fake Scores in Gradebook (`frontend/app.js`)**
  - In `getOrCreateGradeRecord()`: Initialize unentered scores to 0 (or null/blank display), no hardcoded 7, 8, 12, 16, 5 scores.
  - When rendering table cells with 0 or unentered score, format cleanly so teachers distinguish unentered from scored.

- [ ] **Task 4: Stop Destructive Auto-Seeding & Add Sync Guard**
  - In `initApp()` / `loadLocalState()`: If local storage is empty, do NOT seed 70 fake students. Show clean welcoming state.
  - Add `hasPulled` guard: Prevent `syncFullState` from sending `replace_all` to backend unless data has been pulled or confirmed by teacher.

- [ ] **Task 5: Fix Sync Handshake (`no-cors` $\rightarrow$ Standard CORS)**
  - In `pushSubmissionsToBackend`, `syncSettingsToBackend`, `syncFullState`:
    Change `mode: 'no-cors'` to standard `fetch(gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: ... })`.
  - Await `res.json()` and check `result.success`.
  - Clear `isDirty = false` ONLY on true success. If network fails or lock timeouts, preserve local changes and notify teacher.

- [ ] **Task 6: Fix Calculation Bugs & Assignment ID Collision**
  - In `loadLocalState()`: Remove the recurring `if (rec.midRaw > 20) rec.midRaw /= 2;`.
  - In `calculateGradeRecord()`: Remove the `if (attPre === 0 && workPre === 0) sumPre = rec.sumPre;` fallback.
  - In `handleAddAssignment()`: Use collision-free ID generation (find max existing ID number + 1 or timestamp-based ID) so deleting and adding doesn't reuse existing IDs.

- [ ] **Task 7: Fix "ค้างส่ง" Filter Auto-Advance Bug**
  - In `applyScore()`: Before updating student submission to `ส่งแล้ว`, calculate the next student in the pending list so `navigateStudent(1)` advances properly without jumping back to index 0.

- [ ] **Task 8: Missing CSS Variables in `:root`**
  - Define `--border-color`, `--text-primary`, `--primary-main`, `--primary-light`, `--shadow-xs`, `--transition-fast`, `--radius-pill` in `frontend/style.css`.

- [ ] **Task 9: Golden Test & Verification Suite**
  - Create a Node.js test script `test_round1.js` that tests:
    1. Golden calculation test against 434 records in `data/backup_grades_2569.json`.
    2. Zero score handling test.
    3. Assignment ID uniqueness test.
    4. Pending filter navigation logic test.
    5. CSS variable definition test.
  - Run test suite and confirm 100% pass before committing.

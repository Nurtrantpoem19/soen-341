# SOEN 341 — Sprint 3 Individual AI Usage Log
**Student Name:** Jack Wu  
**Sprint:** Sprint 3 (Fall 2026)  
**Feature Assigned:** Feature 1 — Recruiter Dashboard and Posting Management  
**AI Tool Used:** Google Gemini  

---

## 1. Objective & Scope of AI Usage
During Sprint 3, I used Google Gemini to assist with requirements analysis, modular backend route design (`routes/recruiters.js`), frontend dashboard implementation (`frontend/recruiter.html`, `frontend/css/recruiter.css`, `frontend/js/recruiter.js`), and unit/acceptance test generation (`test/recruiter.test.js`). All AI-generated code was manually reviewed, debugged against our in-memory PostgreSQL test runner (`pg-mem`), and validated using `npm test`.

---

## 2. Prompts, Generated Outputs, Modifications & Validation

### Interaction 1: Modular Recruiter Route Architecture & Database Schema Check
- **Prompt Summary:** Shared `routes/jobs.js` and `db/migrations/001_initial.sql` through `003_jobs.sql`, asking how to implement the Sprint 3 Recruiter Dashboard and Posting Management feature without causing merge conflicts in teammates' files.
- **AI Output:** Identified that `003_jobs.sql` already provided `recruiter_id` and `is_open` columns on the `jobs` table, and generated a standalone `routes/recruiters.js` module with CRUD routes, applicant filtering (`status`, `fromDate`, `toDate`), and candidate status updates.
- **Technical Review & Modification (Bug Fix #1 — Express Initialization Order & Module Naming):**
  - *Issue Caught:* When wiring `registerRecruiterRoutes(app, pool, authenticateUser)` into `server.js`, the initial placement was accidentally put at the top of `createApp()` before `const app = express();`, and referenced `./routes/recruiter` instead of the existing filename `./routes/recruiters`.
  - *Modification:* Updated the import to `require('./routes/recruiters')` and moved `registerRecruiterRoutes(app, pool, authenticateUser)` below `registerApplicationAnalytics(app, pool, authenticateUser)` after `app` and middleware were initialized.
- **Validation:** Ran `npm test` and verified all 14 existing project tests continued passing (`pass 14, fail 0`).

---

### Interaction 2: Unit & Acceptance Testing and `pg-mem` SQL Compatibility
- **Prompt Summary:** Requested unit tests for the validation helper functions and end-to-end acceptance tests for all Recruiter Dashboard user stories in `test/recruiter.test.js`, then shared the test runner failure output (`AssertionError: 500 !== 404` at line 140).
- **AI Output:** Generated `test/recruiter.test.js` testing `validateJobPayload`, `validateApplicationFilters`, and `parsePositiveId`, plus an end-to-end acceptance test covering job creation, unauthorized edit blocking, editing, candidate application listing, status/date filtering, status updates, and archiving.
- **Technical Review & Modification (Bug Fix #2 — `pg-mem` SQL Alias Compatibility):**
  - *Issue Caught:* Running `npm test` passed the unit tests (`pass 15`), but the acceptance test failed with a `500` Internal Server Error on `PUT /api/recruiter/jobs/:id` because `pg-mem` does not support table aliases inside `UPDATE` statements (`UPDATE jobs j SET ... WHERE j.id = $9 RETURNING j.id`) or complex `COUNT(a.id)::int` grouped left joins.
  - *Modification:* Removed the `j.` table alias from the `UPDATE jobs` queries in `PUT /api/recruiter/jobs/:id` and `PATCH /api/recruiter/jobs/:id/archive`, simplified `GET /api/recruiter/jobs` to compute `applicationCount` cleanly across both `pg-mem` and PostgreSQL, and passed `Date` objects to timestamp filter parameters.
- **Validation:** Re-ran `npm test` and confirmed all 16 tests passed (`pass 16, fail 0`).

---

### Interaction 3: Recruiter Dashboard Frontend UI
- **Prompt Summary:** Shared `frontend/js/auth.js` and `frontend/jobs.html` so the frontend Recruiter Dashboard would match the team's authentication storage (`sessionStorage.getItem("careerconnect_token")`) and styling conventions.
- **AI Output:** Generated `frontend/recruiter.html`, `frontend/css/recruiter.css`, and `frontend/js/recruiter.js` with a two-column layout for creating/editing postings, toggling open/archived state, filtering applicants by status and date range, and updating candidate statuses.
- **Technical Review & Validation:** Verified that the frontend reads `careerconnect_token` from `sessionStorage`, sends `Authorization: Bearer <token>` headers to `/api/recruiter/jobs`, and handles unauthenticated states gracefully.

---

## 3. Summary of Final Engineering Decisions
1. **Zero-Conflict File Isolation:** Kept all recruiter backend logic in `routes/recruiters.js` and tests in `test/recruiter.test.js`, requiring only a 2-line registration in `server.js` (`git diff server.js` verified).
2. **Database Compatibility:** Standardized SQL statements in `routes/recruiters.js` so queries run identically in production PostgreSQL and the CI `pg-mem` environment.
3. **Role & Ownership Security:** Scoped every recruiter mutation and applicant lookup to `recruiter_id = req.user.id` so recruiters can only manage their own postings and candidates.

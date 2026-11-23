# Sprint 4 Static Analysis & Maintenance Report

## Tool Setup & CI Integration

- **Tool:** ESLint (`eslint` + `@eslint/js` + `globals`) configured via [eslint.config.js](../../eslint.config.js)
- **Script:** `npm run lint` (`eslint .`)
- **CI Pipeline:** Integrated into [.github/workflows/database.yml](../../.github/workflows/database.yml) as a dedicated `lint` job that runs automatically on every `push` and `pull_request` alongside the PostgreSQL `test` job.
- **Rules enabled:** `@eslint/js` recommended ruleset plus `eqeqeq`, `no-var`, `prefer-const`, and `no-unused-vars` (configured with Node.js globals for backend/tests and browser globals for `frontend/js/`).

---

## Issues Identified & Repaired

### 1. Issues caught during the auth/profile cleanup (commit `dd4f6f3`)

| File | Issue | Category | Fix |
| --- | --- | --- | --- |
| `server.js` | Duplicate `authenticateUser` function declaration and duplicate empty `POST /api/auth/login` route stub | Bug / Dead code | Removed duplicate definitions and moved auth middleware to `middleware/auth.js` and routes to `routes/auth.js`. |
| `server.js` | Unused `demoUser` middleware left over from Sprint 1 | Dead code / Security smell | Removed `demoUser` and cleaned up `DEMO_AUTH` from `.env.example`. |
| `frontend/profile.html` | Three duplicated `Skills` inputs with identical `id="skills"` attributes | Bug / Invalid HTML | Removed the two duplicate input blocks and kept one valid `#skills` field. |
| `test/database.test.js` | Unused duplicate `authenticateUser` function pasted at the bottom of the file | Dead code | Removed unused function. |

### 2. Issues flagged by initial `npm run lint` scan

Initial ESLint run reported **10 real errors** (plus false positives on object rest-destructuring and `t.after` variable declarations, which were resolved in `eslint.config.js` via `ignoreRestSiblings` and `ignoreReadBeforeAssign`):

| File & Line | Rule | Category | What was wrong | Fix |
| --- | --- | --- | --- | --- |
| `frontend/js/job-details.js:146` | `no-undef` | Bug | Unreachable/broken recursive call `loadMatchData(job.id)` referencing undefined `job` inside a duplicate function block from a previous merge. | Removed the duplicate lines 106–147, keeping the complete implementation below it. |
| `frontend/js/job-details.js:149,154,176` | `no-redeclare` | Bug / Code smell | `setMatchStatus`, `renderMatch`, and `loadMatchData` were declared twice in the same file. | Removed the duplicate block (lines 106–147). |
| `frontend/js/notifications.js:95,108` | `preserve-caught-error` | Maintainability | Re-throwing `new Error(...)` inside `catch (error)` dropped the original cause. | Passed `{ cause: error }` when throwing. |
| `frontend/js/recruiter.js:68` | `preserve-caught-error` | Maintainability | Re-throwing `new Error(...)` inside `catch (error)` dropped the original cause. | Passed `{ cause: error }` when throwing. |
| `services/notifications.js:56` | `preserve-caught-error` | Maintainability | Re-throwing `new TypeError(...)` inside `catch (error)` dropped the original URL parsing error. | Passed `{ cause: error }` when throwing. |
| `server.js:173` | `no-unused-vars` | Code smell | Express error middleware had unused `next` parameter. | Renamed to `_next` so Express still recognizes the 4-arg error handler while satisfying ESLint. |
| `test/database.test.js:134,242` | `no-unused-vars` | Dead code | Unused `uploadedResumeId`, `path`, and `resumeDirectory` variables. | Removed unused declarations. |

*(Update with commit hash once the ESLint & fixes commit is pushed.)*

---

## Verification

After applying all fixes:
- `npm run lint` -> **0 errors, 0 warnings**
- `npm test` -> **57/57 tests passing**

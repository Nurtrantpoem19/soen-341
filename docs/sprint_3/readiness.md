# Sprint 3 readiness and demo - November 19, 2026

## Branch and scope

`fix/sprint3-readiness` is based on main `9341f26` and includes the earlier application-tracking UI. It repairs duplicate JavaScript declarations and duplicate HTML controls introduced during integration, closes candidate self-updating of hiring status, and adds interview scheduling and deadline reminders. Existing recruiter, notification and AI work is retained.

## Run locally (Windows PowerShell)

1. Open this repository in VS Code and start Docker Desktop.
2. Start the existing `soen-341` database container, or run `docker compose up -d --wait db`.
3. Run `npm ci`, then `npm run db:migrate`, then `npm start`.
4. Open http://localhost:3000. No Live Server is required.
5. `.env` needs `DATABASE_URL` and `JWT_SECRET`. Add `GEMINI_API_KEY` for live AI. Never commit `.env`.

The server serves only public frontend files and the home page. Resume downloads still require authentication. Migration 007 adds nullable `jobs.deadline_at`, `interviews`, and `deadline_subscriptions`; existing records are preserved. Database teammates should review this additive migration before merging.

## Lab walkthrough

- Recruiter: create a posting, edit it, set a future deadline, and view applications. Filter by status/date and update a status.
- Candidate: apply with an optional cover letter; verify duplicate protection and the history dashboard, status totals and weekly/monthly table.
- Recruiter: enter a future interview time and location/meeting link on an application. Sending it persists the interview and updates status atomically.
- Candidate: refresh My applications to see the interview in local time; open Home & notifications for the invitation and status alerts.
- Deadline reminder: use a candidate who has NOT applied, open a posting whose deadline is within 24 hours, click Remind me, then open the home notification bell. Reloading does not create another alert. Removing the reminder stops future delivery; an already-delivered alert remains dismissible.
- AI: save profile skills, upload a synthetic PDF/DOCX resume, then request feedback or match against a posting. A real Gemini key and provider access are needed. The local configuration currently has no key, so live AI has not been verified here.

Local browser verification used synthetic accounts and a posting titled `Sprint 3 Demo Developer`. It verified login, Apply, persisted history/analytics, recruiter deadline saving, interview scheduling, candidate interview display and notification delivery.

## Scheduling API

All routes require a bearer JWT. Recruiter routes also verify database role and posting ownership.

| Method and route | Input / behaviour |
| --- | --- |
| PATCH `/api/recruiter/jobs/:id/deadline` | `{deadlineAt: ISO timestamp with timezone}` or null to remove |
| POST `/api/jobs/:id/reminder` | Subscribe current user to an open posting with a future deadline |
| DELETE `/api/jobs/:id/reminder` | Unsubscribe current user |
| POST `/api/recruiter/applications/:id/interview` | `{scheduledAt: ISO timestamp with timezone, location: string}`; create/reschedule and notify atomically |
| GET `/api/interviews/me` | Current user's interviews for applications in Interview status |

Reminder alerts are generated when notification list/count is polled within 24 hours before closing, not while the user is offline. Past deadlines block new submissions at the API. Times are stored with timezone and displayed locally in forms/dashboard; notification messages explicitly show UTC.

## Verification and remaining release steps

Automated tests cover API ownership, persistence, filtering, duplicate applications, notifications, scheduling, rollback, date validation, AI success/failure with a fake provider, frontend syntax, unique HTML IDs, and private-file protection. Final local results: 64 tests passed, 0 failed with pg-mem; the same 64 passed against PostgreSQL 17 in a separate test database. Run `npm test`; CI uses PostgreSQL 17 with `TEST_DATABASE_URL`.

Before evaluation:

- Publish this branch and get teammate review; wait for CI on the actual PR before merging. Local test success is not a substitute for the new PR's CI result.
- Configure a Gemini key on the demo machine and verify a live response using a synthetic resume.
- Each member must provide their own Sprint 3 PDF under their personal AI_Log directory. Do not invent another member's AI usage or completed contributions.
- Confirm the project board, user-story acceptance-test mapping, contribution logs, final one-page report and all meeting minutes are current in GitHub. A local branch is not yet a submitted deliverable.

## Acceptance-test mapping

| Sprint 3 user story | Automated evidence |
| --- | --- |
| Recruiter manages postings and candidates | `test/recruiter.test.js`: create/edit/archive, filters, role and ownership checks |
| Candidate submits and tracks applications | `test/application-submission.test.js`, `test/application-analytics.test.js`, `test/applications-ui.test.js` |
| User reads/dismisses private alerts | `test/notifications.test.js`, `test/notifications-ui.test.js` |
| Recruiter invites candidate to an interview | `test/recruiter.test.js` scheduling acceptance case; `test/scheduling.test.js` validation/rollback |
| Candidate receives an opted-in deadline reminder | `test/recruiter.test.js` deadline acceptance case (isolation, deduplication, unsubscribe, expiry) |
| Candidate requests AI feedback / matching | `test/resume-feedback.test.js` feedback and matching acceptance cases (provider mocked) |

Match these story descriptions to the team's current issue/board entries during PR review; this file does not claim the remote board has been updated.


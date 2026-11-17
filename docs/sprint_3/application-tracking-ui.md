# Candidate application tracking UI

The job details Apply button now submits the saved job ID and an optional cover letter through the authenticated application API. Success and duplicate responses disable further submission and link to My applications. Login expiry and request failures display an actionable message.

My applications is available from the home sidebar and job pages. It displays newest-first application history, current status, submitted/updated dates, saved cover letters, status filtering, totals by current status, and weekly/monthly submission counts. Analytics always cover all applications; the status filter affects history only. Refresh reloads both sections. Candidate status editing is intentionally absent pending the team's permissions decision.

This branch also contains the recruiter status notification fix: a changed status creates a candidate notification in the same transaction; repeated identical status updates do not generate another notification.

## Validation

- `npm test`: 39 tests passed using pg-mem locally, including frontend auth, safe text rendering, stale-response protection, retry, submission, duplicate and failure states.
- Browser verification against the real local API backed by disposable pg-mem data: signed-out access, login, empty dashboard, submission with cover letter, saved history and totals, weekly grouping and status filtering.
- `git diff --check` passed.
- Real PostgreSQL and CI validation remain for the PR. No database migrations were changed.

## Review/demo

1. Start the backend with the normal project setup and serve the repository at http://localhost:5500 (the existing configured frontend origin).
2. Log in as a candidate, open a job, enter an optional cover letter and apply.
3. Follow View my applications. Confirm title, company, current status, dates, letter and totals.
4. Switch Month/Week, filter by status, and use Refresh.
5. As the owning recruiter, change the application's status. Return as the candidate and refresh; check the notification center on Home.
6. Review and run CI before merging. This completes the candidate tracking UI integration, not every team's Sprint 3 feature.

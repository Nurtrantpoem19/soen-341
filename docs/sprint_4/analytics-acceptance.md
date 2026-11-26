# Analytics dashboard: acceptance criteria and execution

User story: As a job seeker, I want to see my application history, current status breakdown and application activity so I can track my job search.

Scope: finishes the existing required analytics feature on current main. No schema changes or new AI feature. The older broad Sprint 3 PR is not required for this branch.

| ID | Given / When / Then | Automated evidence | Local result |
| --- | --- | --- | --- |
| AC-AN-01 | Given saved applications, when I open My Applications, then totals, five current statuses, activity bars, a data table and safe application history are displayed. | analytics-frontend.test.js AC-AN-01 | Passed |
| AC-AN-02 | Given loaded analytics, when I select week/month or a history status, then the selected request updates its section without filtering the overall totals. | analytics-frontend.test.js AC-AN-02 | Passed |
| AC-AN-03 | Given no applications, when I open the dashboard, then zero totals and helpful empty states appear without invalid chart widths. | analytics-frontend.test.js AC-AN-03 | Passed |
| AC-AN-04 | Given a failed request, when I press Refresh after recovery, then the data loads; if my session expires, private content is hidden and a login link appears. | analytics-frontend.test.js AC-AN-04 | Passed |
| AC-AN-05 | Given overlapping requests, when an older response arrives after a new grouping selection, then it cannot replace the latest result. | analytics-frontend.test.js AC-AN-05 | Passed |
| AC-AN-06 | Given no valid session, when analytics is requested, then no unauthenticated request is sent and an expired token is cleared. | analytics-frontend.test.js AC-AN-06 | Passed |
| AC-AN-07 | Given the app server, when public assets and private paths are requested, then the dashboard works and repository files remain inaccessible. | analytics-frontend.test.js AC-AN-07 | Passed |
| AC-AN-08 | Given applications belonging to two users, when one requests analytics, then only their persisted data is counted, even if another user ID is supplied. | application-analytics.test.js acceptance #96 | Passed |
| AC-AN-09 | Given applications at month/week/year boundaries, when grouped, then UTC months and Monday-start weeks are used consistently. | application-analytics.test.js UTC boundary case | Passed |

## Execution evidence

Executed locally with `npm test`: 64 passed, 0 failed. `npm run lint`: passed with no reported findings. This is local evidence, not a claim of GitHub CI execution or teammate approval. Frontend tests use the real HTML in jsdom and dispatch DOM events; manual browser rendering is a separate check. CI includes an explicit frontend job as well as lint and PostgreSQL integration tests.

Only periods with applications appear in the activity chart; no date-range filter is implied. Statuses describe current status, not a historical transition count. History is sorted newest first by the existing API. All rendering uses textContent for user-provided values.

## Lab demo

Run `npm run db:migrate` and `npm start`, then open http://localhost:3000/frontend/applications.html. Log in with a job-seeker account that has applications. Show the totals, status bars, week/month selector, data table, history status filter and Refresh. Also show an empty account and logged-out state. Use synthetic accounts for demonstrations.

## Review checklist

- [ ] Link the story and child tasks to the final PR and project board.
- [ ] Another team member reviews correctness, accessibility, tests and the static-serving scope.
- [ ] GitHub lint, frontend and PostgreSQL jobs pass on the final revision.
- [x] Browser validation: synthetic account with eight persisted applications; monthly totals 1/2/5, weekly grouping, and Interview filter (one result) verified in Chrome.
- [ ] Record teammate review feedback before merging.

This document addresses analytics only. Notification acceptance execution, other stories, AI validation and individual team logs still need their own evidence.

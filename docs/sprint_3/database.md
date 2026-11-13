# Sprint 3 database work

This change supports the Sprint 3 features in the brief and team plan. It does not implement backend routes or frontend screens.

## Included

- `004_sprint3.sql`: persistent notifications with recipient, event type, message, related job/application, delivery time, read state and duplicate prevention.
- Posting fields for draft/active/archive state and deadlines, keeping the existing `is_open` field compatible with job search.
- Indexes for recruiter ownership, application status/date queries, candidate history and notification retrieval.
- `db/sprint3.js`: parameterized database helpers for notification creation/listing/read state, posting state changes, recruiter applicant filters/counts, candidate history and status/time analytics.
- PostgreSQL tests for ownership isolation, notification state/deduplication, lifecycle constraints, analytics, and migration reruns.

## Integration notes

Apply using the existing `npm run db:migrate`. Do not edit previously applied migrations. The migration preserves existing application records and their current relationships.

Backend developers can import the helpers from `db/sprint3.js`. Pass authenticated user IDs, not user IDs supplied by a client. Recruiter endpoints must check the recruiter's role; helpers additionally restrict reads/updates by posting ownership. `createNotification` is a trusted internal writer: its caller chooses and validates the recipient and related event.

Posting states: draft (`is_draft=true`, `is_open=false`), active (`is_open=true`), archived (both false). Existing closed postings count as archived without inventing an archive date. Use `setPostingState` to keep fields consistent.

Notifications become visible at `scheduled_for`. A reminder scheduler and event triggers must be implemented by the backend team. A notification row does not schedule its own creation. Deduplication keys are unique per recipient; omitted keys allow repeated events.

Analytics takes `{from, to, bucket}` with UTC ISO dates, a half-open interval `[from,to)`, and day/week/month buckets. It reports current status counts and submission trends; empty time buckets are omitted. Pagination defaults to 50 and is limited to 100.

Existing jobs/applications tables already cover core data. No replacement application workflow, historical foreign-key repair, AI feedback tables, authentication changes, or new API endpoints are included. AI storage can be agreed with the AI developer if needed.

## Testing

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL test database and run `npm test`. The test account needs schema-creation permission. The four Sprint 3 tests use isolated schemas and clean them up afterwards. The existing CI workflow already supplies PostgreSQL and runs them.

Without a PostgreSQL URL, the existing pg-mem tests run and the four PostgreSQL-specific tests explicitly skip. They use real PostgreSQL because JSON aggregation/date grouping are not reliably covered by the emulator.

Implementation and tests were AI-assisted at Aymane's request. Changes are submitted for team review before merging.

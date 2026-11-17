# Sprint 3 database work

## Final scope after integration with main

- `006_application_query_indexes.sql` adds composite indexes for recruiter application status/date queries, candidate status counts, and candidate history.
- `db/sprint3.js` provides parameterized, ownership-scoped reporting helpers: recruiter applicant filters, recruiter counts, candidate history and UTC application analytics.
- `test/sprint3.test.js` checks ownership, date boundaries, summaries, migration reruns/index creation, and compatibility with the existing notification service.

The earlier unmerged `004_sprint3.sql` was replaced: main already owns notification storage (`004_notifications.sql`), recruiter roles (`004_recruiter.sql`) and AI feedback storage (`005_resume_feedback.sql`). The duplicate notification implementation and unused draft/archive/deadline fields were removed. Archiving follows the existing backend convention: `jobs.is_open=false`.

## Integration

Apply with `npm run db:migrate`. The migration runner tracks full filenames, including the two existing `004_` migrations. The new indexes preserve existing data and can run on both a fresh database and an existing main database.

Reporting helpers are optional database utilities, not new API endpoints; existing routes continue using their current implementations. Pass IDs from authenticated server context. Recruiter routes must additionally enforce the recruiter role. Analytics accepts `{from,to,bucket}` using a half-open UTC range `[from,to)` and day/week/month buckets; empty buckets are omitted. Pagination defaults to 50, maximum 100.

Notifications continue using `services/notifications.js` and the team's existing routes and schema. This branch adds no notification scheduler or new frontend behavior.

If the original unmerged database migration was already run locally, use a fresh development/test database or explicitly migrate its data to the team's schema before starting the combined app. This revision does not silently rewrite databases created from that unpublished schema.

## Validation

Run `npm test` with `TEST_DATABASE_URL` pointing to a dedicated PostgreSQL test database. The four database tests use isolated schemas and clean up afterward. Without PostgreSQL they explicitly skip; the other tests use pg-mem. CI supplies PostgreSQL. Implementation, reconciliation, and tests were AI-assisted and remain subject to team review.

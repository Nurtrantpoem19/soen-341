# Notifications API and integration contract

## Current scope

Notifications are persisted in PostgreSQL and owned by the recipient in
`notifications.user_id`. Every API route requires the existing JWT in
`Authorization: Bearer <token>`; the recipient ID always comes from the
verified token, never from request data.

The currently implemented event is a successful application submission:

- The applicant receives an `application_submitted` confirmation.
- The job's recruiter receives a `new_application` alert only when
  `jobs.recruiter_id` contains an actual user ID.
- A posting with no recruiter creates no recruiter alert.
- The application insert and notification inserts use the same PostgreSQL
  transaction. Failed, closed-job, duplicate, or notification-write failures
  do not leave a partial application or notification.

`application_status`, `interview_invitation`, and `deadline_reminder` are
reserved notification types only. Their triggers are not implemented. In
particular, `PATCH /api/applications/:id/status` remains applicant-owned and is
not a recruiter event source.

## REST endpoints

All responses are JSON. IDs and notification state are scoped to the current
authenticated user.

### `GET /api/notifications`

Returns non-dismissed notifications newest first. Optional query parameters:

- `limit`: positive integer from 1 to 50; defaults to 20.
- `beforeId`: positive notification ID returned by a previous page.

Response:

```json
{
  "notifications": [
    {
      "id": 17,
      "userId": 4,
      "type": "application_submitted",
      "title": "Application submitted",
      "message": "Your application for Backend Developer at CareerConnect Labs was submitted.",
      "link": "/frontend/job.html?id=12",
      "applicationId": 31,
      "jobId": 12,
      "actorUserId": null,
      "dedupeKey": "application:31:submitted:4",
      "createdAt": "2026-11-12T19:00:00.000Z",
      "readAt": null,
      "dismissedAt": null
    }
  ],
  "nextBeforeId": null
}
```

Invalid pagination input returns 400.

### `GET /api/notifications/unread-count`

Returns `{ "count": 2 }`. Dismissed notifications are not counted as unread.

### `PATCH /api/notifications/:id/read`

Marks one notification read and returns `{ "notification": ... }`. Repeating
the request is safe. Invalid IDs return 400; nonexistent or another user's
notification returns 404.

### `PATCH /api/notifications/read-all`

Marks the current user's unread notifications read and returns
`{ "message": "...", "updatedCount": 2 }`.

### `PATCH /api/notifications/:id/dismiss`

Dismisses one notification and returns `{ "notification": ... }`. A dismissed
notification is omitted from the default list and unread count. Invalid IDs
return 400; nonexistent or another user's notification returns 404.

All endpoints return 401 for missing or invalid authentication and use the
existing application error handler for unexpected database errors.

## Teammate integration

Use the reusable functions from `services/notifications.js`:

- `createNotification(transactionClient, notification)` inserts one validated
  notification and returns the inserted row, or `null` when the recipient and
  `dedupeKey` already exist.
- `createApplicationSubmissionNotifications(transactionClient, application,
  recruiterId)` creates the applicant confirmation and, when `recruiterId` is
  non-null, the recruiter alert.

Call these with the same checked-out PostgreSQL client as the source action.
The caller owns `BEGIN`, `COMMIT`, and `ROLLBACK`. Do not send an event before
the source action succeeds. Use a stable, event-specific `dedupeKey` so retries
and concurrent processing cannot create duplicate alerts.

The recruiter alert uses only `jobs.recruiter_id`; do not infer recruiter
identity from company text, seeded job data, request payloads, or candidate
accounts. Recruiter-driven status notifications must be integrated only with a
recruiter-authorized route that verifies ownership of the job. The existing
applicant-owned status PATCH route must not be used as that authorization
boundary.

Interview notifications require a persisted, real invitation and schedule.
Deadline reminders require an agreed persisted deadline and recipient rule.
Neither feature is triggered by this phase; no interview or deadline is
invented.

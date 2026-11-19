# Notifications API and integration contract

## Current scope

Notifications are persisted in PostgreSQL and owned by the recipient in
`notifications.user_id`. Every API route requires the existing JWT in
`Authorization: Bearer <token>`; the recipient ID always comes from the
verified token, never from request data.

The implemented events are successful application submissions, recruiter
status changes, and real interview invitations:

- The applicant receives an `application_submitted` confirmation.
- The job's recruiter receives a `new_application` alert only when
  `jobs.recruiter_id` contains an actual user ID.
- A posting with no recruiter creates no recruiter alert.
- The application insert and notification inserts use the same PostgreSQL
  transaction. Failed, closed-job, duplicate, or notification-write failures
  do not leave a partial application or notification.

Recruiter-driven changes through `PATCH /api/recruiter/applications/:id/status`
create an `application_status` notification for the application owner in the
same transaction as the update. Unchanged statuses do not notify; changing
away from and later back to a status creates a new event. The applicant-owned
`PATCH /api/applications/:id/status` route is not a recruiter event source.

Recruiters can send a real invitation from the application card in the
recruiter dashboard. The invitation requires a future `scheduledAt` timestamp
with a timezone. The dashboard collects the date and time in the recruiter's
local timezone and submits an ISO timestamp. Optional `location`, HTTPS
`meetingLink`, and `message` details are saved with the invitation. Creating
the invitation and its `interview_invitation` notification for the applicant
share one PostgreSQL transaction; a failed write leaves neither persisted.
The applicant can review their own invitations on the Profile page and follow
the notification link to that section.

An application status of `Interview` is separate from an interview
invitation. Changing the status creates only an `application_status`
notification; it does not invent a time, location, or meeting link.
`deadline_reminder` remains a reserved notification type; deadline reminders
are not implemented.

## Interview invitations

The `interview_invitations` table, added by
`db/migrations/007_interview_invitations.sql`, stores the application and
recruiter IDs, scheduled timestamp, optional location, meeting link, message,
and creation timestamp. Deleting an application deletes its invitations.
The unique `(application_id, scheduled_at)` constraint prevents a duplicate
for the same application and time while allowing a separately scheduled
invitation.

`POST /api/recruiter/applications/:id/interviews` requires a valid JWT and
recruiter role. The endpoint verifies that the application belongs to a job
owned by that recruiter. Invalid or past timestamps and invalid optional
details return 400; an application not owned by the recruiter returns 404; an
invitation already scheduled for that application and time returns 409.

Request:

```json
{
  "scheduledAt": "2027-01-15T10:00:00-05:00",
  "location": "Montreal office",
  "meetingLink": "https://meet.example/interview",
  "message": "Please bring a portfolio."
}
```

`scheduledAt` is required and must be an ISO timestamp with an explicit
timezone and a time in the future. `location` is optional (up to 250
characters), `meetingLink` is optional (up to 500 characters, HTTPS only),
and `message` is optional (up to 700 characters).

Success returns 201 with the persisted invitation:

```json
{
  "invitation": {
    "id": 8,
    "applicationId": 31,
    "scheduledAt": "2027-01-15T15:00:00.000Z",
    "location": "Montreal office",
    "meetingLink": "https://meet.example/interview",
    "message": "Please bring a portfolio.",
    "createdAt": "2026-11-19T20:00:00.000Z"
  }
}
```

`GET /api/applications/me/interviews` requires a valid JWT and returns only
invitations belonging to applications owned by the authenticated user:

```json
{
  "invitations": [
    {
      "id": 8,
      "applicationId": 31,
      "jobId": 12,
      "jobTitle": "Backend Developer",
      "company": "CareerConnect Labs",
      "scheduledAt": "2027-01-15T15:00:00.000Z",
      "location": "Montreal office",
      "meetingLink": "https://meet.example/interview",
      "message": "Please bring a portfolio.",
      "createdAt": "2026-11-19T20:00:00.000Z"
    }
  ]
}
```

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
- `createInterviewInvitationNotification(transactionClient, invitation)`
  creates the candidate's `interview_invitation` notification with a link to
  `/frontend/profile.html#interviews`.

Call these with the same checked-out PostgreSQL client as the source action.
The caller owns `BEGIN`, `COMMIT`, and `ROLLBACK`. Do not send an event before
the source action succeeds. Use a unique key for each legitimate event
occurrence. For state transitions, lock the source row and only emit when the
old and new states differ; a retry then sees no transition, while a later
legitimate transition can produce a new notification.

The recruiter alert uses only `jobs.recruiter_id`; do not infer recruiter
identity from company text, seeded job data, request payloads, or candidate
accounts. Recruiter-driven status notifications and interview invitations
must use recruiter-authorized routes that verify ownership of the job. The
existing applicant-owned status PATCH route must not be used as that
authorization boundary.

Deadline reminders still require an agreed persisted deadline and recipient
rule. No interview or deadline details are inferred or invented.

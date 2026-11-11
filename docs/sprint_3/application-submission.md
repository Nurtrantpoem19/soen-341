# Validated application submission

Backend follow-up to application tracking (#16/#17) and analytics/history (#96).
No database migration or frontend change is included.

## API contract

`POST /api/applications`

Send the existing login JWT in `Authorization: Bearer <token>` and JSON:

```json
{ "jobId": 1, "coverLetter": "I am interested in this role." }
```

Use an actual open job ID returned by `GET /api/jobs`. `jobId` accepts a positive
integer or a digits-only string, within PostgreSQL's integer range. `coverLetter`
is optional, defaults to an empty string, and must be text of at most 2000
characters before trimming.

The backend takes the applicant ID from the verified JWT and the title/company
from the saved open posting. Legacy clients may still send `jobTitle` and
`company`; these are ignored, along with client-supplied `userId` or `status`.
The application's initial status remains `Applied`.

Responses:

- 201: saved application, existing `{ message, application }` response shape.
- 400: invalid job ID, request body, or cover letter.
- 401: missing or invalid authentication, through the existing middleware.
- 404: posting does not exist or is closed; no application is saved.
- 409: this user already applied to the open posting.
- 500: unexpected server/database failure, through the existing error handler.

The insertion selects the open job and its details in one SQL statement, using
parameters. Duplicate handling uses the existing `(user_id, job_id)` uniqueness
constraint. Job title/company are stored as a submission snapshot. The route
does not implement Quick Apply profile/resume bundling, recruiter status updates,
notifications, or the frontend Apply button.

## Acceptance demonstration

1. Log in and obtain the JWT. Pick an open job from `GET /api/jobs`.
2. Submit only its ID and an optional cover letter: expect 201 / `Applied`.
3. Try forged title/company/user/status fields: the response still uses the
   posting's saved details, the logged-in user, and `Applied`.
4. Submit the same job again: expect 409 and no additional application.
5. Submit a nonexistent or closed job: expect 404 and no saved application.
6. Check `GET /api/applications/me` and `GET /api/applications/me/analytics`:
   the successful submission appears in history and contributes to the totals.

## Validation

`npm test` passed all 13 reported tests, including nested submission cases, on
2026-11-11 with pg-mem. Coverage includes authentication, malformed input,
closed/missing jobs, trusted posting details, user isolation, simultaneous
duplicates, cover-letter limits, and persistence after server restart.

The existing application integration test now creates a real posting instead
of using a hard-coded nonexistent job ID. Existing CI runs the same tests with
PostgreSQL through `TEST_DATABASE_URL`; real PostgreSQL validation has not been
performed locally for this change.

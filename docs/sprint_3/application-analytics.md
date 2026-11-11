# Application analytics API - issue #96

Backend slice of https://github.com/Nurtrantpoem19/soen-341/issues/96.
The dashboard UI and full story remain open.

`GET /api/applications/me/analytics?bucket=month`

Send `Authorization: Bearer <token>` using the existing login API. No new
environment variables or migrations are required. `bucket` defaults to `month`;
`week` is also supported. Invalid, empty, or repeated bucket values return 400.
Missing/invalid authentication returns 401. Database failures return a safe 500.

Example response:

```json
{
  "analytics": {
    "total": 3,
    "byStatus": { "Applied": 2, "Under Review": 0, "Interview": 1, "Offered": 0, "Rejected": 0 },
    "bucket": "month",
    "overTime": [{ "period": "2026-11-01", "count": 3 }]
  }
}
```

Counts include all applications belonging to the authenticated user. Status
counts describe each application's current status, not historical transitions.
Time series count submission dates in UTC, with weeks starting Monday. Empty
periods are omitted; users without applications receive zero counts and an empty
series. Client-supplied user IDs do not select another user's data.

The existing `GET /api/applications/me` provides the application history for the
same dashboard. This change adds summary metrics only. It uses a single scoped
query and summarizes status/date fields in memory, suitable for the course app's
current size. For large histories, move aggregation to PostgreSQL and add date
range controls in a separate change. PR #103 proposes database analytics helpers;
coordinate that integration after the database work is reviewed.

## Validation and lab demonstration

Run `npm ci`, configure a local `.env` using the existing setup instructions,
set `JWT_SECRET` to a local development secret, run migrations, and start the API.
Log in through `POST /api/auth/login` and use the returned token in an API client.

1. Request analytics with an account with no applications: total 0.
2. Submit applications using `POST /api/applications` with different job IDs.
3. Change one status with `PATCH /api/applications/:id/status`.
4. Request analytics again: total and status counts reflect the saved records.
5. Request `?bucket=week` to see weekly submissions.
6. Log in as a second account: its totals exclude the first account's data.

Automated acceptance coverage follows the same ownership and persistence flow
over HTTP. Unit coverage checks UTC boundaries and Monday/year rollover.
`npm test` passed all five tests locally on 2026-11-11 using pg-mem. Real
PostgreSQL was not tested locally because Docker was stopped. Existing CI runs
the suite against PostgreSQL via `TEST_DATABASE_URL`.

Implementation is ready for user/team review; this does not close the entire
user story or claim the frontend dashboard is complete.

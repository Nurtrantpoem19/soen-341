# Recruiter dashboard and posting management

Sprint 3 feature 1: recruiters create, edit, archive and manage their job
postings from one page, see the applications each posting received, filter them
by status or date, and update each candidate's status.

## What changed

- `db/migrations/004_recruiter.sql`: adds `users.role` (`job_seeker` by default,
  or `recruiter`) and indexes on `jobs.recruiter_id` and `applications.job_id`.
- `routes/recruiter.js`: recruiter-only API (below) and `GET /api/auth/me`.
- `server.js`: registration accepts an optional `role`; registration and login
  return the user's `role`.
- `frontend/recruiter.html`, `js/recruiter.js`, `css/recruiter.css`: the dashboard.
- Registration has an "Account Type" field, login sends recruiters to the
  dashboard, and the home sidebar shows a "Recruiter Dashboard" link to recruiters.
- `test/recruiter.test.js`: unit and acceptance tests.

Run `npm run db:migrate` once to apply the migration. Existing accounts stay job
seekers; register a new account with the Recruiter account type to use the page.

## Role-based access

Every `/api/recruiter/*` route needs the login JWT and the `recruiter` role. The
role is read from the database on each request, never from the request or the
token, so it cannot be forged. Each query is also scoped to `recruiter_id`, so a
recruiter can only see and change their own postings and those postings'
applications. The frontend hides recruiter links from other users, but that is
only for convenience: the backend is what enforces access.

## API

All routes return 401 without a valid token and 403 for non-recruiters.

| Route | Purpose |
| --- | --- |
| `GET /api/recruiter/jobs` | Own postings (active and archived) with `applicationCount` and `applicationsByStatus`. |
| `POST /api/recruiter/jobs` | Create a posting. 201, or 400 when invalid. |
| `PUT /api/recruiter/jobs/:id` | Edit a posting. 404 when it is not the recruiter's. |
| `PATCH /api/recruiter/jobs/:id/archive` | Body `{ "archived": true \| false }`. Archive or restore. |
| `GET /api/recruiter/jobs/:id/applications` | Applications received, newest first. Optional `status`, `from`, `to` (`YYYY-MM-DD`, inclusive, UTC). |
| `PATCH /api/recruiter/applications/:id/status` | Body `{ "status": "Interview" }`. One of Applied, Under Review, Interview, Offered, Rejected. |

Posting body: `title`, `company`, `location`, `category`, `description`
(required), `employmentType` (Full-time, Part-time, Internship, Contract), and
optional `salary` and `requirements` (one per line). Length limits match the
`jobs` table constraints.

Archiving sets `is_open = FALSE`: the posting leaves job search, stops accepting
applications, and keeps its existing applications. Restoring reverses it.

Each application includes the candidate's email, cover letter, and, when they
have a profile, their name, headline, location and phone.

## User stories and acceptance tests

Each story has an `acceptance:` test in `test/recruiter.test.js`.

1. As a recruiter, I can create a posting so job seekers can find it.
   Create a posting → it appears on my dashboard and in job search.
2. As a recruiter, I can edit my postings. Edit the title → job search shows
   the new title; another recruiter's posting cannot be edited (404).
3. As a recruiter, I can archive a posting. Archive → it leaves job search and
   refuses new applications, but its applications stay visible; restore reopens it.
4. As a recruiter, I can see and filter the applications for a posting.
   Filter by status and by date range → only matching applications are listed.
5. As a recruiter, I can update a candidate's status. Change it to Interview →
   the job seeker sees the new status in their application history.
6. As a job seeker, I cannot manage postings or candidates. Every recruiter
   route returns 403 for a job seeker and 401 without a token.

## Known limits

- `PATCH /api/applications/:id/status` (Sprint 2) still lets a job seeker change
  the status of their own application. It was left unchanged because existing
  tests rely on it; the team should decide whether to remove it.
- Recruiters cannot download a candidate's resume yet, because applications are
  not linked to a resume.
- Status changes do not send notifications; that belongs to the Sprint 3
  notifications feature.

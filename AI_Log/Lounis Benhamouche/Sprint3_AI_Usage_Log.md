# Sprint 3 AI usage log

Tool: Claude Code, used as the coding assistant. Two features were built with it
this sprint:

1. Recruiter dashboard and posting management (2026-11-12)
2. AI-Powered Resume Feedback (2026-11-17)

> Draft written by the AI assistant from the session record. Review it, add your
> own reflection, and export it into your Sprint 3 PDF report.

---

## 1. Recruiter dashboard and posting management

Date: 2026-11-12. Model: Claude Fable 5.2. Feature doc:
`docs/sprint_3/recruiter-dashboard.md`. Committed in `9da614e`.

### Prompt

"Do the recruiter dashboard and posting management", with the Sprint 3
guidelines PDF attached.

### What the AI did first

It read the guidelines PDF, the team's `docs/sprint_3/sprint_3plan.md`, and the
existing backend, migrations, frontend and tests, and ran the test suite to get
a baseline (14/14 passing) before changing anything.

### Decisions the AI made, and why

- **Roles:** the database had no way to tell recruiters from job seekers, so it
  added a `role` column to `users` (`job_seeker` by default, or `recruiter`) in
  migration `004_recruiter.sql`. Existing accounts stay job seekers.
- **Access control:** every `/api/recruiter/*` route reads the role from the
  database on each request instead of trusting the login token or the request,
  so it cannot be forged. Every query is also limited to the recruiter's own
  postings, so one recruiter cannot see or change another's postings or applicants.
- **Archiving:** archiving closes a posting (`is_open = false`): it disappears
  from job search and stops accepting applications, but its applications are kept.
  Restoring reopens it.
- **Filters:** applications can be filtered by status and by a date range
  (whole days, inclusive).
- **Frontend:** a new `recruiter.html` page in the existing style, an
  "Account Type" choice on the register page, recruiters sent to the dashboard
  after login, and a sidebar link shown only to recruiters.

### Generated output

Migration `004_recruiter.sql`, `routes/recruiter.js`, role support in
registration and login (`server.js`), the dashboard page
(`frontend/recruiter.html`, `frontend/js/recruiter.js`,
`frontend/css/recruiter.css`), small changes to the register, login and home
pages, tests (`test/recruiter.test.js`), and the feature documentation with six
user stories.

### Validation

- 11 new tests: 3 unit tests and an API test with 7 acceptance cases, one per
  user story plus a registration check. Full suite: 25/25 passing.
- Browser check on a local preview: registered a recruiter, created a posting
  (and saw the empty-field error), had two test job seekers apply, moved a
  candidate to Interview, used the status and date filters, edited, archived
  (the posting returned 404 to the public) and restored a posting. A job seeker
  opening the page got the "recruiters only" message, and the mobile layout had
  no horizontal scroll.
- Problems when I ran it on my own setup, and how they were fixed:
  - `ECONNREFUSED` on port 5432: the database was not running because Docker was
    stopped. The AI started Docker Desktop. I stopped it before it started the
    database itself, and I started the database myself.
  - `column "role" of relation "users" does not exist`: the new migration had
    not been applied. Fixed with `npm run db:migrate`.

### Limits the AI pointed out

- The Sprint 2 route `PATCH /api/applications/:id/status` still lets a job
  seeker change the status of their own application. It was left unchanged
  because existing tests rely on it; the team needs to decide.
- Recruiters cannot download a candidate's resume yet, because applications are
  not linked to a resume.
- Status changes do not trigger notifications (part of the notifications feature).

### Later note

A teammate's commit (`8a0611c`) added `routes/recruiters.js`, a copy of
`routes/recruiter.js`, and `server.js` now uses the copy. The original file is
unused and should be deleted by whoever owns that change.

---

## 2. AI-Powered Resume Feedback

Date: 2026-11-17. Model: Claude Opus 5.5. The feature itself runs on Google
Gemini's free tier. Feature doc: `docs/sprint_3/ai-resume-feedback.md`.

### Prompt

"Add the AI feature of your choice. While adding the feature follow a test
driven development approach. Implement the feature and test it and document it
to follow the guidelines." The Sprint 3 guidelines PDF was attached.

### Decisions the AI made, and why

- **Feature:** AI-Powered Resume Feedback, because the team's Sprint 3 plan
  (`docs/sprint_3/sprint_3plan.md`) already chose it and the resume upload
  feature exists.
- **Provider:** first built on Claude's API. After learning each review would
  cost a few cents, I asked for a free option. The AI offered a local model
  (Ollama: free and private but slow on my 8 GB Intel Mac) or the Gemini free
  tier (fast, but Google may use submitted content). I chose Gemini, which also
  matches the team plan's "OpenAI/Gemini wrapper". Because the provider was
  isolated in `services/resume-feedback.js`, only that file and its unit tests
  changed.
- **Model:** the AI checked Google's current docs instead of relying on memory,
  because model names had changed since its training; it chose
  `gemini-3.8-flash` (stable, free tier, used in the SDK's own example).
- **Real test changed the model:** with my key, `gemini-3.8-flash` was
  overloaded (503) every time, while `gemini-3.5-flash-lite` answered in 5 to 19
  seconds. The AI made flash-lite the default and added, test-first, a one-time
  retry on a backup model when the main one is overloaded or out of quota.
- **PDF handling:** PDFs are sent to Gemini inline instead of adding a
  PDF-parsing library; DOCX text is extracted with the existing `jszip`.
- **Structured output:** a JSON schema forces the response shape, and the
  backend validates it again rather than trusting the model.
- **Testing:** a fake AI service is injected, so tests never call the real API.

### Generated output

Tests (`test/resume-feedback.test.js`), service, routes, migration
`005_resume_feedback.sql`, the resume page panel (`frontend/js/resume-feedback.js`,
`frontend/css/resume-feedback.css`), and the feature documentation.

### Validation

- TDD: the tests were written first and seen failing because the service module
  did not exist; after implementation all 15 passed, then the full suite (48 tests).
- Provider switch, also test-first: the Gemini unit tests were rewritten and
  seen failing (5 of 15), then the service was changed until all 48 passed.
  The backup-model test was also written first and seen failing; the full
  suite is now 49/49.
- Browser check on a local preview with a fake AI service: general and
  job-targeted reviews render, the latest review reappears after reload, and
  the mobile layout has no horizontal scroll.
- Problem found and fixed: `npm install` rewrote `package-lock.json` with
  different line endings, producing a 3,500-line diff; it was converted back so
  only the lines for the new package change (385 lines for the Gemini SDK).
- Real reviews were run with a fictional sample resume, through the service and
  through the page (see the Real-world test section of the feature doc).
- Mistake caught: I first pasted the API key into `.env.example`, which is
  tracked by git. The AI noticed before any commit and moved it to `.env`,
  which git ignores.

### Not yet done

- Free-tier availability varies, so try a review again shortly before the demo.
- Team code review of the prompt and the generated code.
- Evaluation of feedback quality on several real resumes (planned for Sprint 4).

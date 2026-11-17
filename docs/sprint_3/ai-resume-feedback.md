# AI-Powered Resume Feedback (Phase 1)

Sprint 3 feature 4, the project's Generative AI requirement. A job seeker picks
one of their uploaded resumes and, optionally, an open job posting. Google
Gemini reviews the resume and returns a score, a summary, strengths, gaps, formatting
tips and, when a job is chosen, how well the resume matches it. The latest
review is saved and shown again the next time the resume page opens.

Sprint 3 delivers the backend integration, prompt, structured output and first
UI. Sprint 4 can refine the prompt against real resumes and add history,
comparisons or job-matching suggestions.

## How it works

```
resume.html ──POST /api/resumes/:id/feedback──▶ routes/resume-feedback.js
                                                  │ checks ownership, loads the open job
                                                  ▼
                                    services/resume-feedback.js
                                      PDF  → sent inline (Gemini reads it directly)
                                      DOCX → text extracted with jszip
                                      → Gemini API, free tier (structured JSON output)
                                      → validated by parseFeedback
                                                  │
                         saved in resume_feedback ◀┘ and returned to the page
```

- **Provider and cost:** Google Gemini through the official `@google/genai`
  SDK, on the **free tier**: no billing account, so it costs nothing. The free
  tier has per-minute and per-day request limits (see your limits in Google AI
  Studio); when they are used up the page says the reviewer is busy.
- **Models:** `gemini-3.5-flash-lite` by default, with `gemini-3.8-flash` as a
  backup. Both are stable and free on the free tier (checked 2026-11-17). If
  the main model is overloaded (5xx) or out of free quota (429), the service
  retries once on the backup. Override with `GEMINI_MODEL` and
  `GEMINI_FALLBACK_MODEL` (set it empty to turn the backup off). Google retires
  models regularly, so check the pricing page if requests start failing.
- **Structured output:** the request sets `responseMimeType: application/json`
  and `responseJsonSchema` (`FEEDBACK_SCHEMA`), so Gemini must return exactly
  the fields the page needs. `parseFeedback` still checks score ranges and types, caps lists at 8
  items of 500 characters, and rejects anything else.
- **Blocked answers:** if Gemini's safety filters block the prompt or the
  answer, the page shows a clear message and nothing is saved.
- **Prompt injection:** the system prompt tells the model that the resume and job
  posting are data, not instructions, and to ignore text that tries to change
  its score.
- **No API key, no crash:** the server starts without credentials. Requests
  then return 503 "AI resume feedback is not configured on this server."

## Setup

1. Sign in at https://aistudio.google.com/apikey with a Google account and
   create a free API key. Do not add a billing account, so you can never be
   charged. Add the key to `.env` (never commit it):

   ```
   GEMINI_API_KEY=...
   ```

2. Apply the new migration (`005_resume_feedback.sql`): `npm run db:migrate`.
3. Restart the backend, log in, upload a resume on **My Resume**, and use the
   **AI resume feedback** section.

Reviews are free. The automated tests never call the API, so CI needs no key.

## API

Both routes need the login JWT, and only work on the logged-in user's own resumes.

| Route | Result |
| --- | --- |
| `POST /api/resumes/:id/feedback` | Body `{}` for a general review, or `{ "jobId": 3 }` to review against an open posting. 201 with the saved review. |
| `GET /api/resumes/:id/feedback` | 200 with the latest saved review, or 404 when there is none. |

Response:

```json
{
  "id": 7, "resumeId": 2, "jobId": 3, "jobTitle": "Junior Backend Developer",
  "model": "gemini-3.5-flash-lite", "createdAt": "2026-11-17T18:33:00.000Z",
  "feedback": {
    "overallScore": 74, "summary": "…",
    "strengths": ["…"], "gaps": ["…"], "formatting": ["…"],
    "jobMatch": { "score": 61, "matchedSkills": ["…"], "missingSkills": ["…"] }
  }
}
```

`jobMatch` is `null` for a general review.

| Status | When |
| --- | --- |
| 400 | Invalid resume ID or `jobId`. |
| 401 | Missing or invalid login. |
| 404 | Resume is not yours or does not exist; job is closed or missing; no saved review (GET). |
| 422 | Gemini blocked the request, or the file could not be read (e.g. an empty DOCX). |
| 502 | The AI response was cut off or did not match the schema. |
| 503 | API key missing or invalid, free-tier limit reached, or the API is unavailable. |

Nothing is saved when the AI call fails. Internal error details are logged on
the server, never sent to the browser.

## Test-driven development

The tests in `test/resume-feedback.test.js` were written first, then run and
seen failing (`Cannot find module '../services/resume-feedback'`), and only
then was the code written until they passed. A fake AI client and a fake
service are injected, so the suite is free, offline and deterministic, and runs
in CI like every other test.

1. **Red:** wrote 7 unit tests and 7 API tests from the user stories below.
   Result: the file failed to load.
2. **Green:** wrote `services/resume-feedback.js`, `routes/resume-feedback.js`
   and the migration. Result: 15/15 passing on the first full run.
3. **Refactor / integrate:** wired the routes into `server.js` with the service
   injectable through `createApp(pool, { resumeFeedback })`, then ran the whole
   suite: 48/48 passing.
4. **Provider switch:** see Provider history below; the same red/green cycle
   was repeated for Gemini.

Unit tests cover the request builder (PDF document block, DOCX text, job
details, schema choice, no sampling parameters), the schema, DOCX text
extraction, output validation (refusal, truncation, bad JSON, out-of-range
scores, wrong types, list capping), and mapping of API errors.

## User stories and acceptance tests

Each story has an `acceptance:` test in `test/resume-feedback.test.js`.

1. As a job seeker, I want AI feedback on my uploaded resume so I know what to
   improve. Request a general review of a PDF → 201 with a score, strengths,
   gaps and formatting tips, and the review is saved.
2. As a job seeker, I want feedback for a specific job so I can tailor my
   resume. Request a review of a DOCX against an open posting → the posting's
   details are sent and the response includes a job match score and missing skills.
3. As a job seeker, I want to see my last review again without paying for a new
   one. Reload → `GET` returns the latest saved review for that resume.
4. As a job seeker, I want my resume to stay private. Another user cannot
   request or read feedback on it (404), and the AI is never called for them.

## Real-world test (2026-11-17)

A fictional sample resume (one-page PDF) was reviewed against the "Junior
Backend Developer" sample posting, through the service and through the page.

- `gemini-3.5-flash-lite` answered in 5 to 19 seconds and succeeded 5 times
  out of 6. The output matched the schema and was specific: it flagged vague
  bullets ("worked on", "helped students"), the "a bit of SQL" wording, and the
  posting's missing authentication and API security skills.
- `gemini-3.8-flash` (the first default) failed 2 out of 2 with 503 "high
  demand", once after about 100 seconds of SDK retries; `gemini-4-hydrogen`
  failed 2 out of 2 (503, then 504 timeout).
- Result: the lighter model became the default, a one-time backup model was
  added (test-first), and SDK retries were cut to 2 attempts with at most a
  4-second wait, so a busy model fails over quickly.

Free-tier availability changes from day to day, so try a review shortly before
the demo, and keep a screenshot of a successful review as a backup.

## Provider history

The first version (2026-11-17) used Anthropic's Claude API. It was switched to
the Gemini free tier the same day so the feature costs nothing to run. The
switch was done test-first again: the provider-specific unit tests were
rewritten for Gemini's request and response format and seen failing (5 of 15),
then the service was changed until all passed. The API, database and page did
not change, because the provider is isolated in `services/resume-feedback.js`.

## Privacy and limits

- The resume and job posting are sent to Google. **On the free tier Google uses
  submitted content to improve its products**, so the page tells users this
  next to the button and suggests removing details such as phone number and
  address. Use test resumes for the demo, not real ones. Saved reviews are
  deleted with the user's account or resume.
- Gemini reads PDFs directly; old `.doc` files are not supported (upload
  already only accepts PDF and DOCX).
- There is no per-user rate limit yet, so one account could use up the shared
  free-tier quota. Add one before any public deployment.
- The prompt has not yet been evaluated on a set of real resumes; that is the
  first Sprint 4 task for this feature.

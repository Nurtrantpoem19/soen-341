# My Sprint 3 AI-assisted work

Tool: OpenAI Codex.

## How I used AI

I used OpenAI Codex to help with implementation, debugging, testing and documentation for Sprint 3. This report summarizes my detailed logs in this folder. The generated code still needs my review and my teammates' review before we merge it.

## What I asked for

I asked Codex to go through the Sprint 3 guidelines and our GitHub backend issues, work on one feature at a time, and test each change before uploading it. I also asked to be notified before GitHub changes. Later, I asked for help finishing the missing frontend and fixing the remaining integration issues so the project would be ready for our lab.

## What AI helped me build

I used Codex to generate the authenticated analytics endpoint for issue #96, application submission checks, the candidate history and analytics page, and recruiter status notifications. I then asked it to integrate this work with the updated main branch. This included removing duplicate JavaScript and form controls, blocking candidates from changing their own hiring status, and adding interview scheduling, interview details on the candidate dashboard, and opt-in deadline reminders. I also used it to add the scheduling migration, regression tests and a simpler startup through one Express server.

## Changes and technical decisions

With Codex's help, I kept access tied to the logged-in user through JWT checks instead of trusting user IDs sent by the browser. Interview schedules and their notifications are saved together, and repeated requests do not create duplicate alerts. Deadline reminders appear when users check notifications within 24 hours of a deadline and are skipped if they already applied. During testing, Codex found and corrected a timestamp comparison issue, duplicate profile controls and an outdated test that allowed candidates to change their own status. I also used it to limit public file access to the frontend and home page.

## How I checked the work

I used Codex to run the automated tests and check the app in the browser. All 64 tests passed with pg-mem, and the same 64 passed against a separate PostgreSQL 17 database. These checks cover ownership, persistence, duplicates, date validation, rollback, notifications, browser scripts and HTML IDs. AI success and failure cases were tested with a fake provider. The browser walkthrough used synthetic accounts to apply, view history and analytics, save a deadline, schedule an interview, and check the candidate dashboard and notification bell.

## What I still need to review

I have kept the changes on fix/sprint3-readiness for review with my teammates. I still need our database teammates to review migration 007 and the final PR to pass CI before merging. I do not have a Gemini key configured locally, so a live AI response has not been verified on my computer. I also need to make sure I understand and can explain the generated code. This log only covers my AI-assisted work; my teammates will provide their own logs.

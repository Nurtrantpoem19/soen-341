# Sprint 3 AI-assisted work: validated application submission

Date: 2026-11-11. Related stories: #16, #17, #96.

Michael authorized backend-only work on the next application tracking task and
asked to be notified before any GitHub upload. Teammates own database changes.

Codex generated changes to validate job IDs and cover letters, insert applications
only for existing open jobs, copy title/company from the posting, and preserve
authenticated ownership and the initial Applied status. No database schema or
frontend files were changed.

Added HTTP acceptance/integration coverage for rejected inputs, missing/closed
jobs, forged metadata/ownership/status, independent applicants, simultaneous
duplicate requests, and persistence through history and analytics after restart.
Updated the existing application test to create a real posting fixture.

During validation, pg-mem rejected an untyped SELECT parameter as text for an
integer column. Explicit SQL parameter casts resolved the issue. The final full
suite passed all 13 reported tests locally using pg-mem. Real PostgreSQL testing
remains for CI or a dedicated local test database.

User/team review and GitHub upload are pending. This log records AI-generated
work and validation, not completed human review or approval.

# Application status integration and lab readiness

## Ready for review
Recruiter status changes now create an application_status notification for the
candidate in the same transaction. Unchanged status requests do not create an
alert or change the update timestamp. Recruiter role and posting ownership checks
remain in place. No database migration or frontend change is included.

The acceptance test covers recruiter status updates, candidate notification
ownership, application history, analytics, and repeat-request deduplication.
A failure-path test verifies rollback and connection release if notification
creation fails. Pure recruiter helper tests now import the active recruiters.js
module rather than the unused recruiter.js module.

## Lab demonstration
1. Log in as a candidate and submit an application to an existing open job.
2. Log in as its recruiter and PATCH /api/recruiter/applications/:id/status
   with {"status":"Interview"} and the recruiter Bearer token.
3. With the candidate token, GET /api/applications/me and
   GET /api/applications/me/analytics: both reflect Interview.
4. GET /api/notifications: the status-change alert belongs to the candidate.
5. Repeat the same PATCH: no additional status-change alert is created.
6. Run npm test to demonstrate automated validation.

## Remaining work for the assigned feature
- Frontend owner: connect the Apply button; it still throws a placeholder error.
- Frontend owner: build/connect the candidate history and analytics dashboard.
- Team decision: the legacy candidate PATCH /api/applications/:id/status still
  allows a candidate to change their own status. Agree whether this is a manual
  tracker or recruiter-controlled hiring state before changing its contract.
- Verify on real PostgreSQL/CI and with a running integrated application.
- Review and upload this branch, update relevant issue progress and AI logs.

Prioritize a working application flow and demo over closing entire stories.
Do not mark the full dashboard story complete until frontend integration works.

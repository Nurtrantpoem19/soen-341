-- is_open remains compatible with Sprint 2's public job-search queries.
-- Draft: is_draft=true; active: is_open=true; archived: both false.
ALTER TABLE jobs ADD COLUMN is_draft BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN deadline_at TIMESTAMPTZ;
ALTER TABLE jobs ADD CONSTRAINT jobs_lifecycle_check
    CHECK (NOT (is_open AND is_draft));
ALTER TABLE jobs ADD CONSTRAINT jobs_archive_time_check
    CHECK (archived_at IS NULL OR (NOT is_open AND NOT is_draft));
CREATE INDEX jobs_recruiter_lifecycle_idx ON jobs(recruiter_id, is_open, is_draft);
CREATE INDEX applications_job_status_date_idx ON applications(job_id, status, applied_at);
CREATE INDEX applications_user_status_idx ON applications(user_id, status);
CREATE INDEX applications_user_date_idx ON applications(user_id, applied_at);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN
        ('application_update', 'interview_invitation', 'deadline_reminder', 'new_application')),
    message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 1000),
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    deduplication_key TEXT CHECK (length(deduplication_key) BETWEEN 1 AND 200),
    UNIQUE (user_id, deduplication_key)
);
CREATE INDEX notifications_user_due_idx ON notifications(user_id, scheduled_for, id);
CREATE INDEX notifications_user_read_idx ON notifications(user_id, read_at);

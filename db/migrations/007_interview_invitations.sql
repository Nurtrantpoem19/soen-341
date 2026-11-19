CREATE TABLE IF NOT EXISTS interview_invitations (
    id SERIAL PRIMARY KEY,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    recruiter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    location TEXT CHECK (location IS NULL OR length(trim(location)) BETWEEN 1 AND 250),
    meeting_link TEXT CHECK (
        meeting_link IS NULL OR
        (length(meeting_link) <= 500 AND meeting_link LIKE 'https://%')
    ),
    message TEXT CHECK (message IS NULL OR length(message) <= 700),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (application_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS interview_invitations_application_scheduled_idx
    ON interview_invitations(application_id, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN (
        'application_submitted',
        'new_application',
        'application_status',
        'interview_invitation',
        'deadline_reminder'
    )),
    title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
    message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 2000),
    link TEXT CHECK (link IS NULL OR (link LIKE '/%' AND link NOT LIKE '//%')),
    application_id INTEGER REFERENCES applications(id) ON DELETE SET NULL,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    dedupe_key TEXT NOT NULL CHECK (length(trim(dedupe_key)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    UNIQUE (user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
    ON notifications(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
    ON notifications(user_id, id DESC)
    WHERE read_at IS NULL AND dismissed_at IS NULL;

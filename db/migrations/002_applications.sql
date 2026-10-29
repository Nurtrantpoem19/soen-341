CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL CHECK (job_id > 0),
    job_title TEXT NOT NULL CHECK (length(trim(job_title)) BETWEEN 1 AND 200),
    company TEXT NOT NULL CHECK (length(trim(company)) BETWEEN 1 AND 200),
    cover_letter TEXT NOT NULL DEFAULT '' CHECK (length(cover_letter) <= 2000),
    status TEXT NOT NULL DEFAULT 'Applied' CHECK (status IN ('Applied', 'Under Review', 'Interview', 'Offered', 'Rejected')),
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, job_id)
);

CREATE INDEX IF NOT EXISTS applications_user_id_idx ON applications(user_id);
-- Sprint 3: AI-powered resume feedback. Each row is one review of one resume, optionally against a job posting.
CREATE TABLE IF NOT EXISTS resume_feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resume_id INTEGER NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
    job_title TEXT,
    model TEXT NOT NULL,
    feedback JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resume_feedback_resume_id_idx ON resume_feedback(resume_id, created_at);

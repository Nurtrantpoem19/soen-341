-- Supplement the existing Sprint 3 feature migrations without recreating tables.
CREATE INDEX IF NOT EXISTS applications_job_status_date_idx ON applications(job_id, status, applied_at);
CREATE INDEX IF NOT EXISTS applications_user_status_idx ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS applications_user_date_idx ON applications(user_id, applied_at);

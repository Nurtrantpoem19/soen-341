-- Sprint 3: recruiter dashboard and posting management.
-- Every existing account stays a job seeker; recruiters are created through registration.
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'job_seeker' CHECK (role IN ('job_seeker', 'recruiter'));
CREATE INDEX IF NOT EXISTS jobs_recruiter_id_idx ON jobs(recruiter_id);
CREATE INDEX IF NOT EXISTS applications_job_id_idx ON applications(job_id);

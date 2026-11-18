const { FeedbackError } = require('../services/resume-feedback');

const matchColumns = 'id, resume_id AS "resumeId", job_id AS "jobId", job_title AS "jobTitle", model, feedback, created_at AS "createdAt"';
const ERRORS = {
  refused: [422, 'The AI matcher could not analyze this resume. Try a different file.'],
  unreadable: [422, 'The AI matcher could not read this resume. Upload a text-based PDF or DOCX and try again.'],
  incomplete: [502, 'The AI match was cut short. Please try again.'],
  invalid_output: [502, 'The AI match came back in an unexpected format. Please try again.'],
  busy: [503, 'The AI matcher is busy right now. Please try again in a minute.'],
  unavailable: [503, 'The AI matcher is unavailable right now. Please try again later.'],
  not_configured: [503, 'AI job matching is not configured on this server.']
};

const readId = value => {
  const id = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
};

function registerJobMatchRoutes(app, pool, authenticateUser, resumeFeedback) {
  app.post('/api/jobs/:id/match', authenticateUser, async (req, res, next) => {
    const jobId = readId(req.params.id);
    const resumeId = readId(req.body?.resumeId);
    if (!jobId) return res.status(400).json({ message: 'Invalid job ID.' });
    if (!resumeId) return res.status(400).json({ message: 'resumeId must be a positive integer.' });

    try {
      const [jobResult, resumeResult, profileResult] = await Promise.all([
        pool.query('SELECT title, company, description, requirements FROM jobs WHERE id=$1 AND is_open=TRUE', [jobId]),
        pool.query('SELECT id, storage_path, mime_type FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, req.user.id]),
        pool.query('SELECT headline, location, summary, skills FROM profiles WHERE user_id=$1', [req.user.id])
      ]);
      if (!jobResult.rowCount) return res.status(404).json({ message: 'Open job not found.' });
      if (!resumeResult.rowCount) return res.status(404).json({ message: 'Resume not found.' });
      if (!profileResult.rowCount) return res.status(400).json({ message: 'Complete your profile and add at least one skill before matching.' });

      const profile = profileResult.rows[0];
      let skills = profile.skills;
      if (typeof skills === 'string') {
        try { skills = JSON.parse(skills); } catch { skills = []; }
      }
      if (!Array.isArray(skills) || skills.length === 0) {
        return res.status(400).json({ message: 'Add at least one skill to your profile before matching.' });
      }
      profile.skills = skills;

      let analysis;
      try {
        analysis = await resumeFeedback.analyze({
          filePath: resumeResult.rows[0].storage_path,
          mimeType: resumeResult.rows[0].mime_type,
          job: jobResult.rows[0],
          profile
        });
      } catch (error) {
        if (!(error instanceof FeedbackError) || !ERRORS[error.code]) throw error;
        console.error(`Job match failed (${error.code}):`, error.message);
        const [status, message] = ERRORS[error.code];
        return res.status(status).json({ message });
      }

      const saved = await pool.query(
        `INSERT INTO job_matches (user_id, resume_id, job_id, job_title, model, feedback)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${matchColumns}`,
        [req.user.id, resumeId, jobId, jobResult.rows[0].title, analysis.model, JSON.stringify(analysis.feedback)]
      );
      res.status(201).json(saved.rows[0]);
    } catch (error) { next(error); }
  });

  app.get('/api/jobs/:id/match', authenticateUser, async (req, res, next) => {
    const jobId = readId(req.params.id);
    if (!jobId) return res.status(400).json({ message: 'Invalid job ID.' });
    try {
      const result = await pool.query(
        `SELECT ${matchColumns} FROM job_matches
         WHERE user_id=$1 AND job_id=$2
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [req.user.id, jobId]
      );
      if (!result.rowCount) return res.status(404).json({ message: 'No match yet for this job.' });
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
}

module.exports = { registerJobMatchRoutes };

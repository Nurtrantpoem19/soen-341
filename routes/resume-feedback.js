// AI-Powered Resume Feedback routes (Sprint 3). A job seeker can only analyze and read feedback for their own resumes.
const { FeedbackError } = require('../services/resume-feedback');

const feedbackColumns = 'id, resume_id AS "resumeId", job_id AS "jobId", job_title AS "jobTitle", model, feedback, created_at AS "createdAt"';
// FeedbackError code -> HTTP status and the message shown to the user.
const ERRORS = {
  refused: [422, 'The AI reviewer could not analyze this resume. Try a different file.'],
  unreadable: [422, 'The AI reviewer could not read this resume. Upload a text-based PDF or DOCX and try again.'],
  incomplete: [502, 'The AI review was cut short. Please try again.'],
  invalid_output: [502, 'The AI review came back in an unexpected format. Please try again.'],
  busy: [503, 'The AI reviewer is busy right now. Please try again in a minute.'],
  unavailable: [503, 'The AI reviewer is unavailable right now. Please try again later.'],
  not_configured: [503, 'AI resume feedback is not configured on this server.']
};

const readId = value => {
  const id = typeof value === 'number' ? value : (typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN);
  return Number.isSafeInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
};

function registerResumeFeedbackRoutes(app, pool, authenticateUser, resumeFeedback) {
  async function ownResume(req, res) {
    const id = readId(req.params.id);
    if (!id) { res.status(400).json({ message: 'Invalid resume ID.' }); return null; }
    const result = await pool.query('SELECT id, storage_path, mime_type FROM resumes WHERE id=$1 AND user_id=$2', [id, req.user.id]);
    if (!result.rowCount) { res.status(404).json({ message: 'Resume not found.' }); return null; }
    return result.rows[0];
  }

  app.post('/api/resumes/:id/feedback', authenticateUser, async (req, res, next) => {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const jobId = body.jobId === undefined || body.jobId === null || body.jobId === '' ? null : readId(body.jobId);
    if (jobId === null && !(body.jobId === undefined || body.jobId === null || body.jobId === '')) {
      return res.status(400).json({ message: 'jobId must be a positive integer.' });
    }
    try {
      const resume = await ownResume(req, res);
      if (!resume) return;
      let job = null;
      if (jobId) {
        const result = await pool.query('SELECT title, company, description, requirements FROM jobs WHERE id=$1 AND is_open=TRUE', [jobId]);
        if (!result.rowCount) return res.status(404).json({ message: 'Open job not found.' });
        job = result.rows[0];
      }
      let analysis;
      try {
        analysis = await resumeFeedback.analyze({ filePath: resume.storage_path, mimeType: resume.mime_type, job });
      } catch (error) {
        if (!(error instanceof FeedbackError) || !ERRORS[error.code]) throw error;
        console.error(`Resume feedback failed (${error.code}):`, error.message);
        const [status, message] = ERRORS[error.code];
        return res.status(status).json({ message });
      }
      const saved = await pool.query(
        `INSERT INTO resume_feedback (user_id, resume_id, job_id, job_title, model, feedback) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${feedbackColumns}`,
        [req.user.id, resume.id, jobId, job ? job.title : null, analysis.model, JSON.stringify(analysis.feedback)]
      );
      res.status(201).json(saved.rows[0]);
    } catch (error) { next(error); }
  });

  app.get('/api/resumes/:id/feedback', authenticateUser, async (req, res, next) => {
    try {
      const resume = await ownResume(req, res);
      if (!resume) return;
      const result = await pool.query(`SELECT ${feedbackColumns} FROM resume_feedback WHERE resume_id=$1 AND user_id=$2 ORDER BY created_at DESC, id DESC LIMIT 1`, [resume.id, req.user.id]);
      if (!result.rowCount) return res.status(404).json({ message: 'No feedback yet for this resume.' });
      res.json(result.rows[0]);
    } catch (error) { next(error); }
  });
}

module.exports = { registerResumeFeedbackRoutes };

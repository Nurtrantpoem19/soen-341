const multer = require('multer');
const express = require('express');
const cors = require('cors');
const { createPool } = require('./db');
const { createAuthenticateUser } = require('./middleware/auth');
const { registerAuthRoutes } = require('./routes/auth');
const { registerProfileRoutes } = require('./routes/profile');
const { registerResumeRoutes } = require('./routes/resumes');
const { registerJobRoutes } = require('./routes/jobs');
const { registerApplicationAnalytics } = require('./routes/application-analytics');
const { registerNotificationRoutes } = require('./routes/notifications');
const { createApplicationSubmissionNotifications } = require('./services/notifications');
const { registerRecruiterRoutes } = require('./routes/recruiters');
const { registerResumeFeedbackRoutes } = require('./routes/resume-feedback');
const { createResumeFeedbackService } = require('./services/resume-feedback');
const { registerJobMatchRoutes } = require('./routes/job-matches');

const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];
const applicationColumns = 'id, user_id AS "userId", job_id AS "jobId", job_title AS "jobTitle", company, cover_letter AS "coverLetter", status, applied_at AS "appliedAt", updated_at AS "updatedAt"';

function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (typeof body.jobId !== 'number' && (typeof body.jobId !== 'string' || !/^\d+$/.test(body.jobId))) return null;
  const jobId = Number(body.jobId);
  if (!Number.isSafeInteger(jobId) || jobId < 1 || jobId > 2147483647) return null;
  const coverLetter = body.coverLetter === undefined ? '' : body.coverLetter;
  if (typeof coverLetter !== 'string' || coverLetter.length > 2000) return null;
  return [jobId, coverLetter.trim()];
}

function createApp(pool, { resumeFeedback = createResumeFeedbackService() } = {}) {
  const app = express();
  const authenticateUser = createAuthenticateUser(pool);

  const allowedOrigins = new Set([
    'http://localhost:5500',
    ...(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  ]);

  app.use('/api', cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    }
  }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  registerAuthRoutes(app, pool, authenticateUser);
  registerProfileRoutes(app, pool, authenticateUser);
  registerResumeRoutes(app, pool, authenticateUser);
  registerJobRoutes(app, pool);
  registerApplicationAnalytics(app, pool, authenticateUser);
  registerNotificationRoutes(app, pool, authenticateUser);
  registerRecruiterRoutes(app, pool, authenticateUser);
  registerResumeFeedbackRoutes(app, pool, authenticateUser, resumeFeedback);
  registerJobMatchRoutes(app, pool, authenticateUser, resumeFeedback);

  // --- SPRINT 2: JOB APPLICATION SUBMISSION AND TRACKING ---

  app.post('/api/applications', authenticateUser, async (req, res, next) => {
    const values = validateApplication(req.body);
    if (!values) {
      return res.status(400).json({
        message: 'Provide a positive integer jobId and an optional coverLetter of at most 2000 characters.'
      });
    }

    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;

      const jobResult = await client.query(
        `SELECT id, title, company, recruiter_id AS "recruiterId"
         FROM jobs
         WHERE id = $1 AND is_open = TRUE
         FOR SHARE`,
        [values[0]]
      );
      if (!jobResult.rowCount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({ message: 'Open job not found.' });
      }

      const job = jobResult.rows[0];
      const result = await client.query(
        `INSERT INTO applications (user_id, job_id, job_title, company, cover_letter)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${applicationColumns}`,
        [req.user.id, job.id, job.title, job.company, values[1]]
      );
      const application = result.rows[0];
      await createApplicationSubmissionNotifications(client, application, job.recruiterId);
      await client.query('COMMIT');
      transactionOpen = false;

      res.status(201).json({
        message: 'Application submitted successfully.',
        application
      });
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          return next(rollbackError);
        }
      }
      if (error.code === '23505') return res.status(409).json({ message: 'You have already applied for this job.' });
      next(error);
    } finally {
      if (client) client.release();
    }
  });

  app.get('/api/applications/me', authenticateUser, async (req, res, next) => {
    const { status } = req.query;
    if (status !== undefined && !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid application status filter.' });
    }
    try {
      const query = status
        ? `SELECT ${applicationColumns} FROM applications WHERE user_id=$1 AND status=$2 ORDER BY applied_at DESC, id DESC`
        : `SELECT ${applicationColumns} FROM applications WHERE user_id=$1 ORDER BY applied_at DESC, id DESC`;
      const params = status ? [req.user.id, status] : [req.user.id];
      const result = await pool.query(query, params);
      res.json({ applications: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/applications/:id/status', authenticateUser, async (req, res, next) => {
    const appId = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isSafeInteger(appId) || appId < 1 || appId > 2147483647) {
      return res.status(400).json({ message: 'Provide a valid application id.' });
    }
    if (typeof status !== 'string' || !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        message: 'Provide a valid status: Applied, Under Review, Interview, Offered, or Rejected.'
      });
    }
    try {
      const result = await pool.query(
        `UPDATE applications SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 AND user_id=$3 RETURNING ${applicationColumns}`,
        [status, appId, req.user.id]
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Application not found.' });
      res.json({
        message: 'Application status updated successfully.',
        application: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  });

  app.use((error, req, res, _next) => {
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Invalid JSON.' });
    }

    if (error.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Request too large.' });
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          message: 'Resume exceeds the 5 MB file size limit.'
        });
      }

      return res.status(400).json({
        message: 'File upload error: ' + error.message
      });
    }

    if (error.message === 'Only PDF and DOCX resumes are allowed') {
      return res.status(400).json({
        message: error.message
      });
    }

    console.error('Backend error:', error);
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  const pool = createPool();
  const server = createApp(pool).listen(
    process.env.PORT || 3000,
    '127.0.0.1',
    () => console.log('CareerConnect backend started on localhost.')
  );
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => server.close(() => pool.end()));
  }
}

module.exports = { createApp };

const express = require('express');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { createPool } = require('./db');

const fields = { firstName: 100, lastName: 100, phone: 50, location: 200, headline: 200 };
const columns = 'user_id AS "userId", first_name AS "firstName", last_name AS "lastName", phone, location, headline, summary';

const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];
const applicationColumns = 'id, user_id AS "userId", job_id AS "jobId", job_title AS "jobTitle", company, cover_letter AS "coverLetter", status, applied_at AS "appliedAt", updated_at AS "updatedAt"';

function validateProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const values = [];
  for (const [name, limit] of Object.entries(fields)) {
    if (typeof body[name] !== 'string' || !body[name].trim() || body[name].trim().length > limit) return null;
    values.push(body[name].trim());
  }
  return values;
}

function validateApplication(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const jobId = Number(body.jobId);
  if (!Number.isSafeInteger(jobId) || jobId < 1 || jobId > 2147483647) return null;
  if (typeof body.jobTitle !== 'string' || !body.jobTitle.trim() || body.jobTitle.trim().length > 200) return null;
  if (typeof body.company !== 'string' || !body.company.trim() || body.company.trim().length > 200) return null;
  const coverLetter = body.coverLetter === undefined ? '' : body.coverLetter;
  if (typeof coverLetter !== 'string' || coverLetter.length > 2000) return null;
  return [jobId, body.jobTitle.trim(), body.company.trim(), coverLetter.trim()];
}

function createApp(pool, { demoAuth = false } = {}) {
  const app = express();
  app.use('/api/auth/register', cors());
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', async (req, res) => {
    try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });

  app.post('/api/auth/register', async (req, res, next) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
      return res.status(400).json({ message: 'Provide a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes.' });
    }
    try {
      const hash = await bcrypt.hash(password, 10);
      const result = await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email', [email.trim().toLowerCase(), hash]);
      res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'User with this email already exists.' });
      next(error);
    }
  });

  // Temporary compatibility with the existing local demo. Real authentication is a separate task.
  async function demoUser(req, res, next) {
    if (!demoAuth) return res.status(401).json({ message: 'Profile authentication is not configured.' });
    const id = Number(req.get('x-demo-user-id'));
    if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) return res.status(401).json({ message: 'Provide a valid x-demo-user-id.' });
    try {
      const result = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
      if (!result.rowCount) return res.status(401).json({ message: 'Register first.' });
      req.user = result.rows[0]; next();
    } catch (error) { next(error); }
  }

  app.post('/api/profile', demoUser, async (req, res, next) => {
    const values = validateProfile(req.body);
    if (!values) return res.status(400).json({ message: 'All profile fields are required and must respect length limits.' });
    try {
      const result = await pool.query(`INSERT INTO profiles (user_id, first_name, last_name, phone, location, headline) VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${columns}`, [req.user.id, ...values]);
      res.status(201).json({ profile: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'Profile already exists.' });
      next(error);
    }
  });

  app.get('/api/profile/me', demoUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT ${columns} FROM profiles WHERE user_id=$1`, [req.user.id]);
      if (!result.rowCount) return res.status(404).json({ message: 'Profile not found.' });
      res.json({ profile: result.rows[0] });
    } catch (error) { next(error); }
  });

  app.put('/api/profile/me', demoUser, async (req, res, next) => {
    const values = validateProfile(req.body);
    if (!values) return res.status(400).json({ message: 'All profile fields are required and must respect length limits.' });
    try {
      const result = await pool.query(`UPDATE profiles SET first_name=$2,last_name=$3,phone=$4,location=$5,headline=$6,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 RETURNING ${columns}`, [req.user.id, ...values]);
      if (!result.rowCount) return res.status(404).json({ message: 'Profile not found.' });
      res.json({ profile: result.rows[0] });
    } catch (error) { next(error); }
  });

  // --- SPRINT 2: JOB APPLICATION SUBMISSION AND TRACKING ---

  // 1. Submit a new job application and return confirmation
  app.post('/api/applications', demoUser, async (req, res, next) => {
    const values = validateApplication(req.body);
    if (!values) return res.status(400).json({ message: 'Provide a valid jobId, jobTitle, and company.' });
    try {
      const result = await pool.query(
        `INSERT INTO applications (user_id, job_id, job_title, company, cover_letter) VALUES ($1,$2,$3,$4,$5) RETURNING ${applicationColumns}`,
        [req.user.id, ...values]
      );
      res.status(201).json({
        message: 'Application submitted successfully.',
        application: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ message: 'You have already applied for this job.' });
      next(error);
    }
  });

  // 2. Get all applications for the logged-in user (with optional status filter)
  app.get('/api/applications/me', demoUser, async (req, res, next) => {
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
    } catch (error) { next(error); }
  });

  // 3. Update an application's status (Applied, Under Review, Interview, Offered, Rejected)
  app.patch('/api/applications/:id/status', demoUser, async (req, res, next) => {
    const appId = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isSafeInteger(appId) || appId < 1 || appId > 2147483647) {
      return res.status(400).json({ message: 'Provide a valid application id.' });
    }
    if (typeof status !== 'string' || !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Provide a valid status: Applied, Under Review, Interview, Offered, or Rejected.' });
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
    } catch (error) { next(error); }
  });

  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request too large.' });
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  const pool = createPool();
  const server = createApp(pool, { demoAuth: process.env.DEMO_AUTH === 'true' }).listen(process.env.PORT || 3000, '127.0.0.1', () => console.log('CareerConnect backend started on localhost.'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => pool.end()));
}

module.exports = { createApp };
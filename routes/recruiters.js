// Recruiter dashboard and posting management (Sprint 3).
// Every route requires a valid JWT and the recruiter role, and only ever touches the recruiter's own postings.
const STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];
const { randomUUID } = require('node:crypto');
const { createNotification } = require('../services/notifications');
const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract'];
const jobColumns = 'id, title, company, location, category, employment_type AS "employmentType", salary, description, requirements, is_open AS "isOpen", posted_at AS "postedAt"';
// Field name -> [maximum length, required]. Limits match the CHECK constraints of the jobs table.
const jobFields = {
  title: [200, true],
  company: [200, true],
  location: [200, true],
  category: [100, true],
  salary: [100, false],
  description: [5000, true],
  requirements: [5000, false]
};

// Returns the trimmed posting values in column order, or null when the body is invalid.
function validateJob(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const values = {};
  for (const [name, [limit, required]] of Object.entries(jobFields)) {
    const value = body[name] === undefined && !required ? '' : body[name];
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if ((required && !trimmed) || [...trimmed].length > limit) return null;
    values[name] = trimmed;
  }
  if (!EMPLOYMENT_TYPES.includes(body.employmentType)) return null;
  return [values.title, values.company, values.location, values.category, body.employmentType, values.salary, values.description, values.requirements];
}

function readId(value) {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id >= 1 && id <= 2147483647 ? id : null;
}

// Accepts YYYY-MM-DD only and returns the UTC midnight of that day (plus addDays), or null when invalid.
function readDate(value, addDays = 0) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  date.setUTCDate(date.getUTCDate() + addDays);
  return date;
}

// Adds the number of applications, in total and per status, to each posting.
function summarizePostings(jobs, applications) {
  const counts = new Map(jobs.map(job => [job.id, Object.fromEntries(STATUSES.map(status => [status, 0]))]));
  for (const row of applications) {
    const byStatus = counts.get(row.job_id);
    if (byStatus && row.status in byStatus) byStatus[row.status] += 1;
  }
  return jobs.map(job => {
    const byStatus = counts.get(job.id);
    return { ...job, applicationCount: Object.values(byStatus).reduce((sum, count) => sum + count, 0), applicationsByStatus: byStatus };
  });
}

function registerRecruiterRoutes(app, pool, authenticateUser) {
  // The role is read from the database on every request, so it cannot be forged in the token or request.
  async function requireRecruiter(req, res, next) {
    try {
      const result = await pool.query('SELECT role FROM users WHERE id=$1', [req.user.id]);
      if (!result.rowCount) return res.status(401).json({ message: 'Authentication required.' });
      if (result.rows[0].role !== 'recruiter') return res.status(403).json({ message: 'Recruiter access required.' });
      next();
    } catch (error) { next(error); }
  }
  const recruiter = [authenticateUser, requireRecruiter];

  // Lets the frontend know who is logged in and which pages to show.
  app.get('/api/auth/me', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query('SELECT id, email, role FROM users WHERE id=$1', [req.user.id]);
      if (!result.rowCount) return res.status(401).json({ message: 'Authentication required.' });
      res.json({ user: result.rows[0] });
    } catch (error) { next(error); }
  });

  // All postings of the logged-in recruiter (active and archived) with application counts.
  app.get('/api/recruiter/jobs', recruiter, async (req, res, next) => {
    try {
      const jobs = await pool.query(`SELECT ${jobColumns} FROM jobs WHERE recruiter_id=$1 ORDER BY posted_at DESC, id DESC`, [req.user.id]);
      const applications = await pool.query(
        'SELECT a.job_id, a.status FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.recruiter_id=$1',
        [req.user.id]
      );
      res.json({ jobs: summarizePostings(jobs.rows, applications.rows) });
    } catch (error) { next(error); }
  });

  app.post('/api/recruiter/jobs', recruiter, async (req, res, next) => {
    const values = validateJob(req.body);
    if (!values) return res.status(400).json({ message: 'Provide a title, company, location, category, description and a valid employment type, within the length limits.' });
    try {
      const result = await pool.query(
        `INSERT INTO jobs (recruiter_id, title, company, location, category, employment_type, salary, description, requirements)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${jobColumns}`,
        [req.user.id, ...values]
      );
      res.status(201).json({ message: 'Job posting created.', job: result.rows[0] });
    } catch (error) { next(error); }
  });

  app.put('/api/recruiter/jobs/:id', recruiter, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job ID.' });
    const values = validateJob(req.body);
    if (!values) return res.status(400).json({ message: 'Provide a title, company, location, category, description and a valid employment type, within the length limits.' });
    try {
      const result = await pool.query(
        `UPDATE jobs SET title=$3, company=$4, location=$5, category=$6, employment_type=$7, salary=$8, description=$9, requirements=$10
         WHERE id=$1 AND recruiter_id=$2 RETURNING ${jobColumns}`,
        [id, req.user.id, ...values]
      );
      if (!result.rowCount) return res.status(404).json({ message: 'Job posting not found.' });
      res.json({ message: 'Job posting updated.', job: result.rows[0] });
    } catch (error) { next(error); }
  });

  // Archiving closes the posting: it leaves job search and stops accepting applications, but keeps its applications.
  app.patch('/api/recruiter/jobs/:id/archive', recruiter, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job ID.' });
    const archived = req.body ? req.body.archived : undefined;
    if (typeof archived !== 'boolean') return res.status(400).json({ message: 'archived must be true or false.' });
    try {
      const result = await pool.query(`UPDATE jobs SET is_open=$3 WHERE id=$1 AND recruiter_id=$2 RETURNING ${jobColumns}`, [id, req.user.id, !archived]);
      if (!result.rowCount) return res.status(404).json({ message: 'Job posting not found.' });
      res.json({ message: archived ? 'Job posting archived.' : 'Job posting restored.', job: result.rows[0] });
    } catch (error) { next(error); }
  });

  // Applications received for one posting, optionally filtered by status and by submission date (inclusive days, UTC).
  app.get('/api/recruiter/jobs/:id/applications', recruiter, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid job ID.' });
    const { status, from, to } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid application status filter.' });
    const fromDate = from === undefined ? undefined : readDate(from);
    const toDate = to === undefined ? undefined : readDate(to, 1);
    if (fromDate === null || toDate === null) return res.status(400).json({ message: 'from and to must be dates in YYYY-MM-DD format.' });
    try {
      const job = await pool.query(`SELECT ${jobColumns} FROM jobs WHERE id=$1 AND recruiter_id=$2`, [id, req.user.id]);
      if (!job.rowCount) return res.status(404).json({ message: 'Job posting not found.' });
      const conditions = ['a.job_id = $1'];
      const params = [id];
      if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }
      if (fromDate) { params.push(fromDate); conditions.push(`a.applied_at >= $${params.length}`); }
      if (toDate) { params.push(toDate); conditions.push(`a.applied_at < $${params.length}`); }
      const result = await pool.query(
        `SELECT a.id, a.status, a.cover_letter AS "coverLetter", a.applied_at AS "appliedAt", a.updated_at AS "updatedAt",
                u.email, p.first_name AS "firstName", p.last_name AS "lastName", p.headline, p.location, p.phone
         FROM applications a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN profiles p ON p.user_id = a.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY a.applied_at DESC, a.id DESC`,
        params
      );
      res.json({ job: job.rows[0], applications: result.rows });
    } catch (error) { next(error); }
  });

  // Recruiters move candidates through the hiring process, only for applications to their own postings.
  app.patch('/api/recruiter/applications/:id/status', recruiter, async (req, res, next) => {
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid application ID.' });
    const status = req.body ? req.body.status : undefined;
    if (typeof status !== 'string' || !STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Provide a valid status: Applied, Under Review, Interview, Offered, or Rejected.' });
    }
    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      transactionOpen = true;
      const owned = await client.query(
        'SELECT a.* FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id=$1 AND j.recruiter_id=$2 FOR UPDATE',
        [id, req.user.id]
      );
      if (!owned.rowCount) {
        await client.query('ROLLBACK');
        transactionOpen = false;
        return res.status(404).json({ message: 'Application not found.' });
      }
      const previous = owned.rows[0];
      if (previous.status === status) {
        await client.query('COMMIT');
        transactionOpen = false;
        return res.json({ message: 'Application status unchanged.', application: {
          id: previous.id, jobId: previous.job_id, status: previous.status,
          appliedAt: previous.applied_at, updatedAt: previous.updated_at
        } });
      }
      const result = await client.query(
        'UPDATE applications SET status=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id, job_id AS "jobId", status, applied_at AS "appliedAt", updated_at AS "updatedAt"',
        [status, id]
      );
      await createNotification(client, {
        userId: previous.user_id,
        type: 'application_status',
        title: 'Application status updated',
        message: `Your application for ${previous.job_title} at ${previous.company} is now ${status}.`,
        link: `/frontend/job.html?id=${encodeURIComponent(previous.job_id)}`,
        applicationId: id, jobId: previous.job_id, actorUserId: req.user.id,
        dedupeKey: `application:${id}:status:${randomUUID()}`
      });
      await client.query('COMMIT');
      transactionOpen = false;
      res.json({ message: 'Application status updated.', application: result.rows[0] });
    } catch (error) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch (rollbackError) { return next(rollbackError); }
      }
      next(error);
    } finally { if (client) client.release(); }
  });
}

module.exports = { registerRecruiterRoutes, validateJob, readDate, summarizePostings };

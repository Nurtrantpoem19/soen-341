const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Internship', 'Contract'];
const APPLICATION_STATUSES = ['Applied', 'Under Review', 'Interview', 'Offered', 'Rejected'];

const JOB_LIMITS = {
  title: 200,
  company: 200,
  location: 200,
  category: 100
};

const jobColumns = `
  id,
  recruiter_id AS "recruiterId",
  title,
  company,
  location,
  category,
  employment_type AS "employmentType",
  salary,
  description,
  requirements,
  is_open AS "isOpen",
  posted_at AS "postedAt"
`;

// Unit-testable helper: validates job creation and edit payloads
function validateJobPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const cleaned = {};
  for (const [field, maxLen] of Object.entries(JOB_LIMITS)) {
    if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > maxLen) {
      return null;
    }
    cleaned[field] = body[field].trim();
  }

  if (typeof body.employmentType !== 'string' || !EMPLOYMENT_TYPES.includes(body.employmentType)) {
    return null;
  }
  cleaned.employmentType = body.employmentType;

  const salary = body.salary === undefined ? '' : body.salary;
  if (typeof salary !== 'string' || salary.trim().length > 100) return null;
  cleaned.salary = salary.trim();

  if (typeof body.description !== 'string' || !body.description.trim() || body.description.trim().length > 5000) {
    return null;
  }
  cleaned.description = body.description.trim();

  const requirements = body.requirements === undefined ? '' : body.requirements;
  if (typeof requirements !== 'string' || requirements.trim().length > 5000) return null;
  cleaned.requirements = requirements.trim();

  return cleaned;
}

// Unit-testable helper: validates applicant filter query params (status and date range)
function validateApplicationFilters(query) {
  if (!query || typeof query !== 'object') return null;
  const filters = { status: null, fromDate: null, toDate: null };

  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string' || !APPLICATION_STATUSES.includes(query.status)) {
      return null;
    }
    filters.status = query.status;
  }

  if (query.fromDate !== undefined && query.fromDate !== '') {
    const parsedFrom = new Date(query.fromDate);
    if (Number.isNaN(parsedFrom.getTime())) return null;
    filters.fromDate = parsedFrom.toISOString();
  }

  if (query.toDate !== undefined && query.toDate !== '') {
    const parsedTo = new Date(query.toDate);
    if (Number.isNaN(parsedTo.getTime())) return null;
    filters.toDate = parsedTo.toISOString();
  }

  if (filters.fromDate && filters.toDate && new Date(filters.fromDate) > new Date(filters.toDate)) {
    return null;
  }

  return filters;
}

function parsePositiveId(rawId) {
  const id = Number(rawId);
  if (!/^\d+$/.test(String(rawId)) || !Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    return null;
  }
  return id;
}

function registerRecruiterRoutes(app, pool, authenticateUser) {
  // 1. Create a new job posting
  app.post('/api/recruiter/jobs', authenticateUser, async (req, res, next) => {
    const valid = validateJobPayload(req.body);
    if (!valid) {
      return res.status(400).json({
        message: 'Provide valid job fields (title, company, location, category, employmentType, description) within length limits.'
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO jobs (recruiter_id, title, company, location, category, employment_type, salary, description, requirements)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${jobColumns}`,
        [
          req.user.id,
          valid.title,
          valid.company,
          valid.location,
          valid.category,
          valid.employmentType,
          valid.salary,
          valid.description,
          valid.requirements
        ]
      );

      res.status(201).json({
        message: 'Job posting created successfully.',
        job: { ...result.rows[0], applicationCount: 0 }
      });
    } catch (error) {
      next(error);
    }
  });

  // 2. List all job postings for the logged-in recruiter (with application counts)
  app.get('/api/recruiter/jobs', authenticateUser, async (req, res, next) => {
    const { state } = req.query; // optional: 'open', 'archived'
    if (state !== undefined && !['open', 'archived'].includes(state)) {
      return res.status(400).json({ message: 'Invalid state filter. Use open or archived.' });
    }

    try {
      let stateClause = '';
      if (state === 'open') stateClause = 'AND is_open = TRUE';
      if (state === 'archived') stateClause = 'AND is_open = FALSE';

      const jobsResult = await pool.query(
        `SELECT ${jobColumns}
         FROM jobs
         WHERE recruiter_id = $1 ${stateClause}
         ORDER BY posted_at DESC, id DESC`,
        [req.user.id]
      );

      const appsResult = await pool.query(
        `SELECT a.job_id AS "jobId"
         FROM applications a
         INNER JOIN jobs j ON j.id = a.job_id
         WHERE j.recruiter_id = $1`,
        [req.user.id]
      );

      const counts = {};
      for (const row of appsResult.rows) {
        counts[row.jobId] = (counts[row.jobId] || 0) + 1;
      }

      const jobs = jobsResult.rows.map(job => ({
        ...job,
        applicationCount: counts[job.id] || 0
      }));

      res.json({ jobs });
    } catch (error) {
      next(error);
    }
  });

  // 3. Edit an existing job posting owned by the recruiter
  app.put('/api/recruiter/jobs/:id', authenticateUser, async (req, res, next) => {
    const jobId = parsePositiveId(req.params.id);
    if (!jobId) return res.status(400).json({ message: 'Invalid job ID.' });

    const valid = validateJobPayload(req.body);
    if (!valid) {
      return res.status(400).json({
        message: 'Provide valid job fields (title, company, location, category, employmentType, description) within length limits.'
      });
    }

    try {
      const result = await pool.query(
        `UPDATE jobs
         SET title = $1,
             company = $2,
             location = $3,
             category = $4,
             employment_type = $5,
             salary = $6,
             description = $7,
             requirements = $8
         WHERE id = $9 AND recruiter_id = $10
         RETURNING ${jobColumns}`,
        [
          valid.title,
          valid.company,
          valid.location,
          valid.category,
          valid.employmentType,
          valid.salary,
          valid.description,
          valid.requirements,
          jobId,
          req.user.id
        ]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Job posting not found.' });
      }

      res.json({
        message: 'Job posting updated successfully.',
        job: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  });

  // 4. Archive or unarchive a job posting
  app.patch('/api/recruiter/jobs/:id/archive', authenticateUser, async (req, res, next) => {
    const jobId = parsePositiveId(req.params.id);
    if (!jobId) return res.status(400).json({ message: 'Invalid job ID.' });

    const isOpen = req.body && typeof req.body.isOpen === 'boolean' ? req.body.isOpen : false;

    try {
      const result = await pool.query(
        `UPDATE jobs
         SET is_open = $1
         WHERE id = $2 AND recruiter_id = $3
         RETURNING ${jobColumns}`,
        [isOpen, jobId, req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Job posting not found.' });
      }

      res.json({
        message: isOpen ? 'Job posting restored successfully.' : 'Job posting archived successfully.',
        job: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  });

  // 5. Get applications for a specific recruiter job posting (with status & date filters + candidate profile details)
  app.get('/api/recruiter/jobs/:id/applications', authenticateUser, async (req, res, next) => {
    const jobId = parsePositiveId(req.params.id);
    if (!jobId) return res.status(400).json({ message: 'Invalid job ID.' });

    const filters = validateApplicationFilters(req.query);
    if (!filters) {
      return res.status(400).json({ message: 'Invalid application filters. Provide a valid status and/or ISO date range.' });
    }

    try {
      const jobCheck = await pool.query(
        'SELECT id, title, company, is_open AS "isOpen" FROM jobs WHERE id = $1 AND recruiter_id = $2',
        [jobId, req.user.id]
      );
      if (jobCheck.rowCount === 0) {
        return res.status(404).json({ message: 'Job posting not found.' });
      }

      const conditions = ['a.job_id = $1'];
      const params = [jobId];

      if (filters.status) {
        params.push(filters.status);
        conditions.push(`a.status = $${params.length}`);
      }
      if (filters.fromDate) {
        params.push(new Date(filters.fromDate));
        conditions.push(`a.applied_at >= $${params.length}`);
      }
      if (filters.toDate) {
        params.push(new Date(filters.toDate));
        conditions.push(`a.applied_at <= $${params.length}`);
      }

      const appsResult = await pool.query(
        `SELECT a.id,
                a.user_id AS "userId",
                a.job_id AS "jobId",
                a.job_title AS "jobTitle",
                a.company,
                a.cover_letter AS "coverLetter",
                a.status,
                a.applied_at AS "appliedAt",
                a.updated_at AS "updatedAt",
                u.email AS "candidateEmail",
                p.first_name AS "firstName",
                p.last_name AS "lastName",
                p.phone,
                p.location AS "candidateLocation",
                p.headline
         FROM applications a
         INNER JOIN users u ON u.id = a.user_id
         LEFT JOIN profiles p ON p.user_id = a.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY a.applied_at DESC, a.id DESC`,
        params
      );

      res.json({
        job: jobCheck.rows[0],
        applications: appsResult.rows
      });
    } catch (error) {
      next(error);
    }
  });

  // 6. Review candidate & update application status for a recruiter's job posting
  app.patch('/api/recruiter/jobs/:jobId/applications/:appId/status', authenticateUser, async (req, res, next) => {
    const jobId = parsePositiveId(req.params.jobId);
    const appId = parsePositiveId(req.params.appId);
    if (!jobId || !appId) {
      return res.status(400).json({ message: 'Invalid job or application ID.' });
    }

    const { status } = req.body || {};
    if (typeof status !== 'string' || !APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({
        message: 'Provide a valid status: Applied, Under Review, Interview, Offered, or Rejected.'
      });
    }

    try {
      const jobCheck = await pool.query(
        'SELECT id FROM jobs WHERE id = $1 AND recruiter_id = $2',
        [jobId, req.user.id]
      );
      if (jobCheck.rowCount === 0) {
        return res.status(404).json({ message: 'Job posting not found.' });
      }

      const result = await pool.query(
        `UPDATE applications
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND job_id = $3
         RETURNING id, user_id AS "userId", job_id AS "jobId", job_title AS "jobTitle", company, cover_letter AS "coverLetter", status, applied_at AS "appliedAt", updated_at AS "updatedAt"`,
        [status, appId, jobId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Application not found for this job posting.' });
      }

      res.json({
        message: 'Candidate application status updated successfully.',
        application: result.rows[0]
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = {
  registerRecruiterRoutes,
  validateJobPayload,
  validateApplicationFilters,
  parsePositiveId
};
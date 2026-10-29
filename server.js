const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const { createPool } = require('./db');
const { registerJobRoutes } = require('./routes/jobs');

async function validateResumeFile(file) {
  const handle = await fsPromises.open(file.path, 'r');

  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, 8, 0);

    if (file.mimetype === 'application/pdf') {
      return (
        bytesRead >= 5 &&
        header.subarray(0, 5).toString('ascii') === '%PDF-'
      );
    }

    if (
      file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      if (
        bytesRead < 4 ||
        !header.subarray(0, 4).equals(
          Buffer.from([0x50, 0x4b, 0x03, 0x04])
        )
      ) {
        return false;
      }

      try {
        const stats = await fsPromises.stat(file.path);

        if (stats.size > 5 * 1024 * 1024) {
          return false;
        }

        const data = await fsPromises.readFile(file.path);
        const zip = await JSZip.loadAsync(data);

        const requiredFiles = [
          '[Content_Types].xml',
          '_rels/.rels',
          'word/document.xml'
        ];

        return requiredFiles.every(
          name => zip.file(name) !== null
        );
      } catch (error) {
        return false;
      }
    }

    return false;
  } finally {
    await handle.close();
  }
}

const resumeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads', 'resumes');

    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const uniqueName = crypto.randomUUID() + extension;

    cb(null, uniqueName);
  }
});

const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !allowedTypes.includes(file.mimetype) ||
      !['.pdf', '.docx'].includes(extension)
    ) {
      return cb(new Error('Only PDF and DOCX resumes are allowed'));
    }

    cb(null, true);
  }
});

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
  app.use('/api/jobs', cors());
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

  // User login
  app.post('/api/auth/login', async (req, res, next) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' ||
        typeof password !== 'string' ||
        !email.trim() ||
        !password) {
      return res.status(400).json({
        message: 'Email and password are required.'
      });
    }

    try {
      const result = await pool.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [email.trim().toLowerCase()]
      );

      if (result.rowCount === 0) {
        return res.status(401).json({
          message: 'Invalid email or password.'
        });
      }

      const user = result.rows[0];

      const validPassword = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!validPassword) {
        return res.status(401).json({
          message: 'Invalid email or password.'
        });
      }

      const secret = process.env.JWT_SECRET;

      if (!secret) {
        return res.status(503).json({
          message: 'Authentication is not configured.'
        });
      }

      const token = jwt.sign(
        { userId: user.id },
        secret,
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email
        }
      });

    } catch (error) {
      next(error);
    }
  });

  // Verify the logged-in user using a JWT token
  function authenticateUser(req, res, next) {
    const authorization = req.get('Authorization');

    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({
        message: 'Authentication required.'
      });
    }

    const token = authorization.slice(7);

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({
        message: 'Authentication is not configured.'
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });

      if (!Number.isSafeInteger(decoded.userId) || decoded.userId < 1) {
        return res.status(401).json({
          message: 'Invalid authentication token.'
        });
      }

      req.user = { id: decoded.userId };
      next();

    } catch (error) {
      return res.status(401).json({
        message: 'Invalid or expired authentication token.'
      });
    }
  }

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

  app.post('/api/resumes', authenticateUser, uploadResume.single('resume'), async (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a PDF or DOCX resume.' });
    }
    try {
      const isValid = await validateResumeFile(req.file);

      if (!isValid) {
        await fsPromises.unlink(req.file.path);
        return res.status(400).json({
          message: 'Invalid resume file content. Please upload a valid PDF or DOCX.'
        });
      }
    } catch (error) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return next(error);
    }

    try {
      const result = await pool.query(
        `INSERT INTO resumes
         (user_id, original_name, storage_path, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, original_name, file_size, mime_type, uploaded_at`,
        [
          req.user.id,
          req.file.originalname,
          req.file.path,
          req.file.size,
          req.file.mimetype
        ]
      );

      res.status(201).json({
        message: 'Resume uploaded successfully.',
        resume: result.rows[0]
      });
    } catch (error) {
      fs.unlink(req.file.path, () => {});
      next(error);
    }
  });

  app.get('/api/resumes', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, original_name, file_size, mime_type, uploaded_at
         FROM resumes
         WHERE user_id = $1
         ORDER BY uploaded_at DESC, id DESC`,
        [req.user.id]
      );

      res.json({ resumes: result.rows });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/resumes/:id/download', authenticateUser, async (req, res, next) => {
    const resumeId = Number(req.params.id);

    if (!Number.isSafeInteger(resumeId) || resumeId < 1) {
      return res.status(400).json({ message: 'Invalid resume ID.' });
    }

    try {
      const result = await pool.query(
        `SELECT original_name, storage_path
         FROM resumes
         WHERE id = $1 AND user_id = $2`,
        [resumeId, req.user.id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: 'Resume not found.' });
      }

      const resume = result.rows[0];

      res.download(resume.storage_path, resume.original_name, (error) => {
        if (error) {
          if (!res.headersSent) {
            next(error);
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/resumes/:id', authenticateUser, uploadResume.single('resume'), async (req, res, next) => {
    const resumeId = Number(req.params.id);

    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a PDF or DOCX resume.' });
    }
    try {
      const isValid = await validateResumeFile(req.file);

      if (!isValid) {
        await fsPromises.unlink(req.file.path);
        return res.status(400).json({
          message: 'Invalid resume file content. Please upload a valid PDF or DOCX.'
        });
      }
    } catch (error) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      return next(error);
    }

    try {
      if (!Number.isSafeInteger(resumeId) || resumeId < 1) {
        await fsPromises.unlink(req.file.path);
        return res.status(400).json({ message: 'Invalid resume ID.' });
      }

      const existing = await pool.query(
        `SELECT storage_path
         FROM resumes
         WHERE id = $1 AND user_id = $2`,
        [resumeId, req.user.id]
      );

      if (existing.rowCount === 0) {
        await fsPromises.unlink(req.file.path);
        return res.status(404).json({ message: 'Resume not found.' });
      }

      const oldPath = existing.rows[0].storage_path;

      const result = await pool.query(
        `UPDATE resumes
         SET original_name = $1,
             storage_path = $2,
             file_size = $3,
             mime_type = $4,
             uploaded_at = CURRENT_TIMESTAMP
         WHERE id = $5 AND user_id = $6
         RETURNING id, original_name, file_size, mime_type, uploaded_at`,
        [
          req.file.originalname,
          req.file.path,
          req.file.size,
          req.file.mimetype,
          resumeId,
          req.user.id
        ]
      );

      if (oldPath !== req.file.path) {
        try {
          await fsPromises.unlink(oldPath);
        } catch (cleanupError) {
          console.error('Could not remove old resume:', cleanupError);
        }
      }

      res.json({
        message: 'Resume replaced successfully.',
        resume: result.rows[0]
      });
    } catch (error) {
      await fsPromises.unlink(req.file.path).catch(() => {});
      next(error);
    }
  });

  app.post('/api/profile', authenticateUser, async (req, res, next) => {
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

  app.get('/api/profile/me', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT ${columns} FROM profiles WHERE user_id=$1`, [req.user.id]);
      if (!result.rowCount) return res.status(404).json({ message: 'Profile not found.' });
      res.json({ profile: result.rows[0] });
    } catch (error) { next(error); }
  });

  app.put('/api/profile/me', authenticateUser, async (req, res, next) => {
    const values = validateProfile(req.body);
    if (!values) return res.status(400).json({ message: 'All profile fields are required and must respect length limits.' });
    try {
      const result = await pool.query(`UPDATE profiles SET first_name=$2,last_name=$3,phone=$4,location=$5,headline=$6,updated_at=CURRENT_TIMESTAMP WHERE user_id=$1 RETURNING ${columns}`, [req.user.id, ...values]);
      if (!result.rowCount) return res.status(404).json({ message: 'Profile not found.' });
      res.json({ profile: result.rows[0] });
    } catch (error) { next(error); }
  });

  registerJobRoutes(app, pool);

  // --- SPRINT 2: JOB APPLICATION SUBMISSION AND TRACKING ---

  // 1. Submit a new job application and return confirmation
  app.post('/api/applications', authenticateUser, async (req, res, next) => {
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
    } catch (error) { next(error); }
  });

  // 3. Update an application's status (Applied, Under Review, Interview, Offered, Rejected)
  app.patch('/api/applications/:id/status', authenticateUser, async (req, res, next) => {
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
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Invalid JSON.' });
    }

    if (error.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Request too large.' });
    }

    // Handle resume upload errors
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

    // Handle unsupported file types
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
  const server = createApp(pool, { demoAuth: process.env.DEMO_AUTH === 'true' }).listen(process.env.PORT || 3000, '127.0.0.1', () => console.log('CareerConnect backend started on localhost.'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => pool.end()));
}

module.exports = { createApp };
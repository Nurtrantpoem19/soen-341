const multer = require('multer');
const path = require('node:path');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const crypto = require('node:crypto');
const JSZip = require('jszip');

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

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
        !header.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      ) {
        return false;
      }

      try {
        const stats = await fsPromises.stat(file.path);
        if (stats.size > MAX_RESUME_BYTES) {
          return false;
        }

        const data = await fsPromises.readFile(file.path);
        const zip = await JSZip.loadAsync(data);

        const requiredFiles = [
          '[Content_Types].xml',
          '_rels/.rels',
          'word/document.xml'
        ];

        return requiredFiles.every(name => zip.file(name) !== null);
      } catch {
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
    const uploadDir = path.join(__dirname, '..', 'uploads', 'resumes');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, crypto.randomUUID() + extension);
  }
});

const uploadResume = multer({
  storage: resumeStorage,
  limits: { fileSize: MAX_RESUME_BYTES },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      !['.pdf', '.docx'].includes(extension)
    ) {
      return cb(new Error('Only PDF and DOCX resumes are allowed'));
    }

    cb(null, true);
  }
});

function parseResumeId(raw) {
  const resumeId = Number(raw);
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(resumeId) || resumeId < 1 || resumeId > 2147483647) {
    return null;
  }
  return resumeId;
}

function registerResumeRoutes(app, pool, authenticateUser) {
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
      await fsPromises.unlink(req.file.path).catch(() => {});
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
    const resumeId = parseResumeId(req.params.id);
    if (!resumeId) {
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
      res.download(resume.storage_path, resume.original_name, error => {
        if (error && !res.headersSent) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/resumes/:id', authenticateUser, uploadResume.single('resume'), async (req, res, next) => {
    const resumeId = parseResumeId(req.params.id);

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
      if (!resumeId) {
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
        await fsPromises.unlink(oldPath).catch(cleanupError => {
          if (cleanupError.code !== 'ENOENT') {
            console.error('Could not remove old resume:', cleanupError);
          }
        });
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

  app.delete('/api/resumes/:id', authenticateUser, async (req, res, next) => {
    const resumeId = parseResumeId(req.params.id);
    if (!resumeId) {
      return res.status(400).json({ message: 'Invalid resume ID.' });
    }

    try {
      const deleted = await pool.query(
        `DELETE FROM resumes
         WHERE id = $1 AND user_id = $2
         RETURNING id, storage_path`,
        [resumeId, req.user.id]
      );

      if (deleted.rowCount === 0) {
        return res.status(404).json({ message: 'Resume not found.' });
      }

      await fsPromises.unlink(deleted.rows[0].storage_path).catch(cleanupError => {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Could not remove deleted resume file:', cleanupError);
        }
      });

      res.json({
        message: 'Resume deleted successfully.',
        id: deleted.rows[0].id
      });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerResumeRoutes, validateResumeFile, parseResumeId };

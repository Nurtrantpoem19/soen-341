const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const ALLOWED_ROLES = ['job_seeker', 'recruiter'];

function validateRegistration(body) {
  const { email, password } = body || {};
  const role = body && body.role !== undefined ? body.role : 'job_seeker';

  if (!ALLOWED_ROLES.includes(role)) {
    return { error: 'role must be job_seeker or recruiter.' };
  }

  if (
    typeof email !== 'string' ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  ) {
    return {
      error: 'Provide a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes.'
    };
  }

  return {
    email: email.trim().toLowerCase(),
    password,
    role
  };
}

function validateLogin(body) {
  const { email, password } = body || {};

  if (
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    !email.trim() ||
    !password
  ) {
    return { error: 'Email and password are required.' };
  }

  return {
    email: email.trim().toLowerCase(),
    password
  };
}

function registerAuthRoutes(app, pool, authenticateUser) {
  app.post('/api/auth/register', async (req, res, next) => {
    const validated = validateRegistration(req.body);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    try {
      const hash = await bcrypt.hash(validated.password, 10);
      const result = await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
        [validated.email, hash, validated.role]
      );
      res.status(201).json({
        message: 'User registered successfully',
        user: result.rows[0]
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'User with this email already exists.' });
      }
      next(error);
    }
  });

  app.post('/api/auth/login', async (req, res, next) => {
    const validated = validateLogin(req.body);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    try {
      const result = await pool.query(
        'SELECT id, email, role, password_hash FROM users WHERE email = $1',
        [validated.email]
      );

      if (result.rowCount === 0) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const user = result.rows[0];
      const validPassword = await bcrypt.compare(validated.password, user.password_hash);

      if (!validPassword) {
        return res.status(401).json({ message: 'Invalid email or password.' });
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        return res.status(503).json({ message: 'Authentication is not configured.' });
      }

      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { userId: user.id, jti },
        secret,
        { expiresIn: '1h', algorithm: 'HS256' }
      );

      return res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/auth/logout', authenticateUser, async (req, res, next) => {
    try {
      if (req.auth && req.auth.jti) {
        const expiresAt = req.auth.exp
          ? new Date(req.auth.exp * 1000)
          : new Date(Date.now() + 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO revoked_tokens (jti, user_id, expires_at)
           VALUES ($1, $2, $3)
           ON CONFLICT (jti) DO NOTHING`,
          [req.auth.jti, req.user.id, expiresAt]
        );
        await pool.query(
          'DELETE FROM revoked_tokens WHERE expires_at < $1',
          [new Date()]
        );
      }

      return res.json({ message: 'Logged out successfully.' });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/me', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query(
        'SELECT id, email, role FROM users WHERE id = $1',
        [req.user.id]
      );
      if (!result.rowCount) {
        return res.status(401).json({ message: 'Authentication required.' });
      }
      res.json({ user: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerAuthRoutes, validateRegistration, validateLogin };

const REQUIRED_FIELDS = {
  firstName: 100,
  lastName: 100,
  phone: 50,
  location: 200,
  headline: 200
};

const OPTIONAL_TEXT_FIELDS = {
  company: 200,
  summary: 2000
};

const PROFILE_COLUMNS =
  'user_id AS "userId", first_name AS "firstName", last_name AS "lastName", phone, location, headline, company, summary, skills';

function validateProfile(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;

  const result = {};

  for (const [name, limit] of Object.entries(REQUIRED_FIELDS)) {
    if (typeof body[name] !== 'string') return null;
    const trimmed = body[name].trim();
    if (!trimmed || [...trimmed].length > limit) return null;
    result[name] = trimmed;
  }

  for (const [name, limit] of Object.entries(OPTIONAL_TEXT_FIELDS)) {
    const raw = body[name] === undefined ? '' : body[name];
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if ([...trimmed].length > limit) return null;
    result[name] = trimmed;
  }

  if (body.skills !== undefined) {
    if (!Array.isArray(body.skills) || body.skills.length > 30) return null;
    const skills = body.skills.map(skill => (typeof skill === 'string' ? skill.trim() : ''));
    if (skills.some(skill => !skill || [...skill].length > 50)) return null;
    const seen = new Set();
    result.skills = skills.filter(skill => {
      const key = skill.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } else {
    result.skills = [];
  }

  return result;
}

function registerProfileRoutes(app, pool, authenticateUser) {
  app.post('/api/profile', authenticateUser, async (req, res, next) => {
    const profile = validateProfile(req.body);
    if (!profile) {
      return res.status(400).json({
        message: 'All profile fields are required and must respect length limits.'
      });
    }

    try {
      const result = await pool.query(
        `INSERT INTO profiles (user_id, first_name, last_name, phone, location, headline, company, summary, skills)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING ${PROFILE_COLUMNS}`,
        [
          req.user.id,
          profile.firstName,
          profile.lastName,
          profile.phone,
          profile.location,
          profile.headline,
          profile.company,
          profile.summary,
          JSON.stringify(profile.skills)
        ]
      );
      res.status(201).json({ profile: result.rows[0] });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'Profile already exists.' });
      }
      next(error);
    }
  });

  app.get('/api/profile/me', authenticateUser, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT ${PROFILE_COLUMNS} FROM profiles WHERE user_id = $1`,
        [req.user.id]
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Profile not found.' });
      }
      res.json({ profile: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });

  app.put('/api/profile/me', authenticateUser, async (req, res, next) => {
    const profile = validateProfile(req.body);
    if (!profile) {
      return res.status(400).json({
        message: 'All profile fields are required and must respect length limits.'
      });
    }

    try {
      const result = await pool.query(
        `UPDATE profiles
         SET first_name = $2,
             last_name = $3,
             phone = $4,
             location = $5,
             headline = $6,
             company = $7,
             summary = $8,
             skills = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING ${PROFILE_COLUMNS}`,
        [
          req.user.id,
          profile.firstName,
          profile.lastName,
          profile.phone,
          profile.location,
          profile.headline,
          profile.company,
          profile.summary,
          JSON.stringify(profile.skills)
        ]
      );
      if (!result.rowCount) {
        return res.status(404).json({ message: 'Profile not found.' });
      }
      res.json({ profile: result.rows[0] });
    } catch (error) {
      next(error);
    }
  });
}

module.exports = { registerProfileRoutes, validateProfile };

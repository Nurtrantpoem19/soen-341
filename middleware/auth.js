const jwt = require('jsonwebtoken');

function createAuthenticateUser(pool) {
  return async function authenticateUser(req, res, next) {
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

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
      });
    } catch {
      return res.status(401).json({
        message: 'Invalid or expired authentication token.'
      });
    }

    if (!Number.isSafeInteger(decoded.userId) || decoded.userId < 1) {
      return res.status(401).json({
        message: 'Invalid authentication token.'
      });
    }

    if (typeof decoded.jti === 'string' && decoded.jti.length > 0) {
      try {
        const revoked = await pool.query(
          'SELECT 1 FROM revoked_tokens WHERE jti = $1',
          [decoded.jti]
        );
        if (revoked.rowCount > 0) {
          return res.status(401).json({
            message: 'Invalid or expired authentication token.'
          });
        }
      } catch (error) {
        return next(error);
      }
    }

    req.user = { id: decoded.userId };
    req.auth = {
      jti: typeof decoded.jti === 'string' ? decoded.jti : null,
      exp: Number.isFinite(decoded.exp) ? decoded.exp : null
    };
    next();
  };
}

module.exports = { createAuthenticateUser };

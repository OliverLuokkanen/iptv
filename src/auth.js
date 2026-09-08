const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const SALT_ROUNDS = 10;

function extractToken(req) {
  const authorization = req.get('authorization');

  if (authorization && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }

  return null;
}

async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function signToken(payload, jwtSecret) {
  return jwt.sign(payload, jwtSecret, { expiresIn: '12h' });
}

function authenticateRequest(jwtSecret) {
  return (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

module.exports = {
  authenticateRequest,
  extractToken,
  hashPassword,
  signToken,
  verifyPassword,
};

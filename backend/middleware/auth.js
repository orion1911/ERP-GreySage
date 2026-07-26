const jwt = require('jsonwebtoken');

// Fail fast rather than silently signing/verifying with a public default. The old
// `process.env.JWT_SECRET || 'your_jwt_secret'` fallback meant a deploy that simply
// forgot the env var would boot happily and issue forgeable tokens.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Refusing to start — set it in the environment ' +
    '(Vercel project settings / .env) before running the API.'
  );
}

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      // An EXPIRED access token must return 401 so the client's axios interceptor runs
      // the silent refresh (swapping the 15m access token for a new one) and keeps the
      // session alive for the full refresh-token window. Returning 403 here bypasses the
      // refresh path and logs the user out after one access-token lifetime.
      if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired' });
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

// Convenience: authenticate AND require admin, in one middleware.
const requireAdmin = [authenticateToken, restrictTo('admin')];

module.exports = { authenticateToken, restrictTo, requireAdmin, JWT_SECRET };

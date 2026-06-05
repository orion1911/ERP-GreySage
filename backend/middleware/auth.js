const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, user) => {
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
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticateToken, restrictTo };
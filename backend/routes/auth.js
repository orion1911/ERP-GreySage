const express = require('express');
const router = express.Router();
const { register, login, refresh, logout } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { User } = require('../mongodb_schema');
const {
  loginIpLimiter,
  loginEmailLimiter,
  refreshLimiter,
  registerLimiter,
} = require('../middleware/rateLimit');

/**
 * Account creation is an ADMIN action, with exactly one exception: a brand-new,
 * empty database needs a way to create its first administrator. So:
 *
 *   • User collection empty  → allow through, flagged as bootstrap (controller
 *                              forces role 'admin' and ignores the body's role).
 *   • Otherwise              → require a valid JWT belonging to an admin.
 *
 * This closes the hole where an anonymous POST (or the public /register page's
 * Role dropdown) could mint an admin account on a live system.
 */
const allowBootstrapOrAdmin = async (req, res, next) => {
  const anyUser = await User.exists({});
  if (!anyUser) {
    req.isBootstrap = true;
    return next();
  }
  // authenticateToken responds itself on failure; the callback only runs on success.
  authenticateToken(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only an administrator can create user accounts' });
    }
    next();
  });
};

router.post('/register', registerLimiter, allowBootstrapOrAdmin, register);
router.post('/login', loginIpLimiter, loginEmailLimiter, login);
router.post('/refresh', refreshLimiter, refresh);
router.post('/logout', logout);

module.exports = router;

// ─── Rate limiting (Upstash Redis, serverless-safe) ──────────────────────────
// In-memory limiters (express-rate-limit's default store) are useless on Vercel:
// every invocation may be a fresh isolate, so the counter resets constantly and an
// attacker just keeps hitting cold instances. We reuse the Upstash REST client —
// stateless HTTP, no connection pool — so the counter is shared across every
// invocation. Same reasoning as services/cache.js.
//
// FAIL-OPEN: if Redis is unreachable we let the request through rather than locking
// the app out. That does mean brute-force protection degrades when Upstash is down;
// the tradeoff is deliberate (availability of an internal ERP over a rare window of
// weaker throttling). Flip `FAIL_CLOSED` below if you'd rather 503 than allow.
const { Redis } = require('@upstash/redis');

const FAIL_CLOSED = false;

let client = null;
let initFailed = false;

// Unlike the cache, rate limiting is wanted in EVERY environment that has Upstash
// credentials — including local dev — so this deliberately does not check NODE_ENV.
const getClient = () => {
  if (client) return client;
  if (initFailed) return null;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[ratelimit] Upstash not configured — rate limiting is DISABLED');
    initFailed = true;
    return null;
  }
  try {
    client = Redis.fromEnv();
    return client;
  } catch (err) {
    console.warn('[ratelimit] init failed, running without limits:', err.message);
    initFailed = true;
    return null;
  }
};

// Vercel puts the real client IP first in x-forwarded-for. req.ip is the proxy.
const clientIp = (req) => {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || 'unknown';
};

/**
 * Fixed-window limiter.
 * @param {Object} opts
 * @param {string} opts.name        bucket name, namespaces the Redis key
 * @param {number} opts.max         allowed requests per window
 * @param {number} opts.windowSec   window length in seconds
 * @param {(req)=>string} [opts.keyBy]  extra discriminator (e.g. login email).
 *                                      Return '' to skip this limiter for the request.
 */
const rateLimit = ({ name, max, windowSec, keyBy }) => async (req, res, next) => {
  const redis = getClient();
  if (!redis) {
    if (FAIL_CLOSED) return res.status(503).json({ error: 'Rate limiter unavailable' });
    return next();
  }

  const discriminator = keyBy ? keyBy(req) : clientIp(req);
  if (!discriminator) return next(); // nothing to key on — don't guess

  const key = `rl:${name}:${discriminator}`;
  try {
    const hits = await redis.incr(key);
    // Only the request that created the key sets the TTL, so the window is fixed
    // (it does not slide forward with every hit — that would never expire).
    if (hits === 1) await redis.expire(key, windowSec);
    if (hits > max) {
      res.set('Retry-After', String(windowSec));
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
    }
  } catch (err) {
    console.warn(`[ratelimit] ${name} check failed:`, err.message);
    if (FAIL_CLOSED) return res.status(503).json({ error: 'Rate limiter unavailable' });
  }
  next();
};

// ─── Preconfigured buckets ───────────────────────────────────────────────────
// Login is limited twice: by IP (one attacker, many accounts) and by email
// (many IPs, one account — credential stuffing). Both must pass.
const loginIpLimiter = rateLimit({ name: 'login-ip', max: 20, windowSec: 900 });
const loginEmailLimiter = rateLimit({
  name: 'login-email',
  max: 10,
  windowSec: 900,
  keyBy: (req) => String(req.body?.email || '').trim().toLowerCase(),
});

// Refresh is legitimately frequent (every ~15m per open tab) but not THIS frequent.
const refreshLimiter = rateLimit({ name: 'refresh', max: 60, windowSec: 900 });

// Account creation is an admin action — a handful a month, not a minute.
const registerLimiter = rateLimit({ name: 'register', max: 10, windowSec: 3600 });

// The public contact form. Anonymous + sends mail on our Brevo quota, so keep it tight.
const contactLimiter = rateLimit({ name: 'contact', max: 5, windowSec: 3600 });

module.exports = {
  rateLimit,
  loginIpLimiter,
  loginEmailLimiter,
  refreshLimiter,
  registerLimiter,
  contactLimiter,
};

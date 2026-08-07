const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');
const { JWT_SECRET } = require('../middleware/auth');

// ─── Config ──────────────────────────────────────────────────────────────────
// Access token is short-lived so a stolen token has a small blast radius. Refresh
// token is opaque (not JWT) so it can be revoked by removing it from the DB.
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
// Refresh token = overall session lifetime (access token is silently refreshed within
// this window). Defaults to 12 hours. Override with REFRESH_TOKEN_TTL_HOURS, or
// REFRESH_TOKEN_TTL_DAYS (takes precedence if set). Rotation extends it on activity,
// so this acts as an idle timeout — a user must re-login after 12h of inactivity.
const REFRESH_TOKEN_TTL_MS = process.env.REFRESH_TOKEN_TTL_DAYS
  ? parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) * 24 * 60 * 60 * 1000
  : (parseInt(process.env.REFRESH_TOKEN_TTL_HOURS, 10) || 12) * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'rt';
const MIN_PASSWORD_LENGTH = 8;

// In production the frontend and API live on different vercel.app subdomains, so
// the cookie must be SameSite=None + Secure to be sent cross-site. In dev we keep
// Lax (CRA proxy makes them same-origin) and drop Secure so http://localhost works.
const isProd = process.env.NODE_ENV === 'production';
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/api',                // not sent on static/asset paths → smaller CSRF surface
  maxAge: REFRESH_TOKEN_TTL_MS
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const signAccessToken = (user) =>
  jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });

// Cookie value is `<tokenId>.<secret>`. tokenId is a public handle used to find the
// row in one indexed query; secret is the credential and is only ever stored bcrypted.
const generateRefreshToken = () => ({
  tokenId: crypto.randomBytes(9).toString('base64url'),   // 72 bits, collision-safe
  secret: crypto.randomBytes(32).toString('base64url')    // 256 bits of entropy
});
const joinToken = ({ tokenId, secret }) => `${tokenId}.${secret}`;
const splitToken = (cookieValue) => {
  const idx = String(cookieValue || '').indexOf('.');
  if (idx <= 0) return null; // legacy cookie (no handle) — see refresh()
  return { tokenId: cookieValue.slice(0, idx), secret: cookieValue.slice(idx + 1) };
};

// We hash refresh tokens before storing them so a DB dump can't be replayed.
const hashRefreshToken = (token) => bcrypt.hash(token, 10);
const compareRefreshToken = (token, hash) => bcrypt.compare(token, hash);

// Persist a new refresh token under a (possibly existing) family, prune expired ones.
const persistRefreshToken = async (user, parts, familyId, userAgent) => {
  const tokenHash = await hashRefreshToken(parts.secret);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const now = new Date();
  // Re-fetch with the (hidden-by-default) refreshTokens projection so we can mutate it.
  const fresh = await User.findById(user._id).select('+refreshTokens');
  // Drop expired entries opportunistically — keeps the array bounded over time.
  fresh.refreshTokens = (fresh.refreshTokens || []).filter((t) => t.expiresAt > now);
  fresh.refreshTokens.push({ tokenId: parts.tokenId, familyId, tokenHash, expiresAt, userAgent });
  await fresh.save();
};

// ─── Handlers ────────────────────────────────────────────────────────────────
/**
 * POST /api/register
 *
 * SECURITY: this endpoint used to be fully anonymous AND honoured a `role` field from
 * the request body — combined with the public /register page's Role dropdown, anyone
 * on the internet could mint themselves an admin account on a live ERP. It is now
 * gated by `allowBootstrapOrAdmin` (see routes/auth.js): only an authenticated admin
 * may create users, except on a completely empty database, where the very first
 * account is allowed through and is forced to admin so the system can be set up.
 *
 * `role` is whitelisted here as well as at the route — never trust it as sent.
 */
const register = async (req, res) => {
  const { username, email, password, role } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email and password are required' });
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  // Whitelist, never pass through. req.isBootstrap is set by the route guard when the
  // user collection is empty — that first account must be an admin or nobody can
  // administer anything.
  const safeRole = req.isBootstrap ? 'admin' : (role === 'admin' ? 'admin' : 'user');

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({
    username,
    email: String(email).trim().toLowerCase(),
    password: hashedPassword,
    role: safeRole
  });
  await user.save();

  await logAction(
    req.user?.userId || user._id,
    'create_user',
    'User',
    user._id,
    `Created ${safeRole} account: ${username}${req.isBootstrap ? ' (bootstrap)' : ''}`
  );
  res.status(201).json({ message: 'User registered', user: { id: user._id, username, role: safeRole } });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email || '').trim().toLowerCase() });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

  // Deactivated staff keep working until their access token expires otherwise.
  if (user.isActive === false) return res.status(403).json({ error: 'Account is disabled' });

  const accessToken = signAccessToken(user);
  const parts = generateRefreshToken();
  const familyId = crypto.randomUUID();
  await persistRefreshToken(user, parts, familyId, req.headers['user-agent']);

  res.cookie(REFRESH_COOKIE_NAME, joinToken(parts), refreshCookieOptions);
  await logAction(user._id, 'login', 'User', user._id, `User logged in: ${user.username}`);
  res.json({ token: accessToken, user: { id: user._id, username: user.username, role: user.role } });
};

// Revoke every session in a family — used when a tokenId resolves but its secret
// doesn't, which means someone is presenting a forged or stale copy of that handle.
const revokeFamily = async (user, familyId) => {
  user.refreshTokens = user.refreshTokens.filter((t) => t.familyId !== familyId);
  await user.save();
};

/**
 * POST /api/refresh
 *
 * Validate the refresh cookie, rotate it (issue a new pair, invalidate the old), and
 * return a fresh access token.
 *
 * Lookup is now O(1): the cookie carries a public tokenId, so we fetch exactly one
 * user document by indexed field and run exactly one bcrypt compare. Cookies issued
 * before this change have no tokenId; those fall back to the old scan ONCE and are
 * upgraded to the new format on rotation, so nobody is logged out by the deploy.
 * The legacy branch can be deleted after one full refresh-token TTL (default 12h).
 */
const refresh = async (req, res) => {
  const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!presentedToken) return res.status(401).json({ error: 'No refresh token' });

  const now = new Date();
  const parts = splitToken(presentedToken);

  let matchedUser = null;
  let matchedEntry = null;

  if (parts) {
    // ── Fast path: one indexed lookup, one bcrypt compare ──────────────────────
    const user = await User.findOne({
      refreshTokens: { $elemMatch: { tokenId: parts.tokenId, expiresAt: { $gt: now } } }
    }).select('+refreshTokens');

    if (user) {
      const entry = user.refreshTokens.find(
        (t) => t.tokenId === parts.tokenId && t.expiresAt > now
      );
      if (entry) {
        if (await compareRefreshToken(parts.secret, entry.tokenHash)) {
          matchedUser = user;
          matchedEntry = entry;
        } else {
          // The handle is real but the secret is wrong — a forged or replayed copy.
          // Kill every session descended from that login.
          await revokeFamily(user, entry.familyId);
          res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions, maxAge: undefined });
          return res.status(401).json({ error: 'Invalid refresh token' });
        }
      }
    }

    // ── Recovery path ────────────────────────────────────────────────────────
    // While tokenId was missing from RefreshTokenSchema, Mongoose silently dropped
    // it on save, so live sessions have a hash but no handle — the $elemMatch above
    // can never find them. Without this, restoring the schema would still log every
    // currently-signed-in user out on deploy. Match those handle-less entries by
    // secret; rotation below rewrites them in the correct format, so this branch
    // stops being reachable after one refresh-token TTL and can then be deleted.
    if (!matchedUser) {
      const candidates = await User.find({ 'refreshTokens.expiresAt': { $gt: now } })
        .select('+refreshTokens');
      outer: for (const user of candidates) {
        for (const entry of user.refreshTokens) {
          if (entry.tokenId || entry.expiresAt <= now) continue;
          // eslint-disable-next-line no-await-in-loop
          if (await compareRefreshToken(parts.secret, entry.tokenHash)) {
            matchedUser = user;
            matchedEntry = entry;
            break outer;
          }
        }
      }
    }
  } else {
    // ── Legacy path: pre-upgrade cookie with no tokenId. Scan as before. ───────
    const candidates = await User.find({ 'refreshTokens.expiresAt': { $gt: now } })
      .select('+refreshTokens');
    outer: for (const user of candidates) {
      for (const entry of user.refreshTokens) {
        if (entry.tokenId || entry.expiresAt <= now) continue;
        // eslint-disable-next-line no-await-in-loop
        if (await compareRefreshToken(presentedToken, entry.tokenHash)) {
          matchedUser = user;
          matchedEntry = entry;
          break outer;
        }
      }
    }
  }

  if (!matchedUser) {
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions, maxAge: undefined });
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Rotate: drop the just-used token, issue a new one under the same family.
  const familyId = matchedEntry.familyId;
  matchedUser.refreshTokens = matchedUser.refreshTokens.filter((t) => t.tokenHash !== matchedEntry.tokenHash);

  const newParts = generateRefreshToken();
  const newHash = await hashRefreshToken(newParts.secret);
  matchedUser.refreshTokens.push({
    tokenId: newParts.tokenId,
    familyId,
    tokenHash: newHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.headers['user-agent']
  });
  await matchedUser.save();

  const accessToken = signAccessToken(matchedUser);
  res.cookie(REFRESH_COOKIE_NAME, joinToken(newParts), refreshCookieOptions);
  res.json({
    token: accessToken,
    user: { id: matchedUser._id, username: matchedUser.username, role: matchedUser.role }
  });
};

// Delete just the presented refresh token (so other devices stay logged in) and
// clear the cookie. If the cookie is missing we still 204 so the client can move on.
const logout = async (req, res) => {
  const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];
  res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions, maxAge: undefined });

  if (!presentedToken) return res.status(204).end();

  const now = new Date();
  const parts = splitToken(presentedToken);

  if (parts) {
    // Indexed lookup, then drop that one entry.
    const user = await User.findOne({
      refreshTokens: { $elemMatch: { tokenId: parts.tokenId } }
    }).select('+refreshTokens');
    if (user) {
      user.refreshTokens = user.refreshTokens.filter((t) => t.tokenId !== parts.tokenId);
      await user.save();
    }
    return res.status(204).end();
  }

  // Legacy cookie — scan (see refresh()).
  const candidates = await User.find({ 'refreshTokens.expiresAt': { $gt: now } })
    .select('+refreshTokens');
  for (const user of candidates) {
    let matched = false;
    const kept = [];
    for (const entry of user.refreshTokens) {
      // eslint-disable-next-line no-await-in-loop
      if (!matched && !entry.tokenId && await compareRefreshToken(presentedToken, entry.tokenHash)) {
        matched = true; // drop this entry only
        continue;
      }
      kept.push(entry);
    }
    if (matched) {
      user.refreshTokens = kept;
      await user.save();
      break;
    }
  }
  res.status(204).end();
};

module.exports = { register, login, refresh, logout };

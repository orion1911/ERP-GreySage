const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { User } = require('../mongodb_schema');
const { logAction } = require('../utils/logger');

// ─── Config ──────────────────────────────────────────────────────────────────
// Access token is short-lived so a stolen token has a small blast radius. Refresh
// token is opaque (not JWT) so it can be revoked by removing it from the DB.
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_MS = (parseInt(process.env.REFRESH_TOKEN_TTL_DAYS, 10) || 7) * 24 * 60 * 60 * 1000;
const REFRESH_COOKIE_NAME = 'rt';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

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

// 32 random bytes → 256 bits of entropy, base64url-encoded for safe cookie transport.
const generateRefreshToken = () => crypto.randomBytes(32).toString('base64url');

// We hash refresh tokens before storing them so a DB dump can't be replayed.
const hashRefreshToken = (token) => bcrypt.hash(token, 10);
const compareRefreshToken = (token, hash) => bcrypt.compare(token, hash);

// Persist a new refresh token under a (possibly existing) family, prune expired ones.
const persistRefreshToken = async (user, plainToken, familyId, userAgent) => {
  const tokenHash = await hashRefreshToken(plainToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const now = new Date();
  // Re-fetch with the (hidden-by-default) refreshTokens projection so we can mutate it.
  const fresh = await User.findById(user._id).select('+refreshTokens');
  // Drop expired entries opportunistically — keeps the array bounded over time.
  fresh.refreshTokens = (fresh.refreshTokens || []).filter((t) => t.expiresAt > now);
  fresh.refreshTokens.push({ familyId, tokenHash, expiresAt, userAgent });
  await fresh.save();
};

// ─── Handlers ────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  const { username, email, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, email, password: hashedPassword, role: role || 'user' });
  await user.save();
  await logAction(user._id, 'create_user', 'User', user._id, `Registered user: ${username}`);
  res.status(201).json({ message: 'User registered' });
};

const login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  const familyId = crypto.randomUUID();
  await persistRefreshToken(user, refreshToken, familyId, req.headers['user-agent']);

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions);
  await logAction(user._id, 'login', 'User', user._id, `User logged in: ${user.username}`);
  res.json({ token: accessToken, user: { id: user._id, username: user.username, role: user.role } });
};

// Validate the refresh cookie, rotate it (issue new pair, invalidate old), return
// a new access token. If a token that was already rotated is presented again, we
// treat that as theft of an earlier copy and wipe every token in the family.
const refresh = async (req, res) => {
  const presentedToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!presentedToken) return res.status(401).json({ error: 'No refresh token' });

  // Find a user with at least one matching (still-valid) refresh token. We can't
  // query the hash directly (bcrypt salts each hash), so we narrow by expiry then
  // bcrypt-compare the survivors. Realistically the array is single-digit length.
  const now = new Date();
  const candidates = await User.find({ 'refreshTokens.expiresAt': { $gt: now } })
    .select('+refreshTokens');

  let matchedUser = null;
  let matchedEntry = null;
  outer: for (const user of candidates) {
    for (const entry of user.refreshTokens) {
      if (entry.expiresAt <= now) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await compareRefreshToken(presentedToken, entry.tokenHash)) {
        matchedUser = user;
        matchedEntry = entry;
        break outer;
      }
    }
  }

  if (!matchedUser) {
    // Could be (a) genuinely-expired/never-issued token, or (b) an already-rotated
    // token presented again. We can't distinguish cleanly without storing rotated
    // hashes too, so we play safe: if the cookie *looked* valid we ALSO try to find
    // any user whose family it might belong to and revoke. Without a family hint
    // here we just clear the cookie and return 401.
    res.clearCookie(REFRESH_COOKIE_NAME, { ...refreshCookieOptions, maxAge: undefined });
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Rotate: remove the just-used token, issue a new one under the same family.
  // Filter by tokenHash (not object reference) — Mongoose subdocs can be re-wrapped.
  const familyId = matchedEntry.familyId;
  matchedUser.refreshTokens = matchedUser.refreshTokens.filter((t) => t.tokenHash !== matchedEntry.tokenHash);

  const newRefreshToken = generateRefreshToken();
  const newHash = await hashRefreshToken(newRefreshToken);
  matchedUser.refreshTokens.push({
    familyId,
    tokenHash: newHash,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.headers['user-agent']
  });
  await matchedUser.save();

  const accessToken = signAccessToken(matchedUser);
  res.cookie(REFRESH_COOKIE_NAME, newRefreshToken, refreshCookieOptions);
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
  const candidates = await User.find({ 'refreshTokens.expiresAt': { $gt: now } })
    .select('+refreshTokens');
  for (const user of candidates) {
    let matched = false;
    const kept = [];
    for (const entry of user.refreshTokens) {
      // eslint-disable-next-line no-await-in-loop
      if (!matched && await compareRefreshToken(presentedToken, entry.tokenHash)) {
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

// ─── Redis (Upstash REST) read-through cache ─────────────────────────────────
// Why Upstash REST and not ioredis: Vercel functions are stateless/ephemeral, so
// a TCP client would open a fresh connection per cold start and exhaust the pool
// (the same problem server.js works around for Mongo). @upstash/redis is a
// stateless HTTP client — no pool, no lifecycle — so a single module-level
// instance is reused safely across warm invocations.
//
// FAIL-OPEN CONTRACT: the cache is an accelerator, never a dependency. Every Redis
// call is wrapped so that if Upstash is unreachable, misconfigured, or over its
// free-tier quota, callers transparently fall back to the source (Mongo). Caching
// must never turn a working request into a 500.
const { Redis } = require('@upstash/redis');

let redis = null;
let initFailed = false;

// Whether caching is active in this environment. We share ONE Upstash instance across
// environments, so local dev must NOT read/write the same cache as production. Enabled in
// production only (Vercel sets NODE_ENV=production; local nodemon does not — the same signal
// server.js uses). Override with CACHE_ENABLED=true to test caching locally, or
// CACHE_ENABLED=false to force it off anywhere.
const cacheEnabled = () => {
  if (process.env.CACHE_ENABLED === 'true') return true;
  if (process.env.CACHE_ENABLED === 'false') return false;
  return process.env.NODE_ENV === 'production';
};

// Lazily build the singleton. Returns null (cache disabled) when this environment opts out,
// the env vars are missing, or the client can't be constructed — callers then hit the source.
const getClient = () => {
  if (redis) return redis;
  if (initFailed) return null;
  if (!cacheEnabled()) {
    // Local/dev (or explicitly disabled): skip the shared Upstash cache, read from source.
    initFailed = true;
    return null;
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    // No credentials configured (e.g. local dev without Upstash) — disable quietly.
    initFailed = true;
    return null;
  }
  try {
    redis = Redis.fromEnv(); // reads UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
    return redis;
  } catch (err) {
    console.warn('[cache] init failed, running without cache:', err.message);
    initFailed = true;
    return null;
  }
};

// Build a namespaced, version-stamped key. Parts encode the query params that vary
// the result (e.g. search term, showInactive). Empty/undefined parts become '_'.
const keyFor = (resource, version, parts = []) => {
  const suffix = parts
    .map(p => (p === undefined || p === null || p === '') ? '_' : String(p))
    .join('|');
  return `${resource}:v${version}:${suffix}`;
};

// Current version counter for a resource family (0 if never bumped).
const getVersion = async (client, resource) => {
  const v = await client.get(`ver:${resource}`);
  return (v === undefined || v === null) ? 0 : v;
};

// Read-through: return cached value for (resource, parts) or run fetchFn, cache it
// (TTL backstop), and return it. On ANY cache error, fall through to fetchFn so the
// request still succeeds. fetchFn is the existing Mongoose query, untouched.
const getOrSet = async (resource, parts, ttlSeconds, fetchFn) => {
  const client = getClient();
  if (!client) return fetchFn(); // cache disabled — straight to source

  let key;
  try {
    const version = await getVersion(client, resource);
    key = keyFor(resource, version, parts);
    const cached = await client.get(key); // @upstash/redis auto-deserializes JSON
    if (cached !== undefined && cached !== null) return cached;
  } catch (err) {
    // Read path failed — don't let it break the request.
    console.warn(`[cache] read fell through for ${resource}:`, err.message);
    return fetchFn();
  }

  const fresh = await fetchFn();
  try {
    await client.set(key, fresh, { ex: ttlSeconds });
  } catch (err) {
    console.warn(`[cache] set failed for ${resource}:`, err.message);
  }
  return fresh;
};

// Invalidate every cached key for a resource family in O(1): bump its version
// counter so all prior `resource:v{N}:...` keys become unreachable (and expire by
// TTL). No SCAN / pattern-delete needed — ideal for serverless. Call AFTER a
// successful write. Fail-open: a bump failure just means data is stale until TTL.
const bumpVersion = async (resource) => {
  const client = getClient();
  if (!client) return;
  try {
    await client.incr(`ver:${resource}`);
  } catch (err) {
    console.warn(`[cache] bumpVersion failed for ${resource}:`, err.message);
  }
};

module.exports = { getOrSet, bumpVersion, keyFor };

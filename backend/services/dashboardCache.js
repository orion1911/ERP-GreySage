// ─── Dashboard cache invalidation ────────────────────────────────────────────
// The dashboard aggregations read from Lot, Stitching, Washing, Finishing and the
// Lot dispatch caches (invoicedPcs / damagedPcs / manualDispatchedPcs). Any write to
// those can move a dashboard number, so precise per-key invalidation isn't worth it:
// one O(1) version bump of the whole 'dashboard' namespace after each such write is
// cheap (a single Redis INCR) and correct. The TTL in services/cache.js remains as a
// backstop for writes that bypass controllers (migrations, manual mongosh edits).
//
// Fire-and-mostly-forget: bumpVersion is already fail-open, so callers can await this
// without wrapping — a failed bump just means stale-until-TTL, never a 500.
const { bumpVersion } = require('./cache');

const invalidateDashboard = () => bumpVersion('dashboard');

module.exports = { invalidateDashboard };

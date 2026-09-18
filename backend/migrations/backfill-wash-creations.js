// Backfill for the Wash-Creation + Costing rollout.
//
//   1. Creates one WashCreation per distinct legacy washDetails.washCreation
//      free-text string (skipping 'NA' / blank), so the catalog starts from the
//      data that already exists.
//   2. Sets upliftPercent = 12 on every WashingVendor missing it (schema default
//      only applies to NEW documents — existing vendors need the field written).
//
// Idempotent: safe to run repeatedly (upserts + $exists guards).
// No rate-card backfill — historic per-vendor rates are unknowable; enter them
// via Washing Vendors > Rates before the next washing entry.
//
// Run from backend/ (pass the URI as an argument, or set MONGO_URI):
//   node migrations/backfill-wash-creations.js "mongodb://.../db?..."
//   node migrations/backfill-wash-creations.js           (uses process.env.MONGO_URI)

const mongoose = require('mongoose');
const { WashCreation, WashingVendor, Washing } = require('../mongodb_schema');

const SKIP = new Set(['', 'NA', 'N/A', 'NIL', 'NONE', '-']);

(async () => {
  const uri = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : process.env.MONGO_URI;
  if (!uri) {
    console.error('No MONGO_URI. Pass it as an argument or set the env var.');
    process.exit(1);
  }
  // Mask credentials in any logged connection string.
  console.log(`Connecting to ${uri.replace(/\/\/([^:]+):[^@]+@/, '//$1:****@')} ...`);
  await mongoose.connect(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 10000 });

  try {
    // ── 1. Seed the catalog from legacy free-text creations ──────────────
    const names = await Washing.aggregate([
      { $unwind: '$washDetails' },
      { $group: { _id: { $toUpper: { $trim: { input: '$washDetails.washCreation' } } } } },
      { $project: { _id: 1 } },
    ]);

    let created = 0, existing = 0, skipped = 0, order = 0;
    const last = await WashCreation.findOne().sort({ sortOrder: -1 }).select('sortOrder');
    order = (last?.sortOrder ?? -1) + 1;

    for (const { _id } of names) {
      if (!_id || SKIP.has(_id)) { skipped++; continue; }
      const res = await WashCreation.updateOne(
        { name: _id },
        { $setOnInsert: { name: _id, isActive: true, sortOrder: order++ } },
        { upsert: true }
      );
      if (res.upsertedId) created++; else existing++;
    }
    console.log(`WashCreation: ${created} created, ${existing} already present, ${skipped} skipped (blank/NA).`);

    // ── 2. Default the washing-vendor uplift to 12 where missing ─────────
    const res2 = await WashingVendor.updateMany(
      { upliftPercent: { $exists: false } },
      { $set: { upliftPercent: 12 } }
    );
    console.log(`WashingVendor: upliftPercent=12 set on ${res2.modifiedCount} vendor(s).`);

    console.log('Backfill complete.');
  } catch (err) {
    console.error('Backfill failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
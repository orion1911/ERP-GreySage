#!/usr/bin/env node
/**
 * ensure-indexes.js — build every index declared in mongodb_schema.js.
 *
 * WHY THIS EXISTS
 * server.js connects with `autoIndex: false` (deliberately — rebuilding indexes on
 * every serverless cold start hammers an Atlas M0). The side effect is that the 40+
 * `Schema.index(...)` declarations in mongodb_schema.js are NEVER applied
 * automatically in production. If nobody has run this, those indexes may simply not
 * exist, and the dashboard aggregations are doing full collection scans.
 *
 * Run it after any schema change that adds or alters an index, and once now to
 * verify the current state.
 *
 *   node backend/scripts/ensure-indexes.js                 # uses MONGO_URI
 *   node backend/scripts/ensure-indexes.js "<mongo-uri>"   # explicit target
 *   node backend/scripts/ensure-indexes.js --dry-run       # report only, change nothing
 *
 * CAUTION: syncIndexes() DROPS indexes that exist in the database but are no longer
 * declared in the schema. --dry-run first if you have hand-built indexes you want to
 * keep; add them to the schema before running for real.
 */
const mongoose = require('mongoose');
const models = require('../mongodb_schema');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const uri = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;

// Never print credentials, even on error.
const maskUri = (u) => String(u || '').replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

const main = async () => {
  if (!uri) {
    console.error('No connection string. Pass one as an argument or set MONGO_URI.');
    process.exit(1);
  }

  console.log(`Connecting to ${maskUri(uri)}`);
  // autoIndex on here — building indexes is the entire point of this script.
  await mongoose.connect(uri, { maxPoolSize: 3, serverSelectionTimeoutMS: 10000 });
  console.log(`Connected. Database: ${mongoose.connection.name}`);
  console.log(dryRun ? 'DRY RUN — no changes will be made.\n' : '');

  const entries = Object.entries(models).filter(([, m]) => m && typeof m.syncIndexes === 'function');
  let created = 0;
  let dropped = 0;

  for (const [name, Model] of entries) {
    try {
      if (dryRun) {
        const existing = await Model.collection.indexes().catch(() => []);
        const declared = Model.schema.indexes();
        console.log(
          `${name.padEnd(28)} declared=${String(declared.length + 1).padEnd(3)} ` +
          `inDb=${existing.length}`
        );
        continue;
      }
      // syncIndexes returns the names of indexes it dropped.
      const removed = await Model.syncIndexes();
      const now = await Model.collection.indexes();
      created += now.length;
      dropped += removed.length;
      const note = removed.length ? `  (dropped: ${removed.join(', ')})` : '';
      console.log(`${name.padEnd(28)} ok — ${now.length} index(es)${note}`);
    } catch (err) {
      console.error(`${name.padEnd(28)} FAILED — ${err.message}`);
    }
  }

  console.log(
    dryRun
      ? '\nDry run complete.'
      : `\nDone. ${entries.length} collections, ${created} indexes present, ${dropped} dropped.`
  );
  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error('ensure-indexes failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

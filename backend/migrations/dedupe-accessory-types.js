// One-time cleanup: remove duplicate AccessoryType rows left by an early double-seed
// (autoIndex:false meant the unique `key` index wasn't enforced). Keeps the earliest
// _id per key, then builds the unique index so it can never recur.
//
// Run from backend/:   node migrations/dedupe-accessory-types.js
//   • uses process.env.MONGO_URI, or pass the URI as the first arg:
//     node migrations/dedupe-accessory-types.js "mongodb://.../sales_accounting?replicaSet=rs0&authSource=admin"

const mongoose = require('mongoose');
const { AccessoryType } = require('../mongodb_schema');

const MONGO_URI = process.argv[2] || process.env.MONGO_URI;

(async () => {
  if (!MONGO_URI) {
    console.error('No MONGO_URI. Pass it as an argument or set the env var.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  const before = await AccessoryType.countDocuments();
  const dupes = await AccessoryType.aggregate([
    { $group: { _id: '$key', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } }
  ]);

  let removed = 0;
  for (const d of dupes) {
    const ids = [...d.ids].sort((a, b) => String(a).localeCompare(String(b)));
    const toDelete = ids.slice(1); // keep the first
    const res = await AccessoryType.deleteMany({ _id: { $in: toDelete } });
    removed += res.deletedCount || 0;
    console.log(`  key "${d._id}": removed ${res.deletedCount} duplicate(s)`);
  }

  try {
    await AccessoryType.collection.createIndex({ key: 1 }, { unique: true });
    console.log('Unique index on { key } ensured.');
  } catch (e) {
    console.warn('Could not create unique index:', e.message);
  }

  const after = await AccessoryType.countDocuments();
  console.log(`Done. ${before} → ${after} types (${removed} removed).`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(err => { console.error(err); process.exit(1); });

// One-time init for the Cutting Book module. Two jobs:
//
// 1. Lot.invoiceNumber index: was `unique` (non-sparse). Cutting-sheet lots are created at
//    status 1 WITHOUT a maker invoice, and a non-sparse unique index treats every missing
//    value as the same key — the SECOND cut lot would fail with a duplicate-key error.
//    Drops the old index and creates `{ invoiceNumber: 1 } unique sparse` to match the
//    schema. (Remember: production runs autoIndex:false, so the schema change alone does
//    NOT touch the database — this script is the only thing that will.)
//
// 2. Seeds the WaistSize catalog: even sizes 26–42, with 28–36 flagged default
//    (pre-selected as the columns of a new cutting sheet).
//
// Also creates the new CuttingSheet / FabricLeftover / CuttingMaster indexes, since
// ensure-indexes.js may not have been run.
//
// Idempotent: safe to re-run. Run from backend/:  node migrations/cutting-book-init.js
//   • uses process.env.MONGO_URI, or pass the URI as the first arg
//   • add --dry to report without writing

const mongoose = require('mongoose');
const { Lot, WaistSize, CuttingSheet, FabricLeftover, CuttingMaster } = require('../mongodb_schema');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;

(async () => {
  if (!MONGO_URI) {
    console.error('No Mongo URI. Set MONGO_URI or pass it as the first argument.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  console.log(`Connected. ${DRY ? '(DRY RUN — no writes)' : ''}`);

  // ── 1. invoiceNumber → sparse unique ────────────────────────────────────────────────────
  const lotIndexes = await Lot.collection.indexes();
  const invIdx = lotIndexes.find((ix) => ix.key && ix.key.invoiceNumber === 1 && Object.keys(ix.key).length === 1);
  if (invIdx && !invIdx.sparse) {
    console.log(`Dropping non-sparse index "${invIdx.name}" on Lot.invoiceNumber…`);
    if (!DRY) await Lot.collection.dropIndex(invIdx.name);
  } else if (invIdx) {
    console.log('Lot.invoiceNumber index is already sparse — nothing to drop.');
  } else {
    console.log('No standalone Lot.invoiceNumber index found — will create the sparse one.');
  }
  if (!DRY && (!invIdx || !invIdx.sparse)) {
    await Lot.collection.createIndex({ invoiceNumber: 1 }, { unique: true, sparse: true, name: 'invoiceNumber_1' });
    console.log('Created { invoiceNumber: 1 } unique sparse.');
  }

  // ── 2. Seed WaistSize 26–42 (28–36 default) ─────────────────────────────────────────────
  let seeded = 0;
  for (let size = 26; size <= 42; size += 2) {
    const isDefault = size >= 28 && size <= 36;
    const existing = await WaistSize.findOne({ size });
    if (existing) continue;
    if (!DRY) await WaistSize.create({ size, isDefault });
    seeded++;
  }
  console.log(`WaistSize: seeded ${seeded} new size(s) (existing rows untouched).`);

  // ── 3. New collections' indexes (autoIndex is off in production) ────────────────────────
  if (!DRY) {
    await CuttingSheet.collection.createIndex({ lotId: 1 }, { unique: true });
    await CuttingSheet.collection.createIndex({ series: 1, createdAt: -1 });
    await CuttingSheet.collection.createIndex({ date: -1 });
    await FabricLeftover.collection.createIndex({ status: 1, fabric: 1 });
    await FabricLeftover.collection.createIndex({ fromSheetId: 1 });
    await CuttingMaster.collection.createIndex({ name: 1 }, { unique: true });
    await WaistSize.collection.createIndex({ size: 1 }, { unique: true });
    console.log('Cutting Book indexes ensured.');
  }

  await mongoose.disconnect();
  console.log('Done.');
})().catch(async (err) => {
  console.error('Migration failed:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});

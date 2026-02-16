/**
 * Migration: Copy Order fields to Lots + Generate lotId for existing records
 *
 * WHAT THIS DOES:
 *   1. For every Lot that still has an `orderId` field, looks up the parent Order
 *      and copies clientId, fabric, fitStyleId, waistSize onto the Lot.
 *   2. For every Lot that has no `lotId` (the new auto-generated field),
 *      generates one in the LT-YYYYMMDD### format using the Lot's own createdAt date.
 *   3. Updates the Counter collection so future lots continue from the correct sequence.
 *   4. Removes the now-obsolete `orderId` field from lots, stitchings, washings, and finishings.
 *
 * HOW TO RUN:
 *   cd backend
 *   node migrations/migrate-orders-to-lots.js
 *
 *   — OR with a custom connection string —
 *   MONGO_URI="mongodb://localhost:27017/mydb" node migrations/migrate-orders-to-lots.js
 *
 * PREREQUISITES:
 *   - Make sure the `.env` file in the backend folder has MONGO_URI set,
 *     or pass it as an environment variable.
 *   - Take a database backup before running!
 *
 * SAFE TO RE-RUN:
 *   Yes — each step is idempotent (skips documents that are already migrated).
 */

// require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://mongodb:27017/gs_dev';

async function run() {
  console.log('Connecting to', MONGO_URI.replace(/\/\/.*@/, '//<credentials>@'));
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db;
  const lotsCol = db.collection('lots');
  const ordersCol = db.collection('orders');
  const stitchingsCol = db.collection('stitchings');
  const washingsCol = db.collection('washings');
  const finishingsCol = db.collection('finishings');
  const countersCol = db.collection('counters');

  // ─── Step 1: Copy Order fields to Lots ───────────────────────────
  console.log('=== Step 1: Copy Order fields (clientId, fabric, fitStyleId, waistSize) to Lots ===');
  const lotsWithOrderId = await lotsCol.find({ orderId: { $exists: true } }).toArray();
  console.log(`  Found ${lotsWithOrderId.length} lots with orderId field.`);

  let copiedCount = 0;
  let skippedCount = 0;
  for (const lot of lotsWithOrderId) {
    // If lot already has clientId, it was already migrated
    if (lot.clientId) {
      skippedCount++;
      continue;
    }

    const order = await ordersCol.findOne({ _id: lot.orderId });
    if (!order) {
      console.warn(`  WARNING: Lot ${lot.lotNumber} (inv ${lot.invoiceNumber}) references orderId ${lot.orderId} but Order not found — skipping.`);
      skippedCount++;
      continue;
    }

    await lotsCol.updateOne(
      { _id: lot._id },
      {
        $set: {
          clientId: order.clientId,
          fabric: order.fabric,
          fitStyleId: order.fitStyleId,
          waistSize: order.waistSize,
        },
      }
    );
    copiedCount++;
  }
  console.log(`  Copied: ${copiedCount}, Skipped (already migrated or missing order): ${skippedCount}\n`);

  // ─── Step 2: Generate lotId for existing records ──────────────────
  console.log('=== Step 2: Generate lotId (LT-YYYYMMDD###) for lots that are missing it ===');
  const lotsWithoutLotId = await lotsCol
    .find({ $or: [{ lotId: { $exists: false } }, { lotId: null }, { lotId: '' }] })
    .sort({ createdAt: 1 })
    .toArray();
  console.log(`  Found ${lotsWithoutLotId.length} lots without lotId.`);

  let generatedCount = 0;
  // Group by date string so each date has its own sequence
  const dateSeqMap = {};

  for (const lot of lotsWithoutLotId) {
    const d = lot.createdAt || lot.date || new Date();
    const dateStr = new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

    if (!dateSeqMap[dateStr]) dateSeqMap[dateStr] = 0;
    dateSeqMap[dateStr]++;
    const seq = dateSeqMap[dateStr].toString().padStart(3, '0');
    const lotId = `LT-${dateStr}${seq}`;

    await lotsCol.updateOne({ _id: lot._id }, { $set: { lotId } });
    generatedCount++;
    console.log(`  ${lot.lotNumber} → ${lotId}`);
  }
  console.log(`  Generated lotId for ${generatedCount} lots.\n`);

  // ─── Step 3: Set Counter so future lots continue correctly ────────
  console.log('=== Step 3: Update Counter for lotId sequence ===');
  const allLots = await lotsCol.find({ lotId: { $exists: true, $ne: null } }).toArray();
  let maxSeq = 0;
  for (const lot of allLots) {
    if (!lot.lotId) continue;
    // Extract the trailing 3-digit sequence: LT-YYYYMMDD###
    const match = lot.lotId.match(/\d{3}$/);
    if (match) {
      const seq = parseInt(match[0], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }
  await countersCol.updateOne(
    { _id: 'lotId' },
    { $set: { sequence: maxSeq } },
    { upsert: true }
  );
  console.log(`  Counter 'lotId' set to sequence ${maxSeq} (next lot will be ${maxSeq + 1}).\n`);

  // ─── Step 4: Remove obsolete orderId field ────────────────────────
  console.log('=== Step 4: Remove orderId field from lots, stitchings, washings, finishings ===');

  const r1 = await lotsCol.updateMany({}, { $unset: { orderId: '' } });
  console.log(`  lots:        ${r1.modifiedCount} documents updated`);

  const r2 = await stitchingsCol.updateMany({}, { $unset: { orderId: '' } });
  console.log(`  stitchings:  ${r2.modifiedCount} documents updated`);

  const r3 = await washingsCol.updateMany({}, { $unset: { orderId: '' } });
  console.log(`  washings:    ${r3.modifiedCount} documents updated`);

  const r4 = await finishingsCol.updateMany({}, { $unset: { orderId: '' } });
  console.log(`  finishings:  ${r4.modifiedCount} documents updated`);

  // ─── Done ─────────────────────────────────────────────────────────
  console.log('\n✓ Migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

// One-time migration: normalise every business-date field to UTC midnight of its BUSINESS
// calendar day, so a stored date means a date and nothing else.
//
// WHY
// Entry forms send `data.date.toISOString()` from a picker defaulting to dayjs(new Date()),
// so stored values carry the entering user's wall-clock time. Range filters build their
// bounds from the *viewer's* timezone. Whether a row falls inside a range therefore depends
// on who is looking — which is why toDate appeared non-inclusive in some regions.
//
// TARGET REPRESENTATION: UTC midnight of the business day.
//   business day 20 Aug 2026  ->  2026-08-20T00:00:00.000Z
// NOT business-local midnight expressed in UTC (which for IST would be 2026-08-19T18:30Z).
// That alternative looks tidier but leaves every $year/$month/$dateTrunc needing an explicit
// timezone argument forever — and a January date stored as 31 Dec 18:30Z buckets into the
// WRONG YEAR the moment someone forgets one. UTC midnight makes the naive operators correct.
//
// COMPANION CHANGES REQUIRED — do these in the same release or numbers will look wrong:
//   1. Write path: send `dayjs(d).format('YYYY-MM-DD')` from the forms; parse server-side as
//      `new Date(s + 'T00:00:00.000Z')`. Otherwise new rows reintroduce the drift.
//   2. Read path: half-open bounds — $gte <fromDate>T00:00:00Z, $lt <toDate + 1 day>T00:00:00Z.
//   3. Display: format with UTC (dayjs.utc(d).format(...)), NOT local. A viewer at UTC-5
//      rendering 2026-08-20T00:00:00Z in local time sees "19 Aug".
//
// SAFETY
//   • Idempotent — rows already at UTC midnight are skipped, so re-running is a no-op.
//   • Every changed value is copied to the `businessdate_backup` collection first, tagged
//     with a runId, so --rollback can restore it exactly. Atlas M0 has NO cloud backups, so
//     this collection is your undo. Still take a mongodump before the first real run.
//   • Batched bulkWrites — avoids a single long-running updateMany tripping the 45s
//     socketTimeoutMS on shared-tier CPU.
//   • Writes require --confirm. --dry alone reports and changes nothing.
//
// Run from backend/:
//   node migrations/normalize-business-dates.js --dry
//   node migrations/normalize-business-dates.js --confirm
//   node migrations/normalize-business-dates.js --rollback=<runId> --confirm
//     • uses process.env.MONGO_URI, or pass the URI as the first arg
//     • --tz=Asia/Kolkata     business timezone (default: env BUSINESS_TZ, else Asia/Kolkata)
//     • --only=Lot.date,Stitching.date   restrict to specific fields
//     • --batch=500           bulkWrite size
//     • --limit=100           stop after N changes per field (rehearsal on a subset)

const mongoose = require('mongoose');
const models = require('../mongodb_schema');

const TARGETS = [
  ['Lot', 'date'],
  ['Stitching', 'date'],
  ['Stitching', 'stitchOutDate'],
  ['Washing', 'date'],
  ['Washing', 'washOutDate'],
  ['Finishing', 'date'],
  ['Finishing', 'finishOutDate'],
  ['Invoice', 'date'],
  ['ManualDispatch', 'dispatchDate'],
  ['ClientPaymentEntry', 'paymentDate'],
  ['VendorPaymentEntry', 'paymentDate'],
  ['AccessoryPurchase', 'date'],
  ['AccessoryPayment', 'paymentDate'],
  ['Order', 'date'],
];

const BACKUP_COLLECTION = 'businessdate_backup';
const DAY_MS = 86400000;

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;
const TZ = flag('tz', process.env.BUSINESS_TZ || 'Asia/Kolkata');
const DRY = has('dry') || !has('confirm');
const ROLLBACK = args.find((a) => a.startsWith('--rollback'));
const ROLLBACK_ID = ROLLBACK && ROLLBACK.includes('=') ? ROLLBACK.split('=')[1] : null;
const BATCH = Math.max(1, parseInt(flag('batch', '500'), 10));
const LIMIT = flag('limit') ? parseInt(flag('limit'), 10) : Infinity;
const ONLY = flag('only') ? flag('only').split(',').map((s) => s.trim()) : null;

const makeDayFormatter = (tz) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return (d) => {
    const p = fmt.formatToParts(d);
    const get = (t) => p.find((x) => x.type === t).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
};

const connect = async () => {
  if (!MONGO_URI) {
    console.error('No connection string. Pass one as an argument or set MONGO_URI.');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI, { maxPoolSize: 3, serverSelectionTimeoutMS: 10000 });
  console.log(`Connected. Database: ${mongoose.connection.name}`);
};

// ─── ROLLBACK ────────────────────────────────────────────────────────────────
const rollback = async () => {
  const backup = mongoose.connection.db.collection(BACKUP_COLLECTION);

  const runs = await backup.aggregate([
    { $group: { _id: '$runId', n: { $sum: 1 }, at: { $first: '$at' } } },
    { $sort: { at: -1 } },
  ]).toArray();

  if (!runs.length) {
    console.log('No backup records found — nothing to roll back.');
    return;
  }

  const target = ROLLBACK_ID || runs[0]._id;
  if (!ROLLBACK_ID) {
    console.log('Available runs:');
    runs.forEach((r) => console.log(`  ${r._id}  ${new Date(r.at).toISOString()}  ${r.n} rows`));
    console.log(`\nNo runId given — defaulting to the most recent: ${target}`);
  }

  const docs = await backup.find({ runId: target }).toArray();
  if (!docs.length) {
    console.log(`No backup records for runId ${target}.`);
    return;
  }
  console.log(`Restoring ${docs.length} value(s) from run ${target}${DRY ? '  (DRY RUN)' : ''}…`);

  const byModel = docs.reduce((acc, d) => {
    const key = `${d.model}.${d.field}`;
    (acc[key] = acc[key] || []).push(d);
    return acc;
  }, {});

  let restored = 0;
  for (const [key, group] of Object.entries(byModel)) {
    const [modelName, field] = key.split('.');
    const Model = models[modelName];
    if (!Model) { console.log(`  ${key.padEnd(36)} model not exported, skipped`); continue; }

    for (let i = 0; i < group.length; i += BATCH) {
      const chunk = group.slice(i, i + BATCH);
      const ops = chunk.map((d) => ({
        updateOne: { filter: { _id: d.docId }, update: { $set: { [field]: d.original } } },
      }));
      if (!DRY) await Model.collection.bulkWrite(ops, { ordered: false });
      restored += ops.length;
    }
    console.log(`  ${key.padEnd(36)} ${group.length} restored`);
  }

  console.log(`\nRestored ${restored} value(s).`);
  if (!DRY) {
    await backup.deleteMany({ runId: target });
    console.log(`Backup records for run ${target} removed.`);
  } else {
    console.log('(DRY RUN — nothing was written, backup records kept)');
  }
};

// ─── MIGRATE ─────────────────────────────────────────────────────────────────
const migrate = async () => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  } catch (_) {
    console.error(`Unknown timezone "${TZ}". Use an IANA name, e.g. Asia/Kolkata.`);
    process.exit(1);
  }

  const businessDay = makeDayFormatter(TZ);
  const backup = mongoose.connection.db.collection(BACKUP_COLLECTION);
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const at = new Date();

  console.log(`Business timezone: ${TZ}`);
  console.log(`Run id: ${runId}`);
  console.log(DRY
    ? 'DRY RUN — nothing will be written. Re-run with --confirm to apply.\n'
    : 'LIVE RUN — writing changes.\n');

  const selected = TARGETS.filter(([m, f]) => !ONLY || ONLY.includes(`${m}.${f}`));
  if (ONLY && !selected.length) {
    console.error(`--only matched no known fields. Valid: ${TARGETS.map(([m, f]) => `${m}.${f}`).join(', ')}`);
    process.exit(1);
  }

  let grandChanged = 0;
  let grandSkipped = 0;
  let grandShifted = 0;

  for (const [modelName, field] of selected) {
    const Model = models[modelName];
    if (!Model) {
      console.log(`${(`${modelName}.${field}`).padEnd(36)} model not exported, skipped`);
      continue;
    }

    let changed = 0;
    let skipped = 0;
    let shifted = 0;
    let ops = [];
    let backups = [];

    const flush = async () => {
      if (!ops.length) return;
      if (!DRY) {
        // Backup FIRST — if the bulkWrite then fails midway, every value it did change is
        // already recoverable. The reverse order could strand rows with no undo.
        await backup.insertMany(backups, { ordered: false });
        await Model.collection.bulkWrite(ops, { ordered: false });
      }
      ops = [];
      backups = [];
    };

    const cursor = Model.collection
      .find({ [field]: { $type: 'date' } }, { projection: { [field]: 1 } })
      .batchSize(BATCH);

    for await (const doc of cursor) {
      const d = doc[field];
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) { skipped++; continue; }
      if (d.getTime() % DAY_MS === 0) { skipped++; continue; } // already a pure date

      const ymd = businessDay(d);
      const normalized = new Date(`${ymd}T00:00:00.000Z`);
      if (normalized.getTime() === d.getTime()) { skipped++; continue; }

      if (ymd !== d.toISOString().slice(0, 10)) shifted++;

      ops.push({ updateOne: { filter: { _id: doc._id }, update: { $set: { [field]: normalized } } } });
      backups.push({ runId, at, model: modelName, field, docId: doc._id, original: d, normalized });
      changed++;

      if (ops.length >= BATCH) await flush();
      if (changed >= LIMIT) break;
    }
    await flush();

    grandChanged += changed;
    grandSkipped += skipped;
    grandShifted += shifted;

    console.log(
      `${(`${modelName}.${field}`).padEnd(36)} ` +
      `changed ${String(changed).padStart(6)}   ` +
      `already-clean ${String(skipped).padStart(6)}   ` +
      `day-shifted ${String(shifted).padStart(6)}`
    );
  }

  console.log('');
  console.log(`Values normalised     : ${grandChanged}`);
  console.log(`Already clean         : ${grandSkipped}`);
  console.log(`Moved calendar day    : ${grandShifted}   (these change monthly/quarterly totals)`);

  if (!DRY && grandChanged > 0) {
    const n = await backup.countDocuments({ runId });
    console.log(`\nBackup written        : ${n} rows in "${BACKUP_COLLECTION}" under runId ${runId}`);
    console.log('Undo with:');
    console.log(`  node migrations/normalize-business-dates.js --rollback=${runId} --confirm`);
  }
  if (DRY) console.log('\n(DRY RUN — no writes performed)');
};

// ─── ENTRY ───────────────────────────────────────────────────────────────────
(async () => {
  await connect();
  if (ROLLBACK) await rollback();
  else await migrate();
  await mongoose.disconnect();
  console.log('\nDone.');
  process.exit(0);
})().catch(async (err) => {
  console.error('Migration failed:', err);
  console.error('Rows already committed are recoverable from the backup collection.');
  try { await mongoose.disconnect(); } catch (_) { /* already down */ }
  process.exit(1);
});

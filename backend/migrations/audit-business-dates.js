// Read-only audit: report how business-date fields are currently stored, and how many rows
// would change calendar day if normalised. RUN THIS FIRST — it writes nothing.
//
// THE PROBLEM IT MEASURES
// Entry forms send `data.date.toISOString()` where the picker value defaults to
// dayjs(new Date()) — i.e. the *entering user's* wall-clock time, not midnight. Nothing on
// the write path normalises it, so a lot "dated 20 Aug" may be stored as any instant across
// a ~24h window. Range filters then include or exclude it depending on the viewer's timezone.
//
// WHAT THE OUTPUT MEANS
//   atUtcMidnight  — already clean (stored as a pure date). Migration will skip these.
//   carriesTime    — stored with a time-of-day. These are the ones at risk.
//   wouldShiftDay  — of those, the ones whose UTC calendar date differs from their BUSINESS
//                    calendar date. THIS IS THE BLAST RADIUS: each of these rows will move to
//                    a different day (and possibly a different month) after migration.
//   hour histogram — UTC hour-of-day the records were entered at. If your team works
//                    09:00–19:00 IST you should see a band at 03–13 UTC. A band centred
//                    elsewhere means entries came from another timezone, or were backdated.
//
// A large wouldShiftDay is not a bug in this script — it is the size of the problem you
// already have. Read it before deciding whether to migrate.
//
// Run from backend/:   node migrations/audit-business-dates.js
//   • uses process.env.MONGO_URI, or pass the URI as the first arg
//   • --tz=Asia/Kolkata   business timezone (default: env BUSINESS_TZ, else Asia/Kolkata)
//   • --samples=5         show N example rows per field that would shift

const mongoose = require('mongoose');
const models = require('../mongodb_schema');

// Business-date fields: dates a human PICKED on a form. Deliberately excludes system
// timestamps (createdAt, updatedAt, paidAt, expiresAt) — those are real instants and
// must keep their time component.
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
  ['Order', 'date'], // legacy, superseded by Lot — audited so the picture is complete
];

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const MONGO_URI = args.find((a) => !a.startsWith('--')) || process.env.MONGO_URI;
const TZ = flag('tz', process.env.BUSINESS_TZ || 'Asia/Kolkata');
const SAMPLES = parseInt(flag('samples', '5'), 10);

const DAY_MS = 86400000;

// Build "YYYY-MM-DD" for an instant as seen in `tz`. formatToParts (not format) because
// locale formatting is not guaranteed stable across Node/ICU builds.
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

const utcDay = (d) => d.toISOString().slice(0, 10);

const bar = (n, max, width = 28) => '#'.repeat(max ? Math.round((n / max) * width) : 0);

(async () => {
  if (!MONGO_URI) {
    console.error('No MONGO_URI. Pass it as an argument or set the env var.');
    process.exit(1);
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  } catch (_) {
    console.error(`Unknown timezone "${TZ}". Use an IANA name, e.g. Asia/Kolkata.`);
    process.exit(1);
  }

  await mongoose.connect(MONGO_URI, { maxPoolSize: 3, serverSelectionTimeoutMS: 10000 });
  const businessDay = makeDayFormatter(TZ);
  console.log(`Connected. Database: ${mongoose.connection.name}`);
  console.log(`Business timezone: ${TZ}`);
  console.log('READ ONLY — nothing will be written.\n');

  const hours = new Array(24).fill(0);
  let grandTotal = 0;
  let grandShift = 0;
  const rows = [];

  for (const [modelName, field] of TARGETS) {
    const Model = models[modelName];
    if (!Model) {
      console.log(`${modelName.padEnd(20)} ${field.padEnd(16)} — model not exported, skipped`);
      continue;
    }

    let total = 0;
    let midnight = 0;
    let withTime = 0;
    let shifted = 0;
    let earliest = null;
    let latest = null;
    const samples = [];

    const cursor = Model.collection
      .find({ [field]: { $type: 'date' } }, { projection: { [field]: 1 } })
      .batchSize(500);

    for await (const doc of cursor) {
      const d = doc[field];
      if (!(d instanceof Date) || Number.isNaN(d.getTime())) continue;
      total++;
      if (!earliest || d < earliest) earliest = d;
      if (!latest || d > latest) latest = d;

      if (d.getTime() % DAY_MS === 0) {
        midnight++;
        continue;
      }
      withTime++;
      hours[d.getUTCHours()]++;

      const bDay = businessDay(d);
      const uDay = utcDay(d);
      if (bDay !== uDay) {
        shifted++;
        if (samples.length < SAMPLES) {
          samples.push(`_id ${doc._id}  stored ${d.toISOString()}  UTC-day ${uDay}  ->  business-day ${bDay}`);
        }
      }
    }

    grandTotal += total;
    grandShift += shifted;
    rows.push({ modelName, field, total, midnight, withTime, shifted, earliest, latest, samples });
  }

  console.log('MODEL                FIELD            TOTAL  atUtcMidnight  carriesTime  wouldShiftDay');
  console.log('─'.repeat(92));
  for (const r of rows) {
    console.log(
      `${r.modelName.padEnd(20)} ${r.field.padEnd(16)} ` +
      `${String(r.total).padStart(5)}  ${String(r.midnight).padStart(13)}  ` +
      `${String(r.withTime).padStart(11)}  ${String(r.shifted).padStart(13)}` +
      (r.shifted ? '  <-- will move' : '')
    );
  }
  console.log('─'.repeat(92));
  console.log(`${'TOTAL'.padEnd(37)} ${String(grandTotal).padStart(5)}  ` +
    `${''.padStart(13)}  ${''.padStart(11)}  ${String(grandShift).padStart(13)}`);

  console.log('\nDate coverage per field:');
  for (const r of rows) {
    if (!r.total) continue;
    console.log(`  ${(`${r.modelName}.${r.field}`).padEnd(36)} ${utcDay(r.earliest)} .. ${utcDay(r.latest)}`);
  }

  const maxHour = Math.max(...hours);
  if (maxHour > 0) {
    console.log(`\nEntry-time fingerprint (UTC hour of day, ${hours.reduce((a, b) => a + b, 0)} timed records):`);
    hours.forEach((n, h) => {
      if (!n) return;
      const local = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(Date.UTC(2026, 0, 1, h, 0)));
      console.log(`  ${String(h).padStart(2, '0')}:00 UTC (${local} ${TZ})  ${bar(n, maxHour)} ${n}`);
    });
    console.log('  If this band does not match your working hours, entries came from another');
    console.log('  timezone — confirm the correct --tz before migrating.');
  }

  const withSamples = rows.filter((r) => r.samples.length);
  if (withSamples.length) {
    console.log('\nExamples of rows that will change day:');
    for (const r of withSamples) {
      console.log(`  ${r.modelName}.${r.field}`);
      r.samples.forEach((s) => console.log(`    • ${s}`));
    }
  }

  console.log('');
  if (grandShift === 0) {
    console.log('No rows change calendar day. Migration is cosmetic — you still want it for');
    console.log('consistent range filtering, but nothing will move between reporting periods.');
  } else {
    console.log(`${grandShift} row(s) will change calendar day, and some will change MONTH.`);
    console.log('Historical monthly/quarterly totals WILL shift after migrating. Export any');
    console.log('reports you need to reconcile against before running the migration.');
  }

  await mongoose.disconnect();
  console.log('\nDone. (no writes performed)');
  process.exit(0);
})().catch(async (err) => {
  console.error('Audit failed:', err);
  try { await mongoose.disconnect(); } catch (_) { /* already down */ }
  process.exit(1);
});

// Clone prod (gs_sales_accounting) → dev (gs_dev). Reads prod, writes ONLY to gs_dev.
// Safe by design: uses explicit db handles (never the connection default), asserts the target is
// gs_dev, and SKIPS any collection whose prod source is empty (so a wrong-cluster URI can't wipe
// dev with nothing). Both DBs must live on the cluster the app's MONGO_URI points to.
//
// Usage (from backend/):  node --env-file=../.env scripts/clone_prod_to_dev.js
const mongoose = require('mongoose');

const SRC = 'gs_sales_accounting';
const DST = 'gs_dev';

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const client = mongoose.connection.getClient();
  const src = client.db(SRC);
  const dst = client.db(DST);

  if (dst.databaseName !== DST) throw new Error(`target guard failed: ${dst.databaseName}`);
  if (src.databaseName === dst.databaseName) throw new Error('source and target are the same db');

  // Guard against a wrong/other-cluster URI: prod must actually contain data.
  const lotCount = await src.collection('lots').countDocuments();
  console.log(`source ${SRC}.lots count = ${lotCount}`);
  if (lotCount === 0) throw new Error(`source ${SRC} has 0 lots — wrong cluster/URI? aborting, nothing deleted`);

  const colls = (await src.listCollections().toArray())
    .map(c => c.name)
    .filter(n => !n.startsWith('system.'))
    .sort();
  console.log(`Cloning ${colls.length} collections: ${SRC} → ${DST}\n`);

  let copied = 0, skipped = 0;
  for (const name of colls) {
    const docs = await src.collection(name).find({}).toArray();
    if (!docs.length) { console.log(`  ${name}: source empty → skipped (dev untouched)`); skipped++; continue; }
    await dst.collection(name).deleteMany({});                 // clear target (gs_dev only)
    await dst.collection(name).insertMany(docs, { ordered: false });
    console.log(`  ${name}: ${docs.length} copied`);
    copied++;
  }
  console.log(`\nDONE — ${copied} collections copied, ${skipped} skipped.`);
  console.log('Note: documents copied with original _id; indexes NOT copied (fine for testing).');
  await mongoose.disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); try { await mongoose.disconnect(); } catch {} process.exit(1); });

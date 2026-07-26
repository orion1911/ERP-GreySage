// makingsReconService.js
// ─────────────────────────────────────────────────────────────────────────────
// Reconciles the shared MAKINGS Excel workbook (OneDrive-hosted, one sheet per
// maker) against our MongoDB production records, per lot. Powers the in-app
// notification bell: it surfaces lots where the excel and the DB disagree so the
// user can open Stitching Management and fix them.
//
// The workbook is the SAME source the retired Python dashboard parsed
// (ext/process.py), with one addition: a BILL column immediately after LOT NO.
// We match an excel row to a Lot on BOTH lotNumber AND invoiceNumber(=BILL).
//
// Excel columns we read (found by header, per sheet):
//   CLIENT     → client name
//   WASHING    → washer (WashingVendor.name)
//   PCS        → gross pieces; the cell COMMENT is the thread colour + count
//   PCS SHORT  → "<n>M" short in making/stitching, "<n>W" short in washing
//   WASH SD    → wash start date / stitch-out date
//   WASH ED    → wash end/out date / finishing creation date
//   DATE       → row date
//   LOT NO.    → matches Lot.lotNumber
//   BILL       → matches Lot.invoiceNumber (upstream/maker bill)
//
// Two short module-level caches (raw workbook bytes + the computed diff) keep
// repeated bell opens cheap, mirroring the 5-min cache of the old Python service.
// ─────────────────────────────────────────────────────────────────────────────
const XLSX = require('xlsx');
const {
  Lot,
  Stitching,
  Washing,
  Finishing,
  WashingVendor,
  MakingsDiff,
} = require('../mongodb_schema');

// Default maker sheets (overridable via env MAKINGS_MAKER_SHEETS). These are the
// per-maker tabs in the shared MAKINGS workbook — excluding the washer sheets
// (prefixed "W-") and the non-production tabs (EXPENSES, LOOKUP).
const DEFAULT_MAKER_SHEETS = [
  'GREYSAGE', 'RIZWAN', 'MIDSEN', 'ARVIND', 'RAMA', 'SURKH', 'ANIL',
  'HAKIM', 'SHABAN', 'MDSK', 'MALAD', 'RAMU', 'SINU', 'HASAN', 'ARMAN', 'HANIF',
];

const makerSheets = () => {
  const raw = (process.env.MAKINGS_MAKER_SHEETS || '').trim();
  if (!raw) return DEFAULT_MAKER_SHEETS;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
};

// Stop scanning a sheet after this many consecutive data-less rows (some sheets
// have 1M+ rows where only column A is filled). Mirrors ext/process.py.
const MAX_EMPTY_STREAK = 25;

const WORKBOOK_TTL_MS = 5 * 60 * 1000; // raw bytes cache (helps back-to-back recons)

let _wbCache = { buf: null, ts: 0 };

// A full desktop UA — OneDrive/CDN reject minimal agents with 403.
const DOWNLOAD_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// OneDrive's anonymous ("Anyone with the link") download for a 1drv.ms share does
// NOT complete in one request: it sets a session cookie partway through the
// redirect chain (1drv.ms → onedrive.live.com → …) and requires that cookie on the
// hop that actually serves the file. Node's fetch drops cookies across redirects,
// so we follow redirects manually with a tiny cookie jar. Point ONEDRIVE_FILE_URL
// at the share link with `?download=1` (keep the `?e=<token>` share token).
const fetchFollowingWithCookies = async (startUrl, maxHops = 12) => {
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const storeCookies = (res) => {
    const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of list) {
      const kv = c.split(';')[0];
      const i = kv.indexOf('=');
      if (i > 0) jar[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
    }
  };

  let url = startUrl;
  for (let hop = 0; hop < maxHops; hop++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': DOWNLOAD_UA, 'Accept': '*/*', Cookie: cookieHeader() },
      redirect: 'manual',
    });
    storeCookies(res);
    const loc = res.headers.get('location');
    if (res.status >= 200 && res.status < 300 && !loc) return res;   // final response
    if (!loc) return res;                                            // non-redirect, non-2xx
    url = new URL(loc, url).toString();
  }
  throw new Error('Workbook download exceeded redirect limit');
};

// ─── Workbook download (cached) ──────────────────────────────────────────────
const downloadWorkbookBytes = async () => {
  const now = Date.now();
  if (_wbCache.buf && now - _wbCache.ts < WORKBOOK_TTL_MS) return _wbCache.buf;

  const url = process.env.ONEDRIVE_FILE_URL;
  if (!url) throw new Error('ONEDRIVE_FILE_URL is not configured');

  const res = await fetchFollowingWithCookies(url);
  if (!res.ok) {
    throw new Error(
      `Workbook download failed: HTTP ${res.status}. Ensure ONEDRIVE_FILE_URL is a ` +
      `share link set to "Anyone with the link" (with ?download=1).`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // A real .xlsx is a ZIP (starts with "PK"). Anything else (usually an HTML login
  // or interstitial page) means the link resolved to a viewer — fail loudly rather
  // than feed HTML to the parser.
  if (buf.slice(0, 2).toString('latin1') !== 'PK') {
    throw new Error(
      'Workbook download did not return an .xlsx file (got an HTML/redirect page). ' +
      'Ensure the OneDrive link is public ("Anyone with the link") and ends with ?download=1.'
    );
  }

  _wbCache = { buf, ts: now };
  return buf;
};

// ─── Small parsing helpers ───────────────────────────────────────────────────
const cellText = (cell) => {
  if (!cell) return '';
  const v = cell.w != null ? cell.w : cell.v;
  if (v == null) return '';
  return String(v).trim();
};

const toInt = (val) => {
  if (val == null || val === '') return 0;
  const n = parseInt(String(val).replace(/[^\d-]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

// PCS SHORT column → { making, washing } short counts.
//   "12M" / "4 M"        → 12 / 4 short in making
//   "5W"                 → 5 short in washing
//   "10M-1W" / "2M/1W"   → both (M and W parts, any of space / slash / dash between)
//   "2/W" / "1/W"        → the number belongs to washing (digit sits before the slash-letter)
//   bare number          → a making short
//   "4PLUS M" / "3 EXTRA"→ NOT a short: PLUS/EXTRA mark surplus pieces, so the cell is ignored.
const parsePcsShort = (text) => {
  const out = { making: 0, washing: 0 };
  if (!text) return out;
  const s = String(text).toUpperCase();
  // "PLUS"/"EXTRA" denote surplus, not a shortage — void the whole cell.
  if (/PLUS|EXTRA/.test(s)) return out;
  // The count may attach to M/W directly, across a space, or before a slash ("2/W").
  const m = s.match(/(\d+)\s*\/?\s*M/);
  const w = s.match(/(\d+)\s*\/?\s*W/);
  if (m) out.making = toInt(m[1]);
  if (w) out.washing = toInt(w[1]);
  // A bare number with no M/W suffix is treated as a making short.
  if (!m && !w) {
    const bare = toInt(s);
    if (bare) out.making = bare;
  }
  return out;
};

// The comment on the PCS cell lists thread colour(s) with counts. SheetJS puts
// comments on cell.c (array of { a: author, t: text }). We join the text.
const cellComment = (cell) => {
  if (!cell || !Array.isArray(cell.c) || !cell.c.length) return '';
  return cell.c.map((c) => (c && c.t ? String(c.t) : '')).join(' ').replace(/\s+/g, ' ').trim();
};

// Excel row → implied production stage, from WASHING / WASH ED presence.
//   no washer                → 'making'    (Lot.status 2)
//   washer, no wash-ed       → 'washing'   (Lot.status 3)
//   washer + wash-ed         → 'finishing' (Lot.status >= 4)
const excelStage = ({ washing, washEd }) => {
  if (!washing) return 'making';
  if (!washEd) return 'washing';
  return 'finishing';
};

const STAGE_MIN_STATUS = { making: 2, washing: 3, finishing: 4 };
// Human-readable names for the app's Lot.status codes and the excel-implied stage.
const STATUS_NAMES = { 2: 'Stitching', 3: 'Washing', 4: 'Finishing', 5: 'Finished', 6: 'Part Dispatched', 7: 'Dispatched' };
const STAGE_LABELS = { making: 'Making', washing: 'Washing', finishing: 'Finishing' };

// Only reconcile maker rows dated on/after this cutoff (default 1 Jan 2026) — the
// workbook carries years of history we don't want surfaced as discrepancies.
const makingsDateCutoff = () => {
  // Parse as LOCAL midnight (via parseDateString semantics) so it lines up with the excel's
  // string dates, which parseRowDate builds as local — otherwise a UTC-midnight cutoff would
  // drop rows dated exactly on the cutoff in ahead-of-UTC timezones (e.g. IST).
  const raw = (process.env.MAKINGS_DATE_CUTOFF || '2026-01-01').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date(2026, 0, 1) : d;
};

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Format a Date to a timezone-safe 'YYYY-MM-DD' (local calendar parts) so the day
// doesn't shift when the frontend re-parses it.
const toYmd = (d) => (d
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  : null);

// Parse a workbook date STRING (e.g. "24-Jan-25" / "01-Feb-2026") to a JS Date.
const parseDateString = (s) => {
  if (!s) return null;
  const m = String(s).match(/^(\d{1,2})[-/ ]([A-Za-z]{3,})[-/ ](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += 2000;
    if (mon != null) return new Date(yr, mon, day);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t);
};

// Parse a DATE cell to a JS Date. With cellDates:true a real date cell is already a Date.
const parseRowDate = (cell) => {
  if (!cell) return null;
  if (cell.v instanceof Date) return cell.v;
  return parseDateString(cellText(cell));
};

// Thread-colour abbreviations used in the excel → the full names the app uses.
const COLOR_NAMES = {
  BLK: 'BLACK', KHK: 'KHAKI', WHT: 'WHITE', WHI: 'WHITE', CRM: 'CREAM', CRE: 'CREAM',
  BLU: 'BLUE', GRN: 'GREEN', GRY: 'GREY', GRE: 'GREY', NVY: 'NAVY', NAV: 'NAVY',
  BRN: 'BROWN', BRW: 'BROWN', OLV: 'OLIVE', MRN: 'MAROON', BEG: 'BEIGE', YLW: 'YELLOW',
};
const expandColor = (code) => COLOR_NAMES[code.toUpperCase()] || code.toUpperCase();

// Parse the PCS-cell thread-colour comment into [{ color, quantity }]. Examples:
//   "BLK ALL"            → [{ BLACK, <totalPcs> }]
//   "BLUE 400 RED 270"   → [{ BLUE, 400 }, { RED, 270 }]
// A single colour (with or without a count) covers all pcs; multiple colours split by
// their stated counts. Abbreviations are expanded to the app's full colour names.
const parseThreadColors = (comments, totalPcs) => {
  const text = (comments || []).join(' ')
    .replace(/[-–—:=]+/g, ' ') // separators between colour and count: "BLK - 500" → "BLK 500"
    .replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const tokens = text.split(' ');
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const color = tokens[i];
    if (!/[A-Za-z]/.test(color)) continue; // skip stray numbers
    const next = tokens[i + 1];
    let qty = 0;
    if (next && /^\d+$/.test(next)) { qty = parseInt(next, 10); i++; }
    else if (next && /^ALL$/i.test(next)) { qty = totalPcs; i++; }
    out.push({ color: expandColor(color), quantity: qty });
  }
  if (!out.length) return null;
  // A lone colour with no explicit count covers the whole lot.
  if (out.length === 1 && !out[0].quantity) out[0].quantity = totalPcs;
  return out;
};

// ─── Parse all maker sheets into flat rows ───────────────────────────────────
const parseWorkbook = (buf) => {
  const sheets = makerSheets();
  // Parse ONLY the maker sheets, capped at 5000 rows each. The workbook has huge
  // irrelevant tabs (washer sheets, LOOKUP) and some maker sheets fill column A for
  // 1M+ rows — reading everything costs ~20s and lots of memory. `sheets` + a row
  // cap keep it fast; makers have only a few hundred real rows.
  // cellStyles/HTML/formula off shaves a couple seconds off the parse (helps stay under the
  // serverless timeout); cellDates + comments (thread colours) are unaffected by these flags.
  const wb = XLSX.read(buf, {
    type: 'buffer', cellDates: true, sheets, sheetRows: 5000,
    cellStyles: false, cellHTML: false, cellFormula: false,
  });
  const cutoff = makingsDateCutoff();
  const rows = [];
  const seenSheets = [];

  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    seenSheets.push(sheetName);

    const range = XLSX.utils.decode_range(ws['!ref']);
    const cellAt = (r, c) => ws[XLSX.utils.encode_cell({ r, c })];

    // Find the header row (the one containing a "CLIENT" cell) and map columns.
    let headerRow = -1;
    const col = {};
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        if (cellText(cellAt(r, c)).toUpperCase() === 'CLIENT') { headerRow = r; break; }
      }
      if (headerRow >= 0) break;
    }
    if (headerRow < 0) continue;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const name = cellText(cellAt(headerRow, c)).toUpperCase();
      if (name) col[name] = c;
    }
    if (col['CLIENT'] == null || col['LOT NO.'] == null) continue;

    let emptyStreak = 0;
    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const client = cellText(cellAt(r, col['CLIENT']));
      const lotNo = col['LOT NO.'] != null ? cellText(cellAt(r, col['LOT NO.'])) : '';

      if (!client && !lotNo) {
        emptyStreak++;
        if (emptyStreak > MAX_EMPTY_STREAK) break;
        continue;
      }
      emptyStreak = 0;
      if (!lotNo) continue; // rows without a lot number can't be reconciled

      // Skip rows older than the cutoff (workbook holds years of history). Rows
      // with no/unparseable date are kept (safer to surface than to hide).
      const dateCell = col['DATE'] != null ? cellAt(r, col['DATE']) : null;
      const rowDate = parseRowDate(dateCell);
      if (rowDate && rowDate < cutoff) continue;

      const pcsCell = col['PCS'] != null ? cellAt(r, col['PCS']) : null;

      rows.push({
        maker: sheetName,
        client,
        lotNumber: lotNo,
        bill: col['BILL'] != null ? cellText(cellAt(r, col['BILL'])) : '',
        pcs: pcsCell ? toInt(pcsCell.v != null ? pcsCell.v : pcsCell.w) : 0,
        threadComment: cellComment(pcsCell),
        pcsShort: parsePcsShort(col['PCS SHORT'] != null ? cellText(cellAt(r, col['PCS SHORT'])) : ''),
        washing: col['WASHING'] != null ? cellText(cellAt(r, col['WASHING'])) : '',
        washSd: col['WASH SD'] != null ? cellText(cellAt(r, col['WASH SD'])) : '',
        washEd: col['WASH ED'] != null ? cellText(cellAt(r, col['WASH ED'])) : '',
        date: col['DATE'] != null ? cellText(cellAt(r, col['DATE'])) : '',
        // STYLE → Fit Style · DETAILS → Fabric · SIZES → Waist Size (for the Add-Stitching prefill).
        style: col['STYLE'] != null ? cellText(cellAt(r, col['STYLE'])) : '',
        details: col['DETAILS'] != null ? cellText(cellAt(r, col['DETAILS'])) : '',
        sizes: col['SIZES'] != null ? cellText(cellAt(r, col['SIZES'])) : '',
      });
    }
  }

  return { rows, seenSheets };
};

// ─── DB side: gather production per lot for the excel lot numbers ────────────
const gatherDbByLot = async (lotNumbers) => {
  const lots = await Lot.find({ lotNumber: { $in: lotNumbers } })
    .populate('clientId', 'name clientCode')
    .lean();

  const lotIds = lots.map((l) => l._id);

  const [stitching, washing, finishing, washVendors] = await Promise.all([
    Stitching.find({ lotId: { $in: lotIds } }).lean(),
    Washing.find({ lotId: { $in: lotIds } }).lean(),
    Finishing.find({ lotId: { $in: lotIds } }).lean(),
    WashingVendor.find({}).select('name').lean(),
  ]);

  const vendorName = new Map(washVendors.map((v) => [String(v._id), v.name]));

  const group = (arr) => {
    const m = new Map();
    for (const d of arr) {
      const k = String(d.lotId);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(d);
    }
    return m;
  };
  const stitchByLot = group(stitching);
  const washByLot = group(washing);
  const finishByLot = group(finishing);

  // Key lots by "lotNumber|invoiceNumber" (bill) AND by bare lotNumber, so we can
  // match on both when the excel carries a bill, and still locate the lot to
  // report a bill mismatch when it doesn't line up.
  const byKey = new Map();
  const byLotNumber = new Map();

  for (const lot of lots) {
    const id = String(lot._id);
    const stitch = stitchByLot.get(id) || [];
    const wash = washByLot.get(id) || [];
    const finish = finishByLot.get(id) || [];

    // Excel PCS is the MAKING gross count (losses live separately in PCS SHORT), so
    // compare it against the DB stitching gross — NOT finishing/washing quantity, which
    // is already net of shorts and would flag a false mismatch equal to the short amount.
    // Fall back to washing → finishing gross only when a lot has no stitching record.
    const stitchGross = stitch.reduce((s, x) => s + (x.quantity || 0), 0);
    const washGross = wash.reduce((s, w) => s + (w.washDetails || []).reduce((a, d) => a + (d.quantity || 0), 0), 0);
    const finishGross = finish.reduce((s, f) => s + (f.quantity || 0), 0);
    const grossPcs = stitchGross || washGross || finishGross;

    const makingShort = stitch.reduce((s, x) => s + (x.quantityShort || 0), 0);
    const washingShort = wash.reduce((s, w) => s + (w.washDetails || []).reduce((a, d) => a + (d.quantityShort || 0), 0), 0);

    const washerNames = [...new Set(wash.map((w) => vendorName.get(String(w.vendorId))).filter(Boolean))];
    const threadColors = [];
    for (const st of stitch) {
      for (const tc of (st.threadColors || [])) threadColors.push({ color: tc.color, quantity: tc.quantity });
    }

    const entry = {
      _id: lot._id,
      lotNumber: lot.lotNumber,
      invoiceNumber: lot.invoiceNumber,
      client: lot.clientId?.name || '',
      fabric: lot.fabric || '',
      status: lot.status,
      grossPcs,
      makingShort,
      washingShort,
      washerNames,
      threadColors,
      stitchOutDates: stitch.map((s) => s.stitchOutDate).filter(Boolean),
      washStartDates: wash.map((w) => w.date).filter(Boolean),
      washOutDates: wash.map((w) => w.washOutDate).filter(Boolean),
      finishDates: finish.map((f) => f.date).filter(Boolean),
      hasWashing: wash.length > 0,
      hasFinishing: finish.length > 0,
    };
    byKey.set(`${lot.lotNumber}|${lot.invoiceNumber}`, entry);
    if (!byLotNumber.has(lot.lotNumber)) byLotNumber.set(lot.lotNumber, []);
    byLotNumber.get(lot.lotNumber).push(entry);
  }

  return { byKey, byLotNumber };
};

// A lot can occupy more than one excel row under the SAME lotNumber+bill (a batch
// split across washers/dates). Collapse those into one comparable record so the
// PCS/short totals line up with the single DB lot instead of double-flagging.
const STAGE_ORDER = { making: 0, washing: 1, finishing: 2 };

const aggregateRows = (rows) => {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.lotNumber}|${toInt(r.bill)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        maker: r.maker, client: r.client, lotNumber: r.lotNumber, bill: r.bill,
        pcs: 0, pcsShort: { making: 0, washing: 0 },
        washingList: [], washSd: '', washEd: '', threadComments: [],
        date: '', style: '', details: '', sizes: '', stage: 'making', rowCount: 0,
      });
    }
    const g = groups.get(key);
    if (!g.date && r.date) g.date = r.date;
    if (!g.style && r.style) g.style = r.style;
    if (!g.details && r.details) g.details = r.details;
    if (!g.sizes && r.sizes) g.sizes = r.sizes;
    g.pcs += r.pcs || 0;
    g.pcsShort.making += r.pcsShort.making || 0;
    g.pcsShort.washing += r.pcsShort.washing || 0;
    if (r.washing && !g.washingList.some((w) => w.toLowerCase() === r.washing.toLowerCase())) {
      g.washingList.push(r.washing);
    }
    if (!g.washSd && r.washSd) g.washSd = r.washSd;
    if (!g.washEd && r.washEd) g.washEd = r.washEd;
    if (r.threadComment) g.threadComments.push(r.threadComment);
    const st = excelStage(r);
    if (STAGE_ORDER[st] > STAGE_ORDER[g.stage]) g.stage = st;
    g.rowCount += 1;
  }
  return [...groups.values()];
};

// ─── Diff one aggregated excel record against its DB match ───────────────────
const diffRow = (row, db) => {
  const fields = [];
  const add = (field, excel, dbVal) => fields.push({ field, excel, db: dbVal });

  // PCS (gross) mismatch — only when DB has produced something to compare.
  if (db.grossPcs > 0 && row.pcs > 0 && row.pcs !== db.grossPcs) {
    add('PCS', row.pcs, db.grossPcs);
  }
  // PCS SHORT — making (M) vs Stitching, washing (W) vs Washing.
  if (row.pcsShort.making !== db.makingShort) {
    add('PCS SHORT (M)', row.pcsShort.making, db.makingShort);
  }
  if (row.pcsShort.washing !== db.washingShort) {
    add('PCS SHORT (W)', row.pcsShort.washing, db.washingShort);
  }
  // Washer — flag only when NONE of the excel washers match a DB washer. Compare
  // on whitespace-collapsed, case-folded names so cosmetic differences like
  // "HARI OM" vs "HARI  OM" don't register as discrepancies.
  if (row.washingList.length) {
    const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const dbSet = new Set(db.washerNames.map(norm));
    const overlap = row.washingList.some((w) => dbSet.has(norm(w)));
    if (!overlap) add('WASHER', row.washingList.join(', '), db.washerNames.join(', ') || '—');
  }
  // Stage / status — flag only when the DB is BEHIND the excel-implied stage. Show the
  // app's stage NAME (e.g. "Stitching"), not the raw status code.
  const minStatus = STAGE_MIN_STATUS[row.stage];
  if (db.status < minStatus) {
    add('STAGE', STAGE_LABELS[row.stage] || row.stage, STATUS_NAMES[db.status] || `status ${db.status}`);
  }
  // FABRIC — the excel's DETAILS column maps to Lot.fabric. Compared on
  // whitespace-collapsed, case-folded text (same treatment as WASHER above) so
  // cosmetic differences don't register. Flagged only when BOTH sides have a value:
  // a blank DETAILS cell or a lot with no fabric recorded is missing data, not a
  // mismatch, and flagging those would bury the real conflicts in noise.
  if (row.details && db.fabric) {
    if(db.fabric.trim().toLowerCase() == 'na') {
      const norm = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
      if (norm(row.details) !== norm(db.fabric)) {
        add('FABRIC', row.details, db.fabric);
      }
    }
  }
  // WASH SD present in excel but no wash-start / stitch-out recorded.
  if (row.washSd && !db.washStartDates.length && !db.stitchOutDates.length) {
    add('WASH SD', row.washSd, '—');
  }
  // WASH ED present in excel but no wash-out / finishing recorded.
  if (row.washEd && !db.washOutDates.length && !db.finishDates.length) {
    add('WASH ED', row.washEd, '—');
  }

  return fields;
};

// ─── Diff ONE aggregated excel record against the DB → a discrepancy or null ──
// Shared by the full compute AND the per-lot resolve (after a record is created).
const buildDiscrepancy = (row, byKey, byLotNumber) => {
  const billNum = toInt(row.bill);
  const keyMatch = row.bill ? byKey.get(`${row.lotNumber}|${billNum}`) : null;
  const lotMatches = byLotNumber.get(row.lotNumber) || [];

  if (!keyMatch && !lotMatches.length) {
    // Lot number itself is absent from the app. Include the excel values so the bell
    // can open the Add Stitching form pre-filled (maker sheet ⇒ stitching vendor).
    const ymd = toYmd(parseDateString(row.date));
    return {
      lotNumber: row.lotNumber,
      bill: row.bill,
      client: row.client,
      maker: row.maker,
      inDb: false,
      fields: [{ field: 'LOT', excel: `${row.lotNumber} (bill ${row.bill || '—'})`, db: 'missing' }],
      excel: {
        lotNumber: row.lotNumber,
        invoiceNumber: billNum || null,
        clientName: row.client,
        vendorName: row.maker,
        fitStyleName: row.style,   // STYLE → Fit Style (lookup; falls back to a hint in the form)
        fabric: row.details,       // DETAILS → Fabric
        waistSize: row.sizes,      // SIZES → Waist Size
        quantity: row.pcs || null,
        threadColors: parseThreadColors(row.threadComments, row.pcs),
        date: ymd,
      },
    };
  }

  // Lot exists — diff its fields. (Bill mismatch when the lot number matched but the bill didn't.)
  const db = keyMatch || lotMatches[0];
  const fields = diffRow(row, db);
  if (row.bill && !keyMatch && lotMatches.length) {
    fields.unshift({ field: 'BILL', excel: row.bill, db: String(db.invoiceNumber) });
  }
  if (!fields.length) return null;

  const disc = { lotNumber: row.lotNumber, bill: row.bill, client: row.client, maker: row.maker, inDb: true, fields };
  // If a sub-record is missing, tag a create-action so the bell opens the matching Add
  // form pre-filled. Washing (WASH SD in excel, none in app) takes priority over finishing.
  const hasWashSd = fields.some((f) => f.field === 'WASH SD');
  const hasWashEd = fields.some((f) => f.field === 'WASH ED');
  if (hasWashSd) {
    disc.action = 'washing';
    disc.washingExcel = {
      washer: row.washingList[0] || '',
      date: toYmd(parseDateString(row.washSd)),
      quantity: row.pcs || null,
      quantityShort: row.pcsShort.washing || 0,
    };
  } else if (hasWashEd) {
    disc.action = 'finishing';
    disc.finishingExcel = { date: toYmd(parseDateString(row.washEd)), quantity: row.pcs || null };
  }
  return disc;
};

// ─── Compute the full discrepancy list (the expensive ~15s job) ──────────────
// This downloads + parses the 19MB workbook and queries the DB, so it must NOT run
// on a user request — it's driven by the cron/precompute job and manual refresh,
// which persist the result via runMakingsRecon() for the bell to read instantly.
// Returns the aggregated `records` too so they can be stored for per-lot re-diffs.
const computeMakingsDiff = async () => {
  const buf = await downloadWorkbookBytes();
  const { rows, seenSheets } = parseWorkbook(buf);
  const records = aggregateRows(rows);

  const lotNumbers = [...new Set(records.map((r) => r.lotNumber).filter(Boolean))];
  const { byKey, byLotNumber } = await gatherDbByLot(lotNumbers);

  const discrepancies = [];
  for (const row of records) {
    const disc = buildDiscrepancy(row, byKey, byLotNumber);
    if (disc) discrepancies.push(disc);
  }

  return { count: discrepancies.length, discrepancies, scannedRows: rows.length, sheets: seenSheets, records };
};

// ─── Run the recon and persist the singleton MakingsDiff doc ─────────────────
// Used by the Vercel Cron endpoint and the manual "refresh" button. On failure we
// keep the last-good discrepancies but flag status:'error' with the message, so the
// bell can show that the last refresh failed without losing prior results.
const runMakingsRecon = async () => {
  const startedAt = Date.now();
  try {
    const { records, ...result } = await computeMakingsDiff();
    // Persist the excel snapshot (excelRows) so a single lot can be re-diffed cheaply
    // after its record is created — without re-downloading/parsing the 19MB workbook.
    const doc = {
      key: 'latest',
      ...result,
      excelRows: records || [],
      status: 'ok',
      error: null,
      computedMs: Date.now() - startedAt,
      generatedAt: new Date(),
    };
    await MakingsDiff.findOneAndUpdate({ key: 'latest' }, doc, { upsert: true, new: true });
    const { excelRows, ...clientDoc } = doc; // don't ship the snapshot to callers/UI
    return clientDoc;
  } catch (err) {
    await MakingsDiff.findOneAndUpdate(
      { key: 'latest' },
      { $set: { key: 'latest', status: 'error', error: err.message, computedMs: Date.now() - startedAt, generatedAt: new Date() } },
      { upsert: true }
    );
    throw err;
  }
};

// ─── Read the stored diff (fast — this is what the bell request hits) ─────────
// excelRows is the internal snapshot for re-diffing — never sent to the UI.
const getStoredMakingsDiff = async () => {
  const doc = await MakingsDiff.findOne({ key: 'latest' }).select('-excelRows').lean();
  if (!doc) {
    return { count: 0, discrepancies: [], scannedRows: 0, sheets: [], status: 'empty', generatedAt: null };
  }
  return doc;
};

// ─── Re-diff a SINGLE lot after its record was created/edited, and update the ──
// stored doc in place. Uses the stored excel snapshot + a fresh DB read for just
// that lot — fast (no workbook download/parse), so it can run on a user request.
// This keeps the bell accurate immediately after the user acts on a lot, instead
// of showing a stale "missing" notification until the next full recon.
const resolveLotDiscrepancy = async ({ lotNumber } = {}) => {
  if (!lotNumber) return getStoredMakingsDiff();
  // Read lean (needs excelRows to re-diff) but write back ONLY discrepancies+count — never
  // re-persist the large excelRows snapshot on a normal record save (avoids write amplification).
  const doc = await MakingsDiff.findOne({ key: 'latest' })
    .select('discrepancies excelRows count scannedRows sheets status generatedAt').lean();
  if (!doc) return getStoredMakingsDiff();
  const strip = (d) => { const { excelRows, ...rest } = d; return rest; };

  const snapshot = doc.excelRows || [];
  // Without a snapshot (first-ever run, or a status:'error' doc) we can't re-diff — leave the
  // stored result untouched rather than blindly deleting a still-valid discrepancy.
  if (!snapshot.length) return strip(doc);

  // Match by lotNumber only (unique in the app): re-diff ALL its excel rows against the current
  // DB, and replace ALL its stored discrepancies. Avoids bill-normalisation edge cases.
  const sameLot = (o) => o && o.lotNumber === lotNumber;
  const rows = snapshot.filter(sameLot);
  let fresh = [];
  if (rows.length) {
    const { byKey, byLotNumber } = await gatherDbByLot([lotNumber]);
    fresh = rows.map((r) => buildDiscrepancy(r, byKey, byLotNumber)).filter(Boolean);
  }
  const nextDiscrepancies = (doc.discrepancies || []).filter((d) => !sameLot(d)).concat(fresh);

  // Guard against clobbering a fresher full recon: only apply if generatedAt is unchanged since
  // our read. If a cron/refresh landed in between, its result wins (and the bell re-reads it).
  await MakingsDiff.updateOne(
    { key: 'latest', generatedAt: doc.generatedAt },
    { $set: { discrepancies: nextDiscrepancies, count: nextDiscrepancies.length } }
  );
  return { ...strip(doc), discrepancies: nextDiscrepancies, count: nextDiscrepancies.length };
};

module.exports = {
  computeMakingsDiff,
  runMakingsRecon,
  getStoredMakingsDiff,
  resolveLotDiscrepancy,
  parseWorkbook,
  parsePcsShort,
  excelStage,
};

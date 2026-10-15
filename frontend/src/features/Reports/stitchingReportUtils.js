import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Branding ────────────────────────────────────────────────────────────────
export const BRAND = {
  wordmark: 'GREYSAGE',
  tagline: 'CLOTHING', // '' hides it
  dark: '#2F3A36', // header band, headings
  sage: '#9CAF88', // accent rules, card bars
  sageDeep: '#6F8A5E', // small labels on white
  headerFill: '#E8EEE6',
  cardFill: '#F4F7F2',
  zebra: '#F7F9F6',
  footFill: '#DDE6D9',
  rule: '#E3E8E1',
  ink: '#2B2F2D', // body text
  muted: '#6E7672',
  warn: '#B4533C', // shorts, INTERNAL
  amber: '#F2C27A', // INTERNAL on the dark band
};

// ─── Statuses and views ──────────────────────────────────────────────────────
// Same wording as OrderStatusChip, except 1: the chip still says "Placed" from the Orders
// era; the Lot schema calls it Cut. Keep in sync with stitchingReportService.js.
export const STATUS_LABELS = {
  1: 'Cut', 2: 'Stitching', 3: 'Washing', 4: 'Finishing', 5: 'Finished', 6: 'Part Dispatch', 7: 'Dispatched',
};
export const STATUS_ORDER = [1, 2, 3, 4, 5, 6, 7];
// One colour per status: PDF pills, dots and bar; Excel status text.
export const STATUS_COLORS = {
  1: '#9AA3A8', 2: '#5B7F6B', 3: '#5E8CA8', 4: '#C39A4E', 5: '#7FA36B', 6: '#8E7CA8', 7: '#3F6F6A',
};
const LABEL_STATUS = Object.fromEntries(Object.entries(STATUS_LABELS).map(([k, v]) => [v, Number(k)]));
export const DEFAULT_STATUSES = [2, 3, 4]; // what the 14 Oct client copy covered

// CLIENT = the copy that goes out (14 Oct layout). FULL = internal, admins only.
export const VIEW = { CLIENT: 'client', FULL: 'full' };

export const FOOTNOTE = {
  client: '* Pcs = pieces after stitching. Lots not yet stitched show their cut pieces.',
  full: '* Pcs = net stitched (stitched − short), the figure passed on to washing. Lots not yet stitched count their cut pieces.',
};

// ─── Formatting ──────────────────────────────────────────────────────────────
// Lot dates are IST calendar days. Read them in IST explicitly; a browser on another
// timezone would otherwise show some of them a day early.
const IST = 'Asia/Kolkata';
const istParts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' });
const istLong = new Intl.DateTimeFormat('en-GB', { timeZone: IST, day: '2-digit', month: 'short', year: 'numeric' });
export const istDay = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const p = Object.fromEntries(istParts.formatToParts(dt).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
};
const ymd = (d) => istDay(d).split('-').map(Number);
const istExcelDate = (d) => { // exceljs converts dates as UTC
  if (!istDay(d)) return null;
  const [y, m, day] = ymd(d);
  return new Date(Date.UTC(y, m - 1, day));
};
const dmy = (iso) => (iso ? iso.split('-').reverse().join('/') : '');
export const fmtDay = (d) => dmy(istDay(d));
const fmtLong = (d) => (d ? istLong.format(new Date(d)) : ''); // 15 Oct 2026
const fmtLongIso = (iso) => fmtLong(new Date(`${iso}T12:00:00+05:30`));
export const fmtInt = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('en-IN'));
export const formatCell = (v) => (typeof v === 'number' ? fmtInt(v) : (v ?? ''));
const pct = (part, whole) => (whole ? `${((part / whole) * 100).toFixed(1)}%` : '');
export const reportTitle = (client) =>
  `Stitching Report — ${client.name}${client.clientCode ? ` (${client.clientCode})` : ''}`;
const fileName = (client, view, ext) => {
  const name = String(client.name || 'client').trim().replace(/[<>:"/\\|?*]+/g, '').replace(/\s+/g, '-');
  return `stitching_${name}_${istDay(new Date())}${view === VIEW.FULL ? '_INTERNAL' : ''}.${ext}`;
};

// ─── Colour helpers ──────────────────────────────────────────────────────────
const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const toHex = (c) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
// Heat-map tint for the fit style × status grid: white → sage by the cell's share of the largest cell.
const heat = (v, max) => {
  const k = 0.12 + 0.5 * (max ? v / max : 0);
  return rgb(BRAND.sage).map((x) => Math.round(255 + (x - 255) * k));
};

// ─── Summary maths ───────────────────────────────────────────────────────────
const blank = () => ({ lots: 0, cut: 0, stitched: 0, short: 0, net: 0, pcs: 0 });
const add = (acc, r) => {
  acc.lots += 1;
  acc.cut += r.cutPcs || 0;
  acc.stitched += r.stitched || 0;
  acc.short += r.short || 0;
  acc.net += r.net || 0;
  acc.pcs += r.pcs || 0;
  return acc;
};

export const summarise = (rows) => {
  const totals = blank();
  const status = new Map();
  const fits = new Map();
  rows.forEach((r) => {
    add(totals, r);
    if (!status.has(r.status)) status.set(r.status, { status: r.status, label: STATUS_LABELS[r.status] || r.statusLabel, ...blank() });
    add(status.get(r.status), r);
    const key = r.fitStyleId || r.fitStyle; // grouped by id, never by name
    if (!fits.has(key)) fits.set(key, { fitStyleId: r.fitStyleId, fitStyle: r.fitStyle, byStatus: {}, ...blank() });
    const f = add(fits.get(key), r);
    f.byStatus[r.status] = (f.byStatus[r.status] || 0) + (r.pcs || 0);
  });
  const statusCols = STATUS_ORDER.filter((s) => status.has(s));
  return {
    totals,
    statusCols,
    byStatus: statusCols.map((s) => status.get(s)),
    byFitStyle: [...fits.values()].sort((a, b) => b.pcs - a.pcs || a.fitStyle.localeCompare(b.fitStyle)),
  };
};

// One definition per table, drawn three ways (screen, Excel, PDF) so the numbers can't
// drift apart. A cell is a number, a string, or null (blank, as in the client's grid).
export const buildSummaryTables = ({ totals, statusCols, byStatus, byFitStyle }, view) => {
  const statusPcs = Object.fromEntries(byStatus.map((s) => [s.status, s.pcs]));
  const grid = {
    key: 'grid',
    title: 'Fit Style × Status (pcs*)',
    head: ['Fit Style', 'Lots', ...statusCols.map((s) => STATUS_LABELS[s]), 'Total'],
    body: byFitStyle.map((f) => [f.fitStyle, f.lots, ...statusCols.map((s) => f.byStatus[s] || null), f.pcs]),
    foot: ['Total', totals.lots, ...statusCols.map((s) => statusPcs[s] || null), totals.pcs],
    numericFrom: 1,
  };
  if (view !== VIEW.FULL) {
    return [{
      key: 'status',
      title: 'Current Lot Status',
      head: ['Status', 'Lots', 'Pcs*'],
      body: byStatus.map((s) => [s.label, s.lots, s.pcs]),
      foot: ['Total', totals.lots, totals.pcs],
      numericFrom: 1,
    }, grid];
  }
  return [
    {
      key: 'totals',
      title: 'Totals',
      head: ['Lots', 'Cut', 'Stitched', 'Short', 'Short %', 'Net', 'Pcs*'],
      body: [[totals.lots, totals.cut, totals.stitched, totals.short, pct(totals.short, totals.stitched), totals.net, totals.pcs]],
      numericFrom: 0,
    },
    {
      key: 'status',
      title: 'Current Lot Status',
      head: ['Status', 'Lots', 'Cut', 'Stitched', 'Short', 'Net', 'Pcs*'],
      body: byStatus.map((s) => [s.label, s.lots, s.cut, s.stitched, s.short, s.net, s.pcs]),
      foot: ['Total', totals.lots, totals.cut, totals.stitched, totals.short, totals.net, totals.pcs],
      numericFrom: 1,
    },
    {
      key: 'fit',
      title: 'Fit Styles',
      head: ['Fit Style', 'Lots', 'Cut', 'Stitched', 'Short', 'Short %', 'Net', 'Pcs*'],
      body: byFitStyle.map((f) => [f.fitStyle, f.lots, f.cut, f.stitched, f.short, pct(f.short, f.stitched), f.net, f.pcs]),
      foot: ['Total', totals.lots, totals.cut, totals.stitched, totals.short, pct(totals.short, totals.stitched), totals.net, totals.pcs],
      numericFrom: 1,
    },
    grid,
  ];
};

// Headline figures: cards on the PDF's first page, a band on the Excel summary. In the
// exports these replace the full view's "Totals" table (same numbers).
const kpis = ({ totals, statusCols, byFitStyle }, view) => {
  const fits = byFitStyle.length;
  if (view !== VIEW.FULL) {
    return [
      { label: 'Lots', value: totals.lots, note: `across ${statusCols.length} stage${statusCols.length === 1 ? '' : 's'}` },
      { label: 'Pieces*', value: totals.pcs, note: 'current piece count' },
      { label: 'Fit styles', value: fits, note: byFitStyle[0] ? `largest: ${byFitStyle[0].fitStyle}` : '' },
      { label: 'Avg per lot', value: totals.lots ? Math.round(totals.pcs / totals.lots) : 0, note: 'pieces' },
    ];
  }
  return [
    { label: 'Lots', value: totals.lots, note: `${fits} fit style${fits === 1 ? '' : 's'}` },
    { label: 'Cut', value: totals.cut, note: 'from cutting sheets' },
    { label: 'Stitched', value: totals.stitched, note: 'sent to stitching' },
    { label: 'Short', value: totals.short, note: totals.stitched ? `${pct(totals.short, totals.stitched)} of stitched` : '', warn: totals.short > 0 },
    { label: 'Net', value: totals.net, note: 'stitched - short' },
    { label: 'Pieces*', value: totals.pcs, note: 'report figure' },
  ];
};

// type: text | code (number shown as-is) | int (summed in the totals row) | date
const col = (key, header, type, width) => ({ key, header, type, width, get: (r) => r[key] });
export const lotColumns = (view) => (view === VIEW.FULL ? [
  col('lotNumber', 'Lot No', 'text', 12),
  col('makerInv', 'Maker Bill', 'code', 10),
  col('date', 'Lot Date', 'date', 11),
  col('fitStyle', 'Fit Style', 'text', 20),
  col('fabric', 'Fabric', 'text', 12),
  col('waistSize', 'Waist', 'text', 16),
  col('vendor', 'Vendor', 'text', 16),
  col('stitchIn', 'Stitch In', 'date', 11),
  col('stitchOut', 'Stitch Out', 'date', 11),
  col('cutPcs', 'Cut', 'int', 8),
  col('stitched', 'Stitched', 'int', 9),
  col('short', 'Short', 'int', 8),
  col('net', 'Net', 'int', 8),
  col('pcs', 'Pcs*', 'int', 8),
  col('statusLabel', 'Status', 'text', 14),
] : [
  // Same columns and order as the 14 Oct client copy (Net is now Pcs*: Cut lots have no net).
  col('lotNumber', 'Lot No', 'text', 12),
  col('makerInv', 'Invoice', 'code', 10),
  col('fitStyle', 'Fit Style', 'text', 22),
  col('waistSize', 'Waist', 'text', 18),
  col('pcs', 'Pcs*', 'int', 9),
  col('statusLabel', 'Status', 'text', 14),
]);
const sumCol = (rows, c) => rows.reduce((s, r) => s + (Number(c.get(r)) || 0), 0);

export const describeReport = ({ filters, loaded, included, view }) => {
  const parts = [filters.statuses.length ? filters.statuses.map((s) => STATUS_LABELS[s]).join(', ') : 'All statuses'];
  if (filters.from && filters.to) parts.push(`Lot dates ${fmtLongIso(filters.from)} – ${fmtLongIso(filters.to)}`);
  else if (filters.from) parts.push(`Lot dates from ${fmtLongIso(filters.from)}`);
  else if (filters.to) parts.push(`Lot dates up to ${fmtLongIso(filters.to)}`);
  parts.push(`${included} lot${included === 1 ? '' : 's'}`);
  // Internal copy only: the client copy must never show that lots were left out.
  if (view === VIEW.FULL && loaded > included) parts.push(`${loaded - included} of ${loaded} loaded lots unticked`);
  parts.push(`As of ${fmtLong(new Date())}`);
  return parts.join('  ·  ');
};

const download = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

// ─── Excel ───────────────────────────────────────────────────────────────────
let excelJsPromise = null;
// Loaded on the first Excel export only, so exceljs stays out of the main bundle.
const loadExcelJS = () => {
  if (!excelJsPromise) {
    excelJsPromise = import('exceljs')
      .then((m) => m.default || m)
      .catch((e) => { excelJsPromise = null; throw e; });
  }
  return excelJsPromise;
};

const argb = (hex) => `FF${hex.replace('#', '').toUpperCase()}`;
const solid = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const spaced = (s) => s.split('').join(' '); // Excel has no letter-spacing
const INT_FMT = '#,##0';
const RULE = { style: 'thin', color: { argb: argb(BRAND.rule) } };
const SAGE_RULE = { style: 'medium', color: { argb: argb(BRAND.sage) } };
const DARK_RULE = { style: 'medium', color: { argb: argb(BRAND.dark) } };
const ff = (s) => String(s ?? '').replace(/&/g, '&&'); // escape & in header/footer codes

const put = (cell, value, style = {}) => {
  cell.value = value;
  Object.entries(style).forEach(([k, v]) => { cell[k] = v; });
};

// Rows 1–3: dark band (wordmark; tagline / INTERNAL) and sage rule. Row 4 title, row 5 description.
const brandHeader = (ws, lastCol, { title, description, view }) => {
  const band = (row, value, font, height, fill) => {
    ws.mergeCells(row, 1, row, lastCol);
    put(ws.getCell(row, 1), value, { font, fill: solid(fill), alignment: { vertical: 'middle', horizontal: 'left', indent: 1 } });
    ws.getRow(row).height = height;
  };
  const internal = view === VIEW.FULL;
  const sub = [];
  if (BRAND.tagline) sub.push({ text: spaced(BRAND.tagline), font: { size: 9, color: { argb: argb(BRAND.sage) } } });
  if (internal) sub.push({ text: `${sub.length ? '          ' : ''}INTERNAL — NOT FOR CLIENT`, font: { size: 9, bold: true, color: { argb: argb(BRAND.amber) } } });
  band(1, spaced(BRAND.wordmark), { size: 18, bold: true, color: { argb: 'FFFFFFFF' } }, 30, BRAND.dark);
  band(2, sub.length ? { richText: sub } : null, { size: 9 }, 16, BRAND.dark);
  band(3, null, {}, 4, BRAND.sage);
  ws.mergeCells(4, 1, 4, lastCol);
  put(ws.getCell(4, 1), title, { font: { size: 15, bold: true, color: { argb: argb(BRAND.dark) } }, alignment: { vertical: 'bottom' } });
  ws.getRow(4).height = 28;
  ws.mergeCells(5, 1, 5, lastCol);
  put(ws.getCell(5, 1), description, { font: { size: 9, italic: true, color: { argb: argb(BRAND.muted) } }, alignment: { vertical: 'top' } });
  ws.getRow(5).height = 18;
  return 6; // first free row
};

// kind: head | body | foot. Body rows get a hairline underneath and optional striping.
const writeRow = (ws, r, values, isRight, kind = 'body', zebra = false) => {
  values.forEach((v, i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = v === '' || v === undefined ? null : v;
    if (typeof v === 'number') cell.numFmt = INT_FMT;
    cell.alignment = { horizontal: isRight(i) ? 'right' : 'left', vertical: 'middle' };
    if (kind === 'head') {
      cell.font = { bold: true, size: 9, color: { argb: argb(BRAND.dark) } };
      cell.fill = solid(BRAND.headerFill);
      cell.border = { bottom: SAGE_RULE };
    } else if (kind === 'foot') {
      cell.font = { bold: true, color: { argb: argb(BRAND.dark) } };
      cell.fill = solid(BRAND.footFill);
      cell.border = { top: DARK_RULE };
    } else {
      cell.font = { color: { argb: argb(BRAND.ink) } };
      cell.border = { bottom: RULE };
      if (zebra) cell.fill = solid(BRAND.zebra);
    }
  });
  ws.getRow(r).height = kind === 'head' ? 20 : 18;
};

const writeKpis = (ws, r, list) => {
  list.forEach((k, i) => {
    const accent = { left: { style: 'thick', color: { argb: argb(k.warn ? BRAND.warn : BRAND.sage) } } };
    const card = { fill: solid(BRAND.cardFill), border: accent };
    put(ws.getCell(r, i + 1), k.label.toUpperCase(), {
      ...card, font: { size: 8, bold: true, color: { argb: argb(BRAND.muted) } }, alignment: { indent: 1, vertical: 'bottom' },
    });
    put(ws.getCell(r + 1, i + 1), k.value, {
      ...card, numFmt: INT_FMT,
      font: { size: 18, bold: true, color: { argb: argb(k.warn ? BRAND.warn : BRAND.dark) } },
      alignment: { horizontal: 'left', indent: 1, vertical: 'middle' },
    });
    put(ws.getCell(r + 2, i + 1), k.note || null, {
      ...card, font: { size: 8, italic: true, color: { argb: argb(BRAND.muted) } }, alignment: { indent: 1, vertical: 'top' },
    });
  });
  ws.getRow(r).height = 18;
  ws.getRow(r + 1).height = 30;
  ws.getRow(r + 2).height = 16;
  return r + 4;
};

const writeSummaryTable = (ws, startRow, t) => {
  let r = startRow;
  const n = t.head.length;
  const isRight = (i) => i >= t.numericFrom;
  put(ws.getCell(r, 1), t.title.toUpperCase(), { font: { bold: true, size: 10, color: { argb: argb(BRAND.dark) } } });
  ws.getRow(r).height = 20;
  r += 1;
  writeRow(ws, r, t.head, isRight, 'head');
  r += 1;
  const max = t.key === 'grid'
    ? Math.max(0, ...t.body.flatMap((row) => row.slice(2, n - 1).map((v) => Number(v) || 0)))
    : 0;
  t.body.forEach((row, idx) => {
    writeRow(ws, r, row, isRight, 'body', idx % 2 === 1);
    ws.getCell(r, n).font = { bold: true, color: { argb: argb(BRAND.ink) } }; // Total / Pcs* column
    if (t.key === 'status') {
      const s = LABEL_STATUS[row[0]];
      ws.getCell(r, 1).font = { bold: true, color: { argb: argb(STATUS_COLORS[s] || BRAND.ink) } };
    }
    if (t.key === 'grid') {
      row.forEach((v, i) => {
        if (i >= 2 && i < n - 1 && v) ws.getCell(r, i + 1).fill = solid(toHex(heat(v, max)));
      });
    }
    r += 1;
  });
  if (t.foot) { writeRow(ws, r, t.foot, isRight, 'foot'); r += 1; }
  return r + 1;
};

export const exportExcel = async ({ client, rows, view, description }) => {
  const ExcelJS = await loadExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GreySage ERP';
  wb.created = new Date();
  const full = view === VIEW.FULL;
  const meta = { title: reportTitle(client), description, view };
  const summary = summarise(rows);
  const tables = buildSummaryTables(summary, view).filter((t) => t.key !== 'totals');
  const cards = kpis(summary, view);
  const cols = lotColumns(view);
  const noteFont = { size: 9, italic: true, color: { argb: argb(BRAND.muted) } };
  const footer = `&L&8${ff(BRAND.wordmark)} · Stitching Report - ${ff(client.name)}${full ? '&C&8INTERNAL - NOT FOR CLIENT' : ''}&R&8Page &P of &N`;

  // Summary sheet
  const width = Math.max(cards.length, ...tables.map((t) => t.head.length));
  const ss = wb.addWorksheet('Summary', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: argb(BRAND.dark) } },
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    headerFooter: { oddFooter: footer },
  });
  ss.columns = Array.from({ length: width }, (_, i) => ({ width: i === 0 ? 24 : 14 }));
  let r = brandHeader(ss, width, meta) + 1;
  r = writeKpis(ss, r, cards);
  tables.forEach((t) => { r = writeSummaryTable(ss, r, t); });
  put(ss.getCell(r, 1), FOOTNOTE[view], { font: noteFont });

  // Lots sheet
  const ls = wb.addWorksheet('Lots', {
    views: [{ state: 'frozen', ySplit: 6 }],
    properties: { tabColor: { argb: argb(BRAND.sage) } },
    pageSetup: {
      paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '6:6',
    },
    headerFooter: { oddFooter: footer },
  });
  ls.columns = cols.map((c) => ({ width: c.width }));
  const head = brandHeader(ls, cols.length, meta);
  writeRow(ls, head, cols.map((c) => c.header), (i) => cols[i].type === 'int', 'head');
  const ink = { argb: argb(BRAND.ink) };
  rows.forEach((row, idx) => {
    const rn = head + 1 + idx;
    cols.forEach((c, i) => {
      const cell = ls.getCell(rn, i + 1);
      const v = c.get(row);
      if (c.type === 'date') { cell.value = istExcelDate(v); cell.numFmt = 'dd/mm/yyyy'; }
      else if (c.type === 'int') { cell.value = v ?? null; cell.numFmt = INT_FMT; }
      else if (c.type === 'code') { cell.value = v ?? null; cell.numFmt = '0'; }
      else cell.value = v || null;
      cell.alignment = { horizontal: c.type === 'int' ? 'right' : 'left', vertical: 'middle' };
      cell.border = { bottom: RULE };
      if (idx % 2 === 1) cell.fill = solid(BRAND.zebra);
      cell.font = { color: ink };
      if (c.key === 'lotNumber' || c.key === 'pcs') cell.font = { bold: true, color: ink };
      if (c.key === 'statusLabel') cell.font = { bold: true, color: { argb: argb(STATUS_COLORS[row.status] || BRAND.ink) } };
      if (c.key === 'short' && v > 0) cell.font = { bold: true, color: { argb: argb(BRAND.warn) } };
    });
    ls.getRow(rn).height = 17;
  });
  const first = head + 1;
  const last = head + rows.length;
  ls.autoFilter = { from: { row: head, column: 1 }, to: { row: last, column: cols.length } };
  // SUBTOTAL skips rows hidden by the autofilter, so totals follow any filter used in Excel.
  cols.forEach((c, i) => {
    const cell = ls.getCell(last + 1, i + 1);
    const L = ls.getColumn(i + 1).letter;
    if (i === 0) cell.value = 'TOTAL';
    else if (c.type === 'int') {
      cell.value = { formula: `SUBTOTAL(109,${L}${first}:${L}${last})`, result: sumCol(rows, c) };
      cell.numFmt = INT_FMT;
    } else if (i === cols.length - 1) {
      cell.value = { formula: `SUBTOTAL(103,A${first}:A${last})&" lots"`, result: `${rows.length} lots` };
    }
    cell.font = { bold: true, color: { argb: argb(BRAND.dark) } };
    cell.fill = solid(BRAND.footFill);
    cell.alignment = { horizontal: c.type === 'int' ? 'right' : 'left', vertical: 'middle' };
    cell.border = { top: DARK_RULE };
  });
  ls.getRow(last + 1).height = 20;
  put(ls.getCell(last + 3, 1), FOOTNOTE[view], { font: noteFont });

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName(client, view, 'xlsx'));
};

// ─── PDF ─────────────────────────────────────────────────────────────────────
// jsPDF's Helvetica is WinAnsi-only; keep the characters we write ourselves plain.
const ascii = (s) => String(s ?? '').replace(/\s*×\s*/g, ' by ').replace(/[—–−]/g, '-');
const pdfCell = (v) => (typeof v === 'number' ? fmtInt(v) : ascii(v));

export const exportPdf = async ({ client, rows, view, description }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const CW = W - 2 * M; // content width
  const BAND = 15; // header band height
  const TOP = BAND + 9; // first content line on continuation pages
  const BOTTOM = 15; // clear of the footer
  const full = view === VIEW.FULL;
  const summary = summarise(rows);
  const tables = buildSummaryTables(summary, view).filter((t) => t.key !== 'totals');
  const cols = lotColumns(view);
  const now = new Date();

  const font = (style, size, color) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...rgb(color));
  };
  const spacedRight = (text, xRight, y, cs) => {
    const w = doc.getTextWidth(text) + cs * (text.length - 1);
    doc.text(text, xRight - w, y, { charSpace: cs });
  };
  // Small uppercase section label with a short sage rule under it.
  const section = (text, x, y) => {
    font('bold', 8, BRAND.dark);
    doc.text(ascii(text).toUpperCase(), x, y, { charSpace: 0.5 });
    doc.setDrawColor(...rgb(BRAND.sage));
    doc.setLineWidth(0.7);
    doc.line(x, y + 1.8, x + 10, y + 1.8);
  };
  // Rounded status / INTERNAL pill, vertically centred on cy. Returns its width.
  const pill = (label, color, x, cy, alignRight = false) => {
    font('bold', 6.5, '#FFFFFF');
    const w = doc.getTextWidth(label) + 4.4;
    const left = alignRight ? x - w : x;
    doc.setFillColor(...rgb(color));
    doc.roundedRect(left, cy - 2.1, w, 4.2, 2.1, 2.1, 'F');
    font('bold', 6.5, '#FFFFFF');
    doc.text(label, left + w / 2, cy, { align: 'center', baseline: 'middle' });
    return w;
  };

  const base = {
    theme: 'plain',
    styles: {
      font: 'helvetica', fontSize: 8.5, textColor: rgb(BRAND.ink),
      cellPadding: { top: 1.8, right: 2, bottom: 1.8, left: 2 },
      lineColor: rgb(BRAND.rule), lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 },
    },
    headStyles: {
      fillColor: rgb(BRAND.headerFill), textColor: rgb(BRAND.dark), fontStyle: 'bold', fontSize: 7.5,
      lineColor: rgb(BRAND.sage), lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 },
    },
    footStyles: {
      fillColor: rgb(BRAND.footFill), textColor: rgb(BRAND.dark), fontStyle: 'bold',
      lineColor: rgb(BRAND.dark), lineWidth: { top: 0.35, right: 0, bottom: 0, left: 0 },
    },
    alternateRowStyles: { fillColor: rgb(BRAND.zebra) },
    showFoot: 'lastPage',
  };

  const drawTable = (t, x, w, startY) => {
    const n = t.head.length;
    const heatMax = t.key === 'grid'
      ? Math.max(0, ...t.body.flatMap((row) => row.slice(2, n - 1).map((v) => Number(v) || 0)))
      : 0;
    autoTable(doc, {
      ...base,
      startY,
      margin: { left: x, right: W - x - w, top: TOP, bottom: BOTTOM },
      tableWidth: w,
      head: [t.head.map((h) => ascii(h).toUpperCase())],
      body: t.body.map((row) => row.map(pdfCell)),
      foot: t.foot ? [t.foot.map(pdfCell)] : undefined,
      didParseCell: (d) => {
        d.cell.styles.halign = d.column.index >= t.numericFrom ? 'right' : 'left';
        if (d.section !== 'body') return;
        if (d.column.index === n - 1 && t.key !== 'totals') d.cell.styles.fontStyle = 'bold';
        if (t.key === 'status' && d.column.index === 0) {
          d.cell.styles.cellPadding = { top: 1.8, right: 2, bottom: 1.8, left: 6.5 };
        }
        if (t.key === 'grid' && d.column.index >= 2 && d.column.index < n - 1) {
          const v = Number(t.body[d.row.index][d.column.index]) || 0;
          if (v) d.cell.styles.fillColor = heat(v, heatMax);
        }
      },
      didDrawCell: (d) => {
        // Status colour: a dot before each status name, a bar under each status column head.
        if (t.key === 'status' && d.section === 'body' && d.column.index === 0) {
          const s = LABEL_STATUS[t.body[d.row.index][0]];
          doc.setFillColor(...rgb(STATUS_COLORS[s] || BRAND.muted));
          doc.circle(d.cell.x + 3.4, d.cell.y + d.cell.height / 2, 1.3, 'F');
        }
        if (t.key === 'grid' && d.section === 'head' && d.column.index >= 2 && d.column.index < n - 1) {
          const s = LABEL_STATUS[t.head[d.column.index]];
          doc.setFillColor(...rgb(STATUS_COLORS[s] || BRAND.muted));
          doc.rect(d.cell.x + 2, d.cell.y + d.cell.height - 1.4, d.cell.width - 4, 0.9, 'F');
        }
      },
    });
    return doc.lastAutoTable.finalY;
  };

  // ── Page 1: title block ──
  let y = BAND + 10;
  font('bold', 7.5, BRAND.sageDeep);
  doc.text('STITCHING REPORT', M, y, { charSpace: 1.2 });
  y += 9;
  const name = ascii(client.name);
  font('bold', 22, BRAND.dark);
  doc.text(name, M, y);
  if (client.clientCode) {
    const nx = M + doc.getTextWidth(name) + 3.5;
    font('normal', 11, BRAND.muted);
    doc.text(ascii(client.clientCode), nx, y);
  }
  if (full) pill('INTERNAL - NOT FOR CLIENT', BRAND.warn, W - M, y - 2.6, true);
  y += 6;
  font('normal', 8.5, BRAND.muted);
  const descLines = doc.splitTextToSize(ascii(description), CW);
  doc.text(descLines, M, y);
  y += (descLines.length - 1) * 3.8 + 4;
  doc.setDrawColor(...rgb(BRAND.rule));
  doc.setLineWidth(0.3);
  doc.line(M, y, W - M, y);
  y += 7;

  // ── KPI cards ──
    // ── KPI cards ──
  const cards = kpis(summary, view);
  const GAP = 5;
  const CARD_H = 21;
  const SECTION_GAP = 16; // space between page-1 sections
  const cardW = (CW - GAP * (cards.length - 1)) / cards.length;
  cards.forEach((k, i) => {
    const x = M + i * (cardW + GAP);
    doc.setFillColor(...rgb(BRAND.cardFill));
    doc.roundedRect(x, y, cardW, CARD_H, 2, 2, 'F');
    doc.setFillColor(...rgb(k.warn ? BRAND.warn : BRAND.sage));
    doc.roundedRect(x, y, 1.4, CARD_H, 0.7, 0.7, 'F');
    font('bold', 6.8, BRAND.muted);
    doc.text(ascii(k.label).toUpperCase(), x + 5, y + 6, { charSpace: 0.4 });
    font('bold', 18, k.warn ? BRAND.warn : BRAND.dark);
    doc.text(fmtInt(k.value), x + 5, y + 14.2);
    if (k.note) {
      font('normal', 7, BRAND.muted);
      doc.text(doc.splitTextToSize(ascii(k.note), cardW - 8)[0], x + 5, y + 18.6);
    }
  });
  y += CARD_H + SECTION_GAP;

  // ── Pieces by status: proportional bar + legend ──
  section('Pieces by status', M, y);
  y += 6.5;
  const BAR_H = 6;
  const total = summary.totals.pcs;
  doc.setFillColor(...rgb('#EEF1EC'));
  doc.rect(M, y, CW, BAR_H, 'F');
  let bx = M;
  summary.byStatus.forEach((s) => {
    const sw = total ? (s.pcs / total) * CW : 0;
    if (sw <= 0) return;
    doc.setFillColor(...rgb(STATUS_COLORS[s.status] || BRAND.muted));
    doc.rect(bx, y, sw, BAR_H, 'F');
    if (sw > 16) {
      font('bold', 7, '#FFFFFF');
      doc.text(`${Math.round((s.pcs / total) * 100)}%`, bx + sw / 2, y + BAR_H / 2, { align: 'center', baseline: 'middle' });
    }
    bx += sw;
  });
  y += BAR_H + 6;
  let lx = M;
  summary.byStatus.forEach((s) => {
    const rest = `  ${fmtInt(s.pcs)} pcs · ${s.lots} lot${s.lots === 1 ? '' : 's'}`;
    font('bold', 8, BRAND.ink);
    const nw = doc.getTextWidth(s.label);
    font('normal', 8, BRAND.muted);
    const itemW = 4.5 + nw + doc.getTextWidth(rest);
    if (lx > M && lx + itemW > W - M) { lx = M; y += 5; }
    doc.setFillColor(...rgb(STATUS_COLORS[s.status] || BRAND.muted));
    doc.roundedRect(lx, y - 2.6, 3, 3, 0.6, 0.6, 'F');
    font('bold', 8, BRAND.ink);
    doc.text(s.label, lx + 4.5, y);
    font('normal', 8, BRAND.muted);
    doc.text(rest, lx + 4.5 + nw, y);
    lx += itemW + 9;
  });
  y += SECTION_GAP;

  // ── Current lot status: full width, the last section on page 1 ──
  const block = (t, top) => { section(t.title, M, top); return drawTable(t, M, CW, top + 6); };
  const footnote = () => {
    if (y > H - BOTTOM - 4) { doc.addPage(); y = TOP + 3; }
    font('italic', 7.5, BRAND.muted);
    doc.text(ascii(FOOTNOTE[view]), M, y);
  };
  y = block(tables.find((t) => t.key === 'status'), y) + 8;
  footnote();

  // ── Page 2: fit style by status, always on a fresh page like the lot details ──
  doc.addPage();
  y = block(tables.find((t) => t.key === 'grid'), TOP) + 8;
  const fitT = tables.find((t) => t.key === 'fit'); // Full details only
  if (fitT) {
    y += SECTION_GAP - 8;
    if (y > H - BOTTOM - 30) { doc.addPage(); y = TOP; }
    y = block(fitT, y) + 8;
  }
  footnote();

  // ── Lot detail pages ──
  doc.addPage();
  section('Lot details', M, TOP);
  font('normal', 8, BRAND.muted);
  doc.text(`${rows.length} lot${rows.length === 1 ? '' : 's'}`, W - M, TOP, { align: 'right' });
  const statusIdx = cols.findIndex((c) => c.key === 'statusLabel');
  autoTable(doc, {
    ...base,
    startY: TOP + 5,
    margin: { left: M, right: M, top: TOP, bottom: BOTTOM },
    styles: { ...base.styles, fontSize: full ? 7.5 : 9 },
    head: [cols.map((c) => ascii(c.header).toUpperCase())],
    body: rows.map((row) => cols.map((c) => {
      const v = c.get(row);
      if (c.type === 'date') return fmtDay(v);
      if (c.type === 'int') return fmtInt(v);
      return ascii(v);
    })),
    foot: [cols.map((c, i) => {
      if (i === 0) return 'TOTAL';
      if (c.type === 'int') return fmtInt(sumCol(rows, c));
      if (i === cols.length - 1) return `${rows.length} lots`;
      return '';
    })],
    columnStyles: statusIdx >= 0 ? { [statusIdx]: { minCellWidth: 22 } } : {},
    didParseCell: (d) => {
      const c = cols[d.column.index];
      if (!c) return;
      d.cell.styles.halign = c.type === 'int' ? 'right' : 'left';
      if (d.section !== 'body') return;
      const r = rows[d.row.index];
      if (c.key === 'lotNumber' || c.key === 'pcs') d.cell.styles.fontStyle = 'bold';
      if (c.key === 'short' && r.short > 0) {
        d.cell.styles.textColor = rgb(BRAND.warn);
        d.cell.styles.fontStyle = 'bold';
      }
    },
    // Status is drawn as a coloured pill: blank the plain text, then draw over the cell.
    willDrawCell: (d) => {
      if (d.section === 'body' && d.column.index === statusIdx) d.cell.text = [];
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || d.column.index !== statusIdx) return;
      const r = rows[d.row.index];
      pill(ascii(r.statusLabel), STATUS_COLORS[r.status] || BRAND.muted, d.cell.x + 2, d.cell.y + d.cell.height / 2);
    },
  });

  // ── Header band + footer on every page, drawn last so they never disturb page breaks ──
  const pages = doc.internal.getNumberOfPages();
  const stamp = `Generated ${fmtLong(now)}, ${now.toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit' })} IST`;
  const footLeft = ascii(`${BRAND.wordmark}  |  Stitching Report - ${client.name}`);
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setFillColor(...rgb(BRAND.dark));
    doc.rect(0, 0, W, BAND, 'F');
    doc.setFillColor(...rgb(BRAND.sage));
    doc.rect(0, BAND, W, 0.9, 'F');
    font('bold', 14, '#FFFFFF');
    doc.text(BRAND.wordmark, M, BRAND.tagline ? 8.2 : 9.4, { charSpace: 2.4 });
    if (BRAND.tagline) {
      font('normal', 5.8, BRAND.sage);
      doc.text(BRAND.tagline, M, 11.8, { charSpace: 1.9 });
    }
    font('bold', 7.5, '#FFFFFF');
    spacedRight('STITCHING REPORT', W - M, 7.4, 1);
    font('normal', 7.5, BRAND.sage);
    doc.text(fmtLong(now), W - M, 11.6, { align: 'right' });

    doc.setDrawColor(...rgb(BRAND.rule));
    doc.setLineWidth(0.3);
    doc.line(M, H - 10.5, W - M, H - 10.5);
    font('normal', 7, BRAND.muted);
    doc.text(footLeft, M, H - 6.5);
    if (full) {
      const fx = M + doc.getTextWidth(footLeft);
      font('bold', 7, BRAND.warn);
      doc.text('  |  INTERNAL', fx, H - 6.5);
      font('normal', 7, BRAND.muted);
    }
    doc.text(stamp, W / 2, H - 6.5, { align: 'center' });
    doc.text(`Page ${p} of ${pages}`, W - M, H - 6.5, { align: 'right' });
  }
  doc.save(fileName(client, view, 'pdf'));
};
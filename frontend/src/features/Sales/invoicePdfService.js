import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Indian-number formatter (e.g. 1,07,610.00)
const fmtINR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '';
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
};
const fmtDate = (d) => {
  if (!d) return '';
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};
const documentTitle = (docType) => docType === 'TAX_INVOICE' ? 'TAX INVOICE' : 'BILL OF SUPPLY';

// ─── Custom font loader ─────────────────────────────────────────────────────
// jsPDF's built-in helvetica does NOT include the ₹ glyph (U+20B9). To render
// it we load Roboto (Latin + ₹) once per session, cache the base64-encoded TTF
// buffers, and register them with jsPDF on each new doc.
//
// Sources are tried in order:
//   1. Local /fonts/*.ttf  — most reliable / works offline. Drop the three
//      files into frontend/public/fonts/:
//        Roboto-Regular.ttf, Roboto-Medium.ttf, Roboto-Italic.ttf
//      (Grab from the @expo-google-fonts/roboto npm package, or the URLs below.)
//   2. jsdelivr CDN  (npm:@expo-google-fonts/roboto — verified to ship .ttf)
//   3. unpkg CDN     (npm:@expo-google-fonts/roboto)
//
// roboto-fontface (the obvious-sounding package) only ships WOFF/WOFF2 which
// jsPDF can't use — that's why earlier URLs 404'd. @expo-google-fonts/roboto
// ships full TTFs at the file names listed below.
//
// We register Roboto-Medium (weight 500) as the "bold" style — jsPDF only
// supports normal/bold/italic/bolditalic, so Medium-as-bold is the lever for
// reducing visual heaviness without losing emphasis on labels/totals.
// On total failure → helvetica + "Rs." fallback (Rupee glyph won't render).
const FONT_SOURCES = [
  {
    label: 'local /fonts/',
    normal: '/fonts/Roboto-Regular.ttf',
    bold: '/fonts/Roboto-Medium.ttf',
    italic: '/fonts/Roboto-Italic.ttf'
  },
  {
    label: 'jsdelivr CDN (@expo-google-fonts/roboto)',
    normal: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/roboto/Roboto_400Regular.ttf',
    bold:   'https://cdn.jsdelivr.net/npm/@expo-google-fonts/roboto/Roboto_500Medium.ttf',
    italic: 'https://cdn.jsdelivr.net/npm/@expo-google-fonts/roboto/Roboto_400Regular_Italic.ttf'
  },
  {
    label: 'unpkg CDN (@expo-google-fonts/roboto)',
    normal: 'https://unpkg.com/@expo-google-fonts/roboto/Roboto_400Regular.ttf',
    bold:   'https://unpkg.com/@expo-google-fonts/roboto/Roboto_500Medium.ttf',
    italic: 'https://unpkg.com/@expo-google-fonts/roboto/Roboto_400Regular_Italic.ttf'
  }
];
let fontCachePromise = null;

// Use FileReader for base64 — browser-native, byte-exact, no apply-stack risk.
const bufferToBase64 = (buf) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]); // strip "data:...;base64,"
    reader.onerror = () => reject(new Error('FileReader failed'));
    reader.readAsDataURL(new Blob([buf]));
  });

// Validate that the fetched buffer really is a TTF/OTF — catches the case where
// a CDN returned an HTML error page (or some other non-font payload) with a 200.
const TTF_MAGIC = '00010000';   // TrueType
const OTF_MAGIC = '4f54544f';   // 'OTTO' — OpenType with CFF outlines
const TTC_MAGIC = '74746366';   // 'ttcf' — TrueType Collection
const assertIsFont = (buf, label) => {
  const head = new Uint8Array(buf, 0, 4);
  const magic = Array.from(head).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (magic !== TTF_MAGIC && magic !== OTF_MAGIC && magic !== TTC_MAGIC) {
    throw new Error(`${label}: not a font (magic=${magic}, size=${buf.byteLength})`);
  }
};

const fetchTtf = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  const buf = await r.arrayBuffer();
  assertIsFont(buf, url);
  return buf;
};

const loadFonts = () => {
  if (fontCachePromise) return fontCachePromise;
  // Hold the in-flight promise in a local so we only cache once we KNOW it succeeded —
  // a failed load shouldn't poison every subsequent generateInvoicePdf call.
  const p = (async () => {
    for (const src of FONT_SOURCES) {
      try {
        const [reg, bold, italic] = await Promise.all([
          fetchTtf(src.normal), fetchTtf(src.bold), fetchTtf(src.italic)
        ]);
        const [regB64, boldB64, italicB64] = await Promise.all([
          bufferToBase64(reg), bufferToBase64(bold), bufferToBase64(italic)
        ]);
        // eslint-disable-next-line no-console
        console.log(`[invoicePdf] fonts loaded from: ${src.label}`);
        return { loaded: true, normal: regB64, bold: boldB64, italic: italicB64 };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(`[invoicePdf] font source "${src.label}" failed:`, e.message);
      }
    }
    // eslint-disable-next-line no-console
    console.warn('[invoicePdf] ALL font sources failed — falling back to helvetica + "Rs.". ' +
      'Confirm that frontend/public/fonts/Roboto-Regular.ttf etc. exist and are served by your dev server.');
    return { loaded: false };
  })();
  // Cache on success or "failed but resolved with loaded:false" — but DROP the cache
  // if the promise itself rejects (unexpected) so the next call retries.
  p.then(
    (v) => { fontCachePromise = Promise.resolve(v); },
    () => { fontCachePromise = null; }
  );
  fontCachePromise = p;
  return p;
};

const registerFonts = (doc, fonts) => {
  if (!fonts.loaded) return { F: 'helvetica', RS: 'Rs. ' };
  doc.addFileToVFS('Roboto-Regular.ttf', fonts.normal);
  doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
  // Roboto-Medium (500) registered as 'bold' alias — reduces visual heaviness vs Roboto-Bold (700)
  doc.addFileToVFS('Roboto-Medium.ttf', fonts.bold);
  doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
  doc.addFileToVFS('Roboto-Italic.ttf', fonts.italic);
  doc.addFont('Roboto-Italic.ttf', 'Roboto', 'italic');
  return { F: 'Roboto', RS: '₹' };
};

/**
 * Render an invoice to a jsPDF doc. `mode` ∈ 'download' | 'preview' | 'blob'.
 * Async because we load the ₹-capable font on first call (then cache).
 */
export const generateInvoicePdf = async (invoice, settings, { mode = 'preview' } = {}) => {
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const { F, RS } = registerFonts(doc, fonts);

  const PAGE_W = 210;
  const M = 6;                   // tight outer margin (matches sample's frame-close-to-edge look)
  const COL_SPLIT = PAGE_W / 2;  // shared vertical divider — header AND bill/ship use same X
  const LINE_W = 0.3;
  // Light grey strip fill (Bill To / Ship To, table header)
  const STRIP_FILL = [240, 240, 240];
  // Greyish border color used throughout (matches sample's light borders, not pure black)
  const BORDER = [170, 170, 170];

  // Helper: draw a "label normal + value bold" pair on one line, returns total width drawn.
  const drawLabelValue = (label, value, x, y, size) => {
    doc.setFont(F, 'normal');
    doc.setFontSize(size);
    doc.text(label, x, y);
    const labelW = doc.getTextWidth(label);
    doc.setFont(F, 'bold');
    doc.text(String(value), x + labelW, y);
  };

  // ── Background watermark (company name) ───────────────────────────────────
  // Drawn FIRST so every subsequent element overlays it. Diagonal, faint grey,
  // big enough to span the page diagonally without ever being the focal point.
  if (settings?.name) {
    const PAGE_H = 297;
    doc.saveGraphicsState();
    // Use a near-white grey for the fill (no opacity API in jsPDF v2's standard build,
    // so a very light text color is the reliable cross-renderer trick).
    doc.setTextColor(225, 225, 225);
    doc.setFont(F, 'bold');
    doc.setFontSize(70);
    doc.text(settings.name, PAGE_W / 2, PAGE_H / 2, {
      align: 'center',
      baseline: 'middle',
      angle: 30 // diagonal from bottom-left to top-right
    });
    // Reset for the rest of the document
    doc.setTextColor(0, 0, 0);
    doc.restoreGraphicsState();
  }

  // ── Top title strip ────────────────────────────────────────────────────────
  doc.setFont(F, 'bold');
  doc.setFontSize(11);
  doc.text(documentTitle(invoice.documentType), PAGE_W / 2, 11, { align: 'center' });
  doc.setFont(F, 'normal');
  doc.setFontSize(8);
  doc.text('Original for Customer', PAGE_W - M, 11, { align: 'right' });

  // ── Issuer + Invoice meta header ───────────────────────────────────────────
  // Build issuer blocks (with mixed label/value support for the ID rows).
  const issuerBlocks = [];
  if (settings?.name) issuerBlocks.push({ text: settings.name, bold: true, size: 12, lineH: 5 });
  (settings?.addressLines || []).forEach((line) => {
    if (line && String(line).trim()) issuerBlocks.push({ text: String(line), bold: false, size: 9, lineH: 4 });
  });
  if (settings?.gstStateName) {
    issuerBlocks.push({
      text: `${settings.gstStateName}${settings.gstStateCode ? ` (${settings.gstStateCode})` : ''}, India`,
      bold: false, size: 9, lineH: 4
    });
  }
  if (settings?.gstin || settings?.pan || settings?.msmeType || settings?.msmeNumber || settings?.email || settings?.phone) {
    issuerBlocks.push({ spacer: true, lineH: 1.5 });
  }
  // Mixed label/value rows: label NORMAL, value BOLD. Spaces around the colons per sample.
  if (settings?.gstin) issuerBlocks.push({ label: 'GSTIN : ', value: settings.gstin, size: 9, lineH: 4 });
  if (settings?.pan) issuerBlocks.push({ label: 'PAN : ', value: settings.pan, size: 9, lineH: 4 });
  if (settings?.msmeType) issuerBlocks.push({ label: 'MSME/Udyam Type : ', value: settings.msmeType, size: 9, lineH: 4 });
  if (settings?.msmeNumber) issuerBlocks.push({ label: 'MSME/Udyam No : ', value: settings.msmeNumber, size: 9, lineH: 4 });
  if (settings?.email) issuerBlocks.push({ label: 'email : ', value: settings.email, size: 9, lineH: 4 });
  if (settings?.phone) issuerBlocks.push({ label: 'Phone : ', value: settings.phone, size: 9, lineH: 2.5 });

  // Per-section padding — issuer wants more top margin (company name breathing room)
  // and almost no bottom (kill trailing whitespace below Phone). Bill/Ship is its own pair.
  const ISSUER_PAD_T = 5;
  const ISSUER_PAD_B = 0;
  const BILL_PAD_T = 4;
  const BILL_PAD_B = 0;
  const issuerContentH = issuerBlocks.reduce((sum, b) => sum + b.lineH, 0);
  const META_ROW_H = 13;
  const META_ROWS = 3;
  const metaContentH = META_ROW_H * META_ROWS;
  const headerTop = 14;
  const headerH = Math.max(issuerContentH + ISSUER_PAD_T + ISSUER_PAD_B, metaContentH);

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.setLineWidth(LINE_W);
  doc.rect(M, headerTop, PAGE_W - 2 * M, headerH);
  doc.line(COL_SPLIT, headerTop, COL_SPLIT, headerTop + headerH);

  // Issuer column — draw measured blocks
  let ly = headerTop + ISSUER_PAD_T;
  issuerBlocks.forEach((b) => {
    if (b.spacer) { ly += b.lineH; return; }
    if (b.label !== undefined) {
      drawLabelValue(b.label, b.value, M + 2, ly, b.size);
      ly += b.lineH;
      return;
    }
    doc.setFont(F, b.bold ? 'bold' : 'normal');
    doc.setFontSize(b.size);
    doc.text(b.text, M + 2, ly);
    ly += b.lineH;
  });

  // Right column — 3 stacked rows: (Invoice No | Date), (Place of Supply), (filler)
  const metaX = COL_SPLIT;
  const metaW = PAGE_W - M - COL_SPLIT;
  const metaRow1Y = headerTop;
  const metaRow2Y = headerTop + META_ROW_H;
  const metaRow3Y = headerTop + META_ROW_H * 2;

  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.line(metaX, metaRow2Y, PAGE_W - M, metaRow2Y);
  doc.line(metaX, metaRow3Y, PAGE_W - M, metaRow3Y);

  const metaInnerSplit = metaX + metaW / 2;
  doc.line(metaInnerSplit, metaRow1Y, metaInnerSplit, metaRow2Y);

  // Row 1 — Invoice No (left) | Date (right). Labels small normal, values 10pt bold.
  doc.setFont(F, 'normal');
  doc.setFontSize(8);
  doc.text('Invoice No.:', metaX + 2, metaRow1Y + 4.5);
  doc.setFont(F, 'bold');
  doc.setFontSize(10);
  doc.text(invoice.invoiceNumber || '', metaX + 2, metaRow1Y + 10);

  doc.setFont(F, 'normal');
  doc.setFontSize(8);
  doc.text('Date:', metaInnerSplit + 2, metaRow1Y + 4.5);
  doc.setFont(F, 'bold');
  doc.setFontSize(10);
  doc.text(fmtDate(invoice.date), metaInnerSplit + 2, metaRow1Y + 10);

  // Row 2 — Place of Supply (spans)
  doc.setFont(F, 'normal');
  doc.setFontSize(8);
  doc.text('Place of Supply:', metaX + 2, metaRow2Y + 4.5);
  doc.setFont(F, 'bold');
  doc.setFontSize(10);
  const posText = invoice.placeOfSupply
    ? `${invoice.placeOfSupply.stateName || ''}${invoice.placeOfSupply.stateCode ? ` (${invoice.placeOfSupply.stateCode})` : ''}`
    : '';
  doc.text(posText, metaX + 2, metaRow2Y + 10);

  // Row 3 intentionally empty

  // ── Bill To / Ship To ──────────────────────────────────────────────────────
  const billTop = headerTop + headerH;
  const STRIP_H = 5.5;

  const buildAddressBlocks = (snapshot, addr) => {
    const name = snapshot?.billingName || snapshot?.name || '';
    const addressLines = [
      addr?.line1,
      addr?.line2,
      [addr?.city, addr?.pincode].filter(Boolean).join(' '),
      [addr?.state, addr?.stateCode ? `(${addr.stateCode})` : '', addr?.country].filter(Boolean).join(', ')
    ].filter((s) => s && String(s).trim()).map(String);
    const idRows = [];
    if (snapshot?.phone) idRows.push({ label: 'Phone : ', value: String(snapshot.phone) });
    if (snapshot?.gstin) idRows.push({ label: 'GSTIN : ', value: String(snapshot.gstin) });
    if (snapshot?.pan) idRows.push({ label: 'PAN : ', value: String(snapshot.pan) });
    return { name, addressLines, idRows };
  };

  const bill = buildAddressBlocks(invoice.clientSnapshot, invoice.billTo);
  const ship = buildAddressBlocks(invoice.clientSnapshot, invoice.shipTo);

  // Sample body fonts are slightly smaller than my prior pass (8pt, tighter line heights).
  const NAME_H = 5;
  const ADDR_LINE_H = 3.5;
  const ID_ROW_H = 3.5; // tightened from 3.8 — reduces gap below PAN
  // Match the issuer's trailing-line trick (Phone lineH = 2.5) so the gap below PAN
  // visually matches the gap below Phone in the Issuer section.
  const LAST_ID_ROW_H = 2.5;
  const sideContentH = (b) =>
    NAME_H + b.addressLines.length * ADDR_LINE_H + (b.idRows.length ? 1.5 : 0) +
    Math.max(0, b.idRows.length - 1) * ID_ROW_H +
    (b.idRows.length > 0 ? LAST_ID_ROW_H : 0);
  const billContentH = Math.max(sideContentH(bill), sideContentH(ship));
  const billH = STRIP_H + BILL_PAD_T + billContentH + BILL_PAD_B;

  // ORDER MATTERS: fill the strip FIRST so the outer border draws on top of it.
  // (Previous order had fill on top of border, which painted over the inner edge
  // and made the strip background appear to overlap the left/right outer borders.)
  doc.setFillColor(STRIP_FILL[0], STRIP_FILL[1], STRIP_FILL[2]);
  doc.rect(M, billTop, PAGE_W - 2 * M, STRIP_H, 'F');
  // Outer border (drawn on top of fill so border edge stays crisp)
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.rect(M, billTop, PAGE_W - 2 * M, billH);
  // Strip bottom divider + vertical center divider
  doc.line(M, billTop + STRIP_H, PAGE_W - M, billTop + STRIP_H);
  doc.line(COL_SPLIT, billTop, COL_SPLIT, billTop + billH);

  doc.setFont(F, 'bold');
  doc.setFontSize(9);
  doc.text('Bill To', M + 2, billTop + 4);
  doc.text('Ship To', COL_SPLIT + 2, billTop + 4);

  const drawSide = (xStart, xEnd, content) => {
    let y = billTop + STRIP_H + BILL_PAD_T;
    doc.setFont(F, 'bold');
    doc.setFontSize(10);
    doc.text(content.name, xStart + 2, y);
    y += NAME_H;
    doc.setFont(F, 'normal');
    doc.setFontSize(8);
    content.addressLines.forEach((line) => {
      doc.text(line, xStart + 2, y);
      y += ADDR_LINE_H;
    });
    if (content.idRows.length) y += 1.5;
    content.idRows.forEach((row, i) => {
      doc.setFont(F, 'normal');
      doc.setFontSize(8);
      doc.text(row.label, xStart + 2, y);
      doc.setFont(F, 'bold');
      doc.text(row.value, xEnd - 2, y, { align: 'right' });
      y += (i === content.idRows.length - 1) ? LAST_ID_ROW_H : ID_ROW_H;
    });
  };
  drawSide(M, COL_SPLIT, bill);
  drawSide(COL_SPLIT, PAGE_W - M, ship);

  // ── Line items table ───────────────────────────────────────────────────────
  const tableTop = billTop + billH;
  const head = [[
    { content: '#', styles: { halign: 'center' } },
    { content: 'Item & Description', styles: { halign: 'left' } },
    { content: 'HSN/SAC', styles: { halign: 'right' } },
    { content: 'Qty.', styles: { halign: 'right' } },
    { content: 'Rate', styles: { halign: 'right' } },
    { content: 'Amount', styles: { halign: 'right' } }
  ]];

  const lineRows = (invoice.lines || []).map((line, i) => [
    String(line.lineNo || i + 1),
    line.remark ? `${line.description || ''}\n${line.remark}` : (line.description || ''),
    line.hsnSac || '-',
    Number(line.pcs || 0).toFixed(2),
    fmtINR(line.rate),
    fmtINR(line.amount)
  ]);
  const SPACER_ROW_IDX = lineRows.length;
  const body = [...lineRows, ['', '', '', '', '', '']];

  const foot = [
    [
      { content: 'Sub Total', colSpan: 5, styles: { halign: 'right', fontStyle: 'bolditalic', fontSize: 9 } },
      { content: RS + fmtINR(invoice.subTotal), styles: { halign: 'right', fontStyle: 'bold', fontSize: 9 } }
    ],
    [
      { content: 'Round off', colSpan: 5, styles: { halign: 'right', fontStyle: 'italic', fontSize: 9 } },
      { content: fmtINR(invoice.roundOff), styles: { halign: 'right', fontStyle: 'normal', fontSize: 9 } }
    ],
    [
      { content: 'Total', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } },
      { content: Number(invoice.totalQty || 0).toFixed(2), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } },
      { content: '', styles: {} },
      { content: RS + fmtINR(invoice.total), styles: { halign: 'right', fontStyle: 'bold', fontSize: 10 } }
    ]
  ];

  autoTable(doc, {
    startY: tableTop,
    head,
    body,
    foot,
    margin: { left: M, right: M },
    styles: {
      font: F,
      fontSize: 9, cellPadding: 2, valign: 'top', overflow: 'linebreak',
      lineColor: BORDER, lineWidth: 0.2
    },
    headStyles: {
      font: F,
      fillColor: STRIP_FILL, textColor: 0, fontStyle: 'bold',
      lineColor: BORDER, lineWidth: { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 }
    },
    bodyStyles: {
      font: F,
      lineColor: BORDER,
      lineWidth: { top: 0, right: 0.2, bottom: 0, left: 0.2 }
    },
    footStyles: {
      font: F,
      fillColor: [255, 255, 255], textColor: 0,
      lineColor: BORDER,
      lineWidth: { top: 0, right: 0.2, bottom: 0, left: 0.2 }
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 6 }, // serial # — usually single digit
      1: { halign: 'left' },
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'right', cellWidth: 17 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 28 }
    },
    theme: 'plain',
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === SPACER_ROW_IDX) {
        data.cell.styles.minCellHeight = 30;
      }
      if (data.section === 'foot' && data.row.index === 0) {
        data.cell.styles.lineWidth = { top: 0.2, right: 0.2, bottom: 0, left: 0.2 };
      }
      if (data.section === 'foot' && data.row.index === foot.length - 1) {
        data.cell.styles.lineWidth = { top: 0.2, right: 0.2, bottom: 0.2, left: 0.2 };
      }
    },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      if (data.row.index === SPACER_ROW_IDX) return;
      const line = invoice.lines[data.row.index];
      if (!line) return;
      const { x, y, width, height } = data.cell;
      doc.setFillColor(255, 255, 255);
      doc.rect(x + 0.3, y + 0.3, width - 0.6, height - 0.6, 'F');
      const padX = 2;
      const padY = 2;
      const maxW = width - padX * 2;
      let ty = y + padY + 3;
      doc.setFont(F, 'bold');
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(String(line.description || ''), maxW);
      descLines.forEach((l) => { doc.text(l, x + padX, ty); ty += 3.6; });
      if (line.remark) {
        doc.setFont(F, 'normal');
        doc.setFontSize(9);
        const remarkLines = doc.splitTextToSize(String(line.remark), maxW);
        remarkLines.forEach((l) => { doc.text(l, x + padX, ty); ty += 3.6; });
      }
    }
  });

  // ── Amount in words ────────────────────────────────────────────────────────
  let ty = doc.lastAutoTable.finalY + 8;
  doc.setFont(F, 'normal');
  doc.setFontSize(9);
  if (invoice.amountInWords) {
    doc.text(`Amount Chargeable (in Words): ${invoice.amountInWords}  E & O.E`, M, ty);
  }

  // ── Bank details + signatory ───────────────────────────────────────────────
  const footerTop = ty + 6;
  doc.setDrawColor(BORDER[0], BORDER[1], BORDER[2]);
  doc.rect(M, footerTop, PAGE_W - 2 * M, 28);
  doc.line(COL_SPLIT, footerTop, COL_SPLIT, footerTop + 28);

  // Spacing 5.5mm uniformly so the 5 lines (header + 4 data) fill the 28mm box height —
  // header at +5, last (Account Name) lands at +27, leaving only ~1mm to the box bottom.
  let fy = footerTop + 5;
  const BANK_LINE_H = 5.2;
  doc.setFont(F, 'bold');
  doc.setFontSize(9);
  doc.text('Bank Details:', M + 2, fy);
  fy += BANK_LINE_H;
  if (settings?.bank?.bankName) { drawLabelValue('Bank Name : ', settings.bank.bankName, M + 2, fy, 9); fy += BANK_LINE_H; }
  if (settings?.bank?.accountNumber) { drawLabelValue('Account Number : ', settings.bank.accountNumber, M + 2, fy, 9); fy += BANK_LINE_H; }
  if (settings?.bank?.ifsc) { drawLabelValue('IFSC Code : ', settings.bank.ifsc, M + 2, fy, 9); fy += BANK_LINE_H; }
  if (settings?.bank?.accountName) { drawLabelValue('Account Name : ', settings.bank.accountName, M + 2, fy, 9); fy += BANK_LINE_H; }

  // Signatory centered in right column (matches sample)
  const sigCenterX = (COL_SPLIT + (PAGE_W - M)) / 2;
  doc.setFont(F, 'normal');
  doc.setFontSize(9);
  doc.text('Authorised Signatory', sigCenterX, footerTop + 5, { align: 'center' });
  doc.setFont(F, 'bold');
  doc.text(settings?.authorisedSignatory?.name || '', sigCenterX, footerTop + 22, { align: 'center' });
  doc.setFont(F, 'normal');
  doc.setFontSize(8);
  doc.text(settings?.authorisedSignatory?.title || '', sigCenterX, footerTop + 26, { align: 'center' });

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const invNumPart = String(invoice.invoiceNumber || 'invoice').replace(/[/\\]/g, ' ');
  const namePart = invoice.clientSnapshot?.billingName || invoice.clientSnapshot?.name || '';
  const safeName = namePart.replace(/[<>:"/\\|?*]/g, '').trim();
  const filename = `${invNumPart}${safeName ? ' ' + safeName : ''}.pdf`;

  if (mode === 'download') {
    doc.save(filename);
    return null;
  }
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  if (mode === 'preview') {
    window.open(url, '_blank');
  }
  return { url, blob, filename };
};

export const downloadInvoicePdf = async (invoice, settings) =>
  generateInvoicePdf(invoice, settings, { mode: 'download' });

export const previewInvoicePdf = async (invoice, settings) =>
  generateInvoicePdf(invoice, settings, { mode: 'blob' });

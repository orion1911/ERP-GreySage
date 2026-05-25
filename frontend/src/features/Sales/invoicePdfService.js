import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Indian-number formatter (e.g. 1,07,610.00). jsPDF default font has no ₹ glyph, so we prefix "Rs.".
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

/**
 * Render an invoice to a jsPDF doc. `mode` ∈ 'download' | 'preview' | 'blob'.
 *   download → triggers browser save
 *   preview  → opens in a new tab
 *   blob     → returns a Blob URL (caller may inject in an <iframe>)
 */
export const generateInvoicePdf = (invoice, settings, { mode = 'preview' } = {}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const PAGE_W = 210;
  const M = 12; // outer margin

  // ── Top title strip ────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(documentTitle(invoice.documentType), PAGE_W / 2, 14, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Original for Customer', PAGE_W - M, 14, { align: 'right' });

  // ── Issuer + Invoice meta header (two-column box) ──────────────────────────
  // Build issuer text blocks first so we can MEASURE the height before drawing the box.
  // Without this the issuer overflows the box and bleeds into Bill To below.
  const issuerBlocks = [];
  if (settings?.name) issuerBlocks.push({ text: settings.name, bold: true, size: 11, lineH: 4 });
  (settings?.addressLines || []).forEach((line) => {
    if (line && String(line).trim()) issuerBlocks.push({ text: String(line), bold: false, size: 8, lineH: 3.5 });
  });
  if (settings?.gstStateName) {
    issuerBlocks.push({ text: `${settings.gstStateName}${settings.gstStateCode ? ` (${settings.gstStateCode})` : ''}, India`, bold: false, size: 8, lineH: 3.5 });
  }
  if (settings?.gstin || settings?.pan || settings?.msmeType || settings?.msmeNumber || settings?.email || settings?.phone) {
    issuerBlocks.push({ spacer: true, lineH: 1.5 });
  }
  if (settings?.gstin) issuerBlocks.push({ text: `GSTIN: ${settings.gstin}`, bold: true, size: 8, lineH: 3.5 });
  if (settings?.pan) issuerBlocks.push({ text: `PAN: ${settings.pan}`, bold: false, size: 8, lineH: 3.5 });
  if (settings?.msmeType) issuerBlocks.push({ text: `MSME/Udyam Type: ${settings.msmeType}`, bold: false, size: 8, lineH: 3.5 });
  if (settings?.msmeNumber) issuerBlocks.push({ text: `MSME/Udyam No: ${settings.msmeNumber}`, bold: false, size: 8, lineH: 3.5 });
  if (settings?.email) issuerBlocks.push({ text: `email: ${settings.email}`, bold: false, size: 8, lineH: 3.5 });
  if (settings?.phone) issuerBlocks.push({ text: `Phone: ${settings.phone}`, bold: false, size: 8, lineH: 3.5 });

  const issuerContentH = issuerBlocks.reduce((sum, b) => sum + b.lineH, 0);
  // Meta column on the right needs ~34mm for Invoice No + Date + Place of Supply
  const metaContentH = 34;
  const headerTop = 18;
  const PAD_T = 5;
  const PAD_B = 4;
  const headerH = Math.max(issuerContentH, metaContentH) + PAD_T + PAD_B;

  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.rect(M, headerTop, PAGE_W - 2 * M, headerH);
  doc.line(PAGE_W / 2 + 10, headerTop, PAGE_W / 2 + 10, headerTop + headerH); // vertical splitter

  // Left: company — render the pre-measured blocks
  let ly = headerTop + PAD_T;
  issuerBlocks.forEach((b) => {
    if (b.spacer) { ly += b.lineH; return; }
    doc.setFont('helvetica', b.bold ? 'bold' : 'normal');
    doc.setFontSize(b.size);
    doc.text(b.text, M + 2, ly);
    ly += b.lineH;
  });

  // Right: invoice meta (Invoice No, Date, Place of Supply)
  const rightX = PAGE_W / 2 + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Invoice No.:', rightX, headerTop + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(invoice.invoiceNumber || '', rightX, headerTop + 11);
  doc.setFont('helvetica', 'normal');

  doc.setFontSize(8);
  doc.text('Date:', PAGE_W - M - 30, headerTop + 5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(fmtDate(invoice.date), PAGE_W - M - 30, headerTop + 11);
  doc.setFont('helvetica', 'normal');

  doc.setFontSize(8);
  doc.text('Place of Supply:', rightX, headerTop + 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const posText = invoice.placeOfSupply
    ? `${invoice.placeOfSupply.stateName || ''}${invoice.placeOfSupply.stateCode ? ` (${invoice.placeOfSupply.stateCode})` : ''}`
    : '';
  doc.text(posText, rightX, headerTop + 28);
  doc.setFont('helvetica', 'normal');

  // ── Bill To / Ship To box ──────────────────────────────────────────────────
  // Build content for both sides, measure the taller one, then draw the box.
  const buildBillBlocks = (snapshot, addr) => {
    const blocks = [];
    blocks.push({ label: true, text: '', lineH: 4 }); // reserved for "Bill To" / "Ship To" label
    blocks.push({ text: snapshot?.billingName || snapshot?.name || '', bold: true, size: 10, lineH: 4.5 });
    const addressLines = [
      addr?.line1,
      addr?.line2,
      [addr?.city, addr?.pincode].filter(Boolean).join(' '),
      [addr?.state, addr?.stateCode ? `(${addr.stateCode})` : '', addr?.country].filter(Boolean).join(', ')
    ].filter((s) => s && String(s).trim());
    addressLines.forEach((line) => blocks.push({ text: String(line), bold: false, size: 8, lineH: 3.5 }));
    if (snapshot?.phone || snapshot?.gstin || snapshot?.pan) blocks.push({ spacer: true, lineH: 1.5 });
    if (snapshot?.phone) blocks.push({ text: `Phone: ${snapshot.phone}`, bold: false, size: 8, lineH: 3.5 });
    if (snapshot?.gstin) blocks.push({ text: `GSTIN: ${snapshot.gstin}`, bold: true, size: 8, lineH: 3.5 });
    if (snapshot?.pan) blocks.push({ text: `PAN: ${snapshot.pan}`, bold: true, size: 8, lineH: 3.5 });
    return blocks;
  };

  const billBlocks = buildBillBlocks(invoice.clientSnapshot, invoice.billTo);
  const shipBlocks = buildBillBlocks(invoice.clientSnapshot, invoice.shipTo);
  const sideH = (blocks) => blocks.reduce((sum, b) => sum + b.lineH, 0);
  const billTop = headerTop + headerH;
  const billH = Math.max(sideH(billBlocks), sideH(shipBlocks)) + PAD_T + PAD_B;

  doc.rect(M, billTop, PAGE_W - 2 * M, billH);
  doc.line(PAGE_W / 2, billTop, PAGE_W / 2, billTop + billH);

  const drawBlocks = (xStart, label, blocks) => {
    let y = billTop + PAD_T;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(label, xStart + 2, y);
    // First entry in blocks is the reserved label line — skip its text but use its lineH for spacing
    blocks.forEach((b, i) => {
      if (b.label) { y += b.lineH; return; }
      if (b.spacer) { y += b.lineH; return; }
      doc.setFont('helvetica', b.bold ? 'bold' : 'normal');
      doc.setFontSize(b.size);
      doc.text(b.text, xStart + 2, y);
      y += b.lineH;
    });
  };

  drawBlocks(M, 'Bill To', billBlocks);
  drawBlocks(PAGE_W / 2, 'Ship To', shipBlocks);

  // ── Line items table ───────────────────────────────────────────────────────
  const tableTop = billTop + billH + 2;
  const head = [['#', 'Item & Description', 'HSN/SAC', 'Qty.', 'Per', 'Rate/Item', 'Amount']];
  const body = (invoice.lines || []).map((line, i) => [
    String(line.lineNo || i + 1),
    line.description || '',
    line.hsnSac || '-',
    String(line.pcs),
    line.unit || '-',
    fmtINR(line.rate),
    fmtINR(line.amount)
  ]);

  autoTable(doc, {
    startY: tableTop,
    head,
    body,
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 2, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', lineColor: 0, lineWidth: 0.2 },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 70 },
      2: { halign: 'center', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 12 },
      5: { halign: 'right', cellWidth: 25 },
      6: { halign: 'right', cellWidth: 31 }
    },
    theme: 'grid',
    didDrawPage: () => { /* footer drawn after table */ }
  });

  // ── Sub Total / Round off / Total ──────────────────────────────────────────
  const afterTableY = doc.lastAutoTable.finalY;
  const totalsX = PAGE_W - M - 56;
  let ty = afterTableY + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Sub Total', totalsX, ty);
  doc.text('Rs. ' + fmtINR(invoice.subTotal), PAGE_W - M, ty, { align: 'right' });
  ty += 5;
  doc.setFont('helvetica', 'italic');
  doc.text('Round off', totalsX, ty);
  doc.text(fmtINR(invoice.roundOff), PAGE_W - M, ty, { align: 'right' });
  ty += 6;
  doc.setDrawColor(0);
  doc.line(totalsX - 2, ty - 2, PAGE_W - M, ty - 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Total', totalsX, ty + 3);
  doc.text(String(invoice.totalQty || 0) + '   Rs. ' + fmtINR(invoice.total), PAGE_W - M, ty + 3, { align: 'right' });

  // ── Amount in words ────────────────────────────────────────────────────────
  ty += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (invoice.amountInWords) {
    doc.text(`Amount Chargeable (in Words): ${invoice.amountInWords}  E & O.E`, M, ty);
  }

  // ── Bank details + signatory ───────────────────────────────────────────────
  const footerTop = ty + 6;
  doc.setDrawColor(0);
  doc.rect(M, footerTop, PAGE_W - 2 * M, 28);
  doc.line(PAGE_W / 2 + 20, footerTop, PAGE_W / 2 + 20, footerTop + 28);

  let fy = footerTop + 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Bank Details:', M + 2, fy);
  doc.setFont('helvetica', 'normal');
  fy += 4;
  if (settings?.bank?.bankName) { doc.text(`Bank Name: ${settings.bank.bankName}`, M + 2, fy); fy += 3.5; }
  if (settings?.bank?.accountNumber) { doc.text(`Account Number: ${settings.bank.accountNumber}`, M + 2, fy); fy += 3.5; }
  if (settings?.bank?.ifsc) { doc.text(`IFSC Code: ${settings.bank.ifsc}`, M + 2, fy); fy += 3.5; }
  if (settings?.bank?.accountName) { doc.text(`Account Name: ${settings.bank.accountName}`, M + 2, fy); fy += 3.5; }

  const sigX = PAGE_W / 2 + 22;
  doc.setFontSize(9);
  doc.text('Authorised Signatory', sigX, footerTop + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(settings?.authorisedSignatory?.name || '', sigX, footerTop + 22);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(settings?.authorisedSignatory?.title || '', sigX, footerTop + 26);

  // ── Dispatch ───────────────────────────────────────────────────────────────
  const filename = `${(invoice.invoiceNumber || 'invoice').replace(/[/\\]/g, '_')}.pdf`;
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

export const downloadInvoicePdf = (invoice, settings) =>
  generateInvoicePdf(invoice, settings, { mode: 'download' });

export const previewInvoicePdf = (invoice, settings) =>
  generateInvoicePdf(invoice, settings, { mode: 'blob' });

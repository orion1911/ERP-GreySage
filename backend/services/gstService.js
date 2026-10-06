// ─── GST computation for Tax Invoices ────────────────────────────────────────
// Rates live in GstRateRule (admin-editable, effective-dated). A Tax Invoice line's rate is
// resolved from the most specific rule for its HSN on the invoice date and FROZEN on the line
// at save, so changing a rule later never alters an issued Tax Invoice (until it is re-saved).
const { GstRateRule } = require('../mongodb_schema');
const { withSession } = require('../utils/transaction');
const { HttpError } = require('../utils/httpError');
const { amountInWordsIndian } = require('./invoiceService');

// Pre-filled on new lines (men's woven cotton trousers / jeans). Editable; not a master list.
const DEFAULT_HSN = '620342';

// 4, 6 or 8 digits. Turnover ≤ ₹5 cr: 4 digits on B2B invoices; above ₹5 cr: 6 digits.
const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;

// Apparel, chapters 61 (knitted) and 62 (not knitted): 5% up to ₹2,500 sale value per piece,
// 18% above — effective 22 Sep 2025. Seeded when the collection is empty (and by the migration).
const SEED_RULES = [
  {
    hsnPrefix: '61', thresholdPerPiece: 2500, rateUpTo: 5, rateAbove: 18,
    effectiveFrom: new Date('2025-09-22T00:00:00+05:30'),
    notes: 'Apparel, knitted or crocheted — by sale value per piece'
  },
  {
    hsnPrefix: '62', thresholdPerPiece: 2500, rateUpTo: 5, rateAbove: 18,
    effectiveFrom: new Date('2025-09-22T00:00:00+05:30'),
    notes: 'Apparel, not knitted or crocheted — by sale value per piece'
  }
];

// Call OUTSIDE a transaction (it may create the collection).
const ensureSeedRules = async () => {
  if ((await GstRateRule.estimatedDocumentCount()) > 0) return;
  for (const r of SEED_RULES) {
    await GstRateRule.updateOne(
      { hsnPrefix: r.hsnPrefix, effectiveFrom: r.effectiveFrom },
      { $setOnInsert: r },
      { upsert: true }
    );
  }
};

const loadActiveRules = (session = null) =>
  withSession(GstRateRule.find({ isActive: true }), session).lean();

/** Most specific active rule for this HSN on this date: longest prefix, then latest effectiveFrom. */
const findRule = (rules, hsn, date) => {
  const at = new Date(date).getTime();
  let best = null;
  for (const r of rules) {
    if (!String(hsn || '').startsWith(r.hsnPrefix)) continue;
    if (new Date(r.effectiveFrom).getTime() > at) continue;
    if (!best
      || r.hsnPrefix.length > best.hsnPrefix.length
      || (r.hsnPrefix.length === best.hsnPrefix.length
        && new Date(r.effectiveFrom).getTime() > new Date(best.effectiveFrom).getTime())) {
      best = r;
    }
  }
  return best;
};

/** Slab rule: rateUpTo while the per-piece rate is ≤ threshold, rateAbove beyond it. */
const rateForPiece = (rule, ratePerPiece) => {
  const hasSlab = rule.thresholdPerPiece !== null && rule.thresholdPerPiece !== undefined
    && rule.rateAbove !== null && rule.rateAbove !== undefined;
  if (!hasSlab) return rule.rateUpTo;
  return Number(ratePerPiece) <= rule.thresholdPerPiece ? rule.rateUpTo : rule.rateAbove;
};

/**
 * Resolve and set `taxRate` / `taxRateSource` on each line (same order as rawLines).
 * A raw `taxRateOverride` is honoured only when allowOverride (admin); otherwise the rule wins.
 */
const applyTaxRates = (lines, rawLines, { rules, date, allowOverride }) => {
  lines.forEach((line, i) => {
    const raw = (rawLines && rawLines[i]) || {};
    const label = `Line ${i + 1}`;
    if (line.isSample) {
      line.taxRate = 0;
      line.taxRateSource = 'rule';
      return;
    }
    const override = raw.taxRateOverride;
    if (override !== undefined && override !== null && override !== '') {
      if (!allowOverride) throw new HttpError(403, `${label}: only an admin can override the GST rate`);
      const r = Number(override);
      if (!Number.isFinite(r) || r < 0 || r > 100) {
        throw new HttpError(400, `${label}: GST rate override must be between 0 and 100`);
      }
      line.taxRate = r;
      line.taxRateSource = 'override';
      return;
    }
    const rule = findRule(rules, line.hsnSac, date);
    if (!rule) {
      throw new HttpError(400,
        `${label}: no GST rate rule covers HSN ${line.hsnSac} on this date — add one under Admin → GST Rates`);
    }
    line.taxRate = rateForPiece(rule, line.rate);
    line.taxRateSource = 'rule';
  });
};

const toPaise = (n) => Math.round((Number(n) || 0) * 100);

/**
 * Taxable values, HSN/rate summary, CGST+SGST (same state) or IGST (other state), totals and
 * amount in words. Tax is computed per (HSN, rate) group on the group's taxable value, in
 * integer paise, rounded half-up; CGST and SGST are each half the rate. Mutates `doc`.
 */
const computeTaxTotals = (doc, issuerStateCode) => {
  const posCode = String(doc.placeOfSupply?.stateCode || '').trim();
  const issuer = String(issuerStateCode || '').trim();
  doc.supplyType = posCode && issuer && posCode === issuer ? 'INTRA' : 'INTER';

  const groups = new Map();
  let taxablePaise = 0;
  let totalQty = 0;
  doc.lines.forEach((line, idx) => {
    line.lineNo = idx + 1;
    const amountPaise = (line.pcs || 0) * toPaise(line.rate);
    line.amount = amountPaise / 100;
    taxablePaise += amountPaise;
    totalQty += line.pcs || 0;
    if (amountPaise === 0) return; // samples add nothing to the tax summary
    const key = `${line.hsnSac}|${line.taxRate}`;
    const g = groups.get(key) || { hsnSac: line.hsnSac, taxRate: line.taxRate, taxablePaise: 0 };
    g.taxablePaise += amountPaise;
    groups.set(key, g);
  });

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  doc.taxSummary = [...groups.values()].map((g) => {
    const row = {
      hsnSac: g.hsnSac, taxRate: g.taxRate, taxableValue: g.taxablePaise / 100,
      cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: 0, igstAmount: 0, totalTax: 0
    };
    if (doc.supplyType === 'INTRA') {
      const half = g.taxRate / 2;
      const c = Math.round((g.taxablePaise * half) / 100);
      row.cgstRate = half;
      row.sgstRate = half;
      row.cgstAmount = c / 100;
      row.sgstAmount = c / 100;
      row.totalTax = (2 * c) / 100;
      cgst += c;
      sgst += c;
    } else {
      const t = Math.round((g.taxablePaise * g.taxRate) / 100);
      row.igstRate = g.taxRate;
      row.igstAmount = t / 100;
      row.totalTax = t / 100;
      igst += t;
    }
    return row;
  });

  doc.totalQty = totalQty;
  doc.taxableTotal = taxablePaise / 100;
  doc.cgstTotal = cgst / 100;
  doc.sgstTotal = sgst / 100;
  doc.igstTotal = igst / 100;
  doc.taxTotal = (cgst + sgst + igst) / 100;
  doc.total = (taxablePaise + cgst + sgst + igst + toPaise(doc.roundOff)) / 100;
  doc.amountInWords = amountInWordsIndian(doc.total);
  return doc;
};

/** Freeze the seller block onto the Tax Invoice so later Company Settings edits never change it. */
const issuerSnapshotFrom = (s = {}) => ({
  name: s.name,
  addressLines: s.addressLines || [],
  gstin: s.gstin,
  pan: s.pan,
  msmeType: s.msmeType,
  msmeNumber: s.msmeNumber,
  email: s.email,
  phone: s.phone,
  gstStateCode: s.gstStateCode,
  gstStateName: s.gstStateName,
  bank: { ...(s.bank || {}) },
  authorisedSignatory: { ...(s.authorisedSignatory || {}) }
});

module.exports = {
  DEFAULT_HSN,
  HSN_RE,
  SEED_RULES,
  ensureSeedRules,
  loadActiveRules,
  findRule,
  rateForPiece,
  applyTaxRates,
  computeTaxTotals,
  issuerSnapshotFrom
};

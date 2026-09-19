const {
  Lot, CuttingSheet, Stitching, Washing, Finishing,
  AccessoryConsumption, AccessoryItem, AccessoryType,
  WashingVendor, LotCosting, Client, FitStyle,
} = require('../mongodb_schema');

// ─── COSTING PER PIECE ───────────────────────────────────────────────────────
// Costs are DERIVED LIVE from the source records on every read — nothing is
// cached here (no second source of truth). Only the pricing-side overlay
// (per-pc uplifts + profit margin) is persisted in LotCosting. Every RATE below is a
// point-in-time snapshot taken off the lot's own records, never a live master, so a
// later vendor/accessory price revision cannot re-price work that is already done.
//
//   a) Fabric    = fabricRate x avgConsumption            (CuttingSheet)
//   b) Stitching = Stitching.rate                          (straightforward)
//   c) Washing   = Σ(qty x rate) / Σ(qty)                  (quantity-weighted avg
//                over BILLED pcs; row rates frozen at save time)
//   d) Finishing = Finishing.rate                          (straightforward)
//   e) Accessories = Σ(consumption qty x rateSnapshot) / basis pcs
//
//   Adjusted CP = a + b + c + d + e + per-pc uplifts (fabric/stitch/finish)
//   Final SP    = Adjusted CP + profitMarginPerPc + expensesPerPc
//                 (expenses are charged through to the client, after the margin)

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Selling prices are always quoted in whole rupees and never rounded down:
// ₹579.01 → ₹580. Applies only to the FINAL SP — the cost components keep
// their paisa precision so the breakdown still reconciles against the bills.
const ceilRupee = (n) => Math.ceil((Number(n) || 0) - 1e-9);

// Quantity-weighted average wash rate over BILLED pcs (Σ quantity — what the
// washer was given and billed on; shorts are reconciled separately at max SP).
// No uplift is applied: wash pricing is per creation (WashCreationRate), so the
// weighted average already IS the true per-pc wash cost. Margin is applied once,
// at the pricing overlay (profitMarginPerPc), not stacked on top of the washer.
// Legacy detail rows (free-text creation, stored rate) join the average with
// their stored rate, so pre-catalog records cost correctly.
const computeWashingComponent = (washing) => {
  if (!washing || !Array.isArray(washing.washDetails) || washing.washDetails.length === 0) {
    return { available: false, reason: 'No washing record yet' };
  }
  let totalAmount = 0, totalPcs = 0, netPcs = 0;
  for (const d of washing.washDetails) {
    const qty = Number(d.quantity) || 0;
    const rate = Number(d.rate) || 0;
    totalAmount += qty * rate;
    totalPcs += qty;
    netPcs += qty - (Number(d.quantityShort) || 0);
  }
  if (totalPcs <= 0) return { available: false, reason: 'Washing record has no quantities' };

  const weightedAvg = round2(totalAmount / totalPcs);

  return {
    available: true,
    weightedAvg,
    perPc: weightedAvg,   // the wash cost component (same key the other stages expose)
    totalPcs,             // billed pcs (denominator used)
    netPcs,               // good output — display only
    totalAmount: round2(totalAmount),
    vendorName: washing.vendorId?.name || null,
  };
};

// Accessories: Σ(consumption qty x FROZEN rate) for this lot, grouped by type.
// The rate is read from the consumption row's rateSnapshot (frozen when the stage was
// recorded). Only rows written before that field existed fall back to the live master
// rate — that keeps legacy lots reproducing their current numbers instead of jumping.
// Per-pc denominator = Finishing.accessoryBasisPcs (fallback: finishing quantity).
// Pocketing has no consumption stream in this system (purchases/payments only),
// so it legitimately shows 0 here.
const accessoryRateOf = (row) => {
  const frozen = row?.rateSnapshot;
  if (frozen !== undefined && frozen !== null) return Number(frozen) || 0;
  return Number(row?.accessoryItemId?.rate) || 0;
};

const computeAccessoriesComponent = async (lotId, finishing) => {
  const rows = await AccessoryConsumption.find({ lotId })
    .populate('accessoryTypeId', 'name key')
    .populate('accessoryItemId', 'name rate')
    .lean();

  if (!rows || rows.length === 0) {
    return { available: false, reason: 'No accessory consumption recorded for this lot' };
  }

  const byType = new Map();
  let totalMoney = 0;
  for (const r of rows) {
    const itemRate = accessoryRateOf(r);
    const money = (Number(r.qty) || 0) * itemRate;
    totalMoney += money;
    const key = String(r.accessoryTypeId?._id || r.accessoryTypeId);
    if (!byType.has(key)) {
      byType.set(key, {
        typeId: key,
        typeName: r.accessoryTypeId?.name || 'Unknown',
        stage: r.stage,
        qty: 0,
        money: 0,
      });
    }
    const g = byType.get(key);
    g.qty += Number(r.qty) || 0;
    g.money = round2(g.money + money);
  }

  const basisPcs = Number(finishing?.accessoryBasisPcs) || Number(finishing?.quantity) || 0;
  if (basisPcs <= 0) {
    return { available: false, reason: 'No finishing record to divide accessory cost over' };
  }

  return {
    available: true,
    totalMoney: round2(totalMoney),
    basisPcs,
    perPc: round2(totalMoney / basisPcs),
    byType: [...byType.values()].map(g => ({ ...g, perPc: round2(g.money / basisPcs) })),
  };
};

// Full per-lot costing. `lot` may be a doc or lean object; vendor + costing
// overlay are loaded here so callers get a complete, self-contained payload.
const computeLotCosting = async (lot) => {
  const lotId = lot._id;

  const [sheet, stitching, washing, finishing, vendor, overlay] = await Promise.all([
    lot.cuttingSheetId
      ? CuttingSheet.findOne({ lotId }).lean()
      : CuttingSheet.findOne({ lotId }).lean(), // covers attach-mode lots too (sheet.lotId)
    Stitching.findOne({ lotId }).populate('vendorId', 'name').lean(),
    Washing.findOne({ lotId }).populate('vendorId', 'name').lean(),
    Finishing.findOne({ lotId }).populate('vendorId', 'name').lean(),
    null, // vendor comes populated off the washing record
    LotCosting.findOne({ lotId }).lean(),
  ]);

  // a) Fabric — from the cutting sheet (the book AVG the cutters already write).
  // The entered rate is EXCLUSIVE of GST; the paid rate = rate × (1 + GST%).
  // Sheets created before the field existed read as 0 GST (rate was the final rate).
  let fabric;
  if (sheet && sheet.totalPcs > 0) {
    const gstPercent = Number(sheet.fabricGSTPercent) || 0;
    const effectiveRate = round2((Number(sheet.fabricRate) || 0) * (1 + gstPercent / 100));
    const perPc = round2(effectiveRate * (Number(sheet.avgConsumption) || 0));
    fabric = {
      available: true,
      fabricRate: Number(sheet.fabricRate) || 0,
      gstPercent,
      effectiveRate,
      avgConsumption: Number(sheet.avgConsumption) || 0,
      totalMeters: Number(sheet.totalMeters) || 0,
      totalPcs: Number(sheet.totalPcs) || 0,
      perPc,
      fabric: sheet.fabric,
    };
  } else {
    fabric = { available: false, reason: 'No cutting sheet (lot predates the book)' };
  }

  // b) Stitching
  const stitch = stitching
    ? { available: true, rate: Number(stitching.rate) || 0, quantity: Number(stitching.quantity) || 0, vendorName: stitching.vendorId?.name || null }
    : { available: false, reason: 'No stitching record yet' };

  // c) Washing — quantity-weighted over the frozen row rates (no uplift; see above)
  const washingComponent = computeWashingComponent(washing);

  // d) Finishing
  const finish = finishing
    ? { available: true, rate: Number(finishing.rate) || 0, quantity: Number(finishing.quantity) || 0, vendorName: finishing.vendorId?.name || null }
    : { available: false, reason: 'No finishing record yet' };

  // e) Accessories
  const accessories = await computeAccessoriesComponent(lotId, finishing);

  // Overlay defaults
  const fabricUplift = Number(overlay?.fabricUpliftPerPc) || 0;
  const stitchingUplift = Number(overlay?.stitchingUpliftPerPc) || 0;
  const finishingUplift = Number(overlay?.finishingUpliftPerPc) || 0;
  const profitMargin = Number(overlay?.profitMarginPerPc) || 0;
  const expenses = Number(overlay?.expensesPerPc) || 0;

  const baseCP = round2(
    (fabric.available ? fabric.perPc : 0) +
    (stitch.available ? stitch.rate : 0) +
    (washingComponent.available ? washingComponent.perPc : 0) +
    (finish.available ? finish.rate : 0) +
    (accessories.available ? accessories.perPc : 0)
  );
  const adjustedCP = round2(baseCP + fabricUplift + stitchingUplift + finishingUplift);
  const finalSP = ceilRupee(adjustedCP + profitMargin + expenses);

  return {
    lot: {
      _id: lot._id,
      lotNumber: lot.lotNumber,
      status: lot.status,
      fabric: lot.fabric,
      clientId: lot.clientId?._id || lot.clientId || null,
      clientName: lot.clientId?.name || null,
      fitStyleId: lot.fitStyleId?._id || lot.fitStyleId || null,
      fitStyleName: lot.fitStyleId?.name || null,
    },
    components: { fabric, stitching: stitch, washing: washingComponent, finishing: finish, accessories },
    uplifts: { fabricUpliftPerPc: fabricUplift, stitchingUpliftPerPc: stitchingUplift, finishingUpliftPerPc: finishingUplift },
    profitMarginPerPc: profitMargin,
    expensesPerPc: expenses,
    baseCP,
    adjustedCP,
    finalSP,
    complete: fabric.available && stitch.available && washingComponent.available && finish.available,
    notes: overlay?.notes || '',
    overlayUpdatedAt: overlay?.updatedAt || null,
  };
};

// Board: lots (status >= 2) with quick CP/SP — BATCHED. One page = six `$in`
// queries total (instead of ~7 queries per lot), computed in memory. Rows mirror
// computeLotCosting's per-stage math (incl. the GST-inclusive fabric rate).
const computeBoardRows = (lots, docs) => {
  const { sheets, stitches, washes, finishes, overlays, accRows } = docs;
  const byLot = (list) => {
    const m = new Map();
    for (const d of list) m.set(String(d.lotId?._id || d.lotId), d);
    return m;
  };
  const sheetMap = byLot(sheets);
  const stitchMap = byLot(stitches);
  const washMap = byLot(washes);
  const finishMap = byLot(finishes);
  const overlayMap = byLot(overlays);
  const accByLot = new Map();
  for (const r of accRows) {
    const k = String(r.lotId?._id || r.lotId);
    if (!accByLot.has(k)) accByLot.set(k, []);
    accByLot.get(k).push(r);
  }

  return lots.map((lot) => {
    const k = String(lot._id);
    const sheet = sheetMap.get(k) || null;
    const stitching = stitchMap.get(k) || null;
    const washing = washMap.get(k) || null;
    const finishing = finishMap.get(k) || null;
    const overlay = overlayMap.get(k) || null;
    const accRows = accByLot.get(k) || [];

    // a) Fabric — GST-inclusive rate × AVG
    const hasSheet = !!(sheet && sheet.totalPcs > 0);
    const gstPercent = hasSheet ? Number(sheet.fabricGSTPercent) || 0 : 0;
    const effectiveRate = hasSheet ? round2((Number(sheet.fabricRate) || 0) * (1 + gstPercent / 100)) : 0;
    const fabricCP = hasSheet ? round2(effectiveRate * (Number(sheet.avgConsumption) || 0)) : null;

    // b) Stitching
    const stitchingCP = stitching ? Number(stitching.rate) || 0 : null;

    // c) Washing — weighted avg over the frozen row rates (identical rules to the
    //    single-lot compute; no uplift)
    const washComp = computeWashingComponent(washing);

    // d) Finishing
    const finishingCP = finishing ? Number(finishing.rate) || 0 : null;

    // e) Accessories — Σ(qty × frozen rate) over the finishing basis pcs
    const basisPcs = Number(finishing?.accessoryBasisPcs) || Number(finishing?.quantity) || 0;
    let accMoney = 0;
    for (const r of accRows) accMoney += (Number(r.qty) || 0) * accessoryRateOf(r);
    const accessoriesCP = basisPcs > 0 ? round2(accMoney / basisPcs) : null;

    const baseCP = round2(
      (fabricCP ?? 0) + (stitchingCP ?? 0) + (washComp.available ? washComp.perPc : 0) +
      (finishingCP ?? 0) + (accessoriesCP ?? 0)
    );
    const adjustedCP = round2(baseCP +
      (Number(overlay?.fabricUpliftPerPc) || 0) +
      (Number(overlay?.stitchingUpliftPerPc) || 0) +
      (Number(overlay?.finishingUpliftPerPc) || 0));
    const finalSP = ceilRupee(adjustedCP + (Number(overlay?.profitMarginPerPc) || 0) + (Number(overlay?.expensesPerPc) || 0));

    return {
      lotId: lot._id,
      lotNumber: lot.lotNumber,
      status: lot.status,
      clientName: lot.clientId?.name || null,
      fitStyleName: lot.fitStyleId?.name || null,
      fabricCP,
      stitchingCP,
      washingCP: washComp.available ? washComp.perPc : null,
      finishingCP,
      accessoriesCP,
      adjustedCP,
      finalSP,
      complete: fabricCP !== null && stitchingCP !== null && washComp.available && finishingCP !== null,
    };
  });
};

// GET board — filter=costed (default): only lots WITH a cutting sheet (fabric is the
// costing anchor and the vast majority of the board); filter=all shows every active
// lot. search narrows by lotNumber.
const getCostingBoard = async ({ search = '', page = 1, limit = 25, filter = 'costed' }) => {
  const query = { status: { $gte: 2 } };
  if (search) query.lotNumber = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (filter !== 'all') {
    // "costed" = a cutting sheet exists (fabric rate calculated) i.e. the lot has
    // enough production data to be worth costing. distinct() avoids materialising
    // every sheet document just to build the id list.
    query._id = { $in: await CuttingSheet.distinct('lotId') };
  }

  const lim = Math.min(parseInt(limit, 10) || 25, 100);
  const pg = Math.max(parseInt(page, 10) || 1, 1);
  const [lots, total] = await Promise.all([
    Lot.find(query)
      .sort({ createdAt: -1 })
      .skip((pg - 1) * lim)
      .limit(lim)
      .populate('clientId', 'name')
      .populate('fitStyleId', 'name')
      .lean(),
    Lot.countDocuments(query),
  ]);
  const ids = lots.map(l => l._id);

  const [sheets, stitches, washes, finishes, overlays, accRows] = await Promise.all([
    CuttingSheet.find({ lotId: { $in: ids } }).lean(),
    Stitching.find({ lotId: { $in: ids } }).populate('vendorId', 'name').lean(),
    Washing.find({ lotId: { $in: ids } }).populate('vendorId', 'name').lean(),
    Finishing.find({ lotId: { $in: ids } }).populate('vendorId', 'name').lean(),
    LotCosting.find({ lotId: { $in: ids } }).lean(),
    AccessoryConsumption.find({ lotId: { $in: ids } })
      .populate('accessoryTypeId', 'name key')
      .populate('accessoryItemId', 'name rate')
      .lean(),
  ]);

  return {
    rows: computeBoardRows(lots, { sheets, stitches, washes, finishes, overlays, accRows }),
    total,
    page: pg,
    limit: lim,
  };
};

// NOTE: the req/res handlers for /lot/:id live in costingController.js — the service
// stays free of Express so computeLotCosting can be reused (board, reports, tests).
module.exports = { computeLotCosting, getCostingBoard };
const {
  Lot, CuttingSheet, Stitching, Washing, Finishing,
  AccessoryConsumption, AccessoryItem, AccessoryType,
  WashingVendor, LotCosting, Client, FitStyle,
} = require('../mongodb_schema');

// ─── COSTING PER PIECE ───────────────────────────────────────────────────────
// Costs are DERIVED LIVE from the source records on every read — nothing is
// cached here (no second source of truth). Only the pricing-side overlay
// (stage uplifts + profit margin) is persisted in LotCosting.
//
//   a) Fabric    = fabricRate x avgConsumption            (CuttingSheet)
//   b) Stitching = Stitching.rate                          (straightforward)
//   c) Washing   = Σ(qty x rate) / Σ(qty)                  (quantity-weighted avg
//                adjusted = weightedAvg x (1 + uplift%/100) over BILLED pcs)
//   d) Finishing = Finishing.rate                          (straightforward)
//   e) Accessories = Σ(consumption qty x item rate) / basis pcs
//
//   Adjusted CP = a + b + c_adj + d + e + stage uplifts (fabric/stitch/finish)
//   Final SP    = Adjusted CP + profitMarginPerPc + expensesPerPc
//                 (expenses are charged through to the client, after the margin)

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Selling prices are always quoted in whole rupees and never rounded down:
// ₹579.01 → ₹580. Applies only to the FINAL SP — the cost components keep
// their paisa precision so the breakdown still reconciles against the bills.
const ceilRupee = (n) => Math.ceil((Number(n) || 0) - 1e-9);

// Quantity-weighted average wash rate over BILLED pcs (Σ quantity — what the
// washer was given and billed on; shorts are reconciled separately at max SP).
// Legacy detail rows (free-text creation, stored rate) join the average with
// their stored rate, so pre-catalog records cost correctly.
const computeWashingComponent = (washing, vendorUpliftPercent, lotOverridePercent) => {
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
  // Uplift: per-lot override wins; otherwise the washing vendor's default (12).
  const upliftPercent = lotOverridePercent !== undefined && lotOverridePercent !== null
    ? Number(lotOverridePercent)
    : (vendorUpliftPercent !== undefined && vendorUpliftPercent !== null ? Number(vendorUpliftPercent) : 12);
  const adjusted = round2(weightedAvg * (1 + upliftPercent / 100));

  return {
    available: true,
    weightedAvg,
    upliftPercent,
    adjusted,
    totalPcs,   // billed pcs (denominator used)
    netPcs,     // good output — display only
    totalAmount: round2(totalAmount),
    vendorName: washing.vendorId?.name || null,
  };
};

// Accessories: Σ(consumption qty x item rate) for this lot, grouped by type.
// Per-pc denominator = Finishing.accessoryBasisPcs (fallback: finishing quantity).
// Pocketing has no consumption stream in this system (purchases/payments only),
// so it legitimately shows 0 here.
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
    const itemRate = Number(r.accessoryItemId?.rate) || 0;
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
    Washing.findOne({ lotId }).populate('vendorId', 'name upliftPercent').lean(),
    Finishing.findOne({ lotId }).populate('vendorId', 'name').lean(),
    null, // vendor comes populated off the washing record
    LotCosting.findOne({ lotId }).lean(),
  ]);

  // a) Fabric — from the cutting sheet (the book AVG the cutters already write)
  let fabric;
  if (sheet && sheet.totalPcs > 0) {
    const perPc = round2((Number(sheet.fabricRate) || 0) * (Number(sheet.avgConsumption) || 0));
    fabric = {
      available: true,
      fabricRate: Number(sheet.fabricRate) || 0,
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

  // c) Washing — quantity-weighted, uplift from overlay → vendor default
  const washingComponent = computeWashingComponent(
    washing,
    washing?.vendorId?.upliftPercent,
    overlay?.washingUpliftPercent
  );

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
    (washingComponent.available ? washingComponent.adjusted : 0) +
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

// Board: lots (status >= 2) with quick CP/SP. Computed per lot — fine at this
// scale (a page of lots, each a handful of indexed queries).
const getCostingBoard = async (req, res) => {
  const { search = '', page = 1, limit = 25 } = req.query;
  const query = { status: { $gte: 2 } };
  if (search) query.lotNumber = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

  const lim = Math.min(parseInt(limit, 10) || 25, 100);
  const skip = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;

  const lots = await Lot.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(lim)
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .lean();

  const rows = [];
  for (const lot of lots) {
    const c = await computeLotCosting(lot);
    rows.push({
      lotId: lot._id,
      lotNumber: lot.lotNumber,
      status: lot.status,
      clientName: lot.clientId?.name || null,
      fitStyleName: lot.fitStyleId?.name || null,
      fabricCP: c.components.fabric.available ? c.components.fabric.perPc : null,
      stitchingCP: c.components.stitching.available ? c.components.stitching.rate : null,
      washingCP: c.components.washing.available ? c.components.washing.adjusted : null,
      finishingCP: c.components.finishing.available ? c.components.finishing.rate : null,
      accessoriesCP: c.components.accessories.available ? c.components.accessories.perPc : null,
      adjustedCP: c.adjustedCP,
      finalSP: c.finalSP,
      complete: c.complete,
    });
  }

  const total = await Lot.countDocuments(query);
  res.json({ rows, total, page: parseInt(page, 10) || 1, limit: lim });
};

const getLotCosting = async (req, res) => {
  const lot = await Lot.findById(req.params.lotId)
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .lean();
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  res.json(await computeLotCosting(lot));
};

// PUT /api/costing/lot/:lotId — upsert the pricing overlay, return the recompute.
const saveLotCosting = async (req, res) => {
  const lot = await Lot.findById(req.params.lotId).lean();
  if (!lot) return res.status(404).json({ error: 'Lot not found' });

  const num = (v) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? null : Math.max(Number(v), 0));

  const update = {
    washingUpliftPercent: num(req.body.washingUpliftPercent),
    fabricUpliftPerPc: num(req.body.fabricUpliftPerPc) ?? 0,
    stitchingUpliftPerPc: num(req.body.stitchingUpliftPerPc) ?? 0,
    finishingUpliftPerPc: num(req.body.finishingUpliftPerPc) ?? 0,
    profitMarginPerPc: num(req.body.profitMarginPerPc) ?? 0,
    notes: req.body.notes !== undefined ? String(req.body.notes) : undefined,
    updatedBy: req.user?.userId,
    updatedAt: new Date(),
  };
  // Drop undefined so a missing field doesn't wipe an existing note.
  Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

  await LotCosting.findOneAndUpdate(
    { lotId: lot._id },
    { $set: update },
    { upsert: true, new: true }
  );

  const fresh = await Lot.findById(lot._id)
    .populate('clientId', 'name')
    .populate('fitStyleId', 'name')
    .lean();
  res.json(await computeLotCosting(fresh));
};

module.exports = { computeLotCosting, getCostingBoard, getLotCosting, saveLotCosting };
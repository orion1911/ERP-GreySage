const { Lot } = require('../mongodb_schema');
const { computeLotCosting } = require('../services/costingService');

// Thin req/res layer over costingService.computeLotCosting (all money maths
// live in the service so it stays reusable/testable).

// GET /api/costing?search=&page=&limit= — board of lots (status >= 2) with
// quick per-stage CP, Adjusted CP and Final SP.
const getCostingBoard = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25 } = req.query;
    const query = { status: { $gte: 2 } };
    if (search) query.lotNumber = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const lim = Math.min(parseInt(limit, 10) || 25, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pg - 1) * lim;

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
    res.json({ rows, total, page: pg, limit: lim });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET /api/costing/lot/:lotId — full auditable breakdown + saved overlay.
const getLotCosting = async (req, res) => {
  try {
    const lot = await Lot.findById(req.params.lotId)
      .populate('clientId', 'name')
      .populate('fitStyleId', 'name')
      .lean();
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    res.json(await computeLotCosting(lot));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// PUT /api/costing/lot/:lotId — upsert the pricing overlay; returns the recompute.
const saveLotCosting = async (req, res) => {
  try {
    const lot = await Lot.findById(req.params.lotId).lean();
    if (!lot) return res.status(404).json({ error: 'Lot not found' });

    const num = (v) => (v === '' || v === undefined || v === null || isNaN(Number(v)) ? null : Math.max(Number(v), 0));

    const update = {
      washingUpliftPercent: num(req.body.washingUpliftPercent), // null = vendor default
      fabricUpliftPerPc: num(req.body.fabricUpliftPerPc) ?? 0,
      stitchingUpliftPerPc: num(req.body.stitchingUpliftPerPc) ?? 0,
      finishingUpliftPerPc: num(req.body.finishingUpliftPerPc) ?? 0,
      profitMarginPerPc: num(req.body.profitMarginPerPc) ?? 0,
      expensesPerPc: num(req.body.expensesPerPc) ?? 0,
      notes: req.body.notes !== undefined ? String(req.body.notes) : undefined,
      updatedBy: req.user?.userId,
      updatedAt: new Date(),
    };
    // Drop undefined so a missing field doesn't wipe an existing note.
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const { LotCosting } = require('../mongodb_schema');
    await LotCosting.findOneAndUpdate({ lotId: lot._id }, { $set: update }, { upsert: true });

    const fresh = await Lot.findById(lot._id)
      .populate('clientId', 'name')
      .populate('fitStyleId', 'name')
      .lean();
    res.json(await computeLotCosting(fresh));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { getCostingBoard, getLotCosting, saveLotCosting };
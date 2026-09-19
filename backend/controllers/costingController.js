const { computeLotCosting, getCostingBoard: computeBoard } = require('../services/costingService');
const { Lot, LotCosting } = require('../mongodb_schema');

// Thin req/res layer over costingService (all money maths live in the service so
// it stays reusable/testable).

// GET /api/costing?search=&page=&limit=&filter=costed|all — board of lots with
// quick per-stage CP, Adjusted CP and Final SP. filter=costed (default) limits the
// board to lots with a cutting sheet; the service does the batched computing.
const getCostingBoard = async (req, res) => {
  try {
    const { search = '', page = 1, limit = 25, filter = 'costed' } = req.query;
    res.json(await computeBoard({ search, page, limit, filter }));
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
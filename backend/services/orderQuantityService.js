const { Stitching, Washing, Finishing, Order } = require('../mongodb_schema');

/**
 * Recalculate order.finalTotalQuantity by subtracting all quantityShort
 * from stitching, washing (washDetails), and finishing records.
 */
const recalcFinalQuantity = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) return;

  // Stitching shorts
  const stitchings = await Stitching.find({ orderId });
  const stitchingShort = stitchings.reduce((sum, s) => sum + (s.quantityShort || 0), 0);

  // Get lot IDs from stitching records
  const lotIds = stitchings.map(s => s.lotId).filter(Boolean);

  // Washing shorts (from washDetails[].quantityShort)
  const washings = await Washing.find({ lotId: { $in: lotIds } });
  const washingShort = washings.reduce((sum, w) => {
    const detailShort = (w.washDetails || []).reduce((ds, d) => ds + (d.quantityShort || 0), 0);
    return sum + detailShort;
  }, 0);

  // Finishing shorts
  const finishings = await Finishing.find({ lotId: { $in: lotIds } });
  const finishingShort = finishings.reduce((sum, f) => sum + (f.quantityShort || 0), 0);

  const totalShort = stitchingShort + washingShort + finishingShort;
  order.finalTotalQuantity = order.totalQuantity - totalShort;
  await order.save();
};

module.exports = { recalcFinalQuantity };

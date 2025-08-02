const { Lot, Stitching, Washing, Finishing } = require('../mongodb_schema');

const getLotNumber = async (req, res) => {
  const { lotId } = req.body;
  try {
    const lot = await Lot.findById(lotId);
    if (!lot) return res.status(404).json({ error: 'Lot not found' });
    res.json(lot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const createLot = async (req, res) => {
  const { lotNumber, invoiceNumber, orderId, date, description } = req.body;

  // Validate required fields
  if (!lotNumber) return res.status(400).json({ error: 'Lot number is required' });
  if (!invoiceNumber) return res.status(400).json({ error: 'Invoice number is required' });

  try {
    // Validate invoiceNumber as a number
    const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
    if (isNaN(parsedInvoiceNumber)) {
      return res.status(400).json({ error: 'Invoice number must be a valid number' });
    }

    const lot = new Lot({
      lotNumber,
      invoiceNumber: parsedInvoiceNumber,
      orderId,
      date: date,
      description,
      createdAt: new Date(),
    });

    await lot.save();
    // await logAction(req.user.userId, 'create_lot', 'Lot', lot._id, `Lot ${lotNumber} created`);
    res.status(201).json(lot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const searchByLotNumber = async (req, res) => {
  const { lotNumber, orderId } = req.query;
  try {
    const lot = await Lot.findOne({ lotNumber, orderId });
    if (!lot) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    const [stitching, washing, finishing] = await Promise.all([
      Stitching.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
      Washing.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
      Finishing.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
    ]);

    res.json({
      lot,
      stitching,
      washing,
      finishing,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const searchByInvoiceNumber = async (req, res) => {
  const { invoiceNumber, orderId } = req.query;
  try {
    const parsedInvoiceNumber = parseInt(invoiceNumber, 10);
    if (isNaN(parsedInvoiceNumber)) {
      return res.status(400).json({ error: 'Invoice number must be a valid number' });
    }

    const lot = await Lot.findOne({ invoiceNumber: parsedInvoiceNumber, orderId });
    if (!lot) {
      return res.status(404).json({ error: 'Lot not found' });
    }

    const [stitching, washing, finishing] = await Promise.all([
      Stitching.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
      Washing.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
      Finishing.find({ lotId: lot._id }).populate('orderId vendorId lotId'),
    ]);

    res.json({
      lot,
      stitching,
      washing,
      finishing,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getLotStatus = async (req, res) => {
  const { lotId } = req.query;
  try {
    const lots = await Lot.find({}, { _id: 1, lotNumber: 1 }).lean();
    if (!lots || lots.length === 0) {
      return res.status(404).json({ error: 'No Lot Found' });
    }

    const lotStatuses = await Promise.all(
      lots.map(async (lot) => {
        // Check if lotId exists in Finishing
        const finishingRecord = await Finishing.findOne({ lotId: lot._id }).lean();
        if (finishingRecord) {
          return { lotId: lot._id, lotNumber: lot.lotNumber, status: 4 };
        }

        // Check if lotId exists in Washing
        const washingRecord = await Washing.findOne({ lotId: lot._id }).lean();
        if (washingRecord) {
          return { lotId: lot._id, lotNumber: lot.lotNumber, status: 3 };
        }

        // Default to Stitching
        return { lotId: lot._id, lotNumber: lot.lotNumber, status: 2 };
      })
    );

    // Filter by lotId if provided
    const result = lotId
      ? lotStatuses.filter((lot) => lot.lotId.toString() === lotId)
      : lotStatuses;

    if (lotId && result.length === 0) {
      return res.status(404).json({ error: 'Lot not found for the provided lotId' });
    }

    res.json(lot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = { getLotNumber, createLot, searchByLotNumber, searchByInvoiceNumber };
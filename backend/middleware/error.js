const errorHandler = (err, req, res, next) => {
  // MongoDB duplicate key error
  if (err.name === 'MongoServerError' && err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      error: `Record already exists for ${field}: ${err.keyValue[field]}`,
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: messages,
    });
  }

  // Mongoose CastError (e.g., invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: `Invalid ${err.path}: ${err.value}`,
    });
  }

  // MongoDB transaction error
  if (err.name === 'MongoServerError' && err.message.includes('Transaction')) {
    return res.status(400).json({
      success: false,
      error: 'Transaction failed, please try again',
    });
  }

  // Custom lotNumber validation errors
  if (err.message && (err.message.includes('Lot number') || err.message.includes('lotNumber format') || err.message.includes('Series must') || err.message.includes('Sub-series must') || err.message.includes('Lot range'))) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  }

  // Generic error
  console.error(err.stack);
  res.status(500).json({
    success: false,
    error: 'An unexpected error occurred',
  });
};

module.exports = errorHandler;
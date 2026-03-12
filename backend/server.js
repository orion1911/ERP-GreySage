const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('express-async-errors');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const userRoutes = require('./routes/users');
const clientRoutes = require('./routes/clients');
const fitStyleRoutes = require('./routes/fitStyles');
const vendorRoutes = require('./routes/vendors');
const orderRoutes = require('./routes/orders');
const lotRoutes = require('./routes/lots');
const stitchingRoutes = require('./routes/stitching');
const washingRoutes = require('./routes/washing');
const finishingRoutes = require('./routes/finishing');
const invoiceRoutes = require('./routes/invoices');
const vendorBalanceRoutes = require('./routes/vendorBalances');
const balancesRoutes = require('./routes/balances');
const reportRoutes = require('./routes/reports');
const auditLogRoutes = require('./routes/auditLogs');
const emailRoutes = require('./routes/contact');

// Middleware
const errorHandler = require('./middleware/error');

const app = express();

// ─── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['https://greysage.vercel.app'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Handle preflight for all routes
app.options('*', cors());
app.use(express.json());

// ─── MONGODB CONNECTION (Optimized for Vercel Serverless + Atlas M0) ─────────
// global._mongoConnection persists across warm serverless invocations
// so we reuse the same connection instead of opening a new pool every request

let isConnecting = false;

const connectDB = async () => {
  // Reuse cached live connection from a warm instance
  if (global._mongoConnection && mongoose.connection.readyState === 1) {
    return global._mongoConnection;
  }

  // Wait if another request is already mid-connection
  // readyState === 2 catches mongoose's own connecting state
  // isConnecting flag catches the race BEFORE readyState changes to 2
  if (mongoose.connection.readyState === 2 || isConnecting) {
    await new Promise(res => setTimeout(res, 500));
    return mongoose.connection;
  }

  isConnecting = true;
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 3,              // ✅ Critical for serverless — was 100, spikes Atlas M0 to limit
      minPoolSize: 1,              // ✅ Don't hold unnecessary idle connections
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      autoIndex: false,            // ✅ Skip index rebuild on every cold start
    });

    global._mongoConnection = conn;
    console.log('MongoDB connected');
    return conn;
  } catch (err) {
    global._mongoConnection = null;
    console.error('MongoDB connection error:', err.message);
    throw err;
  } finally {
    isConnecting = false;          // ✅ Always reset — even if connect throws
  }
};

// Ensure DB is connected before every request
// This is the serverless-safe pattern — connectDB is idempotent and cached
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    // Return a clean error instead of a CORS-less 500 crash
    res.status(503).json({
      success: false,
      error: 'Database unavailable. Please try again shortly.',
    });
  }
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', userRoutes);
app.use('/api', clientRoutes);
app.use('/api', fitStyleRoutes);
app.use('/api', vendorRoutes);
// app.use('/api', orderRoutes); // dormant — Order stage removed
app.use('/api', lotRoutes);
app.use('/api', stitchingRoutes);
app.use('/api', washingRoutes);
app.use('/api', finishingRoutes);
app.use('/api', invoiceRoutes);
app.use('/api', vendorBalanceRoutes);
app.use('/api', balancesRoutes);
app.use('/api', reportRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', emailRoutes);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// ─── ERROR HANDLER ───────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── LOCAL DEV: listen normally / VERCEL: export app as handler ──────────────
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  });
}

// ✅ Required for Vercel — without this export you get "No exports found" error
module.exports = app;
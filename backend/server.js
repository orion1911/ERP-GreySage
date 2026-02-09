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

// Middleware
const errorHandler = require('./middleware/error');

const app = express();

// Middleware Setup
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['https://greysage.vercel.app'];

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json());

// MongoDB Connection
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    // console.log('Already connected to MongoDB');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 100,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    // process.exit(1);
  }
};

// Log connection events
// mongoose.connection.on('connected', () => console.log('Mongoose connected'));
// mongoose.connection.on('disconnected', () => console.log('Mongoose disconnected'));
// mongoose.connection.on('error', (err) => console.error('Mongoose error:', err));

// Route Setup
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', userRoutes);
app.use('/api', clientRoutes);
app.use('/api', fitStyleRoutes);
app.use('/api', vendorRoutes);
app.use('/api', orderRoutes);
app.use('/api', lotRoutes);
app.use('/api', stitchingRoutes);
app.use('/api', washingRoutes);
app.use('/api', finishingRoutes);
app.use('/api', invoiceRoutes);
app.use('/api', vendorBalanceRoutes);
app.use('/api', balancesRoutes);
app.use('/api', reportRoutes);
app.use('/api', auditLogRoutes);

// 404 Catch-All
app.use((req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// Error Handling Middleware
app.use(errorHandler);

// Start server
connectDB().then(() => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
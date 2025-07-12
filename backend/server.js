const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('express-async-errors'); // Add this line

// Routes
const authRoutes = require('./routes/auth');
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
app.use(cors({
  // origin: [
  //   'https://urban-enigma-jxq7wq46vp5h7ww-8080.app.github.dev',
  //   'http://localhost:8080', // For local development
  //   'http://frontend:3000'  // For Docker-internal communication
  // ],
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // credentials: true // If your app uses cookies or auth headers
}));
app.options('*', cors()); // Explicitly handle OPTIONS requests

app.use(express.json());

// MongoDB Connection
//mongodb://adiladmin:caballer09@localhost:27017/sales_accounting?authSource=admin

// console.log(process.env.MONGO_URI)
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Route Setup
app.use('/api', authRoutes);
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

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
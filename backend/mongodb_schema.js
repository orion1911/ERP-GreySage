const mongoose = require('mongoose');

// Counter Schema: For generating sequential IDs
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., 'orderId'
  sequence: { type: Number, default: 0 }
});

// User Schema: Manages authentication and roles
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
UserSchema.index({ email: 1 });

// Client Schema: Includes clientCode
const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  clientCode: { type: String, required: true, unique: true },
  contact: { type: String },
  email: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
ClientSchema.index({ name: 1 }, { unique: true }); // Unique index on name

// FitStyle Schema: Lookup replacing Product
const FitStyleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
FitStyleSchema.index({ name: 1 }, { unique: true }); // Unique index on name

// FabricVendor Schema: Lookup for fabric vendors
const FabricVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contact: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// StitchingVendor Schema: Lookup for stitching vendors
const StitchingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contact: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// WashingVendor Schema: Lookup for washing vendors
const WashingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contact: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// FinishingVendor Schema: Lookup for finishing vendors
const FinishingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  contact: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// Order Schema: Stage #1 - Client bulk orders
const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  fabric: { type: String, required: true },
  fitStyleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FitStyle', required: true },
  waistSize: { type: String, required: true },
  totalQuantity: { type: Number, required: true, min: 1 },
  finalTotalQuantity: { type: Number, default: 0 },
  threadColors: [{
    color: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 }
  }],
  description: { type: String },
  attachments: [{ fileName: String, url: String }],
  status: { type: Number, enum: [1, 2, 3, 4, 5, 6], default: 1 },
  statusHistory: [{ status: Number, changedAt: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now }
});
OrderSchema.index({ clientId: 1, date: 1 }); // Compound index for client-specific date queries
OrderSchema.index({ status: 1, date: 1 }); // Compound index for status-based date queries
// OrderSchema.index({ createdAt: 1, clientId: 1, status: 1 });
// OrderSchema.index({ orderId: 1, clientId: 1 });

const LotSchema = new mongoose.Schema({
  lotNumber: { type: String, required: true, unique: true }, // e.g., A/1/5
  invoiceNumber: { type: Number, required: true, unique: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  date: { type: Date, required: true },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
LotSchema.index({ lotNumber: 1, invoiceNumber: 1, orderId: 1 });

// Stitching Schema: Stage #2 - Stitching/Making by vendors
const StitchingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  date: { type: Date, required: true },
  stitchOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'StitchingVendor', required: true },
  quantity: { type: Number, required: true, min: 1 },
  quantityShort: { type: Number, default: 0, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
StitchingSchema.index({ orderId: 1, date: 1 }); // Compound index for order-specific date queries
StitchingSchema.index({ lotId: 1 }); // Index for joining with Washing
// StitchingSchema.index({ lotId: 1, orderId: 1, vendorId: 1 });

// Washing Schema: Stage #3 - Washing by vendors
const WashingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  date: { type: Date, required: true },
  washOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'WashingVendor', required: true },
  washDetails: [{
    washColor: { type: String, required: true },
    washCreation: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },
    quantityShort: { type: Number, default: 0, min: 0 }
  }],
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
WashingSchema.index({ orderId: 1, date: 1 }); // Compound index for order-specific date queries
WashingSchema.index({ lotId: 1 }); // Index for joining with Stitching
// WashingSchema.index({ lotId: 1, orderId: 1, vendorId: 1 });

// Finishing Schema: Stage #4 - Finishing by vendors
const FinishingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true }, 
  date: { type: Date, required: true },
  finishOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinishingVendor', required: true },
  quantity: { type: Number, required: true, min: 1 },
  quantityShort: { type: Number, default: 0, min: 0 },
  rate: { type: Number, required: true, min: 0 },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
FinishingSchema.index({ orderId: 1, date: 1 }); // Compound index for order-specific date queries
// FinishingSchema.index({ lotId: 1, orderId: 1, vendorId: 1 });

// VendorBalance Schema: Tracks payments and balances
const VendorBalanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  vendorType: { type: String, enum: ['stitching', 'washing', 'finishing'], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  lotNumber: { type: String },
  totalAmount: { type: Number, required: true, default: 0 },
  paymentsMade: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});
VendorBalanceSchema.index({ vendorId: 1, vendorType: 1, orderId: 1, lotNumber: 1 });

// Invoice Schema: References Orders
const InvoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  totalAmount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'paid', 'partial'], default: 'pending' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
InvoiceSchema.index({ invoiceNumber: 1, orderId: 1 });

// Balance Schema: Order-based financials
const BalanceSchema = new mongoose.Schema({
  period: { type: String, required: true },
  startingBalance: { type: Number, required: true },
  totalSales: { type: Number, default: 0 },
  totalPayments: { type: Number, default: 0 },
  closingBalance: { type: Number, default: 0 },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

// Report Schema: Order-based reporting
const ReportSchema = new mongoose.Schema({
  period: { type: String, required: true },
  totalSales: { type: Number, default: 0 },
  totalPayments: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },
  topFitStyles: [{
    fitStyleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FitStyle' },
    quantity: Number,
    amount: Number
  }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// AuditLog Schema: Tracks actions
const AuditLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  entity: { type: String, enum: ['User', 'Client', 'FitStyle', 'Order', 'Stitching', 'Washing', 'Finishing', 'VendorBalance', 'Invoice', 'Balance', 'Report'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  details: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Counter: mongoose.model('Counter', CounterSchema),
  User: mongoose.model('User', UserSchema),
  Client: mongoose.model('Client', ClientSchema),
  FitStyle: mongoose.model('FitStyle', FitStyleSchema),
  FabricVendor: mongoose.model('FabricVendor', FabricVendorSchema),
  StitchingVendor: mongoose.model('StitchingVendor', StitchingVendorSchema),
  WashingVendor: mongoose.model('WashingVendor', WashingVendorSchema),
  FinishingVendor: mongoose.model('FinishingVendor', FinishingVendorSchema),
  Order: mongoose.model('Order', OrderSchema),
  Lot: mongoose.model('Lot', LotSchema),
  Stitching: mongoose.model('Stitching', StitchingSchema),
  Washing: mongoose.model('Washing', WashingSchema),
  Finishing: mongoose.model('Finishing', FinishingSchema),
  VendorBalance: mongoose.model('VendorBalance', VendorBalanceSchema),
  Invoice: mongoose.model('Invoice', InvoiceSchema),
  Balance: mongoose.model('Balance', BalanceSchema),
  Report: mongoose.model('Report', ReportSchema),
  AuditLog: mongoose.model('AuditLog', AuditLogSchema)
};
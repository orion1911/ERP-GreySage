const mongoose = require('mongoose');

// Counter Schema: For generating sequential IDs
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., 'orderId'
  sequence: { type: Number, default: 0 }
});

// Refresh token subdoc — one entry per active session/device.
// tokenHash is bcrypt(refreshToken) so a DB leak can't be used to mint sessions.
// familyId groups rotations from the same login; if a previously-rotated token
// is ever re-presented (theft signal) we wipe every entry sharing that familyId.
const RefreshTokenSchema = new mongoose.Schema({
  familyId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

// User Schema: Manages authentication and roles
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'user'], default: 'user' },
  isActive: { type: Boolean, default: true },
  refreshTokens: { type: [RefreshTokenSchema], default: [], select: false },
  createdAt: { type: Date, default: Date.now }
});
UserSchema.index({ email: 1 });

// Address subdoc (used for billing/shipping on Client and snapshotted on Invoice)
const AddressSchema = new mongoose.Schema({
  line1: { type: String, trim: true },
  line2: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  stateCode: { type: String, trim: true }, // GST 2-digit code, e.g. "27" Maharashtra
  pincode: { type: String, trim: true },
  country: { type: String, trim: true, default: 'India' }
}, { _id: false });

// BillingFirm: one of a client's billing identities (sub-biller). A client can transact
// through several GST-registered firms, each with its own legal name + GST/PAN + addresses.
// The chosen firm is snapshotted onto an Invoice at issue time (see snapshotClient).
// Keeps default _id so each firm is addressable from the Invoice (billingFirmId).
const BillingFirmSchema = new mongoose.Schema({
  billingName: { type: String, required: true, trim: true, uppercase: true }, // firm name printed on invoice
  contact: { type: String, trim: true }, // phone printed on invoice (clientSnapshot.phone)
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  billingAddress: { type: AddressSchema, default: () => ({}) },
  shippingAddress: { type: AddressSchema, default: () => ({}) },
  isActive: { type: Boolean, default: true }
});

// Client Schema: Includes clientCode + GST/billing details
// `name` is the internal display label (e.g. "ADAM HILL"); `billingName` is the legal
// firm/company name (e.g. "BRANDKO MART LLP") printed on the invoice's Bill To / Ship To.
// The client-level billing fields are the DEFAULT identity; `billingFirms` holds optional
// additional firms selectable per-invoice (falls back to the default when none is chosen).
const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  clientCode: { type: String, required: true, unique: true },
  billingName: { type: String, trim: true }, // firm name on invoice; falls back to `name` if blank
  contact: { type: String },
  email: { type: String },
  address: { type: String }, // legacy free-text; kept for back-compat
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  billingAddress: { type: AddressSchema, default: () => ({}) },
  shippingAddress: { type: AddressSchema, default: () => ({}) },
  billingFirms: { type: [BillingFirmSchema], default: [] }, // optional additional billing firms (sub-billers)
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
  createdAt: { type: Date, default: Date.now }
});
ClientSchema.index({ name: 1 }, { unique: true }); // Unique index on name
ClientSchema.index({ gstin: 1 }, { sparse: true });

// FitStyle Schema: Lookup replacing Product
const FitStyleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
  createdAt: { type: Date, default: Date.now }
});
FitStyleSchema.index({ name: 1 }, { unique: true }); // Unique index on name

// FabricVendor Schema: Lookup for fabric vendors
const FabricVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contact: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
  createdAt: { type: Date, default: Date.now }
});

// StitchingVendor Schema: Lookup for stitching vendors
const StitchingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contact: { type: String },
  address: { type: String },
  defaultRate: { type: Number, default: 0 }, // pre-fills the per-piece rate when selected at the stage
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
  createdAt: { type: Date, default: Date.now }
});

// WashingVendor Schema: Lookup for washing vendors
const WashingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contact: { type: String },
  address: { type: String },
  defaultRate: { type: Number, default: 0 }, // pre-fills the per-piece rate when selected at the stage
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
  createdAt: { type: Date, default: Date.now }
});

// FinishingVendor Schema: Lookup for finishing vendors
const FinishingVendorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  contact: { type: String },
  address: { type: String },
  defaultRate: { type: Number, default: 0 }, // pre-fills the per-piece rate when selected at the stage
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }, // user-defined display order for dropdowns/catalog (lower = first)
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
  description: { type: String },
  attachments: [{ fileName: String, url: String }],
  status: { type: Number, enum: [1, 2, 3, 4, 5, 6], default: 1 },
  createdAt: { type: Date, default: Date.now }
});
OrderSchema.index({ clientId: 1, date: 1 }); // Compound index for client-specific date queries
OrderSchema.index({ status: 1, date: 1 }); // Compound index for status-based date queries
// OrderSchema.index({ createdAt: 1, clientId: 1, status: 1 });
// OrderSchema.index({ orderId: 1, clientId: 1 });

const LotSchema = new mongoose.Schema({
  lotId: { type: String, unique: true },                    // LT-YYYYMMDD###
  lotNumber: { type: String, required: true, unique: true }, // e.g., A/1/5
  invoiceNumber: { type: Number, required: true, unique: true }, // upstream invoice (NOT the sales invoice)
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  fabric: { type: String, required: true },
  fitStyleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FitStyle', required: true },
  waistSize: { type: String, required: true },
  date: { type: Date, required: true },
  // 2 Stitching · 3 Washing · 4 Finishing · 5 Finished/Ready · 6 Partially Dispatched · 7 Dispatched
  status: { type: Number, enum: [2, 3, 4, 5, 6, 7], default: 2 },
  statusHistory: [{ status: Number, changedAt: { type: Date, default: Date.now } }],
  description: { type: String },
  // Sales-side cached aggregate: sum of all issued GOOD invoice-line pcs for this lot
  // (lines where isDamaged != true). Recomputed by invoiceService.recalcLotInvoiced
  // after every invoice write. goodRemaining = finalPcs - damagedPcs - invoicedPcs.
  invoicedPcs: { type: Number, default: 0, min: 0 },
  // Damaged pcs set aside from the client-dispatchable pool (editable anytime via the
  // Pending Dispatch page). These are real/sellable, held back from the assigned client
  // and later sold combined to a third party. clientDispatchableGood = finalPcs - damagedPcs.
  damagedPcs: { type: Number, default: 0, min: 0 },
  // Cached aggregate: sum of issued DAMAGED invoice-line pcs (lines where isDamaged == true),
  // i.e. damaged pcs already sold to third parties. Recomputed alongside invoicedPcs.
  // damagedRemaining = damagedPcs - damagedSoldPcs.
  damagedSoldPcs: { type: Number, default: 0, min: 0 },
  createdAt: { type: Date, default: Date.now }
});
LotSchema.index({ lotNumber: 1, invoiceNumber: 1 });
// Drives getLotsAvailableForDispatch / getPendingDispatch: filter by clientId, sort by
// createdAt desc. Without this, that query is a collection scan + in-memory sort.
LotSchema.index({ clientId: 1, createdAt: -1 });

// Stitching Schema: Stage #2 - Stitching/Making by vendors
const StitchingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  date: { type: Date, required: true },
  stitchOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'StitchingVendor', required: true },
  quantity: { type: Number, required: true, min: 0 },
  quantityShort: { type: Number, default: 0, min: 0 },
  quantityShortDesc: { type: String },
  rate: { type: Number, required: true, min: 0 },
  threadColors: [{
    color: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 }
  }],
  isPaid: { type: Boolean, default: false }, // vendor settled this lot's work (row disabled in vendor payments)
  paidAt: { type: Date },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
StitchingSchema.index({ lotId: 1 }); // Index for joining with Washing
StitchingSchema.index({ date: 1 }); // Index for dashboard date range queries

// Washing Schema: Stage #3 - Washing by vendors
const WashingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  date: { type: Date, required: true },
  washOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'WashingVendor', required: true },
  washDetails: [{
    washColor: { type: String, required: true },
    washCreation: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },
    quantityShort: { type: Number, default: 0, min: 0 },
    quantityShortDesc: { type: String }
  }],
  isPaid: { type: Boolean, default: false }, // vendor settled this lot's work (row disabled in vendor payments)
  paidAt: { type: Date },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
WashingSchema.index({ lotId: 1 }); // Index for joining with Stitching
WashingSchema.index({ date: 1 }); // Index for dashboard date range queries

// Finishing Schema: Stage #4 - Finishing by vendors
const FinishingSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  date: { type: Date, required: true },
  finishOutDate: { type: Date },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinishingVendor', required: true },
  quantity: { type: Number, required: true, min: 1 },
  quantityShort: { type: Number, default: 0, min: 0 },
  quantityShortDesc: { type: String },
  rate: { type: Number, required: true, min: 0 },
  isPaid: { type: Boolean, default: false }, // vendor settled this lot's work (row disabled in vendor payments)
  paidAt: { type: Date },
  description: { type: String },
  createdAt: { type: Date, default: Date.now }
});
FinishingSchema.index({ lotId: 1 }); // Index for joining with Lot
FinishingSchema.index({ date: 1 }); // Index for dashboard date range queries

// VendorPaymentEntry Schema: Records individual payments and short adjustments
const VendorPaymentEntrySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  vendorType: { type: String, enum: ['stitching', 'washing', 'finishing'], required: true },
  paymentScope: { type: String, enum: ['vendor', 'lot'], default: 'vendor' }, // vendor = lump sum, lot = specific lot
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot' }, // Optional for vendor-level payments
  paymentType: { type: String, enum: ['payment', 'short_adjustment'], required: true },
  amount: { type: Number, required: true },
  paymentDate: { type: Date, required: true }, // Date when payment was made
  shortQuantity: { type: Number, default: 0, min: 0 }, // For short adjustment entries
  shortRate: { type: Number, default: 0, min: 0 }, // For short adjustment entries
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Track who updated the entry
  updatedAt: { type: Date } // Track when the entry was last updated
});
VendorPaymentEntrySchema.index({ vendorId: 1, vendorType: 1, paymentScope: 1 });
VendorPaymentEntrySchema.index({ vendorId: 1, vendorType: 1, lotId: 1 });
VendorPaymentEntrySchema.index({ vendorId: 1, vendorType: 1, createdAt: 1 });

// VendorPaymentEntryHistory Schema: Tracks all changes to payment entries
const VendorPaymentEntryHistorySchema = new mongoose.Schema({
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorPaymentEntry', required: true }, // Reference to the original entry (or null if deleted)
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  vendorType: { type: String, enum: ['stitching', 'washing', 'finishing'], required: true },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  paymentType: { type: String, enum: ['payment', 'short_adjustment'], required: true },
  
  // Current/Before state
  beforeData: {
    amount: Number,
    paymentDate: Date,
    paymentScope: String,
    lotId: mongoose.Schema.Types.ObjectId,
    shortQuantity: Number,
    shortRate: Number,
    notes: String
  },
  
  // After state (for updates)
  afterData: {
    amount: Number,
    paymentDate: Date,
    paymentScope: String,
    lotId: mongoose.Schema.Types.ObjectId,
    shortQuantity: Number,
    shortRate: Number,
    notes: String
  },
  
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
VendorPaymentEntryHistorySchema.index({ vendorId: 1, vendorType: 1 });
VendorPaymentEntryHistorySchema.index({ entryId: 1 });
VendorPaymentEntryHistorySchema.index({ createdAt: -1 });

// VendorBalance Schema: Aggregated balance tracking (denormalized from payment entries)
const VendorBalanceSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true },
  vendorType: { type: String, enum: ['stitching', 'washing', 'finishing'], required: true },
  totalDue: { type: Number, default: 0 }, // Total amount from all lots
  totalPaid: { type: Number, default: 0 }, // Total payments made
  remainingBalance: { type: Number, default: 0 }, // totalDue - totalPaid
  lastUpdated: { type: Date, default: Date.now }
});
VendorBalanceSchema.index({ vendorId: 1, vendorType: 1 });

// ─── SALES / DISPATCH / BILLING ──────────────────────────────────────────────

// CompanySettings: singleton holding the seller-side details printed on every invoice
// (issuer name, GSTIN, MSME, bank, signatory). Only one document should exist; the
// controller uses findOne + upsert. Update via the admin-only /api/company-settings route.
const CompanySettingsSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  addressLines: [{ type: String, trim: true }], // multi-line address; rendered as-is on PDF
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  msmeType: { type: String, trim: true },     // e.g. 'Micro'
  msmeNumber: { type: String, trim: true },   // e.g. 'MH 18 0153950'
  email: { type: String, trim: true },
  phone: { type: String, trim: true },
  gstStateCode: { type: String, trim: true }, // e.g. '27'
  gstStateName: { type: String, trim: true }, // e.g. 'Maharashtra'
  bank: {
    bankName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifsc: { type: String, trim: true, uppercase: true },
    accountName: { type: String, trim: true }
  },
  authorisedSignatory: {
    name: { type: String, trim: true },
    title: { type: String, trim: true } // e.g. 'Proprietor'
  },
  defaultInvoicePrefix: { type: String, trim: true, default: 'INV' },
  defaultDocumentType: { type: String, enum: ['BILL_OF_SUPPLY', 'TAX_INVOICE'], default: 'BILL_OF_SUPPLY' },
  // Notification preferences. lowStock drives the daily low-stock email digest (Vercel Cron).
  notifications: {
    lowStock: {
      enabled: { type: Boolean, default: false },     // master on/off for the digest
      emails: { type: [String], default: [] },        // recipient addresses (need not be app users)
      sendHour: { type: Number, default: 9 }          // intended local send hour; actual fire time is fixed in vercel.json (UTC)
    }
  },
  updatedAt: { type: Date, default: Date.now }
});

// One source-lot slice of a MERGED invoice line. A merged line draws its pcs from
// several lots (two system lots that are physically one combined batch) but prints as a
// single row. Each source records how many pcs came from a given lot, so per-lot dispatch
// accounting stays exact even though the line shows one combined total + one description.
const InvoiceLineSourceSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  lotNumberSnapshot: { type: String, trim: true },     // frozen lot # (audit only; not printed)
  lotInvoiceNumberSnapshot: { type: Number },          // frozen upstream invoice #
  pcs: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'pcs must be integer' } }
}, { _id: false });

// InvoiceLine subdoc: one row of an invoice. Each line ships pcs from one of our Lots
// (or null for legacy/manual entries). lotNumberSnapshot + lotInvoiceNumberSnapshot
// are frozen at issue time so renaming a Lot later doesn't mutate historical invoices.
// A line is either SINGLE-LOT (top-level lotId + pcs, sources empty) or MERGED
// (lotId null, pcs = displayed total, sources[] carries the per-lot split summing to pcs).
const InvoiceLineSchema = new mongoose.Schema({
  lineNo: { type: Number, required: true, min: 1 },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot' }, // null allowed for legacy + merged lines
  lotNumberSnapshot: { type: String, trim: true },     // frozen lot # for printing
  lotInvoiceNumberSnapshot: { type: Number },          // frozen upstream invoice #
  // Per-lot breakdown for a MERGED line (empty for single-lot/legacy lines). pcs across
  // sources sums to the line's pcs; each source's pcs is what subtracts from that lot.
  sources: { type: [InvoiceLineSourceSchema], default: [] },
  description: { type: String, required: true, trim: true }, // free-form; prefilled from lot
  remark: { type: String, trim: true }, // optional secondary line printed under description in PDF
  hsnSac: { type: String, trim: true },
  pcs: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'pcs must be integer' } },
  unit: { type: String, trim: true, default: '' },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }, // pcs * rate, recomputed server-side
  // true = this line draws from the lot's DAMAGED pool (combined-damaged third-party sale)
  // instead of the good/client-dispatchable pool. Default false ⇒ legacy lines stay "good".
  isDamaged: { type: Boolean, default: false }
}, { _id: true });

// Invoice: parent doc = dispatch event = printable bill. Client + addresses are
// SNAPSHOTTED at issue time so editing the Client master never mutates a past invoice.
// invoiceNumber is human-facing "INV{FY}/{seq}" generated atomically via Counter.
const InvoiceSchema = new mongoose.Schema({
  invoiceId: { type: String, unique: true },                  // internal: INV-YYYYMMDD###
  invoiceNumber: { type: String, required: true, unique: true }, // human: INV2627/27
  documentType: { type: String, enum: ['BILL_OF_SUPPLY', 'TAX_INVOICE'], default: 'BILL_OF_SUPPLY' },
  date: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  billingFirmId: { type: mongoose.Schema.Types.ObjectId }, // chosen Client.billingFirms subdoc id; null = client default
  clientSnapshot: {
    name: String,         // internal client display name (e.g. "ADAM HILL") — for searches/listings
    billingName: String,  // firm name printed on PDF Bill To / Ship To (e.g. "BRANDKO MART LLP")
    clientCode: String,
    gstin: String,
    pan: String,
    phone: String,
    email: String
  },
  billTo: { type: AddressSchema, default: () => ({}) },
  shipTo: { type: AddressSchema, default: () => ({}) },
  placeOfSupply: {
    stateCode: { type: String, trim: true },
    stateName: { type: String, trim: true }
  },
  lines: { type: [InvoiceLineSchema], default: [] },
  subTotal: { type: Number, default: 0, min: 0 },
  roundOff: { type: Number, default: 0 },
  total: { type: Number, default: 0, min: 0 },
  totalQty: { type: Number, default: 0, min: 0 },
  amountInWords: { type: String, trim: true },
  status: { type: String, enum: ['draft', 'issued', 'cancelled'], default: 'issued' },
  pdfMeta: { filename: String, generatedAt: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});
InvoiceSchema.index({ clientId: 1, date: -1 });
InvoiceSchema.index({ date: 1 });
InvoiceSchema.index({ status: 1, date: -1 });
InvoiceSchema.index({ 'lines.lotId': 1 }); // "which invoices reference this lot"
InvoiceSchema.index({ 'lines.sources.lotId': 1 }); // same, for merged-line source lots

// InvoiceHistory: audit log mirror of VendorPaymentEntryHistory
const InvoiceHistorySchema = new mongoose.Schema({
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
  action: { type: String, enum: ['create', 'update', 'cancel', 'delete'], required: true },
  beforeData: { type: mongoose.Schema.Types.Mixed },
  afterData: { type: mongoose.Schema.Types.Mixed },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
InvoiceHistorySchema.index({ invoiceId: 1, createdAt: -1 });

// ClientPaymentEntry: ledger of payments + adjustments (mirror of VendorPaymentEntry).
// paymentScope='invoice' applies to one invoice; 'client' is a lump sum against the client balance.
const ClientPaymentEntrySchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  paymentScope: { type: String, enum: ['client', 'invoice'], default: 'client' },
  invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // required iff scope='invoice'
  paymentType: { type: String, enum: ['payment', 'adjustment'], required: true },
  amount: { type: Number, required: true },
  paymentDate: { type: Date, required: true },
  paymentMode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque', 'other'], default: 'cash' },
  referenceNumber: { type: String, trim: true }, // cheque #, UTR, transaction id
  notes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date }
});
ClientPaymentEntrySchema.index({ clientId: 1, paymentDate: -1 });
ClientPaymentEntrySchema.index({ clientId: 1, invoiceId: 1 });
ClientPaymentEntrySchema.index({ clientId: 1, createdAt: -1 });

// ClientPaymentEntryHistory: audit log of create/update/delete
const ClientPaymentEntryHistorySchema = new mongoose.Schema({
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClientPaymentEntry', required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  paymentType: { type: String, enum: ['payment', 'adjustment'], required: true },
  beforeData: {
    amount: Number,
    paymentDate: Date,
    paymentScope: String,
    invoiceId: mongoose.Schema.Types.ObjectId,
    paymentMode: String,
    referenceNumber: String,
    notes: String
  },
  afterData: {
    amount: Number,
    paymentDate: Date,
    paymentScope: String,
    invoiceId: mongoose.Schema.Types.ObjectId,
    paymentMode: String,
    referenceNumber: String,
    notes: String
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
ClientPaymentEntryHistorySchema.index({ clientId: 1, createdAt: -1 });
ClientPaymentEntryHistorySchema.index({ entryId: 1 });

// ClientBalance: denormalized aggregate (mirror of VendorBalance).
// Recomputed by clientBalanceService.updateClientBalance after every invoice/payment write.
// openingBalance lets us seed legacy balances from the spreadsheets without backfilling history.
const ClientBalanceSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, unique: true },
  openingBalance: { type: Number, default: 0 },
  totalInvoiced: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  totalAdjustment: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: 0 }, // opening + invoiced - paid - adjustment
  lastUpdated: { type: Date, default: Date.now }
});
ClientBalanceSchema.index({ clientId: 1 }, { unique: true });

// ─── STOCK MANAGEMENT / ACCESSORIES ──────────────────────────────────────────
// Accessories are consumable inputs (zippers, buttons, label-tags, pocketing,
// polybags). Two independent denormalized aggregates are both fed by purchases:
//   • STOCK (per item)  = Σ purchase-line qty − Σ consumption qty
//   • MONEY (per type)  = Σ purchase amounts  − Σ payments
// Zipper consumption is recorded at the Stitching stage; the rest at Finishing.

// AccessoryType: the article-type lookup (Zipper/Button/Label-Tag/Pocketing/Polybag).
// Seeded by accessoryService.seedAccessoryTypes; `key` is the stable behaviour slug.
const AccessoryTypeSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, lowercase: true, trim: true }, // 'zipper', 'label-tag'
  name: { type: String, required: true, trim: true },
  unit: { type: String, trim: true, default: 'pcs' },           // pcs | mtr
  consumptionStage: { type: String, enum: ['stitching', 'finishing'], default: 'finishing' },
  sortOrder: { type: Number, default: 0 },
  monitorLowStock: { type: Boolean, default: true },        // per-type kill-switch for low-stock alerts (e.g. turn off Pocketing)
  reorderLevel: { type: Number, default: 0, min: 0 },       // default threshold for items of this type when the item has none
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

// AccessoryItem: the master/lookup per type (e.g. "AD BLUE 5.5 INCH").
// clientId null = general/common-for-all; set = custom-made for that client.
// subType ('label'|'tag') supports the Label-Tag paired stream at finishing (Phase 2).
const AccessoryItemSchema = new mongoose.Schema({
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  name: { type: String, required: true, trim: true },
  rate: { type: Number, default: 0, min: 0 },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  subType: { type: String, enum: ['label', 'tag', 'button', 'rivet', null], default: null }, // paired streams (label/tag, button/rivet)
  openingStock: { type: Number, default: 0, min: 0 }, // go-live on-hand qty; counts toward available
  monitorLowStock: { type: Boolean, default: false },       // opt-in: only flagged items are checked for low-stock alerts
  reorderLevel: { type: Number, default: 0, min: 0 },       // alert when availableQty <= this (0 = fall back to the type's reorderLevel)
  description: { type: String, trim: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
AccessoryItemSchema.index({ accessoryTypeId: 1, isActive: 1 });
AccessoryItemSchema.index({ accessoryTypeId: 1, clientId: 1 });
AccessoryItemSchema.index({ accessoryTypeId: 1, name: 1 }, { unique: true });

// AccessoryPurchase: one supplier invoice = N line items (a single INV can carry
// both a label and a tag line). Header has the type-account + optional supplier.
const AccessoryPurchaseSchema = new mongoose.Schema({
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  date: { type: Date, required: true },
  vendorInvoiceNumber: { type: String, trim: true }, // supplier's invoice no (free text — can be alphanumeric)
  supplier: { type: String, trim: true },            // optional supplier name
  lines: [{
    accessoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryItem', required: true },
    nameSnapshot: { type: String, trim: true },      // frozen item name for history
    qty: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 } // qty * rate, recomputed server-side
  }],
  totalQty: { type: Number, default: 0, min: 0 },
  totalAmount: { type: Number, default: 0, min: 0 },
  notes: { type: String, trim: true },
  isPaid: { type: Boolean, default: false }, // per-purchase settled marker (row disabled in UI)
  paidAt: { type: Date },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date }
});
AccessoryPurchaseSchema.index({ accessoryTypeId: 1, date: -1 });
AccessoryPurchaseSchema.index({ 'lines.accessoryItemId': 1 });

// AccessoryPayment: payments/adjustments against an article-type account
// (mirror of VendorPaymentEntry — the "account" here is the AccessoryType).
const AccessoryPaymentSchema = new mongoose.Schema({
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  paymentType: { type: String, enum: ['payment', 'adjustment'], required: true },
  amount: { type: Number, required: true },
  paymentDate: { type: Date, required: true },
  paymentMode: { type: String, enum: ['cash', 'bank', 'upi', 'cheque', 'other'], default: 'cash' },
  referenceNumber: { type: String, trim: true },
  notes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date }
});
AccessoryPaymentSchema.index({ accessoryTypeId: 1, paymentDate: -1 });
AccessoryPaymentSchema.index({ accessoryTypeId: 1, createdAt: -1 });

// AccessoryPaymentHistory: audit log of payment create/update/delete (mirror pattern)
const AccessoryPaymentHistorySchema = new mongoose.Schema({
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryPayment', required: true },
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  paymentType: { type: String, enum: ['payment', 'adjustment'], required: true },
  beforeData: {
    amount: Number, paymentDate: Date, paymentMode: String, referenceNumber: String, notes: String
  },
  afterData: {
    amount: Number, paymentDate: Date, paymentMode: String, referenceNumber: String, notes: String
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});
AccessoryPaymentHistorySchema.index({ accessoryTypeId: 1, createdAt: -1 });
AccessoryPaymentHistorySchema.index({ entryId: 1 });

// AccessoryBalance: denormalized per-type money aggregate (mirror of VendorBalance).
// remainingBalance = openingBalance + totalPurchased − totalPaid − totalAdjustment.
// Recomputed by accessoryService.updateAccessoryBalance after any purchase/payment write.
const AccessoryBalanceSchema = new mongoose.Schema({
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true, unique: true },
  openingBalance: { type: Number, default: 0 },
  totalPurchased: { type: Number, default: 0 },
  totalPaid: { type: Number, default: 0 },
  totalAdjustment: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});
AccessoryBalanceSchema.index({ accessoryTypeId: 1 }, { unique: true });

// AccessoryConsumption: per-item stock-out ledger written transactionally at the
// production stage. Source of truth for consumed qty; keyed by (lotId, stage) so it
// can be reversed/replaced when its Stitching/Finishing record is edited.
const AccessoryConsumptionSchema = new mongoose.Schema({
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  accessoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryItem', required: true },
  nameSnapshot: { type: String, trim: true },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true },
  stage: { type: String, enum: ['stitching', 'finishing'], required: true },
  qty: { type: Number, required: true, min: 0 },
  clientLinked: { type: Boolean, default: false }, // true if drawn from a client-mapped item
  date: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
AccessoryConsumptionSchema.index({ accessoryItemId: 1 });
AccessoryConsumptionSchema.index({ lotId: 1, stage: 1 });
AccessoryConsumptionSchema.index({ accessoryTypeId: 1 });

// AccessoryVendorReturn: accessories a FINISHING vendor physically hands back from the extra
// buffer sent with lots. A return does two things: (1) draws down the vendor's "extra held"
// balance on the Finishing Vendor Extras dashboard, and (2) puts the accessories back into
// available stock — getAccessoryStock/getStockSummary add Σreturns back (available = opening
// + purchased − consumed + returned), mirroring how sending them out reduced stock.
const AccessoryVendorReturnSchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinishingVendor', required: true },
  accessoryTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryType', required: true },
  accessoryItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'AccessoryItem', required: true },
  nameSnapshot: { type: String, trim: true },
  qty: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  notes: { type: String },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
AccessoryVendorReturnSchema.index({ vendorId: 1, accessoryItemId: 1 });
AccessoryVendorReturnSchema.index({ accessoryItemId: 1 });

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
  entity: { type: String, enum: ['User', 'Client', 'FitStyle', 'Order', 'Stitching', 'Washing', 'Finishing', 'VendorBalance', 'Invoice', 'Balance', 'Report', 'ClientBalance', 'ClientPayment', 'CompanySettings', 'AccessoryType', 'AccessoryItem', 'AccessoryPurchase', 'AccessoryPayment', 'AccessoryReturn'], required: true },
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
  VendorPaymentEntry: mongoose.model('VendorPaymentEntry', VendorPaymentEntrySchema),
  VendorPaymentEntryHistory: mongoose.model('VendorPaymentEntryHistory', VendorPaymentEntryHistorySchema),
  VendorBalance: mongoose.model('VendorBalance', VendorBalanceSchema),
  CompanySettings: mongoose.model('CompanySettings', CompanySettingsSchema),
  Invoice: mongoose.model('Invoice', InvoiceSchema),
  InvoiceHistory: mongoose.model('InvoiceHistory', InvoiceHistorySchema),
  ClientPaymentEntry: mongoose.model('ClientPaymentEntry', ClientPaymentEntrySchema),
  ClientPaymentEntryHistory: mongoose.model('ClientPaymentEntryHistory', ClientPaymentEntryHistorySchema),
  ClientBalance: mongoose.model('ClientBalance', ClientBalanceSchema),
  AccessoryType: mongoose.model('AccessoryType', AccessoryTypeSchema),
  AccessoryItem: mongoose.model('AccessoryItem', AccessoryItemSchema),
  AccessoryPurchase: mongoose.model('AccessoryPurchase', AccessoryPurchaseSchema),
  AccessoryPayment: mongoose.model('AccessoryPayment', AccessoryPaymentSchema),
  AccessoryPaymentHistory: mongoose.model('AccessoryPaymentHistory', AccessoryPaymentHistorySchema),
  AccessoryBalance: mongoose.model('AccessoryBalance', AccessoryBalanceSchema),
  AccessoryConsumption: mongoose.model('AccessoryConsumption', AccessoryConsumptionSchema),
  AccessoryVendorReturn: mongoose.model('AccessoryVendorReturn', AccessoryVendorReturnSchema),
  Balance: mongoose.model('Balance', BalanceSchema),
  Report: mongoose.model('Report', ReportSchema),
  AuditLog: mongoose.model('AuditLog', AuditLogSchema)
};
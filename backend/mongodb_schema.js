const mongoose = require('mongoose');

// Counter Schema: For generating sequential IDs
const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // e.g., 'orderId'
  sequence: { type: Number, default: 0 }
});

// Refresh token subdoc — one entry per active session/device.
//
// The cookie value is `<tokenId>.<secret>`:
//   tokenId — public, non-secret handle. Indexed, so validating a cookie is ONE
//             document lookup + ONE bcrypt compare, regardless of how many users
//             or sessions exist.
//   secret  — the actual credential. Only bcrypt(secret) is stored, so a DB leak
//             still can't be used to mint sessions.
//
// familyId groups rotations from the same login. A tokenId that resolves but whose
// secret does NOT match is a theft signal — see authController.refresh.
//
// ⚠ DO NOT REMOVE tokenId. authController writes and queries it. Mongoose runs in
// strict mode, so if this field is absent the value is silently DISCARDED on save,
// the $elemMatch lookup in refresh() never matches, every refresh 401s, and every
// user is force-logged-out one access-token lifetime (15m) after login. This is
// exactly what happened between feb4803 and this commit.
const RefreshTokenSchema = new mongoose.Schema({
  tokenId: { type: String, index: true },
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
  // HOUSE LABEL. true = not a real external customer but an in-house brand (e.g. GREYSAGE).
  // Lots are still created against it so production/vendor/dashboard attribution keeps working
  // unchanged, but on the sales side an internal client:
  //   • has its lots offered in EVERY client's dispatch picker (getLotsAvailableForDispatch)
  //   • can never be the bill-to party on an Invoice (rejected in createInvoice)
  //   • is excluded by default from receivables screens — it is never owed money
  isInternal: { type: Boolean, default: false },
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

  // ─── Manual dispatch (legacy lots) ─────────────────────────────────────────
  // Lots physically dispatched before this system went live, or otherwise billed
  // outside it, will never get a sales Invoice — so invoicedPcs stays 0 and they sit
  // on the Pending Dispatch board forever. These two caches are the manual-entry
  // counterparts of invoicedPcs / damagedSoldPcs, summed from the ManualDispatch
  // collection by invoiceService.recalcLotManualDispatch and folded into the same
  // remaining/status maths.
  //
  // They are PCS ONLY. Manual dispatch never creates an Invoice and never touches
  // ClientBalance — money for these lots was billed outside the system and is carried
  // by ClientBalance.openingBalance.
  manualDispatchedPcs: { type: Number, default: 0, min: 0 },
  manualDamagedSoldPcs: { type: Number, default: 0, min: 0 },

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
  // How many pcs the entered finishing accessories cover. Defaults to `quantity` when null (normal,
  // fully-accessorized lots). Set lower when accessories cover only part of the lot — e.g. a lot
  // partly finished before accessory tracking began, or a partial after-tracking finish. Drives the
  // Finishing Vendor Extras "needed = basis × ratio" so it isn't overstated vs the full lot qty.
  accessoryBasisPcs: { type: Number, min: 0 },
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
  // Frozen owner of the source lot ("produced for"). Differs from Invoice.clientId on a
  // cross-client sale. See the note on InvoiceLineSchema.lotClientIdSnapshot.
  lotClientIdSnapshot: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
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
  // Frozen owner of the source lot at issue time — the client the goods were PRODUCED FOR,
  // which is not always the client being BILLED. A line is a cross-client sale iff
  //   lotClientIdSnapshot != Invoice.clientId
  // so no separate boolean is stored; the flag is always derivable and can never drift.
  // Set server-side in buildAndValidateLines from Lot.clientId — never accepted from the
  // request. Frozen like the other lot snapshots: reassigning a Lot later must not rewrite
  // history. Null on sample/legacy lines and on merged lines (each source carries its own).
  lotClientIdSnapshot: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  // Per-lot breakdown for a MERGED line (empty for single-lot/legacy lines). pcs across
  // sources sums to the line's pcs; each source's pcs is what subtracts from that lot.
  sources: { type: [InvoiceLineSourceSchema], default: [] },
  description: { type: String, required: true, trim: true }, // free-form; prefilled from lot
  remark: { type: String, trim: true }, // optional secondary line printed under description in PDF
  // NEVER PRINTED. Internal justification/context for the line — invoicePdfService renders
  // only `description` and `remark`, and this must stay that way: its main use is recording
  // WHY another client's lot was billed here, which the buyer must not see.
  internalNote: { type: String, trim: true },
  hsnSac: { type: String, trim: true },
  pcs: { type: Number, required: true, min: 1, validate: { validator: Number.isInteger, message: 'pcs must be integer' } },
  unit: { type: String, trim: true, default: '' },
  rate: { type: Number, required: true, min: 0 },
  amount: { type: Number, required: true, min: 0 }, // pcs * rate, recomputed server-side
  // true = this line draws from the lot's DAMAGED pool (combined-damaged third-party sale)
  // instead of the good/client-dispatchable pool. Default false ⇒ legacy lines stay "good".
  isDamaged: { type: Boolean, default: false },
  isSample: { type: Boolean, default: false }
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
// "which invoices sold goods produced for client X" — drives the cross-client sales report,
// where the answer is the set of lines whose lotClientIdSnapshot != the invoice's clientId.
InvoiceSchema.index({ 'lines.lotClientIdSnapshot': 1 });
InvoiceSchema.index({ 'lines.sources.lotClientIdSnapshot': 1 });

// InvoiceHistory: audit log mirror of VendorPaymentEntryHistory
// ─── Manual Dispatch ─────────────────────────────────────────────────────────
// A dispatch that happened outside the invoicing flow. One document = one physical
// dispatch event against one lot. Source of truth for Lot.manualDispatchedPcs and
// Lot.manualDamagedSoldPcs, exactly as Invoice.lines is for invoicedPcs.
//
// Deliberately carries NO money fields. These lots were billed outside the system;
// their outstanding sits in ClientBalance.openingBalance. Recording one here must
// never call clientBalanceService.
const ManualDispatchSchema = new mongoose.Schema({
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot', required: true, index: true },
  // Good pcs dispatched to the lot's own client.
  goodPcs: { type: Number, default: 0, min: 0 },
  // Damaged pcs sold on (third-party combined sale), mirroring an isDamaged invoice line.
  damagedPcs: { type: Number, default: 0, min: 0 },
  dispatchDate: { type: Date, required: true },
  // Free text: old challan number, manual bill number, courier docket, etc.
  reference: { type: String, trim: true },
  notes: { type: String, trim: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
ManualDispatchSchema.index({ lotId: 1, dispatchDate: -1 });

// Audit trail, mirroring InvoiceHistory / VendorPaymentEntryHistory.
const ManualDispatchHistorySchema = new mongoose.Schema({
  entryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ManualDispatch' },
  lotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lot' },
  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  beforeData: { type: mongoose.Schema.Types.Mixed },
  afterData: { type: mongoose.Schema.Types.Mixed },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
ManualDispatchHistorySchema.index({ lotId: 1, createdAt: -1 });
ManualDispatchHistorySchema.index({ entryId: 1 });

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
  // How many pcs this specific line covers (its client's share of the lot). Drives the Finishing
  // Vendor Extras "needed = basisPcs × ratio". Null ⇒ fall back to Finishing.accessoryBasisPcs, then
  // the finishing quantity. Lets a lot split across clients (e.g. AD 135 / BW 535) size each item's
  // need to its client's pieces instead of the whole lot.
  basisPcs: { type: Number, min: 0 },
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
  // ⚠ Keep this in sync with every logAction(...) call site — a value missing here makes the
  // audit write throw, and before logger.js failed open that error FAILED the business
  // operation it was auditing ('ManualDispatch' and 'Lot' were both missing and live).
  entity: { type: String, enum: ['User', 'Client', 'FitStyle', 'Order', 'Lot', 'Stitching', 'Washing', 'Finishing', 'VendorBalance', 'Invoice', 'ManualDispatch', 'Balance', 'Report', 'ClientBalance', 'ClientPayment', 'CompanySettings', 'AccessoryType', 'AccessoryItem', 'AccessoryPurchase', 'AccessoryPayment', 'AccessoryReturn'], required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  details: { type: String },
  createdAt: { type: Date, default: Date.now }
});

// MakingsDiff Schema: cached result of the MAKINGS-excel ↔ MongoDB reconciliation.
// A single latest-wins doc (key: 'latest') refreshed by the cron/precompute job and
// read by the notification bell — the ~15s workbook parse is far too slow to run on
// the user request, so we store the computed diff and serve that instantly.
const MakingsDiffSchema = new mongoose.Schema({
  key: { type: String, default: 'latest', unique: true }, // singleton
  count: { type: Number, default: 0 },
  discrepancies: { type: Array, default: [] },
  // Internal excel snapshot (aggregated maker rows) kept for cheap per-lot re-diffs
  // after a record is created. Never sent to the UI (projected out on read).
  excelRows: { type: Array, default: [] },
  scannedRows: { type: Number, default: 0 },
  sheets: { type: [String], default: [] },
  status: { type: String, enum: ['ok', 'error'], default: 'ok' },
  error: { type: String },       // populated when status === 'error'
  computedMs: { type: Number },  // how long the last recon took
  generatedAt: { type: Date, default: Date.now },
});

// MakingsDiscard Schema: rows the user has marked "don't show me this again".
// The workbook carries old lots we are never going to enter into the app; without this
// every recon re-surfaces them in the bell forever. A discard is a DISPLAY-LAYER
// suppression only — the recon still computes the discrepancy (so excelRows stays whole
// and a restore is instant), we just filter it out when serving the bell.
// `fingerprint` pins the discard to the values it was made against: if the excel or the
// app values later change, the row RESURFACES instead of silently staying hidden — so a
// discard can never bury a genuinely new disagreement on the same lot.
const MakingsDiscardSchema = new mongoose.Schema({
  lotKey: { type: String, required: true, unique: true }, // `${lotNumber}|${toInt(bill)}`
  lotNumber: { type: String, required: true },
  bill: { type: String, default: '' },
  client: { type: String, default: '' },
  maker: { type: String, default: '' },
  // sha1 of the discrepancy's fields at discard time. null ⇒ hide unconditionally
  // (used when the row isn't in the current stored diff yet).
  fingerprint: { type: String, default: null },
  // The discrepancy as it looked when discarded, so the "Discarded" view can render
  // it without re-running the recon.
  snapshot: { type: Object, default: {} },
  reason: { type: String, default: '' },
  discardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  discardedAt: { type: Date, default: Date.now },
});

module.exports = {
  Counter: mongoose.model('Counter', CounterSchema),
  MakingsDiff: mongoose.model('MakingsDiff', MakingsDiffSchema),
  MakingsDiscard: mongoose.model('MakingsDiscard', MakingsDiscardSchema),
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
  ManualDispatch: mongoose.model('ManualDispatch', ManualDispatchSchema),
  ManualDispatchHistory: mongoose.model('ManualDispatchHistory', ManualDispatchHistorySchema),
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
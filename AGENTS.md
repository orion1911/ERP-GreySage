# GreySage ERP — Agent Context

Single-file context for any AI coding assistant (Claude, GPT, Gemini, Cursor, Codex, etc.) working on this repo. Read this first before exploring source.

**Repo root:** `D:\Work\SalesAndAccounting`
**Last context refresh:** 2026-06-05 (Stock Management / Accessories module added — masters, purchase+payment ledger, stock stats, zipper@stitching + finishing consumption; plus vendor default rates, per-lot/per-purchase Paid markers, 12h token-refresh session, net-of-shortage stage pre-fill. Previous: Sales/Dispatch/Billing 2026-05-23 — see section 7.) (verify with `git log` and `git status` before trusting time-sensitive details)

---

## 1. What this project is

GreySage is an ERP for a garment manufacturer. Bulk client orders are split into **Lots** (batches), each tracked through three production stages — **Stitching → Washing → Finishing** — performed by vendors at per-piece rates. The system has three pillars:

1. **Production** — lots flowing through the three stages.
2. **Vendor accounting** — per-vendor ledger of what's owed for stitching/washing/finishing work and what's been paid.
3. **Sales / Dispatch / Billing** — invoices to clients for finished pcs from one or more lots, with a per-client payment ledger and PDF invoice generation. (Added 2026-05-23; replaces the old skeletal Invoice module.)

The business spec lives in `backend/BRD.MD`. Key idea: a **LotNumber** like `A/1/5` means series `A`, batches 1 through 5. A series caps at 100 batches before rolling over (`A` → `B` → `C`...). A single batch can be written as `A/46`.

**Important architectural note:** the original "Order" collection was removed as an entry point (commit `836271d`). **Lot is now the root aggregate** and is created at the start of the Stitching flow. The `Order` schema, route, and controller files still exist in the codebase but `orderRoutes` is **commented out** in `server.js`. A one-time migration script `backend/migrations/migrate-orders-to-lots.js` was used for the cutover.

**Sales side:** one Invoice document = one dispatch event = the printable Bill of Supply / Tax Invoice. Each invoice has N line items, each line referencing one Lot (or null for legacy). A lot can be dispatched in parts across multiple invoices; the remaining pcs come from the production aggregate minus what's been invoiced. Issuer (ALLYZ JEANS — name, GSTIN, MSME, bank, signatory) lives in a `CompanySettings` singleton printed on every invoice. PDF generated client-side with jsPDF.

---

## 2. Tech stack

**Backend** (`backend/`)
- Node.js + Express 4, Mongoose 7
- `express-async-errors` (async throws propagate to global handler)
- Auth: `bcryptjs` + `jsonwebtoken`
- Excel export: `xlsx` (server-side, recently moved from client)
- Email: `@sendgrid/mail`
- Validation: `express-validator`
- Deployed as a **Vercel serverless function** (`server.js` exports `module.exports = app`; `app.listen` only runs when `NODE_ENV !== 'production'`)

**Frontend** (`frontend/`)
- Create React App (`react-scripts 5`), React 18, React Router 6
- **MUI v7** (`@mui/material`, `@mui/icons-material`) + **MUI X v8** (`x-data-grid`, `x-charts`, `x-date-pickers`, `x-date-pickers-pro`)
- MUI X is a paid license — `App.js` calls `LicenseInfo.setLicenseKey(process.env.REACT_APP_MUI_LICENSE_KEY)`
- Forms: `react-hook-form`. Dates: `dayjs`. Tables: also `@tanstack/react-table`. Animation: `motion`.
- PDF generation: `jspdf` + `jspdf-autotable` (client-side, used in `features/Sales/invoicePdfService.js` to render Bill of Supply / Tax Invoice). Default Helvetica font has no ₹ glyph — service uses `Rs.` prefix instead.
- No Redux/Zustand — component-local state, `localStorage` for auth, snackbar lifted into layout and passed via `useOutletContext`.

**Database**
- MongoDB 7.0 with **replica set `rs0`** (required because `stitchingController.createStitching` uses a multi-document transaction)
- Production: Mongo Atlas M0 (tight connection limits — see operational note below)
- Local dev: `docker-compose.yml` brings up Mongo (auto replSet init via entrypoint), backend on port 5000, frontend on 8080→3000

**Operational constraint to respect:** Mongo pool is capped at `maxPoolSize: 3` and `autoIndex: false` in `server.js`. The Mongoose connection is cached on `global._mongoConnection` to survive warm serverless invocations. **Do not "fix" these to standard best-practice values** — they were tuned this way after Atlas M0 was hitting connection limits (commit `5c7c939`).

---

## 3. Repository layout

```
D:\Work\SalesAndAccounting\
├── backend/                  # API (active)
│   ├── server.js             # Entry: CORS, Mongo connect middleware, route mounting
│   ├── mongodb_schema.js     # ALL Mongoose models in one file
│   ├── routes/               # One file per resource
│   ├── controllers/          # One file per resource
│   ├── services/
│   │   ├── vendorBalanceService.js  # Denormalization + lots-by-vendor aggregation
│   │   ├── invoiceService.js        # Final/remaining pcs, FY counter, amount-in-words
│   │   └── clientBalanceService.js  # Mirror of vendorBalanceService for the client side
│   ├── middleware/
│   │   ├── auth.js           # authenticateToken (JWT)
│   │   ├── error.js          # Global handler, translates Mongo unique-violation
│   │   └── requestValidator.js
│   ├── migrations/
│   │   └── migrate-orders-to-lots.js  # One-time historical migration
│   ├── utils/logger.js       # logAction writes to AuditLog
│   ├── BRD.MD                # Business requirements (READ THIS for domain)
│   ├── server-side-excel-export-summary.md  # UTF-16 encoded; content describes xlsx refactor
│   └── vercel.json
│
├── frontend/                 # Active React app
│   └── src/
│       ├── App.js            # All routes + layouts (Authenticated, Admin)
│       ├── components/
│       │   ├── Navbar/       # Sidebar.js, Appbar.js (responsive, collapsible)
│       │   ├── Theme/AppTheme.js  # Theme variants + dark mode persistence
│       │   ├── SnackBar.js, ErrorBoundary.js, NotFound.js
│       │   ├── Validators.js, MuiCustom.js, OrderStatusChip.js, Skeleton/
│       ├── features/         # Domain-grouped feature folders
│       │   ├── Admin/        # Dashboard (~851), DashboardExcel, Reports, AuditLogs, UserMgmt, CompanySettings, StatCard
│       │   ├── Catalogs/     # 6 lookups; each has {Name}Catalog.js + {Name}CatalogAdd.js + {Name}CatalogSx.js
│       │   ├── Stitching/    # StitchingManagement, LotsManagement, StitchingGrid, AddStitchingModal
│       │   ├── Washing/      # Grid + AddModal + Sx
│       │   ├── Finishing/    # Grid + AddModal + Sx
│       │   ├── VendorPayments/   # VendorPaymentManagement.js (~1381 lines)
│       │   ├── Sales/        # InvoiceManagement + InvoiceFormModal + invoicePdfService (jsPDF)
│       │   ├── ClientPayments/   # ClientPaymentManagement — mirror of VendorPayments for clients
│       │   ├── Orders/       # EXISTS BUT DORMANT — route not mounted in App.js
│       │   └── Login/        # Login, Register, ForgotPassword
│       └── services/
│           ├── axiosInstance.js   # Base axios + JWT interceptor
│           ├── apiService.js      # All API calls grouped by domain
│           └── authService.js
│
├── docker-compose.yml        # Local dev: Mongo replSet + backend + frontend
├── init-mongo.js, keyfile.txt
├── .env, .env.development    # Gitignored — do NOT commit or echo
├── README.md
│
├── frontendv2/               # GITIGNORED — stalled rewrite, not active
├── bkp/, frontend/bkp/       # GITIGNORED — backups
├── docs/                     # GITIGNORED — local-only docs
├── mongo_init/               # GITIGNORED (added in current uncommitted .gitignore edit)
├── *.zip                     # GITIGNORED snapshots (backend.zip, frontend.zip, src.zip)
└── ext/process.py            # Small Python utility (standalone)
```

---

## 4. Domain model (the schema)

All Mongoose models live in **one file**: `backend/mongodb_schema.js`. Summary:

**Lookups** (each has `isActive` flag for soft-disable):
- `Client` — has unique `clientCode`, unique-index on `name`. **Extended for Sales:** `gstin`, `pan`, `billingAddress` + `shippingAddress` (`AddressSchema` subdoc: line1/line2/city/state/stateCode/pincode/country). The legacy `address` free-text field is kept for back-compat.
- `FitStyle` — replaces an older `Product` collection; unique on `name`
- `FabricVendor`, `StitchingVendor`, `WashingVendor`, `FinishingVendor` — separate collections per vendor type. The three **production** vendors also carry a `defaultRate` (Number) — selecting the vendor in the stage modal pre-fills the rate field (still editable; washing fills every wash-detail row). `updateVendor` whitelists fields, so new vendor fields must be added there too.

**Lot** (root aggregate, replaces Order):
- `lotId` — generated `LT-YYYYMMDD###` via `Counter` collection (`_id: 'lotId'`)
- `lotNumber` — unique, format `SERIES/SUBSERIES[/LOTNUM]`. Parsing + range-overlap validation in `stitchingController.js` (`parseLotNumber`, `validateLotNumber`).
- `invoiceNumber` — unique, numeric (**this is the UPSTREAM/source invoice on the lot — DO NOT confuse with the sales-side `Invoice.invoiceNumber` which is `INV{FY}/{seq}`**)
- `clientId`, `fabric`, `fitStyleId`, `waistSize`, `date`, `description`
- `status` enum `[2,3,4,5,6]` (status `1` was the removed Order stage), plus `statusHistory[]`
- `invoicedPcs` (sales-side cache) — sum of pcs across all non-cancelled `Invoice.lines` referencing this lot. Recomputed by `invoiceService.recalcLotInvoiced(lotId)` after every invoice write. `remainingPcs = finalPcs(production) - invoicedPcs`.

**Production stages** (each references `lotId`, has its own `vendorId` + `rate` + `quantityShort`; each also has an `isPaid`/`paidAt` "settled" marker — see below):
- **`Stitching`** — top-level `quantity`/`rate`. Also has `threadColors: [{color, quantity}]` — **sum of thread color quantities MUST equal lot `quantity`** (controller-enforced).
- **`Washing`** — schema-asymmetric: no top-level quantity/rate. Instead has `washDetails: [{washColor, washCreation, quantity, rate, quantityShort, quantityShortDesc}]`. Each entry is a separate wash sub-record. Several places (Excel export, vendor balance aggregation) special-case this — when iterating Washing data, **check for `washDetails` array** rather than scalar fields.
- **`Finishing`** — mirrors Stitching without `threadColors`.

**Stage quantity pre-fill (UI):** each stage's available qty is **net of upstream shortage** — Washing pre-fills to `stitching.quantity − quantityShort`; Finishing pre-fills (and the modal *fetches the washing record* to compute) `Σ(washDetails.quantity − quantityShort)`. Backend validates Finishing qty == available washing qty, so keep these in sync.

**Per-lot "Paid" marker:** `Stitching/Washing/Finishing` each have `isPaid` + `paidAt`. The Vendor Payments **Lots** table has a PAID toggle per lot (`PATCH /api/vendor-balances/lot-paid` → `markLotPaid` flips the production record by `{lotId, vendorId}`); a paid row is dimmed. `getVendorLotsDetails` returns `isPaid` (+ `recordId`) per lot. **Purely a status flag — it does NOT touch the money ledger/balance.** (Accessory purchases have the same marker — see Stock Management.)

Latest commit (`90c94c6`) relaxed validation to allow `quantity: 0` and `rate: 0` on Stitching entries (previously enforced `min: 1` / `min: 0`).

**Vendor accounting** (three collections that work together):
- **`VendorPaymentEntry`** — the ledger. Fields: `vendorId`, `vendorType` ∈ `['stitching','washing','finishing']`, `paymentScope` ∈ `['vendor','lot']` (vendor-level lump sum vs lot-specific), optional `lotId`, `paymentType` ∈ `['payment','short_adjustment']`, `amount`, `paymentDate`, `shortQuantity`/`shortRate` for adjustments, `createdBy`, `updatedBy`.
- **`VendorPaymentEntryHistory`** — full audit log of create/update/delete with `beforeData` + `afterData` snapshots.
- **`VendorBalance`** — **denormalized aggregate** (`totalDue`, `totalPaid`, `remainingBalance`, `lastUpdated`). Recomputed by `services/vendorBalanceService.updateVendorBalance`. **Always call `updateVendorBalance(vendorId, vendorType)` after any write that affects vendor money** — otherwise the aggregate drifts out of sync with the ledger.

**Sales / Dispatch / Billing** (added 2026-05-23):
- **`CompanySettings`** — singleton (one document, upserted on PUT). Issuer block printed on every invoice: name, multi-line address, GSTIN/PAN/MSME, email/phone, GST state, bank details, authorised signatory, `defaultInvoicePrefix` (default `INV`), `defaultDocumentType` (`BILL_OF_SUPPLY` | `TAX_INVOICE`).
- **`Invoice`** (the parent doc — one Invoice = one dispatch event = one printable bill):
  - `invoiceId` internal `INV-YYYYMMDD###`, `invoiceNumber` human `INV{FY}/{seq}` (e.g. `INV2627/29`) — unique, atomic via Counter `_id: 'invoice-{fyShort}'`. FY starts April 1.
  - `documentType`, `date`, `clientId`, `placeOfSupply { stateCode, stateName }`
  - **FROZEN snapshots** (do NOT mutate on later client/lot edits): `clientSnapshot { name, clientCode, gstin, pan, phone, email }`, `billTo` (AddressSchema), `shipTo` (AddressSchema)
  - `lines: [InvoiceLineSchema]` subdocs — `lotId` (optional, null = legacy line), `lotNumberSnapshot`, `lotInvoiceNumberSnapshot`, `description` (free-form), `hsnSac`, `pcs`, `unit`, `rate`, `amount`
  - `subTotal`, `roundOff`, `total`, `totalQty`, `amountInWords` (Indian lakh/crore numbering)
  - `status` ∈ `['draft','issued','cancelled']` (default `issued`). Cancelling returns the lot pcs to the available pool.
- **`InvoiceHistory`** — audit log: `action ∈ ['create','update','cancel','delete']`, `beforeData`/`afterData`, `changedBy`.
- **`ClientPaymentEntry`** — mirror of `VendorPaymentEntry`. Fields: `clientId`, `paymentScope ∈ ['client','invoice']`, optional `invoiceId`, `paymentType ∈ ['payment','adjustment']`, `amount`, `paymentDate`, `paymentMode ∈ ['cash','bank','upi','cheque','other']`, `referenceNumber` (cheque #/UTR), `notes`, audit fields.
- **`ClientPaymentEntryHistory`** — mirror of `VendorPaymentEntryHistory`.
- **`ClientBalance`** — denormalized aggregate (unique on `clientId`): `openingBalance` (for legacy seed from the spreadsheets), `totalInvoiced`, `totalPaid`, `totalAdjustment`, `remainingBalance = opening + invoiced - paid - adjustment`. Recomputed by `services/clientBalanceService.updateClientBalance`. **Always call `updateClientBalance(clientId)` after any write that affects client money** (invoice create/update/cancel, payment create/update/delete).

**Stock Management / Accessories** (added 2026-06-02 — Phase 1):
Tracks consumable accessories (zippers, buttons, label-tags, pocketing, polybags). Two independent denormalized aggregates, both fed by `AccessoryPurchase`:
- **STOCK** (per item, computed on read — no denormalization) = Σ purchase-line qty − Σ consumption qty.
- **MONEY** (per type, denormalized into `AccessoryBalance`) = opening + Σ purchases − Σ payments − Σ adjustments.

Collections:
- **`AccessoryType`** — seeded lookup (`key` slug drives behaviour). `key`, `name`, `unit` (pcs/mtr), `consumptionStage` ∈ `['stitching','finishing']`, `sortOrder`, `isActive`. Auto-seeded by `accessoryService.seedAccessoryTypes` (zipper/button/label-tag/pocketing/polybag) on first `/types` or `/stock/summary` hit.
- **`AccessoryItem`** — the master/lookup per type (e.g. "AD BLUE 5.5 INCH"). `accessoryTypeId`, `name`, `rate`, `clientId` (**null = general/common-for-all**; set = custom for that client), `subType` ∈ `['label','tag',null]` (for the Phase-2 label-tag paired stream), `isActive`. Unique on `(accessoryTypeId, name)`.
- **`AccessoryPurchase`** — one supplier invoice = header + N `lines[{accessoryItemId, nameSnapshot, qty, rate, amount}]` (a single INV can carry both a label and a tag line). `accessoryTypeId`, `date`, `vendorInvoiceNumber`, `supplier`, `totalQty`, `totalAmount`, plus an `isPaid`/`paidAt`/`paidBy` settled marker (`PATCH /accessories/purchases/:id/paid`; paid rows are dimmed + Edit/Delete disabled — a status flag only, doesn't touch the balance). **Call `accessoryService.updateAccessoryBalance(typeId)` after any purchase write.** Purchases + payments are **server-paginated** (`page`/`limit`, default 10) → `{ rows, total }`.
- **`AccessoryBalance.openingBalance`** is settable from the UI per type (Stock ledger → "Opening Balance" button → `PATCH /api/accessories/opening-balance`), mirroring client-balance opening. Used to carry the pre-go-live outstanding.
- **`AccessoryPayment`** (+ **`AccessoryPaymentHistory`**) — payments/adjustments against an **article-type account** (the "account" is the AccessoryType, matching the Excel's per-type ledger tabs — there is intentionally no per-supplier ledger in Phase 1). Mirror of VendorPaymentEntry. **Call `updateAccessoryBalance` + write history after any payment write.**
- **`AccessoryBalance`** — denormalized per type (unique on `accessoryTypeId`): `openingBalance`, `totalPurchased`, `totalPaid`, `totalAdjustment`, `remainingBalance`.
- **`AccessoryConsumption`** — per-item stock-out ledger, source of truth for consumed qty. Keyed by `(lotId, stage)` so editing a Stitching/Finishing record **replaces** its rows. **Zipper consumption** is written inside `stitchingController.createStitching`'s transaction (via `replaceConsumption`); **Finishing consumption** (button/label/tag/polybag) is written inside `finishingController.createFinishing`'s transaction via `replaceFinishingConsumption`. Both updateStitching/updateFinishing replace non-transactionally.

**Zipper consumption hook (Stitching):** `createStitching`/`updateStitching` accept an optional `zipperConsumption: [{accessoryItemId, qty}]`. It's **optional/non-blocking** — if every qty is 0 (or no zipper masters exist) it's skipped so the critical stitching flow never breaks; but once **any** zipper qty is entered, the sum **must equal the lot quantity** (validated client- and server-side, returns 400 with a clear message). The stitching modal shows ALL applicable zipper items for the selected client (client-mapped items if any exist, else general), each defaulting to 0.

**Finishing consumption hook (Phase 2):** `createFinishing`/`updateFinishing` accept `accessoryConsumption: [{accessoryItemId, qty}]` (a flat list across types; each item's type/name/clientLinked is resolved server-side). The modal calls `GET /api/accessories/finishing-items?invoiceNumber=` which resolves the lot's client and returns consumption **slots** — Button, **Label**, **Tag** (Label-Tag expands into two slots, consumed as a pair), Polybag — each listing client-mapped **AND** general items so a lot can be split partial-client + partial-general (each slot supports multiple split rows). **Rivets are NOT a slot**: they're auto-derived at **4× the total buttons** against the default rivet item (`subType:'rivet'`), carried on the Button group's `rivet` field and appended to the consumption set on save (1 button + 4 rivets per piece). **Pocketing is excluded** (metres, purchases/payments only — `accessoryService.FINISHING_CONSUMABLE_KEYS`). Each shown slot is **pre-filled to the finishing quantity** (which already nets stitching/washing shortage) and **required (≥1)**; users adjust upward per item for extras sent. Only slots that have items are shown/required.

**Dormant schemas** (still defined, not actively used):
- `Order` — removed as entry point
- `Balance`, `Report` — wired to routes but UIs are minimal/skeletal. (The old `Invoice` schema/route was **removed** 2026-05-23 when the new Sales module took its place.)

---

## 5. API routing

**Mounting in `server.js`:** Most routes at `/api`; four sub-prefixed exceptions:

```js
app.use('/api', authRoutes);
app.use('/api', dashboardRoutes);
app.use('/api', userRoutes);
app.use('/api', clientRoutes);
app.use('/api', fitStyleRoutes);
app.use('/api', vendorRoutes);
// app.use('/api', orderRoutes);   ← COMMENTED OUT (Order stage removed)
app.use('/api', lotRoutes);
app.use('/api', stitchingRoutes);
app.use('/api', washingRoutes);
app.use('/api', finishingRoutes);
app.use('/api/vendor-balances', vendorBalanceRoutes);    // ← SUB-PREFIX
app.use('/api/sales-invoices', salesInvoiceRoutes);      // ← SUB-PREFIX (2026-05-23)
app.use('/api/client-balances', clientBalanceRoutes);    // ← SUB-PREFIX (2026-05-23)
app.use('/api/company-settings', companySettingsRoutes); // ← SUB-PREFIX (2026-05-23)
app.use('/api/accessories', accessoryRoutes);            // ← SUB-PREFIX (2026-06-02 Stock Mgmt)
app.use('/api', balancesRoutes);
app.use('/api', reportRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', emailRoutes);
```

**Sub-prefixed routes** (easy to miss — copy the prefix from the matching `app.use` line):
- `/api/vendor-balances/*` — vendor payment ops + Excel export
- `/api/sales-invoices/*` — invoice CRUD + `lots-available` autocomplete + cancel + history
- `/api/client-balances/*` — client payment ops + ledger + opening balance + history
- `/api/company-settings` — admin-only singleton get/update
- `/api/accessories/*` — Stock Mgmt: `types`, `items`(+`/applicable`, +`/finishing-items`), `purchases`, `payments`(+`/:id/history`), `balance` (+ PATCH `/opening-balance` to seed per-type opening balance, mirror of `/api/client-balances/opening-balance`), `stock`(+`/summary`), `consumption`. Purchases/payments are server-paginated (`page`/`limit`, default 10) returning `{ rows, total }`.

**Auth:** every route except `/api/auth/*` should call `authenticateToken` middleware (see pattern in `routes/vendorBalances.js`).

**CORS:** allowlist from `CORS_ORIGINS` env var (comma-separated). Default fallback is `https://greysage.vercel.app`.

**Errors:** controllers can `throw` or `return res.status(...).json({error})`. `express-async-errors` propagates throws to the global handler in `middleware/error.js`, which translates Mongo duplicate-key errors.

---

## 6. Frontend conventions

**Routing** lives entirely in `App.js`. Two layout wrappers:
- `AuthenticatedLayout` — requires `localStorage.token`; provides Sidebar, Appbar, SnackBar, ErrorBoundary
- `AdminLayout` — additionally requires `user.role === 'admin'` (reads `JSON.parse(localStorage.user)`)

**Shared context to child routes** is via React Router's `useOutletContext`:
```js
const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
```
Use `showSnackbar(messageOrError, severity)` for user-facing notifications. Passing an axios error object triggers session-expiry handling (auto-redirect to login on 401/403).

**Catalog pattern** — every lookup uses the same triplet in `features/Catalogs/`:
- `{Name}Catalog.js` — list/grid view
- `{Name}CatalogAdd.js` — create/edit modal
- `{Name}CatalogSx.js` — MUI `sx` style objects extracted to a side file

Copy this triplet when adding a new lookup.

**API calls** all go through `frontend/src/services/apiService.js` — a single object grouped by domain. Add new endpoints to the matching group; don't call `axios` directly from components.

---

## 7. Recent activity & current checkpoint

**Active workstream (uncommitted, 2026-05-23): Sales/Dispatch/Billing module.** New first-class pillar of the system that generates customer invoices (Bill of Supply / Tax Invoice PDFs) from production lots and tracks client payments. Touches:
- Schema: extended `Client` (GSTIN/PAN/billingAddress/shippingAddress), extended `Lot` (`invoicedPcs` cache), added `CompanySettings`/`Invoice`/`InvoiceHistory`/`ClientPaymentEntry`/`ClientPaymentEntryHistory`/`ClientBalance`; deleted old skeletal `Invoice` schema.
- Backend: new `services/invoiceService.js` + `services/clientBalanceService.js`, new controllers (`salesInvoiceController`, `clientBalanceController`, `companySettingsController`), new routes (`/api/sales-invoices`, `/api/client-balances`, `/api/company-settings`). Deleted old `controllers/invoiceController.js` + `routes/invoices.js`.
- Frontend: new `features/Sales/` (`InvoiceManagement`, `InvoiceFormModal` with per-line lot autocomplete, `invoicePdfService` with jsPDF), new `features/ClientPayments/` mirroring VendorPayments, new `features/Admin/CompanySettings.js`. Extended `features/Catalogs/ClientCatalogAdd.js` with GSTIN/PAN/Bill/Ship addresses. Updated `App.js` routes (`/sales/invoices`, `/sales/client-payments`, `/admin/company-settings`) and Sidebar. Deleted old `features/Admin/InvoiceManagement.js`.
- Deps: added `jspdf` + `jspdf-autotable` to `frontend/package.json`. Run `npm install` in `frontend/`.

**Where to verify when picking this up:**
- Visit `/admin/company-settings` first and fill in the ALLYZ JEANS issuer block (name, address, GSTIN, MSME, bank, signatory). Reference data is in `docs/business_core/INV2627 27 BRANDKO MART LLP.pdf` (a sample WhiteBill invoice this layout matches).
- Confirm a Lot's `remainingPcs` shows correctly by creating an invoice line against it and watching `invoicedPcs` on the lot. Try cancelling — pcs should return to the pool.
- PDF preview/download in `InvoiceManagement` calls `invoicePdfService.generateInvoicePdf` with the company settings + full invoice; rendering uses `Rs.` (not `₹`) because Helvetica has no rupee glyph.

**Last committed state:** `90c94c6 making entry with zero qty and rate` (2026-04-09). Recent commit progression (newest first):
1. `90c94c6` — allow zero qty/rate Stitching
2. `399c299` — vendor payment management v2: UI fix
3. `da29fff` — vendor payment management v2
4. `bc278e6` — vendor payment management
5. `d11c6b0` — dashboard upgrade
6. `5c7c939` — serverless api maxPoolSize fix (Atlas M0)
7. `b76f92f` — migrated to LOT-based

---

## 8. Gotchas — things that will trip you up

**Token refresh hinges on the 401 vs 403 distinction.** Short-lived JWT access token (default 15m) + opaque rotating refresh token (httpOnly `rt` cookie, bcrypt-hashed in `User.refreshTokens`, **default 12h** session — `authController` `REFRESH_TOKEN_TTL`). The axios interceptor (`axiosInstance.js`) only performs the silent refresh on a **401**, so `middleware/auth.js` returns **401 for an expired access token** (`TokenExpiredError`) and 403 only for genuinely-invalid tokens. If you ever make auth return 403 on expiry, the session dies after one access-token lifetime instead of refreshing. Edit the auth-config constants (`ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_HOURS`/`_DAYS`) in `authController.js`, not elsewhere.

**Duplicate `vendorPayments` key in `apiService.js`.** The object literal in `frontend/src/services/apiService.js` declares a `vendorPayments` block twice (around line 284 and around line 578). JavaScript keeps the **second** declaration — the first block is dead code calling URLs that no longer exist on the backend (`/api/vendor-payment*` vs the real `/api/vendor-balances/vendor-payment*`). When editing vendor-payment calls, edit the **second** block. The first should probably be deleted, but confirm before doing so.

**Order stage is dormant, not just unused.**
- `frontend/src/features/Orders/` files exist (grid, modal, management) but the route is not mounted in `App.js`.
- `backend/routes/orders.js` and `backend/controllers/orderController.js` exist but `app.use('/api', orderRoutes)` is commented out in `server.js`.
- The `Order` Mongoose model is still defined.
- Don't suggest fixes to this code without checking whether the user actually wants the Order stage revived.

**Washing is schema-asymmetric.** It has `washDetails[]` instead of top-level `quantity`/`rate`. Code that handles all three stages uniformly must special-case Washing. See `vendorBalanceService.getVendorLotsDetails` for an example.

**Vendor balance is denormalized.** `VendorBalance` is a cached aggregate, not source of truth. The source of truth is `VendorPaymentEntry` + the production-stage records (Stitching/Washing/Finishing). Any code path that writes to those collections must call `vendorBalanceService.updateVendorBalance(vendorId, vendorType)` afterward, or the aggregate drifts.

**Client balance is denormalized too.** `ClientBalance` is a cached aggregate of `Invoice` (non-cancelled) + `ClientPaymentEntry`. Any code path that writes to those must call `clientBalanceService.updateClientBalance(clientId)` afterward. Same rule, mirror collection.

**Lot `invoicedPcs` is denormalized too.** Sum of pcs across non-cancelled invoice lines referencing the lot. Recomputed by `invoiceService.recalcLotInvoiced(lotId)` after every invoice create/update/cancel/delete. Any new code that mutates invoice lines must call it (for every affected lot — both added and removed lots when editing).

**Invoice snapshots are FROZEN.** `Invoice.clientSnapshot`, `billTo`, `shipTo`, and `lines[i].lotNumberSnapshot`/`lotInvoiceNumberSnapshot` are copied from the live records at issue time and **never refreshed**. Standard accounting practice — the printed PDF and the stored Invoice must match forever. Editing a Client or Lot does NOT update past invoices.

**Two different "invoice numbers" exist — don't confuse them.** `Lot.invoiceNumber` is a numeric upstream invoice from the source (printed on Stitching screens, predates the sales module). `Invoice.invoiceNumber` is the sales-side string like `INV2627/29` (FY-scoped seq via Counter `_id: 'invoice-{fyShort}'`). The Lot's number is displayed alongside lotNumber on the invoice line as `lotInvoiceNumberSnapshot` for reference.

**Sales Invoice number is FY-scoped.** FY starts April 1 (Indian fiscal year). `invoiceService.generateInvoiceNumber(date)` derives `fyShort` from the date and atomically increments a per-FY Counter. Don't generate invoice numbers any other way.

**PDF rendering uses `Rs.`, not `₹`.** jsPDF's default Helvetica font has no rupee glyph. `features/Sales/invoicePdfService.js` prefixes amounts with `Rs. `. If a custom font is added later, switch back to `₹`.

**Serverless tuning is intentional.** `maxPoolSize: 3`, `autoIndex: false`, global connection cache. These exist to keep Atlas M0 happy. Don't "modernize" them.

**MongoDB replica set is required even in dev.** `stitchingController.createStitching` uses `mongoose.startSession()` for a multi-document transaction. Vanilla `mongod` won't work — use the `docker-compose.yml` which initializes `rs0` automatically.

**Env files are gitignored everywhere.**
- `.env`, `.env.development` (root)
- `backend/.env`
- `frontend/.env`, `frontend/.env.production`
- `.claude/settings.local.json`
Don't echo their contents into responses, don't commit them. Required keys (without values):
- Backend: `MONGO_URI`, `JWT_SECRET`, `CORS_ORIGINS`, SendGrid creds
- Frontend: `REACT_APP_MUI_LICENSE_KEY` (paid MUI X license)

**Archived folders to leave alone:**
- `frontendv2/` — stalled rewrite, gitignored
- `bkp/`, `frontend/bkp/` — backups, gitignored
- `*.zip` files — snapshots
- `frontend/build/` — generated artifact
Read-only is fine; don't propose edits to these unless the user explicitly asks.

---

## 9. Quick file-jump map

**When you need to find...**

| Looking for | File |
|---|---|
| All Mongoose models | `backend/mongodb_schema.js` |
| Server entry / route mounting / CORS / Mongo connect | `backend/server.js` |
| LotNumber parsing & range validation | `backend/controllers/stitchingController.js` (top of file) |
| Vendor payment business logic | `backend/controllers/vendorBalanceController.js` |
| Vendor balance denormalization | `backend/services/vendorBalanceService.js` |
| Sales invoice business logic (create/update/cancel + lot autocomplete) | `backend/controllers/salesInvoiceController.js` |
| Final/remaining pcs derivation, FY counter, amount-in-words | `backend/services/invoiceService.js` |
| Client balance denormalization (mirror of vendor service) | `backend/services/clientBalanceService.js` |
| Client payment ledger ops | `backend/controllers/clientBalanceController.js` |
| Company settings (issuer) singleton | `backend/controllers/companySettingsController.js` |
| Accessory/Stock business logic (items, purchases, payments, stock, consumption) | `backend/controllers/accessoryController.js` |
| Accessory denormalization (balance, stock aggregation, replaceConsumption, seed) | `backend/services/accessoryService.js` |
| Stock Management UI (type selector + stats + masters + ledger) | `frontend/src/features/Stock/` |
| Zipper consumption hook | `backend/controllers/stitchingController.js` (`prepareZipperConsumption`) + `frontend/src/features/Stitching/AddStitchingModal.js` |
| JWT auth middleware | `backend/middleware/auth.js` |
| Global error handler | `backend/middleware/error.js` |
| Audit log writer | `backend/utils/logger.js` |
| Order→Lot historical migration | `backend/migrations/migrate-orders-to-lots.js` |
| Business requirements doc | `backend/BRD.MD` |
| Sample customer invoice (WhiteBill-generated, layout reference) | `docs/business_core/INV2627 27 BRANDKO MART LLP.pdf` |
| Legacy dispatch ledger format (per-client xlsx) | `docs/business_core/Dispatch Status - Adam Hills.xlsx` |
| All frontend routes & layouts | `frontend/src/App.js` |
| All API calls | `frontend/src/services/apiService.js` |
| Axios base + JWT interceptor | `frontend/src/services/axiosInstance.js` |
| Theme variants / dark mode | `frontend/src/components/Theme/AppTheme.js` |
| Sales invoice form (multi-line + lot autocomplete + live totals) | `frontend/src/features/Sales/InvoiceFormModal.js` |
| Sales invoice list + cancel + PDF actions | `frontend/src/features/Sales/InvoiceManagement.js` |
| jsPDF invoice rendering (matches WhiteBill layout) | `frontend/src/features/Sales/invoicePdfService.js` |
| Client payment ledger UI (mirror of VendorPayments) | `frontend/src/features/ClientPayments/ClientPaymentManagement.js` |
| Company settings admin page | `frontend/src/features/Admin/CompanySettings.js` |
| Active vendor payments UI (~1381 lines) | `frontend/src/features/VendorPayments/VendorPaymentManagement.js` |
| Main dashboard (~851 lines) | `frontend/src/features/Admin/Dashboard.js` |
| Lot creation UI | `frontend/src/features/Stitching/AddStitchingModal.js` |
| Local dev stack | `docker-compose.yml` |

---

## 10. Working agreements

- **Don't add an Order route** unless explicitly asked to revive it. Lot is the entry point.
- **Don't change `maxPoolSize`, `autoIndex`, or the global connection cache** in `server.js` without discussing the Atlas M0 constraint.
- **Don't commit or echo `.env*` files.**
- **Don't edit `frontendv2/`, `bkp/`, or `*.zip`** without confirmation.
- **When touching vendor-payment money flow:** call `updateVendorBalance` after the write, write to the audit history if updating an entry, and edit the **second** `vendorPayments` block in `apiService.js`.
- **When touching invoice/client-payment money flow:** call `clientBalanceService.updateClientBalance(clientId)` after the write. If you touch invoice lines that reference a Lot, also call `invoiceService.recalcLotInvoiced(lotId)` for **every** affected lot (added AND removed when editing). Write to `ClientPaymentEntryHistory` / `InvoiceHistory` on update/delete.
- **Never mutate invoice snapshots after issue.** `clientSnapshot`, `billTo`, `shipTo`, and `lotNumberSnapshot` are frozen by design.
- **Never generate an invoice number manually.** Always use `invoiceService.generateInvoiceNumber(date, prefix)` so the FY-scoped Counter increments atomically.
- **When iterating Washing records:** check for `washDetails[]` instead of scalar `quantity`/`rate`.
- **For new lookups:** copy the `Catalogs/{Name}Catalog.js + CatalogAdd.js + CatalogSx.js` triplet.
- **For new API endpoints:** add to `apiService.js` (don't call `axios` from components), mount under the correct `/api`, `/api/vendor-balances`, `/api/sales-invoices`, `/api/client-balances`, or `/api/company-settings` prefix.

---

*This file is the single source of truth for cross-model agent context. Update it when the architecture shifts, the active workstream changes, or a new gotcha is discovered. Per-model memory systems (e.g. Claude's `.claude/projects/.../memory/`) may also exist but this file is authoritative for any agent that doesn't have access to those.*

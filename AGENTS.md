# GreySage ERP — Agent Context

Single-file context for any AI coding assistant working on this repo. Read this first,
before exploring source.

**Last context refresh:** 2026-07-26, against commit `d368de6` "invoice with sample entry
option" (2026-07-15).

**This file drifts.** The previous refresh sat six weeks stale and asserted several things
that were no longer true. Before trusting anything time-sensitive below, run
`git log --oneline -20` and `git status`, and treat §7 as the most perishable section. If
you land significant work, update this file as part of it.

---

## 1. What this project is

An ERP for a garment manufacturer (issuer entity **ALLYZ JEANS**). Bulk client orders are
split into **Lots** (batches), each tracked through three production stages —
**Stitching → Washing → Finishing** — performed by external vendors at per-piece rates.

Five pillars:

1. **Production** — lots flowing through the three stages.
2. **Vendor accounting** — per-vendor ledger of what's owed and what's been paid.
3. **Sales / Dispatch / Billing** — invoices to clients, per-client payment ledger, PDF
   invoice generation.
4. **Stock** — consumable accessories (zippers, buttons, rivets, labels, tags, pocketing,
   polybags) with per-lot consumption hooked into production.
5. **Reconciliation** — nightly diff of a shared OneDrive Excel workbook against the
   database, surfaced through an in-app notification bell.

A **LotNumber** like `A/1/5` means series `A`, batches 1 through 5. A series caps at 100
batches before rolling over (`A` → `B` → `C`). A single batch is written `A/46`.

**Lot is the root aggregate.** The original `Order` collection was removed as an entry
point (commit `836271d`); its schema, route and controller still exist but `orderRoutes` is
**commented out** in `server.js`, and `features/Orders/` is not mounted in `App.js`. Don't
revive it without being asked. `backend/migrations/migrate-orders-to-lots.js` handled the
cutover.

Scale: 22 controllers, 22 route files, 8 services, 36 Mongoose models, ~35k lines.

---

## 2. Tech stack

**Backend** (`backend/`)

- Node.js 18, Express 4, Mongoose 7
- `express-async-errors` — async throws propagate to the global handler
- Auth: `bcryptjs` + `jsonwebtoken`; short access token + rotating opaque refresh token
- Cache: **Upstash Redis over REST** (`@upstash/redis`) — stateless HTTP, no pool
- Email: **Brevo SMTP via `nodemailer`** (not SendGrid — replaced in `85f07ec`)
- Excel: `xlsx` — server-side export *and* workbook parsing for reconciliation
- Validation: `express-validator`
- Deployed as a **Vercel serverless function**: `server.js` exports the app; `app.listen`
  only runs when `NODE_ENV !== 'production'`

**Frontend** (`frontend/`)

- CRA (`react-scripts 5`), React 18, React Router 6
- **MUI v7** + **MUI X v8** (data-grid, charts, date-pickers, date-pickers-pro)
- MUI X is a paid licence — `App.js` calls `LicenseInfo.setLicenseKey(...)`
- `react-hook-form`, `dayjs`, `@tanstack/react-table`, `motion`
- `jspdf` + `jspdf-autotable` for invoices. Helvetica has no ₹ glyph, so
  `invoicePdfService.js` prints `Rs.`
- No Redux/Zustand — component-local state, `localStorage` for auth, snackbar lifted into
  the layout and passed via `useOutletContext`

**Database**

- MongoDB 7.0 with **replica set `rs0`** — required, because
  `stitchingController.createStitching` opens a multi-document transaction
- Production: Atlas M0. Local: `docker-compose.yml` (Mongo with auto replSet init, API on
  5000, frontend 8080→3000)

---

## 3. Repository layout

```
ERP-GreySage/
├── backend/
│   ├── server.js               # CORS, Mongo connect middleware, route mounting
│   ├── mongodb_schema.js       # ALL 36 Mongoose models in one file
│   ├── routes/                 # one file per resource
│   ├── controllers/            # one file per resource
│   ├── services/
│   │   ├── vendorBalanceService.js    # vendor denormalisation + lots-by-vendor aggregation
│   │   ├── clientBalanceService.js    # client-side mirror
│   │   ├── invoiceService.js          # final/remaining pcs, FY counter, amount-in-words,
│   │   │                              #   dispatch board, manual dispatch
│   │   ├── accessoryService.js        # stock, balances, consumption, seeding
│   │   ├── makingsReconService.js     # OneDrive workbook download + parse + diff
│   │   ├── notificationService.js     # low-stock digest (WhatsApp is a stub)
│   │   ├── emailService.js            # Brevo SMTP wrapper
│   │   └── cache.js                   # Upstash read-through, version-stamped keys
│   ├── middleware/             # auth.js, error.js
│   ├── migrations/             # one-time migrations + seeds
│   ├── scripts/                # operational utilities
│   ├── utils/logger.js         # logAction → AuditLog
│   ├── BRD.MD                  # business requirements (GITIGNORED — read for domain)
│   └── vercel.json             # serverless config + cron schedules
│
├── frontend/src/
│   ├── App.js                  # all routes + layouts (Authenticated, Admin)
│   ├── components/
│   │   ├── Navbar/             # Sidebar, Appbar, NotificationBell, Breadcrumbs
│   │   ├── Theme/              # theme variants + dark mode
│   │   └── SnackBar, ErrorBoundary, NotFound, Validators, MuiCustom, OrderStatusChip
│   ├── features/
│   │   ├── Stitching/  Washing/  Finishing/
│   │   ├── Sales/              # InvoiceManagement, InvoiceFormModal, DispatchManagement,
│   │   │                       #   ManualDispatchModal, invoicePdfService
│   │   ├── VendorPayments/  ClientPayments/
│   │   ├── Stock/              # StockManagement, masters, ledger, vendor extras
│   │   ├── Catalogs/           # 6 lookups, each a 3-file triplet
│   │   ├── Admin/              # Dashboard, ProductionDashboard, DashboardExcel, Reports,
│   │   │                       #   AuditLogs, UserManagement, CompanySettings
│   │   ├── Orders/             # DORMANT — not mounted
│   │   └── Login/
│   └── services/               # axiosInstance, apiService, authService
│
├── ext/process.py              # retired Python workbook parser (reference for the JS port)
├── docker-compose.yml, init-mongo.js
├── AGENTS.md                   # this file
└── README.md
```

Gitignored and off-limits unless asked: `frontendv2/` (stalled rewrite), `bkp/`,
`frontend/bkp/`, `docs/`, `*.zip`, `build/`, all `.env*`.

---

## 4. Domain model

All models live in **`backend/mongodb_schema.js`**.

**Lookups** (each with an `isActive` soft-disable flag):

- `Client` — unique `clientCode`, unique index on `name`. Carries `gstin`, `pan`,
  `billingAddress` + `shippingAddress` (`AddressSchema` subdoc), and **`billingFirms[]`** —
  optional sub-billers, so one client can be invoiced under several firm identities (added
  `3a19342`). Legacy free-text `address` kept for back-compat.
- `FitStyle` — replaced an older `Product` collection; unique on `name`.
- `FabricVendor`, `StitchingVendor`, `WashingVendor`, `FinishingVendor` — separate
  collections. The three production vendors carry a `defaultRate` that pre-fills the stage
  modal. `updateVendor` **whitelists fields**, so new vendor fields must be added there too.

**Lot** (root aggregate):

- `lotId` — `LT-YYYYMMDD###` via the `Counter` collection
- `lotNumber` — unique, `SERIES/SUBSERIES[/LOTNUM]`. Parsing and range-overlap validation
  live at the top of `stitchingController.js` (`parseLotNumber`, `validateLotNumber`)
- `invoiceNumber` — unique, numeric. **This is the UPSTREAM/maker bill, not the sales
  invoice.** See §8
- `status` enum `[2..7]` — 2 Stitching · 3 Washing · 4 Finishing · 5 Finished/Ready ·
  6 Partially Dispatched · 7 Dispatched — plus `statusHistory[]`
- `invoicedPcs` — cached sum of issued **good** invoice-line pcs
- `damagedPcs` — pcs held back from the client, still sellable, later sold combined to a
  third party. `clientDispatchableGood = finalPcs − damagedPcs`
- `damagedSoldPcs` — cached sum of issued **damaged** invoice-line pcs
- `clientId` is **"produced for", not "billed to"**. The two are independent — see §Sales.
  Never rewrite it to record a sale; it drives production dashboards, vendor cost
  attribution and the makings recon.

`finalPcs` is **derived, never stored** — `invoiceService.getFinalPcsForLot(s)` walks
Finishing → Washing → Stitching, taking `quantity − quantityShort`. Presence of any doc in a
stage stops the fallback, so a lot with an empty-`washDetails` Washing doc resolves to 0
rather than falling through to Stitching.

**Production stages** — each references `lotId` and has its own `vendorId`, `rate`,
`quantityShort`, and an `isPaid`/`paidAt` settled marker:

- **`Stitching`** — top-level `quantity`/`rate`, plus `threadColors: [{color, quantity}]`.
  Thread quantities **must sum to the lot quantity** (controller-enforced).
- **`Washing`** — **schema-asymmetric**: no top-level quantity/rate. Instead
  `washDetails: [{washColor, washCreation, quantity, rate, quantityShort, quantityShortDesc}]`.
  Code handling all three stages uniformly must special-case this.
- **`Finishing`** — mirrors Stitching without thread colours. Also `accessoryBasisPcs`.

**Vendor accounting**: `VendorPaymentEntry` (the ledger — `paymentScope` vendor|lot,
`paymentType` payment|short_adjustment), `VendorPaymentEntryHistory` (before/after
snapshots), `VendorBalance` (denormalised aggregate).

**Sales**: `CompanySettings` (issuer singleton), `Invoice`, `InvoiceHistory`,
`ClientPaymentEntry`, `ClientPaymentEntryHistory`, `ClientBalance`.

- `Invoice.invoiceNumber` is `INV{FY}/{seq}`, FY starting 1 April, atomic via Counter
  `_id: 'invoice-{fyShort}'`. **Never generate one by hand** —
  `invoiceService.generateInvoiceNumber(date, prefix)`.
- `status` ∈ `draft | issued | cancelled` (default `issued`). Cancelling returns pcs.
- **Frozen snapshots**: `clientSnapshot`, `billTo`, `shipTo`, `lines[].lotNumberSnapshot`,
  `lines[].lotInvoiceNumberSnapshot` — copied at issue time, never refreshed.
- `lines[].isDamaged` marks a damaged-stock sale line.
- **`Invoice.clientId` (billed to) and `Lot.clientId` (produced for) are independent.**
  Full or partial qty of a lot produced for one client is routinely sold to another, so the
  dispatch lot picker is deliberately **not** filtered to the billed client. If you find
  yourself "fixing" that missing filter, read this first.
  - `lines[].lotClientIdSnapshot` (+ the same on `sources[]`) freezes the lot's owner at
    issue time. Cross-client is **derived** (`snapshot ≠ Invoice.clientId`), never stored as
    a boolean, so it cannot drift.
  - `lines[].internalNote` is **never printed** — `invoicePdfService` renders only
    `description` and `remark`. It is mandatory on a cross-client *good* line, and it must
    stay unprinted: it names the other client, which the buyer must not see. For the same
    reason the description prefill drops the lot number on cross-client lines.
  - `GET /api/sales-invoices/cross-client` reconciles the two attributions.
- **`Client.isInternal`** marks a house label (GREYSAGE): owns lots, is never billed. Its
  lots appear in **every** client's picker without the cross-client toggle; it is rejected
  as an invoice's bill-to party and excluded from receivables.
- `lines[].sources[]` — per-lot breakdown for a **merged** line drawing from several lots
  (added `759150d`). Source pcs sum to the line's pcs; each source's pcs is what subtracts
  from that lot. Empty for single-lot and legacy lines.

**Stock / Accessories**: `AccessoryType` (seeded lookup, `key` slug drives behaviour),
`AccessoryItem` (masters per type; `clientId` null = general, set = client-specific;
`subType` ∈ label|tag|button|rivet; `openingStock`), `AccessoryPurchase` (header + lines,
`isPaid` marker), `AccessoryPayment` + `AccessoryPaymentHistory`, `AccessoryBalance`,
`AccessoryConsumption` (per-item stock-out, keyed by `(lotId, stage)`),
`AccessoryVendorReturn` (items returned by a finishing vendor).

Two independent aggregates: **stock** per item, computed on read
(`openingStock + purchases − consumption`); **money** per type, denormalised into
`AccessoryBalance`.

Consumption hooks: **zippers** at stitching (inside the transaction; optional — all-zero
skips, but any partial entry must sum to the lot quantity); **buttons / labels / tags /
polybags** at finishing, with **rivets auto-derived at 4× buttons**. Pocketing is excluded
from consumption (purchases and payments only).

**Reconciliation**: `MakingsDiff` — a single stored snapshot with `count`,
`discrepancies[]`, `excelRows[]` (needed to re-diff one lot after a fix), `scannedRows`,
and `status` ∈ ok|error.

**Dormant**: `Order`, `Balance`, `Report` — defined, routes mostly wired, UIs skeletal.

---

## 5. API routing

Most routes mount flat at `/api`. Six sub-prefixed exceptions:

```js
app.use('/api/vendor-balances', vendorBalanceRoutes);
app.use('/api/sales-invoices', salesInvoiceRoutes);
app.use('/api/client-balances', clientBalanceRoutes);
app.use('/api/company-settings', companySettingsRoutes);
app.use('/api/accessories', accessoryRoutes);
app.use('/api/cron', cronRoutes);            // machine-triggered, CRON_SECRET not JWT
// app.use('/api', orderRoutes);             // COMMENTED OUT — Order stage removed
```

Everything else (auth, users, clients, fitStyles, vendors, lots, stitching, washing,
finishing, dashboard, reports, auditLogs, contact, makings) sits directly under `/api`.

**Auth:** every route calls `authenticateToken` except `/api/auth/*`, `POST /api/contact`
(anonymous marketing form), `GET /api/accessories/public/finishing-vendor-extras`
(deliberately public board for a vendor), and `/api/cron/*` (secret-guarded).

**`restrictTo('admin')`** is applied sparingly — user management, audit logs, company
settings, accessory types, low-stock test, invoice counter. Day-to-day financial recording
is open to any authenticated user by design; see §10.

**CORS:** allowlist from `CORS_ORIGINS`, defaulting to `https://greysage.vercel.app`.

**Errors:** controllers may throw or return `res.status(...)`. `express-async-errors` routes
throws to `middleware/error.js`, which translates Mongo duplicate-key errors.

**Route order matters** in `salesInvoices.js` — specific paths must stay above `/:id`, or
Express swallows them.

---

## 6. Frontend conventions

**Routing** lives entirely in `App.js`. `AuthenticatedLayout` requires
`localStorage.token`; `AdminLayout` additionally requires `user.role === 'admin'`.

**Shared context** via `useOutletContext()`:

```js
const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
```

`showSnackbar(messageOrError, severity)` — passing an axios error triggers session-expiry
handling.

**Mobile is a first-class layout, not a fallback.** Several features ship a dedicated
`*Sx.js` mobile component (`StitchingGridSx`, `OrderGridSx`, `WashingGridSx`, …) rendered
when `isMobile`. Some controls **move** between layouts — e.g. the Stitching "Add" button
lives in `StitchingManagement` on desktop but inside `StitchingGridSx` on mobile. **Always
implement both.** Desktop-only work gets sent back.

**Catalog triplet** — `{Name}Catalog.js` (list), `{Name}CatalogAdd.js` (modal),
`{Name}CatalogSx.js` (styles). Copy it for a new lookup.

**API calls** all go through `frontend/src/services/apiService.js`, grouped by domain.
Never call axios directly from a component.

**Deep links** — `navigate('/stitching?search=<lotNumber>')`; `StitchingManagement` reads it
via `useSearchParams`. The notification bell established this pattern; reuse it rather than
embedding editors in other screens.

**Caching** — `getOrSet(resource, parts, ttl, fetchFn)` reads through Upstash with
version-stamped keys; `bumpVersion(resource)` after a write invalidates a whole family in
O(1). Fail-open by design: a cache outage must never turn a working request into a 500.

---

## 7. Current checkpoint (most perishable section)

**Last commit:** `d368de6` (2026-07-15). Recent progression, newest first: invoice sample
entry · recon notification UI · MAKINGS recon bell (`a1fd53b`) · public finishing-extras
board (`b363523`) · per-client accessory split + rivet split · Redis integration (`d2cc02a`)
· low-stock mail via Brevo (`85f07ec`) · invoice combine-lots (`759150d`) · multiple billers
per client (`3a19342`) · dispatch module (`a527e52`) · Stock Management.

### Work prepared 2026-07-26 but NOT yet in the repo

Delivered as zips of complete replacement files, all built on `d368de6`. **Check `git log`
and `git status` to see which have actually been applied.**

**A. Security hardening** (16 files). Fixes a critical hole: `POST /api/register` was
anonymous *and* honoured a client-supplied `role`, while `/register` was a public SPA route
with an **Admin option in its Role dropdown** — anyone could self-register as an
administrator on the live system. Now gated by an admin JWT, except first-user bootstrap on
an empty database. Also: removed the `'your_jwt_secret'` fallback (the API now throws on boot
without `JWT_SECRET`); Upstash-backed rate limiting on login/refresh/register/contact; HTML
escaping in the contact email template; `restrictTo('admin')` on payment-entry deletes,
invoice delete and client opening-balance; refresh-token validation reduced from
O(users × sessions) bcrypt calls to one indexed lookup via a `<tokenId>.<secret>` cookie;
fixed `getInvoiceStatus`, which bucketed into the deleted schema's Pending/Paid/Partial and
filtered on `req.user._id` (the JWT carries `userId`), so the chart always rendered zeros;
deleted ~390 lines of dead code; added `scripts/ensure-indexes.js`.

**B. Manual dispatch** (7 files). For legacy lots dispatched before the system existed,
which will never be invoiced and so sat permanently "pending" with `invoicedPcs = 0`. New
`ManualDispatch` + `ManualDispatchHistory` collections, `Lot.manualDispatchedPcs` /
`manualDamagedSoldPcs` caches, `recalcLotManualDispatch`, four endpoints under
`/api/sales-invoices/manual-dispatch`, and `features/Sales/ManualDispatchModal.js`. Dispatch
status sums both streams (`invoicedPcs + manualDispatchedPcs`), and manual pcs net out of the
invoice autocomplete and the combined-damaged picker. Pending Dispatch sorts **oldest pending
first** — in memory, after `dispatchStatus` is computed, before pagination; outstanding ranks
above fully-dispatched.

**C. No Zipper filter + FABRIC reconciliation** (6 files).
`GET /api/stitching?noZipper=true` returns lots with no zipper consumption at stitching,
implemented as an exclusion (`$nin` the lots that have it) because the obvious inverse misses
lots with no consumption rows at all. UI is an MUI `Switch` — left of Add on desktop, right
of Add on mobile. Separately, `makingsReconService.diffRow` **was not comparing Fabric**:
`DETAILS` was parsed but used only for the Add-Stitching prefill, and the DB entry didn't
expose `Lot.fabric`. Both added; compared whitespace-collapsed and case-folded, flagged only
when both sides have a value.

**D. `README.md`** — standard project readme, deliberately excluding all of the above.

---

## 8. Gotchas

**`autoIndex: false` in production.** None of the 40+ `Schema.index(...)` declarations are
applied automatically — they may not exist in the database at all. Run
`node backend/scripts/ensure-indexes.js --dry-run` to find out (ships with package A;
**never yet run**). Read its header first: `syncIndexes()` drops indexes present in the DB
but absent from the schema.

**Serverless tuning is intentional.** `maxPoolSize: 3`, `minPoolSize: 1`, `autoIndex: false`,
connection cached on `global._mongoConnection`. Tuned after Atlas M0 hit connection limits
(`5c7c939`). Don't "modernise" them.

**Token refresh hinges on 401 vs 403.** The axios interceptor only performs the silent
refresh on a **401**, so `middleware/auth.js` returns 401 for an *expired* access token and
403 only for a genuinely invalid one. Return 403 on expiry and the session dies after one
access-token lifetime. Edit TTLs in `authController.js`, nowhere else.

**Denormalised aggregates drift silently.** `VendorBalance`, `ClientBalance`,
`AccessoryBalance`, `Lot.invoicedPcs` and `Lot.manualDispatchedPcs` are caches, not sources
of truth. Every write that affects them must call its recalculation:

| Cache | Call after writing |
|---|---|
| `VendorBalance` | `vendorBalanceService.updateVendorBalance(vendorId, vendorType)` |
| `ClientBalance` | `clientBalanceService.updateClientBalance(clientId)` |
| `AccessoryBalance` | `accessoryService.updateAccessoryBalance(typeId)` |
| `Lot.invoicedPcs` | `invoiceService.recalcLotInvoiced(lotId)` — for **every** affected lot, added and removed, when editing lines |
| `Lot.manualDispatchedPcs` | `invoiceService.recalcLotManualDispatch(lotId)` |

There is **no drift-detection job**. Correctness depends entirely on convention.

**The stage chain is validated, not free-form.** `updateWashing` rejects unless
`Σ washDetails.quantity` equals `stitching.quantity − stitching.quantityShort`.
`updateFinishing` rejects unless `quantity` **exactly equals**
`Σ(washDetails.quantity − quantityShort)` — finishing quantity cannot be set directly, only
its short. `updateStitching` requires thread colours to re-sum to any new quantity, then
cascades downstream via `cascadeShortageFromStitching`. **Each calls `bumpVendorLedgers`, so
editing stage quantities moves vendor money.** Correct production from the top down.

**Washing is schema-asymmetric** — `washDetails[]`, no scalar quantity/rate. See
`vendorBalanceService.getVendorLotsDetails` for reference handling.

**Two different "invoice numbers".** `Lot.invoiceNumber` = numeric upstream/maker bill.
`Invoice.invoiceNumber` = sales-side `INV2627/29`. The lot's is shown on the invoice line as
`lotInvoiceNumberSnapshot` for reference only.

**Invoice snapshots are frozen** by design — editing a Client or Lot does not update past
invoices. Standard accounting practice.

**Duplicate `vendorPayments` key in `apiService.js`** (~line 284 and ~line 632). JS keeps the
second; the first is dead code pointing at `/api/vendor-payment*` URLs that no longer exist
(the real ones are under `/api/vendor-balances/*`). Package A deletes the first. Until then,
**edit the second**.

**PDF uses `Rs.`, not `₹`** — jsPDF's Helvetica has no rupee glyph.

**`xlsx@0.18.5`** is the abandoned npm build (CVE-2023-30533 prototype pollution,
CVE-2024-22363 ReDoS) and it parses an externally-fetched workbook in
`makingsReconService`. Fixing requires the SheetJS CDN, not npm.

**Never commit or echo `.env*`.** The Atlas cluster hosts more than one database — confirm
which one a script targets before running it, and mask passwords in any connection string.

---

## 9. Quick file-jump map

| Looking for | File |
|---|---|
| All Mongoose models | `backend/mongodb_schema.js` |
| Server entry / routes / CORS / Mongo connect | `backend/server.js` |
| LotNumber parsing + range validation | `backend/controllers/stitchingController.js` (top) |
| Zipper consumption hook | `stitchingController.js` (`prepareZipperConsumption`) |
| Shortage cascade | `stitchingController.js` (`cascadeShortageFromStitching`) |
| Final/remaining pcs, FY counter, amount-in-words | `backend/services/invoiceService.js` |
| Dispatch board + manual dispatch | `invoiceService.js` (`getPendingDispatch`, `recalcLotManualDispatch`) |
| Vendor balance denormalisation | `backend/services/vendorBalanceService.js` |
| Client balance denormalisation | `backend/services/clientBalanceService.js` |
| Accessory stock / balance / consumption | `backend/services/accessoryService.js` |
| Workbook download, parse, diff | `backend/services/makingsReconService.js` |
| Redis read-through cache | `backend/services/cache.js` |
| JWT middleware | `backend/middleware/auth.js` |
| Global error handler | `backend/middleware/error.js` |
| Audit log writer | `backend/utils/logger.js` |
| Business requirements | `backend/BRD.MD` (gitignored) |
| All frontend routes and layouts | `frontend/src/App.js` |
| All API calls | `frontend/src/services/apiService.js` |
| Axios base + JWT interceptor | `frontend/src/services/axiosInstance.js` |
| Sales invoice form / list / PDF | `frontend/src/features/Sales/` |
| Dispatch board | `features/Sales/DispatchManagement.js` |
| Notification bell | `components/Navbar/NotificationBell.js` |
| Lot creation UI | `features/Stitching/AddStitchingModal.js` |
| Mobile stitching grid | `features/Stitching/StitchingGridSx.js` |
| Local dev stack | `docker-compose.yml` |

---

## 10. Working agreements

**Architecture**

- Don't revive the Order route. Lot is the entry point.
- Don't change `maxPoolSize`, `autoIndex` or the global connection cache without discussing
  the Atlas M0 constraint.
- Don't edit `frontendv2/`, `bkp/` or `*.zip`.
- New lookups copy the Catalogs triplet. New endpoints go in `apiService.js` under the right
  prefix.
- When touching money: call the matching recalculation, write to the history collection on
  update/delete, and edit the **second** `vendorPayments` block in `apiService.js`.
- Never mutate invoice snapshots after issue. Never generate an invoice number by hand.
- When iterating Washing, check `washDetails[]` rather than scalar fields.

**Decisions already settled — don't re-litigate**

- **Manual dispatch is pieces-only.** It never creates an `Invoice` and never calls
  `clientBalanceService`. Money for those lots was billed outside the system and is carried
  by `ClientBalance.openingBalance`; a balance write would double-count.
- **Quantity corrections happen at source**, in Stitching Management, via the
  `?search=<lotNumber>` deep link. A lot-level `finalPcs` override was built and then
  **deliberately removed** — it created a second source of truth, and the correct fix is
  editing production records (which rightly moves vendor money).
- **Financial writes stay open to any authenticated user.** Only destructive operations are
  admin-gated; locking down day-to-day recording would break staff workflow.
- **Cross-client sales live on the invoice line, not the Lot.** Reassigning by rewriting
  `Lot.clientId` was considered and rejected: it cannot express a *partial* reassignment at
  all, it rewrites history for lots already part-dispatched to the original client, and it
  corrupts every dashboard aggregation keyed on `lot.clientId`. Splitting the lot was also
  rejected — Stitching/Washing/Finishing all hang off `lotId`, so it needs production
  surgery to record a sale.
- **UI:** MUI `Switch` over `ToggleButton` for boolean filters.

**Open items, roughly prioritised**

1. Verify package A's four follow-ups: audit `db.users.find({ role: 'admin' })` for accounts
   created through the registration hole; rotate the MUI X licence key and the committed
   `keyfile.txt` (both sit in 203 commits of history — untracking is not removal); set
   `UPSTASH_REDIS_REST_URL` / `_TOKEN` or rate limiting stays silently disabled; run
   `ensure-indexes.js --dry-run`.
2. **No tests, no CI, no `.github/`.** Money paths first: `vendorBalanceService`,
   `clientBalanceService`, `invoiceService.generateInvoiceNumber`, the shortage cascade.
3. A nightly drift-detection job recomputing the denormalised aggregates from source and
   alerting on mismatch.
4. `xlsx` CVEs (see §8).
5. Fat files: `dashboardController.js` (~1373 lines), `VendorPaymentManagement.js` (~1421).

**Never verified against a live database.** Packages B and C were written without DB access:
the manual-dispatch recalc round-trip, capacity guards and status transitions; the FABRIC
diff against real workbook data; and how the new mobile layouts actually render on a phone.
Everything compiles and the pure logic is unit-tested, but exercise one real lot end-to-end
before trusting it.

**Working style that has fit**

Read the actual code before proposing anything. State assumptions explicitly rather than
asking long question lists, but do ask when a decision is genuinely consequential and hard to
reverse. Deliver complete replacement files in a zip mirroring the repo structure — the
environment is **Windows PowerShell**, so no `<` redirection and no `&&`. Flag clearly what
was verified versus reasoned. Always do mobile alongside desktop.

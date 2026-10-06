import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Stack, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, TablePagination, TableSortLabel,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Chip,
  Card, CardContent, Grid, Menu, useTheme, Divider, Paper, Alert
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, PictureAsPdf as PdfIcon,
  Cancel as CancelIcon, Visibility as ViewIcon,
  MoreVert as MoreVertIcon, Search as SearchIcon,
  ArrowUpward as ArrowUpwardIcon, ArrowDownward as ArrowDownwardIcon,
  DeleteOutline as DeleteIcon, ReceiptLong as TaxInvoiceIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import InvoiceFormModal from './InvoiceFormModal';
import { downloadInvoicePdf, previewInvoicePdf } from './invoicePdfService';
import EllipsisText from '../../components/common/EllipsisText';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '';

const statusColor = (s) => s === 'issued' ? 'success' : s === 'cancelled' ? 'error' : 'default';

// Bills of Supply and Tax Invoices share this grid (separate collections + number series).
// `_docType` comes from the list API; `taxInvoices` on a Bill of Supply row lists any Tax
// Invoice generated from it.
const isTaxRow = (inv) => inv?._docType === 'TAX_INVOICE';
const activeTaxInvoiceOf = (inv) => (inv?.taxInvoices || []).find((t) => t.status === 'issued') || null;
const DOC_TYPE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'BILL_OF_SUPPLY', label: 'Bill of Supply' },
  { value: 'TAX_INVOICE', label: 'Tax Invoice (GST)' }
];
const DocTypeChip = ({ inv }) => (
  <Chip size="small" variant="outlined" color={isTaxRow(inv) ? 'secondary' : 'default'}
    label={isTaxRow(inv) ? 'GST' : 'BoS'}
    sx={{ height: 18, ml: 0.75, verticalAlign: 'middle', '& .MuiChip-label': { px: 0.6, fontSize: '0.65rem', fontWeight: 700 } }} />
);
// One caption linking the two documents: "→ TI INV2627/43" on a BoS, "from INV2627/36" on a TI.
const linkCaption = (inv) => {
  if (isTaxRow(inv)) return inv.sourceInvoiceNumber ? `from ${inv.sourceInvoiceNumber}` : '';
  const ti = activeTaxInvoiceOf(inv);
  return ti ? `→ TI ${ti.invoiceNumber}` : '';
};

// Columns the list can be sorted by (shared: desktop header labels + mobile sort dropdown).
const SORT_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'invoice', label: 'Invoice #' },
  { key: 'client', label: 'Client' },
  { key: 'totalQty', label: 'Total Qty' }
];

// Unique lot numbers involved in an invoice, in first-seen order. Covers both single-lot lines
// (lotNumberSnapshot) and merged/combined lines (each source carries its own lotNumberSnapshot).
const lotsForInvoice = (inv) => {
  const out = [];
  const seen = new Set();
  const add = (n) => { if (n && !seen.has(n)) { seen.add(n); out.push(n); } };
  for (const line of (inv.lines || [])) {
    if (Array.isArray(line.sources) && line.sources.length > 0) {
      line.sources.forEach((s) => add(s.lotNumberSnapshot));
    } else {
      add(line.lotNumberSnapshot);
    }
  }
  return out;
};

// Table cell: show up to two lot #s inline; if more, a "+N" chip whose tooltip lists them all.
const LotsCell = ({ lots, center }) => {
  if (!lots.length) return <Typography variant="body2" color="text.secondary">—</Typography>;
  const shown = lots.slice(0, 2);
  const extra = lots.length - shown.length;
  // Match the surrounding cell's font (inherit) rather than the small-chip default, so lot #s
  // read at the same size as the other columns.
  const chipSx = { height: 22, '& .MuiChip-label': { px: 0.6, fontSize: 'inherit' } };
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" useFlexGap flexWrap="wrap"
      justifyContent={center ? 'center' : 'flex-start'}>
      {shown.map((l) => (
        <Chip key={l} size="small" variant="outlined" label={l} sx={chipSx} />
      ))}
      {extra > 0 && (
        <Tooltip title={<span>All lots: {lots.join(', ')}</span>}>
          <Chip size="small" color="primary" variant="filled" label={`+${extra}`} sx={{ ...chipSx, cursor: 'default' }} />
        </Tooltip>
      )}
    </Stack>
  );
};

function InvoiceManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filters, setFilters] = useState({ clientId: '', status: '', search: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [modalOpen, setModalOpen] = useState(false);
  const [editInvoice, setEditInvoice] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuInvoiceId, setMenuInvoiceId] = useState(null);
  const [total, setTotal] = useState(0);
  const [appliedSearch, setAppliedSearch] = useState(''); // committed search term (on Enter / Search click)
  const [sortBy, setSortBy] = useState('date');           // default: date (calendar day, time ignored) desc, then invoice # desc
  const [sortDir, setSortDir] = useState('desc');
  const [cancelReason, setCancelReason] = useState('');
  const [docType, setDocType] = useState('ALL');           // ALL | BILL_OF_SUPPLY | TAX_INVOICE
  const [taxSource, setTaxSource] = useState(null);         // Bill of Supply a Tax Invoice is generated from
  const [editTaxInvoice, setEditTaxInvoice] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [blockedNotice, setBlockedNotice] = useState(''); // why a cancel/delete isn't allowed yet

  // Edit / cancel are admin-only on the server (routes/salesInvoices.js). Mirror it here so
  // non-admins see disabled actions instead of a 403 after clicking. Same localStorage
  // source App.js's ProtectedRoute reads.
  const isAdmin = (() => {
    try { return JSON.parse(localStorage.getItem('user'))?.role === 'admin'; } catch (e) { return false; }
  })();

  const load = () => {
    setLoading(true);
    apiService.salesInvoices
      .listInvoices({
        documentType: docType !== 'ALL' ? docType : undefined,
        clientId: filters.clientId || undefined,
        status: filters.status || undefined,
        search: appliedSearch || undefined,
        page,
        limit: rowsPerPage,
        sortBy,
        sortDir
      })
      .then((res) => { setInvoices(res.rows || []); setTotal(res.total || 0); })
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    apiService.client.getClients('').then(setClients).catch(() => {});
    apiService.companySettings.getSettings().then(setSettings).catch(() => {});
  }, []);

  // Server-side: reload whenever a filter, the committed search, sort, or the page/size changes.
  useEffect(() => { load(); /* eslint-disable-next-line */ },
    [filters.clientId, filters.status, docType, appliedSearch, page, rowsPerPage, sortBy, sortDir]);

  // Commit the typed search term (also resets to the first page).
  const applySearch = () => { setPage(0); setAppliedSearch(filters.search.trim()); };
  const handleSearch = (e) => { if (e.key === 'Enter') applySearch(); };
  // Typing in the search box; if it's cleared, immediately drop the committed search (no extra
  // click needed) so the list returns to unfiltered.
  const handleSearchChange = (v) => {
    setFilters((f) => ({ ...f, search: v }));
    if (v.trim() === '' && appliedSearch !== '') { setPage(0); setAppliedSearch(''); }
  };

  // Toggle direction when re-clicking the active column; otherwise activate it with a sensible
  // default (desc for date/qty, asc for text). Always jump back to the first page.
  const handleSort = (col) => {
    setPage(0);
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'date' || col === 'totalQty' ? 'desc' : 'asc');
    }
  };

  const resetModal = () => { setEditInvoice(null); setTaxSource(null); setEditTaxInvoice(null); };
  const handleNew = () => { resetModal(); setModalOpen(true); };
  const handleEdit = async (inv) => {
    resetModal();
    if (!isTaxRow(inv)) { setEditInvoice(inv); setModalOpen(true); return; }
    try {
      setEditTaxInvoice(await apiService.taxInvoices.getById(inv._id));
      setModalOpen(true);
    } catch (e) { showSnackbar(e); }
  };
  // "Generate Tax Invoice": the form opens prefilled from the full Bill of Supply.
  const handleGenerateTax = async (inv) => {
    resetModal();
    try {
      setTaxSource(await apiService.salesInvoices.getInvoiceById(inv._id));
      setModalOpen(true);
    } catch (e) { showSnackbar(e); }
  };
  const handleSaved = () => { load(); };

  const closeCancel = () => { setCancelTarget(null); setCancelReason(''); };

  // A Bill of Supply drives the business; its Tax Invoice must be cancelled/deleted first.
  const requestCancel = (inv) => {
    const ti = !isTaxRow(inv) && activeTaxInvoiceOf(inv);
    if (ti) {
      setBlockedNotice(`Tax Invoice ${ti.invoiceNumber} was generated from ${inv.invoiceNumber}. Cancel or delete that Tax Invoice first, then cancel this Bill of Supply.`);
      return;
    }
    setCancelTarget(inv);
  };

  // Delete only the latest number of a series, Tax Invoice before its Bill of Supply. A Bill of
  // Supply whose Tax Invoice was cancelled (kept on record) can only be cancelled.
  const requestDelete = (inv) => {
    if (!isTaxRow(inv)) {
      const anyTi = (inv.taxInvoices || [])[0];
      if (anyTi) {
        setBlockedNotice(anyTi.status === 'cancelled'
          ? `Tax Invoice ${anyTi.invoiceNumber} (cancelled) was generated from ${inv.invoiceNumber}, so this Bill of Supply can only be cancelled.`
          : `Delete Tax Invoice ${anyTi.invoiceNumber} first — it was generated from ${inv.invoiceNumber}.`);
        return;
      }
    }
    if (!inv.canDelete) {
      setBlockedNotice(isTaxRow(inv) && inv.status === 'cancelled'
        ? `${inv.invoiceNumber} is cancelled — cancelled Tax Invoices are kept on record.`
        : `Only the most recently issued number can be deleted. Cancel ${inv.invoiceNumber} instead — it keeps its number.`);
      return;
    }
    setDeleteTarget(inv);
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    setLoading(true);
    const req = isTaxRow(deleteTarget)
      ? apiService.taxInvoices.delete(deleteTarget._id)
      : apiService.salesInvoices.deleteInvoice(deleteTarget._id);
    req
      .then(() => { showSnackbar(`${deleteTarget.invoiceNumber} deleted`, 'success'); setDeleteTarget(null); load(); })
      .catch((e) => { showSnackbar(e); setLoading(false); });
  };

  const handleCancel = () => {
    if (!cancelTarget || cancelReason.trim().length < 3) return;
    setLoading(true);
    const req = isTaxRow(cancelTarget)
      ? apiService.taxInvoices.cancel(cancelTarget._id, cancelReason.trim())
      : apiService.salesInvoices.cancelInvoice(cancelTarget._id, cancelReason.trim());
    req
      .then(() => {
        showSnackbar('Invoice cancelled', 'success');
        closeCancel();
        load();
      })
      .catch((e) => { showSnackbar(e); setLoading(false); });
  };

  // Full document for the PDF. Tax Invoices are flagged so the PDF service uses the GST layout.
  const fetchFull = async (inv) => (isTaxRow(inv)
    ? { ...(await apiService.taxInvoices.getById(inv._id)), _docType: 'TAX_INVOICE' }
    : apiService.salesInvoices.getInvoiceById(inv._id));

  const handlePdf = async (inv) => {
    try {
      const full = await fetchFull(inv);
      await downloadInvoicePdf(full, settings);
    } catch (e) { showSnackbar(e); }
  };

  const handlePreview = async (inv) => {
    try {
      const full = await fetchFull(inv);
      const result = await previewInvoicePdf(full, settings);
      setPreviewUrl(result?.url || null);
    } catch (e) { showSnackbar(e); }
  };

  const handleMenuOpen = (e, invId) => {
    setMenuAnchorEl(e.currentTarget);
    setMenuInvoiceId(invId);
  };
  const handleMenuClose = () => { setMenuAnchorEl(null); setMenuInvoiceId(null); };

  const pagedInvoices = invoices; // server already returns just this page

  // ── Filter row ──────────────────────────────────────────────────────────
  // Desktop: horizontal Stack. Mobile: 6/6 grid for Client+Status, then 6/6
  // for Search field + (search/new) icon buttons. Refresh icon removed —
  // hitting the search button (or Enter in the field) reloads the same way.
  const filterRow = isMobile ? (
    <Grid container spacing={1.2} sx={{ alignItems: 'flex-end' }}>
      <Grid size={{ xs: 6 }}>
        <TextField
          select label="Client" value={filters.clientId}
          onChange={(e) => { setPage(0); setFilters({ ...filters, clientId: e.target.value }); }}
          fullWidth variant="standard"
        >
          <MenuItem value="">All clients</MenuItem>
          {clients.map((c) => (
            <MenuItem key={c._id} value={c._id}>{c.name} ({c.clientCode})</MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <TextField
          select label="Status" value={filters.status}
          onChange={(e) => { setPage(0); setFilters({ ...filters, status: e.target.value }); }}
          fullWidth variant="standard"
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="issued">Issued</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
      </Grid>
      <Grid size={{ xs: 3 }}>
        <TextField
          select label="Type" value={docType}
          onChange={(e) => { setPage(0); setDocType(e.target.value); }}
          fullWidth variant="standard"
        >
          {DOC_TYPE_FILTERS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
      </Grid>
      <Grid size={{ xs: 8 }}>
        <TextField
          select label="Sort by" value={sortBy}
          onChange={(e) => { setPage(0); setSortBy(e.target.value); }}
          fullWidth variant="standard"
        >
          {SORT_COLUMNS.map((c) => (
            <MenuItem key={c.key} value={c.key}>{c.label}</MenuItem>
          ))}
        </TextField>
      </Grid>
      <Grid size={{ xs: 4 }} sx={{ display: 'flex', alignItems: 'flex-end' }}>
        <Button
          fullWidth variant="outlined" size="small"
          startIcon={sortDir === 'asc' ? <ArrowUpwardIcon /> : <ArrowDownwardIcon />}
          onClick={() => { setPage(0); setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); }}
        >
          {sortDir === 'asc' ? 'Asc' : 'Desc'}
        </Button>
      </Grid>
      <Grid size={{ xs: 6 }}>
        <TextField
          label="Search"
          value={filters.search}
          onChange={(e) => handleSearchChange(e.target.value)}
          onKeyDown={handleSearch}
          fullWidth variant="standard"
          placeholder="invoice #, client, lot #"
        />
      </Grid>
      <Grid size={{ xs: 6 }}>
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
          <Button variant="contained" startIcon={<SearchIcon />} onClick={applySearch} disabled={loading} sx={{ whiteSpace: 'nowrap', float: 'left' }}>
            Search
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew} sx={{ whiteSpace: 'nowrap' }}>
            New
          </Button>
        </Stack>
      </Grid>
    </Grid>
  ) : (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: 'flex-end' }}
    >
      <TextField
        select label="Client" value={filters.clientId}
        onChange={(e) => { setPage(0); setFilters({ ...filters, clientId: e.target.value }); }}
        sx={{ minWidth: 220 }} variant="standard"
      >
        <MenuItem value="">All clients</MenuItem>
        {clients.map((c) => (
          <MenuItem key={c._id} value={c._id}>{c.name} ({c.clientCode})</MenuItem>
        ))}
      </TextField>
      <TextField
        select label="Status" value={filters.status}
        onChange={(e) => { setPage(0); setFilters({ ...filters, status: e.target.value }); }}
        sx={{ minWidth: 160 }} variant="standard"
      >
        <MenuItem value="">All</MenuItem>
        <MenuItem value="issued">Issued</MenuItem>
        <MenuItem value="cancelled">Cancelled</MenuItem>
        <MenuItem value="draft">Draft</MenuItem>
      </TextField>
      <TextField
        select label="Type" value={docType}
        onChange={(e) => { setPage(0); setDocType(e.target.value); }}
        sx={{ minWidth: 170 }} variant="standard"
      >
        {DOC_TYPE_FILTERS.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
      </TextField>
      <TextField
        label="Search (invoice #, client, lot #)"
        value={filters.search}
        onChange={(e) => handleSearchChange(e.target.value)}
        onKeyDown={handleSearch}
        sx={{ flexGrow: 1 }} variant="standard"
      />
      <Button variant="contained" startIcon={<SearchIcon />} onClick={applySearch} disabled={loading} sx={{ whiteSpace: 'nowrap' }}>
        Search
      </Button>
      <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew} sx={{ whiteSpace: 'nowrap' }}>
        New Invoice
      </Button>
    </Stack>
  );

  // ── Mobile card list ───────────────────────────────────────────────────
  const mobileList = (
    <Box>
      {loading ? (
        <Typography align="center" sx={{ py: 4 }}>Loading…</Typography>
      ) : pagedInvoices.length === 0 ? (
        <Typography align="center" sx={{ py: 4 }} color="text.secondary">No invoices</Typography>
      ) : pagedInvoices.map((inv) => (
        <Card
          key={inv._id}
          variant="outlined"
          sx={{ p: 1.3, mb: 1.5 }}
        >
          <CardContent sx={{ '&:last-child': { pb: 1.5 }, p: 1 }}>
            <Grid container spacing={1} alignItems="center">
              <Grid size={{ xs: 7 }} sx={{ textAlign: 'left' }}>
                <Typography variant="subtitle1" fontWeight="bold">
                  {inv.invoiceNumber}
                  <DocTypeChip inv={inv} />
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {fmtDate(inv.date)}{linkCaption(inv) ? ` · ${linkCaption(inv)}` : ''}
                </Typography>
              </Grid>
              <Grid size={{ xs: 3 }} sx={{ textAlign: 'right' }}>
                <Chip size="small" sx={{ width: '100%' }} label={inv.status.toUpperCase()} color={statusColor(inv.status)} variant="filled" />
              </Grid>
              <Grid size={{ xs: 2 }} sx={{ textAlign: 'right' }}>
                <IconButton size="small" onClick={(e) => handleMenuOpen(e, inv._id)} sx={{ p: 0.5 }}>
                  <MoreVertIcon fontSize="small" />
                </IconButton>
                <Menu
                  anchorEl={menuAnchorEl}
                  open={Boolean(menuAnchorEl) && menuInvoiceId === inv._id}
                  onClose={handleMenuClose}
                  slotProps={{
                    paper: { sx: { boxShadow: theme.shadows[3] } },
                    list: { sx: { py: 0 } }
                  }}
                >
                  <MenuItem dense divider onClick={() => { handlePreview(inv); handleMenuClose(); }}>
                    <ViewIcon fontSize="small" sx={{ mr: 1 }} /> Preview PDF
                  </MenuItem>
                  <MenuItem dense divider onClick={() => { handlePdf(inv); handleMenuClose(); }}>
                    <PdfIcon fontSize="small" sx={{ mr: 1 }} /> Download PDF
                  </MenuItem>
                  <MenuItem
                    dense divider
                    disabled={!isAdmin || inv.status === 'cancelled'}
                    onClick={() => { handleEdit(inv); handleMenuClose(); }}
                  >
                    <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
                  </MenuItem>
                  {!isTaxRow(inv) && (
                    <MenuItem
                      dense divider
                      disabled={inv.status !== 'issued' || !!activeTaxInvoiceOf(inv)}
                      onClick={() => { handleGenerateTax(inv); handleMenuClose(); }}
                    >
                      <TaxInvoiceIcon fontSize="small" sx={{ mr: 1 }} /> Generate Tax Invoice
                    </MenuItem>
                  )}
                  <MenuItem
                    dense divider
                    disabled={!isAdmin || inv.status === 'cancelled'}
                    onClick={() => { requestCancel(inv); handleMenuClose(); }}
                  >
                    <CancelIcon fontSize="small" sx={{ mr: 1 }} /> Cancel
                  </MenuItem>
                  <MenuItem
                    dense
                    disabled={!isAdmin || !inv.isLatestInSeries}
                    onClick={() => { requestDelete(inv); handleMenuClose(); }}
                  >
                    <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
                  </MenuItem>
                </Menu>
              </Grid>
            </Grid>

            <Grid container spacing={1} sx={{ mt: 0.5, textAlign: 'center' }}>
              <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                <Typography variant="caption" color="text.secondary">Client</Typography>
                <Typography variant="body2">{inv.clientSnapshot?.name || inv.clientId?.name || '—'}</Typography>
                {inv.clientSnapshot?.billingName && inv.clientSnapshot.billingName !== inv.clientSnapshot?.name && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {inv.clientSnapshot.billingName}
                  </Typography>
                )}
              </Grid>
              <Grid size={{ xs: 3 }}>
                <Typography variant="caption" color="text.secondary">Qty</Typography>
                <Typography variant="body2">{inv.totalQty}</Typography>
              </Grid>
              <Grid size={{ xs: 3 }} sx={{ textAlign: 'right' }}>
                <Typography variant="caption" color="text.secondary">Total</Typography>
                <Typography variant="body2" fontWeight="bold">{fmtINR(inv.total)}</Typography>
              </Grid>
            </Grid>

            {lotsForInvoice(inv).length > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>Lot(s)</Typography>
                <LotsCell lots={lotsForInvoice(inv)} />
              </Box>
            )}
          </CardContent>
        </Card>
      ))}
      {pagedInvoices.length > 0 && (
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setPage(0); setRowsPerPage(parseInt(e.target.value, 10)); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      )}
    </Box>
  );

  // ── Desktop table ──────────────────────────────────────────────────────
  const desktopTable = (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sortBy === 'date' ? sortDir : false}>
              <TableSortLabel active={sortBy === 'date'} direction={sortBy === 'date' ? sortDir : 'asc'} onClick={() => handleSort('date')}>Date</TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortBy === 'invoice' ? sortDir : false}>
              <TableSortLabel active={sortBy === 'invoice'} direction={sortBy === 'invoice' ? sortDir : 'asc'} onClick={() => handleSort('invoice')}>Invoice #</TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortBy === 'client' ? sortDir : false}>
              <TableSortLabel active={sortBy === 'client'} direction={sortBy === 'client' ? sortDir : 'asc'} onClick={() => handleSort('client')}>Client</TableSortLabel>
            </TableCell>
            <TableCell>Firm</TableCell>
            <TableCell align="center" sx={{ width: 160 }}>Lot(s)</TableCell>
            <TableCell align="right" sx={{ width: 120 }} sortDirection={sortBy === 'totalQty' ? sortDir : false}>
              <TableSortLabel active={sortBy === 'totalQty'} direction={sortBy === 'totalQty' ? sortDir : 'asc'} onClick={() => handleSort('totalQty')}>Total Qty</TableSortLabel>
            </TableCell>
            <TableCell align="right">Total (₹)</TableCell>
            <TableCell align="center">Status</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={9} align="center">Loading…</TableCell></TableRow>
          ) : pagedInvoices.length === 0 ? (
            <TableRow><TableCell colSpan={9} align="center">No invoices</TableCell></TableRow>
          ) : pagedInvoices.map((inv) => (
            <TableRow key={inv._id} hover>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(inv.date)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <b>{inv.invoiceNumber}</b><DocTypeChip inv={inv} />
                {linkCaption(inv) && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{linkCaption(inv)}</Typography>
                )}
              </TableCell>
              <TableCell sx={{ maxWidth: 200 }}>
                <EllipsisText text={inv.clientSnapshot?.name || inv.clientId?.name} />
              </TableCell>
              <TableCell sx={{ maxWidth: 180 }}>
                <EllipsisText text={inv.clientSnapshot?.billingName || '—'} />
              </TableCell>
              <TableCell align="left"><LotsCell lots={lotsForInvoice(inv)} left /></TableCell>
              <TableCell align="right">{inv.totalQty}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>₹{fmtINR(inv.total)}</TableCell>
              <TableCell align="center">
                <Chip size="small" label={inv.status.toUpperCase()} color={statusColor(inv.status)} variant="filled" />
              </TableCell>
              <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                <Box sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center' }}>
                  <Tooltip title="Preview PDF"><span>
                    <IconButton size="small" onClick={() => handlePreview(inv)}><ViewIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Download PDF"><span>
                    <IconButton size="small" onClick={() => handlePdf(inv)}><PdfIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title={isAdmin ? 'Edit' : 'Edit (admins only)'}><span>
                    <IconButton size="small" disabled={!isAdmin || inv.status === 'cancelled'} onClick={() => handleEdit(inv)}><EditIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  {!isTaxRow(inv) && (
                    <Tooltip title={activeTaxInvoiceOf(inv) ? `Tax Invoice ${activeTaxInvoiceOf(inv).invoiceNumber} exists` : 'Generate Tax Invoice'}><span>
                      <IconButton size="small" disabled={inv.status !== 'issued' || !!activeTaxInvoiceOf(inv)} onClick={() => handleGenerateTax(inv)}><TaxInvoiceIcon fontSize="small" /></IconButton>
                    </span></Tooltip>
                  )}
                  <Tooltip title={isAdmin ? 'Cancel' : 'Cancel (admins only)'}><span>
                    <IconButton size="small" disabled={!isAdmin || inv.status === 'cancelled'} onClick={() => requestCancel(inv)}><CancelIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title={!isAdmin ? 'Delete (admins only)' : (inv.isLatestInSeries ? 'Delete' : 'Only the latest number can be deleted')}><span>
                    <IconButton size="small" disabled={!isAdmin || !inv.isLatestInSeries} onClick={() => requestDelete(inv)}><DeleteIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                </Box>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setPage(0); setRowsPerPage(parseInt(e.target.value, 10)); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </TableContainer>
  );

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <Typography variant="h4" sx={{ mb: 1 }}>Sales Invoices</Typography>

      <Paper sx={{
        p: { xs: 1.5, md: 2 }, mb: 2,
      }}>
        {filterRow}
      </Paper>

      <Paper sx={{
        p: { xs: 1, md: 2 },
      }}>
        {isMobile ? mobileList : desktopTable}
      </Paper>

      <InvoiceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); resetModal(); }}
        onSaved={handleSaved}
        editInvoice={editInvoice}
        taxSource={taxSource}
        editTaxInvoice={editTaxInvoice}
      />

      <Dialog open={!!cancelTarget} onClose={closeCancel} fullWidth maxWidth="xs">
        <DialogTitle>Cancel {isTaxRow(cancelTarget) ? 'Tax Invoice' : 'invoice'} {cancelTarget?.invoiceNumber}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {isTaxRow(cancelTarget)
              ? 'The Tax Invoice will be marked cancelled. Stock and balances are unaffected — they follow the Bill of Supply, which can then generate a new Tax Invoice. The number stays used.'
              : "The invoice will be marked cancelled and its lots' pcs returned to the available pool. The number stays used, so the series has no gap. This cannot be undone (you'd need to create a new invoice)."}
          </Typography>
          <TextField
            label="Reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            fullWidth multiline minRows={2} variant="standard" autoFocus
            helperText="Required — saved with the invoice"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCancel}>Keep</Button>
          <Button color="error" variant="contained" onClick={handleCancel}
            disabled={loading || cancelReason.trim().length < 3}>
            Cancel Invoice
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!blockedNotice} onClose={() => setBlockedNotice('')} fullWidth maxWidth="xs">
        <DialogTitle>Not allowed yet</DialogTitle>
        <DialogContent><Alert severity="warning">{blockedNotice}</Alert></DialogContent>
        <DialogActions><Button onClick={() => setBlockedNotice('')}>OK</Button></DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete {isTaxRow(deleteTarget) ? 'Tax Invoice' : 'Bill of Supply'} {deleteTarget?.invoiceNumber}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {isTaxRow(deleteTarget)
              ? 'The Tax Invoice is removed and its number is reissued to the next Tax Invoice. Its Bill of Supply is not touched.'
              : "The Bill of Supply is removed, its lots' pcs return to the available pool and its number is reissued to the next Bill of Supply."}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Keep</Button>
          <Button color="error" variant="contained" onClick={handleDelete} disabled={loading}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Invoice Preview</DialogTitle>
        <DialogContent sx={{ height: isMobile ? '70vh' : '80vh', p: 0 }}>
          {previewUrl && <iframe title="invoice-preview" src={previewUrl} style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default InvoiceManagement;

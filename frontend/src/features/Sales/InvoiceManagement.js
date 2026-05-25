import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Stack, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, TablePagination,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Chip
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, PictureAsPdf as PdfIcon,
  Cancel as CancelIcon, Refresh as RefreshIcon, Visibility as ViewIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import InvoiceFormModal from './InvoiceFormModal';
import { downloadInvoicePdf, previewInvoicePdf } from './invoicePdfService';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '';

const statusColor = (s) => s === 'issued' ? 'success' : s === 'cancelled' ? 'error' : 'default';

function InvoiceManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
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

  const load = () => {
    setLoading(true);
    apiService.salesInvoices
      .listInvoices({
        clientId: filters.clientId || undefined,
        status: filters.status || undefined,
        search: filters.search || undefined
      })
      .then(setInvoices)
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    apiService.client.getClients('').then(setClients).catch(() => {});
    apiService.companySettings.getSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.clientId, filters.status]);

  const handleSearch = (e) => {
    if (e.key === 'Enter') load();
  };

  const handleNew = () => { setEditInvoice(null); setModalOpen(true); };
  const handleEdit = (inv) => { setEditInvoice(inv); setModalOpen(true); };
  const handleSaved = () => { load(); };

  const handleCancel = () => {
    if (!cancelTarget) return;
    setLoading(true);
    apiService.salesInvoices.cancelInvoice(cancelTarget._id)
      .then(() => {
        showSnackbar('Invoice cancelled', 'success');
        setCancelTarget(null);
        load();
      })
      .catch((e) => { showSnackbar(e); setLoading(false); });
  };

  const handlePdf = async (inv) => {
    try {
      // We have most of the invoice already; but listInvoices may not include lines.
      // Fetch the full doc so the PDF has line items and snapshots.
      const full = await apiService.salesInvoices.getInvoiceById(inv._id);
      await downloadInvoicePdf(full, settings);
    } catch (e) { showSnackbar(e); }
  };

  const handlePreview = async (inv) => {
    try {
      const full = await apiService.salesInvoices.getInvoiceById(inv._id);
      const result = await previewInvoicePdf(full, settings);
      setPreviewUrl(result?.url || null);
    } catch (e) { showSnackbar(e); }
  };

  const pagedInvoices = invoices.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Sales Invoices</Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2, alignItems: { md: 'flex-end' } }}>
        <TextField
          select label="Client" value={filters.clientId}
          onChange={(e) => setFilters({ ...filters, clientId: e.target.value })}
          sx={{ minWidth: 220 }} variant="standard"
        >
          <MenuItem value="">All clients</MenuItem>
          {clients.map((c) => (
            <MenuItem key={c._id} value={c._id}>{c.name} ({c.clientCode})</MenuItem>
          ))}
        </TextField>
        <TextField
          select label="Status" value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          sx={{ minWidth: 160 }} variant="standard"
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="issued">Issued</MenuItem>
          <MenuItem value="cancelled">Cancelled</MenuItem>
          <MenuItem value="draft">Draft</MenuItem>
        </TextField>
        <TextField
          label="Search (invoice #, client, lot #)"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          onKeyDown={handleSearch}
          sx={{ flexGrow: 1 }} variant="standard"
        />
        <Button onClick={load} disabled={loading}>Search</Button>
        <IconButton onClick={load} disabled={loading} title="Refresh"><RefreshIcon /></IconButton>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNew} sx={{ whiteSpace: 'nowrap' }}>
          New Invoice
        </Button>
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Invoice #</TableCell>
              <TableCell>Client</TableCell>
              <TableCell align="right">Total Qty</TableCell>
              <TableCell align="right">Total (Rs.)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} align="center">Loading…</TableCell></TableRow>
            ) : pagedInvoices.length === 0 ? (
              <TableRow><TableCell colSpan={7} align="center">No invoices</TableCell></TableRow>
            ) : pagedInvoices.map((inv) => (
              <TableRow key={inv._id} hover>
                <TableCell>{fmtDate(inv.date)}</TableCell>
                <TableCell><b>{inv.invoiceNumber}</b></TableCell>
                <TableCell>{inv.clientSnapshot?.name || inv.clientId?.name}</TableCell>
                <TableCell align="right">{inv.totalQty}</TableCell>
                <TableCell align="right">{fmtINR(inv.total)}</TableCell>
                <TableCell>
                  <Chip size="small" label={inv.status} color={statusColor(inv.status)} variant="outlined" />
                </TableCell>
                <TableCell align="center">
                  <Tooltip title="Preview PDF"><span>
                    <IconButton size="small" onClick={() => handlePreview(inv)}><ViewIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Download PDF"><span>
                    <IconButton size="small" onClick={() => handlePdf(inv)}><PdfIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Edit"><span>
                    <IconButton size="small" disabled={inv.status === 'cancelled'} onClick={() => handleEdit(inv)}><EditIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Cancel"><span>
                    <IconButton size="small" disabled={inv.status === 'cancelled'} onClick={() => setCancelTarget(inv)}><CancelIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={invoices.length}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => setRowsPerPage(parseInt(e.target.value, 10))}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      </TableContainer>

      <InvoiceFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
        editInvoice={editInvoice}
      />

      <Dialog open={!!cancelTarget} onClose={() => setCancelTarget(null)}>
        <DialogTitle>Cancel invoice {cancelTarget?.invoiceNumber}?</DialogTitle>
        <DialogContent>
          The invoice will be marked cancelled and its lots' pcs returned to the available pool. This cannot be undone (you'd need to create a new invoice).
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelTarget(null)}>Keep</Button>
          <Button color="error" variant="contained" onClick={handleCancel}>Cancel Invoice</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!previewUrl} onClose={() => setPreviewUrl(null)} maxWidth="lg" fullWidth>
        <DialogTitle>Invoice Preview</DialogTitle>
        <DialogContent sx={{ height: '80vh', p: 0 }}>
          {previewUrl && <iframe title="invoice-preview" src={previewUrl} style={{ width: '100%', height: '100%', border: 0 }} />}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewUrl(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default InvoiceManagement;

import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Grid, Paper, Typography, Stack, Button, IconButton, Divider, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, TextField,
  InputAdornment, List, ListItemButton, ListItemText, Tooltip,
  Card, CardContent, Menu, useTheme
} from '@mui/material';
import {
  Refresh as RefreshIcon, Payments as PaymentsIcon, Discount as AdjustmentIcon,
  Edit as EditIcon, Delete as DeleteIcon, AccountBalanceWallet as OpeningIcon,
  ArrowBack as ArrowBackIcon, MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import EllipsisText from '../../components/common/EllipsisText';

const fmtINR = (n) => 'Rs. ' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);
const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '';

const paymentModeOptions = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' }
];

function ClientPaymentManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [clientsWithBalance, setClientsWithBalance] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [ledger, setLedger] = useState({ invoices: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [paymentDialog, setPaymentDialog] = useState({ open: false, type: 'payment', editing: null });
  const [openingDialog, setOpeningDialog] = useState({ open: false, value: 0 });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Mobile drill-down: list view OR ledger view (not both).
  // On mobile, don't auto-select first client — keep the list visible until user taps a row.
  const [mobileLedgerOpen, setMobileLedgerOpen] = useState(false);

  // Per-row action menu (mobile ledger Cards)
  const [rowMenuAnchorEl, setRowMenuAnchorEl] = useState(null);
  const [rowMenuRow, setRowMenuRow] = useState(null);

  const loadClients = () => {
    setLoading(true);
    apiService.clientPayments.getClientsWithBalance()
      .then((data) => {
        setClientsWithBalance(data);
        if (selectedClient) {
          const refreshed = data.find((c) => c._id === selectedClient._id);
          if (refreshed) setSelectedClient(refreshed);
        } else if (!isMobile && data.length > 0) {
          // Desktop only: auto-select the first client so the right panel isn't empty.
          setSelectedClient(data[0]);
        }
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  };

  const loadLedger = (clientId) => {
    if (!clientId) return;
    apiService.clientPayments.getClientLedger(clientId)
      .then(setLedger)
      .catch((e) => showSnackbar(e));
  };

  useEffect(() => { loadClients(); /* eslint-disable-next-line */ }, []);
  useEffect(() => { selectedClient && loadLedger(selectedClient._id); }, [selectedClient?._id]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clientsWithBalance;
    const s = search.toLowerCase();
    return clientsWithBalance.filter((c) =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.clientCode || '').toLowerCase().includes(s)
    );
  }, [clientsWithBalance, search]);

  const handleSelectClient = (c) => {
    setSelectedClient(c);
    if (isMobile) setMobileLedgerOpen(true);
  };

  const handleBackToList = () => {
    setMobileLedgerOpen(false);
  };

  const handleOpenPayment = (type, editing = null) => {
    setPaymentDialog({ open: true, type, editing });
  };

  const handleSubmitPayment = (form) => {
    const payload = {
      clientId: selectedClient._id,
      paymentScope: form.invoiceId ? 'invoice' : 'client',
      invoiceId: form.invoiceId || undefined,
      amount: Number(form.amount),
      paymentDate: form.paymentDate.toISOString(),
      paymentMode: form.paymentMode,
      referenceNumber: form.referenceNumber,
      notes: form.notes
    };
    const req = paymentDialog.editing
      ? apiService.clientPayments.updatePaymentEntry(paymentDialog.editing._id, payload)
      : (paymentDialog.type === 'adjustment'
          ? apiService.clientPayments.addClientAdjustment(payload)
          : apiService.clientPayments.addClientPayment(payload));
    req
      .then(() => {
        showSnackbar('Saved', 'success');
        setPaymentDialog({ open: false, type: 'payment', editing: null });
        loadClients();
        loadLedger(selectedClient._id);
      })
      .catch((e) => showSnackbar(e));
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    apiService.clientPayments.deletePaymentEntry(deleteTarget._id)
      .then(() => {
        showSnackbar('Deleted', 'success');
        setDeleteTarget(null);
        loadClients();
        loadLedger(selectedClient._id);
      })
      .catch((e) => showSnackbar(e));
  };

  const handleSetOpening = () => {
    apiService.clientPayments.setOpeningBalance(selectedClient._id, openingDialog.value)
      .then(() => {
        showSnackbar('Opening balance updated', 'success');
        setOpeningDialog({ open: false, value: 0 });
        loadClients();
        loadLedger(selectedClient._id);
      })
      .catch((e) => showSnackbar(e));
  };

  const balance = selectedClient?.balance;

  const ledgerRows = useMemo(() => {
    const rows = [];
    (ledger.invoices || []).forEach((inv) => {
      rows.push({
        type: 'invoice',
        date: inv.date,
        ref: inv.invoiceNumber,
        description: `Invoice (${inv.lines?.length || 0} lines, ${inv.totalQty} pcs)`,
        debit: inv.total,
        credit: 0,
        balanceImpact: inv.total,
        raw: inv
      });
    });
    (ledger.payments || []).forEach((p) => {
      const isAdj = p.paymentType === 'adjustment';
      rows.push({
        type: isAdj ? 'adjustment' : 'payment',
        date: p.paymentDate,
        ref: p.invoiceId?.invoiceNumber || (p.paymentScope === 'client' ? 'Lump sum' : ''),
        description: `${isAdj ? 'Adjustment' : 'Payment'}${p.paymentMode ? ' (' + p.paymentMode.toUpperCase() + ')' : ''}${p.referenceNumber ? ' · ' + p.referenceNumber : ''}${p.notes ? ' — ' + p.notes : ''}`,
        debit: 0,
        credit: p.amount,
        balanceImpact: -p.amount,
        raw: p
      });
    });
    return rows.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [ledger]);

  // ── Client list (left panel / mobile main view) ──────────────────────
  const clientListPanel = (
    <Paper sx={{
      p: 1.5,
      display: 'flex',
      flexDirection: 'column',
      flex: { xs: '1 1 auto', md: '0 0 280px' },
      minHeight: 0,
      height: { xs: 'calc(100vh - 180px)', md: 'auto' },
    }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1, flexShrink: 0 }}>
        <TextField
          size="small" fullWidth variant="standard" placeholder="Search clients"
          value={search} onChange={(e) => setSearch(e.target.value)}
        />
        <IconButton onClick={loadClients} disabled={loading} size="small" title="Refresh"><RefreshIcon fontSize="small" /></IconButton>
      </Stack>
      <List dense sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
        {filteredClients.map((c) => (
          <ListItemButton
            key={c._id}
            selected={!isMobile && selectedClient?._id === c._id}
            onClick={() => handleSelectClient(c)}
          >
            <ListItemText
              primary={<Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><b>{c.name}</b></span>
                <span>{fmtINR(c.balance?.remainingBalance || 0)}</span>
              </Box>}
              secondary={`${c.clientCode} · invoiced ${fmtINR(c.balance?.totalInvoiced || 0)} · paid ${fmtINR(c.balance?.totalPaid || 0)}`}
            />
          </ListItemButton>
        ))}
        {filteredClients.length === 0 && <Box sx={{ p: 2 }}>No clients</Box>}
      </List>
    </Paper>
  );

  // ── Ledger panel (right panel / mobile drill-down) ───────────────────
  const ledgerPanel = !selectedClient ? (
    <Paper sx={{
      p: 4, textAlign: 'center', color: 'text.secondary',
      flex: { xs: '1 1 auto', md: '1 1 auto' },
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 0,
    }}>
      Pick a client to see their ledger
    </Paper>
  ) : (
    <Paper sx={{
      display: 'flex', flexDirection: 'column',
      flex: { xs: '1 1 auto', md: '1 1 auto' },
      minHeight: 0,
    }}>
      <Box sx={{ p: { xs: 1.5, md: 2 }, flexShrink: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {isMobile && (
              <IconButton size="small" onClick={handleBackToList} sx={{ p: 0.5 }}>
                <ArrowBackIcon />
              </IconButton>
            )}
            <Box>
              <Typography variant={isMobile ? 'h6' : 'h5'}>{selectedClient.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedClient.clientCode}{selectedClient.gstin ? ` · GSTIN ${selectedClient.gstin}` : ''}
              </Typography>
            </Box>
          </Box>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ rowGap: 1 }}>
            <Button startIcon={<PaymentsIcon />} variant="contained" size={isMobile ? 'small' : 'medium'} onClick={() => handleOpenPayment('payment')}>
              {isMobile ? 'Pay' : 'Add Payment'}
            </Button>
            <Button startIcon={<AdjustmentIcon />} variant="outlined" size={isMobile ? 'small' : 'medium'} onClick={() => handleOpenPayment('adjustment')}>
              {isMobile ? 'Adjust' : 'Add Adjustment'}
            </Button>
            <Button startIcon={<OpeningIcon />} variant="outlined" size={isMobile ? 'small' : 'medium'} onClick={() => setOpeningDialog({ open: true, value: balance?.openingBalance || 0 })}>
              {isMobile ? 'Opening' : 'Opening Balance'}
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ my: 2 }} />

        <Grid container spacing={1.5}>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Typography variant="caption" color="text.secondary">Opening</Typography>
            <Typography variant={isMobile ? 'body1' : 'h6'}>{fmtINR(balance?.openingBalance)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Typography variant="caption" color="text.secondary">Invoiced</Typography>
            <Typography variant={isMobile ? 'body1' : 'h6'}>{fmtINR(balance?.totalInvoiced)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Typography variant="caption" color="text.secondary">Paid</Typography>
            <Typography variant={isMobile ? 'body1' : 'h6'} color="success.main">{fmtINR(balance?.totalPaid)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, md: 2.4 }}>
            <Typography variant="caption" color="text.secondary">Adjustments</Typography>
            <Typography variant={isMobile ? 'body1' : 'h6'} color="warning.main">{fmtINR(balance?.totalAdjustment)}</Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 2.4 }}>
            <Typography variant="caption" color="text.secondary">Remaining</Typography>
            <Typography variant={isMobile ? 'h6' : 'h5'} color={balance?.remainingBalance > 0 ? 'error.main' : 'text.primary'}>
              <b>{fmtINR(balance?.remainingBalance)}</b>
            </Typography>
          </Grid>
        </Grid>
      </Box>

      <Divider />

      <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {isMobile ? (
          // ── Mobile: ledger as card list ───────────────────────────────
          <Box sx={{ p: 1.5, overflowY: 'auto', flexGrow: 1 }}>
            {ledgerRows.length === 0 ? (
              <Typography align="center" sx={{ py: 4 }} color="text.secondary">No entries yet</Typography>
            ) : ledgerRows.map((row, idx) => (
              <Card key={idx} variant="outlined" sx={{ mb: 1.2 }}>
                <CardContent sx={{ p: 1.2, '&:last-child': { pb: 1.2 } }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        size="small"
                        label={row.type}
                        color={row.type === 'invoice' ? 'primary' : row.type === 'payment' ? 'success' : 'warning'}
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.secondary">{fmtDate(row.date)}</Typography>
                    </Stack>
                    {row.type !== 'invoice' && (
                      <>
                        <IconButton
                          size="small"
                          onClick={(e) => { setRowMenuAnchorEl(e.currentTarget); setRowMenuRow(row); }}
                          sx={{ p: 0.5 }}
                        >
                          <MoreVertIcon fontSize="small" />
                        </IconButton>
                        <Menu
                          anchorEl={rowMenuAnchorEl}
                          open={Boolean(rowMenuAnchorEl) && rowMenuRow === row}
                          onClose={() => { setRowMenuAnchorEl(null); setRowMenuRow(null); }}
                          slotProps={{
                            paper: { sx: { boxShadow: theme.shadows[3] } },
                            list: { sx: { py: 0 } }
                          }}
                        >
                          <MenuItem dense divider onClick={() => { handleOpenPayment(row.type, row.raw); setRowMenuAnchorEl(null); setRowMenuRow(null); }}>
                            <EditIcon fontSize="small" sx={{ mr: 1 }} /> Edit
                          </MenuItem>
                          <MenuItem dense onClick={() => { setDeleteTarget(row.raw); setRowMenuAnchorEl(null); setRowMenuRow(null); }}>
                            <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Delete
                          </MenuItem>
                        </Menu>
                      </>
                    )}
                  </Box>
                  <Typography variant="body2" fontWeight="bold">{row.ref || '—'}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{row.description}</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.8 }}>
                    <Typography variant="body2" color="text.secondary">
                      {row.debit ? `Debit ${fmtINR(row.debit)}` : `Credit ${fmtINR(row.credit)}`}
                    </Typography>
                    <Typography variant="body2" fontWeight="bold" color={row.debit ? 'error.main' : 'success.main'}>
                      {row.debit ? `+${fmtINR(row.debit)}` : `−${fmtINR(row.credit)}`}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          // ── Desktop: ledger table ─────────────────────────────────────
          <TableContainer sx={{ flexGrow: 1, minHeight: 0 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Ref</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Debit (Invoiced)</TableCell>
                  <TableCell align="right">Credit (Received)</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerRows.map((row, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={row.type}
                        color={row.type === 'invoice' ? 'primary' : row.type === 'payment' ? 'success' : 'warning'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 160 }}><EllipsisText text={row.ref} lines={1} /></TableCell>
                    <TableCell sx={{ maxWidth: 240 }}><EllipsisText text={row.description} lines={2} /></TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{row.debit ? fmtINR(row.debit) : ''}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{row.credit ? fmtINR(row.credit) : ''}</TableCell>
                    <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                      {row.type !== 'invoice' && (
                        <Box sx={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center' }}>
                          <Tooltip title="Edit"><IconButton size="small" onClick={() => handleOpenPayment(row.type, row.raw)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                          <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteTarget(row.raw)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {ledgerRows.length === 0 && (
                  <TableRow><TableCell colSpan={7} align="center">No entries yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Paper>
  );

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Client Payments</Typography>

      {isMobile ? (
        // Mobile: drill-down — list OR ledger, not both
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 180px)' }}>
          {mobileLedgerOpen && selectedClient ? ledgerPanel : clientListPanel}
        </Box>
      ) : (
        <Box sx={{
          display: 'flex',
          flexDirection: 'row',
          gap: 2,
          minHeight: 620,
          height: 'calc(100vh - 180px)',
          alignItems: 'stretch'
        }}>
          {clientListPanel}
          {ledgerPanel}
        </Box>
      )}

      <PaymentDialog
        open={paymentDialog.open}
        type={paymentDialog.type}
        editing={paymentDialog.editing}
        client={selectedClient}
        invoices={ledger.invoices}
        isMobile={isMobile}
        onClose={() => setPaymentDialog({ open: false, type: 'payment', editing: null })}
        onSubmit={handleSubmitPayment}
      />

      <Dialog open={openingDialog.open} onClose={() => setOpeningDialog({ open: false, value: 0 })} fullWidth maxWidth="xs">
        <DialogTitle>Opening Balance — {selectedClient?.name}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Used to seed legacy balances from before this system existed. Recomputes remaining = opening + invoiced − paid − adjustments.
          </Typography>
          <TextField
            label="Opening Balance" type="number" fullWidth autoFocus variant="standard"
            value={openingDialog.value}
            onChange={(e) => setOpeningDialog({ ...openingDialog, value: e.target.value })}
            InputProps={{ startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningDialog({ open: false, value: 0 })}>Cancel</Button>
          <Button variant="contained" onClick={handleSetOpening}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete entry?</DialogTitle>
        <DialogContent>
          This will permanently remove the entry. The client balance will be recomputed.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── Payment / Adjustment dialog ────────────────────────────────────────────
function PaymentDialog({ open, type, editing, client, invoices, isMobile, onClose, onSubmit }) {
  const [form, setForm] = useState({
    paymentDate: dayjs(),
    amount: '',
    paymentMode: 'cash',
    referenceNumber: '',
    notes: '',
    invoiceId: ''
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        paymentDate: dayjs(editing.paymentDate),
        amount: editing.amount,
        paymentMode: editing.paymentMode || 'cash',
        referenceNumber: editing.referenceNumber || '',
        notes: editing.notes || '',
        invoiceId: editing.invoiceId?._id || editing.invoiceId || ''
      });
    } else {
      setForm({
        paymentDate: dayjs(),
        amount: '',
        paymentMode: type === 'adjustment' ? 'other' : 'cash',
        referenceNumber: '',
        notes: '',
        invoiceId: ''
      });
    }
  }, [open, editing, type]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  const title = editing
    ? `Edit ${editing.paymentType === 'adjustment' ? 'Adjustment' : 'Payment'}`
    : (type === 'adjustment' ? `Add Adjustment for ${client?.name}` : `Add Payment from ${client?.name}`);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <DatePicker
                  label="Date" value={form.paymentDate} format="DD/MM/YYYY"
                  onChange={(v) => setForm({ ...form, paymentDate: v })}
                  slotProps={{ textField: { fullWidth: true, variant: 'standard' } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Amount" type="number" fullWidth required variant="standard"
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select label="Mode" fullWidth variant="standard"
                  value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                >
                  {paymentModeOptions.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Reference (cheque #, UTR…)" fullWidth variant="standard"
                  value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  select label="Apply to invoice (optional)" fullWidth variant="standard"
                  value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}
                  helperText="Leave blank for lump-sum against client balance"
                >
                  <MenuItem value="">— No specific invoice (client-level) —</MenuItem>
                  {invoices.map((inv) => (
                    <MenuItem key={inv._id} value={inv._id}>
                      {inv.invoiceNumber} · {fmtDate(inv.date)} · {fmtINR(inv.total)} ({inv.invoiceBalance > 0 ? `${fmtINR(inv.invoiceBalance)} outstanding` : 'cleared'})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  label="Notes" fullWidth multiline minRows={2} variant="standard"
                  value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="contained">{editing ? 'Update' : 'Save'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default ClientPaymentManagement;

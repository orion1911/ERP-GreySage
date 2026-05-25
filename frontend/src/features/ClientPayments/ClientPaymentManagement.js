import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Grid, Paper, Typography, Stack, Button, IconButton, Divider, Chip,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, TextField,
  InputAdornment, List, ListItemButton, ListItemText, Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon, Payments as PaymentsIcon, Discount as AdjustmentIcon,
  Edit as EditIcon, Delete as DeleteIcon, AccountBalanceWallet as OpeningIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

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
  const { showSnackbar } = useOutletContext();
  const [clientsWithBalance, setClientsWithBalance] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [ledger, setLedger] = useState({ invoices: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [paymentDialog, setPaymentDialog] = useState({ open: false, type: 'payment', editing: null });
  const [openingDialog, setOpeningDialog] = useState({ open: false, value: 0 });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadClients = () => {
    setLoading(true);
    apiService.clientPayments.getClientsWithBalance()
      .then((data) => {
        setClientsWithBalance(data);
        if (selectedClient) {
          // Keep the same client selected after a refresh
          const refreshed = data.find((c) => c._id === selectedClient._id);
          if (refreshed) setSelectedClient(refreshed);
        } else if (data.length > 0) {
          // Auto-select the first client on initial load so the right panel isn't empty
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

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { selectedClient && loadLedger(selectedClient._id); }, [selectedClient?._id]);

  const filteredClients = useMemo(() => {
    if (!search.trim()) return clientsWithBalance;
    const s = search.toLowerCase();
    return clientsWithBalance.filter((c) =>
      (c.name || '').toLowerCase().includes(s) ||
      (c.clientCode || '').toLowerCase().includes(s)
    );
  }, [clientsWithBalance, search]);

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

  // Build the ledger view (invoices + payments interleaved)
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

  return (
    <>
      <Typography variant="h4" sx={{ mb: 2 }}>Client Payments</Typography>

      {/* Skip MUI Grid for the row — plain flex row with stretch is the most deterministic
          way to make two columns share the same height. Children use flexGrow to fill.
          minHeight ensures ~10 ledger rows + summary card + headers fit on short screens. */}
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        gap: 2,
        minHeight: { md: 620 },
        height: { xs: 'auto', md: 'calc(100vh - 180px)' },
        alignItems: 'stretch'
      }}>
        {/* Left: clients — fixed-ish width on md+, full on mobile */}
        <Paper sx={{
          p: 1.5,
          display: 'flex',
          flexDirection: 'column',
          flex: { xs: '0 0 50vh', md: '0 0 280px' },
          minHeight: 0
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
                  selected={selectedClient?._id === c._id}
                  onClick={() => setSelectedClient(c)}
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

        {/* Right: ledger — fills remaining width, same height as left via parent's stretch */}
        {!selectedClient ? (
          <Paper sx={{
            p: 4, textAlign: 'center', color: 'text.secondary',
            flex: { xs: '0 0 60vh', md: '1 1 auto' },
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 0
          }}>
            Pick a client to see their ledger
          </Paper>
        ) : (
          <Paper sx={{
            display: 'flex', flexDirection: 'column',
            flex: { xs: '0 0 60vh', md: '1 1 auto' },
            minHeight: 0
          }}>
              <Box sx={{ p: 2, flexShrink: 0 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, gap: 2 }}>
                  <Box>
                    <Typography variant="h5">{selectedClient.name}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {selectedClient.clientCode}{selectedClient.gstin ? ` · GSTIN ${selectedClient.gstin}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button startIcon={<PaymentsIcon />} variant="contained" onClick={() => handleOpenPayment('payment')}>
                      Add Payment
                    </Button>
                    <Button startIcon={<AdjustmentIcon />} variant="outlined" onClick={() => handleOpenPayment('adjustment')}>
                      Add Adjustment
                    </Button>
                    <Button startIcon={<OpeningIcon />} variant="outlined" onClick={() => setOpeningDialog({ open: true, value: balance?.openingBalance || 0 })}>
                      Opening Balance
                    </Button>
                  </Stack>
                </Stack>

                <Divider sx={{ my: 2 }} />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, md: 2.4 }}>
                    <Typography variant="caption" color="text.secondary">Opening</Typography>
                    <Typography variant="h6">{fmtINR(balance?.openingBalance)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 2.4 }}>
                    <Typography variant="caption" color="text.secondary">Invoiced</Typography>
                    <Typography variant="h6">{fmtINR(balance?.totalInvoiced)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 2.4 }}>
                    <Typography variant="caption" color="text.secondary">Paid</Typography>
                    <Typography variant="h6" color="success.main">{fmtINR(balance?.totalPaid)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 6, md: 2.4 }}>
                    <Typography variant="caption" color="text.secondary">Adjustments</Typography>
                    <Typography variant="h6" color="warning.main">{fmtINR(balance?.totalAdjustment)}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 2.4 }}>
                    <Typography variant="caption" color="text.secondary">Remaining</Typography>
                    <Typography variant="h5" color={balance?.remainingBalance > 0 ? 'error.main' : 'text.primary'}>
                      <b>{fmtINR(balance?.remainingBalance)}</b>
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Divider />

              <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
                          <TableCell>{fmtDate(row.date)}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.type}
                              color={row.type === 'invoice' ? 'primary' : row.type === 'payment' ? 'success' : 'warning'}
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>{row.ref}</TableCell>
                          <TableCell>{row.description}</TableCell>
                          <TableCell align="right">{row.debit ? fmtINR(row.debit) : ''}</TableCell>
                          <TableCell align="right">{row.credit ? fmtINR(row.credit) : ''}</TableCell>
                          <TableCell align="center">
                            {row.type !== 'invoice' && (
                              <>
                                <Tooltip title="Edit"><IconButton size="small" onClick={() => handleOpenPayment(row.type, row.raw)}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="Delete"><IconButton size="small" onClick={() => setDeleteTarget(row.raw)}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                              </>
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
              </Box>
            </Paper>
        )}
      </Box>

      <PaymentDialog
        open={paymentDialog.open}
        type={paymentDialog.type}
        editing={paymentDialog.editing}
        client={selectedClient}
        invoices={ledger.invoices}
        onClose={() => setPaymentDialog({ open: false, type: 'payment', editing: null })}
        onSubmit={handleSubmitPayment}
      />

      <Dialog open={openingDialog.open} onClose={() => setOpeningDialog({ open: false, value: 0 })}>
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

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete entry?</DialogTitle>
        <DialogContent>
          This will permanently remove the entry. The client balance will be recomputed.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ─── Payment / Adjustment dialog ────────────────────────────────────────────
function PaymentDialog({ open, type, editing, client, invoices, onClose, onSubmit }) {
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
      <form onSubmit={handleSubmit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6 }}>
                <DatePicker
                  label="Date" value={form.paymentDate} format="DD/MM/YYYY"
                  onChange={(v) => setForm({ ...form, paymentDate: v })}
                  slotProps={{ textField: { fullWidth: true, variant: 'standard' } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  label="Amount" type="number" fullWidth required variant="standard"
                  value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  InputProps={{ startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  select label="Mode" fullWidth variant="standard"
                  value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })}
                >
                  {paymentModeOptions.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={{ xs: 6 }}>
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

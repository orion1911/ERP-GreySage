import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Paper, Grid, Button, IconButton, Tooltip, Typography, Stack, Chip,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TablePagination, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField
} from '@mui/material';
import {
  Add as AddIcon, Payments as PaymentsIcon, Edit as EditIcon, Delete as DeleteIcon,
  AccountBalanceWallet as OpeningIcon, Paid as PaidIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import AccessoryPurchaseModal from './AccessoryPurchaseModal';
import AccessoryPaymentModal from './AccessoryPaymentModal';

const PAGE_SIZE = 10;
const TABLE_HEIGHT = 430; // fixed so the layout doesn't jump between pages / type changes

const fmtMoney = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN');
const fmtDate = (d) => d ? dayjs(d).format('DD MMM YY') : '';

function StatBox({ label, value, color, size }) {
  return (
    <Grid size={size || { xs: 6, md: 3 }}>
      <Box>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" fontWeight="bold" color={color || 'text.primary'}>{value}</Typography>
      </Box>
    </Grid>
  );
}

function AccessoryLedger({ type, onStockChange }) {
  const { isMobile, showSnackbar } = useOutletContext();
  const [purchases, setPurchases] = useState({ rows: [], total: 0 });
  const [payments, setPayments] = useState({ rows: [], total: 0 });
  const [purchasePage, setPurchasePage] = useState(0);
  const [paymentPage, setPaymentPage] = useState(0);
  const [balance, setBalance] = useState(null);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingPay, setLoadingPay] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);
  const [editPurchase, setEditPurchase] = useState(null);
  const [paymentModal, setPaymentModal] = useState(false);
  const [editPayment, setEditPayment] = useState(null);
  const [openingDialog, setOpeningDialog] = useState({ open: false, value: 0 });
  const [confirmDel, setConfirmDel] = useState({ open: false, type: '', id: '' });

  // showSnackbar omitted from deps on purpose — its identity changes every layout render,
  // so depending on it would refetch on each setSnackbar and loop on a 401.
  const loadPurchases = useCallback((page) => {
    setLoadingP(true);
    apiService.accessories.getPurchases(type._id, page + 1, PAGE_SIZE)
      .then(res => { setPurchases({ rows: res.rows || [], total: res.total || 0 }); setPurchasePage(page); })
      .catch(err => showSnackbar(err))
      .finally(() => setLoadingP(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id]);

  const loadPayments = useCallback((page) => {
    setLoadingPay(true);
    apiService.accessories.getPayments(type._id, page + 1, PAGE_SIZE)
      .then(res => { setPayments({ rows: res.rows || [], total: res.total || 0 }); setPaymentPage(page); })
      .catch(err => showSnackbar(err))
      .finally(() => setLoadingPay(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id]);

  const loadBalance = useCallback(() => {
    apiService.accessories.getBalance(type._id).then(setBalance).catch(err => showSnackbar(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id]);

  // Fresh load whenever the article type changes (loaders are keyed to type._id).
  useEffect(() => {
    loadBalance();
    loadPurchases(0);
    loadPayments(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id]);

  const afterChange = () => {
    setPurchaseModal(false); setEditPurchase(null);
    setPaymentModal(false); setEditPayment(null);
    loadBalance();
    loadPurchases(purchasePage);
    loadPayments(paymentPage);
    onStockChange && onStockChange();
  };

  const handleDeletePurchase = (id) => setConfirmDel({ open: true, type: 'purchase', id });
  const handleDeletePayment = (id) => setConfirmDel({ open: true, type: 'payment', id });

  const confirmDelete = () => {
    const { type: delType, id } = confirmDel;
    setConfirmDel({ open: false, type: '', id: '' });
    if (delType === 'purchase') {
      apiService.accessories.deletePurchase(id)
        .then(() => { loadBalance(); loadPurchases(purchasePage); onStockChange && onStockChange(); })
        .catch(err => showSnackbar(err));
    } else if (delType === 'payment') {
      apiService.accessories.deletePayment(id)
        .then(() => { loadBalance(); loadPayments(paymentPage); })
        .catch(err => showSnackbar(err));
    }
  };

  const handleMarkPurchasePaid = (p) => {
    apiService.accessories.markPurchasePaid(p._id, !p.isPaid)
      .then(() => loadPurchases(purchasePage))
      .catch(err => showSnackbar(err));
  };

  const handleSetOpening = () => {
    apiService.accessories.setOpeningBalance(type._id, Number(openingDialog.value) || 0)
      .then(() => { showSnackbar('Opening balance updated', 'success'); setOpeningDialog({ open: false, value: 0 }); loadBalance(); })
      .catch(err => showSnackbar(err));
  };

  const lineSummary = (p) => (p.lines || []).map(l => `${l.nameSnapshot || l.accessoryItemId?.name || ''} (${fmtQty(l.qty)})`).join(', ');

  const Loader = () => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <CircularProgress size={28} />
    </Box>
  );

  return (
    <Box>
      {/* ── Balance summary ── */}
      <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
        <Grid container spacing={2}>
          <StatBox size={{ xs: 6, md: 2.4 }} label="Opening" value={fmtMoney(balance?.openingBalance)} />
          <StatBox size={{ xs: 6, md: 2.4 }} label="Total Purchased" value={fmtMoney(balance?.totalPurchased)} />
          <StatBox size={{ xs: 6, md: 2.4 }} label="Total Paid" value={fmtMoney(balance?.totalPaid)} color="success.main" />
          <StatBox size={{ xs: 6, md: 2.4 }} label="Adjustments" value={fmtMoney(balance?.totalAdjustment)} />
          <StatBox size={{ xs: 6, md: 2.4 }} label="Balance Due" value={fmtMoney(balance?.remainingBalance)}
            color={(balance?.remainingBalance || 0) > 0 ? 'error.main' : 'text.primary'} />
        </Grid>
      </Paper>

      <Stack direction={isMobile ? 'column' : 'row'} spacing={1.5} sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setEditPurchase(null); setPurchaseModal(true); }} fullWidth={isMobile}>
          Add Purchase
        </Button>
        <Button variant="outlined" startIcon={<PaymentsIcon />} onClick={() => { setEditPayment(null); setPaymentModal(true); }} fullWidth={isMobile}>
          Add Payment
        </Button>
        <Button variant="outlined" startIcon={<OpeningIcon />} onClick={() => setOpeningDialog({ open: true, value: balance?.openingBalance || 0 })} fullWidth={isMobile}>
          {isMobile ? 'Opening' : 'Opening Balance'}
        </Button>
      </Stack>

      <Grid container spacing={2}>
        {/* ── Purchases ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Purchases</Typography>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <TableContainer sx={{ height: TABLE_HEIGHT, overflowY: 'auto' }}>
              {loadingP ? <Loader /> : (
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell width="80">DATE</TableCell>
                      <TableCell>INV</TableCell>
                      <TableCell>DETAILS</TableCell>
                      <TableCell align="right">QTY</TableCell>
                      <TableCell align="right">AMOUNT</TableCell>
                      <TableCell align="center" width="90">ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchases.rows.length === 0 && <TableRow><TableCell colSpan={6} align="center">No purchases</TableCell></TableRow>}
                    {purchases.rows.map(p => (
                      <TableRow key={p._id} hover sx={{ opacity: p.isPaid ? 0.5 : 1 }}>
                        <TableCell>{fmtDate(p.date)}</TableCell>
                        <TableCell>{p.vendorInvoiceNumber || '—'}</TableCell>
                        <TableCell sx={{ maxWidth: 240, whiteSpace: 'normal' }}>{lineSummary(p)}</TableCell>
                        <TableCell align="right">{fmtQty(p.totalQty)}</TableCell>
                        <TableCell align="right">{fmtMoney(p.totalAmount)}</TableCell>
                        <TableCell align="center">
                          <Tooltip title={p.isPaid ? 'Paid — mark unpaid' : 'Mark as paid'}>
                            <IconButton size="small" color={p.isPaid ? 'success' : 'default'} onClick={() => handleMarkPurchasePaid(p)}><PaidIcon fontSize="small" /></IconButton>
                          </Tooltip>
                          <IconButton size="small" disabled={p.isPaid} onClick={() => { setEditPurchase(p); setPurchaseModal(true); }}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" disabled={p.isPaid} onClick={() => handleDeletePurchase(p._id)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
            <TablePagination
              component="div"
              count={purchases.total}
              page={purchasePage}
              onPageChange={(e, p) => loadPurchases(p)}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
            />
          </Paper>
        </Grid>

        {/* ── Payments ── */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Typography variant="subtitle1" fontWeight="bold" sx={{ mb: 1 }}>Payments</Typography>
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <TableContainer sx={{ height: TABLE_HEIGHT, overflowY: 'auto' }}>
              {loadingPay ? <Loader /> : (
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>DATE</TableCell>
                      <TableCell>TYPE</TableCell>
                      <TableCell>MODE</TableCell>
                      <TableCell>REFERENCE</TableCell>
                      <TableCell align="right">AMOUNT</TableCell>
                      <TableCell align="center">ACTIONS</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payments.rows.length === 0 && <TableRow><TableCell colSpan={6} align="center">No payments</TableCell></TableRow>}
                    {payments.rows.map(p => (
                      <TableRow key={p._id} hover>
                        <TableCell>{fmtDate(p.paymentDate)}</TableCell>
                        <TableCell>
                          <Chip size="small" label={p.paymentType} color={p.paymentType === 'adjustment' ? 'default' : 'success'} variant="outlined" />
                        </TableCell>
                        <TableCell>{p.paymentMode}</TableCell>
                        <TableCell>{p.referenceNumber || '—'}</TableCell>
                        <TableCell align="right">{fmtMoney(p.amount)}</TableCell>
                        <TableCell align="center">
                          <IconButton size="small" onClick={() => { setEditPayment(p); setPaymentModal(true); }}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDeletePayment(p._id)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
            <TablePagination
              component="div"
              count={payments.total}
              page={paymentPage}
              onPageChange={(e, p) => loadPayments(p)}
              rowsPerPage={PAGE_SIZE}
              rowsPerPageOptions={[PAGE_SIZE]}
            />
          </Paper>
        </Grid>
      </Grid>

      <AccessoryPurchaseModal
        open={purchaseModal}
        onClose={() => { setPurchaseModal(false); setEditPurchase(null); }}
        type={type}
        editPurchase={editPurchase}
        onSaved={afterChange}
      />
      <AccessoryPaymentModal
        open={paymentModal}
        onClose={() => { setPaymentModal(false); setEditPayment(null); }}
        type={type}
        editPayment={editPayment}
        onSaved={afterChange}
      />

      <Dialog open={openingDialog.open} onClose={() => setOpeningDialog({ open: false, value: 0 })} fullWidth maxWidth="xs">
        <DialogTitle>Opening Balance — {type.name}</DialogTitle>
        <DialogContent>
          <DialogContentText variant="body2" sx={{ mb: 2 }}>
            Outstanding carried from before this system. Recomputes Balance Due = opening + purchased − paid − adjustments.
          </DialogContentText>
          <TextField
            label="Opening Balance" type="number" fullWidth autoFocus variant="standard"
            value={openingDialog.value}
            onChange={(e) => setOpeningDialog({ ...openingDialog, value: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpeningDialog({ open: false, value: 0 })}>Cancel</Button>
          <Button variant="contained" onClick={handleSetOpening}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDel.open} onClose={() => setConfirmDel({ open: false, type: '', id: '' })} maxWidth="xs" fullWidth>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirmDel.type === 'purchase'
              ? 'Delete this purchase? Stock and balance will be recalculated.'
              : 'Delete this payment? The balance will be recalculated.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel({ open: false, type: '', id: '' })}>Cancel</Button>
          <Button variant="contained" color="error" onClick={confirmDelete}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default AccessoryLedger;

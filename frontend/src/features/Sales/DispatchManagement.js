import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, IconButton, Stack, TextField, MenuItem,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, TablePagination,
  Dialog, DialogTitle, DialogContent, DialogActions, Tooltip, Chip,
  Card, CardContent, Grid, Paper
} from '@mui/material';
import {
  Search as SearchIcon, Edit as EditIcon,
  ReceiptLong as InvoiceIcon, Warning as DamagedIcon,
  LocalShipping as ManualDispatchIcon, Tune as CorrectQtyIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import EllipsisText from '../../components/common/EllipsisText';
import InvoiceFormModal from './InvoiceFormModal';
import ManualDispatchModal from './ManualDispatchModal';

const fmtDate = (d) => d ? dayjs(d).format('DD/MM/YYYY') : '';

const STATUS_META = {
  pending: { label: 'PENDING', color: 'warning' },
  partial: { label: 'PARTIAL', color: 'info' },
  dispatched: { label: 'DISPATCHED', color: 'success' }
};
const statusChip = (s) => STATUS_META[s] || { label: String(s || '—').toUpperCase(), color: 'default' };

function DispatchManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
  const navigate = useNavigate();

  // Final pcs is derived from production records, so quantity corrections happen at
  // source in Stitching Management. Same ?search= jump the notification bell uses.
  const correctQuantities = (row) =>
    navigate(`/stitching?search=${encodeURIComponent(row.lotNumber)}`);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ status: '', search: '' });
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // damaged-edit dialog
  const [damagedTarget, setDamagedTarget] = useState(null);
  const [damagedValue, setDamagedValue] = useState('');
  const [savingDamaged, setSavingDamaged] = useState(false);

  // new-invoice modal (prefilled from a row)
  const [modalOpen, setModalOpen] = useState(false);
  const [preset, setPreset] = useState(null);

  // manual-dispatch modal (legacy lots that will never be invoiced)
  const [manualTarget, setManualTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    apiService.salesInvoices
      .getPendingDispatch({
        status: filters.status || undefined,
        search: filters.search || undefined,
        page,
        limit: rowsPerPage
      })
      .then((data) => {
        setRows(data?.rows || []);
        setTotal(data?.total || 0);
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.search, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e) => { if (e.key === 'Enter') { setPage(0); load(); } };

  // ── Damaged editing ──────────────────────────────────────────────────────
  const openDamaged = (row) => {
    setDamagedTarget(row);
    setDamagedValue(String(row.damagedPcs || 0));
  };
  const saveDamaged = () => {
    if (!damagedTarget) return;
    const val = parseInt(damagedValue, 10);
    if (!Number.isInteger(val) || val < 0) { showSnackbar('Damaged pcs must be a non-negative integer'); return; }
    setSavingDamaged(true);
    apiService.salesInvoices.updateLotDamaged(damagedTarget._id, val)
      .then(() => {
        showSnackbar('Damaged pcs updated', 'success');
        setDamagedTarget(null);
        load();
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setSavingDamaged(false));
  };

  // ── Create invoice prefilled with this lot (good dispatch) ────────────────
  const handleCreateInvoice = (row) => {
    setPreset({
      client: { _id: row.clientId, name: row.clientName, clientCode: row.clientCode },
      lot: row
    });
    setModalOpen(true);
  };

  // ── Filter row ─────────────────────────────────────────────────────────
  const filterRow = (
    <Grid container spacing={isMobile ? 1.2 : 2} sx={{ alignItems: 'flex-end' }}>
      <Grid size={{ xs: 6, md: 'auto' }}>
        <TextField
          select label="Status" value={filters.status}
          onChange={(e) => { setPage(0); setFilters({ ...filters, status: e.target.value }); }}
          fullWidth variant="standard" sx={{ minWidth: { md: 170 } }}
        >
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="partial">Partial</MenuItem>
          <MenuItem value="dispatched">Dispatched</MenuItem>
        </TextField>
      </Grid>
      <Grid size={{ xs: 6, md: true }}>
        <TextField
          label="Search (lot #, upstream inv #)"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          onKeyDown={handleSearch}
          fullWidth variant="standard"
        />
      </Grid>
      <Grid size={{ xs: 12, md: 'auto' }}>
        <Button variant="contained" startIcon={<SearchIcon />} onClick={() => { setPage(0); load(); }} disabled={loading} fullWidth={isMobile} sx={{ whiteSpace: 'nowrap' }}>
          Search
        </Button>
      </Grid>
    </Grid>
  );

  // ── Mobile cards ─────────────────────────────────────────────────────────
  const mobileList = (
    <Box>
      {loading ? (
        <Typography align="center" sx={{ py: 4 }}>Loading…</Typography>
      ) : rows.length === 0 ? (
        <Typography align="center" sx={{ py: 4 }} color="text.secondary">No lots to dispatch</Typography>
      ) : rows.map((r) => {
        const chip = statusChip(r.dispatchStatus);
        return (
          <Card key={r._id} variant="outlined" sx={{ p: 1.3, mb: 1.5 }}>
            <CardContent sx={{ '&:last-child': { pb: 1.5 }, p: 1 }}>
              <Grid container spacing={1} alignItems="center">
                <Grid size={{ xs: 7 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="subtitle1" fontWeight="bold">{r.lotNumber}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {r.clientName} · Inv {r.invoiceNumber} · {fmtDate(r.date)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 5 }} sx={{ textAlign: 'right' }}>
                  <Chip size="small" label={chip.label} color={chip.color} variant="filled" />
                </Grid>
              </Grid>

              <Grid container spacing={1} sx={{ mt: 0.5 }}>
                <Grid size={{ xs: 3 }}>
                  <Typography variant="caption" color="text.secondary">Final</Typography>
                  <Typography variant="body2">{r.finalPcs}</Typography>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Typography variant="caption" color="text.secondary">Dispatched</Typography>
                  <Typography variant="body2">
                    {r.dispatchedPcs ?? r.invoicedPcs}
                    {r.manualDispatchedPcs > 0 && (
                      <Typography component="span" variant="caption" color="text.secondary"> ({r.manualDispatchedPcs} m)</Typography>
                    )}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Typography variant="caption" color="text.secondary">Good Rem.</Typography>
                  <Typography variant="body2" fontWeight="bold">{r.goodRemaining}</Typography>
                </Grid>
                <Grid size={{ xs: 3 }}>
                  <Typography variant="caption" color="text.secondary">Damaged</Typography>
                  <Typography variant="body2">
                    {r.damagedPcs}
                    <IconButton size="small" sx={{ p: 0.25, ml: 0.25 }} onClick={() => openDamaged(r)}>
                      <EditIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Typography>
                </Grid>
              </Grid>

              {/* Actions wrap on narrow screens rather than overflowing. Labels are
                  abbreviated here; the desktop table uses icon buttons with tooltips. */}
              <Stack
                direction="row"
                spacing={0.5}
                sx={{ mt: 1, flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: 0.5 }}
              >
                <Button
                  size="small"
                  startIcon={<CorrectQtyIcon sx={{ fontSize: 16 }} />}
                  onClick={() => correctQuantities(r)}
                >
                  Qty
                </Button>
                <Button
                  size="small"
                  startIcon={<ManualDispatchIcon sx={{ fontSize: 16 }} />}
                  onClick={() => setManualTarget(r)}
                >
                  Mark Sent
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<InvoiceIcon sx={{ fontSize: 16 }} />}
                  disabled={r.goodRemaining <= 0}
                  onClick={() => handleCreateInvoice(r)}
                >
                  Invoice
                </Button>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
      {rows.length > 0 && (
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50, 100]}
        />
      )}
    </Box>
  );

  // ── Desktop table ─────────────────────────────────────────────────────────
  const desktopTable = (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell>Lot #</TableCell>
            <TableCell>Client</TableCell>
            <TableCell>Style / Fabric</TableCell>
            <TableCell align="right">Final</TableCell>
            <TableCell align="right">Damaged</TableCell>
            <TableCell align="right">Dispatched</TableCell>
            <TableCell align="right">Good Rem.</TableCell>
            <TableCell align="right">Dmg Rem.</TableCell>
            <TableCell align="center">Status</TableCell>
            <TableCell align="center">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={11} align="center">Loading…</TableCell></TableRow>
          ) : rows.length === 0 ? (
            <TableRow><TableCell colSpan={11} align="center">No lots to dispatch</TableCell></TableRow>
          ) : rows.map((r) => {
            const chip = statusChip(r.dispatchStatus);
            return (
              <TableRow key={r._id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</TableCell>
                <TableCell><b>{r.lotNumber}</b><br /><Typography variant="caption" color="text.secondary">Inv {r.invoiceNumber}</Typography></TableCell>
                <TableCell sx={{ maxWidth: 180 }}><EllipsisText text={r.clientName} /></TableCell>
                <TableCell sx={{ maxWidth: 180 }}><EllipsisText text={`${r.fitStyleName || ''}${r.fabric ? ` · ${r.fabric}` : ''}`} /></TableCell>
                <TableCell align="right">{r.finalPcs}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                    <span>{r.damagedPcs}{r.damagedSoldPcs > 0 ? ` (${r.damagedSoldPcs} sold)` : ''}</span>
                    <Tooltip title="Set damaged pcs"><IconButton size="small" sx={{ p: 0.25 }} onClick={() => openDamaged(r)}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  {r.dispatchedPcs ?? r.invoicedPcs}
                  {r.manualDispatchedPcs > 0 && (
                    <Tooltip title={`${r.manualDispatchedPcs} marked dispatched manually (no invoice)`}>
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        ({r.manualDispatchedPcs} m)
                      </Typography>
                    </Tooltip>
                  )}
                </TableCell>
                <TableCell align="right"><b>{r.goodRemaining}</b></TableCell>
                <TableCell align="right">{r.damagedRemaining}</TableCell>
                <TableCell align="center"><Chip size="small" label={chip.label} color={chip.color} variant="filled" /></TableCell>
                <TableCell align="center">
                  <Tooltip title={r.goodRemaining <= 0 ? 'Fully dispatched' : 'Create invoice for remaining good pcs'}><span>
                    <IconButton size="small" disabled={r.goodRemaining <= 0} onClick={() => handleCreateInvoice(r)}><InvoiceIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Mark as dispatched without an invoice (old lots)"><span>
                    <IconButton size="small" onClick={() => setManualTarget(r)}><ManualDispatchIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                  <Tooltip title="Correct qty / short in Stitching Management"><span>
                    <IconButton size="small" onClick={() => correctQuantities(r)}><CorrectQtyIcon fontSize="small" /></IconButton>
                  </span></Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={(_, p) => setPage(p)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
        rowsPerPageOptions={[10, 25, 50, 100]}
      />
    </TableContainer>
  );

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <Typography variant="h4" sx={{ mb: 1 }}>Pending Dispatch</Typography>

      <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>{filterRow}</Paper>
      <Paper sx={{ p: { xs: 1, md: 2 } }}>{isMobile ? mobileList : desktopTable}</Paper>

      {/* Damaged-edit dialog */}
      <Dialog open={!!damagedTarget} onClose={() => setDamagedTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DamagedIcon color="warning" fontSize="small" /> Damaged pcs — Lot {damagedTarget?.lotNumber}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Pieces held back from {damagedTarget?.clientName} (defective). They stay sellable and can later be
            sold combined to a third party. Good remaining = final − damaged − dispatched.
          </Typography>
          <TextField
            label="Damaged pcs"
            type="number"
            value={damagedValue}
            onChange={(e) => setDamagedValue(e.target.value)}
            fullWidth variant="standard"
            inputProps={{ min: 0, style: { textAlign: 'right' } }}
            helperText={damagedTarget
              ? `Final ${damagedTarget.finalPcs} · dispatched ${damagedTarget.invoicedPcs} · already sold ${damagedTarget.damagedSoldPcs}`
              : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDamagedTarget(null)} disabled={savingDamaged}>Cancel</Button>
          <Button variant="contained" onClick={saveDamaged} disabled={savingDamaged}>Save</Button>
        </DialogActions>
      </Dialog>

      <ManualDispatchModal
        open={!!manualTarget}
        lot={manualTarget}
        onClose={() => setManualTarget(null)}
        onSaved={load}
        showSnackbar={showSnackbar}
        isMobile={isMobile}
      />

      <InvoiceFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setPreset(null); }}
        onSaved={() => { setModalOpen(false); setPreset(null); load(); }}
        editInvoice={null}
        preset={preset}
      />
    </Box>
  );
}

export default DispatchManagement;

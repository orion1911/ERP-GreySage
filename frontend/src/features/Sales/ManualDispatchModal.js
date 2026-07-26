import React, { useEffect, useState, useCallback } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Box,
  Typography, Stack, Grid, Divider, IconButton, Tooltip, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, CircularProgress
} from '@mui/material';
import {
  LocalShipping as DispatchIcon, Delete as DeleteIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/apiService';

const fmtDate = (d) => (d ? dayjs(d).format('DD/MM/YYYY') : '');
const todayISO = () => dayjs().format('YYYY-MM-DD');

/**
 * Manual Dispatch — for lots physically dispatched before this system went live (or
 * otherwise billed outside it), which will never receive a sales invoice.
 *
 * Records pieces as dispatched WITHOUT creating an invoice. Nothing here touches the
 * client's outstanding balance: money for these lots was billed elsewhere and is carried
 * by the client's opening balance. Adding it again here would double-count.
 *
 * Final pcs is DERIVED from production records (Finishing → Washing → Stitching,
 * quantity − quantityShort). If an old lot's figures are wrong, they are corrected at
 * source in Stitching Management — the "Correct quantities" link jumps there with the lot
 * pre-searched. That keeps one edit path, with its existing stage-chain validation and
 * vendor-balance recalculation, instead of a second one here.
 *
 * Props:
 *   open      bool
 *   lot       row from the Pending Dispatch board (needs _id, lotNumber, clientName…)
 *   onClose   ()
 *   onSaved   ()  — parent should reload the board
 *   showSnackbar (messageOrError, severity)
 *   isMobile  bool — full-screen dialog and stacked layouts on narrow viewports
 */
function ManualDispatchModal({ open, lot, onClose, onSaved, showSnackbar, isMobile = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);

  // New-entry form
  const [goodPcs, setGoodPcs] = useState('');
  const [damagedPcs, setDamagedPcs] = useState('');
  const [dispatchDate, setDispatchDate] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(() => {
    if (!lot?._id) return;
    setLoading(true);
    apiService.salesInvoices
      .getManualDispatch(lot._id)
      .then(setData)
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  }, [lot?._id, showSnackbar]);

  useEffect(() => {
    if (open) {
      setGoodPcs('');
      setDamagedPcs('');
      setDispatchDate(todayISO());
      setReference('');
      setNotes('');
      load();
    }
  }, [open, load]);

  const cap = data?.capacity;

  const handleAdd = () => {
    const g = Number(goodPcs || 0);
    const d = Number(damagedPcs || 0);
    if (g + d <= 0) {
      showSnackbar('Enter at least one piece to dispatch', 'warning');
      return;
    }
    if (!dispatchDate) {
      showSnackbar('Dispatch date is required', 'warning');
      return;
    }
    setSaving(true);
    apiService.salesInvoices
      .createManualDispatch({
        lotId: lot._id,
        goodPcs: g,
        damagedPcs: d,
        dispatchDate,
        reference,
        notes
      })
      .then(() => {
        showSnackbar('Dispatch recorded', 'success');
        setGoodPcs('');
        setDamagedPcs('');
        setReference('');
        setNotes('');
        load();
        onSaved && onSaved();
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setSaving(false));
  };

  const handleDelete = (entry) => {
    setSaving(true);
    apiService.salesInvoices
      .deleteManualDispatch(entry._id)
      .then(() => {
        showSnackbar('Entry removed — pcs returned to the pool', 'success');
        load();
        onSaved && onSaved();
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setSaving(false));
  };

  const fillRemaining = () => {
    if (!cap) return;
    setGoodPcs(String(cap.goodAvailable));
    setDamagedPcs(String(cap.damagedAvailable));
  };

  const entries = data?.entries || [];

  // Quantities are corrected at source, not here — jump to Stitching Management with this
  // lot pre-searched (same ?search= pattern the notification bell uses).
  const goToStitching = () => {
    onClose && onClose();
    navigate(`/stitching?search=${encodeURIComponent(lot?.lotNumber || '')}`);
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="md"
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <DispatchIcon color="primary" fontSize="small" />
        Mark as Dispatched — Lot {lot?.lotNumber}
      </DialogTitle>

      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
        ) : (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              For lots already dispatched outside the system. This records the pieces only —
              no invoice is created and the client&apos;s outstanding balance is not affected.
            </Alert>

            {/* ── Current position ─────────────────────────────────────────── */}
            {cap && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="overline" color="text.secondary">Current position</Typography>
                <Grid container spacing={1} sx={{ mt: 0.5 }}>
                  {[
                    ['Final pcs', cap.finalPcs],
                    ['Damaged held', cap.damagedPcs],
                    ['Good total', cap.goodTotal],
                    ['Invoiced', cap.invoicedPcs],
                    ['Already marked', cap.otherManualGood],
                    ['Good available', cap.goodAvailable]
                  ].map(([label, value]) => (
                    <Grid item xs={4} sm={4} md={2} key={label}>
                      <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'action.hover', textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" noWrap>
                          {label}
                        </Typography>
                        <Typography variant={isMobile ? 'subtitle1' : 'h6'} sx={{ lineHeight: 1.2 }}>
                          {value}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* ── New entry ────────────────────────────────────────────────── */}
            <Typography variant="overline" color="text.secondary">Record a dispatch</Typography>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Good pcs" type="number" fullWidth size="small"
                  value={goodPcs} onChange={(e) => setGoodPcs(e.target.value)}
                  inputProps={{ min: 0, style: { textAlign: 'right' } }}
                  helperText={cap ? `max ${cap.goodAvailable}` : ' '}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  label="Damaged pcs sold" type="number" fullWidth size="small"
                  value={damagedPcs} onChange={(e) => setDamagedPcs(e.target.value)}
                  inputProps={{ min: 0, style: { textAlign: 'right' } }}
                  helperText={cap ? `max ${cap.damagedAvailable}` : ' '}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Dispatch date" type="date" fullWidth size="small"
                  value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  label="Reference" fullWidth size="small"
                  value={reference} onChange={(e) => setReference(e.target.value)}
                  placeholder="Old challan / bill no"
                  helperText="Optional"
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Notes" fullWidth size="small"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                />
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button size="small" onClick={fillRemaining} disabled={!cap}>
                Fill remaining
              </Button>
              <Box sx={{ flex: 1 }} />
              <Button variant="contained" onClick={handleAdd} disabled={saving}>
                Add dispatch
              </Button>
            </Stack>

            {/* ── Existing entries ─────────────────────────────────────────── */}
            {entries.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="overline" color="text.secondary">
                  Recorded manually ({entries.length})
                </Typography>
                {isMobile ? (
                  // A 6-column table doesn't fit a phone — stack each entry instead.
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {entries.map((e) => (
                      <Box
                        key={e._id}
                        sx={{ p: 1, border: 1, borderColor: 'divider', borderRadius: 1 }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
                            {fmtDate(e.dispatchDate)}
                          </Typography>
                          <Typography variant="body2">
                            {e.goodPcs || 0} good
                            {e.damagedPcs > 0 ? ` · ${e.damagedPcs} dmg` : ''}
                          </Typography>
                          <IconButton size="small" onClick={() => handleDelete(e)} disabled={saving}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                        {(e.reference || e.notes) && (
                          <Typography variant="caption" color="text.secondary">
                            {[e.reference, e.notes].filter(Boolean).join(' · ')}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Table size="small" sx={{ mt: 1 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell align="right">Good</TableCell>
                        <TableCell align="right">Damaged</TableCell>
                        <TableCell>Reference</TableCell>
                        <TableCell>Notes</TableCell>
                        <TableCell align="right" />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e._id}>
                          <TableCell>{fmtDate(e.dispatchDate)}</TableCell>
                          <TableCell align="right">{e.goodPcs || 0}</TableCell>
                          <TableCell align="right">{e.damagedPcs || 0}</TableCell>
                          <TableCell>{e.reference || '—'}</TableCell>
                          <TableCell>{e.notes || '—'}</TableCell>
                          <TableCell align="right">
                            <Tooltip title="Remove — returns pcs to the available pool">
                              <span>
                                <IconButton size="small" onClick={() => handleDelete(e)} disabled={saving}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            )}

            {/* ── Correct quantities at source ─────────────────────────────── */}
            <Divider sx={{ my: 2 }} />
            <Box sx={{
              display: 'flex',
              alignItems: isMobile ? 'stretch' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? 1 : 2,
              flexWrap: 'wrap'
            }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="overline" color="text.secondary" display="block">
                  Quantities look wrong?
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Final pcs comes from the production records. Correct qty / short on the
                  stitching, washing or finishing stage and it flows back here.
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                onClick={goToStitching}
                fullWidth={isMobile}
              >
                Correct quantities
              </Button>
            </Box>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ position: isMobile ? 'sticky' : 'static', bottom: 0, bgcolor: 'background.paper' }}>
        <Button onClick={onClose} disabled={saving} fullWidth={isMobile} variant={isMobile ? 'outlined' : 'text'}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ManualDispatchModal;

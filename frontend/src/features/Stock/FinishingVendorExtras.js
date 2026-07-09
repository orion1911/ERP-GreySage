import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Paper, Button, IconButton, Tooltip, Typography, Stack, Chip, Grid,
  Table, TableHead, TableBody, TableRow, TableCell, Collapse, CircularProgress,
  Accordion, AccordionSummary, AccordionDetails, useMediaQuery, useTheme,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon, KeyboardArrowDown as DownIcon, KeyboardArrowRight as RightIcon,
  AssignmentReturn as ReturnIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';
import EllipsisText from '../../components/common/EllipsisText';

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const today = () => dayjs().format('YYYY-MM-DD');

// Colour the net-held figure: positive = vendor still holds surplus (worth attention),
// zero = reconciled, negative = vendor was under-supplied (drew down more than sent).
const netColor = (n) => (n > 0 ? 'warning.main' : n < 0 ? 'info.main' : 'text.disabled');

// One labelled figure inside a mobile item card (2 per row).
const Metric = ({ label, value, color }) => (
  <Grid size={{ xs: 6 }}>
    <Box sx={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      px: 1, py: 0.5, borderRadius: 1, bgcolor: 'action.hover',
    }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" fontWeight={600} sx={{ color: color || 'text.primary' }}>{fmtQty(value)}</Typography>
    </Box>
  </Grid>
);

function FinishingVendorExtras({ hideZero = true, readOnly = false, showSnackbar: propShowSnackbar, loadData }) {
  // Works both inside the authenticated Stock page (context provides showSnackbar) and on the
  // standalone public board (no Outlet → context is null; caller passes showSnackbar + loadData).
  const outletCtx = useOutletContext() || {};
  const showSnackbar = propShowSnackbar || outletCtx.showSnackbar || (() => {});
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openItems, setOpenItems] = useState(() => new Set()); // itemKey `${vendorId}:${itemId}`
  const [dialog, setDialog] = useState(null);   // { vendorId, vendorName, itemId, name, grossExtra }
  const [form, setForm] = useState({ qty: '', date: today(), notes: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null); // return row _id

  const load = useCallback(() => {
    setLoading(true);
    const fetcher = loadData || apiService.accessories.getFinishingVendorExtras;
    fetcher()
      .then(setData)
      .catch((err) => showSnackbar(err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadData]);

  useEffect(() => { load(); }, [load]);

  const toggleItem = (key) => setOpenItems((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const openReturn = (vendor, item) => {
    setForm({ qty: '', date: today(), notes: '' });
    setDialog({ vendorId: vendor.vendorId, vendorName: vendor.vendorName, itemId: item.itemId, name: item.name, grossExtra: item.grossExtra });
  };

  const submitReturn = async () => {
    const qty = Number(form.qty);
    if (!(qty > 0)) { showSnackbar('Enter a return quantity greater than 0'); return; }
    setSaving(true);
    try {
      await apiService.accessories.createVendorReturn({
        vendorId: dialog.vendorId,
        accessoryItemId: dialog.itemId,
        qty,
        date: form.date,
        notes: form.notes,
      });
      showSnackbar('Return recorded');
      setDialog(null);
      load();
    } catch (err) {
      showSnackbar(err);
    } finally {
      setSaving(false);
    }
  };

  const deleteReturn = async (id) => {
    try {
      await apiService.accessories.deleteVendorReturn(id);
      showSnackbar('Return reversed');
      setConfirmDel(null);
      load();
    } catch (err) {
      showSnackbar(err);
    }
  };

  // Expandable per-item detail (per-lot sent-vs-needed + returns history). Shared by the
  // desktop table row and the mobile card so both stay in sync.
  const renderExpanded = (item) => (
    <Box sx={{ py: 1.5, px: { xs: 1, sm: 2 }, display: 'flex', gap: { xs: 2, sm: 4 }, flexWrap: 'wrap' }}>
      {/* Per-lot breakdown */}
      <Box sx={{ flex: '1 1 320px', minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary">Per-lot (sent vs needed)</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Lot</TableCell>
              <TableCell align="right">Sent</TableCell>
              <TableCell align="right">Needed</TableCell>
              <TableCell align="right">Extra</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {item.lots.map((l, idx) => (
              <TableRow key={idx}>
                <TableCell>{l.lotNumber}</TableCell>
                <TableCell align="right">{fmtQty(l.sent)}</TableCell>
                <TableCell align="right">{fmtQty(l.needed)}</TableCell>
                <TableCell align="right" sx={{ color: netColor(l.extra) }}>{fmtQty(l.extra)}</TableCell>
              </TableRow>
            ))}
            {item.lots.length === 0 && (
              <TableRow><TableCell colSpan={4}><Typography variant="caption" color="text.secondary">No lots</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      {/* Returns history */}
      <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
        <Typography variant="overline" color="text.secondary">Returns</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell align="center" sx={{ width: 40 }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {item.returnRows.map((r) => (
              <TableRow key={r._id}>
                <TableCell>{dayjs(r.date).format('DD MMM YY')}</TableCell>
                <TableCell align="right">{fmtQty(r.qty)}</TableCell>
                <TableCell sx={{ maxWidth: 180 }}><EllipsisText text={r.notes} variant="caption" lines={2} /></TableCell>
                <TableCell align="center">
                  {!readOnly && (
                    <Tooltip title="Reverse return">
                      <IconButton size="small" color="error" onClick={() => setConfirmDel(r._id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {item.returnRows.length === 0 && (
              <TableRow><TableCell colSpan={4}><Typography variant="caption" color="text.secondary">No returns yet</Typography></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>;
  }

  const vendors = hideZero
    ? data.map(v => ({ ...v, items: v.items.filter(i => Math.abs(i.netHeld) > 0.001) })).filter(v => v.items.length)
    : data;

  return (
    <Box>
      {/* Title + "Hide zero net-held" switch live in the Stock Management tab header (parent). */}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
        Net held = extra sent (sent − needed, all lots) − returned. Positive = vendor still holds surplus buffer.
      </Typography>

      {vendors.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', color: 'text.secondary' }}>
          No finishing vendor extras to show.
        </Paper>
      )}

      {vendors.map((vendor) => (
        <Accordion key={vendor.vendorId} defaultExpanded={!isMobile && vendors.length <= 3} disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ width: '100%', pr: 2 }} justifyContent="space-between">
              <Typography fontWeight={600}>{vendor.vendorName}</Typography>
              <Chip
                size="small"
                label={`Net held: ${fmtQty(vendor.totalNetHeld)}`}
                sx={{ bgcolor: 'transparent', border: 1, borderColor: netColor(vendor.totalNetHeld), color: netColor(vendor.totalNetHeld), fontWeight: 600 }}
              />
            </Stack>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {isMobile ? (
              // ── Mobile: one card per item — no wide table, no horizontal scroll ──
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}>
                {vendor.items.map((item) => {
                  const key = `${vendor.vendorId}:${item.itemId}`;
                  const open = openItems.has(key);
                  const canReturn = vendor.vendorId !== 'unassigned';
                  return (
                    <Paper key={key} variant="outlined" sx={{ p: 1.25 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography fontWeight={600} sx={{ lineHeight: 1.25 }}>{item.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.typeName}</Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                          <Typography variant="h6" sx={{ color: netColor(item.netHeld), fontWeight: 800, lineHeight: 1.1 }}>
                            {fmtQty(item.netHeld)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{item.unit} net held</Typography>
                        </Box>
                      </Stack>
                      <Grid container spacing={0.75} sx={{ mt: 1 }}>
                        <Metric label="Sent" value={item.sent} />
                        <Metric label="Needed" value={item.needed} />
                        <Metric label="Gross extra" value={item.grossExtra} color={netColor(item.grossExtra)} />
                        <Metric label="Returned" value={item.returned} />
                      </Grid>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 0.5 }}>
                        <Button
                          size="small"
                          onClick={() => toggleItem(key)}
                          startIcon={open ? <DownIcon fontSize="small" /> : <RightIcon fontSize="small" />}
                        >
                          {open ? 'Hide details' : 'Details'}
                        </Button>
                        {!readOnly && (
                          <Tooltip title={canReturn ? 'Record return' : 'No vendor to return to'}>
                            <span>
                              <IconButton size="small" color="primary" disabled={!canReturn} onClick={() => openReturn(vendor, item)}>
                                <ReturnIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        )}
                      </Stack>
                      <Collapse in={open} timeout="auto" unmountOnExit>
                        {renderExpanded(item)}
                      </Collapse>
                    </Paper>
                  );
                })}
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }} />
                    <TableCell>Item</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Sent</TableCell>
                    <TableCell align="right">Needed</TableCell>
                    <TableCell align="right">Gross extra</TableCell>
                    <TableCell align="right">Returned</TableCell>
                    <TableCell align="right">Net held</TableCell>
                    {!readOnly && <TableCell align="center" sx={{ width: 60 }}>Return</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vendor.items.map((item) => {
                    const key = `${vendor.vendorId}:${item.itemId}`;
                    const open = openItems.has(key);
                    const canReturn = vendor.vendorId !== 'unassigned';
                    return (
                      <React.Fragment key={key}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton size="small" onClick={() => toggleItem(key)}>
                              {open ? <DownIcon fontSize="small" /> : <RightIcon fontSize="small" />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200 }}><EllipsisText text={item.name} /></TableCell>
                          <TableCell><Typography variant="caption" color="text.secondary">{item.typeName}</Typography></TableCell>
                          <TableCell align="right">{fmtQty(item.sent)}</TableCell>
                          <TableCell align="right">{fmtQty(item.needed)}</TableCell>
                          <TableCell align="right">{fmtQty(item.grossExtra)}</TableCell>
                          <TableCell align="right">{fmtQty(item.returned)}</TableCell>
                          <TableCell align="right" sx={{ color: netColor(item.netHeld), fontWeight: 700 }}>
                            {fmtQty(item.netHeld)} <Typography component="span" variant="caption" color="text.secondary">{item.unit}</Typography>
                          </TableCell>
                          {!readOnly && (
                            <TableCell align="center">
                              <Tooltip title={canReturn ? 'Record return' : 'No vendor to return to'}>
                                <span>
                                  <IconButton size="small" color="primary" disabled={!canReturn} onClick={() => openReturn(vendor, item)}>
                                    <ReturnIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </TableCell>
                          )}
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={readOnly ? 8 : 9} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
                            <Collapse in={open} timeout="auto" unmountOnExit>
                              {renderExpanded(item)}
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Record return dialog */}
      <Dialog open={!!dialog} onClose={() => !saving && setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Record return</DialogTitle>
        <DialogContent>
          {dialog && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {dialog.vendorName} — {dialog.name}
              </Typography>
              <TextField
                label="Quantity returned" type="number" size="small" autoFocus
                value={form.qty}
                onChange={(e) => setForm(f => ({ ...f, qty: e.target.value }))}
                helperText={`Currently holding ~${fmtQty(dialog.grossExtra)} extra (before this return)`}
                inputProps={{ min: 0 }}
              />
              <TextField
                label="Date" type="date" size="small" InputLabelProps={{ shrink: true }}
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
              />
              <TextField
                label="Notes (optional)" size="small" multiline minRows={2}
                value={form.notes}
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={saving}>Cancel</Button>
          <Button variant="contained" onClick={submitReturn} disabled={saving}>
            {saving ? 'Saving…' : 'Record return'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm reverse return */}
      <Dialog open={!!confirmDel} onClose={() => setConfirmDel(null)} maxWidth="xs">
        <DialogTitle>Reverse this return?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This deletes the return entry and removes the accessories it added back to stock.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDel(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => deleteReturn(confirmDel)}>Reverse</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default FinishingVendorExtras;

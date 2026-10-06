import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Grid, Switch, Chip, Card, CardContent,
  Stack, Alert, IconButton
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon } from '@mui/icons-material';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

// GST rate rules used by Tax Invoices. A rule = HSN prefix + optional per-piece slab +
// effective-from date; the most specific prefix wins, then the latest date ≤ the invoice date.
const blank = () => ({
  hsnPrefix: '62', thresholdPerPiece: '2500', rateUpTo: '5', rateAbove: '18',
  effectiveFrom: dayjs().format('YYYY-MM-DD'), notes: ''
});
const slabText = (r) => ((r.thresholdPerPiece === null || r.thresholdPerPiece === undefined)
  ? `${r.rateUpTo}% flat`
  : `${r.rateUpTo}% up to ₹${r.thresholdPerPiece}/pc · ${r.rateAbove}% above`);

function GstRates() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(null); // null = dialog closed
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    apiService.gstRates.list()
      .then(setRules)
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const openEdit = (r) => setForm({
    _id: r._id,
    hsnPrefix: r.hsnPrefix,
    thresholdPerPiece: r.thresholdPerPiece ?? '',
    rateUpTo: r.rateUpTo,
    rateAbove: r.rateAbove ?? '',
    effectiveFrom: dayjs(r.effectiveFrom).format('YYYY-MM-DD'),
    notes: r.notes || ''
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = () => {
    const payload = {
      hsnPrefix: String(form.hsnPrefix).trim(),
      thresholdPerPiece: form.thresholdPerPiece === '' ? null : form.thresholdPerPiece,
      rateUpTo: form.rateUpTo,
      rateAbove: form.rateAbove === '' ? null : form.rateAbove,
      // Midnight IST, so the rule applies to invoices dated ON the effective day.
      effectiveFrom: `${form.effectiveFrom}T00:00:00+05:30`,
      notes: form.notes
    };
    setSaving(true);
    (form._id ? apiService.gstRates.update(form._id, payload) : apiService.gstRates.create(payload))
      .then(() => { showSnackbar('GST rule saved', 'success'); setForm(null); load(); })
      .catch((e) => showSnackbar(e))
      .finally(() => setSaving(false));
  };

  const toggleActive = (r) => {
    apiService.gstRates.update(r._id, { isActive: !r.isActive })
      .then(load)
      .catch((e) => showSnackbar(e));
  };

  const fmt = (d) => dayjs(d).format('DD/MM/YYYY');

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <Typography variant="h4" sx={{ mb: 1 }}>GST Rates</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="stretch" sx={{ mb: 2 }}>
        <Alert
          severity="info"
          sx={{
            flexGrow: 1, py: 0, alignItems: 'center',
            '& .MuiAlert-icon': { py: 0 },
            '& .MuiAlert-message': { py: 0.5 }
          }}
        >
          GST changed? <b>Add a new rule</b> with the new effective date — don&apos;t edit the old one.
          Issued Tax Invoices keep their frozen rate.
        </Alert>
        <Button
          variant="contained" startIcon={<AddIcon />} onClick={() => setForm(blank())}
          sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          New Rule
        </Button>
      </Stack>

      <Paper sx={{ p: { xs: 1, md: 2 } }}>
        {isMobile ? (
          <Box>
            {loading && <Typography align="center" sx={{ py: 3 }}>Loading…</Typography>}
            {!loading && rules.map((r) => (
              <Card key={r._id} variant="outlined" sx={{ mb: 1.5, opacity: r.isActive ? 1 : 0.55 }}>
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle1" fontWeight="bold">HSN {r.hsnPrefix}…</Typography>
                    <Stack direction="row" alignItems="center">
                      <Switch size="small" checked={!!r.isActive} onChange={() => toggleActive(r)} />
                      <IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                    </Stack>
                  </Stack>
                  <Typography variant="body2">{slabText(r)}</Typography>
                  <Typography variant="caption" color="text.secondary">From {fmt(r.effectiveFrom)}{r.notes ? ` · ${r.notes}` : ''}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>HSN prefix</TableCell>
                  <TableCell>Rate</TableCell>
                  <TableCell>Effective from</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell align="center">Active</TableCell>
                  <TableCell align="center">Edit</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} align="center">Loading…</TableCell></TableRow>
                ) : rules.map((r) => (
                  <TableRow key={r._id} hover sx={{ opacity: r.isActive ? 1 : 0.55 }}>
                    <TableCell><Chip size="small" label={`${r.hsnPrefix}…`} /></TableCell>
                    <TableCell>{slabText(r)}</TableCell>
                    <TableCell>{fmt(r.effectiveFrom)}</TableCell>
                    <TableCell>{r.notes || '—'}</TableCell>
                    <TableCell align="center"><Switch size="small" checked={!!r.isActive} onChange={() => toggleActive(r)} /></TableCell>
                    <TableCell align="center"><IconButton size="small" onClick={() => openEdit(r)}><EditIcon fontSize="small" /></IconButton></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={!!form} onClose={() => setForm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{form?._id ? 'Edit GST Rule' : 'New GST Rule'}</DialogTitle>
        <DialogContent>
          {form && (
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 6 }}>
                <TextField label="HSN prefix" value={form.hsnPrefix} onChange={set('hsnPrefix')} fullWidth variant="standard"
                  helperText="e.g. 62 (all woven apparel) or 620342" />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField label="Effective from" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')}
                  fullWidth variant="standard" InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField label="Rate %" type="number" value={form.rateUpTo} onChange={set('rateUpTo')} fullWidth variant="standard"
                  helperText="Up to the threshold" />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField label="Threshold ₹/pc" type="number" value={form.thresholdPerPiece} onChange={set('thresholdPerPiece')}
                  fullWidth variant="standard" helperText="Blank = flat rate" />
              </Grid>
              <Grid size={{ xs: 4 }}>
                <TextField label="Rate % above" type="number" value={form.rateAbove} onChange={set('rateAbove')}
                  fullWidth variant="standard" helperText="Blank = flat rate" />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField label="Notes" value={form.notes} onChange={set('notes')} fullWidth variant="standard" />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForm(null)}>Close</Button>
          <Button variant="contained" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GstRates;

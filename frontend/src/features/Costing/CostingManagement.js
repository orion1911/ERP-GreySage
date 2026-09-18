import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination,
  TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, Divider, InputAdornment, useTheme,
} from '@mui/material';
import {
  Calculate as CalculateIcon, Search as SearchIcon, Edit as EditIcon, Save as SaveIcon,
} from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow, OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import { motion, AnimatePresence } from 'motion/react';

// ─── COSTING PER PIECE ───────────────────────────────────────────────────────
// Board: lots (status >= 2) with per-stage CP, Adjusted CP and Final SP.
// Detail dialog: full auditable breakdown + editable pricing overlay
//   (washing uplift % defaulting from the vendor, ₹ uplifts on the other
//   stages, manual profit margin) — exactly the sheet maths:
//   CP = fabric + stitching + washing×(1+uplift%) + finishing + accessories,
//   SP = CP + margin.

const rs = (n) => (n === null || n === undefined ? '—' : Math.round(n * 100) / 100 === Math.round(n) ? Math.round(n).toLocaleString('en-IN') : (Math.round(n * 100) / 100).toLocaleString('en-IN'));

function CostingDetailDialog({ open, onClose, lotId, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    washingUpliftPercent: '', fabricUpliftPerPc: '', stitchingUpliftPerPc: '',
    finishingUpliftPerPc: '', profitMarginPerPc: '', expensesPerPc: '', notes: '',
  });
  // showSnackbar gets a fresh identity on every layout render — keeping it out of
  // the effect deps (via a ref) is what stops the dialog from "reopening" (refetch +
  // reset to Loading) right after a save fires a snackbar and refreshes the board.
  const snackbarRef = React.useRef(showSnackbar);
  snackbarRef.current = showSnackbar;

  useEffect(() => {
    if (!open || !lotId) return;
    setLoading(true);
    apiService.costing.getLotCosting(lotId)
      .then((c) => {
        setData(c);
        setForm({
          washingUpliftPercent: c.components.washing.available ? String(c.components.washing.upliftPercent ?? '') : '',
          fabricUpliftPerPc: String(c.uplifts.fabricUpliftPerPc ?? 0),
          stitchingUpliftPerPc: String(c.uplifts.stitchingUpliftPerPc ?? 0),
          finishingUpliftPerPc: String(c.uplifts.finishingUpliftPerPc ?? 0),
          profitMarginPerPc: String(c.profitMarginPerPc ?? 0),
          expensesPerPc: String(c.expensesPerPc ?? 0),
          notes: c.notes || '',
        });
      })
      .catch(err => { console.log(err); snackbarRef.current(err); })
      .finally(() => setLoading(false));
  }, [open, lotId]);

  // Live-preview: recompute SP from the form over the fetched components.
  const preview = useMemo(() => {
    if (!data) return null;
    const washing = data.components.washing.available
      ? Math.round(data.components.washing.weightedAvg * (1 + (Number(form.washingUpliftPercent) || 0) / 100) * 100) / 100
      : 0;
    const base =
      (data.components.fabric.available ? data.components.fabric.perPc : 0) +
      (data.components.stitching.available ? data.components.stitching.rate : 0) +
      washing +
      (data.components.finishing.available ? data.components.finishing.rate : 0) +
      (data.components.accessories.available ? data.components.accessories.perPc : 0);
    const adjusted = Math.round((base
      + (Number(form.fabricUpliftPerPc) || 0)
      + (Number(form.stitchingUpliftPerPc) || 0)
      + (Number(form.finishingUpliftPerPc) || 0)) * 100) / 100;
    const marginPlusExpenses = (Number(form.profitMarginPerPc) || 0) + (Number(form.expensesPerPc) || 0);
    // Mirror the server: Final SP is always rounded UP to the next whole rupee.
    return { adjusted, finalSP: Math.ceil((adjusted + marginPlusExpenses) - 1e-9) };
  }, [data, form]);

  const handleSave = () => {
    setSaving(true);
    apiService.costing.saveLotCosting(lotId, {
      ...form,
      washingUpliftPercent: form.washingUpliftPercent === '' ? null : Number(form.washingUpliftPercent),
    })
      .then((c) => {
        setSaving(false);
        setData(c);
        snackbarRef.current('Costing saved', 'success');
        onSaved && onSaved(); // refresh the board behind the closing dialog
        onClose();            // save done → dismiss
      })
      .catch(err => { setSaving(false); console.log(err); snackbarRef.current(err); });
  };

  const num = (label, key, help) => (
    <TextField
      label={label}
      value={form[key]}
      onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
      variant="standard"
      fullWidth
      inputProps={{ inputMode: 'decimal' }}
      helperText={help}
      sx={{ mb: 1 }}
    />
  );

  const comp = (name, c, extra) => (
    <Stack key={name} direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography variant="body2">
        {name}
        {extra && <Typography component="span" variant="caption" color="text.secondary"> — {extra}</Typography>}
        {!c.available && <Typography component="span" variant="caption" color="warning.main"> — {c.reason}</Typography>}
      </Typography>
      <Typography variant="body2" fontWeight="bold">{c.available ? rs(c.perPc ?? c.adjusted ?? c.rate) : '—'}</Typography>
    </Stack>
  );

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Costing — {data?.lot?.lotNumber || ''}
        {data?.lot?.fitStyleName && (
          <Typography variant="caption" display="block" color="text.secondary">
            {data.lot.fitStyleName}{data.lot.clientName ? ` · ${data.lot.clientName}` : ''}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent dividers>
        {loading || !data ? (
          <Typography variant="body2" sx={{ py: 3, textAlign: 'center' }}>Loading…</Typography>
        ) : (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>COST PER PIECE (derived live)</Typography>
            <Stack spacing={0.5} sx={{ mb: 2 }}>
              {comp('Fabric', data.components.fabric,
                data.components.fabric.available ? `${data.components.fabric.fabricRate}/m × AVG ${data.components.fabric.avgConsumption}` : null)}
              {comp('Stitching', data.components.stitching,
                data.components.stitching.available ? data.components.stitching.vendorName : null)}
              {data.components.washing.available ? (
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2">
                    Washing
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}— weighted avg {rs(data.components.washing.weightedAvg)} over {data.components.washing.totalPcs} pcs + {form.washingUpliftPercent || 0}% uplift
                    </Typography>
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">
                    {rs(data.components.washing.weightedAvg * (1 + (Number(form.washingUpliftPercent) || 0) / 100))}
                  </Typography>
                </Stack>
              ) : comp('Washing', data.components.washing)}
              {comp('Finishing', data.components.finishing,
                data.components.finishing.available ? data.components.finishing.vendorName : null)}
              {data.components.accessories.available ? (
                <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                  <Typography variant="body2">
                    Accessories
                    <Typography component="span" variant="caption" color="text.secondary">
                      {' '}— {data.components.accessories.byType.map(t => t.typeName).join(', ')} over {data.components.accessories.basisPcs} pcs
                    </Typography>
                  </Typography>
                  <Typography variant="body2" fontWeight="bold">{rs(data.components.accessories.perPc)}</Typography>
                </Stack>
              ) : comp('Accessories', data.components.accessories)}
              {!data.complete && (
                <Typography variant="caption" color="warning.main">
                  Incomplete lot — missing stages count as 0 until their records exist.
                </Typography>
              )}
            </Stack>

            <Divider sx={{ mb: 2 }}><Chip size="small" label="PRICING (editable)" /></Divider>
            {num('Washing uplift %', 'washingUpliftPercent', 'On top of the weighted average. Blank = the washing vendor\u2019s default.')}
            {num('Fabric uplift ₹/pc', 'fabricUpliftPerPc')}
            {num('Stitching uplift ₹/pc', 'stitchingUpliftPerPc')}
            {num('Finishing uplift ₹/pc', 'finishingUpliftPerPc')}
            {num('Profit margin ₹/pc', 'profitMarginPerPc', 'Manual 30/50/60 — varies by lot type.')}
            {num('Expenses/Misc \u20B9/pc', 'expensesPerPc', 'Freight, packing, sundries \u2014 charged through to the client on top of the margin.')}
            <TextField
              label="Notes"
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              variant="standard"
              fullWidth
              multiline
              rows={2}
              sx={{ mb: 2 }}
            />

            <Divider sx={{ mb: 1 }} />
            <Stack direction="row" justifyContent="space-between">
              <Typography>Adjusted CP</Typography>
              <Typography fontWeight="bold">{rs(preview?.adjusted)}</Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Profit margin + Expenses (+)</Typography>
              <Typography>
                {rs((Number(form.profitMarginPerPc) || 0) + (Number(form.expensesPerPc) || 0))}
              </Typography>
            </Stack>
            <Stack direction="row" justifyContent="space-between">
              <Typography>Final SP (client, per pc)</Typography>
              <Typography variant="h6" fontWeight="bold" color="primary">
                {rs(preview?.finalSP)}
              </Typography>
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          endIcon={<SaveIcon />}
          disabled={loading || saving || !data}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'SAVE'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CostingManagement() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState(''); // debounced copy actually sent to the API
  const [loading, setLoading] = useState(false);
  // Skeleton shows only on the FIRST load. Per-keystroke search/pagination
  // refetches keep the existing rows on screen (with `loading` set for the
  // subtle refresh) instead of flashing the skeleton between keystrokes.
  const [initialLoading, setInitialLoading] = useState(true);
  const [detailLotId, setDetailLotId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Stale-response guard: the board recomputes full costing per lot, so responses
  // are slow and can finish OUT OF ORDER while the user types — an older, broader
  // response must never overwrite a newer filtered one. Each request takes a
  // sequence number; only the latest may apply its result.
  const reqSeqRef = React.useRef(0);
  const getBoard = (p = page, rpp = rowsPerPage, s = searchQuery) => {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    apiService.costing.getBoard({ search: s, page: p + 1, limit: rpp })
      .then(res => {
        setTimeout(() => {
          if (seq !== reqSeqRef.current) return; // a newer request superseded this one
          setRows(res.rows || []);
          setTotal(res.total || 0);
          setLoading(false);
          setInitialLoading(false); // never stay stuck on the skeleton
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        if (seq !== reqSeqRef.current) return; // superseded — drop the stale error too
        setLoading(false);
        setInitialLoading(false); // never stay stuck on the skeleton after a failed load
        console.log(err);
        showSnackbar(err);
      });
  };

  // Debounce the search box: one request, 350ms after typing stops (each keystroke
  // otherwise fires a full board recompute).
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); setSearchQuery(search); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getBoard(page, rowsPerPage, searchQuery); }, [page, rowsPerPage, searchQuery]);

  const openDetail = (lotId) => { setDetailLotId(lotId); setDetailOpen(true); };

  const columns = [
    { accessorKey: 'lotNumber', header: 'Lot' },
    { accessorKey: 'fitStyleName', header: 'Fit / Client' },
    { accessorKey: 'fabricCP', header: 'Fabric' },
    { accessorKey: 'stitchingCP', header: 'Stitch' },
    { accessorKey: 'washingCP', header: 'Wash (+%)' },
    { accessorKey: 'finishingCP', header: 'Finish' },
    { accessorKey: 'accessoriesCP', header: 'Acc' },
    { accessorKey: 'adjustedCP', header: 'CP' },
    { accessorKey: 'finalSP', header: 'SP' },
    { accessorKey: 'complete', header: '' },
    { accessorKey: '_x', header: 'Actions' },
  ];

  const colsNum = columns.length;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Costing</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <TextField
          label="Search lot number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          variant="standard"
          sx={{ width: 220, maxWidth: '100%' }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Typography variant="caption" color="text.secondary">
          CP = Fabric (rate × AVG) + Stitching + Washing (weighted avg + uplift %) + Finishing + Accessories · SP = CP + margin
        </Typography>
      </Box>

      {isMobile ? (
        <AnimatePresence mode="wait">
          <motion.div
            key="data"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {initialLoading ? <OrderCardsLoader type="costing" /> : (
              rows.length > 0 ? rows.map(r => (
                <Box key={r.lotId} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1 }} onClick={() => openDetail(r.lotId)}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography fontWeight="bold">{r.lotNumber}</Typography>
                    {r.complete ? <Chip size="small" color="success" label="Full" /> : <Chip size="small" variant="outlined" color="warning" label="Partial" />}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {r.fitStyleName || ''}{r.clientName ? ` · ${r.clientName}` : ''}
                  </Typography>
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="body2">
                    F {rs(r.fabricCP)} · S {rs(r.stitchingCP)} · W {rs(r.washingCP)} · Fin {rs(r.finishingCP)} · A {rs(r.accessoriesCP)}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                    <Typography variant="body2">CP <b>{rs(r.adjustedCP)}</b></Typography>
                    <Typography variant="body2">SP <b color="primary">{rs(r.finalSP)}</b></Typography>
                  </Stack>
                </Box>
              )) : 'No records found'
            )}
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setPage(0); setRowsPerPage(Number(e.target.value)); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          </motion.div>
        </AnimatePresence>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key="data"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {columns.map(c => (
                      <TableCell key={c.accessorKey} style={{ textWrap: 'nowrap', textAlign: 'center' }}>
                        {c.header.toUpperCase()}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {initialLoading ? (
                    <TableRowsLoader colsNum={colsNum} rowsNum={10} />
                  ) : rows.length > 0 ? (
                    rows.map(r => (
                      <TableRow key={r.lotId} hover sx={{ cursor: 'pointer' }} onClick={() => openDetail(r.lotId)}>
                        <TableCell style={{ textAlign: 'center', whiteSpace: 'nowrap' }}><b>{r.lotNumber}</b></TableCell>
                        <TableCell style={{ textAlign: 'center' }}>
                          <Typography variant="body2">{r.fitStyleName || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{r.clientName || ''}</Typography>
                        </TableCell>
                        <TableCell style={{ textAlign: 'center' }}>{rs(r.fabricCP)}</TableCell>
                        <TableCell style={{ textAlign: 'center' }}>{rs(r.stitchingCP)}</TableCell>
                        <TableCell style={{ textAlign: 'center' }}>{rs(r.washingCP)}</TableCell>
                        <TableCell style={{ textAlign: 'center' }}>{rs(r.finishingCP)}</TableCell>
                        <TableCell style={{ textAlign: 'center' }}>{rs(r.accessoriesCP)}</TableCell>
                        <TableCell style={{ textAlign: 'center' }}><b>{rs(r.adjustedCP)}</b></TableCell>
                        <TableCell style={{ textAlign: 'center' }}><b>{rs(r.finalSP)}</b></TableCell>
                        <TableCell style={{ textAlign: 'center' }}>
                          {r.complete
                            ? <Chip size="small" color="success" label="Full" />
                            : <Chip size="small" variant="outlined" color="warning" label="Partial" />}
                        </TableCell>
                        <TableCell style={{ textAlign: 'center' }}>
                          <IconButton size="small" onClick={(e) => { e.stopPropagation(); openDetail(r.lotId); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <NoRecordRow />
                  )}
                </TableBody>
              </Table>
              <TablePagination
                component="div"
                count={total}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => { setPage(0); setRowsPerPage(Number(e.target.value)); }}
                rowsPerPageOptions={[10, 25, 50]}
              />
            </TableContainer>
          </motion.div>
        </AnimatePresence>
      )}

      <CostingDetailDialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        lotId={detailLotId}
        onSaved={getBoard}
      />
    </>
  );
}

export default CostingManagement;
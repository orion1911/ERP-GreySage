import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Divider, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Autocomplete } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Lock as LockIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

// One editor for all three ways into the book:
//   mode 'new'     — rows generate the lot number (series/first/last); saving creates the Lot at status 1.
//   mode 'attach'  — pick an existing lot (stitching-first entry); rows are scaffolded from its number.
//   editSheet set  — edit; once the lot has stitching, series + row range are locked (qtys stay editable).
//
// Rows come from the LOT RANGE field ("37/45" → rows 37…45; "45" → one row). The book has no
// gaps and the lot number is a contiguous range, so the range is the single source of truth
// for row count and numbering — no add/delete row buttons, no per-row numbers to mistype.
// Series + range are checked live against existing lots (advisory); the save re-checks the
// same rule inside a per-series lock so two users can't both grab overlapping ranges.

const parseLotNumberLocal = (lotNumber) => {
  const parts = String(lotNumber || '').split('/');
  if (parts.length !== 2 && parts.length !== 3) return null;
  if (!/^[A-Z]+$/.test(parts[0]) || !/^\d+$/.test(parts[1])) return null;
  if (parts.length === 3 && !/^\d+$/.test(parts[2])) return null;
  const start = parseInt(parts[1], 10);
  return { series: parts[0], start, end: parts.length === 3 ? parseInt(parts[2], 10) : start };
};

const emptyRow = () => ({ meters: '', carryInMeters: '0', rollMeters: '', appliedLeftoverId: null, qty: {} }); // carry-in defaults to 0: most layups have none

// "37/45", "37-45", "37 / 45" or "45" → { start, end }; null when not (yet) valid.
const MAX_ROWS = 100; // one physical sheet never holds more; guards against "1/1000" typos
const parseRange = (input) => {
  const m = String(input || '').trim().match(/^(\d+)(?:\s*[/-]\s*(\d+))?$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] !== undefined ? parseInt(m[2], 10) : start;
  if (start < 1 || end < start || end - start + 1 > MAX_ROWS) return null;
  return { start, end };
};
const formatRange = (start, end) => (start === end ? `${start}` : `${start}/${end}`);

function CuttingSheetModal({ open, onClose, mode, editSheet, clients, fitStyles, vendors, masters, waistSizes, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEdit = !!editSheet;
  const locked = isEdit && !!editSheet.hasStitching; // stitching exists → range/series frozen
  const isAttach = !isEdit && mode === 'attach';

  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(dayjs(new Date()));
  const [series, setSeries] = useState('');
  const [rangeInput, setRangeInput] = useState('');   // free text, e.g. "37/45"
  const [rangeTouched, setRangeTouched] = useState(false); // stop auto-suggest overwriting a typed range
  const [nextFree, setNextFree] = useState(null);      // next free book lot no in the series (hint)
  const [lotCheck, setLotCheck] = useState(null);      // { available, message } from the live check
  const [clientId, setClientId] = useState('');
  const [fitStyleId, setFitStyleId] = useState('');
  const [fabric, setFabric] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [masterId, setMasterId] = useState('');
  const [panna, setPanna] = useState('');
  const [layerLength, setLayerLength] = useState('');
  const [description, setDescription] = useState('');
  const [sizes, setSizes] = useState([]);
  const [rows, setRows] = useState([]); // created from the lot range
  const [knownSeries, setKnownSeries] = useState([]);
  const [leftovers, setLeftovers] = useState([]);
  const [availableLots, setAvailableLots] = useState([]);
  const [attachLot, setAttachLot] = useState(null);

  const activeSizes = useMemo(() => (waistSizes || []).filter(ws => ws.isActive), [waistSizes]);
  const range = useMemo(() => parseRange(rangeInput), [rangeInput]);
  const startBase = range ? range.start : 1; // display fallback while the field is being edited

  // ── Init on open ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setDate(dayjs(editSheet.date));
      setSeries(editSheet.series || '');
      const er = editSheet.rows || [];
      setRangeInput(er.length ? formatRange(er[0].bookLotNo, er[er.length - 1].bookLotNo) : '');
      setRangeTouched(true);
      setNextFree(null);
      setLotCheck(null);
      setClientId(editSheet.clientId?._id || '');
      setFitStyleId(editSheet.fitStyleId?._id || '');
      setFabric(editSheet.fabric || '');
      setVendorId(editSheet.stitchingVendorId?._id || '');
      setMasterId(editSheet.masterId?._id || '');
      setPanna(editSheet.panna ?? '');
      setLayerLength(editSheet.layerLength ?? '');
      setDescription(editSheet.description || '');
      setSizes(editSheet.sizes || []);
      setRows((editSheet.rows || []).map(r => ({
        meters: r.meters ?? '',
        carryInMeters: String(r.carryInMeters ?? 0),
        rollMeters: r.rollMeters ?? '',
        appliedLeftoverId: r.appliedLeftoverId || null,
        qty: Object.fromEntries((r.sizeQty || []).filter(sq => sq.qty > 0).map(sq => [sq.size, String(sq.qty)]))
      })));
      setAttachLot(null);
    } else {
      setDate(dayjs(new Date()));
      setSeries('');
      setRangeInput('');
      setRangeTouched(false);
      setNextFree(null);
      setLotCheck(null);
      setClientId('');
      setFitStyleId('');
      setFabric('');
      setVendorId('');
      setMasterId('');
      setPanna('');
      setLayerLength('');
      setDescription('');
      setSizes(activeSizes.filter(ws => ws.isDefault).map(ws => ws.size));
      setRows([]);
      setAttachLot(null);
      // Known series for the autocomplete hint (works with an empty series param).
      apiService.cuttingBook.getNextLotNo('')
        .then(res => setKnownSeries(res.knownSeries || []))
        .catch(() => {});
      if (isAttach) {
        apiService.cuttingBook.getAvailableLots()
          .then(setAvailableLots)
          .catch(err => { console.log(err); showSnackbar(err); });
      }
    }
  }, [open, isEdit, isAttach, editSheet]);

  // ── New mode: series chosen → suggest the next free book lot number ───────────────────
  // Next-free hint follows the SERIES VALUE, not blur: picking from the dropdown keeps focus in
  // the input, so a blur-based refresh left the previous series' number on screen. The stale
  // hint is cleared the instant the series changes, then refetched (debounced).
  const rangeTouchedRef = React.useRef(rangeTouched);
  rangeTouchedRef.current = rangeTouched;
  useEffect(() => {
    if (!open || isEdit || isAttach) return;
    setNextFree(null);
    if (!series || !/^[A-Z]+$/.test(series)) return;
    let active = true;
    const t = setTimeout(() => {
      apiService.cuttingBook.getNextLotNo(series)
        .then(res => {
          if (!active || !res?.nextBookLotNo) return;
          setNextFree(res.nextBookLotNo);
          if (!rangeTouchedRef.current) setRangeInput(String(res.nextBookLotNo)); // pre-fill start; user adds "/45"
        })
        .catch(() => {});
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [open, isEdit, isAttach, series]);

  // Range → rows: keep what's typed, extend with empty rows or trim the tail.
  const handleRangeChange = (value) => {
    setRangeInput(value);
    setRangeTouched(true);
    const r = parseRange(value);
    if (!r) return;
    const count = r.end - r.start + 1;
    setRows(prev => (prev.length === count ? prev
      : prev.length < count ? [...prev, ...Array.from({ length: count - prev.length }, emptyRow)]
      : prev.slice(0, count)));
  };

  // Live availability check (new mode, or edit mode when the range is still unlocked).
  useEffect(() => {
    setLotCheck(null); // never show the previous series/range's verdict while the new one loads
    if (!open || isAttach || locked || !series || !range) return;
    const t = setTimeout(() => {
      apiService.cuttingBook.checkLot(series, range.start, range.end, isEdit ? editSheet?.lotId?._id : undefined)
        .then(setLotCheck)
        .catch(() => setLotCheck(null));
    }, 400);
    return () => clearTimeout(t);
  }, [open, isAttach, locked, series, range, isEdit, editSheet]);

  // ── Attach mode: lot picked → lock series and scaffold one row per book lot ───────────
  const handleAttachLot = (lot) => {
    setAttachLot(lot);
    if (!lot) return;
    const parsed = parseLotNumberLocal(lot.lotNumber);
    if (!parsed) {
      showSnackbar(`Lot number ${lot.lotNumber} cannot be split into a series/range — this lot can't take a sheet`, 'error');
      setAttachLot(null);
      return;
    }
    setSeries(parsed.series);
    setRangeInput(formatRange(parsed.start, parsed.end));
    setRangeTouched(true);
    setRows(Array.from({ length: parsed.end - parsed.start + 1 }, () => emptyRow()));
    setClientId(lot.clientId?._id || '');
    setFitStyleId(lot.fitStyleId?._id || '');
    setFabric(lot.fabric || '');
    if (lot.date) setDate(dayjs(lot.date));
  };

  // ── Leftover chips for the entered fabric ─────────────────────────────────────────────
  useEffect(() => {
    if (!open || !fabric || fabric.length < 2) { setLeftovers([]); return; }
    const t = setTimeout(() => {
      apiService.cuttingBook.getLeftovers(fabric)
        .then(setLeftovers)
        .catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [open, fabric]);

  const appliedIds = useMemo(() => new Set(rows.map(r => r.appliedLeftoverId).filter(Boolean).map(String)), [rows]);

  const applyLeftover = (lo) => {
    const idx = rows.findIndex(r => !r.appliedLeftoverId);
    if (idx === -1) {
      showSnackbar('Every row already carries a leftover — add a row first', 'info');
      return;
    }
    setRows(rows.map((r, i) => i === idx ? { ...r, carryInMeters: String(lo.meters), appliedLeftoverId: lo._id } : r));
  };

  const clearLeftover = (rowIdx) => {
    setRows(rows.map((r, i) => i === rowIdx ? { ...r, carryInMeters: '0', appliedLeftoverId: null } : r));
  };

  // ── Row editing ───────────────────────────────────────────────────────────────────────
  const setRowField = (idx, field, value) => {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const setQty = (idx, size, value) => {
    setRows(rows.map((r, i) => i === idx ? { ...r, qty: { ...r.qty, [size]: value } } : r));
  };

  // Book habit: layups usually cut the SAME count in every size — on leaving the first size
  // cell, copy its value across the row's still-empty cells.
  const fillAcross = (idx) => {
    const first = sizes[0];
    const v = rows[idx]?.qty?.[first];
    if (!v) return;
    setRows(rows.map((r, i) => {
      if (i !== idx) return r;
      const qty = { ...r.qty };
      for (const s of sizes) { if (!qty[s]) qty[s] = v; }
      return { ...r, qty };
    }));
  };

  const toggleSize = (size) => {
    if (locked && sizes.includes(size)) return; // dropping a column would change nothing structural, but keep edits minimal when locked
    if (sizes.includes(size)) {
      setSizes(sizes.filter(s => s !== size));
      setRows(rows.map(r => {
        const qty = { ...r.qty };
        delete qty[size];
        return { ...r, qty };
      }));
    } else {
      setSizes([...sizes, size].sort((a, b) => a - b));
    }
  };

  // ── Live footer ───────────────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    let meters = 0, pcs = 0;
    const leftoverOut = [];
    rows.forEach((r, i) => {
      const m = Number(r.meters) || 0;
      const c = Number(r.carryInMeters) || 0;
      meters += m + c;
      pcs += sizes.reduce((s, sz) => s + (parseInt(r.qty[sz], 10) || 0), 0);
      const roll = Number(r.rollMeters);
      if (r.rollMeters !== '' && !isNaN(roll) && roll > m) {
        leftoverOut.push({ bookLotNo: startBase + i, meters: Math.round((roll - m) * 100) / 100 });
      }
    });
    meters = Math.round(meters * 100) / 100;
    const avg = pcs > 0 ? Math.round((meters / pcs) * 100) / 100 : 0;
    return { meters, pcs, avg, leftoverOut };
  }, [rows, sizes, startBase]);

  const lotNumberPreview = series && range ? (range.start === range.end ? `${series}/${range.start}` : `${series}/${range.start}/${range.end}`) : '—';

  // ── Save ──────────────────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!date) return showSnackbar('Date is required', 'error');
    if (!series) return showSnackbar('Series is required', 'error');
    if (!range) return showSnackbar('Lot range is required — e.g. 37/45 or 45', 'error');
    if (lotCheck && lotCheck.available === false) return showSnackbar(lotCheck.message || 'This lot range is already taken', 'error');
    if (isAttach && !attachLot) return showSnackbar('Pick the lot this sheet belongs to', 'error');
    if (!clientId) return showSnackbar('Client is required', 'error');
    if (!fitStyleId) return showSnackbar('Fit Style is required', 'error');
    if (!fabric) return showSnackbar('Fabric is required', 'error');
    if (!vendorId) return showSnackbar('Stitching Vendor is required', 'error');
    if (!masterId) return showSnackbar('Cutting Master is required', 'error');
    if (sizes.length === 0) return showSnackbar('Select at least one size column', 'error');

    const payloadRows = rows.map((r, i) => ({
      bookLotNo: startBase + i,
      meters: Number(r.meters) || 0,
      carryInMeters: Number(r.carryInMeters) || 0,
      rollMeters: r.rollMeters === '' ? undefined : Number(r.rollMeters),
      appliedLeftoverId: r.appliedLeftoverId || undefined,
      sizeQty: sizes.map(size => ({ size, qty: parseInt(r.qty[size], 10) || 0 }))
    }));

    for (const pr of payloadRows) {
      if (pr.meters + pr.carryInMeters <= 0) return showSnackbar(`Lot ${series}/${pr.bookLotNo}: meters are missing`, 'error');
      if (pr.sizeQty.reduce((s, x) => s + x.qty, 0) <= 0) return showSnackbar(`Lot ${series}/${pr.bookLotNo}: no pieces entered`, 'error');
      if (pr.rollMeters !== undefined && pr.rollMeters < pr.meters) return showSnackbar(`Lot ${series}/${pr.bookLotNo}: roll meters can't be less than used meters`, 'error');
    }

    const payload = {
      mode: isAttach ? 'attach' : 'new',
      lotId: isAttach ? attachLot._id : undefined,
      date: date.toISOString(),
      series: series.toUpperCase().trim(),
      clientId,
      fitStyleId,
      fabric: fabric.toUpperCase().trim(),
      stitchingVendorId: vendorId,
      masterId,
      panna: panna === '' || isNaN(Number(panna)) ? undefined : Number(panna),
      layerLength: layerLength === '' || isNaN(Number(layerLength)) ? undefined : Number(layerLength),
      sizes,
      rows: payloadRows,
      description
    };

    setSaving(true);
    const request = isEdit
      ? apiService.cuttingBook.updateSheet(editSheet._id, payload)
      : apiService.cuttingBook.createSheet(payload);
    request
      .then(() => { setSaving(false); onSaved(); })
      .catch(err => { setSaving(false); console.log(err); showSnackbar(err); });
  };

  const numField = { size: 'small', variant: 'standard', fullWidth: true };
  const cellSx = { minWidth: isMobile ? 64 : 76, px: 0.5, textAlign: 'center' };

  // Range field feedback: live check result > next-free hint > format hint.
  const rangeError = (rangeInput && !range) || (lotCheck && lotCheck.available === false);
  const rangeHelper = rangeInput && !range
    ? `Enter as 37/45 or 45 (max ${MAX_ROWS} rows)`
    : lotCheck && lotCheck.available === false
      ? lotCheck.message
      : lotCheck && lotCheck.available
        ? `${lotCheck.lotNumber} is free`
        : nextFree ? `Next free in ${series}: ${nextFree}` : (isAttach ? 'From the lot number' : 'e.g. 37/45');

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="cutting-sheet-modal"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '85%' : '75%',   // side margins like Add Stitching (80%); a touch wider for the grid
          maxHeight: isMobile ? '85vh' : '90vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: isMobile ? 3 : 4,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" id="cutting-sheet-modal">
            {isEdit ? `Edit Sheet — ${editSheet?.lotId?.lotNumber || ''}` : isAttach ? 'Cutting Sheet — Attach to Lot' : 'New Cutting Sheet'}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        {locked && (
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <LockIcon fontSize="small" color="warning" />
            <Typography variant="caption" color="warning.main">
              Stitching exists for this lot — series and lot range are locked. Meters and quantities stay editable.
            </Typography>
          </Stack>
        )}

        {/* 24-column grid so the narrow fields (Date, Series, Panna, Length) can take 3–4 cols
            while Fabric takes 7 — without fractional sizes. */}
        <Grid container columns={24} spacing={isMobile ? 1 : 2}>
          {isAttach && (
            <Grid size={{ xs: 24 }}>
              <Autocomplete
                options={availableLots}
                value={attachLot}
                onChange={(_, v) => handleAttachLot(v)}
                getOptionLabel={(o) => `${o.lotNumber}  —  ${o.clientId?.name || ''}  ${o.fabric || ''}`}
                isOptionEqualToValue={(o, v) => o._id === v._id}
                renderInput={(params) => (
                  <TextField {...params} label="Lot (without a book entry yet)" variant="standard" margin="normal" />
                )}
              />
            </Grid>
          )}

          {/* ── Row 1: Date · Series · Lot Range · Fabric · Panna · Length ── */}
          <Grid size={{ xs: 12, md: 4 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                label="Date"
                value={date}
                format="DD-MMM-YYYY"
                onChange={setDate}
                slots={{ textField: MorphDateTextField }}
                sx={{ width: '100%' }}
                slotProps={{ textField: { variant: 'standard', margin: 'normal', fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid size={{ xs: 5, md: 3 }}>
            <Autocomplete
              freeSolo
              disableClearable
              options={knownSeries}
              inputValue={series}
              onInputChange={(_, v) => setSeries((v || '').toUpperCase())}
              disabled={isAttach || locked}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Series"
                  variant="standard"
                  margin="normal"
                  placeholder="Y"
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 7, md: 4 }}>
            <TextField
              label="Lot Range"
              value={rangeInput}
              onChange={(e) => handleRangeChange(e.target.value)}
              margin="normal"
              variant="standard"
              fullWidth
              disabled={isAttach || locked}
              placeholder="37/45"
              error={!!rangeError}
              helperText={rangeHelper}
              inputProps={{ inputMode: 'numeric' }}
            />
          </Grid>
          <Grid size={{ xs: 14, md: 7 }}>
            <TextField
              label="Fabric / Quality"
              value={fabric}
              onChange={(e) => setFabric(e.target.value.toUpperCase())}
              margin="normal"
              variant="standard"
              fullWidth
              placeholder="111112"
            />
          </Grid>
          <Grid size={{ xs: 5, md: 3 }}>
            <TextField
              label="Panna"
              value={panna}
              onChange={(e) => setPanna(e.target.value)}
              margin="normal"
              variant="standard"
              fullWidth
              placeholder="77.5"
            />
          </Grid>
          <Grid size={{ xs: 5, md: 3 }}>
            <TextField
              label="Length"
              value={layerLength}
              onChange={(e) => setLayerLength(e.target.value)}
              margin="normal"
              variant="standard"
              fullWidth
              placeholder="44.5"
            />
          </Grid>

          {/* ── Row 2: Client · Fit Style · Stitching Vendor · Cutting Master ── */}
          <Grid size={{ xs: 12, md: 5 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Client</InputLabel>
              <Select value={clientId} label="Client" variant="standard" onChange={(e) => setClientId(e.target.value)}>
                {(clients || []).map(c => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Fit Style</InputLabel>
              <Select value={fitStyleId} label="Fit Style" variant="standard" onChange={(e) => setFitStyleId(e.target.value)}>
                {(fitStyles || []).map(fs => <MenuItem key={fs._id} value={fs._id}>{fs.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Stitching Vendor</InputLabel>
              <Select value={vendorId} label="Stitching Vendor" variant="standard" onChange={(e) => setVendorId(e.target.value)}>
                {(vendors || []).map(v => <MenuItem key={v._id} value={v._id}>{v.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Cutting Master</InputLabel>
              <Select value={masterId} label="Cutting Master" variant="standard" onChange={(e) => setMasterId(e.target.value)}>
                {(masters || []).filter(m => m.isActive || m._id === masterId).map(m => <MenuItem key={m._id} value={m._id}>{m.name}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>

          {/* ── Size columns ── */}
          <Grid size={{ xs: 24 }}>
            <Divider sx={{ mt: 0.5, mb: 1 }}>
              <Chip size="small" label="SIZES" />
            </Divider>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {activeSizes.map(ws => (
                <Chip
                  key={ws._id}
                  label={ws.size}
                  size="small"
                  color={sizes.includes(ws.size) ? 'primary' : 'default'}
                  variant={sizes.includes(ws.size) ? 'filled' : 'outlined'}
                  onClick={() => toggleSize(ws.size)}
                />
              ))}
            </Stack>
          </Grid>

          {/* ── Leftover chips (available for this fabric + applied on this sheet) ── */}
          {(leftovers.filter(lo => !appliedIds.has(String(lo._id))).length > 0 || appliedIds.size > 0) && (
            <Grid size={{ xs: 24 }}>
              <Divider sx={{ mt: 0.5, mb: 1 }}>
                <Chip size="small" label="LEFTOVER FABRIC" />
              </Divider>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                {leftovers.filter(lo => !appliedIds.has(String(lo._id))).map(lo => (
                  <Tooltip key={lo._id} title="Apply as carry-in on the next open row">
                    <Chip
                      label={`+${lo.meters}m from ${lo.sourceLabel}`}
                      size="small"
                      variant="outlined"
                      color="success"
                      onClick={() => applyLeftover(lo)}
                    />
                  </Tooltip>
                ))}
                {rows.map((r, i) => r.appliedLeftoverId ? (
                  <Chip
                    key={`applied-${i}`}
                    label={`+${r.carryInMeters || '?'}m → lot ${startBase + i}`}
                    size="small"
                    color="success"
                    onDelete={() => clearLeftover(i)}
                  />
                ) : null)}
              </Stack>
            </Grid>
          )}

          {/* ── Rows grid (one row per book lot in the range) ── */}
          <Grid size={{ xs: 24 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ ...cellSx, minWidth: 72 }}>LOT</TableCell>
                    <TableCell sx={cellSx}>MTR</TableCell>
                    <TableCell sx={cellSx}>+CARRY</TableCell>
                    <TableCell sx={cellSx}>ROLL MTR</TableCell>
                    {sizes.map(s => <TableCell key={s} sx={{ ...cellSx, minWidth: 52 }}>{s}</TableCell>)}
                    <TableCell sx={cellSx}>PCS</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((r, i) => {
                    const rowPcs = sizes.reduce((s, sz) => s + (parseInt(r.qty[sz], 10) || 0), 0);
                    return (
                      <TableRow key={i}>
                        <TableCell sx={cellSx}>
                          <Typography variant="body2" fontWeight="bold">{series ? `${series}/${startBase + i}` : startBase + i}</Typography>
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <TextField {...numField} value={r.meters} onChange={(e) => setRowField(i, 'meters', e.target.value)} placeholder="115" />
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <TextField
                            {...numField}
                            value={r.carryInMeters}
                            onChange={(e) => setRowField(i, 'carryInMeters', e.target.value)}
                            onFocus={(e) => e.target.select()}
                            placeholder="+35"
                            disabled={!!r.appliedLeftoverId}
                          />
                        </TableCell>
                        <TableCell sx={cellSx}>
                          <TextField {...numField} value={r.rollMeters} onChange={(e) => setRowField(i, 'rollMeters', e.target.value)} placeholder="(104)" />
                        </TableCell>
                        {sizes.map((s, si) => (
                          <TableCell key={s} sx={{ ...cellSx, minWidth: 52 }}>
                            <TextField
                              {...numField}
                              value={r.qty[s] ?? ''}
                              onChange={(e) => setQty(i, s, e.target.value)}
                              onBlur={si === 0 ? () => fillAcross(i) : undefined}
                            />
                          </TableCell>
                        ))}
                        <TableCell sx={cellSx}>
                          <Typography variant="body2" fontWeight="bold">{rowPcs || ''}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
            {!rows.length && (
              <Typography variant="caption" color="text.secondary">Enter a lot range above to create the rows.</Typography>
            )}
          </Grid>

          {/* ── Footer: live totals + generated lot number + leftover-out ── */}
          <Grid size={{ xs: 24 }}>
            <Divider sx={{ mb: 1 }} />
            <Stack direction={isMobile ? 'column' : 'row'} spacing={isMobile ? 0.5 : 3} alignItems={isMobile ? 'flex-start' : 'center'}>
              <Typography variant="body2">Lot No: <strong>{lotNumberPreview}</strong></Typography>
              <Typography variant="body2">Total: <strong>{totals.meters}</strong> mtr</Typography>
              <Typography variant="body2">Pcs: <strong>{totals.pcs}</strong></Typography>
              <Typography variant="body2">AVG: <strong>{totals.avg}</strong></Typography>
              {totals.leftoverOut.map(lo => (
                <Chip key={lo.bookLotNo} size="small" variant="outlined" color="success" label={`${lo.meters}m from ${series}/${lo.bookLotNo} → next sheet`} />
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 24 }}>
            <TextField
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              margin="normal"
              variant="standard"
              multiline
              rows={1}
            />
          </Grid>
          <Grid size={{ xs: 24, md: 4 }}>
            <Button
              fullWidth
              endIcon={<SaveIcon />}
              disabled={saving}
              variant="contained"
              onClick={handleSave}
            >
              {saving ? 'Saving…' : isEdit ? 'UPDATE' : 'SAVE'}
            </Button>
          </Grid>
        </Grid>
      </Box>
    </Modal>
  );
}

export default CuttingSheetModal;

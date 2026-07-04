import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useFieldArray, useWatch } from 'react-hook-form';
import {
  Box, Modal, Typography, TextField, Button, IconButton, Grid,
  Autocomplete, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Stack, Divider, CircularProgress, Card, CardContent, useTheme,
  FormControlLabel, Switch, Chip
} from '@mui/material';
import {
  Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon,
  Add as AddIcon, Delete as DeleteIcon, WarningAmber as WarningAmberIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

// Sum of good-remaining pcs across the lots selected for a merged line.
const sumRemaining = (mergeLots) => (mergeLots || []).reduce((a, l) => a + (Number(l.remainingPcs) || 0), 0);

// Allocate `total` pcs across the selected lots IN ORDER, each capped at its remainingPcs
// (FIFO: fill the first lot before spilling into the next). Returns [{ lotId, lotNumber, pcs }].
// If total exceeds the combined remaining, the leftover is simply not allocated (the caller
// then sees sum(sources) < total and blocks submit).
const computeFifoSources = (mergeLots, total) => {
  let left = Math.max(0, parseInt(total, 10) || 0);
  const out = [];
  for (const lot of (mergeLots || [])) {
    if (left <= 0) break;
    const cap = Math.max(0, Number(lot.remainingPcs) || 0);
    const take = Math.min(cap, left);
    if (take > 0) {
      out.push({ lotId: lot._id, lotNumber: lot.lotNumber, pcs: take });
      left -= take;
    }
  }
  return out;
};

const emptyLine = {
  lotId: null,
  lotNumber: '',
  lotInvoiceNumber: '',
  merged: false,      // true ⇒ this line draws from several lots, printed as one row
  mergeLots: [],      // selected lot options for a merged line (good pool only)
  sources: [],        // saved per-lot split [{lotId, lotNumber, pcs}] — used to lock merged lines on edit
  description: '',
  remark: '',
  hsnSac: '',
  pcs: '',
  unit: '',
  rate: '',
  remainingPcs: null,
  finalPcs: null,
  notFinished: false  // selected lot has no Finishing record yet — warn, don't block
};

function InvoiceFormModal({ open, onClose, onSaved, editInvoice, preset }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const theme = useTheme();
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState([]);
  const [lotsForClient, setLotsForClient] = useState([]);
  const [damagedLots, setDamagedLots] = useState([]); // cross-client pool for damaged sale
  const [lotsLoading, setLotsLoading] = useState(false);

  const { control, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      date: dayjs(),
      client: null,
      billingFirmId: '',
      documentType: 'BILL_OF_SUPPLY',
      damagedMode: false,
      roundOff: 0,
      lines: [{ ...emptyLine }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  // useWatch (not watch) — watch('lines') returns stale references and the totals
  // didn't recompute on each keystroke until something else re-rendered (e.g. "Add Line").
  const lines = useWatch({ control, name: 'lines' });
  const client = watch('client');
  const billingFirmId = watch('billingFirmId');
  const damagedMode = watch('damagedMode');
  const roundOff = Number(useWatch({ control, name: 'roundOff' })) || 0;

  // Combined Damaged Sale draws from a cross-client pool; otherwise client-filtered good lots.
  const lotOptions = damagedMode ? damagedLots : lotsForClient;

  // Fetch clients on open
  useEffect(() => {
    if (!open) return;
    apiService.client.getClients('').then(setClients).catch((e) => showSnackbar(e));
  }, [open]);

  // Resolve the selected client's full record so we can read addresses (the autocomplete
  // option only carries name/clientCode). Place of Supply derives from shippingAddress.
  const selectedClientFull = useMemo(() => {
    if (!client?._id) return null;
    return clients.find((c) => c._id === client._id) || null;
  }, [client?._id, clients]);

  const billingFirms = useMemo(() => selectedClientFull?.billingFirms || [], [selectedClientFull]);
  const selectedFirm = useMemo(
    () => (billingFirmId ? billingFirms.find((f) => String(f._id) === String(billingFirmId)) : null) || null,
    [billingFirmId, billingFirms]
  );

  // Auto-select a billing firm when the client has exactly one; otherwise default (''). Edit
  // keeps the frozen choice (hydrated in reset) — only run this for new invoices.
  useEffect(() => {
    if (!open || editInvoice || !selectedClientFull) return;
    setValue('billingFirmId', billingFirms.length === 1 ? String(billingFirms[0]._id) : '');
  }, [open, editInvoice, selectedClientFull?._id, billingFirms, setValue]);

  // Place of Supply derives from the chosen firm's address, falling back to the client's.
  const derivedPlaceOfSupply = useMemo(() => {
    const src0 = selectedFirm || selectedClientFull;
    const ship = src0?.shippingAddress;
    const bill = src0?.billingAddress;
    const src = (ship?.state || ship?.stateCode) ? ship : bill;
    return {
      stateName: src?.state || '',
      stateCode: src?.stateCode || ''
    };
  }, [selectedFirm, selectedClientFull]);

  // Hydrate when editing
  useEffect(() => {
    if (!open) return;
    if (editInvoice) {
      reset({
        date: dayjs(editInvoice.date),
        client: editInvoice.clientId ? {
          _id: editInvoice.clientId._id || editInvoice.clientId,
          name: editInvoice.clientSnapshot?.name,
          clientCode: editInvoice.clientSnapshot?.clientCode
        } : null,
        billingFirmId: editInvoice.billingFirmId ? String(editInvoice.billingFirmId) : '',
        documentType: editInvoice.documentType || 'BILL_OF_SUPPLY',
        // Preserve the invoice's nature on edit (a combined-damaged sale has isDamaged lines).
        // The toggle is hidden when editing, so this stays fixed at the hydrated value.
        damagedMode: (editInvoice.lines || []).some((l) => l.isDamaged),
        roundOff: editInvoice.roundOff || 0,
        lines: (editInvoice.lines || []).map((l) => {
          const merged = Array.isArray(l.sources) && l.sources.length > 0;
          return {
            lotId: l.lotId || null,
            lotNumber: l.lotNumberSnapshot || '',
            lotInvoiceNumber: l.lotInvoiceNumberSnapshot || '',
            merged,
            // Best-effort option-shaped objects so the (disabled) multi-select shows the lots.
            mergeLots: merged ? l.sources.map((s) => ({
              _id: s.lotId, lotNumber: s.lotNumberSnapshot, invoiceNumber: s.lotInvoiceNumberSnapshot,
              remainingPcs: s.pcs, finalPcs: s.pcs
            })) : [],
            // Frozen split — merged lines are locked on edit, so this is sent back unchanged.
            sources: merged ? l.sources.map((s) => ({
              lotId: s.lotId, lotNumber: s.lotNumberSnapshot, pcs: s.pcs
            })) : [],
            description: l.description || '',
            remark: l.remark || '',
            hsnSac: l.hsnSac || '',
            pcs: l.pcs,
            unit: l.unit || '',
            rate: l.rate,
            remainingPcs: null,
            finalPcs: null
          };
        })
      });
    } else if (preset?.client) {
      // Prefilled from the Pending Dispatch page: client + one good-dispatch line for the lot.
      const lot = preset.lot;
      reset({
        date: dayjs(),
        client: { _id: preset.client._id, name: preset.client.name, clientCode: preset.client.clientCode },
        billingFirmId: '',
        documentType: 'BILL_OF_SUPPLY',
        damagedMode: false,
        roundOff: 0,
        lines: [lot ? {
          ...emptyLine,
          lotId: lot._id,
          lotNumber: lot.lotNumber,
          lotInvoiceNumber: lot.invoiceNumber,
          description: `${lot.fitStyleName || ''}${lot.fabric ? ` (${lot.fabric})` : ''} - LOT ${lot.lotNumber}`.trim(),
          pcs: lot.goodRemaining ?? '',
          remainingPcs: lot.goodRemaining ?? null,
          finalPcs: lot.finalPcs ?? null
        } : { ...emptyLine }]
      });
    } else {
      reset({
        date: dayjs(),
        client: null,
        billingFirmId: '',
        documentType: 'BILL_OF_SUPPLY',
        damagedMode: false,
        roundOff: 0,
        lines: [{ ...emptyLine }]
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editInvoice, reset]);

  // Reload client-filtered good lots when client changes
  useEffect(() => {
    if (!open || !client?._id) {
      setLotsForClient([]);
      return;
    }
    setLotsLoading(true);
    apiService.salesInvoices.getLotsAvailable({ clientId: client._id })
      .then((data) => setLotsForClient(data))
      .catch((e) => showSnackbar(e))
      .finally(() => setLotsLoading(false));
  }, [open, client?._id]);

  // Load the cross-client damaged pool when Combined Damaged Sale is toggled on
  useEffect(() => {
    if (!open || !damagedMode) {
      setDamagedLots([]);
      return;
    }
    setLotsLoading(true);
    apiService.salesInvoices.getLotsDamagedAvailable()
      .then((data) => setDamagedLots(data))
      .catch((e) => showSnackbar(e))
      .finally(() => setLotsLoading(false));
  }, [open, damagedMode]);

  // Live totals
  const totals = useMemo(() => {
    const subTotal = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0) * (Number(l.rate) || 0), 0);
    const totalQty = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0), 0);
    return {
      subTotal,
      totalQty,
      total: subTotal + roundOff
    };
  }, [lines, roundOff]);

  // When a lot is picked: prefill description, pcs (= remaining), rate stays user-entered
  const handleLotChange = useCallback((idx, lotOption) => {
    if (!lotOption) {
      setValue(`lines.${idx}.lotId`, null);
      setValue(`lines.${idx}.lotNumber`, '');
      setValue(`lines.${idx}.lotInvoiceNumber`, '');
      setValue(`lines.${idx}.remainingPcs`, null);
      setValue(`lines.${idx}.finalPcs`, null);
      setValue(`lines.${idx}.notFinished`, false);
      return;
    }
    // In damaged mode the available qty is the lot's damaged pool, not the good remaining.
    const avail = damagedMode ? lotOption.damagedAvailable : lotOption.remainingPcs;
    const finalRef = damagedMode ? lotOption.damagedPcs : lotOption.finalPcs;
    setValue(`lines.${idx}.lotId`, lotOption._id);
    setValue(`lines.${idx}.lotNumber`, lotOption.lotNumber);
    setValue(`lines.${idx}.lotInvoiceNumber`, lotOption.invoiceNumber);
    setValue(`lines.${idx}.remainingPcs`, avail);
    setValue(`lines.${idx}.finalPcs`, finalRef);
    // Only meaningful for good dispatch; damaged-pool rows don't carry the flag.
    setValue(`lines.${idx}.notFinished`, !damagedMode && !!lotOption.notFinished);
    const desc = `${lotOption.fitStyleName || ''}${lotOption.fabric ? ` (${lotOption.fabric})` : ''} - LOT ${lotOption.lotNumber}${damagedMode ? ' (DAMAGED)' : ''}`.trim();
    if (!getValues(`lines.${idx}.description`)) setValue(`lines.${idx}.description`, desc);
    if (!getValues(`lines.${idx}.pcs`)) setValue(`lines.${idx}.pcs`, avail);
  }, [setValue, getValues, damagedMode]);

  // Toggle a line between single-lot and merged (multi-lot) mode; clear the other mode's state.
  const toggleMerge = useCallback((idx, on) => {
    setValue(`lines.${idx}.merged`, on);
    setValue(`lines.${idx}.lotId`, null);
    setValue(`lines.${idx}.lotNumber`, '');
    setValue(`lines.${idx}.lotInvoiceNumber`, '');
    setValue(`lines.${idx}.mergeLots`, []);
    setValue(`lines.${idx}.sources`, []);
    setValue(`lines.${idx}.remainingPcs`, null);
    setValue(`lines.${idx}.finalPcs`, null);
    setValue(`lines.${idx}.notFinished`, false);
  }, [setValue]);

  // Pick/clear the lots that make up a merged line. remainingPcs caps the line's total; the
  // description auto-fills (once) to a combined "LOT A + B" label the user can still edit.
  const changeMergeLots = useCallback((idx, lots) => {
    setValue(`lines.${idx}.mergeLots`, lots || []);
    setValue(`lines.${idx}.remainingPcs`, sumRemaining(lots));
    setValue(`lines.${idx}.notFinished`, (lots || []).some((l) => l.notFinished));
    if (!getValues(`lines.${idx}.description`) && (lots || []).length) {
      const first = lots[0];
      const label = lots.map((l) => l.lotNumber).join(' + ');
      const desc = `${first.fitStyleName || ''}${first.fabric ? ` (${first.fabric})` : ''} - LOT ${label}`.trim();
      setValue(`lines.${idx}.description`, desc);
    }
  }, [setValue, getValues]);

  // The current per-lot split for a line: frozen sources when editing a merged line, else the
  // live FIFO allocation of the typed total across the selected lots.
  const lineSources = (cur) =>
    (editInvoice && cur.merged) ? (cur.sources || []) : computeFifoSources(cur.mergeLots, cur.pcs);

  // Lot picker cell shared by mobile + desktop. `options` is the single-lot list for that layout
  // (mobile passes the good/damaged pool, desktop the good pool). The merged multi-select always
  // uses the client's good lots (lotsForClient).
  const renderLotField = (idx, cur, options) => {
    const canCombine = !damagedMode && !!client && !editInvoice;
    const split = lineSources(cur);
    return (
      <>
        {cur.merged ? (
          <Controller
            name={`lines.${idx}.mergeLots`}
            control={control}
            render={() => (
              <Autocomplete
                multiple
                size="small"
                options={lotsForClient}
                getOptionLabel={(o) => o ? `${o.lotNumber} (Inv ${o.invoiceNumber})` : ''}
                isOptionEqualToValue={(o, v) => o?._id === v?._id}
                loading={lotsLoading}
                value={cur.mergeLots || []}
                onChange={(_, v) => changeMergeLots(idx, v)}
                disabled={!client || !!editInvoice}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2"><b>{option.lotNumber}</b> · Inv {option.invoiceNumber}</Typography>
                        {option.notFinished && (
                          <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />}
                            label="Not finished" sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' }, '& .MuiChip-icon': { fontSize: 14, ml: 0.5 } }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {option.fitStyleName} · {option.fabric} · Remaining {option.remainingPcs} of {option.finalPcs} pcs
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} variant="standard" placeholder="Pick lots to combine" />
                )}
              />
            )}
          />
        ) : (
          <Controller
            name={`lines.${idx}.lotId`}
            control={control}
            render={() => (
              <Autocomplete
                size="small"
                options={options}
                getOptionLabel={(o) => o ? `${o.lotNumber} (Inv ${o.invoiceNumber})` : ''}
                isOptionEqualToValue={(o, v) => o?._id === v?._id}
                loading={lotsLoading}
                value={options.find((l) => String(l._id) === String(cur.lotId)) || null}
                onChange={(_, v) => handleLotChange(idx, v)}
                disabled={!damagedMode && !client}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="body2"><b>{option.lotNumber}</b> · Inv {option.invoiceNumber}</Typography>
                        {!damagedMode && option.notFinished && (
                          <Chip size="small" color="warning" variant="outlined" icon={<WarningAmberIcon />}
                            label="Not finished" sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' }, '& .MuiChip-icon': { fontSize: 14, ml: 0.5 } }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {damagedMode
                          ? `${option.clientName || ''} · ${option.fitStyleName} · ${option.damagedAvailable} damaged pcs`
                          : `${option.fitStyleName} · ${option.fabric} · Remaining ${option.remainingPcs} of ${option.finalPcs} pcs`}
                      </Typography>
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField {...params} variant="standard" placeholder={(damagedMode || client) ? 'Pick a lot' : 'Pick a client first'} />
                )}
              />
            )}
          />
        )}

        {cur.merged ? (
          (cur.mergeLots?.length > 0 || split.length > 0) && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {split.length > 0
                ? `Split: ${split.map((s) => `${s.lotNumber || s.lotId}: ${s.pcs}`).join(' · ')}`
                : 'Enter total pcs to split across the selected lots'}
              {!editInvoice && cur.mergeLots?.length > 0 ? ` · ${sumRemaining(cur.mergeLots)} available` : ''}
            </Typography>
          )
        ) : (
          cur.lotNumber && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Lot {cur.lotNumber} · Inv {cur.lotInvoiceNumber}
              {cur.remainingPcs !== null && cur.remainingPcs !== undefined ? ` · Remaining ${cur.remainingPcs}` : ''}
            </Typography>
          )
        )}

        {!damagedMode && cur.notFinished && (
          <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <WarningAmberIcon sx={{ fontSize: 14 }} />
            {cur.merged ? 'One or more lots are not yet in finishing' : 'Lot not yet in finishing'} — dispatch allowed, verify pcs
          </Typography>
        )}

        {canCombine && (
          <Button size="small" sx={{ mt: 0.5, minWidth: 0, p: 0.25, fontSize: '0.7rem' }}
            onClick={() => toggleMerge(idx, !cur.merged)}>
            {cur.merged ? 'Use single lot' : 'Combine lots'}
          </Button>
        )}
      </>
    );
  };

  const onSubmit = (data) => {
    if (!data.client?._id) return showSnackbar('Please select a client');
    if (!data.lines || data.lines.length === 0) return showSnackbar('Add at least one line item');

    // Build the line payload. Merged lines send a `sources[]` split (no top-level lotId); the
    // server re-validates each source against the lot's remaining pool.
    const outLines = [];
    for (let i = 0; i < data.lines.length; i++) {
      const l = data.lines[i];
      if (l.merged) {
        const isEditMerged = !!editInvoice && Array.isArray(l.sources) && l.sources.length > 0;
        const split = isEditMerged ? l.sources : computeFifoSources(l.mergeLots, l.pcs);
        if (!split.length) return showSnackbar(`Line ${i + 1}: pick lots and a total to combine`);
        if (!isEditMerged) {
          const total = parseInt(l.pcs, 10);
          if (!Number.isInteger(total) || total < 1) return showSnackbar(`Line ${i + 1}: enter the total pcs`);
          const allocated = split.reduce((a, s) => a + s.pcs, 0);
          if (allocated !== total) {
            return showSnackbar(`Line ${i + 1}: total ${total} exceeds ${allocated} available across the selected lots`);
          }
        }
        outLines.push({
          description: l.description,
          remark: l.remark,
          hsnSac: l.hsnSac,
          unit: l.unit,
          rate: Number(l.rate),
          isDamaged: false,
          sources: split.map((s) => ({ lotId: s.lotId, pcs: s.pcs }))
        });
      } else {
        outLines.push({
          lotId: l.lotId || null,
          description: l.description,
          remark: l.remark,
          hsnSac: l.hsnSac,
          pcs: parseInt(l.pcs, 10),
          unit: l.unit,
          rate: Number(l.rate),
          isDamaged: !!data.damagedMode
        });
      }
    }

    const payload = {
      date: data.date?.toISOString ? data.date.toISOString() : new Date(data.date).toISOString(),
      clientId: data.client._id,
      billingFirmId: data.billingFirmId || null,
      documentType: data.documentType,
      // placeOfSupply omitted on purpose — server derives from client's shipping address.
      // For edits, the snapshot is already frozen and not refreshed.
      roundOff: Number(data.roundOff) || 0,
      lines: outLines
    };

    setSubmitting(true);
    const req = editInvoice
      ? apiService.salesInvoices.updateInvoice(editInvoice._id, payload)
      : apiService.salesInvoices.createInvoice(payload);
    req
      .then((saved) => {
        setSubmitting(false);
        showSnackbar(editInvoice ? 'Invoice updated' : `Invoice ${saved.invoiceNumber} created`, 'success');
        onSaved(saved);
        onClose();
      })
      .catch((e) => {
        setSubmitting(false);
        showSnackbar(e);
      });
  };

  return (
    <Modal open={open} onClose={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{
        // Match Add Stitching modal: offset by drawer on desktop, stay bounded on mobile
        ml: isMobile ? 0 : drawerWidth + 'px',
        width: isMobile ? '90%' : '85%',
        maxWidth: 1200,
        maxHeight: '85vh',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 24,
        p: isMobile ? 2 : 4
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {editInvoice
              ? `Edit Invoice ${editInvoice.invoiceNumber}`
              : (damagedMode ? 'New Combined Damaged Sale' : 'New Invoice / Dispatch')}
          </Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>

        <form
          onSubmit={handleSubmit(onSubmit)}
          onKeyDown={(e) => {
            // Prevent Enter inside any non-textarea input from submitting the form.
            // Allows Enter in multiline TextField (rendered as textarea) to insert newlines.
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: 'Date is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <DatePicker
                      label="Date"
                      value={field.value}
                      onChange={field.onChange}
                      format="DD/MM/YYYY"
                      slotProps={{ textField: { fullWidth: true, variant: 'standard', error: !!error, helperText: error?.message } }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Controller
                  name="client"
                  control={control}
                  rules={{ required: 'Client is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <Autocomplete
                      options={clients}
                      getOptionLabel={(o) => o ? `${o.name} (${o.clientCode})` : ''}
                      isOptionEqualToValue={(o, v) => o?._id === v?._id}
                      value={field.value}
                      onChange={(_, v) => field.onChange(v)}
                      disabled={!!editInvoice}
                      renderInput={(params) => (
                        <TextField {...params} label="Client" variant="standard" error={!!error} helperText={error?.message || (editInvoice ? 'Client locked after issue' : '')} />
                      )}
                    />
                  )}
                />
              </Grid>
              {billingFirms.length > 0 && (
                <Grid size={{ xs: 12, md: 3 }}>
                  <Controller
                    name="billingFirmId"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        select
                        label="Billing Firm"
                        fullWidth
                        variant="standard"
                        disabled={!!editInvoice}
                        helperText={editInvoice ? 'Locked after issue' : 'Firm billed to on this invoice'}
                        SelectProps={{ displayEmpty: true }}
                        InputLabelProps={{ shrink: true }}
                      >
                        <MenuItem value="">
                          {selectedClientFull?.billingName || selectedClientFull?.name || 'client'}
                        </MenuItem>
                        {billingFirms.map((f) => (
                          <MenuItem key={f._id} value={String(f._id)}>{f.billingName}</MenuItem>
                        ))}
                      </TextField>
                    )}
                  />
                </Grid>
              )}
              <Grid size={{ xs: 6, md: 3 }}>
                <Controller
                  name="documentType"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Document Type" fullWidth variant="standard">
                      <MenuItem value="BILL_OF_SUPPLY">Bill of Supply</MenuItem>
                      <MenuItem value="TAX_INVOICE">Tax Invoice</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <TextField
                  label="Place of Supply"
                  value={derivedPlaceOfSupply.stateName || derivedPlaceOfSupply.stateCode
                    ? `${derivedPlaceOfSupply.stateName}${derivedPlaceOfSupply.stateCode ? ` (${derivedPlaceOfSupply.stateCode})` : ''}`
                    : ''}
                  fullWidth variant="standard"
                  InputProps={{ readOnly: true }}
                  helperText={!client ? 'Pick a client' : (!derivedPlaceOfSupply.stateName ? 'No state on client — edit to fix' : '')}
                />
              </Grid>
              {!editInvoice && (
                <Grid size={{ xs: 12, md: 12 }}>
                  <Controller
                    name="damagedMode"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={(
                          <Switch
                            checked={!!field.value}
                            onChange={(e) => {
                              field.onChange(e.target.checked);
                              // Reset line lot selections — the two pools are different lists.
                              // toggleMerge also clears single-lot fields, so it covers both modes.
                              (getValues('lines') || []).forEach((_, i) => toggleMerge(i, false));
                            }}
                            color="warning"
                          />
                        )}
                        label={(
                          <Typography variant="body2">
                            Combined Damaged Sale
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                              (sell damaged pcs across lots to a third-party buyer)
                            </Typography>
                          </Typography>
                        )}
                      />
                    )}
                  />
                </Grid>
              )}
            </Grid>
          </LocalizationProvider>

          <Divider sx={{ my: 2 }}><Typography variant="caption">INVOICE ITEMS</Typography></Divider>

          {isMobile ? (
            // ── Mobile: stacked Cards per line ───────────────────────────
            <Stack spacing={1.5}>
              {fields.map((row, idx) => {
                const cur = lines?.[idx] || {};
                const amount = (Number(cur.pcs) || 0) * (Number(cur.rate) || 0);
                const remaining = cur.remainingPcs;
                const overshoot = remaining !== null && remaining !== undefined && Number(cur.pcs) > remaining;
                return (
                  <Card key={row.id} variant="outlined">
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">Item #{idx + 1}</Typography>
                        <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>

                      {renderLotField(idx, cur, lotOptions)}

                      <Controller
                        name={`lines.${idx}.description`}
                        control={control}
                        rules={{ required: true }}
                        render={({ field }) => (
                          <TextField {...field} label="Description" variant="standard" fullWidth multiline maxRows={3} sx={{ mt: 1.5 }} />
                        )}
                      />
                      <Controller
                        name={`lines.${idx}.remark`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Remark (optional)"
                            variant="standard"
                            fullWidth multiline maxRows={2}
                            sx={{ mt: 1 }}
                            InputProps={{ sx: { fontSize: '0.85rem', color: 'text.secondary' } }}
                          />
                        )}
                      />

                      <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.hsnSac`}
                            control={control}
                            render={({ field }) => (
                              <TextField {...field} label="HSN/SAC" variant="standard" size="small" fullWidth />
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.pcs`}
                            control={control}
                            rules={{ required: true, min: 1 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                label={cur.merged ? 'Total Pcs' : 'Pcs'}
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                disabled={!!editInvoice && cur.merged}
                                inputProps={{ min: 1, style: { textAlign: 'right' } }}
                                error={overshoot}
                                helperText={overshoot ? `Max ${remaining}` : ''}
                              />
                            )}
                          />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <Controller
                            name={`lines.${idx}.rate`}
                            control={control}
                            rules={{ required: true, min: 0 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                label="Rate"
                                type="number"
                                variant="standard"
                                size="small"
                                fullWidth
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                              />
                            )}
                          />
                        </Grid>
                      </Grid>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1.5, pt: 1, borderTop: `1px dashed ${theme.palette.divider}` }}>
                        <Typography variant="body2">Amount</Typography>
                        <Typography variant="body2" fontWeight="bold">₹ {fmtINR(amount)}</Typography>
                      </Box>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          ) : (
            // ── Desktop: table ───────────────────────────────────────────
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={36}>#</TableCell>
                    <TableCell width={240}>Lot # / Invoice #</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell width={70}>HSN/SAC</TableCell>
                    <TableCell width={90} align="right">Pcs</TableCell>
                    <TableCell width={100} align="right">Rate</TableCell>
                    <TableCell width={130} align="right">Amount</TableCell>
                    <TableCell width={50} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((row, idx) => {
                    const cur = lines?.[idx] || {};
                    const amount = (Number(cur.pcs) || 0) * (Number(cur.rate) || 0);
                    const remaining = cur.remainingPcs;
                    const overshoot = remaining !== null && remaining !== undefined && Number(cur.pcs) > remaining;
                    return (
                      <TableRow key={row.id}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          {renderLotField(idx, cur, lotsForClient)}
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`lines.${idx}.description`}
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                              <TextField {...field} variant="standard" fullWidth multiline maxRows={3} placeholder="Description (bold)" />
                            )}
                          />
                          <Controller
                            name={`lines.${idx}.remark`}
                            control={control}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                variant="standard"
                                fullWidth multiline maxRows={2}
                                placeholder="Remark (optional)"
                                sx={{ mt: 0.5 }}
                                InputProps={{ sx: { fontSize: '0.85rem', color: 'text.secondary' } }}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`lines.${idx}.hsnSac`}
                            control={control}
                            render={({ field }) => (
                              <TextField {...field} variant="standard" size="small" />
                            )}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Controller
                            name={`lines.${idx}.pcs`}
                            control={control}
                            rules={{ required: true, min: 1 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                type="number"
                                variant="standard"
                                size="small"
                                disabled={!!editInvoice && cur.merged}
                                inputProps={{ min: 1, style: { textAlign: 'right' } }}
                                error={overshoot}
                                helperText={overshoot ? `Max ${remaining}` : ''}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Controller
                            name={`lines.${idx}.rate`}
                            control={control}
                            rules={{ required: true, min: 0 }}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                type="number"
                                variant="standard"
                                size="small"
                                inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell align="right">{fmtINR(amount)}</TableCell>
                        <TableCell>
                          <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Box>
          )}

          <Box sx={{ mt: 1 }}>
            <Button startIcon={<AddIcon />} onClick={() => append({ ...emptyLine })}>
              Add Item
            </Button>
          </Box>

          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, md: 8 }} />
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Sub Total</Typography>
                  <Typography variant="body2">₹ {fmtINR(totals.subTotal)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Round Off</Typography>
                  <Controller
                    name="roundOff"
                    control={control}
                    render={({ field }) => (
                      <TextField {...field} type="number" size="small" variant="standard" inputProps={{ step: 0.01, style: { textAlign: 'right', width: 80 } }} />
                    )}
                  />
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1"><b>Total</b></Typography>
                  <Typography variant="subtitle1"><b>{totals.totalQty} pcs · ₹ {fmtINR(totals.total)}</b></Typography>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 1 }}>
            <Button onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={submitting ? <CircularProgress size={16} /> : (editInvoice ? <PublishIcon /> : <SaveIcon />)}
              disabled={submitting}
            >
              {editInvoice ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </Box>
        </form>
      </Box>
    </Modal>
  );
}

export default InvoiceFormModal;

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Divider, Chip, Tooltip, CircularProgress } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddFinishingModal({ open, onClose, lotNumber, lotId, invoiceNumber, lotQuantity, vendors, onAddFinishing, editRecord }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEditMode = !!editRecord;
  const [loading, setLoading] = useState(false);
  // Quantity available for finishing = Σ(washDetails.quantity − quantityShort), i.e. the
  // lot quantity net of upstream stitching/washing shortage. Fetched from the lot's washing
  // record so the form pre-fills correctly even if the grid hasn't loaded washing.
  const [washAvailable, setWashAvailable] = useState(null);

  const defaultValues = {
    lotNumber: lotNumber || '',
    invoiceNumber: invoiceNumber || '',
    vendorId: '',
    quantity: '',
    quantityShort: '',
    quantityShortDesc: '',
    rate: '',
    date: dayjs(new Date()),
    finishOutDate: null,
    description: '',
    accessoryBasisPcs: '', // pcs the accessories cover; defaults to (follows) Quantity until edited
  };

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  // ── Accessory consumption (button / label / tag / polybag) recorded at finishing ──
  // groups: the slots applicable to this lot's client (client-mapped + general items).
  // consumption: groupKey -> [{ accessoryItemId, qty }] (split allocations per slot).
  // Pre-filled to the finishing quantity; the user adjusts upward for extras sent.
  const [groups, setGroups] = useState([]);
  const [consumption, setConsumption] = useState({});
  const [accLoading, setAccLoading] = useState(false); // accessory section fetch in-flight
  const touchedRef = useRef(new Set()); // group keys the user manually edited
  const basisTouchedRef = useRef(false); // whether the user overrode the accessory basis
  const watchedQuantity = useWatch({ control, name: 'quantity' });
  const qtyNum = parseInt(watchedQuantity) || 0;
  // Base used to pre-fill accessory consumption: the finishing Quantity field if entered,
  // otherwise the record being edited / the lot quantity. Keeps slots filled even before
  // the watched value settles on first render.
  const baseQty = qtyNum || parseInt(editRecord?.quantity) || washAvailable || parseInt(lotQuantity) || 0;
  // Accessory basis = pcs the entered accessories cover. Defaults to (follows) the finishing qty;
  // the user lowers it when accessories cover only part of the lot (pre-tracking or partial finish).
  // Drives the accessory pre-fill and the live "needed / extra" preview.
  const watchedBasis = useWatch({ control, name: 'accessoryBasisPcs' });
  const basisRaw = parseInt(watchedBasis);
  const basisNum = (Number.isFinite(basisRaw) && basisRaw >= 0) ? Math.min(basisRaw, baseQty || basisRaw) : baseQty;
  const gKey = (g) => `${g.typeKey}:${g.slot}`;
  const groupTotal = (k) => (consumption[k] || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
  // Default row item = the lot client's item (resolved server-side as defaultItemId),
  // falling back to the first item. The dropdown still lists ALL clients + general so a
  // lot can be split across multiple clients in one set.
  const primaryItem = (g) => g.items.find(i => String(i._id) === String(g.defaultItemId)) || g.items[0];

  // ── Per-client piece split ──────────────────────────────────────────────
  // Accessories are client-inscribed; one lot can split across clients (e.g. AD 135 / BW 535). Each
  // line's "needed" is sized to its client's pcs, and rivets route to that client's rivet item.
  const [clientPcs, setClientPcs] = useState({}); // clientKey → pcs (string)
  const itemById = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      for (const it of (g.items || [])) m.set(String(it._id), it);
      for (const r of (g.rivetItems || [])) if (!m.has(r.itemId)) m.set(r.itemId, { _id: r.itemId, name: r.name, clientId: r.clientId ? { _id: r.clientId } : null });
    }
    return m;
  }, [groups]);
  const clientKeyOf = (itemId) => {
    const it = itemById.get(String(itemId));
    const cid = it?.clientId ? String(it.clientId._id || it.clientId) : null;
    return cid || 'general';
  };
  const clientNameOf = (key) => {
    if (key === 'general') return 'General';
    for (const it of itemById.values()) {
      const cid = it.clientId ? String(it.clientId._id || it.clientId) : null;
      if (cid === key && it.clientId?.name) return it.clientId.name;
    }
    return 'Client';
  };
  // Rivet item for a client: exact client match → general rivet → default rivet.
  const rivetItemFor = (g, ck) => {
    const items = g.rivetItems || [];
    const want = ck === 'general' ? null : ck;
    return items.find(ri => (ri.clientId || null) === want)
      || items.find(ri => !ri.clientId)
      || (g.rivet ? { itemId: g.rivet.itemId, name: g.rivet.name } : null);
  };
  // Distinct clients across the entered lines (qty > 0).
  const usedClients = useMemo(() => {
    const set = new Set();
    for (const g of groups) {
      for (const r of (consumption[gKey(g)] || [])) {
        if (r.accessoryItemId && Number(r.qty) > 0) {
          const it = itemById.get(String(r.accessoryItemId));
          const cid = it?.clientId ? String(it.clientId._id || it.clientId) : null;
          set.add(cid || 'general');
        }
      }
    }
    return [...set];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, consumption, itemById]);
  const isSplit = usedClients.length > 1;
  // pcs basis for a client's lines: the whole accessory basis when single-client, else its split entry.
  const basisFor = (ck) => {
    if (usedClients.length <= 1) return basisNum;
    const v = parseInt(clientPcs[ck]);
    return (Number.isFinite(v) && v >= 0) ? v : 0;
  };
  const splitSum = usedClients.reduce((s, k) => s + basisFor(k), 0);
  const splitOk = !isSplit || splitSum === basisNum;

  // Seed the split: single client ⇒ full basis; multi ⇒ keep entered values, blank for new clients.
  useEffect(() => {
    setClientPcs(prev => {
      if (usedClients.length <= 1) {
        const k = usedClients[0] || 'general';
        return { [k]: String(basisNum || '') };
      }
      const next = {};
      for (const k of usedClients) next[k] = (prev[k] != null ? prev[k] : '');
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedClients.join('|'), basisNum]);

  // Resolve the available finishing quantity (wash total − wash short) and pre-fill the
  // Quantity field on create so the lot qty reflects upstream shortage.
  useEffect(() => {
    if (!open || !lotId) { setWashAvailable(null); return; }
    let active = true;
    apiService.washing.getWashing('', lotId, '')
      .then(res => {
        if (!active) return;
        const avail = (res || []).reduce((sum, w) =>
          sum + (w.washDetails || []).reduce((s, d) => s + (Number(d.quantity) || 0) - (Number(d.quantityShort) || 0), 0), 0);
        setWashAvailable(avail);
        if (!isEditMode) setValue('quantity', avail || '');
      })
      .catch(() => { if (active) setWashAvailable(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lotId, isEditMode]);

  // Load the consumption slots for the lot (resolved server-side from invoiceNumber), then seed each
  // slot — from existing consumption (edit) or pre-filled to qty (create). The items + existing
  // consumption are fetched IN PARALLEL (edit mode used to chain them, doubling the wait on a cold
  // serverless), and `accLoading` drives a placeholder so the section shows a spinner, not blank.
  useEffect(() => {
    if (!open || !invoiceNumber) { setGroups([]); setConsumption({}); setAccLoading(false); return; }
    let active = true;
    setAccLoading(true);
    const itemsP = apiService.accessories.getFinishingItems(invoiceNumber);
    const consP = (isEditMode && editRecord?.lotId?._id)
      ? apiService.accessories.getConsumption(editRecord.lotId._id, 'finishing').catch(() => [])
      : Promise.resolve([]);
    Promise.all([itemsP, consP])
      .then(([gs, rows]) => {
        if (!active) return;
        let initial = {};
        if (isEditMode && editRecord?.lotId?._id) {
          for (const g of gs) {
            const ids = new Set(g.items.map(i => String(i._id)));
            const matched = (rows || []).filter(r => ids.has(String(r.accessoryItemId)))
              .map(r => ({ accessoryItemId: String(r.accessoryItemId), qty: String(r.qty) }));
            if (matched.length) {
              initial[gKey(g)] = matched;
            } else {
              // Old record with no saved consumption → default to 0 so editing it doesn't
              // force/decrement consumption. The user can fill it in if needed.
              initial[gKey(g)] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: '' }];
            }
            touchedRef.current.add(gKey(g)); // edit values are user-managed; don't auto-fill from qty
          }
          // Hydrate the per-client piece split from stored basisPcs (for lots saved with a split).
          const itemClient = new Map();
          for (const g of gs) {
            for (const i of (g.items || [])) itemClient.set(String(i._id), i.clientId ? String(i.clientId._id || i.clientId) : null);
            for (const r of (g.rivetItems || [])) itemClient.set(String(r.itemId), r.clientId ? String(r.clientId) : null);
          }
          const cp = {};
          for (const r of (rows || [])) {
            if (r.basisPcs == null) continue;
            const key = itemClient.get(String(r.accessoryItemId)) || 'general';
            if (cp[key] == null) cp[key] = String(r.basisPcs);
          }
          if (Object.keys(cp).length) setClientPcs(cp);
        } else {
          touchedRef.current = new Set();
          for (const g of gs) {
            initial[gKey(g)] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: (basisNum * (g.multiplier || 1)) || '' }];
          }
        }
        setGroups(gs);
        setConsumption(initial);
      })
      .catch(() => { if (active) { setGroups([]); setConsumption({}); } })
      .finally(() => { if (active) setAccLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceNumber, isEditMode, editRecord]);

  // Keep untouched slots pre-filled to the accessory basis (defaults to finishing qty).
  useEffect(() => {
    if (groups.length === 0) return;
    setConsumption(prev => {
      const next = { ...prev };
      for (const g of groups) {
        const k = gKey(g);
        if (touchedRef.current.has(k)) continue;
        next[k] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: (basisNum * (g.multiplier || 1)) || '' }];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basisNum, groups]);

  // Default the accessory basis to the finishing quantity until the user overrides it.
  useEffect(() => {
    if (basisTouchedRef.current) return;
    setValue('accessoryBasisPcs', baseQty ? String(baseQty) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseQty]);

  const setRow = (k, idx, field, value) => {
    touchedRef.current.add(k);
    setConsumption(prev => {
      const rows = [...(prev[k] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [k]: rows };
    });
  };
  const addRow = (k) => {
    touchedRef.current.add(k);
    setConsumption(prev => ({ ...prev, [k]: [...(prev[k] || []), { accessoryItemId: '', qty: '' }] }));
  };
  const removeRow = (k, idx) => {
    touchedRef.current.add(k);
    setConsumption(prev => ({ ...prev, [k]: (prev[k] || []).filter((_, i) => i !== idx) }));
  };

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('lotNumber', editRecord.lotId?.lotNumber || lotNumber || '');
      setValue('invoiceNumber', editRecord.lotId?.invoiceNumber || invoiceNumber || '');
      setValue('vendorId', editRecord.vendorId?._id || '');
      setValue('quantity', editRecord.quantity || '');
      setValue('quantityShort', editRecord.quantityShort || '');
      setValue('quantityShortDesc', editRecord.quantityShortDesc || '');
      setValue('rate', editRecord.rate || '');
      setValue('date', editRecord.date ? dayjs(editRecord.date) : dayjs(new Date()));
      setValue('finishOutDate', editRecord.finishOutDate ? dayjs(editRecord.finishOutDate) : null);
      setValue('description', editRecord.description || '');
      // A stored basis below the finishing qty is a user override → keep it (don't let it follow qty).
      if (editRecord.accessoryBasisPcs != null && Number(editRecord.accessoryBasisPcs) !== Number(editRecord.quantity)) {
        basisTouchedRef.current = true;
        setValue('accessoryBasisPcs', String(editRecord.accessoryBasisPcs));
      } else {
        basisTouchedRef.current = false; // follows qty
      }
    } else {
      setValue('lotNumber', lotNumber || '');
      setValue('invoiceNumber', invoiceNumber || '');
      setValue('vendorId', '');
      setValue('quantity', '');
      setValue('quantityShort', '');
      setValue('quantityShortDesc', '');
      setValue('rate', '');
      setValue('date', dayjs(new Date()));
      setValue('finishOutDate', null);
      setValue('description', '');
      basisTouchedRef.current = false; // follows qty
    }
  }, [editRecord, isEditMode, lotNumber, invoiceNumber, setValue]);

  const onSubmit = (data) => {
    // Multi-client split must account for every piece.
    if (isSplit && splitSum !== basisNum) {
      showSnackbar(`Piece split (${splitSum}) must equal the accessory basis (${basisNum})`);
      return;
    }
    // Gather accessory consumption. Each line carries basisPcs = its client's pcs. Rivets are
    // auto-derived per button line (qty × 4) onto that line's client rivet item.
    const raw = [];
    for (const g of groups) {
      const k = gKey(g);
      const rows = consumption[k] || [];
      for (const r of rows) {
        if (!r.accessoryItemId || !(Number(r.qty) > 0)) continue;
        const ck = clientKeyOf(r.accessoryItemId);
        const basis = basisFor(ck);
        raw.push({ accessoryItemId: String(r.accessoryItemId), qty: Number(r.qty), basisPcs: basis });
        if (g.rivet) {
          const ri = rivetItemFor(g, ck);
          if (ri?.itemId) raw.push({ accessoryItemId: String(ri.itemId), qty: Number(r.qty) * (g.rivet.multiplier || 4), basisPcs: basis });
        }
      }
    }
    // Merge duplicate items (same item ⇒ same client ⇒ same basis): sum qty.
    const mergedMap = new Map();
    for (const a of raw) {
      const m = mergedMap.get(a.accessoryItemId);
      if (m) m.qty += a.qty;
      else mergedMap.set(a.accessoryItemId, { ...a });
    }
    const allocations = [...mergedMap.values()];

    const formattedData = {
      ...data,
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) || '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) || '',
      date: data.date ? dayjs(data.date).toISOString() : null,
      finishOutDate: data.finishOutDate ? dayjs(data.finishOutDate).toISOString() : null,
      // Send whenever consumption slots are shown; an edit always sends (replaces rows).
      accessoryConsumption: groups.length > 0 ? allocations : undefined,
      // pcs the accessories cover (needed basis); blank ⇒ full quantity. Backend clamps to [0, qty].
      accessoryBasisPcs: (data.accessoryBasisPcs === '' || data.accessoryBasisPcs == null)
        ? (parseInt(data.quantity) || undefined)
        : parseInt(data.accessoryBasisPcs),
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.finishing.updateFinishing(editRecord._id, formattedData)
      : apiService.finishing.createFinishing(formattedData);

    request
      .then(res => {
        onAddFinishing(lotId, res);
        reset(defaultValues);
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="add-finishing-modal"
      aria-describedby="modal-to-add-new-finishing"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '80%' : '50%',
          maxHeight: '80vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
        }}
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 10, md: 10 }}>
            <Typography variant="h6" id="add-finishing-modal">
              {isEditMode ? 'Edit Finishing' : 'Add Finishing'}
            </Typography>
            <Typography variant="caption">Available Qty <b>{washAvailable != null ? washAvailable : lotQuantity}</b></Typography>
          </Grid>
          <Grid size={{ xs: 2, md: 2 }} sx={{ textAlign: 'right' }}>
            <IconButton id="close-finish-modal" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Grid>
        </Grid>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="lotNumber"
                control={control}
                rules={{ required: 'Lot Number is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Lot Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                    error={!!errors.lotNumber}
                    helperText={errors.lotNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="invoiceNumber"
                control={control}
                rules={{
                  required: 'Invoice Number is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Invoice Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                    error={!!errors.invoiceNumber}
                    helperText={errors.invoiceNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="vendorId"
                control={control}
                rules={{ required: 'Vendor is required' }}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" error={!!errors.vendorId}>
                    <InputLabel>Vendor</InputLabel>
                    <Select
                      {...field}
                      label="Vendor"
                      variant="standard"
                      onChange={(e) => {
                        field.onChange(e);
                        const v = (vendors || []).find(x => x._id === e.target.value);
                        if (v && Number(v.defaultRate) > 0) setValue('rate', v.defaultRate);
                      }}
                    >
                      {vendors.map(vendor => (
                        <MenuItem key={vendor._id} value={vendor._id}>{vendor.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.vendorId && <Typography color="error" variant="caption">{errors.vendorId.message}</Typography>}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }} sx={{ alignContent: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: 'Date is required' }}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      label="Date"
                      format="DD-MMM-YYYY"
                      slots={{ textField: MorphDateTextField }}
                      sx={{ width: '-webkit-fill-available', marginTop: '8px' }}
                      onChange={(value) => field.onChange(value)}
                      slotProps={{
                        textField: {
                          error: !!errors.date,
                          helperText: errors.date?.message,
                          variant: 'standard'
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="quantity"
                control={control}
                rules={{
                  required: 'Quantity is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Quantity"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.quantity}
                    helperText={errors.quantity?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="rate"
                control={control}
                rules={{
                  required: 'Rate is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Rate"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.rate}
                    helperText={errors.rate?.message}
                  />
                )}
              />
            </Grid>
            {isEditMode && (<><Grid size={{ xs: 3, md: 4 }}>
              <Controller
                name="quantityShort"
                control={control}
                rules={{
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="QTY Short"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.quantityShort}
                    helperText={errors.quantityShort?.message}
                  />
                )}
              />
            </Grid>
              <Grid size={{ xs: 3, md: 4 }}>
                <Controller
                  name="quantityShortDesc"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Short Desc"
                      fullWidth
                      margin="normal"
                      variant="standard"
                      multiline
                      rows={1}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }} sx={{ alignContent: 'center' }}>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <Controller
                    name="finishOutDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        {...field}
                        label="Finish Out Date"
                        format="DD-MMM-YYYY"
                        slots={{ textField: MorphDateTextField }}
                        sx={{ width: '-webkit-fill-available', marginTop: '8px' }}
                        onChange={(value) => field.onChange(value)}
                        slotProps={{
                          textField: {
                            error: !!errors.finishOutDate,
                            helperText: errors.finishOutDate?.message,
                            variant: 'standard'
                          },
                        }}
                      />
                    )}
                  />
                </LocalizationProvider>
              </Grid></>)}

            {/* ── Accessory consumption (Button / Label / Tag / Polybag) ── */}
            {accLoading && (
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ mt: 1 }}>
                  <Chip size="small" label="ACCESSORY CONSUMPTION" />
                </Divider>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              </Grid>
            )}
            {!accLoading && groups.length > 0 && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ mt: 1 }}>
                    <Chip size="small" label="ACCESSORY CONSUMPTION" />
                  </Divider>
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
                  <Controller
                    name="accessoryBasisPcs"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Accessory basis (pcs)"
                        fullWidth
                        variant="standard"
                        margin="dense"
                        onChange={(e) => { if (/^\d*$/.test(e.target.value)) { basisTouchedRef.current = true; field.onChange(e); } }}
                        helperText={`of ${baseQty} finished — lower for partial / pre-tracking`}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 8 }} sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="caption" color="text.secondary">
                    Accessories are for {basisNum} pcs · slots pre-fill to basis × ratio — raise per item for extra
                  </Typography>
                </Grid>
                {isSplit && (
                  <>
                    <Grid size={{ xs: 12 }}>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, mt: 0.5 }}>
                        PIECE SPLIT (pcs per client) —{' '}
                        <Box component="span" sx={{ color: splitOk ? 'success.main' : 'error.main' }}>
                          sum {splitSum} / {basisNum}{splitOk ? ' ✓' : ' — must equal basis'}
                        </Box>
                      </Typography>
                    </Grid>
                    {usedClients.map((ck) => (
                      <Grid key={ck} size={{ xs: 6, md: 3 }}>
                        <TextField
                          label={clientNameOf(ck)}
                          value={clientPcs[ck] ?? ''}
                          fullWidth
                          variant="standard"
                          margin="dense"
                          onChange={(e) => { if (/^\d*$/.test(e.target.value)) setClientPcs((p) => ({ ...p, [ck]: e.target.value })); }}
                        />
                      </Grid>
                    ))}
                  </>
                )}
                {groups.map((g) => {
                  const k = gKey(g);
                  const rows = consumption[k] || [];
                  const total = groupTotal(k);
                  const gMult = g.multiplier || 1;
                  const rivMult = g.rivet ? (g.rivet.multiplier || 4) : 0;
                  const fmtExtra = (n) => `${n >= 0 ? '+' : ''}${n}`;
                  return (
                    <React.Fragment key={k}>
                      <Grid size={{ xs: 12 }} sx={{ mt: 0.5 }}>
                        <Divider sx={{ mt: 1 }}>
                          <Chip
                          size="small"
                          variant="outlined"
                          color="default"
                          label={`${g.label}${g.multiplier > 1 ? ` ×${g.multiplier}` : ''}: ${total}${g.unit ? ' ' + g.unit : ''}`}
                        />
                        </Divider>
                      </Grid>
                      {rows.map((row, idx) => (
                        <React.Fragment key={idx}>
                          <Grid size={{ xs: 7, md: 8 }}>
                            <FormControl fullWidth margin="dense" variant="standard">
                              <InputLabel>{g.label} item</InputLabel>
                              <Select
                                value={row.accessoryItemId}
                                label={`${g.label} item`}
                                onChange={(e) => setRow(k, idx, 'accessoryItemId', e.target.value)}
                              >
                                {g.items.map(it => (
                                  <MenuItem key={it._id} value={String(it._id)}>
                                    {it.name}{it.clientId ? ` · ${it.clientId.name || ''}` : ' · General'}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid size={{ xs: 3, md: 2 }}>
                            <TextField
                              label="Qty"
                              value={row.qty}
                              fullWidth
                              margin="dense"
                              variant="standard"
                              onChange={(e) => { if (/^\d*$/.test(e.target.value)) setRow(k, idx, 'qty', e.target.value); }}
                            />
                          </Grid>
                          <Grid size={{ xs: 2, md: 2 }} sx={{ alignContent: 'center' }}>
                            {rows.length > 1 && (
                              <Tooltip title="Remove this split">
                                <IconButton color="error" onClick={() => removeRow(k, idx)} sx={{ mt: 1 }}><DeleteIcon /></IconButton>
                              </Tooltip>
                            )}
                            {idx === rows.length - 1 && (
                              <Tooltip title={`Split ${g.label} across another item (e.g. partial client-linked + partial general)`}>
                                <IconButton onClick={() => addRow(k)} sx={{ mt: 1 }}><AddIcon /></IconButton>
                              </Tooltip>
                            )}
                          </Grid>
                          {row.accessoryItemId && Number(row.qty) > 0 && (() => {
                            const ck = clientKeyOf(row.accessoryItemId);
                            const rb = basisFor(ck);
                            const rNeeded = rb * gMult;
                            const rExtra = (Number(row.qty) || 0) - rNeeded;
                            const ri = g.rivet ? rivetItemFor(g, ck) : null;
                            return (
                              <Grid size={{ xs: 12 }}>
                                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: rExtra < 0 ? 'error.main' : 'success.main' }}>
                                  {isSplit ? `${clientNameOf(ck)}: ` : ''}needed {rNeeded} · extra {fmtExtra(rExtra)}
                                  {ri?.itemId && (
                                    <Box component="span" color="text.secondary">
                                      {'  ·  +'}{(Number(row.qty) || 0) * rivMult} {ri.name} · extra {fmtExtra((Number(row.qty) || 0) * rivMult - rb * rivMult)}
                                    </Box>
                                  )}
                                </Typography>
                              </Grid>
                            );
                          })()}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </>
            )}

            <Grid size={{ xs: 12 }}>
              <Controller
                name="description"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Description"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    multiline
                    rows={1}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <Button
                type="submit"
                fullWidth
                endIcon={<SaveIcon />}
                loading={loading}
                loadingPosition="end"
                variant="contained"
              >
                {isEditMode ? 'UPDATE' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default AddFinishingModal;
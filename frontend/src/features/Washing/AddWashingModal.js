import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Autocomplete, Chip, Paper, Stack, Checkbox, FormControlLabel, Tooltip } from '@mui/material';
import { Close as CloseIcon, Add as AddIcon, Delete as DeleteIcon, Save as SaveIcon, Calculate as CalculateIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

// Washing add/edit with CREATION-BASED RATES:
//   • Each wash detail row multi-selects Wash Creations from the catalog.
//   • The row's RATE is AUTO-COMPUTED = SUM of the selected creations' rates for
//     the selected vendor (per-vendor rate card). Not user-editable.
//   • The server re-verifies and BLOCKS the save if any selected creation has no
//     rate for this vendor.
//   • Legacy rows (free-text creation + stored rate, no creations[]) remain
//     editable: they show their stored text and keep their rate as-is.
function AddWashingModal({ open, onClose, lotNumber, lotId, invoiceNumber, lotQuantity, vendors, onAddWashing, editRecord, prefill }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();

  const isEditMode = !!editRecord;
  const [loading, setLoading] = React.useState(false);
  // Rate card for the selected vendor: [{ creationId, name, rate|null }]
  const [rateCard, setRateCard] = useState([]);
  const [cardVendorId, setCardVendorId] = useState('');

  const emptyDetail = { washColor: 'NA', creations: [], quantity: lotQuantity || '', rate: '0', quantityShort: '', quantityShortDesc: '', washCreation: '', isSample: false };

  const defaultValues = {
    lotNumber: lotNumber || '',
    invoiceNumber: invoiceNumber || '',
    vendorId: '',
    date: dayjs(new Date()),
    washOutDate: null,
    description: '',
    washDetails: [{ ...emptyDetail }],
  };

  const { control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'washDetails',
  });

  // Subscribe to the vendor + all detail rows so the modal actually RE-RENDERS when a
  // creation is picked. `watch(name)` only READS a value — it does not subscribe — so the
  // rate stayed stale until something else happened to re-render (adding/removing a row
  // moved `fields`, which is what made the "+ Add Colour / Batch" click appear to fix it).
  // useWatch is the hook form RHF re-renders on. Declared after useFieldArray because it
  // subscribes to a field-array path.
  const watchedVendorId = useWatch({ control, name: 'vendorId' });
  const watchedDetails = useWatch({ control, name: 'washDetails' });

  const rateByCreation = useMemo(() => {
    const m = new Map();
    for (const r of rateCard) m.set(String(r.creationId), r.rate);
    return m;
  }, [rateCard]);

  // Vendor changed → load its rate card (creations with rate; null = not priced).
  useEffect(() => {
    const vid = isEditMode && editRecord && !watchedVendorId ? (editRecord.vendorId?._id || '') : (watchedVendorId || '');
    if (!vid) { setRateCard([]); setCardVendorId(''); return; }
    if (vid === cardVendorId) return;
    apiService.washCreations.getWashCreationRates(vid)
      .then(setRateCard)
      .catch(err => { console.log(err); showSnackbar(err); setRateCard([]); });
    setCardVendorId(vid);
  }, [watchedVendorId, isEditMode, editRecord, cardVendorId, showSnackbar]);

  // Map saved/legacy edit rows onto the catalog. Creation snapshots that don't
  // resolve in the catalog (catalog not loaded yet, or the creation was renamed
  // since) fall back to the stored {creationId, name} so edit mode always shows
  // what was saved — the auto-rate effect recomputes the rate from the card.
  const mapLegacyRow = (wd, catalogByName) => {
    if (Array.isArray(wd.creations) && wd.creations.length > 0) {
      return {
        ...wd,
        creations: wd.creations
          .map(c => catalogByName.get(String(c.name || '').replace(/\s+/g, ' ').trim().toUpperCase())
            || (c.creationId || c._id ? { creationId: c.creationId || c._id, name: c.name } : null))
          .filter(Boolean),
      };
    }
    const text = String(wd.washCreation || '').replace(/\s+/g, ' ').trim().toUpperCase();
    const match = text && text !== 'NA' ? catalogByName.get(text) : null;
    return { ...wd, creations: match ? [match] : [] };
  };

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('lotNumber', editRecord.lotNumber || lotNumber || '');
      setValue('invoiceNumber', editRecord.invoiceNumber || invoiceNumber || '');
      setValue('vendorId', editRecord.vendorId?._id || '');
      setValue('date', editRecord.date ? dayjs(editRecord.date) : dayjs(new Date()));
      setValue('washOutDate', editRecord.washOutDate ? dayjs(editRecord.washOutDate) : null);
      setValue('description', editRecord.description || '');
      const details = (editRecord.washDetails && editRecord.washDetails.length > 0)
        ? editRecord.washDetails
        : [{ ...emptyDetail }];
      // Catalog may not be loaded yet — re-map in a second effect once it arrives.
      setValue('washDetails', details.map(wd => mapLegacyRow(wd, new Map())));
    } else if (prefill) {
      // Pre-fill for a "washing missing" lot from the notification bell (excel values):
      // washer→vendor, date=WASH SD, quantity=pcs. Creations/rate stay open for the user.
      setValue('lotNumber', lotNumber || '');
      setValue('invoiceNumber', invoiceNumber || '');
      setValue('vendorId', prefill.vendorId || '');
      setValue('date', prefill.date ? dayjs(prefill.date) : dayjs(new Date()));
      setValue('washOutDate', null);
      setValue('description', '');
      setValue('washDetails', [{ ...emptyDetail, quantity: prefill.quantity || lotQuantity || '' }]);
    } else {
      setValue('lotNumber', lotNumber || '');
      setValue('invoiceNumber', invoiceNumber || '');
      setValue('vendorId', '');
      setValue('date', dayjs(new Date()));
      setValue('washOutDate', null);
      setValue('description', '');
      // Pre-fill the first wash detail's quantity to the available qty (stitching net of shortage).
      setValue('washDetails', [{ ...emptyDetail, quantity: lotQuantity || '' }]);
    }
  }, [editRecord, isEditMode, lotNumber, invoiceNumber, lotQuantity, prefill, setValue]);

  // Once the rate card arrives, re-map edit rows onto the catalog (best effort) and
  // recompute stored rows' displayed rate from their selections.
  useEffect(() => {
    if (!isEditMode || rateCard.length === 0 || !editRecord) return;
    const catalogByName = new Map(rateCard.map(r => [r.name.replace(/\s+/g, ' ').trim().toUpperCase(), r]));
    const current = getValues('washDetails') || [];
    replace(current.map(wd => mapLegacyRow(wd, catalogByName)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateCard]);

  // Auto-rate: creation-based rows recompute from the card; legacy rows keep their rate.
  useEffect(() => {
    if (!watchedDetails) return;
    watchedDetails.forEach((wd, idx) => {
      // Sample rows are never billed — pin their stored rate to 0.
      if (wd?.isSample) {
        if (Number(wd.rate) !== 0) setValue(`washDetails.${idx}.rate`, '0', { shouldValidate: false });
        return;
      }
      const selected = wd?.creations || [];
      if (selected.length === 0) return; // legacy row — leave its stored rate
      const sum = selected.reduce((s, c) => {
        const r = rateByCreation.get(String(c.creationId || c._id));
        return s + (r === undefined || r === null ? 0 : Number(r));
      }, 0);
      const rounded = Math.round(sum * 100) / 100;
      if (Number(wd.rate) !== rounded) {
        setValue(`washDetails.${idx}.rate`, String(rounded), { shouldValidate: false });
      }
    });
  }, [watchedDetails, rateByCreation, setValue]);

  // Single source of truth for a row's EFFECTIVE rate — recomputed straight from the
  // current selections × the vendor's rate card, so it is correct on the very render
  // that a creation is added/removed (no waiting for the setValue effect or the next
  // "Add Colour / Batch" click). Sample rows are never billed → 0. Legacy rows
  // (free-text washCreation, no catalog match) keep their stored rate.
  const rowRateOf = (wd) => {
    if (wd?.isSample) return 0;
    const sel = wd?.creations || [];
    const legacy = sel.length === 0 && !!(wd?.washCreation && String(wd.washCreation).trim()) && wd.rate;
    if (legacy) return Number(wd.rate) || 0;
    return Math.round(sel.reduce((s, c) => {
      const r = rateByCreation.get(String(c.creationId || c._id));
      return s + (r === undefined || r === null ? 0 : Number(r));
    }, 0) * 100) / 100;
  };

  // Running totals for the summary chips: Σ row quantity and Σ qty × rate = the
  // vendor's wash bill. Both use rowRateOf above, so the chips can never lag the
  // rows on screen.
  //
  // Two valid entry conventions (the server reconciles them the same way):
  //   A) Qty = pcs sent to wash       → Σ Qty must equal the available qty.
  //   B) Qty = good pcs returned,
  //      Short = the missing few      → Σ (Qty + Short) must equal it.
  // A short-counted (B-style) entry is normalised server-side to A before it is
  // saved, so the bill is always on the pcs the washer was given — hence the
  // bill chip adds each row's short to its qty when the short is what counted.
  const availQty = parseInt(lotQuantity, 10) || 0;
  const totalQty = (watchedDetails || []).reduce((s, d) => s + (parseInt(d?.quantity, 10) || 0), 0);
  const totalShort = (watchedDetails || []).reduce((s, d) => s + (parseInt(d?.quantityShort, 10) || 0), 0);
  const shortCounted = totalQty !== availQty && totalShort > 0 && totalQty + totalShort === availQty;
  const billedRowQty = (d) => (parseInt(d?.quantity, 10) || 0) + (shortCounted ? (parseInt(d?.quantityShort, 10) || 0) : 0);
  const totalAmount = (watchedDetails || []).reduce((s, d) => s + billedRowQty(d) * rowRateOf(d), 0);
  const sampleQty = (watchedDetails || []).reduce((s, d) => s + (d?.isSample ? (parseInt(d?.quantity, 10) || 0) : 0), 0);
  const qtyMismatch = !!lotQuantity && !(totalQty === availQty || shortCounted);

  const creationOptions = rateCard; // [{ creationId, name, rate|null }]
  const getOptionRate = (opt) => rateByCreation.get(String(opt.creationId));

  const onSubmit = (data) => {
    // Client-side pre-check mirrors the server block: every creation-based row
    // must only contain PRICED creations for this vendor.
    for (let i = 0; i < (data.washDetails || []).length; i++) {
      const wd = data.washDetails[i];
      // Sample rows: never billed — unpriced (or no) creations are fine, rate stays 0.
      if (wd.isSample) continue;
      if ((wd.creations || []).length === 0) {
        if (!wd.washCreation || !wd.washCreation.trim()) {
          return showSnackbar(`Row ${i + 1}: select at least one wash creation`, 'error');
        }
        continue; // legacy-style row: keep the free text + stored rate
      }
      const unpriced = (wd.creations || []).filter(c => {
        const r = rateByCreation.get(String(c.creationId || c._id));
        return r === undefined || r === null;
      });
      if (unpriced.length > 0) {
        return showSnackbar(`No rate set for "${unpriced[0].name}" for this vendor — complete the vendor's rate card first`, 'error');
      }
    }

    const formattedData = {
      ...data,
      date: data.date ? dayjs(data.date).toISOString() : null,
      washOutDate: data.washOutDate ? dayjs(data.washOutDate).toISOString() : null,
      // Normalise rows for the API: creation-based rows send {creationId, name}; the
      // server computes the rate. Legacy rows send their free text + rate untouched.
      washDetails: (data.washDetails || []).map(wd => {
        if (wd.isSample) {
          // Sample rows: rate forced 0, creations optional (snapshot only), and the
          // required echo text falls back to a sample marker when nothing is selected.
          const sel = (wd.creations || []).filter(c => c.creationId || c._id);
          return {
            washColor: wd.washColor,
            quantity: wd.quantity,
            quantityShort: wd.quantityShort,
            quantityShortDesc: wd.quantityShortDesc,
            isSample: true,
            creations: sel.map(c => ({ creationId: c.creationId || c._id, name: c.name })),
            rate: 0,
            washCreation: sel.map(c => c.name).join(' + ') || 'SAMPLE (NOT BILLED)',
          };
        }
        if ((wd.creations || []).length > 0) {
          return {
            washColor: wd.washColor,
            quantity: wd.quantity,
            quantityShort: wd.quantityShort,
            quantityShortDesc: wd.quantityShortDesc,
            isSample: false,
            creations: wd.creations.map(c => ({ creationId: c.creationId || c._id, name: c.name })),
            rate: wd.rate,
            washCreation: (wd.creations || []).map(c => c.name).join(' + '),
          };
        }
        return wd;
      }),
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.washing.updateWashing(editRecord._id, formattedData)
      : apiService.washing.createWashing(formattedData);

    request
      .then(res => {
        onAddWashing(lotId, res);
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
      aria-labelledby="add-washing-modal"
      aria-describedby="modal-to-add-new-washing"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '85%' : '55%',
          maxHeight: '85vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
        }}
      >
        <Grid container spacing={2}>
          <Grid size={{ xs: 10, md: 10 }}>
            <Typography variant="h6" id="add-washing-modal">
              {isEditMode ? 'Edit Washing' : 'Add Washing'}
            </Typography>
            <Chip size="small" variant="outlined" color="primary" sx={{ mt: 0.5 }} label={`Available Quantity: ${lotQuantity}`} />
          </Grid>
          <Grid size={{ xs: 2, md: 2 }} sx={{ textAlign: 'right' }}>
            <IconButton id="close-wash-modal" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Grid>
        </Grid>
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller
                name="lotNumber"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Lot Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller
                name="invoiceNumber"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Invoice Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
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
                      variant='standard'
                      onChange={(e) => {
                        field.onChange(e);
                        // New vendor → clear selections; the rate card (and thus valid
                        // options + rates) is different per vendor.
                        const current = getValues('washDetails') || [];
                        replace(current.map(d => ({ ...d, creations: [] })));
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
            <Grid size={{ xs: 6, md: 6 }} sx={{ alignContent: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: 'Required!' }}
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
            {fields.map((wd, index) => {
              const rowWatch = watchedDetails?.[index] || {};
              const selected = rowWatch.creations || [];
              const isLegacyRow = selected.length === 0 && !!(rowWatch.washCreation && rowWatch.washCreation.trim()) && rowWatch.rate;
              const isSampleRow = !!rowWatch.isSample;
              const rowQty = parseInt(rowWatch.quantity, 10) || 0;
              // Same helper the totals chips use — the row and the wash bill can
              // never disagree, and both update on the render that toggles a creation.
              const displayRate = rowRateOf(rowWatch);
              const rowAmount = Math.round(rowQty * displayRate * 100) / 100;
              return (
              <Grid size={{ xs: 12 }} key={wd.id}>
                <Paper variant="outlined" sx={{ p: { xs: 1.25, md: 2 }, mb: 1, borderRadius: 2, bgcolor: isSampleRow ? 'action.hover' : 'background.paper' }}>
                  <Grid container spacing={2}>
                    {/* Wash Colour retired — rows are creation-based now. Legacy rows
                        carry a free-text washCreation and keep their stored rate. */}
                    <Grid size={{ xs: 12, sm: 8 }} sx={{ alignContent: 'center' }}>
                      <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                          Colour / Batch {index + 1}{isLegacyRow ? ' · legacy' : ''}
                        </Typography>
                        <Tooltip title="Sample pcs: within this lot's quantity, but the washer does NOT bill them — rate stays 0. Finishing bills the whole lot including samples.">
                          <FormControlLabel
                            control={
                              <Checkbox
                                size="small"
                                checked={isSampleRow}
                                onChange={(e) => setValue(`washDetails.${index}.isSample`, e.target.checked, { shouldDirty: true })}
                              />
                            }
                            label={<Typography variant="caption" color={isSampleRow ? 'warning.main' : 'text.secondary'}>Sample</Typography>}
                            sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.75rem' } }}
                          />
                        </Tooltip>
                      </Stack>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 4 }} sx={{ textAlign: 'right' }}>
                      {index > 0 && (
                        <IconButton size="small" color="error" onClick={() => remove(index)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      )}
                    </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                  <Controller
                    name={`washDetails[${index}].quantity`}
                    control={control}
                    rules={{
                      required: 'Required!',
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
                        error={!!errors.washDetails?.[index]?.quantity}
                        helperText={errors.washDetails?.[index]?.quantity?.message}
                        sx={{ mb: 1 }}
                      />
                    )}
                  />
                </Grid>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <Controller
                        name={`washDetails[${index}].rate`}
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            value={isSampleRow ? '0' : String(displayRate)}
                            label="Rate (auto)"
                            fullWidth
                            margin="normal"
                            variant="standard"
                            InputProps={{ readOnly: true }}
                            sx={{ mb: 1 }}
                            helperText={isSampleRow
                              ? 'Sample — not billed (rate 0)'
                              : isLegacyRow
                                ? 'Legacy row — stored rate kept'
                                : 'Sum of the selected creations\u2019 rates'}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 4 }} sx={{ alignContent: 'center' }}>
                      <Box sx={{ mt: { xs: 0.5, md: 2.25 } }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {isSampleRow ? 'Sample — no wash bill' : 'Row amount (Qty × Rate)'}
                        </Typography>
                        <Typography variant="body1" fontWeight="bold" color={isSampleRow ? 'text.secondary' : 'inherit'}>
                          ₹{rowAmount.toLocaleString('en-IN')}
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Controller
                        name={`washDetails[${index}].creations`}
                    control={control}
                    rules={{
                      validate: (value) => {
                        // Sample rows don't need creations (they aren't billed).
                        if (isSampleRow) return true;
                        // Creation-based row required; legacy text row is the escape hatch.
                        if ((value || []).length > 0) return true;
                        const txt = getValues(`washDetails[${index}].washCreation`);
                        return (txt && txt.trim() && txt.toUpperCase() !== 'NA') || 'Select at least one wash creation';
                      },
                    }}
                    render={({ field, fieldState: { error } }) => (
                      <Autocomplete
                        {...field}
                        multiple
                        options={creationOptions}
                        disableCloseOnSelect
                        getOptionLabel={(o) => o.name}
                        isOptionEqualToValue={(o, v) => String(o.creationId) === String(v.creationId || v._id)}
                        value={field.value || []}
                        onChange={(_, value) => field.onChange(value)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Wash Creations (multi-select)"
                            placeholder={watchedVendorId ? 'Select creations…' : 'Select a vendor first'}
                            variant="standard"
                            fullWidth
                            margin="normal"
                            error={!!error || !!errors.washDetails?.[index]?.creations}
                            helperText={error?.message || (watchedVendorId ? '' : 'Rate card loads once a vendor is chosen')}
                            sx={{ mb: 1 }}
                          />
                        )}
                        renderOption={(props, option) => {
                          const r = getOptionRate(option);
                          const priced = r !== undefined && r !== null;
                          return (
                            <li {...props} key={String(option.creationId)}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                <Typography variant="body2">{option.name}</Typography>
                                <Typography variant="caption" color={priced ? 'text.secondary' : 'error'}>
                                  {priced ? `Rs. ${r}` : 'NOT PRICED'}
                                </Typography>
                              </Box>
                            </li>
                          );
                        }}
                        renderTags={(value, getTagProps) =>
                          value.map((option, i) => {
                            const r = getOptionRate(option);
                            const priced = r !== undefined && r !== null;
                            return (
                              <Chip
                                {...getTagProps({ index: i })}
                                key={String(option.creationId)}
                                size="small"
                                color={priced ? 'primary' : 'error'}
                                label={priced ? `${option.name} (${r})` : `${option.name} — not priced`}
                              />
                            );
                          })
                        }
                      />
                    )}
                  />
                </Grid>
                {isEditMode && <>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <Controller
                      name={`washDetails[${index}].quantityShort`}
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
                          error={!!errors.washDetails?.[index]?.quantityShort}
                          helperText={errors.washDetails?.[index]?.quantityShort?.message}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 8 }}>
                    <Controller
                      name={`washDetails[${index}].quantityShortDesc`}
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
                </>}
                  </Grid>
                </Paper>
              </Grid>
              );
            })}
            <Grid size={{ xs: 12 }}>
              <Button
                variant="text"
                startIcon={<AddIcon />}
                onClick={() => append({ washColor: 'NA', creations: [], quantity: '', rate: '0', quantityShort: '', quantityShortDesc: '', washCreation: '', isSample: false })}
              >
                Add Colour / Batch
              </Button>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  size="small"
                  variant={qtyMismatch ? 'filled' : 'outlined'}
                  color={qtyMismatch ? 'error' : 'success'}
                  label={`Σ Qty: ${totalQty}${shortCounted ? ` + ${totalShort} short` : ''}${lotQuantity ? ` / ${lotQuantity} available` : ''}`}
                />
                <Chip size="small" variant="outlined" color="primary" label={`Wash bill: ₹${totalAmount.toLocaleString('en-IN')}`} />
                {sampleQty > 0 && (
                  <Chip size="small" variant="outlined" color="warning" label={`incl. ${sampleQty} sample (not billed)`} />
                )}
              </Stack>
              {qtyMismatch && (
                <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                  Total wash quantity (+ Short) must equal the available quantity ({lotQuantity}).
                </Typography>
              )}
            </Grid>
            <Grid size={{ xs: 12, md: 12 }}>
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
                    sx={{ mt: 1 }}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 12 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <CalculateIcon fontSize="inherit" />
                Rate = SUM of the selected creations' rates for the chosen vendor. A missing rate blocks the save.
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
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

export default AddWashingModal;
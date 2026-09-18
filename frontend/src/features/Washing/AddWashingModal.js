import React, { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Divider, Autocomplete, Chip } from '@mui/material';
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

  const emptyDetail = { washColor: 'NA', creations: [], quantity: lotQuantity || '', rate: '0', quantityShort: '', quantityShortDesc: '', washCreation: '' };

  const defaultValues = {
    lotNumber: lotNumber || '',
    invoiceNumber: invoiceNumber || '',
    vendorId: '',
    date: dayjs(new Date()),
    washOutDate: null,
    description: '',
    washDetails: [{ ...emptyDetail }],
  };

  const { control, handleSubmit, reset, setValue, getValues, watch, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: 'washDetails',
  });

  // Watch the vendor + all detail rows so the auto-rate recomputes live.
  const watchedVendorId = watch('vendorId');
  const watchedDetails = watch('washDetails');

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

  const creationOptions = rateCard; // [{ creationId, name, rate|null }]
  const getOptionRate = (opt) => rateByCreation.get(String(opt.creationId));

  const onSubmit = (data) => {
    // Client-side pre-check mirrors the server block: every creation-based row
    // must only contain PRICED creations for this vendor.
    for (let i = 0; i < (data.washDetails || []).length; i++) {
      const wd = data.washDetails[i];
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
        if ((wd.creations || []).length > 0) {
          return {
            washColor: wd.washColor,
            quantity: wd.quantity,
            quantityShort: wd.quantityShort,
            quantityShortDesc: wd.quantityShortDesc,
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
            <Typography variant="caption">Available Quantity <b>{lotQuantity}</b></Typography>
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
              return (
              <React.Fragment key={wd.id}>
                <Grid size={{ xs: 6, md: 6 }}>
                  <Controller
                    name={`washDetails[${index}].washColor`}
                    control={control}
                    rules={{ required: 'Required!' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase());
                        }}
                        label="Wash Color"
                        fullWidth
                        margin="normal"
                        variant="standard"
                        error={!!errors.washDetails?.[index]?.washColor}
                        helperText={errors.washDetails?.[index]?.washColor?.message}
                        sx={{ mb: 1 }}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 6 }}>
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
                <Grid size={{ xs: 12, md: 8 }}>
                  <Controller
                    name={`washDetails[${index}].creations`}
                    control={control}
                    rules={{
                      validate: (value) => {
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
                <Grid size={{ xs: 12, md: 4 }}>
                  <Controller
                    name={`washDetails[${index}].rate`}
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Rate (auto)"
                        fullWidth
                        margin="normal"
                        variant="standard"
                        InputProps={{ readOnly: true }}
                        sx={{ mb: 1 }}
                        helperText={isLegacyRow ? `Legacy row — stored rate kept` : 'Sum of the selected creations\u2019 rates'}
                      />
                    )}
                  />
                </Grid>
                {isEditMode && <>
                  <Grid size={{ xs: 3, md: 3 }}>
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
                  <Grid size={{ xs: 9, md: 9 }}>
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
                <Grid size={{ xs: 3, md: 3 }} sx={{ alignContent: 'center' }}>
                  {index > 0 && <IconButton sx={{ mt: 2 }} onClick={() => remove(index)} color="error">
                    <DeleteIcon />
                  </IconButton>}
                  {index === fields.length - 1 && <IconButton sx={{ mt: 2 }}
                    onClick={() => append({ washColor: '', creations: [], quantity: '', rate: '0', quantityShort: '', quantityShortDesc: '', washCreation: '' })}
                  >
                    <AddIcon />
                  </IconButton>}
                </Grid>
                <Grid size={{ xs: 12, md: 12 }} sx={{ m: 0, p: 0 }}>
                  {fields.length > 1 && <Divider fullWidth />}
                </Grid>
              </React.Fragment>
              );
            })}
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
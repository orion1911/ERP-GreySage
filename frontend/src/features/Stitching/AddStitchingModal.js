import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Divider, Chip, CircularProgress } from '@mui/material';
import { Close as CloseIcon, Delete as DeleteIcon, Save as SaveIcon, Add as AddIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddStitchingModal({ open, onClose, clients, fitStyles, vendors, onAddStitching, editRecord, prefill }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEditMode = !!editRecord;
  const [loading, setLoading] = React.useState(false);

  const defaultValues = {
    clientId: '',
    fabric: '',
    fitStyleId: '',
    waistSize: '',
    lotNumber: '',
    invoiceNumber: '',
    vendorId: '',
    quantity: '',
    quantityShort: '',
    quantityShortDesc: '',
    rate: '',
    threadColors: [{ color: '', quantity: '' }],
    zipperConsumption: [],
    date: dayjs(new Date()),
    stitchOutDate: null,
    description: ''
  };

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'threadColors',
  });

  // ── Zipper consumption (stock-out recorded at the stitching stage) ──
  // Show ALL zipper types applicable to the selected client (client mapping if any,
  // else general), each defaulting to 0; the sum must equal the lot quantity.
  const [zipperTypeId, setZipperTypeId] = React.useState(null);
  const [zipperItems, setZipperItems] = React.useState([]);
  const [zipperLoading, setZipperLoading] = React.useState(false); // zipper section fetch in-flight
  const watchedClientId = useWatch({ control, name: 'clientId' });
  const watchedZipper = useWatch({ control, name: 'zipperConsumption' });
  const watchedQuantity = useWatch({ control, name: 'quantity' });
  const watchedFitStyle = useWatch({ control, name: 'fitStyleId' });
  // When the bell prefills a lot whose excel STYLE didn't match a Fit Style in the app,
  // show the raw value as a hint so the user can pick the right one. Hides once selected.
  const fitStyleHint = prefill && prefill.fitStyleName && !watchedFitStyle ? prefill.fitStyleName : '';

  const zipperTotal = (watchedZipper || []).reduce((s, z) => s + (Number(z?.qty) || 0), 0);
  // Once zipper items are shown for the client, the entered quantities must total the
  // lot quantity (spec rule). Drives the inline validation message + red fields.
  const zipperShown = zipperItems.length > 0;
  // Zero is allowed (old records have no zipper data); only flag a partial entry that
  // doesn't add up to the lot quantity.
  const zipperMismatch = zipperShown && zipperTotal > 0 && zipperTotal !== Number(watchedQuantity || 0);

  // Resolve the zipper article-type once.
  useEffect(() => {
    let active = true;
    apiService.accessories.getTypes()
      .then(types => { if (active) setZipperTypeId((types.find(t => t.key === 'zipper') || {})._id || null); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load applicable zipper items for the selected client and seed the form's zipperConsumption
  // rows. In edit mode the items and any previously-recorded consumption are fetched IN PARALLEL
  // (this used to chain consumption → items, leaving the section blank for a second or two on a
  // cold backend), and `zipperLoading` drives a spinner placeholder so the section shows progress
  // instead of nothing.
  useEffect(() => {
    if (!open) return;
    if (!watchedClientId) { setZipperItems([]); setValue('zipperConsumption', []); setZipperLoading(false); return; }
    if (!zipperTypeId) { setZipperLoading(true); return; } // still resolving the zipper type — keep the placeholder
    let active = true;
    setZipperLoading(true);
    const itemsP = apiService.accessories.getApplicableItems(zipperTypeId, watchedClientId).catch(() => []);
    const consP = (isEditMode && editRecord?.lotId?._id)
      ? apiService.accessories.getConsumption(editRecord.lotId._id, 'stitching').catch(() => [])
      : Promise.resolve([]);
    Promise.all([itemsP, consP])
      .then(([items, rows]) => {
        if (!active) return;
        const sortedItems = [...(items || [])].sort(
          (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        const prefill = {};
        (rows || []).forEach(r => { prefill[String(r.accessoryItemId)] = r.qty; });
        setZipperItems(sortedItems);
        setValue('zipperConsumption', (sortedItems).map(i => ({
          accessoryItemId: i._id,
          name: i.name,
          qty: prefill[String(i._id)] != null ? prefill[String(i._id)] : 0,
        })));
      })
      .finally(() => { if (active) setZipperLoading(false); });
    return () => { active = false; };
  }, [open, zipperTypeId, watchedClientId, isEditMode, editRecord, setValue]);

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('clientId', editRecord.lotId?.clientId?._id || '');
      setValue('fabric', editRecord.lotId?.fabric || '');
      setValue('fitStyleId', editRecord.lotId?.fitStyleId?._id || '');
      setValue('waistSize', editRecord.lotId?.waistSize || '');
      setValue('lotNumber', editRecord.lotId?.lotNumber || '');
      setValue('invoiceNumber', editRecord.lotId?.invoiceNumber || '');
      setValue('vendorId', editRecord.vendorId?._id || '');
      setValue('quantity', editRecord.quantity || '');
      setValue('quantityShort', editRecord.quantityShort || '');
      setValue('quantityShortDesc', editRecord.quantityShortDesc || '');
      setValue('rate', editRecord.rate || '');
      setValue('threadColors', editRecord.threadColors?.length > 0 ? editRecord.threadColors : [{ color: '', quantity: '' }]);
      setValue('date', editRecord.date ? dayjs(editRecord.date) : dayjs(new Date()));
      setValue('stitchOutDate', editRecord.stitchOutDate ? dayjs(editRecord.stitchOutDate) : null);
      setValue('description', editRecord.description || '');
    } else if (prefill) {
      // Pre-fill for a "Not in App" lot coming from the notification bell (excel values).
      reset(defaultValues);
      if (prefill.lotNumber) setValue('lotNumber', prefill.lotNumber);
      if (prefill.invoiceNumber) setValue('invoiceNumber', prefill.invoiceNumber);
      if (prefill.clientId) setValue('clientId', prefill.clientId);
      if (prefill.vendorId) setValue('vendorId', prefill.vendorId);
      if (prefill.rate) setValue('rate', prefill.rate);
      if (prefill.fitStyleId) setValue('fitStyleId', prefill.fitStyleId); // matched; else hint shown below the field
      if (prefill.fabric) setValue('fabric', prefill.fabric);
      if (prefill.waistSize) setValue('waistSize', prefill.waistSize);
      if (prefill.quantity) setValue('quantity', prefill.quantity);
      if (prefill.threadColors) setValue('threadColors', prefill.threadColors);
      if (prefill.date) setValue('date', dayjs(prefill.date));
    } else {
      reset(defaultValues);
    }
  }, [editRecord, isEditMode, prefill, reset, setValue]);

  const validateLotNumber = (value) => {
    if (!value) return 'Lot Number is required';
    const parts = value.replace(/\s/g, '').toUpperCase().split('/');
    if (parts.length !== 2 && parts.length !== 3) {
      return 'SERIES/SUBSERIES/NUM (A/1/3)';
    }
    if (!/^[A-Z]+$/.test(parts[0])) {
      return 'Series must contain one or more uppercase letters';
    }
    if (!/^\d+$/.test(parts[1])) {
      return 'Sub-series must be a number';
    }
    if (parts.length === 3 && !/^\d+$/.test(parts[2])) {
      return 'Lot number must be a number';
    }
    return true;
  };

  const onSubmit = (data) => {
    const totalThreadQuantity = data.threadColors.reduce((sum, tc) => sum + Number(tc.quantity || 0), 0);
    if (totalThreadQuantity !== Number(data.quantity)) {
      showSnackbar(`Sum of thread color quantities (${totalThreadQuantity}) must equal total quantity (${data.quantity})`, 'error');
      return;
    }

    // Zipper consumption is required once applicable zipper items are shown: the entered
    // quantities must total the lot quantity.
    const zipperRows = (data.zipperConsumption || []).map(z => ({ accessoryItemId: z.accessoryItemId, qty: Number(z.qty) || 0 }));
    const zipperSum = zipperRows.reduce((sum, z) => sum + z.qty, 0);
    if (zipperItems.length > 0 && zipperSum > 0 && zipperSum !== Number(data.quantity)) {
      showSnackbar(`Sum of zipper quantities (${zipperSum}) must equal total quantity (${data.quantity})`, 'error');
      return;
    }

    const formattedData = {
      ...data,
      lotNumber: data.lotNumber.toUpperCase().replaceAll(' ', ''),
      fabric: data.fabric.toUpperCase().trim(),
      waistSize: data.waistSize.toUpperCase().trim(),
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) ?? '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) ?? '',
      threadColors: data.threadColors.map(tc => ({ color: tc.color.trim(), quantity: Number(tc.quantity) })),
      // Send zipper rows whenever the section is shown (an all-zero array clears prior consumption on edit).
      zipperConsumption: zipperItems.length > 0 ? zipperRows : undefined,
      date: data.date.toISOString(),
      stitchOutDate: data.stitchOutDate ? data.stitchOutDate.toISOString() : null,
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.stitching.updateStitching(editRecord._id, formattedData)
      : apiService.stitching.createStitching(formattedData);

    request
      .then(res => {
        onAddStitching(res);
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
      aria-labelledby="add-stitching-modal"
      aria-describedby="modal-to-add-new-stitching"
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" id="add-stitching-modal">{isEditMode ? 'Edit Stitching' : 'Add Stitching'}</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          <Grid container spacing={2}>
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
                name="lotNumber"
                control={control}
                rules={{ required: 'Lot Number is required', validate: validateLotNumber }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Lot Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.lotNumber}
                    helperText={errors.lotNumber?.message}
                    placeholder="e.g., A/2 or A/1/3"
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
                    error={!!errors.invoiceNumber}
                    helperText={errors.invoiceNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="clientId"
                control={control}
                rules={{ required: 'Client is required' }}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" error={!!errors.clientId}>
                    <InputLabel>Client</InputLabel>
                    <Select
                      {...field}
                      label="Client"
                      variant="standard"
                    >
                      {(clients || []).map(client => (
                        <MenuItem key={client._id} value={client._id}>{client.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.clientId && <Typography color="error" variant="caption">{errors.clientId.message}</Typography>}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="fitStyleId"
                control={control}
                rules={{ required: 'Fit Style is required' }}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" error={!!errors.fitStyleId}>
                    <InputLabel>Fit Style</InputLabel>
                    <Select
                      {...field}
                      label="Fit Style"
                      variant="standard"
                    >
                      {(fitStyles || []).map(fs => (
                        <MenuItem key={fs._id} value={fs._id}>{fs.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.fitStyleId && <Typography color="error" variant="caption">{errors.fitStyleId.message}</Typography>}
                    {fitStyleHint && (
                      <Typography color="warning.main" variant="caption" sx={{ display: 'block' }}>
                        MAKINGS: “{fitStyleHint}”
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="fabric"
                control={control}
                rules={{ required: 'Fabric is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Fabric"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.fabric}
                    helperText={errors.fabric?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="waistSize"
                control={control}
                rules={{ required: 'Waist Size is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Waist Size"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.waistSize}
                    helperText={errors.waistSize?.message}
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
            <Grid size={{ xs: 6, md: 2 }}>
              <Controller
                name="quantity"
                control={control}
                rules={{
                  required: 'Quantity is required',
                  pattern: {
                    value: /^[0-9]+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Total Quantity"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.quantity}
                    helperText={errors.quantity?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
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
            {fields.map((tc, index) => (
              <React.Fragment key={tc.id}>
                <Grid size={{ xs: 6, md: 4 }}>
                  <Controller
                    name={`threadColors[${index}].color`}
                    control={control}
                    rules={{ required: 'Thread Color is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase());
                        }}
                        label="Thread Color"
                        fullWidth
                        margin="normal"
                        variant="standard"
                        error={!!errors.threadColors?.[index]?.color}
                        helperText={errors.threadColors?.[index]?.color?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 3, md: 4 }}>
                  <Controller
                    name={`threadColors[${index}].quantity`}
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
                        error={!!errors.threadColors?.[index]?.quantity}
                        helperText={errors.threadColors?.[index]?.quantity?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 3, md: 4 }} sx={{ alignContent: 'center' }}>
                  {index > 0 && (
                    <IconButton sx={{ mt: 2 }} onClick={() => remove(index)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  )}
                  {index === fields.length - 1 && (
                    <IconButton sx={{ mt: 2 }} onClick={() => append({ color: '', quantity: '' })}>
                      <AddIcon />
                    </IconButton>
                  )}
                </Grid>
              </React.Fragment>
            ))}

            {/* ── Zipper consumption (stock) ── */}
            {zipperLoading && (
              <Grid size={{ xs: 12 }}>
                <Divider sx={{ mt: 1 }}>
                  <Chip size="small" label="ZIPPER" />
                </Divider>
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress size={24} />
                </Box>
              </Grid>
            )}
            {!zipperLoading && zipperShown && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ mt: 1 }}>
                    <Chip
                      size="small"
                      color={zipperMismatch ? 'error' : 'default'}
                      label={`ZIPPER  ${zipperTotal} / ${Number(watchedQuantity || 0)}`}
                    />
                  </Divider>
                  {zipperMismatch && (
                    <Typography color="error" variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
                      Zipper quantities must total {Number(watchedQuantity || 0)} (currently {zipperTotal}) — or leave all 0 to skip
                    </Typography>
                  )}
                </Grid>
                {zipperItems.map((zi, index) => (
                  <Grid size={{ xs: 6, md: 4 }} key={zi._id}>
                    <Controller
                      name={`zipperConsumption.${index}.qty`}
                      control={control}
                      rules={{ pattern: { value: /^\d*$/, message: 'Only numbers allowed' } }}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value ?? 0}
                          onFocus={(e) => { if (String(field.value) === '0') field.onChange(''); }}
                          onBlur={(e) => { if (e.target.value === '') field.onChange(0); }}
                          label={zi.name}
                          fullWidth
                          margin="normal"
                          variant="standard"
                          error={zipperMismatch || !!errors.zipperConsumption?.[index]?.qty}
                          helperText={errors.zipperConsumption?.[index]?.qty?.message}
                        />
                      )}
                    />
                  </Grid>
                ))}
              </>
            )}

            {isEditMode && <><Grid size={{ xs: 6, md: 4 }}>
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
                    label="Quantity Short"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.quantityShort}
                    helperText={errors.quantityShort?.message}
                  />
                )}
              />
            </Grid>
              <Grid size={{ xs: 6, md: 8 }}>
                <Controller
                  name="quantityShortDesc"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Shortage Description"
                      fullWidth
                      margin="normal"
                      variant="standard"
                      multiline
                      rows={1}
                    />
                  )}
                />
              </Grid></>}
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

export default AddStitchingModal;

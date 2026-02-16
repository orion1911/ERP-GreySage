import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Close as CloseIcon, Delete as DeleteIcon, Save as SaveIcon, Add as AddIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddStitchingModal({ open, onClose, clients, fitStyles, vendors, onAddStitching, editRecord }) {
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
    } else {
      reset(defaultValues);
    }
  }, [editRecord, isEditMode, reset, setValue]);

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

    const formattedData = {
      ...data,
      lotNumber: data.lotNumber.toUpperCase().replaceAll(' ', ''),
      fabric: data.fabric.toUpperCase().trim(),
      waistSize: data.waistSize.toUpperCase().trim(),
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) || '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) || '',
      threadColors: data.threadColors.map(tc => ({ color: tc.color.trim(), quantity: Number(tc.quantity) })),
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
        <form onSubmit={handleSubmit(onSubmit)}>
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
                    value: /^\d+$/,
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

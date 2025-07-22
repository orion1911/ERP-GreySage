import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddStitchingModal({ open, onClose, orderId, vendors, onAddStitching, editRecord }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEditMode = !!editRecord;
  const [loading, setLoading] = React.useState(false);

  const defaultValues = {
    orderId,
    lotNumber: '',
    invoiceNumber: '',
    vendorId: '',
    quantity: '',
    quantityShort: '',
    rate: '',
    date: dayjs(new Date()),
    stitchOutDate: null,
    description: ''
  };

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('orderId', editRecord.orderId || orderId);
      setValue('lotNumber', editRecord.lotId?.lotNumber || '');
      setValue('invoiceNumber', editRecord.lotId?.invoiceNumber || '');
      setValue('vendorId', editRecord.vendorId?._id || '');
      setValue('quantity', editRecord.quantity || '');
      setValue('quantityShort', editRecord.quantityShort || '');
      setValue('rate', editRecord.rate || '');
      setValue('date', editRecord.date ? dayjs(editRecord.date) : dayjs(new Date()));
      setValue('stitchOutDate', editRecord.stitchOutDate ? dayjs(editRecord.stitchOutDate) : null);
      setValue('description', editRecord.description || '');
    } else {
      reset(defaultValues);
    }
  }, [editRecord, isEditMode, orderId, reset, setValue]);

  const validateLotNumber = (value) => {
    if (!value) return 'Lot Number is required';
    const parts = value.replace(/\s/g, '').toUpperCase().split('/');
    if (parts.length !== 2 && parts.length !== 3) {
      return 'SERIES/SUBSERIES/NUM (A/1/3)';
    }
    if (!/^[A-Z]$/.test(parts[0])) {
      return 'Series must be a single uppercase letter';
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
    const formattedData = {
      ...data,
      lotNumber: data.lotNumber.toUpperCase().replaceAll(' ', ''),
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) || '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) || '',
      date: data.date.toISOString(),
      stitchOutDate: data.stitchOutDate ? data.stitchOutDate.toISOString() : null,
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.stitching.updateStitching(editRecord._id, formattedData)
      : apiService.stitching.createStitching(formattedData);

    request
      .then(res => {
        setLoading(false);
        onAddStitching(res);
        reset(defaultValues);
        onClose();
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
        setLoading(false);
      })
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
import React, { useEffect, useState } from 'react';
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

function AddFinishingModal({ open, onClose, orderId, lotNumber, lotId, invoiceNumber, lotQuantity, vendors, onAddFinishing, editRecord }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEditMode = !!editRecord;
  const [loading, setLoading] = useState(false);

  const defaultValues = {
    orderId,
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
  };

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('orderId', editRecord.orderId || orderId);
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
    }
  }, [editRecord, isEditMode, lotNumber, invoiceNumber, orderId, setValue]);

  const onSubmit = (data) => {
    const formattedData = {
      ...data,
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) || '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) || '',
      date: data.date ? dayjs(data.date).toISOString() : null,
      finishOutDate: data.finishOutDate ? dayjs(data.finishOutDate).toISOString() : null,
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.finishing.updateFinishing(editRecord._id, formattedData)
      : apiService.finishing.createFinishing(formattedData);

    request
      .then(res => {
        setLoading(false);
        onAddFinishing(lotId, res);
        reset(defaultValues);
        onClose();
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
        setLoading(false);
      });
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
            <Typography variant="caption">Lot Quantity <b>{lotQuantity}</b></Typography>
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
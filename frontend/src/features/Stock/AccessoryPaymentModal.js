import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Modal, Typography, IconButton, Grid, TextField, Button,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AccessoryPaymentModal({ open, onClose, type, editPayment, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEdit = !!editPayment;
  const [loading, setLoading] = useState(false);

  const defaultValues = {
    paymentType: 'payment', amount: '', paymentDate: dayjs(new Date()),
    paymentMode: 'cash', referenceNumber: '', notes: '',
  };
  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({ defaultValues, mode: 'onChange' });

  useEffect(() => {
    if (!open) return;
    if (isEdit && editPayment) {
      setValue('paymentType', editPayment.paymentType || 'payment');
      setValue('amount', editPayment.amount ?? '');
      setValue('paymentDate', editPayment.paymentDate ? dayjs(editPayment.paymentDate) : dayjs(new Date()));
      setValue('paymentMode', editPayment.paymentMode || 'cash');
      setValue('referenceNumber', editPayment.referenceNumber || '');
      setValue('notes', editPayment.notes || '');
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPayment, isEdit, open]);

  const onSubmit = (data) => {
    const payload = {
      accessoryTypeId: type._id,
      paymentType: data.paymentType,
      amount: Number(data.amount) || 0,
      paymentDate: dayjs(data.paymentDate).toISOString(),
      paymentMode: data.paymentMode,
      referenceNumber: data.referenceNumber,
      notes: data.notes,
    };
    setLoading(true);
    const req = isEdit
      ? apiService.accessories.updatePayment(editPayment._id, payload)
      : apiService.accessories.addPayment(payload);
    req.then(() => { reset(defaultValues); onSaved(); })
      .catch(err => showSnackbar(err))
      .finally(() => setLoading(false));
  };

  return (
    <Modal open={open} onClose={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{
        ml: isMobile ? 0 : drawerWidth + 'px',
        width: isMobile ? '88%' : '40%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto',
        bgcolor: 'background.paper', borderRadius: 2, boxShadow: 24, p: { xs: 2, md: 4 },
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{isEdit ? 'Edit' : 'Add'} {type.name} Payment</Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="paymentType" control={control}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" variant="standard">
                    <InputLabel>Type</InputLabel>
                    <Select {...field} label="Type">
                      <MenuItem value="payment">Payment</MenuItem>
                      <MenuItem value="adjustment">Adjustment</MenuItem>
                    </Select>
                  </FormControl>
                )} />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="amount" control={control}
                rules={{ required: 'Amount required', pattern: { value: /^\d*\.?\d*$/, message: 'Numbers only' } }}
                render={({ field }) => (
                  <TextField {...field} label="Amount" fullWidth margin="normal" variant="standard"
                    error={!!errors.amount} helperText={errors.amount?.message} />
                )} />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }} sx={{ alignContent: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller name="paymentDate" control={control} rules={{ required: 'Date required' }}
                  render={({ field }) => (
                    <DatePicker {...field} label="Date" format="DD-MMM-YYYY"
                      sx={{ width: '100%', mt: 1 }}
                      slotProps={{ textField: { variant: 'standard', error: !!errors.paymentDate, helperText: errors.paymentDate?.message } }} />
                  )} />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="paymentMode" control={control}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" variant="standard">
                    <InputLabel>Mode</InputLabel>
                    <Select {...field} label="Mode">
                      <MenuItem value="cash">Cash</MenuItem>
                      <MenuItem value="bank">Bank</MenuItem>
                      <MenuItem value="upi">UPI</MenuItem>
                      <MenuItem value="cheque">Cheque</MenuItem>
                      <MenuItem value="other">Other</MenuItem>
                    </Select>
                  </FormControl>
                )} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller name="referenceNumber" control={control}
                render={({ field }) => <TextField {...field} label="Reference (UTR / Cheque #)" fullWidth margin="normal" variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller name="notes" control={control}
                render={({ field }) => <TextField {...field} label="Notes" fullWidth margin="normal" variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Button type="submit" fullWidth variant="contained" disabled={loading}
                endIcon={isEdit ? <PublishIcon /> : <SaveIcon />} sx={{ mt: 1 }}>
                {loading ? 'Saving…' : isEdit ? 'UPDATE' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default AccessoryPaymentModal;

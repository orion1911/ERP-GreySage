import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller, useWatch } from 'react-hook-form';
import {
  Box, Modal, Typography, IconButton, Grid, TextField, Button, Divider,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import {
  Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon,
  Add as AddIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

const emptyLine = { accessoryItemId: '', qty: '', rate: '' };

// Live per-row amount + grand total
function LineTotals({ control, items }) {
  const lines = useWatch({ control, name: 'lines' }) || [];
  const total = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  return (
    <Grid size={{ xs: 12 }} sx={{ textAlign: 'right', mt: 1 }}>
      <Typography variant="subtitle2">Total: Rs. {total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Typography>
    </Grid>
  );
}

function AccessoryPurchaseModal({ open, onClose, type, editPurchase, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEdit = !!editPurchase;
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);

  const defaultValues = {
    date: dayjs(new Date()), vendorInvoiceNumber: '', supplier: '', notes: '',
    lines: [{ ...emptyLine }],
  };
  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({ defaultValues, mode: 'onChange' });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });

  // Load this type's active items (include inactive ones already on the purchase).
  // showSnackbar omitted from deps — unstable identity would re-fetch on each setSnackbar.
  useEffect(() => {
    if (!open) return;
    apiService.accessories.getItems({ typeId: type._id, showInactive: true })
      .then(setItems)
      .catch(err => showSnackbar(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type._id]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && editPurchase) {
      setValue('date', editPurchase.date ? dayjs(editPurchase.date) : dayjs(new Date()));
      setValue('vendorInvoiceNumber', editPurchase.vendorInvoiceNumber || '');
      setValue('supplier', editPurchase.supplier || '');
      setValue('notes', editPurchase.notes || '');
      setValue('lines', (editPurchase.lines || []).map(l => ({
        accessoryItemId: l.accessoryItemId?._id || l.accessoryItemId || '',
        qty: l.qty ?? '', rate: l.rate ?? '',
      })));
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPurchase, isEdit, open]);

  const onSubmit = (data) => {
    const lines = (data.lines || [])
      .filter(l => l.accessoryItemId && Number(l.qty) > 0)
      .map(l => ({ accessoryItemId: l.accessoryItemId, qty: Number(l.qty), rate: Number(l.rate) || 0 }));
    if (lines.length === 0) {
      showSnackbar('Add at least one line with an item and quantity', 'error');
      return;
    }
    const payload = {
      accessoryTypeId: type._id,
      date: dayjs(data.date).toISOString(),
      vendorInvoiceNumber: data.vendorInvoiceNumber,
      supplier: data.supplier,
      notes: data.notes,
      lines,
    };
    setLoading(true);
    const req = isEdit
      ? apiService.accessories.updatePurchase(editPurchase._id, payload)
      : apiService.accessories.createPurchase(payload);
    req.then(() => { reset(defaultValues); onSaved(); })
      .catch(err => showSnackbar(err))
      .finally(() => setLoading(false));
  };

  return (
    <Modal open={open} onClose={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{
        ml: isMobile ? 0 : drawerWidth + 'px',
        width: isMobile ? '92%' : '60%', maxWidth: 820, maxHeight: '88vh', overflowY: 'auto',
        bgcolor: 'background.paper', borderRadius: 2, boxShadow: 24, p: { xs: 2, md: 4 },
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{isEdit ? 'Edit' : 'Add'} {type.name} Purchase</Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }} sx={{ alignContent: 'center' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <Controller name="date" control={control} rules={{ required: 'Date required' }}
                  render={({ field }) => (
                    <DatePicker {...field} label="Date" format="DD-MMM-YYYY"
                      sx={{ width: '100%', mt: 1 }}
                      slotProps={{ textField: { variant: 'standard', error: !!errors.date, helperText: errors.date?.message } }} />
                  )} />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Controller name="vendorInvoiceNumber" control={control}
                render={({ field }) => <TextField {...field} label="Invoice #" fullWidth margin="normal" variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="supplier" control={control}
                render={({ field }) => <TextField {...field} label="Supplier (optional)" fullWidth margin="normal" variant="standard" />} />
            </Grid>

            <Grid size={{ xs: 12 }}><Divider><Typography variant="caption">LINE ITEMS</Typography></Divider></Grid>

            {fields.map((f, index) => (
              <React.Fragment key={f.id}>
                <Grid size={{ xs: 12, md: 5 }}>
                  <Controller name={`lines.${index}.accessoryItemId`} control={control} rules={{ required: 'Item' }}
                    render={({ field }) => (
                      <FormControl fullWidth margin="normal" variant="standard" error={!!errors.lines?.[index]?.accessoryItemId}>
                        <InputLabel>Item</InputLabel>
                        <Select {...field} label="Item">
                          {items.map(it => (
                            <MenuItem key={it._id} value={it._id}>
                              {it.name}{it.clientId ? ` · ${it.clientId.name || ''}` : ''}{it.isActive ? '' : ' (inactive)'}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )} />
                </Grid>
                <Grid size={{ xs: 4, md: 3 }}>
                  <Controller name={`lines.${index}.qty`} control={control}
                    rules={{ required: 'Qty', pattern: { value: /^\d*\.?\d*$/, message: 'No.' } }}
                    render={({ field }) => (
                      <TextField {...field} label="Qty" fullWidth margin="normal" variant="standard"
                        error={!!errors.lines?.[index]?.qty} />
                    )} />
                </Grid>
                <Grid size={{ xs: 4, md: 3 }}>
                  <Controller name={`lines.${index}.rate`} control={control}
                    rules={{ pattern: { value: /^\d*\.?\d*$/, message: 'No.' } }}
                    render={({ field }) => (
                      <TextField {...field} label="Rate" fullWidth margin="normal" variant="standard" />
                    )} />
                </Grid>
                <Grid size={{ xs: 4, md: 1 }} sx={{ alignContent: 'center' }}>
                  {fields.length > 1 && (
                    <IconButton sx={{ mt: 2 }} color="error" onClick={() => remove(index)}><DeleteIcon /></IconButton>
                  )}
                </Grid>
              </React.Fragment>
            ))}

            <Grid size={{ xs: 12 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => append({ ...emptyLine })}>Add line</Button>
            </Grid>
            <LineTotals control={control} items={items} />

            <Grid size={{ xs: 12 }}>
              <Controller name="notes" control={control}
                render={({ field }) => <TextField {...field} label="Notes" fullWidth margin="normal" variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
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

export default AccessoryPurchaseModal;

import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import {
  Box, Modal, Typography, IconButton, Grid, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, FormControlLabel, Switch
} from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function AccessoryItemModal({ open, onClose, type, clients, editItem, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEdit = !!editItem;
  const [loading, setLoading] = useState(false);
  // Types with paired sub-streams expose a Sub-type select so items can be tagged.
  const SUBTYPE_OPTIONS = {
    'label-tag': [{ value: 'label', label: 'Label' }, { value: 'tag', label: 'Tag' }],
    button: [{ value: 'button', label: 'Button' }, { value: 'rivet', label: 'Rivet' }],
  };
  const subTypeOptions = SUBTYPE_OPTIONS[type?.key];
  const hasSubType = !!subTypeOptions;

  const defaultValues = {
    name: '', rate: '', clientId: '', subType: '', openingStock: '', description: '', isActive: true,
    monitorLowStock: false, reorderLevel: '',
  };

  const { control, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({ defaultValues, mode: 'onChange' });
  const monitorLowStock = watch('monitorLowStock');

  useEffect(() => {
    if (isEdit && editItem) {
      setValue('name', editItem.name || '');
      setValue('rate', editItem.rate ?? '');
      setValue('clientId', editItem.client?._id || editItem.clientId?._id || editItem.clientId || '');
      setValue('subType', editItem.subType || '');
      setValue('openingStock', editItem.openingStock ?? '');
      setValue('description', editItem.description || '');
      setValue('isActive', editItem.isActive !== false);
      setValue('monitorLowStock', !!editItem.monitorLowStock);
      setValue('reorderLevel', editItem.reorderLevel ? String(editItem.reorderLevel) : '');
    } else {
      reset(defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItem, isEdit, open]);

  const onSubmit = (data) => {
    const payload = {
      accessoryTypeId: type._id,
      name: data.name.trim(),
      rate: Number(data.rate) || 0,
      clientId: data.clientId || null,
      subType: hasSubType ? (data.subType || null) : null,
      openingStock: Number(data.openingStock) || 0,
      description: data.description,
      monitorLowStock: !!data.monitorLowStock,
      reorderLevel: data.monitorLowStock ? (Number(data.reorderLevel) || 0) : 0,
    };
    if (isEdit) payload.isActive = data.isActive;

    setLoading(true);
    const req = isEdit
      ? apiService.accessories.updateItem(editItem._id, payload)
      : apiService.accessories.createItem(payload);
    req
      .then(() => { reset(defaultValues); onSaved(); })
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
          <Typography variant="h6">{isEdit ? `Edit ${type.name}` : `Add ${type.name}`}</Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: hasSubType ? 8 : 12 }}>
              <Controller name="name" control={control} rules={{ required: 'Name is required' }}
                render={({ field }) => (
                  <TextField {...field} onChange={e => field.onChange(e.target.value.toUpperCase())}
                    label="Item Name" fullWidth margin="normal" variant="standard"
                    error={!!errors.name} helperText={errors.name?.message} />
                )} />
            </Grid>
            {hasSubType && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Controller name="subType" control={control}
                  render={({ field }) => (
                    <FormControl fullWidth margin="normal" variant="standard">
                      <InputLabel>Sub-type</InputLabel>
                      <Select {...field} label="Sub-type">
                        <MenuItem value=""><em>None</em></MenuItem>
                        {subTypeOptions.map(o => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )} />
              </Grid>
            )}
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="rate" control={control}
                rules={{ pattern: { value: /^\d*\.?\d*$/, message: 'Numbers only' } }}
                render={({ field }) => (
                  <TextField {...field} label="Rate" fullWidth margin="normal" variant="standard"
                    error={!!errors.rate} helperText={errors.rate?.message} />
                )} />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="clientId" control={control}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" variant="standard">
                    <InputLabel>Client Link</InputLabel>
                    <Select {...field} label="Client Link">
                      <MenuItem value=""><em>General (all clients)</em></MenuItem>
                      {(clients || []).map(c => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )} />
            </Grid>
            <Grid size={{ xs: 6, md: 6 }}>
              <Controller name="openingStock" control={control}
                rules={{ pattern: { value: /^\d*\.?\d*$/, message: 'Numbers only' } }}
                render={({ field }) => (
                  <TextField {...field} label={`Opening Stock${type?.unit ? ` (${type.unit})` : ''}`}
                    fullWidth margin="normal" variant="standard"
                    error={!!errors.openingStock}
                    helperText={errors.openingStock ? errors.openingStock.message : 'Current on-hand at go-live'} />
                )} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Controller name="description" control={control}
                render={({ field }) => (
                  <TextField {...field} label="Description" fullWidth margin="normal" variant="standard" />
                )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="monitorLowStock" control={control}
                render={({ field }) => (
                  <FormControlLabel sx={{ mt: 2 }}
                    control={<Switch checked={!!field.value} onChange={e => field.onChange(e.target.checked)} />}
                    label="Monitor low stock" />
                )} />
            </Grid>
            {monitorLowStock && (
              <Grid size={{ xs: 6, md: 6 }}>
                <Controller name="reorderLevel" control={control}
                  rules={{ pattern: { value: /^\d*\.?\d*$/, message: 'Numbers only' } }}
                  render={({ field }) => (
                    <TextField {...field} label={`Reorder level${type?.unit ? ` (${type.unit})` : ''}`}
                      fullWidth margin="normal" variant="standard"
                      error={!!errors.reorderLevel}
                      helperText={errors.reorderLevel ? errors.reorderLevel.message : 'Alert at/below this (0 = use type default)'} />
                  )} />
              </Grid>
            )}
            {isEdit && (
              <Grid size={{ xs: 12, md: 6 }}>
                <Controller name="isActive" control={control}
                  render={({ field }) => (
                    <FormControl fullWidth margin="normal" variant="standard">
                      <InputLabel>Status</InputLabel>
                      <Select value={field.value ? 'true' : 'false'} label="Status"
                        onChange={e => field.onChange(e.target.value === 'true')}>
                        <MenuItem value="true">Active</MenuItem>
                        <MenuItem value="false">Inactive</MenuItem>
                      </Select>
                    </FormControl>
                  )} />
              </Grid>
            )}
            <Grid size={{ xs: 12, md: 4 }}>
              <Button type="submit" fullWidth variant="contained" disabled={loading}
                endIcon={isEdit ? <PublishIcon /> : <SaveIcon />} sx={{ mt: 2 }}>
                {loading ? 'Saving…' : isEdit ? 'UPDATE' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default AccessoryItemModal;

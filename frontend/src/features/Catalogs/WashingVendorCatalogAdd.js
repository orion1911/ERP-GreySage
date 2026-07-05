import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function WashingVendorCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess, editVendor }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();

  const { control, handleSubmit, reset, setValue } = useForm({
    defaultValues: {
      name: editVendor?.name || '',
      contact: editVendor?.contact || '',
      address: editVendor?.address || '',
      defaultRate: editVendor?.defaultRate ?? ''
    },
    mode: 'onChange'
  });

  React.useEffect(() => {
    if (editVendor) {
      setValue('name', editVendor.name || '');
      setValue('contact', editVendor.contact || '');
      setValue('address', editVendor.address || '');
      setValue('defaultRate', editVendor.defaultRate ?? '');
    } else {
      reset({ name: '', contact: '', address: '', defaultRate: '' });
    }
  }, [editVendor, setValue, reset]);

  const onSubmit = (data) => {
    setLoading(true);
    const payload = { ...data, defaultRate: Number(data.defaultRate) || 0 };
    const request = editVendor
      ? apiService.washingVendors.updateWashingVendor(editVendor._id, payload)
      : apiService.washingVendors.createWashingVendor(payload);

    request
      .then(() => {
        setLoading(false);
        reset();
        onAddSuccess();
        onClose();
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="add-vendor-modal"
      aria-describedby="modal-to-add-new-vendor"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '80%' : '30%',
          maxHeight: '80vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" id="add-vendor-modal">
            {editVendor ? 'Edit Washing Vendor' : 'Add Washing Vendor'}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Name is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Name"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : ''}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="contact"
                control={control}
                rules={{
                  required: 'Contact is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Contact"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : ''}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="address"
                control={control}
                rules={{ required: 'Address is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Address"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : ''}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="defaultRate"
                control={control}
                rules={{ pattern: { value: /^\d*\.?\d*$/, message: 'Only numbers allowed' } }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Default Rate"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : 'Pre-fills the rate when this vendor is selected at the stage'}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                type="submit"
                fullWidth
                endIcon={editVendor ? <PublishIcon /> : <SaveIcon />}
                disabled={loading}
                variant="contained"
                sx={{ mt: 2 }}
              >
                {loading ? 'Saving...' : editVendor ? 'UPDATE' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default WashingVendorCatalogAdd;
import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton, Divider, FormControlLabel, Checkbox } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

const emptyAddress = { line1: '', line2: '', city: '', state: '', stateCode: '', pincode: '', country: 'India' };

function ClientCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess, editClient }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const [shipSameAsBill, setShipSameAsBill] = React.useState(true);

  const { control, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      name: '',
      clientCodePrefix: '',
      billingName: '',
      contact: '',
      email: '',
      address: '',
      gstin: '',
      pan: '',
      billingAddress: { ...emptyAddress },
      shippingAddress: { ...emptyAddress }
    },
    mode: 'onChange'
  });

  const nameValue = watch('name');
  const billingAddress = watch('billingAddress');

  const generateClientCodePrefix = (name) => {
    if (!name) return '';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  React.useEffect(() => {
    if (!editClient && nameValue) {
      setValue('clientCodePrefix', generateClientCodePrefix(nameValue));
    }
  }, [nameValue, setValue, editClient]);

  React.useEffect(() => {
    if (shipSameAsBill && billingAddress) {
      setValue('shippingAddress', { ...billingAddress });
    }
  }, [shipSameAsBill, billingAddress, setValue]);

  React.useEffect(() => {
    if (editClient) {
      setValue('name', editClient.name || '');
      setValue('clientCodePrefix', editClient.clientCode || '');
      setValue('billingName', editClient.billingName || '');
      setValue('contact', editClient.contact || '');
      setValue('email', editClient.email || '');
      setValue('address', editClient.address || '');
      setValue('gstin', editClient.gstin || '');
      setValue('pan', editClient.pan || '');
      setValue('billingAddress', { ...emptyAddress, ...(editClient.billingAddress || {}) });
      setValue('shippingAddress', { ...emptyAddress, ...(editClient.shippingAddress || {}) });
      // Detect if ship == bill at load time
      const bA = editClient.billingAddress || {};
      const sA = editClient.shippingAddress || {};
      const same = JSON.stringify({ ...emptyAddress, ...bA }) === JSON.stringify({ ...emptyAddress, ...sA });
      setShipSameAsBill(same);
    } else {
      reset({
        name: '', clientCodePrefix: '', billingName: '', contact: '', email: '', address: '',
        gstin: '', pan: '',
        billingAddress: { ...emptyAddress },
        shippingAddress: { ...emptyAddress }
      });
      setShipSameAsBill(true);
    }
  }, [editClient, setValue, reset]);

  const onSubmit = (data) => {
    setLoading(true);
    const payload = {
      ...data,
      clientCode: data.clientCodePrefix,
      shippingAddress: shipSameAsBill ? data.billingAddress : data.shippingAddress
    };
    const request = editClient
      ? apiService.client.updateClient(editClient._id, payload)
      : apiService.client.createClient(payload);

    request
      .then(() => {
        setLoading(false);
        reset();
        onAddSuccess();
        onClose();
      })
      .catch(err => {
        setLoading(false);
        showSnackbar(err);
      });
  };

  const addressFields = (prefix) => (
    <>
      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={`${prefix}.line1`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="Address Line 1" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <Controller
          name={`${prefix}.line2`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="Address Line 2" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <Controller
          name={`${prefix}.city`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="City" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <Controller
          name={`${prefix}.state`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="State" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 4, md: 2 }}>
        <Controller
          name={`${prefix}.stateCode`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="GST State Code" fullWidth margin="dense" variant="standard" helperText="e.g. 32" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 4, md: 2 }}>
        <Controller
          name={`${prefix}.pincode`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="Pincode" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
      <Grid size={{ xs: 4, md: 2 }}>
        <Controller
          name={`${prefix}.country`}
          control={control}
          render={({ field }) => (
            <TextField {...field} label="Country" fullWidth margin="dense" variant="standard" />
          )}
        />
      </Grid>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="add-client-modal"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '90%' : '70%',
          maxHeight: '90vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" id="add-client-modal">
            {editClient ? 'Edit Client' : 'Add Client'}
          </Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Name is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Display Name"
                    fullWidth margin="dense" variant="standard"
                    error={!!error}
                    helperText={error ? error.message : 'Internal name (e.g. ADAM HILL)'}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 5 }}>
              <Controller
                name="billingName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Billing / Firm Name"
                    fullWidth margin="dense" variant="standard"
                    helperText="Legal name printed on invoices (e.g. BRANDKO MART LLP). Falls back to Display Name if blank."
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Controller
                name="clientCodePrefix"
                control={control}
                rules={{ required: 'Client Code Prefix is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Client Code Prefix"
                    fullWidth margin="dense" variant="standard"
                    helperText={error ? error.message : (editClient ? '' : 'Auto-suggested')}
                    error={!!error}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Controller
                name="contact"
                control={control}
                rules={{ required: 'Contact is required', pattern: { value: /^\d+$/, message: 'Only numbers' } }}
                render={({ field, fieldState: { error } }) => (
                  <TextField {...field} label="Contact" fullWidth margin="dense" variant="standard" error={!!error} helperText={error ? error.message : ''} />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Controller
                name="email"
                control={control}
                rules={{ pattern: { value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, message: 'Invalid email' } }}
                render={({ field, fieldState: { error } }) => (
                  <TextField {...field} label="Email" fullWidth margin="dense" variant="standard" error={!!error} helperText={error ? error.message : ''} />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="gstin"
                control={control}
                render={({ field }) => (
                  <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="GSTIN" fullWidth margin="dense" variant="standard" helperText="15-char GST identifier" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="pan"
                control={control}
                render={({ field }) => (
                  <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="PAN" fullWidth margin="dense" variant="standard" />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12 }}>
              <Divider sx={{ mt: 1 }}><Typography variant="caption">BILLING ADDRESS</Typography></Divider>
            </Grid>
            {addressFields('billingAddress')}

            <Grid size={{ xs: 12 }}>
              <FormControlLabel
                control={<Checkbox checked={shipSameAsBill} onChange={(e) => setShipSameAsBill(e.target.checked)} />}
                label="Shipping address is the same as billing address"
              />
            </Grid>
            {!shipSameAsBill && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Divider><Typography variant="caption">SHIPPING ADDRESS</Typography></Divider>
                </Grid>
                {addressFields('shippingAddress')}
              </>
            )}

            <Grid size={{ xs: 12 }}>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Legacy Address (free-form)" fullWidth margin="dense" variant="standard" helperText="Optional. Older records may rely on this; new invoices use the billing address above." />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                type="submit"
                fullWidth
                endIcon={editClient ? <PublishIcon /> : <SaveIcon />}
                disabled={loading}
                variant="contained"
                sx={{ mt: 2 }}
              >
                {loading ? 'Saving...' : editClient ? 'UPDATE' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default ClientCatalogAdd;

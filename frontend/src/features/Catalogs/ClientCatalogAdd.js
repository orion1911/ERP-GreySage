import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function ClientCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess, editClient }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();

  const { control, handleSubmit, watch, setValue, reset } = useForm({
    defaultValues: {
      name: editClient?.name || '',
      clientCodePrefix: editClient?.clientCode || '',
      contact: editClient?.contact || '',
      email: editClient?.email || '',
      address: editClient?.address || ''
    },
    mode: 'onChange'
  });

  const nameValue = watch('name');

  const generateClientCodePrefix = (name) => {
    if (!name) return '';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  React.useEffect(() => {
    if (!editClient && nameValue) {
      setValue('clientCodePrefix', generateClientCodePrefix(nameValue));
    }
  }, [nameValue, setValue, editClient]);

  React.useEffect(() => {
    if (editClient) {
      setValue('name', editClient.name || '');
      setValue('clientCodePrefix', editClient.clientCode || '');
      setValue('contact', editClient.contact || '');
      setValue('email', editClient.email || '');
      setValue('address', editClient.address || '');
    } else {
      reset({ name: '', clientCodePrefix: '', contact: '', email: '', address: '' });
    }
  }, [editClient, setValue, reset]);

  const onSubmit = (data) => {
    setLoading(true);
    const request = editClient
      ? apiService.client.updateClient(editClient._id, { ...data, clientCode: data.clientCodePrefix })
      : apiService.client.createClient({ ...data, clientCode: data.clientCodePrefix });

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
      aria-labelledby="add-client-modal"
      aria-describedby="modal-to-add-new-client"
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
          <Typography variant="h6" id="add-client-modal">
            {editClient ? 'Edit Client' : 'Add Client'}
          </Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 4 }}>
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
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="clientCodePrefix"
                control={control}
                rules={{ required: 'Client Code Prefix is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Client Code Prefix"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    helperText={error ? error.message : editClient ? '' : 'Edit the suggested prefix if needed'}
                    error={!!error}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
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
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="email"
                control={control}
                rules={{
                  required: 'Email is required',
                  pattern: {
                    value: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
                    message: 'Invalid email format'
                  }
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Email"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : ''}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
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
            <Grid size={{ xs: 12, md: 2 }}>
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
import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function ProductCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();

  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      name: '',
      description: ''
    },
    mode: 'onChange'
  });

  const onSubmit = (data) => {
    setLoading(true);
    apiService.fitStyles.createFitstyles(data)
      .then(() => {
        setLoading(false);
        reset();
        onAddSuccess();
        onClose();
      })
      .catch(err => {
        setLoading(false);
        if (err.response?.status === 401 || err.response?.status === 403) {
          showSnackbar('Session expired. Please log in again.');
          window.location.href = '/login';
        } else {
          showSnackbar(err.response?.data?.error || 'An error occurred');
        }
      });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="add-product-modal"
      aria-describedby="modal-to-add-new-product"
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
          <Typography variant="h6" id="add-product-modal">Add Fit Style</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Design is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Design"
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
                name="description"
                control={control}
                rules={{ required: 'Description is required' }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Description"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : ''}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Button
                type="submit"
                fullWidth
                endIcon={<SaveIcon />}
                disabled={loading}
                variant="contained"
              >
                {loading ? 'Saving...' : 'SAVE'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Modal>
  );
}

export default ProductCatalogAdd;
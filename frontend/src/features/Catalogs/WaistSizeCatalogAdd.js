import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function WaistSizeCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();

  const { control, handleSubmit, reset } = useForm({
    defaultValues: { size: '' },
    mode: 'onChange'
  });

  const onSubmit = (data) => {
    setLoading(true);
    apiService.waistSizes.createWaistSize({ size: parseInt(data.size, 10) })
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
      aria-labelledby="add-waist-size-modal"
      aria-describedby="modal-to-add-new-waist-size"
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
          <Typography variant="h6" id="add-waist-size-modal">Add Waist Size</Typography>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 12 }}>
              <Controller
                name="size"
                control={control}
                rules={{
                  required: 'Size is required',
                  pattern: { value: /^\d+$/, message: 'Only numbers allowed' },
                  validate: (v) => (parseInt(v, 10) >= 26 && parseInt(v, 10) <= 42) || 'Size must be between 26 and 42'
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField
                    {...field}
                    label="Size"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!error}
                    helperText={error ? error.message : '26–42'}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Button
                type="submit"
                fullWidth
                endIcon={<SaveIcon />}
                disabled={loading}
                variant="contained"
                sx={{ mt: 2 }}
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

export default WaistSizeCatalogAdd;

import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Chip } from '@mui/material';
import { Close as CloseIcon, AttachFile as AttachFileIcon, Delete as DeleteIcon, Save as SaveIcon, Add as AddIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddOrderModal({ open, onClose, clients, fitStyles, onAddOrder, onUpdateOrder, order }) {
  const { isMobile, drawerWidth } = useOutletContext();
  const isEditMode = !!order;
  const [loading, setLoading] = React.useState(false);

  const defaultValues = {
    date: dayjs(new Date()),
    clientId: '',
    fabric: '',
    fitStyleId: '',
    waistSize: '',
    totalQuantity: '',
    threadColors: [{ color: '', quantity: '' }],
    description: '',
    attachments: []
  };

  const { control, handleSubmit, reset, setValue, getValues, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'threadColors',
  });

  useEffect(() => {
    if (isEditMode && order) {
      setValue('date', order.date ? dayjs(order.date) : dayjs(new Date()));
      setValue('clientId', order.clientId?._id || '');
      setValue('fabric', order.fabric || '');
      setValue('fitStyleId', order.fitStyleId?._id || '');
      setValue('waistSize', order.waistSize || '');
      setValue('totalQuantity', order.totalQuantity || '');
      setValue('threadColors', order.threadColors?.length > 0 ? order.threadColors : [{ color: '', quantity: '' }]);
      setValue('description', order.description || '');
      setValue('attachments', order.attachments || []);
    } else {
      reset(defaultValues);
    }
  }, [order, isEditMode, reset, setValue]);

  const onSubmit = (data) => {
    if (!data.date || !data.clientId || !data.fabric || !data.fitStyleId || !data.waistSize || !data.totalQuantity)
      return;
    const totalThreadQuantity = data.threadColors.reduce((sum, tc) => sum + Number(tc.quantity || 0), 0);
    if (totalThreadQuantity !== Number(data.totalQuantity)) {
      alert(`Sum of thread color quantities (${totalThreadQuantity}) must equal total quantity (${data.totalQuantity})`);
      return;
    }

    if (isNaN(data.totalQuantity)) {
      alert('Total Quantity is not a number');
      return;
    }

    const formData = {
      ...data,
      totalQuantity: Number(data.totalQuantity),
      threadColors: data.threadColors.map(tc => ({ color: tc.color.trim(), quantity: Number(tc.quantity.trim())})),
      date: data.date.toISOString(),
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.orders.updateOrder(order._id, formData)
      : apiService.orders.createOrder(formData);

    request
      .then(res => {
        if (isEditMode) {
          onUpdateOrder(res);
        } else {
          onAddOrder(res);
        }
        reset(defaultValues);
        onClose();
      })
      .catch(err => {
        alert(err.response?.error || 'An error occurred');
        setLoading(false);
      })
      .finally(() => setLoading(false));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const fileName = file.name;
      const url = URL.createObjectURL(file);
      const currentAttachments = getValues('attachments') || [];
      setValue('attachments', [...currentAttachments, { fileName, url }]);
    }
  };

  const handleDeleteAttachment = (index) => {
    const currentAttachments = getValues('attachments') || [];
    const updatedAttachments = currentAttachments.filter((_, i) => i !== index);
    setValue('attachments', updatedAttachments);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby={isEditMode ? "edit-order-modal" : "add-order-modal"}
      aria-describedby={isEditMode ? "modal-to-edit-order" : "modal-to-add-new-order"}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: '50%',
          maxHeight: '80vh',
          overflowY: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          p: 4,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" id={isEditMode ? "edit-order-modal" : "add-order-modal"}>
            {isEditMode ? 'Edit Order' : 'Add Order'}
          </Typography>
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
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="clientId"
                control={control}
                rules={{ required: 'Client is required' }}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" error={!!errors.clientId}>
                    <InputLabel>Client</InputLabel>
                    <Select
                      {...field}
                      label="Client"
                    >
                      {clients.map(client => (
                        <MenuItem key={client._id} value={client._id}>{client.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.clientId && <Typography color="error" variant="caption">{errors.clientId.message}</Typography>}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="fabric"
                control={control}
                rules={{ required: 'Fabric is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => {
                      field.onChange(e.target.value.toUpperCase());
                    }}
                    label="Fabric"
                    fullWidth
                    margin="normal"
                    variant="outlined"
                    error={!!errors.fabric}
                    helperText={errors.fabric?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="fitStyleId"
                control={control}
                rules={{ required: 'Fit Style is required' }}
                render={({ field }) => (
                  <FormControl margin="normal" variant="outlined" fullWidth error={!!errors.fitStyleId}>
                    <InputLabel>Fit Style</InputLabel>
                    <Select
                      {...field}
                      label="Fit Style"
                    >
                      {fitStyles.map(fitStyle => (
                        <MenuItem key={fitStyle._id} value={fitStyle._id}>{fitStyle.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.fitStyleId && <Typography color="error" variant="caption">{errors.fitStyleId.message}</Typography>}
                  </FormControl>
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="waistSize"
                control={control}
                rules={{ required: 'Waist Size is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => {
                      field.onChange(e.target.value.toUpperCase());
                    }}
                    label="Waist Size"
                    fullWidth
                    margin="normal"
                    variant="outlined"
                    error={!!errors.waistSize}
                    helperText={errors.waistSize?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="totalQuantity"
                control={control}
                rules={{
                  required: 'Total Quantity is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Total Quantity"
                    fullWidth
                    margin="normal"
                    variant="outlined"
                    error={!!errors.totalQuantity}
                    helperText={errors.totalQuantity?.message}
                  />
                )}
              />
            </Grid>
            {fields.map((tc, index) => (
              <React.Fragment key={tc.id}>
                <Grid size={{ xs: 6, md: 4 }}>
                  <Controller
                    name={`threadColors[${index}].color`}
                    control={control}
                    rules={{ required: 'Thread Color is required' }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        onChange={(e) => {
                          field.onChange(e.target.value.toUpperCase());
                        }}
                        label="Thread Color"
                        fullWidth
                        margin="normal"
                        variant="outlined"
                        error={!!errors.threadColors?.[index]?.color}
                        helperText={errors.threadColors?.[index]?.color?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}>
                  <Controller
                    name={`threadColors[${index}].quantity`}
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
                        variant="outlined"
                        error={!!errors.threadColors?.[index]?.quantity}
                        helperText={errors.threadColors?.[index]?.quantity?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 4 }} sx={{ alignContent: 'center' }}>
                  {index > 0 && (
                    <IconButton sx={{ mt: 2 }} onClick={() => remove(index)} color="error">
                      <DeleteIcon />
                    </IconButton>
                  )}
                  {index === fields.length - 1 && (
                    <IconButton sx={{ mt: 2 }} onClick={() => append({ color: '', quantity: '' })}>
                      <AddIcon />
                    </IconButton>
                  )}
                </Grid>
              </React.Fragment>
            ))}
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
                    variant="outlined"
                    multiline
                    rows={1}
                  />
                )}
              />
            </Grid>
            {/* {getValues('attachments').length > 0 && (
              <Grid size={{ xs: 12, md: 12 }} sx={{ border: '1px solid #4741f6', borderRadius: '8px' }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, maxHeight: 80, m: 1, overflowY: 'auto' }}>
                  {getValues('attachments').map((attachment, index) => (
                    <Chip
                      key={index}
                      label={attachment.fileName}
                      onDelete={() => handleDeleteAttachment(index)}
                      deleteIcon={<DeleteIcon />}
                    />
                  ))}
                </Box>
              </Grid>
            )} */}
            {/* <Grid size={{ xs: 12, md: 4 }} sx={{ alignContent: 'center' }} fullWidth>
              <Button
                variant="contained"
                component="label"
                fullWidth
                startIcon={<AttachFileIcon />}
              >
                Upload Attachment
                <input
                  type="file"
                  hidden
                  onChange={handleFileChange}
                />
              </Button>
            </Grid> */}
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

export default AddOrderModal;
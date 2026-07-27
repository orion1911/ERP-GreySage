import React from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import { Box, Grid, Modal, Typography, TextField, Button, IconButton, Divider, FormControlLabel, Checkbox, Switch, Paper, Alert } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

const emptyAddress = { line1: '', line2: '', city: '', state: '', stateCode: '', pincode: '', country: 'India' };
const emptyFirm = { billingName: '', contact: '', gstin: '', pan: '', billingAddress: { ...emptyAddress }, shippingAddress: { ...emptyAddress } };

function ClientCatalogAdd({ open, onClose, loading, setLoading, onAddSuccess, editClient }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const [shipSameAsBill, setShipSameAsBill] = React.useState(true);
  // Per-firm "shipping same as billing" toggles, keyed by field array index.
  const [firmShipSame, setFirmShipSame] = React.useState({});

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
      shippingAddress: { ...emptyAddress },
      billingFirms: [],
      isInternal: false
    },
    mode: 'onChange'
  });
  const { fields: firmFields, append: appendFirm, remove: removeFirm } = useFieldArray({ control, name: 'billingFirms' });

  const nameValue = watch('name');
  const billingAddress = watch('billingAddress');
  // House label (e.g. GREYSAGE): owns lots, is never invoiced. Relaxes the contact
  // requirement below and hides the billing identity, none of which applies to it.
  const isInternal = watch('isInternal');

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
      setValue('isInternal', !!editClient.isInternal);
      setValue('billingAddress', { ...emptyAddress, ...(editClient.billingAddress || {}) });
      setValue('shippingAddress', { ...emptyAddress, ...(editClient.shippingAddress || {}) });
      const firms = (editClient.billingFirms || []).map((f) => ({
        billingName: f.billingName || '', contact: f.contact || '', gstin: f.gstin || '', pan: f.pan || '',
        billingAddress: { ...emptyAddress, ...(f.billingAddress || {}) },
        shippingAddress: { ...emptyAddress, ...(f.shippingAddress || {}) }
      }));
      setValue('billingFirms', firms);
      // Detect if ship == bill at load time (client level + per firm)
      const addrSame = (bA = {}, sA = {}) =>
        JSON.stringify({ ...emptyAddress, ...bA }) === JSON.stringify({ ...emptyAddress, ...sA });
      setShipSameAsBill(addrSame(editClient.billingAddress, editClient.shippingAddress));
      setFirmShipSame(firms.reduce((acc, f, i) => { acc[i] = addrSame(f.billingAddress, f.shippingAddress); return acc; }, {}));
    } else {
      reset({
        name: '', clientCodePrefix: '', billingName: '', contact: '', email: '', address: '',
        gstin: '', pan: '',
        billingAddress: { ...emptyAddress },
        shippingAddress: { ...emptyAddress },
        billingFirms: [],
        isInternal: false
      });
      setShipSameAsBill(true);
      setFirmShipSame({});
    }
  }, [editClient, setValue, reset]);

  const onSubmit = (data) => {
    setLoading(true);
    const billingFirms = (data.billingFirms || [])
      .filter((f) => (f.billingName || '').trim())
      .map((f, i) => ({
        ...f,
        billingName: (f.billingName || '').toUpperCase().trim(),
        shippingAddress: firmShipSame[i] ? f.billingAddress : f.shippingAddress
      }));
    const payload = {
      ...data,
      clientCode: data.clientCodePrefix,
      shippingAddress: shipSameAsBill ? data.billingAddress : data.shippingAddress,
      billingFirms
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
        <form onSubmit={handleSubmit(onSubmit)} onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') e.preventDefault(); }}>
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
                    label="Display Name"
                    fullWidth margin="dense" variant="standard"
                    error={!!error}
                    helperText={error ? error.message : 'Internal client name'}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 5 }}>
              <Controller
                name="billingName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="Billing / Firm Name"
                    fullWidth margin="dense" variant="standard"
                    helperText="Legal name for invoices"
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
                rules={{
                  required: isInternal ? false : 'Contact is required',
                  pattern: { value: /^\d+$/, message: 'Only numbers' }
                }}
                render={({ field, fieldState: { error } }) => (
                  <TextField {...field} label={isInternal ? 'Contact (optional)' : 'Contact'}
                    fullWidth margin="dense" variant="standard"
                    error={!!error} helperText={error ? error.message : ''} />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Controller
                name="gstin"
                control={control}
                render={({ field }) => (
                  <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="GSTIN" fullWidth margin="dense" variant="standard" helperText="15-char GST identifier" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Controller
                name="pan"
                control={control}
                render={({ field }) => (
                  <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    label="PAN" fullWidth margin="dense" variant="standard" />
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

            <Grid size={{ xs: 12 }}>
              <Controller
                name="isInternal"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch checked={!!field.value} onChange={(e) => field.onChange(e.target.checked)} color="info" />}
                    label={(
                      <Typography variant="body2">
                        In-house label
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (not a real customer — e.g. GREYSAGE)
                        </Typography>
                      </Typography>
                    )}
                  />
                )}
              />
            </Grid>
            {isInternal && (
              <Grid size={{ xs: 12 }}>
                <Alert severity="info" variant="outlined" sx={{ py: 0.5 }}>
                  <Typography variant="caption" component="div">
                    Lots can be created against this label as normal, and its stock is offered on
                    <b> every</b> client&apos;s invoice without needing the cross-client toggle.
                    It cannot itself be billed, so it has no receivable and is hidden from Client
                    Payments. Billing details below are not used.
                  </Typography>
                </Alert>
              </Grid>
            )}

            {/* A house label is never invoiced, so its billing identity is dead weight —
                hidden rather than disabled to keep the form short and unambiguous. */}
            {!isInternal && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Divider sx={{ mt: 1 }}><Typography variant="caption">DEFAULT BILLING ADDRESS</Typography></Divider>
                </Grid>
                {addressFields('billingAddress')}
              </>
            )}

            {!isInternal && (
              <Grid size={{ xs: 12 }}>
                <FormControlLabel
                  control={<Checkbox checked={shipSameAsBill} onChange={(e) => setShipSameAsBill(e.target.checked)} />}
                  label="Shipping address is the same as billing address"
                />
              </Grid>
            )}
            {!isInternal && !shipSameAsBill && (
              <>
                <Grid size={{ xs: 12 }}>
                  <Divider><Typography variant="caption">DEFAULT SHIPPING ADDRESS</Typography></Divider>
                </Grid>
                {addressFields('shippingAddress')}
              </>
            )}

            {!isInternal && (<>
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ mt: 2 }}>
                <Typography variant="caption">ADDITIONAL BILLING FIRMS (SUB-BILLERS)</Typography>
              </Divider>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Optional. Each firm is a separate billing identity (name + GST + address) selectable when creating an invoice. The default above is used when no firm is chosen.
              </Typography>
            </Grid>

            {firmFields.map((firm, i) => (
              <Grid size={{ xs: 12 }} key={firm.id}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle2">Firm #{i + 1}</Typography>
                    <IconButton size="small" color="error" onClick={() => {
                      removeFirm(i);
                      setFirmShipSame((prev) => {
                        const next = {};
                        Object.keys(prev).map(Number).forEach((k) => {
                          if (k < i) next[k] = prev[k];
                          else if (k > i) next[k - 1] = prev[k];
                        });
                        return next;
                      });
                    }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6, md: 4 }}>
                      <Controller
                        name={`billingFirms.${i}.billingName`}
                        control={control}
                        rules={{ required: 'Firm name is required' }}
                        render={({ field, fieldState: { error } }) => (
                          <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            label="Billing / Firm Name" fullWidth margin="dense" variant="standard"
                            error={!!error} helperText={error ? error.message : ''} />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Controller
                        name={`billingFirms.${i}.contact`}
                        control={control}
                        rules={{ pattern: { value: /^\d*$/, message: 'Only numbers' } }}
                        render={({ field, fieldState: { error } }) => (
                          <TextField {...field} label="Contact" fullWidth margin="dense" variant="standard"
                            error={!!error} helperText={error ? error.message : ''} />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 3 }}>
                      <Controller
                        name={`billingFirms.${i}.gstin`}
                        control={control}
                        render={({ field }) => (
                          <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            label="GSTIN" fullWidth margin="dense" variant="standard" />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, md: 2 }}>
                      <Controller
                        name={`billingFirms.${i}.pan`}
                        control={control}
                        render={({ field }) => (
                          <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            label="PAN" fullWidth margin="dense" variant="standard" />
                        )}
                      />
                    </Grid>

                    <Grid size={{ xs: 12 }}>
                      <Divider><Typography variant="caption">BILLING ADDRESS</Typography></Divider>
                    </Grid>
                    {addressFields(`billingFirms.${i}.billingAddress`)}

                    <Grid size={{ xs: 12 }}>
                      <FormControlLabel
                        control={<Checkbox checked={firmShipSame[i] ?? true}
                          onChange={(e) => setFirmShipSame((prev) => ({ ...prev, [i]: e.target.checked }))} />}
                        label="Shipping address is the same as billing address"
                      />
                    </Grid>
                    {!(firmShipSame[i] ?? true) && (
                      <>
                        <Grid size={{ xs: 12 }}>
                          <Divider><Typography variant="caption">SHIPPING ADDRESS</Typography></Divider>
                        </Grid>
                        {addressFields(`billingFirms.${i}.shippingAddress`)}
                      </>
                    )}
                  </Grid>
                </Paper>
              </Grid>
            ))}

            <Grid size={{ xs: 12 }}>
              <Button startIcon={<AddIcon />} size="small"
                onClick={() => { appendFirm({ ...emptyFirm }); setFirmShipSame((prev) => ({ ...prev, [firmFields.length]: true })); }}>
                Add Firm
              </Button>
            </Grid>
            </>)}

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

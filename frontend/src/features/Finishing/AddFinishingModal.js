import React, { useEffect, useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { Box, Modal, Typography, IconButton, Grid, TextField, Button, FormControl, InputLabel, Select, MenuItem, Divider, Chip, Tooltip } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

function AddFinishingModal({ open, onClose, lotNumber, lotId, invoiceNumber, lotQuantity, vendors, onAddFinishing, editRecord }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const isEditMode = !!editRecord;
  const [loading, setLoading] = useState(false);
  // Quantity available for finishing = Σ(washDetails.quantity − quantityShort), i.e. the
  // lot quantity net of upstream stitching/washing shortage. Fetched from the lot's washing
  // record so the form pre-fills correctly even if the grid hasn't loaded washing.
  const [washAvailable, setWashAvailable] = useState(null);

  const defaultValues = {
    lotNumber: lotNumber || '',
    invoiceNumber: invoiceNumber || '',
    vendorId: '',
    quantity: '',
    quantityShort: '',
    quantityShortDesc: '',
    rate: '',
    date: dayjs(new Date()),
    finishOutDate: null,
    description: '',
  };

  const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm({
    defaultValues,
    mode: 'onChange',
  });

  // ── Accessory consumption (button / label / tag / polybag) recorded at finishing ──
  // groups: the slots applicable to this lot's client (client-mapped + general items).
  // consumption: groupKey -> [{ accessoryItemId, qty }] (split allocations per slot).
  // Pre-filled to the finishing quantity; the user adjusts upward for extras sent.
  const [groups, setGroups] = useState([]);
  const [consumption, setConsumption] = useState({});
  const touchedRef = useRef(new Set()); // group keys the user manually edited
  const watchedQuantity = useWatch({ control, name: 'quantity' });
  const qtyNum = parseInt(watchedQuantity) || 0;
  // Base used to pre-fill accessory consumption: the finishing Quantity field if entered,
  // otherwise the record being edited / the lot quantity. Keeps slots filled even before
  // the watched value settles on first render.
  const baseQty = qtyNum || parseInt(editRecord?.quantity) || washAvailable || parseInt(lotQuantity) || 0;
  const gKey = (g) => `${g.typeKey}:${g.slot}`;
  const groupTotal = (k) => (consumption[k] || []).reduce((s, r) => s + (Number(r.qty) || 0), 0);
  // Default row item = the lot client's item (resolved server-side as defaultItemId),
  // falling back to the first item. The dropdown still lists ALL clients + general so a
  // lot can be split across multiple clients in one set.
  const primaryItem = (g) => g.items.find(i => String(i._id) === String(g.defaultItemId)) || g.items[0];

  // Resolve the available finishing quantity (wash total − wash short) and pre-fill the
  // Quantity field on create so the lot qty reflects upstream shortage.
  useEffect(() => {
    if (!open || !lotId) { setWashAvailable(null); return; }
    let active = true;
    apiService.washing.getWashing('', lotId, '')
      .then(res => {
        if (!active) return;
        const avail = (res || []).reduce((sum, w) =>
          sum + (w.washDetails || []).reduce((s, d) => s + (Number(d.quantity) || 0) - (Number(d.quantityShort) || 0), 0), 0);
        setWashAvailable(avail);
        if (!isEditMode) setValue('quantity', avail || '');
      })
      .catch(() => { if (active) setWashAvailable(null); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lotId, isEditMode]);

  // Load the consumption slots for the lot (resolved server-side from invoiceNumber),
  // then seed each slot — from existing consumption (edit) or pre-filled to qty (create).
  useEffect(() => {
    if (!open || !invoiceNumber) { setGroups([]); setConsumption({}); return; }
    let active = true;
    apiService.accessories.getFinishingItems(invoiceNumber)
      .then(async (gs) => {
        if (!active) return;
        let initial = {};
        if (isEditMode && editRecord?.lotId?._id) {
          const rows = await apiService.accessories.getConsumption(editRecord.lotId._id, 'finishing').catch(() => []);
          for (const g of gs) {
            const ids = new Set(g.items.map(i => String(i._id)));
            const matched = (rows || []).filter(r => ids.has(String(r.accessoryItemId)))
              .map(r => ({ accessoryItemId: String(r.accessoryItemId), qty: String(r.qty) }));
            if (matched.length) {
              initial[gKey(g)] = matched;
              touchedRef.current.add(gKey(g)); // existing values are user data — don't auto-override
            } else {
              // No prior consumption for this slot — pre-fill to the lot quantity (left
              // untouched so it keeps tracking the Quantity field).
              initial[gKey(g)] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: (baseQty * (g.multiplier || 1)) || '' }];
            }
          }
        } else {
          touchedRef.current = new Set();
          for (const g of gs) {
            initial[gKey(g)] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: (baseQty * (g.multiplier || 1)) || '' }];
          }
        }
        setGroups(gs);
        setConsumption(initial);
      })
      .catch(() => { if (active) { setGroups([]); setConsumption({}); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceNumber, isEditMode, editRecord]);

  // Keep untouched slots pre-filled to the latest lot/finishing quantity (create and edit).
  useEffect(() => {
    if (groups.length === 0) return;
    setConsumption(prev => {
      const next = { ...prev };
      for (const g of groups) {
        const k = gKey(g);
        if (touchedRef.current.has(k)) continue;
        next[k] = [{ accessoryItemId: String(primaryItem(g)?._id || ''), qty: (baseQty * (g.multiplier || 1)) || '' }];
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseQty, groups]);

  const setRow = (k, idx, field, value) => {
    touchedRef.current.add(k);
    setConsumption(prev => {
      const rows = [...(prev[k] || [])];
      rows[idx] = { ...rows[idx], [field]: value };
      return { ...prev, [k]: rows };
    });
  };
  const addRow = (k) => {
    touchedRef.current.add(k);
    setConsumption(prev => ({ ...prev, [k]: [...(prev[k] || []), { accessoryItemId: '', qty: '' }] }));
  };
  const removeRow = (k, idx) => {
    touchedRef.current.add(k);
    setConsumption(prev => ({ ...prev, [k]: (prev[k] || []).filter((_, i) => i !== idx) }));
  };

  useEffect(() => {
    if (isEditMode && editRecord) {
      setValue('lotNumber', editRecord.lotId?.lotNumber || lotNumber || '');
      setValue('invoiceNumber', editRecord.lotId?.invoiceNumber || invoiceNumber || '');
      setValue('vendorId', editRecord.vendorId?._id || '');
      setValue('quantity', editRecord.quantity || '');
      setValue('quantityShort', editRecord.quantityShort || '');
      setValue('quantityShortDesc', editRecord.quantityShortDesc || '');
      setValue('rate', editRecord.rate || '');
      setValue('date', editRecord.date ? dayjs(editRecord.date) : dayjs(new Date()));
      setValue('finishOutDate', editRecord.finishOutDate ? dayjs(editRecord.finishOutDate) : null);
      setValue('description', editRecord.description || '');
    } else {
      setValue('lotNumber', lotNumber || '');
      setValue('invoiceNumber', invoiceNumber || '');
      setValue('vendorId', '');
      setValue('quantity', '');
      setValue('quantityShort', '');
      setValue('quantityShortDesc', '');
      setValue('rate', '');
      setValue('date', dayjs(new Date()));
      setValue('finishOutDate', null);
      setValue('description', '');
    }
  }, [editRecord, isEditMode, lotNumber, invoiceNumber, setValue]);

  const onSubmit = (data) => {
    // Gather + validate accessory consumption — each shown slot is required (>= 1).
    const allocations = [];
    for (const g of groups) {
      const k = gKey(g);
      const rows = consumption[k] || [];
      const total = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
      if (total < 1) {
        showSnackbar(`${g.label} consumption is required (enter the quantity used)`, 'error');
        return;
      }
      for (const r of rows) {
        if (r.accessoryItemId && Number(r.qty) > 0) {
          allocations.push({ accessoryItemId: r.accessoryItemId, qty: Number(r.qty) });
        }
      }
      // Rivets are auto-consumed at 4× the buttons against the default rivet item.
      if (g.rivet && g.rivet.itemId && total > 0) {
        allocations.push({ accessoryItemId: g.rivet.itemId, qty: total * (g.rivet.multiplier || 4) });
      }
    }

    const formattedData = {
      ...data,
      invoiceNumber: parseInt(data.invoiceNumber) || '',
      quantity: parseInt(data.quantity) || '',
      quantityShort: parseInt(data.quantityShort) || '',
      rate: parseInt(data.rate) || '',
      date: data.date ? dayjs(data.date).toISOString() : null,
      finishOutDate: data.finishOutDate ? dayjs(data.finishOutDate).toISOString() : null,
      // Send whenever consumption slots are shown; an edit always sends (replaces rows).
      accessoryConsumption: groups.length > 0 ? allocations : undefined,
    };

    setLoading(true);
    const request = isEditMode
      ? apiService.finishing.updateFinishing(editRecord._id, formattedData)
      : apiService.finishing.createFinishing(formattedData);

    request
      .then(res => {
        onAddFinishing(lotId, res);
        reset(defaultValues);
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="add-finishing-modal"
      aria-describedby="modal-to-add-new-finishing"
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
        <Grid container spacing={2}>
          <Grid size={{ xs: 10, md: 10 }}>
            <Typography variant="h6" id="add-finishing-modal">
              {isEditMode ? 'Edit Finishing' : 'Add Finishing'}
            </Typography>
            <Typography variant="caption">Available Qty <b>{washAvailable != null ? washAvailable : lotQuantity}</b></Typography>
          </Grid>
          <Grid size={{ xs: 2, md: 2 }} sx={{ textAlign: 'right' }}>
            <IconButton id="close-finish-modal" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Grid>
        </Grid>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="lotNumber"
                control={control}
                rules={{ required: 'Lot Number is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Lot Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                    error={!!errors.lotNumber}
                    helperText={errors.lotNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="invoiceNumber"
                control={control}
                rules={{
                  required: 'Invoice Number is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Invoice Number"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    disabled
                    error={!!errors.invoiceNumber}
                    helperText={errors.invoiceNumber?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="vendorId"
                control={control}
                rules={{ required: 'Vendor is required' }}
                render={({ field }) => (
                  <FormControl fullWidth margin="normal" error={!!errors.vendorId}>
                    <InputLabel>Vendor</InputLabel>
                    <Select
                      {...field}
                      label="Vendor"
                      variant="standard"
                      onChange={(e) => {
                        field.onChange(e);
                        const v = (vendors || []).find(x => x._id === e.target.value);
                        if (v && Number(v.defaultRate) > 0) setValue('rate', v.defaultRate);
                      }}
                    >
                      {vendors.map(vendor => (
                        <MenuItem key={vendor._id} value={vendor._id}>{vendor.name}</MenuItem>
                      ))}
                    </Select>
                    {errors.vendorId && <Typography color="error" variant="caption">{errors.vendorId.message}</Typography>}
                  </FormControl>
                )}
              />
            </Grid>
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
                          variant: 'standard'
                        },
                      }}
                    />
                  )}
                />
              </LocalizationProvider>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="quantity"
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
                    variant="standard"
                    error={!!errors.quantity}
                    helperText={errors.quantity?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Controller
                name="rate"
                control={control}
                rules={{
                  required: 'Rate is required',
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Rate"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.rate}
                    helperText={errors.rate?.message}
                  />
                )}
              />
            </Grid>
            {isEditMode && (<><Grid size={{ xs: 3, md: 4 }}>
              <Controller
                name="quantityShort"
                control={control}
                rules={{
                  pattern: {
                    value: /^\d+$/,
                    message: 'Only numbers allowed',
                  },
                }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="QTY Short"
                    fullWidth
                    margin="normal"
                    variant="standard"
                    error={!!errors.quantityShort}
                    helperText={errors.quantityShort?.message}
                  />
                )}
              />
            </Grid>
              <Grid size={{ xs: 3, md: 4 }}>
                <Controller
                  name="quantityShortDesc"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Short Desc"
                      fullWidth
                      margin="normal"
                      variant="standard"
                      multiline
                      rows={1}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }} sx={{ alignContent: 'center' }}>
                <LocalizationProvider dateAdapter={AdapterDayjs}>
                  <Controller
                    name="finishOutDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        {...field}
                        label="Finish Out Date"
                        format="DD-MMM-YYYY"
                        slots={{ textField: MorphDateTextField }}
                        sx={{ width: '-webkit-fill-available', marginTop: '8px' }}
                        onChange={(value) => field.onChange(value)}
                        slotProps={{
                          textField: {
                            error: !!errors.finishOutDate,
                            helperText: errors.finishOutDate?.message,
                            variant: 'standard'
                          },
                        }}
                      />
                    )}
                  />
                </LocalizationProvider>
              </Grid></>)}

            {/* ── Accessory consumption (Button / Label / Tag / Polybag) ── */}
            {groups.length > 0 && (
              <>
                <Grid size={{ xs: 12, md: 12 }}>
                  <Divider sx={{ mt: 1 }}>
                    <Chip size="small" label="ACCESSORY CONSUMPTION" />
                  </Divider>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
                    Pre-filled to {qtyNum} — increase per item if extra is sent
                  </Typography>
                </Grid>
                {groups.map((g) => {
                  const k = gKey(g);
                  const rows = consumption[k] || [];
                  const total = groupTotal(k);
                  return (
                    <React.Fragment key={k}>
                      <Grid size={{ xs: 12 }} sx={{ mt: 0.5 }}>
                        <Divider sx={{ mt: 1 }}>
                          <Chip
                          size="small"
                          variant="outlined"
                          color={total < 1 ? 'error' : 'default'}
                          label={`${g.label}${g.multiplier > 1 ? ` ×${g.multiplier}` : ''}: ${total}${g.unit ? ' ' + g.unit : ''}`}
                        />
                        </Divider>
                        {g.rivet && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5 }}>
                            + {total * (g.rivet.multiplier || 4)} rivets added automatically ({g.rivet.name})
                          </Typography>
                        )}
                      </Grid>
                      {rows.map((row, idx) => (
                        <React.Fragment key={idx}>
                          <Grid size={{ xs: 7, md: 8 }}>
                            <FormControl fullWidth margin="dense" variant="standard">
                              <InputLabel>{g.label} item</InputLabel>
                              <Select
                                value={row.accessoryItemId}
                                label={`${g.label} item`}
                                onChange={(e) => setRow(k, idx, 'accessoryItemId', e.target.value)}
                              >
                                {g.items.map(it => (
                                  <MenuItem key={it._id} value={String(it._id)}>
                                    {it.name}{it.clientId ? ` · ${it.clientId.name || ''}` : ' · General'}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid size={{ xs: 3, md: 2 }}>
                            <TextField
                              label="Qty"
                              value={row.qty}
                              fullWidth
                              margin="dense"
                              variant="standard"
                              onChange={(e) => { if (/^\d*$/.test(e.target.value)) setRow(k, idx, 'qty', e.target.value); }}
                            />
                          </Grid>
                          <Grid size={{ xs: 2, md: 2 }} sx={{ alignContent: 'center' }}>
                            {rows.length > 1 && (
                              <Tooltip title="Remove this split">
                                <IconButton color="error" onClick={() => removeRow(k, idx)} sx={{ mt: 1 }}><DeleteIcon /></IconButton>
                              </Tooltip>
                            )}
                            {idx === rows.length - 1 && (
                              <Tooltip title={`Split ${g.label} across another item (e.g. partial client-linked + partial general)`}>
                                <IconButton onClick={() => addRow(k)} sx={{ mt: 1 }}><AddIcon /></IconButton>
                              </Tooltip>
                            )}
                          </Grid>
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  );
                })}
              </>
            )}

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
                    variant="standard"
                    multiline
                    rows={1}
                  />
                )}
              />
            </Grid>
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

export default AddFinishingModal;
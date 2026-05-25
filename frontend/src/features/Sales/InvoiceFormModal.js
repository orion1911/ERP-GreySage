import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import {
  Box, Modal, Typography, TextField, Button, IconButton, Grid,
  Autocomplete, MenuItem, Table, TableHead, TableRow, TableCell, TableBody,
  Stack, Divider, CircularProgress
} from '@mui/material';
import {
  Close as CloseIcon, Save as SaveIcon, Publish as PublishIcon,
  Add as AddIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

const fmtINR = (n) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

const emptyLine = {
  lotId: null,
  lotNumber: '',
  lotInvoiceNumber: '',
  description: '',
  hsnSac: '',
  pcs: '',
  unit: '',
  rate: '',
  remainingPcs: null,
  finalPcs: null
};

function InvoiceFormModal({ open, onClose, onSaved, editInvoice }) {
  const { isMobile, showSnackbar } = useOutletContext();
  const [submitting, setSubmitting] = useState(false);
  const [clients, setClients] = useState([]);
  const [lotsForClient, setLotsForClient] = useState([]);
  const [lotsLoading, setLotsLoading] = useState(false);

  const { control, handleSubmit, watch, setValue, reset, getValues } = useForm({
    defaultValues: {
      date: dayjs(),
      client: null,
      documentType: 'BILL_OF_SUPPLY',
      roundOff: 0,
      notes: '',
      lines: [{ ...emptyLine }]
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const lines = watch('lines');
  const client = watch('client');
  const roundOff = Number(watch('roundOff')) || 0;

  // Fetch clients on open
  useEffect(() => {
    if (!open) return;
    apiService.client.getClients('').then(setClients).catch((e) => showSnackbar(e));
  }, [open]);

  // Resolve the selected client's full record so we can read addresses (the autocomplete
  // option only carries name/clientCode). Place of Supply derives from shippingAddress.
  const selectedClientFull = useMemo(() => {
    if (!client?._id) return null;
    return clients.find((c) => c._id === client._id) || null;
  }, [client?._id, clients]);

  const derivedPlaceOfSupply = useMemo(() => {
    const ship = selectedClientFull?.shippingAddress;
    const bill = selectedClientFull?.billingAddress;
    const src = (ship?.state || ship?.stateCode) ? ship : bill;
    return {
      stateName: src?.state || '',
      stateCode: src?.stateCode || ''
    };
  }, [selectedClientFull]);

  // Hydrate when editing
  useEffect(() => {
    if (!open) return;
    if (editInvoice) {
      reset({
        date: dayjs(editInvoice.date),
        client: editInvoice.clientId ? {
          _id: editInvoice.clientId._id || editInvoice.clientId,
          name: editInvoice.clientSnapshot?.name,
          clientCode: editInvoice.clientSnapshot?.clientCode
        } : null,
        documentType: editInvoice.documentType || 'BILL_OF_SUPPLY',
        roundOff: editInvoice.roundOff || 0,
        notes: editInvoice.notes || '',
        lines: (editInvoice.lines || []).map((l) => ({
          lotId: l.lotId || null,
          lotNumber: l.lotNumberSnapshot || '',
          lotInvoiceNumber: l.lotInvoiceNumberSnapshot || '',
          description: l.description || '',
          hsnSac: l.hsnSac || '',
          pcs: l.pcs,
          unit: l.unit || '',
          rate: l.rate,
          remainingPcs: null,
          finalPcs: null
        }))
      });
    } else {
      reset({
        date: dayjs(),
        client: null,
        documentType: 'BILL_OF_SUPPLY',
        roundOff: 0,
        notes: '',
        lines: [{ ...emptyLine }]
      });
    }
  }, [open, editInvoice, reset]);

  // Reload lots when client changes
  useEffect(() => {
    if (!open || !client?._id) {
      setLotsForClient([]);
      return;
    }
    setLotsLoading(true);
    apiService.salesInvoices.getLotsAvailable({ clientId: client._id })
      .then((data) => setLotsForClient(data))
      .catch((e) => showSnackbar(e))
      .finally(() => setLotsLoading(false));
  }, [open, client?._id]);

  // Live totals
  const totals = useMemo(() => {
    const subTotal = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0) * (Number(l.rate) || 0), 0);
    const totalQty = (lines || []).reduce((acc, l) => acc + (Number(l.pcs) || 0), 0);
    return {
      subTotal,
      totalQty,
      total: subTotal + roundOff
    };
  }, [lines, roundOff]);

  // When a lot is picked: prefill description, pcs (= remaining), rate stays user-entered
  const handleLotChange = useCallback((idx, lotOption) => {
    if (!lotOption) {
      setValue(`lines.${idx}.lotId`, null);
      setValue(`lines.${idx}.lotNumber`, '');
      setValue(`lines.${idx}.lotInvoiceNumber`, '');
      setValue(`lines.${idx}.remainingPcs`, null);
      setValue(`lines.${idx}.finalPcs`, null);
      return;
    }
    setValue(`lines.${idx}.lotId`, lotOption._id);
    setValue(`lines.${idx}.lotNumber`, lotOption.lotNumber);
    setValue(`lines.${idx}.lotInvoiceNumber`, lotOption.invoiceNumber);
    setValue(`lines.${idx}.remainingPcs`, lotOption.remainingPcs);
    setValue(`lines.${idx}.finalPcs`, lotOption.finalPcs);
    const desc = `${lotOption.fitStyleName || ''}${lotOption.fabric ? ` (${lotOption.fabric})` : ''} - LOT ${lotOption.lotNumber}`.trim();
    if (!getValues(`lines.${idx}.description`)) setValue(`lines.${idx}.description`, desc);
    if (!getValues(`lines.${idx}.pcs`)) setValue(`lines.${idx}.pcs`, lotOption.remainingPcs);
  }, [setValue, getValues]);

  const onSubmit = (data) => {
    if (!data.client?._id) return showSnackbar('Please select a client');
    if (!data.lines || data.lines.length === 0) return showSnackbar('Add at least one line item');

    const payload = {
      date: data.date?.toISOString ? data.date.toISOString() : new Date(data.date).toISOString(),
      clientId: data.client._id,
      documentType: data.documentType,
      // placeOfSupply omitted on purpose — server derives from client's shipping address.
      // For edits, the snapshot is already frozen and not refreshed.
      roundOff: Number(data.roundOff) || 0,
      notes: data.notes,
      lines: data.lines.map((l) => ({
        lotId: l.lotId || null,
        description: l.description,
        hsnSac: l.hsnSac,
        pcs: parseInt(l.pcs, 10),
        unit: l.unit,
        rate: Number(l.rate)
      }))
    };

    setSubmitting(true);
    const req = editInvoice
      ? apiService.salesInvoices.updateInvoice(editInvoice._id, payload)
      : apiService.salesInvoices.createInvoice(payload);
    req
      .then((saved) => {
        setSubmitting(false);
        showSnackbar(editInvoice ? 'Invoice updated' : `Invoice ${saved.invoiceNumber} created`, 'success');
        onSaved(saved);
        onClose();
      })
      .catch((e) => {
        setSubmitting(false);
        showSnackbar(e);
      });
  };

  return (
    <Modal open={open} onClose={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Box sx={{
        width: isMobile ? '95%' : '92%',
        maxWidth: 1200,
        maxHeight: '92vh',
        overflowY: 'auto',
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: 24,
        p: 3
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {editInvoice ? `Edit Invoice ${editInvoice.invoiceNumber}` : 'New Invoice / Dispatch'}
          </Typography>
          <IconButton onClick={onClose}><CloseIcon /></IconButton>
        </Box>

        <form onSubmit={handleSubmit(onSubmit)}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Controller
                  name="date"
                  control={control}
                  rules={{ required: 'Date is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <DatePicker
                      label="Date"
                      value={field.value}
                      onChange={field.onChange}
                      format="DD/MM/YYYY"
                      slotProps={{ textField: { fullWidth: true, variant: 'standard', error: !!error, helperText: error?.message } }}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <Controller
                  name="client"
                  control={control}
                  rules={{ required: 'Client is required' }}
                  render={({ field, fieldState: { error } }) => (
                    <Autocomplete
                      options={clients}
                      getOptionLabel={(o) => o ? `${o.name} (${o.clientCode})` : ''}
                      isOptionEqualToValue={(o, v) => o?._id === v?._id}
                      value={field.value}
                      onChange={(_, v) => field.onChange(v)}
                      disabled={!!editInvoice}
                      renderInput={(params) => (
                        <TextField {...params} label="Client" variant="standard" error={!!error} helperText={error?.message || (editInvoice ? 'Client locked after issue' : '')} />
                      )}
                    />
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <Controller
                  name="documentType"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} select label="Document Type" fullWidth variant="standard">
                      <MenuItem value="BILL_OF_SUPPLY">Bill of Supply</MenuItem>
                      <MenuItem value="TAX_INVOICE">Tax Invoice</MenuItem>
                    </TextField>
                  )}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 5 }}>
                <TextField
                  label="Place of Supply (derived from client's shipping address)"
                  value={derivedPlaceOfSupply.stateName || derivedPlaceOfSupply.stateCode
                    ? `${derivedPlaceOfSupply.stateName}${derivedPlaceOfSupply.stateCode ? ` (${derivedPlaceOfSupply.stateCode})` : ''}`
                    : ''}
                  fullWidth variant="standard"
                  InputProps={{ readOnly: true }}
                  helperText={!client ? 'Pick a client' : (!derivedPlaceOfSupply.stateName ? 'Client has no shipping/billing state — edit the client to fix' : '')}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>

          <Divider sx={{ my: 2 }}><Typography variant="caption">LINE ITEMS</Typography></Divider>

          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width={36}>#</TableCell>
                  <TableCell width={240}>Lot # / Invoice #</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell width={70}>HSN/SAC</TableCell>
                  <TableCell width={90} align="right">Pcs</TableCell>
                  <TableCell width={100} align="right">Rate</TableCell>
                  <TableCell width={130} align="right">Amount</TableCell>
                  <TableCell width={50} />
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((row, idx) => {
                  const cur = lines?.[idx] || {};
                  const amount = (Number(cur.pcs) || 0) * (Number(cur.rate) || 0);
                  const remaining = cur.remainingPcs;
                  const overshoot = remaining !== null && remaining !== undefined && Number(cur.pcs) > remaining;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <Controller
                          name={`lines.${idx}.lotId`}
                          control={control}
                          render={() => (
                            <Autocomplete
                              size="small"
                              options={lotsForClient}
                              getOptionLabel={(o) => o ? `${o.lotNumber} (Inv ${o.invoiceNumber})` : ''}
                              isOptionEqualToValue={(o, v) => o?._id === v?._id}
                              loading={lotsLoading}
                              value={lotsForClient.find((l) => String(l._id) === String(cur.lotId)) || null}
                              onChange={(_, v) => handleLotChange(idx, v)}
                              disabled={!client}
                              renderOption={(props, option) => (
                                <Box component="li" {...props}>
                                  <Box>
                                    <Typography variant="body2"><b>{option.lotNumber}</b> · Inv {option.invoiceNumber}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {option.fitStyleName} · {option.fabric} · Remaining {option.remainingPcs} of {option.finalPcs} pcs
                                    </Typography>
                                  </Box>
                                </Box>
                              )}
                              renderInput={(params) => (
                                <TextField {...params} variant="standard" placeholder={client ? 'Pick a lot' : 'Pick a client first'} />
                              )}
                            />
                          )}
                        />
                        {cur.lotNumber && (
                          <Typography variant="caption" color="text.secondary">
                            Lot {cur.lotNumber} · Inv {cur.lotInvoiceNumber}
                            {remaining !== null && remaining !== undefined ? ` · Remaining ${remaining}` : ''}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`lines.${idx}.description`}
                          control={control}
                          rules={{ required: true }}
                          render={({ field }) => (
                            <TextField {...field} variant="standard" fullWidth multiline maxRows={3} />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`lines.${idx}.hsnSac`}
                          control={control}
                          render={({ field }) => (
                            <TextField {...field} variant="standard" size="small" />
                          )}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Controller
                          name={`lines.${idx}.pcs`}
                          control={control}
                          rules={{ required: true, min: 1 }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              variant="standard"
                              size="small"
                              inputProps={{ min: 1, style: { textAlign: 'right' } }}
                              error={overshoot}
                              helperText={overshoot ? `Max ${remaining}` : ''}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Controller
                          name={`lines.${idx}.rate`}
                          control={control}
                          rules={{ required: true, min: 0 }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              variant="standard"
                              size="small"
                              inputProps={{ min: 0, step: 0.01, style: { textAlign: 'right' } }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell align="right">{fmtINR(amount)}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>

          <Box sx={{ mt: 1 }}>
            <Button startIcon={<AddIcon />} onClick={() => append({ ...emptyLine })}>
              Add Line
            </Button>
          </Box>

          <Grid container spacing={2} sx={{ mt: 2 }}>
            <Grid size={{ xs: 12, md: 8 }}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} label="Notes" fullWidth multiline minRows={2} variant="standard" />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Stack spacing={1} sx={{ p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Sub Total</Typography>
                  <Typography variant="body2">Rs. {fmtINR(totals.subTotal)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">Round Off</Typography>
                  <Controller
                    name="roundOff"
                    control={control}
                    render={({ field }) => (
                      <TextField {...field} type="number" size="small" variant="standard" inputProps={{ step: 0.01, style: { textAlign: 'right', width: 80 } }} />
                    )}
                  />
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle1"><b>Total</b></Typography>
                  <Typography variant="subtitle1"><b>{totals.totalQty} pcs · Rs. {fmtINR(totals.total)}</b></Typography>
                </Box>
              </Stack>
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, gap: 1 }}>
            <Button onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={submitting ? <CircularProgress size={16} /> : (editInvoice ? <PublishIcon /> : <SaveIcon />)}
              disabled={submitting}
            >
              {editInvoice ? 'Update Invoice' : 'Save Invoice'}
            </Button>
          </Box>
        </form>
      </Box>
    </Modal>
  );
}

export default InvoiceFormModal;

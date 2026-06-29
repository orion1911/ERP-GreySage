import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller, useFieldArray } from 'react-hook-form';
import {
  Box, Typography, Grid, TextField, Button, Paper, Divider, MenuItem,
  IconButton, Stack, Chip, FormControlLabel, Switch
} from '@mui/material';
import { Save as SaveIcon, Add as AddIcon, Delete as DeleteIcon, Numbers as NumbersIcon, NotificationsActive as NotificationsIcon, Send as SendIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

const sectionPaperSx = { p: { xs: 2, md: 3 }, mb: 2 };

// Compute fyShort ("2627") for a given date (Indian FY starts April 1)
const fyShortFor = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? year : year - 1;
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`;
};

function CompanySettings() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Invoice counter state
  const [counterFy, setCounterFy] = useState(fyShortFor(new Date()));
  const [counterInfo, setCounterInfo] = useState(null);
  const [counterDraft, setCounterDraft] = useState(''); // user-entered "last issued" sequence
  const [counterSaving, setCounterSaving] = useState(false);

  // Low-stock email digest config (lives on CompanySettings.notifications.lowStock)
  const [notif, setNotif] = useState({ enabled: false, emails: [], sendHour: 9 });
  const [emailDraft, setEmailDraft] = useState('');
  const [notifSaving, setNotifSaving] = useState(false);
  const [testSending, setTestSending] = useState(false);

  const { control, handleSubmit, reset } = useForm({
    defaultValues: {
      name: '', addressLines: [{ value: '' }],
      gstin: '', pan: '', msmeType: '', msmeNumber: '', email: '', phone: '',
      gstStateCode: '', gstStateName: '',
      bank: { bankName: '', accountNumber: '', ifsc: '', accountName: '' },
      authorisedSignatory: { name: '', title: '' },
      defaultInvoicePrefix: 'INV',
      defaultDocumentType: 'BILL_OF_SUPPLY'
    }
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'addressLines' });

  useEffect(() => {
    setLoading(true);
    apiService.companySettings.getSettings()
      .then((s) => {
        reset({
          name: s.name || '',
          addressLines: (s.addressLines && s.addressLines.length ? s.addressLines : ['']).map((v) => ({ value: v })),
          gstin: s.gstin || '', pan: s.pan || '',
          msmeType: s.msmeType || '', msmeNumber: s.msmeNumber || '',
          email: s.email || '', phone: s.phone || '',
          gstStateCode: s.gstStateCode || '', gstStateName: s.gstStateName || '',
          bank: s.bank || { bankName: '', accountNumber: '', ifsc: '', accountName: '' },
          authorisedSignatory: s.authorisedSignatory || { name: '', title: '' },
          defaultInvoicePrefix: s.defaultInvoicePrefix || 'INV',
          defaultDocumentType: s.defaultDocumentType || 'BILL_OF_SUPPLY'
        });
        const ls = (s.notifications && s.notifications.lowStock) || {};
        setNotif({
          enabled: !!ls.enabled,
          emails: Array.isArray(ls.emails) ? ls.emails : [],
          sendHour: Number.isFinite(ls.sendHour) ? ls.sendHour : 9,
        });
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setLoading(false));
  }, [reset]);

  const loadCounter = (fy) => {
    apiService.salesInvoices.getInvoiceCounter(fy)
      .then((info) => {
        setCounterInfo(info);
        setCounterDraft(String(info.sequence || 0));
      })
      .catch((e) => showSnackbar(e));
  };

  useEffect(() => { loadCounter(counterFy); /* eslint-disable-next-line */ }, [counterFy]);

  const handleSetCounter = () => {
    const seq = parseInt(counterDraft, 10);
    if (!Number.isInteger(seq) || seq < 0) return showSnackbar('Sequence must be a non-negative integer');
    setCounterSaving(true);
    apiService.salesInvoices.setInvoiceCounter(counterFy, seq)
      .then((info) => {
        setCounterInfo(info);
        showSnackbar(`Next invoice will be ${info.nextInvoiceNumber}`, 'success');
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setCounterSaving(false));
  };

  const addEmail = () => {
    const e = emailDraft.trim().toLowerCase();
    if (!e) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return showSnackbar('Enter a valid email address');
    if (notif.emails.includes(e)) { setEmailDraft(''); return; }
    setNotif((n) => ({ ...n, emails: [...n.emails, e] }));
    setEmailDraft('');
  };

  const removeEmail = (e) => setNotif((n) => ({ ...n, emails: n.emails.filter((x) => x !== e) }));

  const saveNotifications = () => {
    setNotifSaving(true);
    apiService.companySettings.updateSettings({ notifications: { lowStock: notif } })
      .then(() => showSnackbar('Notification settings saved', 'success'))
      .catch((e) => showSnackbar(e))
      .finally(() => setNotifSaving(false));
  };

  const sendTestDigest = () => {
    setTestSending(true);
    apiService.accessories.sendLowStockTest()
      .then((r) => {
        if (r.sent) showSnackbar(`Test digest sent (${r.low} low item${r.low === 1 ? '' : 's'})`, 'success');
        else if (r.reason === 'nothing low') showSnackbar('Nothing is low right now — no email sent', 'info');
        else if (r.reason === 'no recipients') showSnackbar('Add at least one recipient and save first', 'warning');
        else showSnackbar(`Not sent (${r.reason || 'unknown'})`, 'warning');
      })
      .catch((e) => showSnackbar(e))
      .finally(() => setTestSending(false));
  };

  const onSubmit = (data) => {
    setSubmitting(true);
    const payload = {
      ...data,
      addressLines: (data.addressLines || []).map((l) => l.value).filter((s) => s && s.trim())
    };
    apiService.companySettings.updateSettings(payload)
      .then(() => showSnackbar('Settings saved', 'success'))
      .catch((e) => showSnackbar(e))
      .finally(() => setSubmitting(false));
  };

  return (
    <Box sx={{ pb: { xs: 12, md: 0 } }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Company Settings</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        These details print on every invoice. Update them once when the company info changes.
      </Typography>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Paper sx={sectionPaperSx}>
          <Typography variant="h6" sx={{ mb: 2 }}>Issuer</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="name" control={control} rules={{ required: 'Required' }}
                render={({ field, fieldState }) => (
                  <TextField {...field} label="Company Name" fullWidth variant="standard"
                    error={!!fieldState.error} helperText={fieldState.error?.message} />
                )} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="email" control={control}
                render={({ field }) => <TextField {...field} label="Email" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="phone" control={control}
                render={({ field }) => <TextField {...field} label="Phone" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <Typography variant="caption" color="text.secondary">Address Lines (rendered as-is on PDF)</Typography>
              {fields.map((f, idx) => (
                <Stack key={f.id} direction="row" spacing={1} sx={{ alignItems: 'center', mt: 1 }}>
                  <Controller name={`addressLines.${idx}.value`} control={control}
                    render={({ field }) => <TextField {...field} fullWidth size="small" variant="standard" />} />
                  <IconButton size="small" onClick={() => remove(idx)} disabled={fields.length === 1}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} onClick={() => append({ value: '' })} sx={{ mt: 1 }}>
                Add Line
              </Button>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="gstin" control={control}
                render={({ field }) => <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} label="GSTIN" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="pan" control={control}
                render={({ field }) => <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} label="PAN" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="msmeType" control={control}
                render={({ field }) => <TextField {...field} label="MSME/Udyam Type" fullWidth variant="standard" helperText="e.g. Micro" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="msmeNumber" control={control}
                render={({ field }) => <TextField {...field} label="MSME/Udyam No" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="gstStateCode" control={control}
                render={({ field }) => <TextField {...field} label="GST State Code" fullWidth variant="standard" helperText="e.g. 27" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="gstStateName" control={control}
                render={({ field }) => <TextField {...field} label="GST State Name" fullWidth variant="standard" helperText="e.g. Maharashtra" />} />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={sectionPaperSx}>
          <Typography variant="h6" sx={{ mb: 2 }}>Bank Details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="bank.bankName" control={control}
                render={({ field }) => <TextField {...field} label="Bank Name" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="bank.accountNumber" control={control}
                render={({ field }) => <TextField {...field} label="Account Number" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="bank.ifsc" control={control}
                render={({ field }) => <TextField {...field} onChange={(e) => field.onChange(e.target.value.toUpperCase())} label="IFSC Code" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Controller name="bank.accountName" control={control}
                render={({ field }) => <TextField {...field} label="Account Name" fullWidth variant="standard" />} />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={sectionPaperSx}>
          <Typography variant="h6" sx={{ mb: 2 }}>Signatory & Invoice Defaults</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Controller name="authorisedSignatory.name" control={control}
                render={({ field }) => <TextField {...field} label="Signatory Name" fullWidth variant="standard" />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <Controller name="authorisedSignatory.title" control={control}
                render={({ field }) => <TextField {...field} label="Signatory Title" fullWidth variant="standard" helperText="e.g. Proprietor" />} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Controller name="defaultInvoicePrefix" control={control}
                render={({ field }) => <TextField {...field} label="Invoice # Prefix" fullWidth variant="standard" helperText="e.g. INV" />} />
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Controller name="defaultDocumentType" control={control}
                render={({ field }) => (
                  <TextField {...field} select label="Default Doc Type" fullWidth variant="standard">
                    <MenuItem value="BILL_OF_SUPPLY">Bill of Supply</MenuItem>
                    <MenuItem value="TAX_INVOICE">Tax Invoice</MenuItem>
                  </TextField>
                )} />
            </Grid>
          </Grid>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', md: 'flex-end' } }}>
          <Button
            type="submit" variant="contained" startIcon={<SaveIcon />}
            disabled={submitting || loading}
            fullWidth={isMobile}
          >
            {submitting ? 'Saving…' : 'Save Settings'}
          </Button>
        </Box>
      </form>

      <Paper sx={{ ...sectionPaperSx, mt: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <NumbersIcon fontSize="small" />
          <Typography variant="h6">Invoice Number Counter</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sets the starting point for invoice numbers in a fiscal year (Apr–Mar). Useful when migrating from another system that's already at a certain sequence. Counter holds the <b>last issued</b> number; the next invoice will be one higher. Cannot be set lower than the highest existing invoice for that FY.
        </Typography>
        <Grid container spacing={2} alignItems="flex-end">
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField
              label="Fiscal Year (short)"
              value={counterFy}
              onChange={(e) => setCounterFy(e.target.value.trim())}
              fullWidth variant="standard"
              helperText="e.g. 2627 = FY 2026-27"
            />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField
              label="Last issued sequence"
              type="number"
              value={counterDraft}
              onChange={(e) => setCounterDraft(e.target.value)}
              fullWidth variant="standard"
              inputProps={{ min: 0 }}
              helperText="Next invoice will be one higher"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            {/* Desktop: pb spacer aligns Stack bottom with TextField input bottom (helperText height).
                Mobile: no need to align since the chip wraps to its own row — drop the extra padding. */}
            <Box sx={{ pb: { xs: 0, md: '20px' }, minHeight: { xs: 'auto', md: 32 }, display: 'flex', alignItems: 'center' }}>
              {counterInfo && (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="body2" color="text.secondary">Next invoice will be:</Typography>
                  <Chip
                    label={`INV${counterFy}/${(parseInt(counterDraft, 10) || 0) + 1}`}
                    color="primary"
                    variant="outlined"
                  />
                </Stack>
              )}
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <Button
              variant="contained" fullWidth
              onClick={handleSetCounter}
              disabled={counterSaving || counterDraft === String(counterInfo?.sequence ?? '')}
              sx={{ mb: { xs: 0, md: '20px' } }}
            >
              {counterSaving ? 'Saving…' : 'Update Counter'}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ ...sectionPaperSx, mt: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <NotificationsIcon fontSize="small" />
          <Typography variant="h6">Low-Stock Email Alerts</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          A once-a-day email lists every monitored accessory item at or below its reorder level. Turn an item on (and set a reorder level) in <b>Stock Management</b>. The email is only sent when something is actually low.
        </Typography>

        <FormControlLabel
          control={<Switch checked={notif.enabled} onChange={(e) => setNotif((n) => ({ ...n, enabled: e.target.checked }))} />}
          label="Enable daily low-stock email"
        />

        <Grid container spacing={2} sx={{ mt: 0.5 }} alignItems="flex-end">
          <Grid size={{ xs: 12, md: 8 }}>
            <Stack direction="row" spacing={1} alignItems="flex-end">
              <TextField
                label="Add recipient email" value={emailDraft}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                fullWidth variant="standard" type="email"
              />
              <Button size="small" startIcon={<AddIcon />} onClick={addEmail}>Add</Button>
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
              {notif.emails.length === 0 && (
                <Typography variant="caption" color="text.secondary">No recipients yet.</Typography>
              )}
              {notif.emails.map((e) => (
                <Chip key={e} label={e} onDelete={() => removeEmail(e)} size="small" />
              ))}
            </Stack>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField
              label="Send hour (local)" type="number"
              value={notif.sendHour}
              onChange={(e) => setNotif((n) => ({ ...n, sendHour: e.target.value }))}
              fullWidth variant="standard" inputProps={{ min: 0, max: 23 }}
              helperText="Informational"
            />
          </Grid>
        </Grid>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
          <Button variant="contained" startIcon={<SaveIcon />} onClick={saveNotifications}
            disabled={notifSaving} fullWidth={isMobile}>
            {notifSaving ? 'Saving…' : 'Save Notification Settings'}
          </Button>
          <Button variant="outlined" startIcon={<SendIcon />} onClick={sendTestDigest}
            disabled={testSending} fullWidth={isMobile}>
            {testSending ? 'Sending…' : 'Send test digest now'}
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          The test uses saved recipients — save before testing. It still only sends if at least one item is currently low.
        </Typography>
      </Paper>
    </Box>
  );
}

export default CompanySettings;

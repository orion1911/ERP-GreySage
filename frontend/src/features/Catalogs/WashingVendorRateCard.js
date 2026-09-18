import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Modal, Typography, IconButton, TextField, Button, Stack, Paper,
  Alert, InputAdornment,
} from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

// Per-vendor rate card editor: every active wash creation with a rate input for
// THIS washing vendor. A rate of 0 (the default) means "not priced" — a washing
// entry selecting an unpriced creation is blocked until it is priced here.
function WashingVendorRateCard({ open, onClose, vendor, onSaved }) {
  const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
  const [rows, setRows] = useState([]); // [{ creationId, name, rateInput }]
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !vendor?._id) return;
    setLoading(true);
    apiService.washCreations.getWashCreationRates(vendor._id)
      .then((data) => setRows(data.map(r => ({
        ...r,
        // Default every creation to 0 — an unset rate reads as 0, not blank.
        rateInput: (r.rate === null || r.rate === undefined) ? '0' : String(r.rate),
      }))))
      .catch(err => { console.log(err); showSnackbar(err); })
      .finally(() => setLoading(false));
  }, [open, vendor, showSnackbar]);

  const setRate = (creationId, value) => {
    // Numeric only; strip anything that isn't a number/decimal point.
    const clean = value.replace(/[^\d.]/g, '');
    setRows(rows.map(r => (String(r.creationId) === String(creationId) ? { ...r, rateInput: clean } : r)));
  };

  const handleSave = () => {
    setSaving(true);
    const rates = rows.map(r => ({
      creationId: r.creationId,
      rate: r.rateInput === '' ? 0 : Number(r.rateInput),
    }));
    apiService.washCreations.saveWashCreationRates(vendor._id, rates)
      .then(() => {
        setSaving(false);
        showSnackbar(`Rate card saved for ${vendor.name}`, 'success');
        onSaved && onSaved();
        onClose();
      })
      .catch(err => {
        setSaving(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  const pricedCount = rows.filter(r => Number(r.rateInput) > 0).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-labelledby="rate-card-modal"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Box
        sx={{
          ml: isMobile ? 0 : drawerWidth + 'px',
          width: isMobile ? '92%' : '46%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
          borderRadius: 2,
          boxShadow: 24,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <Box sx={{
          px: 2.5, py: 1.75,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover',
        }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" id="rate-card-modal" sx={{ lineHeight: 1.25 }}>Rate Card</Typography>
            <Typography variant="caption" color="text.secondary" noWrap>{vendor?.name || ''}</Typography>
          </Box>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>

        {/* Body */}
        <Box sx={{ px: 2.5, py: 2, overflowY: 'auto', flexGrow: 1 }}>
          <Alert severity="info" sx={{ mb: 2, py: 0.25 }}>
            Rate per piece for each wash creation, for this vendor. A washing entry that selects
            several creations is billed the <b>SUM</b> of their rates. Leaving a rate at 0 marks it
            “not priced” — selecting it in washing is then blocked.
          </Alert>

          {loading ? (
            <Typography variant="body2" sx={{ py: 3, textAlign: 'center' }}>Loading…</Typography>
          ) : rows.length === 0 ? (
            <Alert severity="warning" sx={{ my: 1 }}>
              No active wash creations yet — add them in the “Wash Creations” tab first.
            </Alert>
          ) : (
            <Stack spacing={1}>
              {rows.map((r) => {
                const priced = Number(r.rateInput) > 0;
                return (
                  <Paper
                    key={String(r.creationId)}
                    variant="outlined"
                    sx={{ p: 1, px: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}
                  >
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="body2" noWrap>{r.name}</Typography>
                      <Typography variant="caption" color={priced ? 'success.main' : 'text.secondary'}>
                        {priced ? '' : 'Not priced'}
                      </Typography>
                    </Box>
                    <TextField
                      value={r.rateInput}
                      onChange={(e) => setRate(r.creationId, e.target.value)}
                      size="small"
                      sx={{ width: 130 }}
                      inputProps={{ inputMode: 'decimal', style: { textAlign: 'right' } }}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    />
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{
          px: 2.5, py: 1.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: 1, borderColor: 'divider',
        }}>
          <Typography variant="caption" color="text.secondary">
            {pricedCount} of {rows.length} priced
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              variant="contained"
              endIcon={<SaveIcon />}
              disabled={loading || saving || rows.length === 0}
              onClick={handleSave}
            >
              {saving ? 'Saving…' : 'SAVE'}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Modal>
  );
}

export default WashingVendorRateCard;
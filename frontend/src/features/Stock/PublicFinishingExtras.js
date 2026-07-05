import React, { useRef, useState } from 'react';
import { Box, Container, Typography, FormControlLabel, Switch, Stack } from '@mui/material';
import { SnackBar } from '../../components/SnackBar';
import ThemeToggle from '../../components/Theme/ThemeToggle';
import FinishingVendorExtras from './FinishingVendorExtras';
import apiService from '../../services/apiService';

/**
 * Public, no-login status board for Finishing Vendor Extras.
 *
 * Rendered on the `/finishing-extras` route OUTSIDE the authenticated layout so anonymous
 * viewers (e.g. finishing vendors) can check accessory status. It reuses <FinishingVendorExtras>
 * in read-only mode (all record/reverse actions hidden) against the public read endpoint. The
 * "Available Stock" view is intentionally not exposed here.
 */
export default function PublicFinishingExtras() {
  const [hideZero, setHideZero] = useState(true);
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'error' });
  const timerRef = useRef(null);

  // Standalone snackbar (there's no AuthenticatedLayout to provide one here).
  const showSnackbar = (err, severity = 'error') => {
    let message = err;
    if (typeof err === 'object' && err !== null) {
      message = err.response?.data?.error || err.message || 'An error occurred';
    }
    clearTimeout(timerRef.current);
    setSnack({ open: true, message: String(message), severity });
    timerRef.current = setTimeout(() => setSnack((s) => ({ ...s, open: false })), 5000);
  };

  return (
    <Box sx={{ height: '100vh', overflowY: 'auto', bgcolor: 'background.default', py: { xs: 2, md: 4 } }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="h4">Finishing Vendor Extras</Typography>
            <Typography variant="body2" color="text.secondary">Accessory status — read-only</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <FormControlLabel
              control={<Switch size="small" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} />}
              label="Hide zero net-held"
            />
            <ThemeToggle />
          </Stack>
        </Box>

        <FinishingVendorExtras
          readOnly
          hideZero={hideZero}
          showSnackbar={showSnackbar}
          loadData={apiService.accessories.getFinishingVendorExtrasPublic}
        />
      </Container>

      <SnackBar open={snack.open} message={snack.message} severity={snack.severity} />
    </Box>
  );
}

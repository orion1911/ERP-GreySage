import React from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Typography, Grid, Tooltip, TablePagination } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, PlaylistAdd as PlaylistAddIcon, Launch as LaunchIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { motion, AnimatePresence } from 'motion/react';
import dayjs from 'dayjs';
import { lotStatusChip } from './CuttingBookManagement';

// Mobile-first card list for the Cutting Book. Per repo convention the Add buttons live
// HERE on mobile (they sit in the page header on desktop).
function CuttingBookGridSx({
  sheets,
  loading,
  total,
  page,
  rowsPerPage,
  setPage,
  setRowsPerPage,
  onNew,
  onAttach,
  onEdit,
  onDelete,
  onGoToStitching
}) {
  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<PlaylistAddIcon />} onClick={onAttach} disabled={loading}>Attach</Button>
          <Button size="small" variant="contained" onClick={onNew} disabled={loading}>New Sheet</Button>
        </Stack>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {loading ? (
            <OrderCardsLoader type="cuttingbook" />
          ) : sheets.length > 0 ? (
            sheets.map((sheet) => (
              <Card key={sheet._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1 }}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 7 }} sx={{ textAlign: 'left' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle1" fontWeight="bold">
                          {sheet.lotId?.lotNumber || '—'}
                        </Typography>
                        {lotStatusChip(sheet.lotId?.status)}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(sheet.date).format('DD-MMM-YYYY')}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 5 }} sx={{ textAlign: 'right' }}>
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {sheet.lotId?.status > 1 && (
                          <Tooltip title="Open in Stitching">
                            <IconButton size="small" onClick={() => onGoToStitching(sheet)}>
                              <LaunchIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        <IconButton size="small" color="primary" disabled={loading} onClick={() => onEdit(sheet)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" disabled={loading} onClick={() => onDelete(sheet)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Grid>
                    <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Client</strong><br />
                        {sheet.clientId?.name || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Fabric</strong><br />
                        {sheet.fabric || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Vendor</strong><br />
                        {sheet.stitchingVendorId?.name || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 6 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Master</strong><br />
                        {sheet.masterId?.name || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                        <Typography variant="body2"><strong>{sheet.totalMeters}</strong> mtr</Typography>
                        <Typography variant="body2"><strong>{sheet.totalPcs}</strong> pcs</Typography>
                        <Typography variant="body2">AVG <strong>{sheet.avgConsumption}</strong></Typography>
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
          )}
          {!loading && total > 0 && (
            <TablePagination
              component="div"
              count={total}
              page={page}
              onPageChange={(_, newPage) => setPage(newPage)}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[10, 25, 50]}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </Box>
  );
}

export default CuttingBookGridSx;

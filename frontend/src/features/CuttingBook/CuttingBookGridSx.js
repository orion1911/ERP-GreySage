import React from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Typography, Grid, Tooltip, TablePagination } from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, PlaylistAdd as PlaylistAddIcon, Launch as LaunchIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import dayjs from 'dayjs';
import { lotStatusChip } from './CuttingBookManagement';

// Mobile-first card list for the Cutting Book. Per repo convention the Add buttons live
// HERE on mobile (they sit in the page header on desktop).
function CuttingBookGridSx({
  sheets = [],
  loading,
  initialLoading,
  isMobile,
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
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <Box sx={{ pt: 1 }}>
      {/* Mobile Action Buttons */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<PlaylistAddIcon />} onClick={onAttach} disabled={loading}>
            Attach
          </Button>
          <Button size="small" variant="contained" onClick={onNew} disabled={loading}>
            New Sheet
          </Button>
        </Stack>
      </Box>

      {/* Conditional Layout Loader / Card Grid */}
      {initialLoading ? (
        <OrderCardsLoader type="cuttingbook" />
      ) : sheets.length > 0 ? (
        <Box
          sx={{
            '@keyframes gridFadeIn': { from: { opacity: 0 }, to: { opacity: 1 } },
            animation: 'gridFadeIn 0.25s ease-in',
          }}
        >
          {sheets.map((sheet) => (
            <Card key={sheet._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1 }}>
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Grid container spacing={1} alignItems="center">
                  
                  {/* Left Side: Sheet Information */}
                  <Grid item xs={7} sx={{ textAlign: 'left' }}>
                    <Stack direction="column" spacing={0.5}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {sheet.sheetNumber || `Sheet #${sheet._id.slice(-4)}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {sheet.date ? dayjs(sheet.date).format('DD MMM YYYY') : 'No Date'}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        {lotStatusChip ? lotStatusChip(sheet.status) : sheet.status}
                      </Box>
                    </Stack>
                  </Grid>

                  {/* Right Side: Action Row */}
                  <Grid item xs={5} sx={{ textAlign: 'right' }}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      <Tooltip title="Go to Stitching">
                        <IconButton size="small" color="primary" onClick={() => onGoToStitching(sheet)} disabled={loading}>
                          <LaunchIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton size="small" color="info" onClick={() => onEdit(sheet)} disabled={loading}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton size="small" color="error" onClick={() => onDelete(sheet._id)} disabled={loading}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Grid>

                </Grid>
              </CardContent>
            </Card>
          ))}

          {/* Pagination Controls */}
          <TablePagination
            component="div"
            count={total || 0}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage={isMobile ? "Rows:" : "Rows per page:"}
          />
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">No cutting sheets found.</Typography>
        </Box>
      )}
    </Box>
  );
}

export default CuttingBookGridSx;

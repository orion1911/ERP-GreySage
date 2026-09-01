import React, { useState, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Typography, Grid, Tooltip, TablePagination } from '@mui/material';
import { ArrowUpward, ArrowDownward, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { motion, AnimatePresence } from 'motion/react';

function CuttingMasterCatalogSx({
  masters,
  search,
  loading,
  handleToggleActive,
  showSnackbar,
  handleEditMaster,
  onReorder,
  onAdd
}) {
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const filteredMasters = useMemo(() => {
    return masters.filter(master =>
      master.name?.toLowerCase().includes(search.toLowerCase())
    );
  }, [masters, search]);

  const processedMasters = useMemo(() => {
    return [...filteredMasters].sort((a, b) => sortDirection === 'asc'
      ? (a.name || '').localeCompare(b.name || '')
      : (b.name || '').localeCompare(a.name || ''));
  }, [filteredMasters, sortDirection]);

  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<SwapVert />} onClick={onReorder} disabled={loading}>Order</Button>
          <Button size="small" variant="contained" onClick={onAdd} disabled={loading}>Add</Button>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
          <Typography variant="caption">Name</Typography>
          <IconButton
            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
            sx={{ ml: 1 }}
          >
            {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
          </IconButton>
        </Stack>
      </Box>
      <AnimatePresence mode="wait">
        <motion.div
          key={!processedMasters ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {!processedMasters ? (
            <OrderCardsLoader type="vendor" />
          ) : processedMasters.length > 0 ? (
            processedMasters.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((master) => (
              <Card key={master._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1 }}>
                <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                  <Grid container spacing={1}>
                    <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left', alignContent: 'center' }}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {master.name || 'N/A'}
                      </Typography>
                      {!master.isActive && (
                        <Typography variant="caption" color="text.secondary">Inactive</Typography>
                      )}
                    </Grid>
                    <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'right' }}>
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title={master.isActive ? 'Disable' : 'Enable'}>
                          <IconButton
                            variant="contained"
                            color={master.isActive ? 'warning' : 'success'}
                            size="small"
                            disabled={loading}
                            onClick={() => handleToggleActive(master._id)}
                            sx={{ mt: 0.2 }}
                          >
                            {master.isActive ? <DeleteIcon /> : <CheckIcon />}
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit">
                          <IconButton
                            variant="contained"
                            color="primary"
                            size="small"
                            disabled={loading}
                            onClick={() => handleEditMaster(master)}
                            sx={{ mt: 0.2 }}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            ))
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
          )}
          {processedMasters && processedMasters.length > 0 && (
            <TablePagination
              component="div"
              count={processedMasters.length}
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

export default CuttingMasterCatalogSx;

import React, { useState, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Button, IconButton, Typography, useTheme, Grid, Select, MenuItem, Tooltip, TablePagination } from '@mui/material';
import { ArrowUpward, ArrowDownward, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';

function FabricVendorCatalogSx({
  vendors,
  search,
  loading,
  handleToggleActive,
  showSnackbar,
  handleEditVendor
}) {
  const theme = useTheme();
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return [];
    return [...data].sort((a, b) => {
      let valueA = '';
      let valueB = '';
      if (sortKey === 'name') {
        valueA = a.name || '';
        valueB = b.name || '';
      } else if (sortKey === 'contact') {
        valueA = a.contact || '';
        valueB = b.contact || '';
      } else if (sortKey === 'address') {
        valueA = a.address || '';
        valueB = b.address || '';
      } else if (sortKey === 'isActive') {
        valueA = a.isActive ? 1 : 0;
        valueB = b.isActive ? 1 : 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor =>
      vendor.name?.toLowerCase().includes(search.toLowerCase()) ||
      vendor.contact?.toLowerCase().includes(search.toLowerCase()) ||
      vendor.address?.toLowerCase().includes(search.toLowerCase())
    );
  }, [vendors, search]);

  const processedVendors = useMemo(() => {
    return sortData(filteredVendors, sortBy, sortDirection);
  }, [filteredVendors, sortBy, sortDirection]);

  return (
    <Box sx={{ pt: 1 }}>
      <Grid container spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Select
              variant="standard"
              size="small"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setSortDirection('asc');
              }}
            >
              <MenuItem value="name">Sort By Name</MenuItem>
              <MenuItem value="contact">Sort By Contact</MenuItem>
              {/* <MenuItem value="address">Sort By Address</MenuItem>
              <MenuItem value="isActive">Sort By Status</MenuItem> */}
            </Select>
            <IconButton
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              sx={{ ml: 1 }}
            >
              {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
            </IconButton>
          </Stack>
        </Grid>
      </Grid>
      {!processedVendors ? (
        <OrderCardsLoader type="vendor" />
      ) : processedVendors.length > 0 ? (
        processedVendors.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((vendor) => (
          <Card key={vendor._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Grid container spacing={1}>
                <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {vendor.name || 'N/A'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'right' }}>
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Tooltip title={vendor.isActive ? 'Disable' : 'Enable'}>
                      <IconButton
                        variant="contained"
                        color={vendor.isActive ? 'warning' : 'success'}
                        size="small"
                        disabled={loading}
                        onClick={() => handleToggleActive(vendor._id)}
                        sx={{ mt: 0.2 }}
                      >
                        {vendor.isActive ? <DeleteIcon /> : <CheckIcon />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                      <IconButton
                        variant="contained"
                        color="primary"
                        size="small"
                        disabled={loading}
                        onClick={() => handleEditVendor(vendor)}
                        sx={{ mt: 0.2 }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="body2">
                    <strong>Contact</strong><br />
                    {vendor.contact || 'N/A'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="body2">
                    <strong>Address</strong><br />
                    {vendor.address || 'N/A'}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        ))
      ) : (
        <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
      )}
      {processedVendors && processedVendors.length > 0 && (
        <TablePagination
          component="div"
          count={processedVendors.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Box>
  );
}

export default FabricVendorCatalogSx;
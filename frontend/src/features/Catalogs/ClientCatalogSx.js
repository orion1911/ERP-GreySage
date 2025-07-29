import React, { useState, useEffect, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Typography, useTheme, Grid, TextField, Select, MenuItem } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';

function ClientCatalogSx({
  clients,
  loading,
  handleToggleActive,
}) {
  const theme = useTheme();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return [];
    return [...data].sort((a, b) => {
      let valueA, valueB;
      if (sortKey === 'name') {
        valueA = a.name || '';
        valueB = b.name || '';
      } else if (sortKey === 'clientCode') {
        valueA = a.clientCode || '';
        valueB = b.clientCode || '';
      } else if (sortKey === 'contact') {
        valueA = a.contact || '';
        valueB = b.contact || '';
      } else if (sortKey === 'address') {
        valueA = a.address || '';
        valueB = b.address || '';
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueB);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const processedClients = useMemo(() => {
    return sortData(clients, sortBy, sortDirection);
  }, [clients, sortBy, sortDirection]);

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  return (
    <Box sx={{ pt: 1 }}>
      <Grid container spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
        <Grid item xs={12} sm={6} md={4}>
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
              <MenuItem value="clientCode">Sort By Client Code</MenuItem>
              <MenuItem value="contact">Sort By Contact</MenuItem>
              <MenuItem value="address">Sort By Address</MenuItem>
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
      {!processedClients ? (
        <OrderCardsLoader type="client" />
      ) : processedClients.length > 0 ? (
        processedClients.map((client) => (
          <Card key={client._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Stack>
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {client.name || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'right' }}>
                    <IconButton onClick={() => toggleRowExpansion(client._id)} size="small">
                      <ExpandMoreIcon sx={{ transform: expandedRows[client._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </IconButton>
                  </Grid>
                </Grid>
              </Stack>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Client Code</strong><br />
                      {client.clientCode || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6 }}>
                    <Typography variant="body2">
                      <strong>Contact</strong><br />
                      {client.contact || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Stack>
              <Collapse in={expandedRows[client._id]}>
                <Grid container spacing={1} sx={{ mt: 2, textAlign: 'center' }}>
                  <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Email</strong><br />
                      {client.email || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Status</strong><br />
                      {client.isActive ? 'Active' : 'Inactive'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Address</strong><br />
                      {client.address || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 12 }}>
                    <Button
                      variant="contained"
                      color="warning"
                      size="small"
                      loading={loading}
                      loadingPosition="end"
                      onClick={() => handleToggleActive(client._id)}
                      fullWidth
                      sx={{ mt: 1 }}
                    >
                      {client.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </Grid>
                </Grid>
              </Collapse>
            </CardContent>
          </Card>
        ))
      ) : (
        <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
      )}
    </Box>
  );
}

export default ClientCatalogSx;
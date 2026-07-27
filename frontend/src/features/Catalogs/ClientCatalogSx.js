import React, { useState, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Typography, useTheme, Grid, Chip, Select, MenuItem, Tooltip, TablePagination } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { motion, AnimatePresence } from 'motion/react';

function ClientCatalogSx({
  clients,
  search,
  loading,
  handleToggleActive,
  handleEditClient,
  table,
  onReorder,
  onAdd
}) {
  const theme = useTheme();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

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
      } else if (sortKey === 'email') {
        valueA = a.email || '';
        valueB = b.email || '';
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

  const filteredClients = useMemo(() => {
    return clients.filter(client =>
      client.name?.toLowerCase().includes(search.toLowerCase()) ||
      client.clientCode?.toLowerCase().includes(search.toLowerCase()) ||
      client.contact?.toLowerCase().includes(search.toLowerCase()) ||
      client.email?.toLowerCase().includes(search.toLowerCase()) ||
      client.address?.toLowerCase().includes(search.toLowerCase())
    );
  }, [clients, search]);

  const processedClients = useMemo(() => {
    return sortData(filteredClients, sortBy, sortDirection);
  }, [filteredClients, sortBy, sortDirection]);

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  return (
    <Box sx={{ pt: 1 }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<SwapVert />} onClick={onReorder} disabled={loading}>Order</Button>
          <Button size="small" variant="contained" onClick={onAdd} disabled={loading}>Add</Button>
        </Stack>
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
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="clientCode">Client Code</MenuItem>
            <MenuItem value="isActive">Status</MenuItem>
          </Select>
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
          key={!processedClients ? 'loading' : 'data'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {!processedClients ? (
            <OrderCardsLoader type="client" />
          ) : processedClients.length > 0 ? (
            processedClients.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map((client) => (
              <Card key={client._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1 }}>
                <CardContent>
                  <Stack>
                    <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                      <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'left' }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Typography variant="subtitle1" fontWeight="bold">
                            {client.name || 'N/A'}
                          </Typography>
                          {client.isInternal && (
                            <Chip size="small" color="info" variant="outlined" label="in-house"
                              sx={{ height: 18, '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' } }} />
                          )}
                        </Stack>
                      </Grid>
                      <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'right' }}>
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Tooltip title={client.isActive ? 'Disable' : 'Enable'}>
                            <IconButton
                              color={client.isActive ? 'warning' : 'success'}
                              size="small"
                              disabled={loading}
                              onClick={() => handleToggleActive(client._id)}
                            >
                              {client.isActive ? <DeleteIcon /> : <CheckIcon />}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edit">
                            <IconButton
                              color="primary"
                              size="small"
                              disabled={loading}
                              onClick={() => handleEditClient(client)}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <IconButton onClick={() => toggleRowExpansion(client._id)} size="small">
                            <ExpandMoreIcon sx={{ transform: expandedRows[client._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                          </IconButton>
                        </Stack>
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
                      <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'left' }}>
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
                          <strong>Default Firm</strong><br />
                          {client.billingName || 'N/A'}
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
                          <strong>State</strong><br />
                          {client.billingAddress?.state || 'N/A'}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Collapse>
                </CardContent>
              </Card>
            ))
          ) : (
            <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
          )}
          {processedClients && processedClients.length > 0 && (
            <TablePagination
              component="div"
              count={processedClients.length}
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

export default ClientCatalogSx;
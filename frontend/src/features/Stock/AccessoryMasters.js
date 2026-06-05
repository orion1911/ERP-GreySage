import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Paper, Grid, TextField, Button, IconButton, Tooltip, FormControlLabel, Switch,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Typography, Stack, Chip,
  Card, CardContent, CircularProgress
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon
} from '@mui/icons-material';
import apiService from '../../services/apiService';
import AccessoryItemModal from './AccessoryItemModal';

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN');

function AccessoryMasters({ type, clients, onStockChange }) {
  const { isMobile, showSnackbar } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  // showSnackbar omitted from deps on purpose — its identity changes every layout render,
  // so depending on it would refetch on each setSnackbar and loop on a 401.
  const load = useCallback(() => {
    setLoading(true);
    apiService.accessories.getStock(type._id)
      .then(res => setRows(res.items || []))
      .catch(err => showSnackbar(err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = (id) => {
    apiService.accessories.toggleItemActive(id)
      .then(() => load())
      .catch(err => showSnackbar(err));
  };

  const handleSaved = () => {
    setModalOpen(false);
    setEditItem(null);
    load();
    onStockChange && onStockChange();
  };

  const filtered = rows.filter(r =>
    (showInactive || r.isActive) &&
    (!search || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Box>
      <Paper sx={{ p: { xs: 1.5, md: 2 }, mb: 2 }}>
        <Grid container spacing={1.5} alignItems="center">
          <Grid size={{ xs: 7, md: 4 }}>
            <TextField
              label="Search item" value={search} onChange={e => setSearch(e.target.value)}
              fullWidth variant="standard" size="small"
            />
          </Grid>
          <Grid size={{ xs: 5, md: 4 }}>
            <FormControlLabel
              control={<Switch size="small" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />}
              label={<Typography variant="caption">Inactive</Typography>}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }} sx={{ textAlign: 'right' }}>
            <Button
              variant="contained" size="small" startIcon={<AddIcon />}
              onClick={() => { setEditItem(null); setModalOpen(true); }}
              fullWidth={isMobile}
            >
              Add {type.name}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {loading ? (
        <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={28} /></Box>
      ) : isMobile ? (
        <Stack spacing={1.5}>
          {filtered.length === 0 && <Typography align="center" variant="body2">No items</Typography>}
          {filtered.map(item => (
            <Card key={item._id} variant="outlined">
              <CardContent sx={{ pb: 1 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography fontWeight="bold">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.client ? `${item.client.name}` : 'General'} · Rate {item.rate || 0}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => { setEditItem(item); setModalOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color={item.isActive ? 'warning' : 'success'} onClick={() => handleToggle(item._id)}>
                      {item.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                  <Typography variant="caption">In: <b>{fmtQty(item.purchasedQty)}</b></Typography>
                  <Typography variant="caption">Out: <b>{fmtQty(item.consumedQty)}</b></Typography>
                  <Typography variant="caption" color={item.availableQty < 0 ? 'error.main' : 'text.primary'}>
                    Avail: <b>{fmtQty(item.availableQty)}</b>
                  </Typography>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Item</TableCell>
                <TableCell>Client Link</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Purchased</TableCell>
                <TableCell align="right">Consumed</TableCell>
                <TableCell align="right">Available</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center">No items</TableCell></TableRow>
              )}
              {filtered.map(item => (
                <TableRow key={item._id} hover>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    {item.client
                      ? <Chip size="small" label={item.client.name} />
                      : <Typography variant="caption" color="text.secondary">General</Typography>}
                  </TableCell>
                  <TableCell align="right">{item.rate || 0}</TableCell>
                  <TableCell align="right">{fmtQty(item.purchasedQty)}</TableCell>
                  <TableCell align="right">{fmtQty(item.consumedQty)}</TableCell>
                  <TableCell align="right" sx={{ color: item.availableQty < 0 ? 'error.main' : 'inherit', fontWeight: 'bold' }}>
                    {fmtQty(item.availableQty)}
                  </TableCell>
                  <TableCell align="center">
                    {item.isActive ? <Chip size="small" color="success" label="Active" /> : <Chip size="small" label="Inactive" />}
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => { setEditItem(item); setModalOpen(true); }}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={item.isActive ? 'Disable' : 'Enable'}>
                      <IconButton size="small" color={item.isActive ? 'warning' : 'success'} onClick={() => handleToggle(item._id)}>
                        {item.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <AccessoryItemModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        type={type}
        clients={clients}
        editItem={editItem}
        onSaved={handleSaved}
      />
    </Box>
  );
}

export default AccessoryMasters;

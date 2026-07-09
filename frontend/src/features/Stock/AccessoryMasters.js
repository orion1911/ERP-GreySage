import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Paper, Grid, TextField, Button, IconButton, Tooltip, FormControlLabel, Switch,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Typography, Stack, Chip,
  Card, CardContent, CircularProgress, Collapse
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon,
  Tune as TuneIcon, ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import apiService from '../../services/apiService';
import EllipsisText from '../../components/common/EllipsisText';
import AccessoryItemModal from './AccessoryItemModal';

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN');

function AccessoryMasters({ type, clients, clientFilter = '', onStockChange }) {
  const { isMobile, showSnackbar } = useOutletContext();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false); // low-stock settings collapsed by default to declutter

  // Per-type low-stock alert settings (monitor on/off + default reorder level for items
  // of this type that have no level of their own).
  const [typeMonitor, setTypeMonitor] = useState(type.monitorLowStock !== false);
  const [typeReorder, setTypeReorder] = useState(type.reorderLevel ? String(type.reorderLevel) : '');
  const [savingType, setSavingType] = useState(false);

  useEffect(() => {
    setTypeMonitor(type.monitorLowStock !== false);
    setTypeReorder(type.reorderLevel ? String(type.reorderLevel) : '');
  }, [type._id, type.monitorLowStock, type.reorderLevel]);

  const saveTypeSettings = () => {
    setSavingType(true);
    apiService.accessories.updateType(type._id, {
      monitorLowStock: typeMonitor,
      reorderLevel: typeMonitor ? (Number(typeReorder) || 0) : 0,
    })
      .then(() => showSnackbar('Low-stock settings saved', 'success'))
      .catch(err => showSnackbar(err))
      .finally(() => setSavingType(false));
  };

  // Effective threshold + low flag for a stock row (mirrors the backend rule).
  const effLevel = (item) => (item.reorderLevel > 0 ? item.reorderLevel : (Number(typeReorder) || 0));
  const isLow = (item) => typeMonitor && item.monitorLowStock && effLevel(item) > 0 && item.availableQty <= effLevel(item);

  // showSnackbar omitted from deps on purpose — its identity changes every layout render,
  // so depending on it would refetch on each setSnackbar and loop on a 401.
  const load = useCallback(() => {
    setLoading(true);
    apiService.accessories.getStock(type._id, clientFilter)
      .then(res => setRows(res.items || []))
      .catch(err => showSnackbar(err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type._id, clientFilter]);

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
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
          {/* Set-once config — collapsed by default so the everyday controls above stay uncluttered. */}
          <Stack
            direction="row" alignItems="center" spacing={1}
            onClick={() => setAlertsOpen(o => !o)}
            sx={{ cursor: 'pointer', userSelect: 'none' }}
          >
            <TuneIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            <Typography variant="body2" fontWeight={600}>Low-stock alerts</Typography>
            <Chip
              size="small"
              variant={typeMonitor ? 'filled' : 'outlined'}
              color={typeMonitor ? 'warning' : 'default'}
              label={typeMonitor ? `On · ${Number(typeReorder) || 0}${type?.unit ? ` ${type.unit}` : ''}` : 'Off'}
              sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '.72rem' } }}
            />
            <Box sx={{ flexGrow: 1 }} />
            <ExpandMoreIcon
              fontSize="small"
              sx={{ color: 'text.secondary', transition: 'transform .2s', transform: alertsOpen ? 'rotate(180deg)' : 'none' }}
            />
          </Stack>
          <Collapse in={alertsOpen}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
              alignItems={{ sm: 'center' }} sx={{ mt: 1.5 }}
            >
              <FormControlLabel
                control={<Switch size="small" checked={typeMonitor} onChange={e => setTypeMonitor(e.target.checked)} />}
                label={<Typography variant="caption">Monitor low stock for {type.name}</Typography>}
              />
              <Stack
                direction="row" spacing={1.5} alignItems="center"
                sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 'auto' } }}
              >
                {typeMonitor && (
                  <TextField
                    label={`Default reorder level${type?.unit ? ` (${type.unit})` : ''}`}
                    value={typeReorder} onChange={e => setTypeReorder(e.target.value.replace(/[^\d.]/g, ''))}
                    variant="standard" size="small"
                    sx={{ flex: { xs: 1, sm: 'none' }, width: { sm: 200 }, minWidth: 110 }}
                    helperText="Used when an item has no level"
                  />
                )}
                <Button
                  size="small" variant="outlined" onClick={saveTypeSettings} disabled={savingType}
                  startIcon={savingType ? <CircularProgress size={14} color="inherit" /> : null}
                  sx={{ minWidth: 168, flexShrink: 0 }}
                >
                  Save alert settings
                </Button>
              </Stack>
            </Stack>
          </Collapse>
        </Box>
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
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight="bold">{item.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.client ? `${item.client.name}` : 'General'} · Rate {item.rate || 0}
                    </Typography>
                    {item.description && (
                      <EllipsisText text={item.description} variant="caption" lines={2} sx={{ color: 'text.secondary', fontStyle: 'italic' }} />
                    )}
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={() => { setEditItem(item); setModalOpen(true); }}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color={item.isActive ? 'warning' : 'success'} onClick={() => handleToggle(item._id)}>
                      {item.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
                    </IconButton>
                  </Stack>
                </Stack>
                <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                  <Typography variant="caption">Open: <b>{fmtQty(item.openingStock)}</b></Typography>
                  <Typography variant="caption">In: <b>{fmtQty(item.purchasedQty)}</b></Typography>
                  <Typography variant="caption">Out: <b>{fmtQty(item.consumedQty)}</b></Typography>
                  <Typography variant="caption" color={item.availableQty < 0 ? 'error.main' : 'text.primary'}>
                    Avail: <b>{fmtQty(item.availableQty)}</b>
                  </Typography>
                  {isLow(item) && <Chip size="small" color="warning" label="LOW" sx={{ height: 18, fontSize: 10 }} />}
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
                <TableCell align="right">Opening</TableCell>
                <TableCell align="right">Purchased</TableCell>
                <TableCell align="right">Consumed</TableCell>
                <TableCell align="right">Available</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={9} align="center">No items</TableCell></TableRow>
              )}
              {filtered.map(item => (
                <TableRow key={item._id} hover>
                  <TableCell sx={{ maxWidth: 220 }}>
                    {item.name}
                    {item.description && (
                      <EllipsisText text={item.description} variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }} />
                    )}
                  </TableCell>
                  <TableCell>
                    {item.client
                      ? <Chip size="small" label={item.client.name} />
                      : <Typography variant="caption" color="text.secondary">General</Typography>}
                  </TableCell>
                  <TableCell align="right">{item.rate || 0}</TableCell>
                  <TableCell align="right">{fmtQty(item.openingStock)}</TableCell>
                  <TableCell align="right">{fmtQty(item.purchasedQty)}</TableCell>
                  <TableCell align="right">{fmtQty(item.consumedQty)}</TableCell>
                  <TableCell align="right" sx={{ color: item.availableQty < 0 ? 'error.main' : 'inherit', fontWeight: 'bold' }}>
                    {fmtQty(item.availableQty)}
                    {isLow(item) && <Chip size="small" color="warning" label="LOW" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />}
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

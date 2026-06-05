import React, { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  Box, Typography, Paper, Card, CardContent, Tabs, Tab, ToggleButton, ToggleButtonGroup,
  CircularProgress, Stack, Chip
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LinkIcon from '@mui/icons-material/Link';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import TextureIcon from '@mui/icons-material/Texture';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { AnimatePresence, motion } from 'motion/react';
import apiService from '../../services/apiService';
import AccessoryMasters from './AccessoryMasters';
import AccessoryLedger from './AccessoryLedger';

const fmtQty = (n) => Number(n || 0).toLocaleString('en-IN');

// Per-article-type icon + accent colour for the stat cards.
const TYPE_ICONS = {
  zipper: <LinkIcon fontSize="small" />,
  button: <RadioButtonCheckedIcon fontSize="small" />,
  'label-tag': <LocalOfferIcon fontSize="small" />,
  pocketing: <TextureIcon fontSize="small" />,
  polybag: <ShoppingBagIcon fontSize="small" />,
};
const typeColor = (theme, key) => ({
  zipper: theme.palette.info.main,
  button: theme.palette.warning.main,
  'label-tag': theme.palette.secondary.main,
  pocketing: theme.palette.success.main,
  polybag: theme.palette.secondary.main,
}[key] || theme.palette.primary.main);

function StockManagement() {
  const { isMobile, showSnackbar } = useOutletContext();
  const theme = useTheme();
  const [types, setTypes] = useState([]);
  const [summary, setSummary] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [view, setView] = useState('ledger'); // 'ledger' | 'masters'
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  const selectedType = types.find(t => t._id === selectedTypeId) || null;

  // showSnackbar is intentionally NOT a dependency: it gets a new identity on every
  // layout render (it's recreated in AuthenticatedLayout), so including it would refetch
  // on each setSnackbar — which on a 401 creates a refetch→error→snackbar→refetch loop.
  const loadSummary = useCallback(() => {
    apiService.accessories.getStockSummary()
      .then(setSummary)
      .catch(err => showSnackbar(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiService.accessories.getTypes(),
      apiService.accessories.getStockSummary(),
      apiService.client.getClients(),
    ])
      .then(([typeList, summaryList, clientList]) => {
        setTypes(typeList);
        setSummary(summaryList);
        setClients(clientList);
        if (typeList.length) setSelectedTypeId(typeList[0]._id);
      })
      .catch(err => showSnackbar(err))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}><CircularProgress /></Box>
    );
  }

  return (
    <Box sx={{ pb: { xs: 10, md: 4 } }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Stock Management</Typography>

      {/* ── Stock stats: available qty per article type ── */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <Inventory2OutlinedIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" fontWeight="bold">Available Stock</Typography>
      </Stack>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        {summary.map((s) => {
          const isSelected = s._id === selectedTypeId;
          const negative = s.availableQty < 0;
          const color = typeColor(theme, s.key);
          return (
            <Card
              key={s._id}
              variant="outlined"
              onClick={() => setSelectedTypeId(s._id)}
              sx={{
                flex: '1 1 175px', minWidth: 160, cursor: 'pointer',
                borderColor: isSelected ? 'primary.main' : undefined,
                borderWidth: isSelected ? 2 : undefined,
                transition: 'transform .15s ease, box-shadow .15s ease, border-color .15s ease',
                '&:hover': { transform: 'translateY(-3px)', boxShadow: 6 },
              }}
            >
              <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                  <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 600, lineHeight: 1.4 }} noWrap>
                    {s.name}
                  </Typography>
                  <Box sx={{
                    width: 34, height: 34, borderRadius: 1.5, flexShrink: 0, ml: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: alpha(color, 0.16), color,
                  }}>
                    {TYPE_ICONS[s.key] || <Inventory2OutlinedIcon fontSize="small" />}
                  </Box>
                </Stack>
                <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.1 }} color={negative ? 'error.main' : 'text.primary'}>
                  {fmtQty(s.availableQty)}
                </Typography>
                <Typography variant="caption" color="text.secondary">{s.unit} available</Typography>
                <Stack direction="row" spacing={1.5} sx={{ mt: 1.25 }}>
                  <Stack direction="row" spacing={0.3} alignItems="center">
                    <ArrowUpwardIcon sx={{ fontSize: 14, color: 'success.main' }} />
                    <Typography variant="caption" color="text.secondary">{fmtQty(s.purchasedQty)} in</Typography>
                  </Stack>
                  <Stack direction="row" spacing={0.3} alignItems="center">
                    <ArrowDownwardIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                    <Typography variant="caption" color="text.secondary">{fmtQty(s.consumedQty)} out</Typography>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* ── Article-type selector ── */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={selectedTypeId}
          onChange={(e, v) => setSelectedTypeId(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {types.map(t => (
            <Tab key={t._id} value={t._id} label={t.name} />
          ))}
        </Tabs>
      </Paper>

      {/* ── Masters vs Purchases & Payments ── */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: isMobile ? 'center' : 'flex-start' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(e, v) => v && setView(v)}
          color="primary"
        >
          <ToggleButton value="ledger">Purchases &amp; Payments</ToggleButton>
          <ToggleButton value="masters">Masters</ToggleButton>
        </ToggleButtonGroup>
        {selectedType && (
          <Chip
            size="small"
            sx={{ ml: 2, alignSelf: 'center' }}
            label={`Consumed at ${selectedType.consumptionStage}`}
            variant="outlined"
          />
        )}
      </Box>

      {selectedType && (
        <AnimatePresence mode="wait">
          <motion.div
            key={`${selectedTypeId}-${view}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {view === 'masters'
              ? <AccessoryMasters type={selectedType} clients={clients} onStockChange={loadSummary} />
              : <AccessoryLedger type={selectedType} onStockChange={loadSummary} />}
          </motion.div>
        </AnimatePresence>
      )}
    </Box>
  );
}

export default StockManagement;

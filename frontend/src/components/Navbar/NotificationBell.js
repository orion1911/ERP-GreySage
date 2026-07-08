import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Badge, Popover, Box, Typography, List, ListItemButton,
  ListItemText, Divider, CircularProgress, Tooltip, Chip, TextField, InputAdornment,
} from '@mui/material';
import {
  Notifications as BellIcon, Refresh as RefreshIcon, WarningAmber as WarnIcon,
  ErrorOutline as MissingIcon, Search as SearchIcon, Close as ClearIcon,
} from '@mui/icons-material';
import apiService from '../../services/apiService';

const POLL_MS = 5 * 60 * 1000;

// A discrepancy where a whole record is MISSING from the app (vs. a mere data mismatch)
// — these are the actionable "create it" items we surface first with a warning icon.
//   stitching = lot not in app · washing = WASH SD but no washing · finishing = WASH ED but no finishing
const missingKind = (it) => (
  !it.inDb ? 'stitching' : it.action === 'washing' ? 'washing' : it.action === 'finishing' ? 'finishing' : null
);
const MISSING_LABEL = { stitching: 'Add Stitching', washing: 'Add Washing', finishing: 'Add Finishing' };
// Match the app's status chip colours (OrderStatusChip): Stitching(2)=primary,
// Washing(3)=secondary, Finishing(4)=warning — so the stage reads the same everywhere.
const STAGE_COLOR = { stitching: 'primary', washing: 'secondary', finishing: 'warning' };

// "3m ago" style relative time from an ISO/Date value.
const timeAgo = (value) => {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'never';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function NotificationBell() {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);   // initial/poll read
  const [refreshing, setRefreshing] = useState(false); // manual recompute
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ status: 'empty', generatedAt: null });
  const [filterText, setFilterText] = useState('');
  const mounted = useRef(true);
  const refreshingRef = useRef(false); // guards a poll/focus read from stomping an in-flight refresh

  // Reset to true on (re)mount so StrictMode's mount→cleanup→mount doesn't leave it false.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const applyResult = useCallback((res) => {
    if (!mounted.current) return;
    setItems(res.discrepancies || []);
    setMeta({ status: res.status || 'ok', generatedAt: res.generatedAt || null });
  }, []);

  // Fast read of the stored result.
  const load = useCallback(async () => {
    if (refreshingRef.current) return; // a manual refresh is in flight — don't stomp it with a stale read
    setLoading(true);
    setError('');
    try {
      applyResult(await apiService.makings.getDiff());
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || err.message || 'Could not load discrepancies');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [applyResult]);

  // Recompute now (the ~15s job), then show the fresh result.
  const doRefresh = useCallback(async () => {
    refreshingRef.current = true;
    setRefreshing(true);
    setError('');
    try {
      applyResult(await apiService.makings.refresh());
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || err.message || 'Refresh failed');
    } finally {
      refreshingRef.current = false;
      if (mounted.current) setRefreshing(false);
    }
  }, [applyResult]);

  // Read on mount (login), then poll + refetch when the tab regains focus. Also
  // re-read when a lot's record is created/edited (StitchingManagement fires
  // 'makings:refresh' after calling resolve) so a fixed lot drops off immediately.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('makings:refresh', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('makings:refresh', onFocus);
    };
  }, [load]);

  const open = Boolean(anchorEl);
  const handleItemClick = (it) => {
    setAnchorEl(null);
    setFilterText('');
    if (!it.inDb && it.excel) {
      // Lot isn't in the DB yet — open the Add Stitching form pre-filled.
      navigate('/stitching', { state: { prefillStitching: it.excel } });
    } else if (it.action === 'washing' && it.washingExcel) {
      // Washing record missing (WASH SD in excel) — open Add Washing pre-filled.
      navigate('/stitching', { state: { prefillWashing: { ...it.washingExcel, lotNumber: it.lotNumber, invoiceNumber: it.bill } } });
    } else if (it.action === 'finishing' && it.finishingExcel) {
      // Finishing record missing (WASH ED in excel) — open Add Finishing pre-filled.
      navigate('/stitching', { state: { prefillFinishing: { ...it.finishingExcel, lotNumber: it.lotNumber, invoiceNumber: it.bill } } });
    } else {
      navigate(`/stitching?search=${encodeURIComponent(it.lotNumber)}`);
    }
  };

  // Show missing-record items first (most actionable), then data mismatches — original
  // order preserved within each group (V8 sort is stable).
  const sortedItems = [...items].sort((a, b) => (missingKind(b) ? 1 : 0) - (missingKind(a) ? 1 : 0));
  const missingCount = items.filter((it) => missingKind(it)).length;

  // Client-side filter by lot # or bill #.
  const q = filterText.trim().toLowerCase();
  const visibleItems = q
    ? sortedItems.filter((it) => `${it.lotNumber || ''} ${it.bill || ''}`.toLowerCase().includes(q))
    : sortedItems;

  const subtitle = refreshing
    ? 'Recomputing… (~15s)'
    : `${items.length} lot${items.length === 1 ? '' : 's'} need review${missingCount ? ` · ${missingCount} missing` : ''} · synced ${timeAgo(meta.generatedAt)}`;

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        color="inherit"
        aria-label="MAKINGS discrepancies"
        style={{ backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)' }}
      >
        <Badge badgeContent={items.length} color="error" max={99}>
          <BellIcon fontSize="small" />
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => { setAnchorEl(null); setFilterText(''); }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: '92vw', maxHeight: 480 } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              MAKINGS
              {(meta.status === 'error' || error) && (
                <Tooltip title="The last sync failed — showing the previous result.">
                  <WarnIcon fontSize="small" color="warning" />
                </Tooltip>
              )}
            </Typography>
            <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
          </Box>
          <Tooltip title="Recompute now (~15s)">
            <span>
              <IconButton size="small" onClick={doRefresh} disabled={refreshing || loading}>
                {refreshing ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        <Divider />

        {items.length > 0 && (
          <Box sx={{ px: 1.5, pt: 1 }}>
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Filter lot # or bill #"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              InputProps={{
                startAdornment: (<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>),
                endAdornment: filterText
                  ? (<InputAdornment position="end"><IconButton size="small" onClick={() => setFilterText('')}><ClearIcon fontSize="small" /></IconButton></InputAdornment>)
                  : null,
              }}
            />
          </Box>
        )}

        {loading && !items.length && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={26} />
          </Box>
        )}

        {/* Full-area error only when there's nothing to show; otherwise the last-good list stays
            and the header warn icon flags the failure. */}
        {!loading && error && !items.length && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="error">{error}</Typography>
          </Box>
        )}

        {!loading && !error && meta.status === 'empty' && !items.length && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Not computed yet. Click refresh to reconcile the MAKINGS excel.
            </Typography>
          </Box>
        )}

        {!error && meta.status !== 'empty' && items.length === 0 && !loading && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Everything matches the MAKINGS excel. 🎉
            </Typography>
          </Box>
        )}

        {items.length > 0 && visibleItems.length === 0 && (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">No lots match “{filterText}”.</Typography>
          </Box>
        )}

        {visibleItems.length > 0 && (
          <List dense sx={{ py: 0, overflowY: 'auto', maxHeight: 360 }}>
            {visibleItems.map((it, idx) => {
              const mk = missingKind(it);
              return (
              <React.Fragment key={`${it.lotNumber}-${it.bill}`}>
                {idx > 0 && <Divider component="li" />}
                <ListItemButton
                  onClick={() => handleItemClick(it)}
                  alignItems="flex-start"
                  sx={mk ? { bgcolor: (t) => t.palette.action.hover } : undefined}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        {mk && <MissingIcon color={STAGE_COLOR[mk]} fontSize="small" titleAccess="Missing record" />}
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{it.lotNumber}</Typography>
                        {it.bill && <Chip size="small" variant="outlined" label={`Bill ${it.bill}`} />}
                        {mk && <Chip size="small" color={STAGE_COLOR[mk]} label={MISSING_LABEL[mk]} />}
                        {it.client && (
                          <Typography variant="caption" color="text.secondary">{it.client}</Typography>
                        )}
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                        {it.fields.map((f, i) => (
                          <Typography key={i} component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            <b>{f.field}:</b> excel <b>{String(f.excel)}</b> · app {String(f.db)}
                          </Typography>
                        ))}
                      </Box>
                    }
                  />
                </ListItemButton>
              </React.Fragment>
              );
            })}
          </List>
        )}
      </Popover>
    </>
  );
}

export default NotificationBell;

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Badge, Popover, Box, Typography, List, ListItemButton,
  Divider, CircularProgress, Tooltip, Chip, TextField, InputAdornment,
} from '@mui/material';
import {
  Notifications as BellIcon, Refresh as RefreshIcon, WarningAmber as WarnIcon,
  ErrorOutline as MissingIcon, Search as SearchIcon, Close as ClearIcon,
  ChevronRight as ChevronIcon, ArrowRightAlt as ArrowIcon, CheckCircleOutline as OkIcon,
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

// Small uppercase section label — mirrors the app's uppercase table-header convention.
function GroupHeader({ children, count }) {
  return (
    <Box
      sx={{
        position: 'sticky', top: 0, zIndex: 1,
        display: 'flex', alignItems: 'center', gap: 1,
        px: 2, py: 0.75,
        bgcolor: 'background.paper',
        borderBottom: (t) => `1px solid ${t.palette.divider}`,
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'text.secondary' }}>
        {children}
      </Typography>
      <Typography variant="caption" color="text.secondary">{count}</Typography>
    </Box>
  );
}

// One excel↔app field disagreement, laid out so the two values line up and scan
// at a glance instead of running together in a sentence.
function DiffRow({ field, excel, app }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
      <Typography variant="caption" sx={{ flexShrink: 0, fontWeight: 600, color: 'text.secondary', minWidth: 62, textTransform: 'uppercase', letterSpacing: '.02em' }}>
        {field}
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary' }} noWrap>
        {String(excel)}
      </Typography>
      <ArrowIcon sx={{ fontSize: 15, color: 'text.disabled', flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }} noWrap>
        {String(app)}
      </Typography>
    </Box>
  );
}

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
  const closePopover = () => { setAnchorEl(null); setFilterText(''); };

  const handleItemClick = (it) => {
    closePopover();
    if (!it.inDb && it.excel) {
      // Lot isn't in the app yet — open the Add Stitching form pre-filled.
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

  const missingCount = items.filter((it) => missingKind(it)).length;
  const mismatchCount = items.length - missingCount;

  // Client-side filter by lot # or bill #, then split into the two triage groups.
  const q = filterText.trim().toLowerCase();
  const matchesFilter = (it) => !q || `${it.lotNumber || ''} ${it.bill || ''}`.toLowerCase().includes(q);
  const visibleMissing = items.filter((it) => missingKind(it) && matchesFilter(it));
  const visibleMismatch = items.filter((it) => !missingKind(it) && matchesFilter(it));
  const visibleCount = visibleMissing.length + visibleMismatch.length;

  const hasFailure = meta.status === 'error' || Boolean(error);
  const subtitle = refreshing
    ? 'Recomputing… (~15s)'
    : `synced ${timeAgo(meta.generatedAt)}`;

  const renderItem = (it) => {
    const mk = missingKind(it);
    return (
      <ListItemButton
        key={`${it.lotNumber}-${it.bill}`}
        onClick={() => handleItemClick(it)}
        sx={{
          alignItems: 'flex-start', py: 1.25, px: 2, gap: 1,
          // Theme `divider` is too faint on the dark paper to read as a row separator —
          // use a slightly stronger hairline, and drop it on the last row of the group.
          borderBottom: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'}`,
          '&:last-of-type': { borderBottom: 'none' },
          '& .nav-caret': { opacity: 0, transition: 'opacity .15s ease' },
          '&:hover .nav-caret': { opacity: 1 },
        }}
      >
        {mk && (
          <MissingIcon color={STAGE_COLOR[mk]} fontSize="small" sx={{ mt: 0.25, flexShrink: 0 }} titleAccess="Missing record" />
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>{it.lotNumber}</Typography>
            {it.bill && <Chip size="small" variant="outlined" label={`Bill ${it.bill}`} sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '.7rem' } }} />}
            {mk && <Chip size="small" color={STAGE_COLOR[mk]} label={MISSING_LABEL[mk]} sx={{ height: 20, '& .MuiChip-label': { px: 0.75, fontSize: '.7rem', fontWeight: 600 } }} />}
            {it.client && <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 130 }}>{it.client}</Typography>}
          </Box>
          {it.fields?.length > 0 && (
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {it.fields.map((f, i) => (
                <DiffRow key={i} field={f.field} excel={f.excel} app={f.db} />
              ))}
            </Box>
          )}
        </Box>
        <ChevronIcon className="nav-caret" fontSize="small" sx={{ color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
      </ListItemButton>
    );
  };

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
        onClose={closePopover}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: '92vw', maxHeight: 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' } } }}
      >
        {/* ── Header (fixed) ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, flexShrink: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 0.5 }}>
              MAKINGS
              {hasFailure && (
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

        {/* ── Triage summary + filter (fixed) ── */}
        {items.length > 0 && (
          <Box sx={{ px: 2, pb: 1.25, flexShrink: 0 }}>
            <Box sx={{ display: 'flex', gap: 0.75, mb: 1 }}>
              <Chip
                size="small"
                icon={<MissingIcon sx={{ fontSize: 16 }} />}
                color="warning"
                variant={missingCount ? 'filled' : 'outlined'}
                label={`${missingCount} to create`}
                sx={{ height: 24, fontWeight: 600 }}
              />
              <Chip
                size="small"
                variant="outlined"
                label={`${mismatchCount} mismatch${mismatchCount === 1 ? '' : 'es'}`}
                sx={{ height: 24 }}
              />
            </Box>
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
        <Divider />

        {/* ── Scroll area ── */}
        <Box sx={{ overflowY: 'auto', flex: 1 }}>
          {loading && !items.length && (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
              <CircularProgress size={26} />
            </Box>
          )}

          {/* Full-area error only when there's nothing to show; otherwise the last-good list stays
              and the header warn icon flags the failure. */}
          {!loading && error && !items.length && (
            <Box sx={{ px: 2, py: 3 }}>
              <Typography variant="body2" color="error" sx={{ fontWeight: 600, mb: 0.5 }}>Couldn’t load discrepancies</Typography>
              <Typography variant="caption" color="text.secondary">{error}</Typography>
            </Box>
          )}

          {!loading && !error && meta.status === 'empty' && !items.length && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <RefreshIcon sx={{ fontSize: 30, color: 'text.disabled', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Not reconciled yet. Refresh to compare the MAKINGS excel against the app.
              </Typography>
            </Box>
          )}

          {!error && meta.status !== 'empty' && items.length === 0 && !loading && (
            <Box sx={{ px: 2, py: 5, textAlign: 'center' }}>
              <OkIcon sx={{ fontSize: 34, color: 'success.main', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Everything matches the MAKINGS excel.
              </Typography>
            </Box>
          )}

          {items.length > 0 && visibleCount === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">No lots match “{filterText}”.</Typography>
            </Box>
          )}

          {visibleMissing.length > 0 && (
            <>
              <GroupHeader count={visibleMissing.length}>Needs creating</GroupHeader>
              <List dense disablePadding>
                {visibleMissing.map(renderItem)}
              </List>
            </>
          )}

          {visibleMismatch.length > 0 && (
            <>
              <GroupHeader count={visibleMismatch.length}>Data mismatches</GroupHeader>
              <List dense disablePadding>
                {visibleMismatch.map(renderItem)}
              </List>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}

export default NotificationBell;

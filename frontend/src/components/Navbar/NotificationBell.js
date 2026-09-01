import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconButton, Badge, Popover, Box, Typography, List, ListItemButton,
  Divider, CircularProgress, Tooltip, Chip, TextField, InputAdornment,
  ToggleButton, ToggleButtonGroup, useTheme, useMediaQuery,
} from '@mui/material';
import {
  Notifications as BellIcon, Refresh as RefreshIcon, WarningAmber as WarnIcon,
  ErrorOutline as MissingIcon, Search as SearchIcon, Close as ClearIcon,
  ChevronRight as ChevronIcon, ArrowRightAlt as ArrowIcon, CheckCircleOutline as OkIcon,
  Add as AddIcon, ContentCut as StitchIcon, LocalLaundryService as WashIcon,
  AutoAwesome as FinishIcon, VisibilityOff as HideIcon, Undo as RestoreIcon,
  HistoryToggleOff as ChangedIcon,
} from '@mui/icons-material';
import apiService from '../../services/apiService';
import EllipsisText from '../common/EllipsisText';

const POLL_MS = 5 * 60 * 1000;

// A discrepancy where a whole record is MISSING from the app (vs. a mere data mismatch)
// — these are the actionable "create it" items we surface first with a warning icon.
//   stitching = lot not in app · washing = WASH SD but no washing · finishing = WASH ED but no finishing
const missingKind = (it) => (
  !it.inDb ? 'stitching' : it.action === 'washing' ? 'washing' : it.action === 'finishing' ? 'finishing' : null
);
const MISSING_LABEL = { stitching: 'Add Stitching', washing: 'Add Washing', finishing: 'Add Finishing' };
// Same stage icons the app uses elsewhere: stitching = scissors, washing = washing machine,
// finishing = stars — paired with a "+" like the Stitching table's row actions.
const STAGE_ICON = { stitching: StitchIcon, washing: WashIcon, finishing: FinishIcon };
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(false);   // initial/poll read
  const [refreshing, setRefreshing] = useState(false); // manual recompute
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ status: 'empty', generatedAt: null, discardedCount: 0 });
  const [filterText, setFilterText] = useState('');
  const [groups, setGroups] = useState(['create', 'mismatch']); // multi-select toggles; both = show all
  const [discarded, setDiscarded] = useState([]);   // rows the user has hidden
  const [busyKey, setBusyKey] = useState('');       // lot currently being hidden/restored
  const mounted = useRef(true);
  const refreshingRef = useRef(false); // guards a poll/focus read from stomping an in-flight refresh

  // Reset to true on (re)mount so StrictMode's mount→cleanup→mount doesn't leave it false.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const applyResult = useCallback((res) => {
    if (!mounted.current) return;
    setItems(res.discrepancies || []);
    setMeta({
      status: res.status || 'ok',
      generatedAt: res.generatedAt || null,
      discardedCount: res.discardedCount || 0,
    });
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

  // The hidden list is only needed when the user opens the "Hidden" view, so it's
  // loaded on demand rather than on every poll.
  const loadDiscards = useCallback(async () => {
    try {
      const res = await apiService.makings.getDiscards();
      if (mounted.current) setDiscarded(res.discards || []);
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || err.message || 'Could not load hidden rows');
    }
  }, []);

  // Hide a stale row. The server returns the updated (already filtered) diff, so the
  // list swap is one round trip — no follow-up read, no optimistic state to reconcile.
  const doDiscard = useCallback(async (it) => {
    const key = `${it.lotNumber}-${it.bill}`;
    setBusyKey(key);
    setError('');
    try {
      applyResult(await apiService.makings.discard(it.lotNumber, it.bill));
      if (groups.includes('hidden')) await loadDiscards();
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || err.message || 'Could not hide this row');
    } finally {
      if (mounted.current) setBusyKey('');
    }
  }, [applyResult, groups, loadDiscards]);

  const doRestore = useCallback(async (it) => {
    const key = `${it.lotNumber}-${it.bill}`;
    setBusyKey(key);
    setError('');
    try {
      applyResult(await apiService.makings.restore(it.lotNumber, it.bill, it.lotKey));
      await loadDiscards();
    } catch (err) {
      if (mounted.current) setError(err.response?.data?.error || err.message || 'Could not restore this row');
    } finally {
      if (mounted.current) setBusyKey('');
    }
  }, [applyResult, loadDiscards]);

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
  const closePopover = () => { setAnchorEl(null); setFilterText(''); setGroups(['create', 'mismatch']); };

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

  // Client-side filters: the lot/bill text box AND the create/mismatch toggles (both
  // selected by default = show all), then split into the two triage groups.
  const q = filterText.trim().toLowerCase();
  const matchesFilter = (it) => !q || `${it.lotNumber || ''} ${it.bill || ''}`.toLowerCase().includes(q);
  const showCreate = groups.includes('create');
  const showMismatch = groups.includes('mismatch');
  const showHidden = groups.includes('hidden');
  const visibleMissing = showCreate ? items.filter((it) => missingKind(it) && matchesFilter(it)) : [];
  const visibleMismatch = showMismatch ? items.filter((it) => !missingKind(it) && matchesFilter(it)) : [];
  const visibleHidden = showHidden ? discarded.filter(matchesFilter) : [];
  const visibleCount = visibleMissing.length + visibleMismatch.length + visibleHidden.length;

  const hasFailure = meta.status === 'error' || Boolean(error);
  const subtitle = refreshing
    ? 'Recomputing… (~15s)'
    : `synced ${timeAgo(meta.generatedAt)}`;

  const renderItem = (it, { hidden = false } = {}) => {
    const mk = missingKind(it);
    const StageIcon = mk ? STAGE_ICON[mk] : null;
    const meta = [it.client, it.maker].filter(Boolean).join(' · '); // CLIENT · MAKER/vendor
    const rowKey = `${it.lotNumber}-${it.bill}`;
    const busy = busyKey === rowKey;
    return (
      <ListItemButton
        key={rowKey}
        onClick={() => handleItemClick(it)}
        sx={{
          alignItems: 'flex-start', py: 1.25, px: 2, gap: 1,
          // Hidden rows read as inactive so they can't be mistaken for live work.
          ...(hidden ? { opacity: 0.62 } : null),
          // Theme `divider` is too faint on the dark paper to read as a row separator —
          // use a slightly stronger hairline, and drop it on the last row of the group.
          borderBottom: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.08)'}`,
          '&:last-of-type': { borderBottom: 'none' },
          '& .nav-caret': { opacity: 0, transition: 'opacity .15s ease' },
          '&:hover .nav-caret': { opacity: 1 },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, flexShrink: 0 }}>{it.lotNumber}</Typography>
            {it.bill && <Chip size="small" variant="outlined" label={`Bill ${it.bill}`} sx={{ height: 20, flexShrink: 0, '& .MuiChip-label': { px: 0.75, fontSize: '.7rem' } }} />}
            {it.changedSinceDiscard && (
              <Tooltip title="You hid this row, but the excel or the app has changed since — showing it again." arrow placement="top">
                <ChangedIcon sx={{ fontSize: 15, color: 'warning.main', flexShrink: 0 }} />
              </Tooltip>
            )}
            {meta && <EllipsisText text={meta} variant="caption" sx={{ color: 'text.secondary', maxWidth: 180 }} />}
            {mk && StageIcon && (
              <Tooltip title={MISSING_LABEL[mk]} arrow placement="top">
                <Box sx={{ ml: 'auto', flexShrink: 0, display: 'inline-flex', alignItems: 'center', color: 'text.secondary' }}>
                  <AddIcon sx={{ fontSize: 14 }} />
                  <StageIcon sx={{ fontSize: 18 }} />
                </Box>
              </Tooltip>
            )}
          </Box>
          {it.fields?.length > 0 && (
            <Box sx={{ mt: 0.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {it.fields.map((f, i) => (
                <DiffRow key={i} field={f.field} excel={f.excel} app={f.db} />
              ))}
            </Box>
          )}
        </Box>
        {/* Right column, split to mirror the content: warning sits beside the first row, and the
            chevron is centred over the remaining diff rows (which can span several lines). Both
            cells centre-align, so warning and chevron share the same vertical axis. */}
        <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0, alignSelf: 'stretch', alignItems: 'center' }}>
          <Box sx={{ height: 22, display: 'flex', alignItems: 'center' }}>
            {mk && <MissingIcon color={STAGE_COLOR[mk]} titleAccess="Missing record" sx={{ fontSize: 18 }} />}  
                      
            {/* stopPropagation: the row itself navigates to the pre-filled form, so the
                hide/restore control must not trigger it. */}
            <Tooltip title={hidden ? 'Restore — show in the bell again' : 'Hide'} arrow placement="right">
              <span>
                <IconButton
                  size="small"
                  disabled={busy}
                  onClick={(e) => { e.stopPropagation(); (hidden ? doRestore : doDiscard)(it); }}
                  sx={{ p: 0.25, ml: 0.5, mr: 0, color: 'text.disabled', '&:hover': { color: hidden ? 'primary.main' : 'text.primary' } }}
                >
                  {busy
                    ? <CircularProgress size={14} />
                    : hidden ? <RestoreIcon sx={{ fontSize: 17 }} /> : <HideIcon sx={{ fontSize: 17 }} />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.25 }}>
            {!hidden && <ChevronIcon className="nav-caret" sx={{ color: 'text.disabled', fontSize: 22 }} />}
          </Box>
        </Box>
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
        slotProps={{
          paper: {
            sx: {
              ...(isMobile
                ? { width: '85.2vw', maxWidth: '85.2vw', left: '7vw !important', mt: 2 }
                : { width: 350, maxWidth: 350 }),
              maxHeight: 520,
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              border: (t) => `1px solid ${t.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
              boxShadow: (t) => (t.palette.mode === 'dark'
                ? '0 16px 40px -8px rgba(0,0,0,0.8), 0 6px 16px rgba(0,0,0,0.6)'
                : '0 16px 40px -8px rgba(0,0,0,0.28), 0 6px 16px rgba(0,0,0,0.12)'),
            },
          },
        }}
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
        {(items.length > 0 || meta.discardedCount > 0) && (
          <Box sx={{ px: 2, pb: 1.25, flexShrink: 0 }}>
            {/* Filter toggles styled like physical buttons: raised when off, pressed (inset) when on.
                Multi-select — create + mismatch on by default (show all); turn one off to hide
                that group. All three may be off, which just empties the list. */}
            <ToggleButtonGroup
              size="small"
              value={groups}
              onChange={(e, v) => {
                if (v.includes('hidden') && !groups.includes('hidden')) loadDiscards();
                setGroups(v);
              }}
              sx={{
                display: 'flex', gap: 1, mb: 1,
                '& .MuiToggleButton-root': {
                  flex: 1, gap: 0.5, py: 0.5, lineHeight: 1.2,
                  textTransform: 'none', fontWeight: 600, fontSize: '.78rem',
                  borderRadius: '8px !important',
                  border: (t) => `1px solid ${t.palette.divider}`,
                  // raised
                  boxShadow: (t) => (t.palette.mode === 'dark' ? '0 2px 0 rgba(0,0,0,.55)' : '0 2px 0 rgba(0,0,0,.14)'),
                  transition: 'transform .1s ease, box-shadow .1s ease',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&.Mui-disabled': { opacity: 0.5, boxShadow: 'none' },
                },
                // pressed
                '& .MuiToggleButton-root.Mui-selected': {
                  boxShadow: 'inset 0 2px 5px rgba(0,0,0,.4)',
                  transform: 'translateY(1px)',
                },
              }}
            >
              <ToggleButton
                value="create" disabled={!missingCount}
                sx={{
                  color: 'warning.main',
                  borderColor: (t) => `${t.palette.warning.main} !important`,
                  // Selected hover stays on warning.main — warning.dark is too dark a jump for orange.
                  '&.Mui-selected': { bgcolor: 'warning.main', color: 'warning.contrastText', '&:hover': { bgcolor: 'warning.main' } },
                }}
              >
                <MissingIcon sx={{ fontSize: 16 }} />
                {missingCount} to create
              </ToggleButton>
              <ToggleButton
                value="hidden" disabled={!meta.discardedCount}
                sx={{
                  color: 'text.secondary',
                  '&.Mui-selected': { bgcolor: 'action.selected', color: 'text.primary', '&:hover': { bgcolor: 'action.selected' } },
                }}
              >
                <HideIcon sx={{ fontSize: 16 }} />
                {meta.discardedCount}
              </ToggleButton>
              <ToggleButton
                value="mismatch" disabled={!mismatchCount}
                sx={{
                  color: 'primary.light',
                  borderColor: (t) => `${t.palette.primary.light} !important`,
                  '&.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } },
                }}
              >
                {mismatchCount} mismatch{mismatchCount === 1 ? '' : 'es'}
              </ToggleButton>
            </ToggleButtonGroup>
            <TextField
              fullWidth
              size="small"
              variant="outlined"
              placeholder="Filter lot # or bill #"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              sx={{ '& .MuiOutlinedInput-input': { py: '3px', fontSize: '.82rem' } }}
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

          {!error && meta.status !== 'empty' && items.length === 0 && !visibleHidden.length && !loading && (
            <Box sx={{ px: 2, py: 5, textAlign: 'center' }}>
              <OkIcon sx={{ fontSize: 34, color: 'success.main', mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Everything matches the MAKINGS excel.
              </Typography>
            </Box>
          )}

          {(items.length > 0 || discarded.length > 0) && visibleCount === 0 && (
            <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {groups.length === 0
                  ? 'All groups are turned off — select one above.'
                  : filterText.trim()
                    ? `No lots match “${filterText}”.`
                    : 'Nothing in the selected groups.'}
              </Typography>
            </Box>
          )}

          {visibleMissing.length > 0 && (
            <>
              <GroupHeader count={visibleMissing.length}>Needs creating</GroupHeader>
              <List dense disablePadding>
                {visibleMissing.map((it) => renderItem(it))}
              </List>
            </>
          )}

          {visibleMismatch.length > 0 && (
            <>
              <GroupHeader count={visibleMismatch.length}>Data mismatches</GroupHeader>
              <List dense disablePadding>
                {visibleMismatch.map((it) => renderItem(it))}
              </List>
            </>
          )}

          {visibleHidden.length > 0 && (
            <>
              <GroupHeader count={visibleHidden.length}>Hidden</GroupHeader>
              <List dense disablePadding>
                {visibleHidden.map((it) => renderItem(it, { hidden: true }))}
              </List>
            </>
          )}
        </Box>
      </Popover>
    </>
  );
}

export default NotificationBell;

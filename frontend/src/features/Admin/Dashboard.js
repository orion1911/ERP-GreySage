import React, { useState, useEffect, useRef } from 'react';
import {
    Container,
    Paper,
    Box,
    Grid,
    Stack,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    Chip,
    Skeleton,
    Alert,
    useTheme,
    useMediaQuery,
    IconButton,
    TextField,
    MenuItem,
} from '@mui/material';
import { BarChart } from '@mui/x-charts/BarChart';
import { PieChart } from '@mui/x-charts/PieChart';
import RefreshIcon from '@mui/icons-material/Refresh';
import GridViewIcon from '@mui/icons-material/GridView';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import { useOutletContext } from 'react-router-dom';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateRangePicker } from '@mui/x-date-pickers-pro';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import { motion, AnimatePresence } from 'motion/react';
import apiService from '../../services/apiService';
import { TableRowsLoader } from '../../components/Skeleton/SkeletonLoader';

// ─── Hoisted to module scope ─────────────────────────────────────────────────
// These were defined inside Dashboard, which meant every parent re-render (sidebar
// toggle, theme switch) created new component identities — React remounted them,
// AnimatedNumber's prevRef reset, and the counters replayed from 0. Stable
// module-scope identities re-render in place instead.
// Format large numbers
const formatNumber = (num) => {
    return (num || 0).toLocaleString();
};

// Count-up for KPI values: rAF tween with ease-out cubic, re-animating on value
// change. Respects prefers-reduced-motion (jumps straight to the value). Rounded on
// every frame so intermediate states are clean integers.
const AnimatedNumber = ({ value, duration = 1200, delay = 0 }) => {
    const [display, setDisplay] = useState(0);
    const prevRef = useRef(0);
    useEffect(() => {
        const from = prevRef.current;
        const to = Number(value) || 0;
        prevRef.current = to;
        if (from === to) { setDisplay(to); return undefined; }
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setDisplay(to);
            return undefined;
        }
        let raf;
        let timer;
        let lastPaint = 0;
        const stepMs = 40; // repaint the number ~12x/sec, not every frame — visible ticks, not a blur
        let start = null;
        const tick = (now) => {
            if (start === null) start = now;
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 2);
            if (t === 1 || now - lastPaint >= stepMs) {
                lastPaint = now;
                setDisplay(Math.round(from + (to - from) * eased));
            }
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        const begin = () => { raf = requestAnimationFrame(tick); };
        if (delay > 0) { timer = setTimeout(begin, delay * 1000); } else { begin(); }
        return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
    }, [value, duration, delay]);
    return <>{formatNumber(display)}</>;
};

// KPI Card Component
const KPICard = ({ icon: Icon, label, shortLabel, value, subtitle, color, theme, delay = 0, iconBadge }) => (
    <Paper
        elevation={1}
        sx={{
            p: { xs: 1.25, sm: 2 },
            // Row-stretch instead of a fixed height: cards equal their row's tallest
            // (alignItems:'stretch' on the Grid container), with zero reserved slack.
            height: '100%',
            borderRadius: 2,
            border: `1px solid ${theme.palette.divider}`,
            borderTop: 'none',
            transition: 'all 0.3s ease',
            boxSizing: 'border-box',
            display: 'flex',
            flex: 1,
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            '@keyframes kpiBarSweep': {
                from: { transform: 'scaleX(0)' },
                to: { transform: 'scaleX(1)' },
            },
            '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: '20px',
                right: '12px',
                height: '2px',
                background: `linear-gradient(to right, ${color}, ${color}dd 40%, transparent)`,
                borderRadius: '1px 1px 0 0',
                transformOrigin: 'right',
                animation: {
                        xs: `kpiBarSweep 0.28s cubic-bezier(0.25, 0.45, 0.25, 1) ${1.35 + delay}s both`,
                        sm: `kpiBarSweep 0.37s cubic-bezier(0.25, 0.45, 0.25, 1) ${1.3 + delay}s both`,
                        md: `kpiBarSweep 0.67s cubic-bezier(0.25, 0.45, 0.25, 1) ${1.13 + delay}s both`,
                    },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
            },
            '&:hover': {
                elevation: 3,
                transform: 'translateY(-4px)',
                boxShadow: theme.shadows[8],
            },
        }}
    >
        <Box
            component="svg"
            aria-hidden="true"
            sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                overflow: 'visible',
                '@keyframes kpiBorderLapXs': {
                    '0%': { strokeDashoffset: -2.7, opacity: 0, animationTimingFunction: 'linear' },
                    '6%': { opacity: 1 },
                    '75.3%': { strokeDashoffset: 82, opacity: 1, animationTimingFunction: 'cubic-bezier(0.25, 0.45, 0.25, 1)' },
                    '100%': { strokeDashoffset: 97.3, opacity: 0 },
                },
                '@keyframes kpiBorderLapSm': {
                    '0%': { strokeDashoffset: -1.9, opacity: 0, animationTimingFunction: 'linear' },
                    '6%': { opacity: 1 },
                    '68.4%': { strokeDashoffset: 77.9, opacity: 1, animationTimingFunction: 'cubic-bezier(0.25, 0.45, 0.25, 1)' },
                    '100%': { strokeDashoffset: 98.1, opacity: 0 },
                },
                '@keyframes kpiBorderLapMd': {
                    '0%': { strokeDashoffset: -1.2, opacity: 0, animationTimingFunction: 'linear' },
                    '6%': { opacity: 1 },
                    '48.3%': { strokeDashoffset: 61.6, opacity: 1, animationTimingFunction: 'cubic-bezier(0.25, 0.45, 0.25, 1)' },
                    '100%': { strokeDashoffset: 98.8, opacity: 0 },
                },
                '& rect': {
                    x: '1px',
                    y: '1px',
                    width: 'calc(100% - 2px)',
                    height: 'calc(100% - 2px)',
                    rx: '7px',
                    fill: 'none',
                    stroke: color,
                    strokeWidth: 2,
                    strokeLinecap: 'round',
                    // Shared by all three comet layers — same head position every frame.
                    // One keyframe set per breakpoint (literal values; calc()/var() broke here).
                    animation: {
                        xs: `kpiBorderLapXs 1.13s linear ${0.5 + delay}s both`,
                        sm: `kpiBorderLapSm 1.17s linear ${0.5 + delay}s both`,
                        md: `kpiBorderLapMd 1.3s linear ${0.5 + delay}s both`,
                    },
                },
                '& rect:nth-of-type(1)': {
                    strokeDasharray: { xs: '15.3 84.7', sm: '20.3 79.7', md: '37.9 62.1' },
                    strokeOpacity: 0.22,
                    filter: 'blur(2px)',
                },
                '& rect:nth-of-type(2)': {
                    strokeDasharray: { xs: '10.7 89.3', sm: '14.2 85.8', md: '26.5 73.5' },
                    strokeOpacity: 0.55,
                    filter: 'blur(1px)',
                },
                '& rect:nth-of-type(3)': {
                    strokeDasharray: { xs: '6.1 93.9', sm: '8.1 91.9', md: '15.2 84.8' },
                    strokeOpacity: 1,
                },
                '@media (prefers-reduced-motion: reduce)': { display: 'none' },
            }}
        >
            <rect pathLength="100" />
            <rect pathLength="100" />
            <rect pathLength="100" />
        </Box>
        {/* Column at every breakpoint — the pre-Aug structure (see ProductionDashboard's
            KPICard): icon row on top, label, large value, subtitle. The md icon-left row
            variant made desktop cards squat and was reverted (2026-08). */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 0.75, sm: 1 }, flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                <Box
                    sx={{
                        p: { xs: 0.75, sm: 1 },
                        borderRadius: 1,
                        backgroundColor: `${color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <Icon sx={{ color, fontSize: { xs: 20, sm: 24 } }} />
                </Box>
                {/* xs-only: phones hide subtitles, so In Finishing parks its awaiting
                    count up here beside the icon instead. */}
                {iconBadge && (
                    <Typography noWrap sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.secondary', fontWeight: 600, fontSize: '0.6rem', minWidth: 0 }}>
                        {iconBadge}
                    </Typography>
                )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: { xs: 0.2, sm: 0.8 }, color: 'text.secondary', fontSize: { xs: '0.6rem', sm: '0.6rem' }, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                <Box component="span" sx={{ display: { xs: shortLabel ? 'none' : 'inline', sm: 'inline' } }}>{label}</Box>
                {shortLabel && <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{shortLabel}</Box>}
            </Typography>
            <Typography variant="h3" sx={{ fontWeight: 700, color, lineHeight: 1, fontSize: { xs: '1.35rem', sm: '1.6rem', md: '2rem' }, mt: { xs: 'auto', sm: 0 } }}>
                <AnimatedNumber value={value} delay={delay + 0.2} />
            </Typography>
            {/* Subtitle hidden at xs — the iconBadge slot carries anything phones need. */}
            <Typography variant="body2" noWrap sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem', display: { xs: 'none', sm: 'block' } }}>
                {subtitle}
            </Typography>
            </Box>
        </Box>
    </Paper>
);

const Dashboard = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { showSnackbar } = useOutletContext() || {};

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [timestamp, setTimestamp] = useState('—');
    const [expandedRows, setExpandedRows] = useState({});
    const [breakdownPage, setBreakdownPage] = useState(0);
    const [breakdownRowsPerPage, setBreakdownRowsPerPage] = useState(25);
    const [dateRange, setDateRange] = useState([dayjs('2026-01-01'), dayjs(new Date())]);
    const [clientFilter, setClientFilter] = useState(''); // '' = All clients (default)
    const [clients, setClients] = useState([]);

    // KPI Data
    const [kpiData, setKpiData] = useState({
        totalPcs: 0,
        totalMaking: 0,
        totalInWashing: 0,
        totalAwaitingFinishing: 0,
        totalInFinishing: 0,
        totalPendingDispatch: 0,
        totalPartDispatchPending: 0,
        totalDispatched: 0,
    });

    // Table Data
    const [clientSummary, setClientSummary] = useState([]);
    const [washerSummary, setWasherSummary] = useState([]);
    const [stitchingVendorSummary, setStitchingVendorSummary] = useState([]);
    const [finishingVendorSummary, setFinishingVendorSummary] = useState([]);
    const [breakdownData, setBreakdownData] = useState([]);
    const [stitchingBreakdownData, setStitchingBreakdownData] = useState([]);
    const [stitchingBreakdownPage, setStitchingBreakdownPage] = useState(0);
    const [stitchingBreakdownRowsPerPage, setStitchingBreakdownRowsPerPage] = useState(25);
    const [expandedStitchingRows, setExpandedStitchingRows] = useState({});

    // Fetch Dashboard Data from MongoDB backend
    const loadData = async () => {
        setLoading(true);
        setError('');
        setBreakdownPage(0);
        setStitchingBreakdownPage(0);

        try {
            const params = {};
            if (dateRange[0]) params.fromDate = dateRange[0].startOf('day').toISOString();
            if (dateRange[1]) params.toDate = dateRange[1].endOf('day').toISOString();
            if (clientFilter) params.clientId = clientFilter;
            const data = await apiService.admin.dashboard.getProductionDashboard(params);

            if (data.error) {
                setError(data.error);
                if (showSnackbar) showSnackbar(data.error, 'error');
                return;
            }

            setKpiData({
                totalPcs: data.total_pcs || 0,
                totalMaking: data.total_making || 0,
                totalInWashing: data.total_in_washing || 0,
                totalAwaitingFinishing: data.total_awaiting_finishing || 0,
                totalInFinishing: data.total_in_finishing || 0,
                totalPendingDispatch: data.total_pending_dispatch || 0,
                totalPartDispatchPending: data.total_part_dispatch_pending || 0,
                totalDispatched: data.total_dispatched || 0,
            });

            setClientSummary(data.client_summary || []);
            setWasherSummary(data.washer_summary || []);
            setStitchingVendorSummary(data.stitching_vendor_summary || []);
            setFinishingVendorSummary(data.finishing_vendor_summary || []);
            setBreakdownData(data.rows || []);
            setStitchingBreakdownData(data.stitching_breakdown || []);
            // setBreakdownData(data.rows?.sort((a, b) => a.CLIENT.localeCompare(b.CLIENT)) || []);

            const ts = new Date(data.timestamp);
            setTimestamp(ts.toLocaleString());
        } catch (err) {
            const errorMsg = err?.response?.data?.error || err.message || 'Failed to load data.';
            setError(errorMsg);
            if (showSnackbar) showSnackbar(err);
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Load data on mount and when the date range or client filter changes
    useEffect(() => {
        loadData();
    }, [dateRange, clientFilter]);

    // Client list for the filter dropdown (active clients only) — one fetch on mount.
    useEffect(() => {
        apiService.client.getClients('')
            .then((list) => setClients(Array.isArray(list) ? list : []))
            .catch(() => setClients([]));
    }, []);

    // Breakdown tables hidden (2026-08): their intent — per-client pending lots/pcs — moved to
    // filter-aware totals on the Stitching page. Backend builders are commented in
    // dashboardController.js; flip BOTH this flag and those comments to restore.
    const SHOW_BREAKDOWNS = false;

    // Chart Colors based on theme
    const chartColors = {
        coral: theme.palette.mode === 'dark' ? '#F07A64' : '#E8634A',
        teal: theme.palette.mode === 'dark' ? '#3CC4B4' : '#2AA89A',
        amber: theme.palette.mode === 'dark' ? '#F0A820' : '#D4920A',
        indigo: theme.palette.mode === 'dark' ? '#7B88E0' : '#5C6AC4',
        violet: theme.palette.mode === 'dark' ? '#A98BE8' : '#9966FF', // matches the In Finishing KPI card
    };

    // Prepare data for MUI X Charts
    const clientTop = clientSummary.slice(0, 10);
    const clientLabels = clientTop.map((r) => r.CLIENT || '');
    const clientSeries = [
        { label: 'Total', data: clientTop.map((r) => r.TOTAL || 0) },
        { label: 'Making', data: clientTop.map((r) => r.MAKING || 0) },
        { label: 'In Washing', data: clientTop.map((r) => r.IN_WASHING || 0) },
        // Stage series are mutually exclusive: each lot's pcs appear in exactly one of
        // Making / In Washing / Awaiting Finishing / In Finishing (finished lots only in
        // Total), so no bar double-counts another. The Out Washing SUPERSET (= awaiting +
        // in finishing + finished) was removed from every stage surface (2026-08) for the
        // same reason; per-washer Out remains in the Washer Summary as throughput.
        { label: 'Awaiting Finishing', data: clientTop.map((r) => r.AWAITING_FINISHING || 0) },
        { label: 'In Finishing', data: clientTop.map((r) => r.IN_FINISHING || 0) },
    ];

    const washerData = washerSummary.map((r) => ({ label: r.WASHER || '', value: r.PENDING || 0 }));
    const washerSeries = [{ data: washerData }];

    const pieColors = [chartColors.coral, chartColors.teal, chartColors.indigo, chartColors.amber, '#B07AE8', '#5CC4C0', '#F4A060'];

    return (
        <Container maxWidth="xl" sx={{ pt: '0 !important', pb: 2, px: '0 !important' }}>
            {/* Header — on mobile the date filter + refresh drop to a centered row below the title */}
            <Stack
                direction={{ xs: 'column', md: 'row' }}
                alignItems={{ xs: 'stretch', md: 'center' }}
                justifyContent={{ md: 'space-between' }}
                sx={{ mb: 3, mt: 1, flexWrap: 'wrap', gap: 2, pr: { xs: 6, md: 0 } }}
            >
                <Typography variant="h4">Dashboard</Typography>
                <Stack direction="row" alignItems="center" justifyContent={{ xs: 'space-between', md: 'center' }} sx={{ gap: { xs: 2, md: 1.5 }, mx: { md: 'auto' } }}>
                    <TextField
                        select
                        size="small"
                        variant="standard"
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        sx={{ minWidth: { xs: 120, md: 104 }, maxWidth: { xs: 160, md: 140 }, '& .MuiInputBase-root': { fontSize: { md: '0.85rem' } } }}
                        SelectProps={{ displayEmpty: true }}
                    >
                        <MenuItem value="">All Clients</MenuItem>
                        {clients.map((c) => (
                            <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
                        ))}
                    </TextField>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DateRangePicker
                            value={dateRange}
                            onChange={(newValue) => setDateRange(newValue)}
                            format="DD/MM/YY"
                            slots={{ textField: MorphDateTextField }}
                            slotProps={{ textField: { variant: 'standard', size: 'small' } }}
                            sx={{ width: { xs: 180, md: 190 }, '& .MuiInputBase-root': { fontSize: { md: '0.85rem' } } }}
                        />
                    </LocalizationProvider>
                    <IconButton size="small" onClick={loadData} disabled={loading}>
                        <RefreshIcon sx={{ fontSize: { xs: 24, md: 20 } }} />
                    </IconButton>
                </Stack>
            </Stack>

            {/* KPI Cards */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={loading ? 'kpi-loading' : 'kpi-data'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: 3, alignItems: 'stretch' }}>
                        {loading ? (
                            [0, 1, 2, 3, 4, 5].map((i) => (
                                <Grid key={i} size={{ xs: 4, sm: 4, md: 2 }}>
                                    <Paper elevation={1} sx={{ p: { xs: 1, sm: 1.5 }, borderRadius: 2, height: '100%', boxSizing: 'border-box' }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>
                                            <Skeleton variant="circular" sx={{ width: { xs: 22, sm: 40 }, height: { xs: 22, sm: 40 }, mb: { xs: 1, md: 0 }, flexShrink: 0 }} />
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Skeleton variant="text" width="50%" height={16} />
                                                <Skeleton variant="text" width="70%" height={36} sx={{ my: 0.5 }} />
                                                <Skeleton variant="text" width="60%" height={14} sx={{ display: { xs: 'none', sm: 'block' } }} />
                                            </Box>
                                        </Box>
                                    </Paper>
                                </Grid>
                            ))
                        ) : (
                            <>
                                {[
                                    { label: 'Total Pieces', value: kpiData.totalPcs, subtitle: 'All tracked items', color: '#5C6AC4', icon: GridViewIcon },
                                    { label: 'In Making', value: kpiData.totalMaking, subtitle: 'In production', color: '#E8634A', icon: ContentCutIcon },
                                    { label: 'In Washing', value: kpiData.totalInWashing, subtitle: 'Being processed', color: '#D4920A', icon: LocalLaundryServiceIcon },
                                    // Out Washing + Awaiting Finishing cards removed (2026-08): Out Washing was a
                                    // cumulative superset that read like a stage, and awaiting is a wait-state of
                                    // finishing — folded into In Finishing's subtitle below. Both totals stay in
                                    // kpiData: the client chart series and summary tables still use them.
                                    { label: 'In Finishing', value: kpiData.totalInFinishing, subtitle: `${formatNumber(kpiData.totalAwaitingFinishing)} - awaiting`, iconBadge: `${formatNumber(kpiData.totalAwaitingFinishing)} awaiting`, color: '#9966FF', icon: AutoAwesomeIcon },
                                    { label: 'Pending Dispatch', shortLabel: 'To Dispatch', value: kpiData.totalPendingDispatch, subtitle: `${formatNumber(kpiData.totalPartDispatchPending)} - part-dispatch`, color: '#E8923D', icon: PendingActionsIcon },
                                    { label: 'Dispatched', value: kpiData.totalDispatched, subtitle: 'Pieces dispatched', color: '#2AA89A', icon: LocalShippingIcon },
                                ].map((card, i) => (
                                    <Grid key={card.label} size={{ xs: 4, sm: 4, md: 2 }}>
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4 }}
                                            style={{ height: '100%' }}
                                        >
                                            <KPICard {...card} theme={theme} />
                                        </motion.div>
                                    </Grid>
                                ))}
                            </>
                        )}
                    </Grid>
                </motion.div>
            </AnimatePresence>

            {/* Charts */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={loading ? 'charts-loading' : 'charts-data'}
                    initial={loading ? { opacity: 0 } : { opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={loading ? { duration: 0.15 } : { duration: 0.5, delay: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                >
                    {loading ? (
                        <Grid container spacing={3} sx={{ mb: 3, alignItems: 'stretch' }}>
                            {[0, 1].map((i) => (
                                <Grid key={i} size={{ xs: 12, sm: 6, md: 6 }}>
                                    <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                                        <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
                                        <Skeleton variant="rectangular" height={300} />
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>
                    ) : (
                        // Client Stats + Washing Stats — flex row with both Papers at the same
                        // fixed height (420px). Chart heights unified at 320 inside each.
                        <Box sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            gap: 3,
                            mb: 3,
                            alignItems: 'stretch',
                            height: { xs: 'auto', sm: 420 }
                        }}>
                            <Paper elevation={1} sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', flex: { xs: '0 0 420px', sm: '1 1 0' }, minHeight: 0 }}>
                                <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Client Stats
                                        </Typography>
                                        <Chip label="Top 10" size="small" variant="outlined" />
                                    </Box>
                                    <Box sx={{ width: '100%', flex: 1, minHeight: 0 }}>
                                        <BarChart
                                            series={clientSeries}
                                            xAxis={[{
                                                height: clientFilter ? 40 : 70,
                                                scaleType: 'band', data: clientLabels,
                                                labelStyle: {
                                                    fontSize: 14,
                                                },
                                                tickLabelStyle: {
                                                    // One bar when a client is filtered — no crowding, so keep it horizontal.
                                                    angle: clientFilter ? 0 : -45,
                                                    fontSize: 11,
                                                }
                                            }]}
                                            height={320}
                                            colors={[chartColors.indigo, chartColors.coral, chartColors.amber, chartColors.teal, chartColors.violet]}
                                            margin={{ left: 0, right: 0, top: 10, bottom: 40 }}
                                            slotProps={{
                                                legend: { hidden: false },
                                            }}
                                        />
                                    </Box>
                                </Stack>
                            </Paper>

                            <Paper elevation={1} sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column', flex: { xs: '0 0 420px', sm: '1 1 0' }, minHeight: 0 }}>
                                <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Washing Stats
                                        </Typography>
                                        <Chip label="Pending" size="small" variant="outlined" />
                                    </Box>
                                    <Box sx={{ width: '100%', flex: 1, minHeight: 0 }}>
                                        <PieChart
                                            series={washerSeries}
                                            height={320}
                                            innerRadius={0.62}
                                            colors={pieColors}
                                            slotProps={{ legend: { position: 'bottom' } }}
                                        />
                                    </Box>
                                </Stack>
                            </Paper>
                        </Box>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Summary Tables */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={loading ? 'client-loading' : 'client-data'}
                            initial={loading ? { opacity: 0 } : { opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={loading ? { duration: 0.15 } : { duration: 0.5, delay: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ height: '100%' }}
                        >
                        {loading ? (
                            <Paper elevation={1} sx={{ borderRadius: 2, p: 2, height: 500, overflow: 'hidden' }}>
                                <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
                                <Skeleton variant="rectangular" height={424} />
                            </Paper>
                        ) : (
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Client Summary
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflow: 'auto' }}>
                                <TableContainer sx={{ height: '100%' }}>
                                    <Table>
                                        <TableHead sx={{ backgroundColor: theme.palette.action.hover, position: 'sticky', top: 0 }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Client</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Total
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In Making
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In Washing
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Awaiting Finish
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In Finishing
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {clientSummary.length > 0 ? (
                                                clientSummary.map((row, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell sx={{ fontWeight: 600, pl: 2 }}>{row.CLIENT}</TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.TOTAL || 0)} size="small" color="default" variant="outlined" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.MAKING || 0)} size="small" color="error" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.IN_WASHING || 0)} size="small" color="primary" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.AWAITING_FINISHING || 0)} size="small" color="warning" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.IN_FINISHING || 0)} size="small" color="secondary" variant="filled" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No data available
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                        </Box>
                    </Paper>
                        )}
                        </motion.div>
                    </AnimatePresence>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={loading ? 'stitching-vendor-loading' : 'stitching-vendor-data'}
                            initial={loading ? { opacity: 0 } : { opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={loading ? { duration: 0.15 } : { duration: 0.5, delay: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ height: '100%' }}
                        >
                        {loading ? (
                            <Paper elevation={1} sx={{ borderRadius: 2, p: 2, height: 500, overflow: 'hidden' }}>
                                <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
                                <Skeleton variant="rectangular" height={424} />
                            </Paper>
                        ) : (
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Stitching Summary
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflow: 'auto' }}>
                                <TableContainer sx={{ height: '100%' }}>
                                    <Table>
                                        <TableHead sx={{ backgroundColor: theme.palette.action.hover, position: 'sticky', top: 0 }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Vendor</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Total
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In Stitching
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Completed
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {stitchingVendorSummary.length > 0 ? (
                                                stitchingVendorSummary.map((row, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell sx={{ fontWeight: 600, pl: 2 }}>{row.STITCHING_VENDOR}</TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.TOTAL || 0)} size="small" color="default" variant="outlined" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.IN_STITCHING || 0)} size="small" color="error" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.COMPLETED || 0)} size="small" color="success" variant="filled" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No data available
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                        </Box>
                    </Paper>
                        )}
                        </motion.div>
                    </AnimatePresence>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={loading ? 'washer-loading' : 'washer-data'}
                            initial={loading ? { opacity: 0 } : { opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={loading ? { duration: 0.15 } : { duration: 0.5, delay: 0.55, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ height: '100%' }}
                        >
                        {loading ? (
                            <Paper elevation={1} sx={{ borderRadius: 2, p: 2, height: 500, overflow: 'hidden' }}>
                                <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
                                <Skeleton variant="rectangular" height={424} />
                            </Paper>
                        ) : (
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Washer Summary
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflow: 'auto' }}>
                                <TableContainer sx={{ height: '100%' }}>
                                    <Table>
                                        <TableHead sx={{ backgroundColor: theme.palette.action.hover, position: 'sticky', top: 0 }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Washer</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Total
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Out
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Pending
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {washerSummary.length > 0 ? (
                                                washerSummary.map((row, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell sx={{ fontWeight: 600, pl: 2 }}>{row.WASHER}</TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.TOTAL || 0)} size="small" color="default" variant="outlined" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.IN_WASHING || 0)} size="small" color="primary" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.OUT_WASHING || 0)} size="small" color="success" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.PENDING || 0)} size="small" color="error" variant="filled" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No data available
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                        </Box>
                    </Paper>
                        )}
                        </motion.div>
                    </AnimatePresence>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={loading ? 'finishing-vendor-loading' : 'finishing-vendor-data'}
                            initial={loading ? { opacity: 0 } : { opacity: 0, y: 24 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={loading ? { duration: 0.15 } : { duration: 0.5, delay: 0.65, ease: [0.25, 0.1, 0.25, 1] }}
                            style={{ height: '100%' }}
                        >
                        {loading ? (
                            <Paper elevation={1} sx={{ borderRadius: 2, p: 2, height: 500, overflow: 'hidden' }}>
                                <Skeleton variant="text" width="40%" height={28} sx={{ mb: 2 }} />
                                <Skeleton variant="rectangular" height={424} />
                            </Paper>
                        ) : (
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Finishing Summary
                            </Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflow: 'auto' }}>
                                <TableContainer sx={{ height: '100%' }}>
                                    <Table>
                                        <TableHead sx={{ backgroundColor: theme.palette.action.hover, position: 'sticky', top: 0 }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Vendor</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Total
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    In Finishing
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Completed
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {finishingVendorSummary.length > 0 ? (
                                                finishingVendorSummary.map((row, idx) => (
                                                    <TableRow key={idx} hover>
                                                        <TableCell sx={{ fontWeight: 600, pl: 2 }}>{row.FINISHING_VENDOR}</TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.TOTAL || 0)} size="small" color="default" variant="outlined" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.IN_FINISHING || 0)} size="small" color="error" variant="filled" />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Chip label={formatNumber(row.COMPLETED || 0)} size="small" color="success" variant="filled" />
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No data available
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                        </Box>
                    </Paper>
                        )}
                        </motion.div>
                    </AnimatePresence>
                </Grid>
            </Grid>

            {/* Stitching Vendor Summary + Breakdown — flex row with both Papers at the same
                fixed height so they end at the same Y. Fixed (not vh) so the dashboard's
                overall flow stays predictable; 600px fits ~10 breakdown rows + chrome. */}
            {SHOW_BREAKDOWNS && (
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 3,
                mb: 4,
                alignItems: 'stretch',
                height: { xs: 'auto', md: 600 }
            }}>

                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: { xs: '0 0 562px', md: '1 1 0' }, minHeight: 0 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Stitching Breakdown
                            </Typography>
                        </Box>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={loading ? 'stitching-breakdown-loading' : 'stitching-breakdown-data'}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                style={{ flex: 1, overflow: 'auto' }}
                            >
                                <TableContainer sx={{ height: '100%' }}>
                                    <Table>
                                        <TableHead sx={{ backgroundColor: theme.palette.action.hover, position: 'sticky', top: 0 }}>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', maxWidth: 70, pl: 2 }}>Client</TableCell>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', maxWidth: 100 }}>
                                                    Lot Count
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>Vendor</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Pcs
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loading ? (
                                                <TableRowsLoader colsNum={4} rowsNum={10} />
                                            ) : stitchingBreakdownData.length > 0 ? (
                                                stitchingBreakdownData.slice(stitchingBreakdownPage * stitchingBreakdownRowsPerPage, stitchingBreakdownPage * stitchingBreakdownRowsPerPage + stitchingBreakdownRowsPerPage).map((row, idx) => (
                                                    <React.Fragment key={idx}>
                                                        <TableRow hover>
                                                            <TableCell sx={{ fontWeight: 600, maxWidth: 70, pl: 2 }}>{row.CLIENT}</TableCell>
                                                            <TableCell title={row.LOT_NO || ''} sx={{ cursor: row.LOT_COUNT > 2 ? 'pointer' : 'default', maxWidth: 100 }}>
                                                                {row.LOT_COUNT > 0 && (
                                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                        <Chip label={row.LOT_COUNT} size="small" sx={{ minWidth: 35, bgcolor: 'primary.soft', fontWeight: 600 }} />
                                                                        <IconButton
                                                                            onClick={() => setExpandedStitchingRows(prev => ({
                                                                                ...prev,
                                                                                [stitchingBreakdownPage * stitchingBreakdownRowsPerPage + idx]: !prev[stitchingBreakdownPage * stitchingBreakdownRowsPerPage + idx]
                                                                            }))}
                                                                            sx={{ padding: 0, size: 'small' }}
                                                                        >
                                                                            {expandedStitchingRows[stitchingBreakdownPage * stitchingBreakdownRowsPerPage + idx] ? (
                                                                                <ExpandMoreIcon fontSize='small' />
                                                                            ) : (
                                                                                <ChevronRightIcon fontSize='small' />
                                                                            )}
                                                                        </IconButton>
                                                                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
                                                                            {row.LOT_NO}
                                                                        </Typography>
                                                                    </Box>
                                                                )}
                                                            </TableCell>
                                                            <TableCell sx={{ color: 'text.secondary' }}>{row.STITCHING_VENDOR || '—'}</TableCell>
                                                            <TableCell align="center">
                                                                <Chip label={formatNumber(row.PCS || 0)} size="small" color="default" variant="outlined" />
                                                            </TableCell>
                                                        </TableRow>
                                                        {row.LOT_NO && (
                                                            <TableRow
                                                                sx={{
                                                                    backgroundColor: 'background.paper',
                                                                    '& td': { border: expandedStitchingRows[stitchingBreakdownPage * stitchingBreakdownRowsPerPage + idx] ? undefined : 0, p: 0 },
                                                                    '&:last-child td, &:last-child th': { border: 0 },
                                                                }}
                                                            >
                                                                <TableCell colSpan={4} sx={{ p: 0 }}>
                                                                    <AnimatePresence>
                                                                        {expandedStitchingRows[stitchingBreakdownPage * stitchingBreakdownRowsPerPage + idx] && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, height: 0 }}
                                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                                exit={{ opacity: 0, height: 0 }}
                                                                                transition={{ duration: 0.3 }}
                                                                                style={{ overflow: 'hidden', paddingLeft: 16 }}
                                                                            >
                                                                                {row.LOT_NO.split(',').map((lotNo) => (
                                                                                    <React.Fragment key={lotNo}>
                                                                                        <Chip label={lotNo.trim()} size="small" sx={{ bgcolor: 'primary.soft', mr: 0.5, mb: 0.5 }} />
                                                                                    </React.Fragment>
                                                                                ))}
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No data available
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </motion.div>
                        </AnimatePresence>
                        {!loading && stitchingBreakdownData.length > 0 && (
                            <TablePagination
                                component="div"
                                count={stitchingBreakdownData.length}
                                page={stitchingBreakdownPage}
                                onPageChange={(_, newPage) => setStitchingBreakdownPage(newPage)}
                                rowsPerPage={stitchingBreakdownRowsPerPage}
                                onRowsPerPageChange={(e) => setStitchingBreakdownRowsPerPage(parseInt(e.target.value, 10))}
                                rowsPerPageOptions={[10, 25, 50, 100]}
                                sx={{ flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}` }}
                            />
                        )}
                    </Paper>
            </Box>
            )}

            {/* Detailed Breakdown (Washing) — hidden with SHOW_BREAKDOWNS */}
            {SHOW_BREAKDOWNS && (
            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            Washing Breakdown
                        </Typography>
                        {!loading && <Chip label={`${breakdownData.length} items`} size="small" variant="outlined" />}
                    </Stack>
                </Box>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={loading ? 'breakdown-loading' : 'breakdown-data'}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                    >
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ backgroundColor: theme.palette.action.hover }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', maxWidth: 70, pl: 2 }}>Client</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', maxWidth: 100 }}>
                                            Lot Count
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>Washer</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                            Total
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                            In Washing
                                        </TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                            Completed
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRowsLoader colsNum={7} rowsNum={10} />
                                    ) : breakdownData.length > 0 ? (
                                        breakdownData.slice(breakdownPage * breakdownRowsPerPage, breakdownPage * breakdownRowsPerPage + breakdownRowsPerPage).map((row, idx) => (
                                            <React.Fragment key={idx}>
                                                <TableRow hover>
                                                    <TableCell sx={{ fontWeight: 600, maxWidth: 70, pl: 2 }}>{row.CLIENT}</TableCell>
                                                    <TableCell title={row.LOT_NO || ''} sx={{ cursor: row.LOT_COUNT > 2 ? 'pointer' : 'default', maxWidth: 100 }}>
                                                        {row.LOT_COUNT > 0 && (
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Chip label={row.LOT_COUNT} size="small" sx={{ minWidth: 35, bgcolor: 'primary.soft', fontWeight: 600 }} />
                                                                <IconButton
                                                                    onClick={() => {
                                                                        const globalIdx = breakdownPage * breakdownRowsPerPage + idx;
                                                                        setExpandedRows((prevExpandedRows) => ({
                                                                            ...prevExpandedRows,
                                                                            [globalIdx]: !prevExpandedRows[globalIdx],
                                                                        }));
                                                                    }}
                                                                    sx={{ padding: 0, size: 'small' }}
                                                                >
                                                                    {expandedRows[breakdownPage * breakdownRowsPerPage + idx] ? (
                                                                        <ExpandMoreIcon fontSize='small' />
                                                                    ) : (
                                                                        <ChevronRightIcon fontSize='small' />
                                                                    )}
                                                                </IconButton>
                                                                <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 80 }}>
                                                                    {row.LOT_NO}
                                                                </Typography>
                                                            </Box>
                                                        )}
                                                    </TableCell>
                                                    <TableCell sx={{ color: 'text.secondary' }}>{row.WASHING || '\u2014'}</TableCell>
                                                    <TableCell align="center">
                                                        <Chip label={formatNumber(row.PCS || 0)} size="small" color="default" variant="outlined" />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {row.IN_WASHING > 0 && <Chip label={formatNumber(row.IN_WASHING)} size="small" color="primary" variant="filled" />}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        {row.OUT_WASHING > 0 && <Chip label={formatNumber(row.OUT_WASHING)} size="small" color="success" variant="filled" />}
                                                    </TableCell>
                                                </TableRow>
                                                {row.LOT_NO && (
                                                    <TableRow
                                                        sx={{
                                                            backgroundColor: 'background.paper',
                                                            '& td': { border: expandedRows[breakdownPage * breakdownRowsPerPage + idx] ? undefined : 0, p: 0 },
                                                            '&:last-child td, &:last-child th': { border: 0 },
                                                        }}
                                                    >
                                                        <TableCell colSpan={7} sx={{ p: 0 }}>
                                                            <AnimatePresence>
                                                                {expandedRows[breakdownPage * breakdownRowsPerPage + idx] && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: 'auto' }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        transition={{ duration: 0.3 }}
                                                                        style={{ overflow: 'hidden', paddingLeft: 16 }}
                                                                    >
                                                                        {row.LOT_NO.split(',').map((lotNo) => (
                                                                            <React.Fragment key={lotNo}>
                                                                                <Chip label={lotNo.trim()} size="small" sx={{ bgcolor: 'primary.soft', mr: 0.5, mb: 0.5 }} />
                                                                            </React.Fragment>
                                                                        ))}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </React.Fragment>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                No data available
                                            </TableCell>
                                        </TableRow>
                            )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    </motion.div>
                </AnimatePresence>
                {!loading && breakdownData.length > 0 && (
                    <TablePagination
                        component="div"
                        count={breakdownData.length}
                        page={breakdownPage}
                        onPageChange={(_, newPage) => setBreakdownPage(newPage)}
                        rowsPerPage={breakdownRowsPerPage}
                        onRowsPerPageChange={(e) => { setBreakdownRowsPerPage(parseInt(e.target.value, 10)); setBreakdownPage(0); }}
                        rowsPerPageOptions={[10, 25, 50, 100]}
                    />
                )}
            </Paper>
            )}

            {/* Footer */}
            <Stack direction="row" justifyContent="center" alignItems="center" spacing={2} sx={{ mt: 4, pt: 3, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
                <Box sx={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: 'text.secondary' }} />
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    Last updated: {timestamp}
                </Typography>
                <Box sx={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: 'text.secondary' }} />
            </Stack>
        </Container>
    );
};

export default Dashboard;
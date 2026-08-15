import React, { useState, useEffect } from 'react';
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

    // KPI Data
    const [kpiData, setKpiData] = useState({
        totalPcs: 0,
        totalMaking: 0,
        totalInWashing: 0,
        totalOutWashing: 0,
        totalInFinishing: 0,
        totalPendingDispatch: 0,
        totalPartDispatchPending: 0,
        totalDispatched: 0,
    });

    // Table Data
    const [clientSummary, setClientSummary] = useState([]);
    const [washerSummary, setWasherSummary] = useState([]);
    const [stitchingVendorSummary, setStitchingVendorSummary] = useState([]);
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
                totalOutWashing: data.total_out_washing || 0,
                totalInFinishing: data.total_in_finishing || 0,
                totalPendingDispatch: data.total_pending_dispatch || 0,
                totalPartDispatchPending: data.total_part_dispatch_pending || 0,
                totalDispatched: data.total_dispatched || 0,
            });

            setClientSummary(data.client_summary || []);
            setWasherSummary(data.washer_summary || []);
            setStitchingVendorSummary(data.stitching_vendor_summary || []);
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

    // Load data on mount and when date range changes
    useEffect(() => {
        loadData();
    }, [dateRange]);

    // Chart Colors based on theme
    const chartColors = {
        coral: theme.palette.mode === 'dark' ? '#F07A64' : '#E8634A',
        teal: theme.palette.mode === 'dark' ? '#3CC4B4' : '#2AA89A',
        amber: theme.palette.mode === 'dark' ? '#F0A820' : '#D4920A',
        indigo: theme.palette.mode === 'dark' ? '#7B88E0' : '#5C6AC4',
    };

    // Prepare data for MUI X Charts
    const clientTop = clientSummary.slice(0, 10);
    const clientLabels = clientTop.map((r) => r.CLIENT || '');
    const clientSeries = [
        { label: 'Total', data: clientTop.map((r) => r.TOTAL || 0) },
        { label: 'Making', data: clientTop.map((r) => r.MAKING || 0) },
        { label: 'In Washing', data: clientTop.map((r) => r.IN_WASHING || 0) },
        { label: 'Completed', data: clientTop.map((r) => r.OUT_WASHING || 0) },
    ];

    const washerData = washerSummary.map((r) => ({ label: r.WASHER || '', value: r.PENDING || 0 }));
    const washerSeries = [{ data: washerData }];

    const pieColors = [chartColors.coral, chartColors.teal, chartColors.indigo, chartColors.amber, '#B07AE8', '#5CC4C0', '#F4A060'];

    // Format large numbers
    const formatNumber = (num) => {
        return (num || 0).toLocaleString();
    };

    // KPI Card Component
    const KPICard = ({ icon: Icon, label, value, subtitle, color }) => (
        <Paper
            elevation={1}
            sx={{
                p: { xs: 1.5, sm: 2 },
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
                '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: '20px',
                    right: '12px',
                    height: '4px',
                    background: `linear-gradient(to right, ${color}, ${color}dd 40%, transparent)`,
                    borderRadius: '2px 2px 0 0',
                },
                '&:hover': {
                    elevation: 3,
                    transform: 'translateY(-4px)',
                    boxShadow: theme.shadows[8],
                },
            }}
        >
            <Stack spacing={1}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box
                        sx={{
                            p: 1,
                            borderRadius: 1,
                            backgroundColor: `${color}20`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Icon sx={{ color, fontSize: 24 }} />
                    </Box>
                </Box>
                <Typography variant="overline" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1.5, color: 'text.secondary', fontSize: '0.65rem' }}>
                    {label}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 700, color, lineHeight: 1, fontSize: { xs: '1.2rem', sm: '1.6rem', md: '2rem' } }}>
                    {formatNumber(value)}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '0.75rem' }}>
                    {subtitle}
                </Typography>
            </Stack>
        </Paper>
    );

    return (
        <Container maxWidth="xl" sx={{ pt: '0 !important', pb: 2, px: '0 !important' }}>
            {/* Header — on mobile the date filter + refresh drop to a centered row below the title */}
            <Stack
                direction={{ xs: 'column', md: 'row' }}
                alignItems={{ xs: 'stretch', md: 'center' }}
                sx={{ mb: 3, mt: 1, flexWrap: 'wrap', gap: 2 }}
            >
                <Typography variant="h4">Dashboard</Typography>
                <Stack direction="row" alignItems="center" justifyContent="flex-start" sx={{ gap: 2 }}>
                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                        <DateRangePicker
                            value={dateRange}
                            onChange={(newValue) => setDateRange(newValue)}
                            format="DD/MM/YY"
                            slots={{ textField: MorphDateTextField }}
                            slotProps={{ textField: { variant: 'standard', size: 'small' } }}
                            sx={{ width: 180 }}
                        />
                    </LocalizationProvider>
                    <IconButton onClick={loadData} disabled={loading}>
                        <RefreshIcon />
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
                    <Grid container spacing={2} sx={{ mb: 4, alignItems: 'stretch' }}>
                        {loading ? (
                            [0, 1, 2, 3, 4, 5].map((i) => (
                                <Grid key={i} size={{ xs: 6, sm: 4, md: 2 }}>
                                    <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                                        <Skeleton variant="circular" width={40} height={40} sx={{ mb: 1 }} />
                                        <Skeleton variant="text" width="50%" height={16} />
                                        <Skeleton variant="text" width="70%" height={36} sx={{ my: 0.5 }} />
                                        <Skeleton variant="text" width="60%" height={14} />
                                    </Paper>
                                </Grid>
                            ))
                        ) : (
                            <>
                                {[
                                    { label: 'Total Pieces', value: kpiData.totalPcs, subtitle: 'All tracked items', color: '#5C6AC4', icon: GridViewIcon },
                                    { label: 'Making', value: kpiData.totalMaking, subtitle: 'In production', color: '#E8634A', icon: ContentCutIcon },
                                    { label: 'In Washing', value: kpiData.totalInWashing, subtitle: 'Being processed', color: '#D4920A', icon: LocalLaundryServiceIcon },
                                    { label: 'In Finishing', value: kpiData.totalInFinishing, subtitle: 'Being finished', color: '#9966FF', icon: AutoAwesomeIcon },
                                    { label: 'Pending Dispatch', value: kpiData.totalPendingDispatch, subtitle: `${formatNumber(kpiData.totalPartDispatchPending)} - part-dispatch`, color: '#E8923D', icon: PendingActionsIcon },
                                    { label: 'Dispatched', value: kpiData.totalDispatched, subtitle: 'Pieces dispatched', color: '#2AA89A', icon: LocalShippingIcon },
                                ].map((card, i) => (
                                    <Grid key={card.label} size={{ xs: 6, sm: 4, md: 2 }}>
                                        <motion.div
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.4, delay: i * 0.1 }}
                                            style={{ height: '100%' }}
                                        >
                                            <KPICard {...card} />
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
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    {loading ? (
                        <Grid container spacing={3} sx={{ mb: 4, alignItems: 'stretch' }}>
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
                            mb: 4,
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
                                                height: 70,
                                                scaleType: 'band', data: clientLabels,
                                                labelStyle: {
                                                    fontSize: 14,
                                                },
                                                tickLabelStyle: {
                                                    angle: -45,
                                                    fontSize: 11,
                                                }
                                            }]}
                                            height={320}
                                            colors={[chartColors.indigo, chartColors.coral, chartColors.amber, chartColors.teal]}
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
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Client Summary
                            </Typography>
                        </Box>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={loading ? 'client-loading' : 'client-data'}
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
                                                <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Client</TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Total
                                                </TableCell>
                                                <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                                    Making
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
                                                <TableRowsLoader colsNum={5} rowsNum={5} />
                                            ) : clientSummary.length > 0 ? (
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
                                                            <Chip label={formatNumber(row.OUT_WASHING || 0)} size="small" color="success" variant="filled" />
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
                            </motion.div>
                        </AnimatePresence>
                    </Paper>
                </Grid>

                <Grid size={{ xs: 12, md: 6 }}>
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Washer Summary
                            </Typography>
                        </Box>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={loading ? 'washer-loading' : 'washer-data'}
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
                                            {loading ? (
                                                <TableRowsLoader colsNum={5} rowsNum={5} />
                                            ) : washerSummary.length > 0 ? (
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
                            </motion.div>
                        </AnimatePresence>
                    </Paper>
                </Grid>
            </Grid>

            {/* Stitching Vendor Summary + Breakdown — flex row with both Papers at the same
                fixed height so they end at the same Y. Fixed (not vh) so the dashboard's
                overall flow stays predictable; 600px fits ~10 breakdown rows + chrome. */}
            <Box sx={{
                display: 'flex',
                flexDirection: { xs: 'column', md: 'row' },
                gap: 3,
                mb: 4,
                alignItems: 'stretch',
                height: { xs: 'auto', md: 600 }
            }}>
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: { xs: '0 0 500px', md: '1 1 0' }, minHeight: 0 }}>
                        <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                Stitching Summary
                            </Typography>
                        </Box>
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={loading ? 'stitching-vendor-loading' : 'stitching-vendor-data'}
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
                                            {loading ? (
                                                <TableRowsLoader colsNum={4} rowsNum={5} />
                                            ) : stitchingVendorSummary.length > 0 ? (
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
                            </motion.div>
                        </AnimatePresence>
                    </Paper>

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

            {/* Detailed Breakdown */}
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

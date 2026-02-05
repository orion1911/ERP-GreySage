import React, { useState, useEffect } from 'react';
import {
    Container,
    Paper,
    Box,
    Grid,
    Stack,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    CircularProgress,
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
import BoltIcon from '@mui/icons-material/Bolt';
import LocalLaundryServiceIcon from '@mui/icons-material/LocalLaundryService';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useOutletContext } from 'react-router-dom';
// Using @mui/x-charts instead of Chart.js for built-in integration with MUI

const ProductionDashboard = () => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { showSnackbar } = useOutletContext() || {};

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [processingTime, setProcessingTime] = useState('—');
    const [timestamp, setTimestamp] = useState('—');

    // KPI Data
    const [kpiData, setKpiData] = useState({
        totalPcs: 0,
        totalMaking: 0,
        totalInWashing: 0,
        totalOutWashing: 0,
    });

    // Table Data
    const [clientSummary, setClientSummary] = useState([]);
    const [washerSummary, setWasherSummary] = useState([]);
    const [breakdownData, setBreakdownData] = useState([]);

    // (Chart.js refs removed — using MUI X Charts instead)

    // Fetch Dashboard Data
    const loadData = async () => {
        setLoading(true);
        setError('');

        try {
            const apiUrl = 'https://greysagedash.vercel.app/api/process';

            const res = await fetch(apiUrl, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!res.ok) throw new Error(`API returned ${res.status}`);

            let data;
            const ct = res.headers.get('content-type');
            if (ct && ct.includes('application/json')) {
                const body = await res.text();
                try {
                    data = JSON.parse(JSON.parse(body).body);
                } catch {
                    data = JSON.parse(body);
                }
            } else {
                throw new Error('Invalid response format');
            }

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
            });

            if (data.processing_time) {
                setProcessingTime(Math.round(data.processing_time * 1000));
            }

            setClientSummary(data.client_summary || []);
            setWasherSummary(data.washer_summary || []);
            setBreakdownData(data.rows || []);

            const ts = new Date(data.timestamp);
            setTimestamp(ts.toLocaleString());
        } catch (err) {
            const errorMsg = err.message || 'Failed to load data.';
            setError(errorMsg);
            if (showSnackbar) showSnackbar(errorMsg, 'error');
            console.error('Error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Load data on component mount
    useEffect(() => {
        loadData();
    }, []);

    // Chart Colors based on theme
    const chartColors = {
        coral: theme.palette.mode === 'dark' ? '#F07A64' : '#E8634A',
        teal: theme.palette.mode === 'dark' ? '#3CC4B4' : '#2AA89A',
        amber: theme.palette.mode === 'dark' ? '#F0A820' : '#D4920A',
        indigo: theme.palette.mode === 'dark' ? '#7B88E0' : '#5C6AC4',
    };

    const chartGridColor = theme.palette.mode === 'dark' ? '#282D3A' : '#E8E5DE';
    const chartTickColor = theme.palette.mode === 'dark' ? '#555B6E' : '#AEAEB5';

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



    // Get status badge color
    const getStatusBadgeColor = (status) => {
        const colorMap = {
            Making: 'error',
            Washing: 'primary',
            Completed: 'success',
            Pending: 'error',
        };
        return colorMap[status] || 'default';
    };

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
        <Container spacing={2}>
            {/* Header */}
            <Stack direction="row" alignItems="center" sx={{ mb: 4, mt: 1, flexWrap: 'wrap', gap: 2 }}>
                <Stack>
                    <Typography variant="h4">Dashboard</Typography>
                </Stack>
                <Stack direction="row" spacing={2} alignItems="center">
                    <Chip
                        icon={<BoltIcon />}
                        label={`${processingTime} ms`}
                        variant="outlined"
                        // sx={{
                        //     '& .MuiChip-icon': {
                        //         color: 'success.main',
                        //         animation: 'pulse 2.5s ease-in-out infinite',
                        //     },
                        // }}
                    />
                    <Button
                        variant="contained"
                        startIcon={<RefreshIcon />}
                        onClick={loadData}
                        disabled={loading}
                        sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                        {loading ? <CircularProgress size={20} /> : 'Refresh'}
                    </Button>
                </Stack>
            </Stack>

            {/* Error Message */}
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

            {/* Loading State */}
            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                    <CircularProgress />
                </Box>
            )}

            {!loading && (
                <>

                    <Grid container spacing={2} sx={{ mb: 4, alignItems: 'stretch' }}>
                        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                            <KPICard label="Total Pieces" value={kpiData.totalPcs} subtitle="All tracked items" color="#5C6AC4" icon={GridViewIcon} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                            <KPICard label="Making" value={kpiData.totalMaking} subtitle="In production" color="#E8634A" icon={ContentCutIcon} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                            <KPICard label="In Washing" value={kpiData.totalInWashing} subtitle="Being processed" color="#D4920A" icon={LocalLaundryServiceIcon} />
                        </Grid>
                        <Grid size={{ xs: 6, sm: 6, md: 3 }}>
                            <KPICard label="Completed" value={kpiData.totalOutWashing} subtitle="Ready for delivery" color="#2AA89A" icon={CheckCircleIcon} />
                        </Grid>
                    </Grid>

                    {/* Charts */}
                    <Grid container className="adil" spacing={3} sx={{ mb: 4, alignItems: 'stretch' }}>
                        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                            <Paper elevation={1} sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                                <Stack spacing={2} sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Client Stats
                                        </Typography>
                                        <Chip label="Top 10" size="small" variant="outlined" />
                                    </Box>
                                    <Box sx={{ width: '100%' }}>
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
                                            height={300}
                                            colors={[chartColors.indigo, chartColors.coral, chartColors.amber, chartColors.teal]}
                                            margin={{ left: 0, right: 0, top: 10, bottom: 40 }}
                                            slotProps={{
                                                legend: { hidden: false },
                                            }}
                                        />
                                    </Box>
                                </Stack>
                            </Paper>
                        </Grid>

                        <Grid size={{ xs: 12, sm: 6, md: 6 }}>
                            <Paper elevation={1} sx={{ p: 2, borderRadius: 2, display: 'flex', flexDirection: 'column' }}>
                                <Stack spacing={2} sx={{ flex: 1 }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                            Washing Stats
                                        </Typography>
                                        <Chip label="Pending" size="small" variant="outlined" />
                                    </Box>
                                    <Box sx={{ width: '100%' }}>
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
                        </Grid>
                    </Grid>

                    {/* Summary Tables */}
                    <Grid container spacing={3} sx={{ mb: 4 }}>
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                                <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        Client Summary
                                    </Typography>
                                </Box>
                                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
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
                            </Paper>
                        </Grid>

                        <Grid size={{ xs: 12, md: 6 }}>
                            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 500 }}>
                                <Box sx={{ p: 2, pl: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        Washer Summary
                                    </Typography>
                                </Box>
                                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
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
                            </Paper>
                        </Grid>
                    </Grid>

                    {/* Detailed Breakdown */}
                    <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                    Complete Breakdown
                                </Typography>
                                <Chip label="First 100 items" size="small" variant="outlined" />
                            </Stack>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead sx={{ backgroundColor: theme.palette.action.hover }}>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase', pl: 2 }}>Client</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>Washer</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                            Pcs
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
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                                            Lots
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {breakdownData.length > 0 ? (
                                        breakdownData.slice(0, 100).map((row, idx) => (
                                            <TableRow key={idx} hover>
                                                <TableCell sx={{ fontWeight: 600, pl: 2 }}>{row.CLIENT}</TableCell>
                                                <TableCell sx={{ color: 'text.secondary' }}>{row.WASHING || '—'}</TableCell>
                                                <TableCell align="center">
                                                    <Chip label={formatNumber(row.PCS || 0)} size="small" color="default" variant="outlined" />
                                                </TableCell>
                                                <TableCell align="center">
                                                    {row.MAKING > 0 && <Chip label={formatNumber(row.MAKING)} size="small" color="error" variant="filled" />}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {row.IN_WASHING > 0 && <Chip label={formatNumber(row.IN_WASHING)} size="small" color="primary" variant="filled" />}
                                                </TableCell>
                                                <TableCell align="center">
                                                    {row.OUT_WASHING > 0 && <Chip label={formatNumber(row.OUT_WASHING)} size="small" color="success" variant="filled" />}
                                                </TableCell>
                                                <TableCell title={row.LOT_NO || ''} sx={{ cursor: row.LOT_COUNT > 0 ? 'help' : 'default' }}>
                                                    {row.LOT_COUNT > 0 && (
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Chip label={row.LOT_COUNT} size="small" sx={{ minWidth: 28, bgcolor: 'primary.soft', color: 'primary.main', fontWeight: 600 }} />
                                                            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>
                                                                {row.LOT_NO}
                                                            </Typography>
                                                        </Box>
                                                    )}
                                                </TableCell>
                                            </TableRow>
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
                    </Paper>

                    {/* Footer */}
                    <Stack direction="row" justifyContent="center" alignItems="center" spacing={2} sx={{ mt: 4, pt: 3, borderTop: `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: 'text.secondary' }} />
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            Last updated: {timestamp}
                        </Typography>
                        <Box sx={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: 'text.secondary' }} />
                        {/* <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Production Tracker v2
            </Typography> */}
                    </Stack>
                </>
            )}

            <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(42,168,154,0.2); }
          50% { box-shadow: 0 0 0 6px rgba(42,168,154,0.08); }
        }
      `}</style>
        </Container>
    );
};

export default ProductionDashboard;

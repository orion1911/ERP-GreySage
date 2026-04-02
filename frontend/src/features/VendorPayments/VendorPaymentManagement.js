import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import {
    useTheme, Container, Box, Button, Card, CardContent, Modal, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, FormControl, Grid, InputLabel, MenuItem, Select,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TablePagination, TextField, Typography, Paper, Alert, CircularProgress, Chip, IconButton, Tooltip
} from '@mui/material';
import { Close as CloseIcon, CreditCard as CreditCardIcon, Shortcut as ShortcutIcon, Save as SaveIcon, Edit as EditIcon, Delete as DeleteIcon, FileDownload as FileDownloadIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import dayjs from 'dayjs';
import apiService from '../../services/apiService';

const VendorPaymentManagement = () => {
    const theme = useTheme();
    const { isMobile, drawerWidth, showSnackbar } = useOutletContext();
    const [vendorType, setVendorType] = useState('stitching');
    const [vendors, setVendors] = useState([]);
    const [selectedVendor, setSelectedVendor] = useState('');
    const [lotsData, setLotsData] = useState([]);
    const [paymentEntries, setPaymentEntries] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [paymentDialogLoading, setPaymentDialogLoading] = useState(false);
    const [shortDialogLoading, setShortDialogLoading] = useState(false);
    const [editingPaymentRecord, setEditingPaymentRecord] = useState(null);
    const [editingShortRecord, setEditingShortRecord] = useState(null);

    // Payment history paging/sorting
    const [paymentPage, setPaymentPage] = useState(0);
    const [paymentRowsPerPage, setPaymentRowsPerPage] = useState(10);
    const [paymentSortBy, setPaymentSortBy] = useState('paymentDate');
    const [paymentSortOrder, setPaymentSortOrder] = useState('desc');

    const [lotPage, setLotPage] = useState(0);
    const [lotRowsPerPage, setLotRowsPerPage] = useState(10);
    const [lotSortBy, setLotSortBy] = useState('date');
    const [lotSortOrder, setLotSortOrder] = useState('desc');

    const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
    const [shortDialogOpen, setShortDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState({ type: '', id: '' });

    // Payment Dialog Form
    const paymentFormDefaultValues = {
        paymentDate: dayjs(new Date()),
        amount: '',
        notes: ''
    };

    const { control: paymentControl, handleSubmit: handlePaymentSubmit, reset: resetPaymentForm, formState: { errors: paymentErrors } } = useForm({
        defaultValues: paymentFormDefaultValues,
        mode: 'onChange',
    });

    // Short Adjustment Dialog Form
    const shortFormDefaultValues = {
        lotId: '',
        paymentDate: dayjs(new Date()),
        quantity: '',
        rate: '',
        notes: ''
    };

    const { control: shortControl, handleSubmit: handleShortSubmit, reset: resetShortForm, formState: { errors: shortErrors }, watch: watchShort } = useForm({
        defaultValues: shortFormDefaultValues,
        mode: 'onChange',
    });

    const shortQuantity = watchShort('quantity');
    const shortRate = watchShort('rate');

    const isPaymentEditMode = !!editingPaymentRecord;
    const isShortEditMode = !!editingShortRecord;

    // Fetch vendors when vendor type changes
    useEffect(() => {
        if (vendorType) {
            fetchVendors();
            setSelectedVendor('');
            setLotsData([]);
            setPaymentEntries([]);
            setSummary(null);
        }
    }, [vendorType]);

    // Fetch lots and payment entries when vendor is selected
    useEffect(() => {
        if (selectedVendor && vendorType) {
            fetchVendorData();
        }
    }, [selectedVendor]);

    const fetchVendors = async () => {
        try {
            setLoading(true);
            setError('');
            const data = await apiService.vendorPayments.getVendorsByType(vendorType);
            setVendors(data || []);
        } catch (err) {
            setError('Failed to load vendors: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const fetchVendorData = async () => {
        try {
            setLoading(true);
            setError('');

            // Fetch lots data
            const lotsResponse = await apiService.vendorPayments.getVendorLotsDetails(selectedVendor, vendorType);
            setLotsData(lotsResponse.lots || []);
            setSummary(lotsResponse.summary || null);

            // Fetch payment entries
            const paymentResponse = await apiService.vendorPayments.getVendorPaymentEntries(selectedVendor, vendorType);
            setPaymentEntries(paymentResponse || []);

        } catch (err) {
            setError('Failed to load vendor data: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleAddPayment = () => {
        setEditingPaymentRecord(null);
        resetPaymentForm(paymentFormDefaultValues);
        setPaymentDialogOpen(true);
    };

    const handleEditPayment = (record) => {
        setEditingPaymentRecord(record);
        resetPaymentForm({
            paymentDate: dayjs(record.paymentDate),
            amount: record.amount,
            notes: record.notes || ''
        });
        setPaymentDialogOpen(true);
    };

    const openDeleteDialog = (type, recordId) => {
        setDeleteTarget({ type, id: recordId });
        setDeleteDialogOpen(true);
    };

    const confirmDelete = async () => {
        setDeleteDialogOpen(false);
        const { type, id } = deleteTarget;
        try {
            await apiService.vendorPayments.deletePaymentEntry(id);
            if (type === 'payment') {
                showSnackbar('Payment entry deleted successfully', 'success');
            } else {
                showSnackbar('Short adjustment entry deleted successfully', 'success');
            }
            await fetchVendorData();
        } catch (err) {
            if (type === 'payment') {
                showSnackbar('Failed to delete payment: ' + (err.response?.data?.error || err.message), 'error');
            } else {
                showSnackbar('Failed to delete short adjustment: ' + (err.response?.data?.error || err.message), 'error');
            }
        }
    };

    const handleDeletePayment = async (recordId) => {
        openDeleteDialog('payment', recordId);
    };

    const handleAddShortAdjustment = () => {
        setEditingShortRecord(null);
        resetShortForm(shortFormDefaultValues);
        setShortDialogOpen(true);
    };

    const handleEditShortAdjustment = (record) => {
        setEditingShortRecord(record);
        resetShortForm({
            lotId: record.lotId?._id || '',
            paymentDate: dayjs(record.paymentDate),
            quantity: record.shortQuantity,
            rate: record.shortRate,
            notes: record.notes || ''
        });
        setShortDialogOpen(true);
    };

    const handleDeleteShortAdjustment = async (recordId) => {
        openDeleteDialog('short', recordId);
    };

    const submitPayment = async (data) => {
        if (!data.amount) {
            showSnackbar('Please enter a valid amount', 'error');
            return;
        }

        try {
            setPaymentDialogLoading(true);
            const payload = {
                vendorId: selectedVendor,
                vendorType: vendorType,
                amount: parseFloat(data.amount),
                paymentDate: data.paymentDate.toISOString(),
                notes: data.notes
            };

            if (isPaymentEditMode) {
                await apiService.vendorPayments.updatePaymentEntry(editingPaymentRecord._id, payload);
                showSnackbar('Payment updated successfully', 'success');
            } else {
                await apiService.vendorPayments.addVendorPayment(payload);
                showSnackbar('Payment recorded successfully', 'success');
            }
            
            setPaymentDialogOpen(false);
            setEditingPaymentRecord(null);
            resetPaymentForm(paymentFormDefaultValues);
            await fetchVendorData();
        } catch (err) {
            showSnackbar('Failed to record payment: ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setPaymentDialogLoading(false);
        }
    };

    const submitShortAdjustment = async (data) => {
        if (!data.lotId) {
            showSnackbar('Please select a lot for short adjustment', 'error');
            return;
        }

        if (!data.quantity || data.quantity <= 0 || data.rate === '' || data.rate < 0) {
            showSnackbar('Please enter valid short quantity and rate', 'error');
            return;
        }

        try {
            setShortDialogLoading(true);
            const payload = {
                vendorId: selectedVendor,
                vendorType: vendorType,
                lotId: data.lotId,
                shortQuantity: parseInt(data.quantity, 10),
                shortRate: parseFloat(data.rate),
                paymentDate: data.paymentDate.toISOString(),
                notes: data.notes
            };

            if (isShortEditMode) {
                await apiService.vendorPayments.updatePaymentEntry(editingShortRecord._id, payload);
                showSnackbar('Short adjustment updated successfully', 'success');
            } else {
                await apiService.vendorPayments.addShortAdjustment(payload);
                showSnackbar('Short adjustment recorded successfully', 'success');
            }
            
            setShortDialogOpen(false);
            setEditingShortRecord(null);
            resetShortForm(shortFormDefaultValues);
            await fetchVendorData();
        } catch (err) {
            showSnackbar('Failed to record short adjustment: ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setShortDialogLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    };

    // Export lots data to Excel (server-side)
    const exportLotsToExcel = async () => {
        if (!lotsData.length) {
            showSnackbar('No lots data to export', 'warning');
            return;
        }

        try {
            const response = await apiService.vendorPayments.exportLotsToExcel(selectedVendor, vendorType);

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            
            // Get vendor name for filename
            const selectedVendorObj = vendors.find(v => v._id === selectedVendor);
            const vendorName = selectedVendorObj ? selectedVendorObj.name : 'Unknown';
            const fileName = `${vendorTypeLabel[vendorType]}_${vendorName}_Lots_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            showSnackbar('Lots data exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showSnackbar('Failed to export lots data', 'error');
        }
    };

    // Export payment entries to Excel (server-side)
    const exportPaymentsToExcel = async () => {
        if (!paymentEntries.length) {
            showSnackbar('No payment data to export', 'warning');
            return;
        }

        try {
            const response = await apiService.vendorPayments.exportPaymentsToExcel(selectedVendor, vendorType);

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            
            // Get vendor name for filename
            const selectedVendorObj = vendors.find(v => v._id === selectedVendor);
            const vendorName = selectedVendorObj ? selectedVendorObj.name : 'Unknown';
            const fileName = `${vendorTypeLabel[vendorType]}_${vendorName}_Payments_${new Date().toISOString().split('T')[0]}.xlsx`;
            
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            showSnackbar('Payment data exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showSnackbar('Failed to export payment data', 'error');
        }
    };

    const sortedPaymentEntries = React.useMemo(() => {
        const entries = [...paymentEntries];
        const compare = (a, b) => {
            const aValue = paymentSortBy === 'paymentDate' ? new Date(a.paymentDate) : paymentSortBy === 'amount' ? a.amount : a.paymentType;
            const bValue = paymentSortBy === 'paymentDate' ? new Date(b.paymentDate) : paymentSortBy === 'amount' ? b.amount : b.paymentType;

            if (aValue < bValue) return paymentSortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return paymentSortOrder === 'asc' ? 1 : -1;
            return 0;
        };
        return entries.sort(compare);
    }, [paymentEntries, paymentSortBy, paymentSortOrder]);

    const pagedPaymentEntries = React.useMemo(() => {
        const start = paymentPage * paymentRowsPerPage;
        return sortedPaymentEntries.slice(start, start + paymentRowsPerPage);
    }, [sortedPaymentEntries, paymentPage, paymentRowsPerPage]);

    const sortedLotsData = React.useMemo(() => {
        const entries = [];
        
        if (vendorType === 'washing') {
            // For washing, expand each lot into multiple rows for each wash detail
            lotsData.forEach(lot => {
                if (lot.washDetails && lot.washDetails.length > 0) {
                    lot.washDetails.forEach((wash, index) => {
                        entries.push({
                            ...lot,
                            washDetail: wash,
                            isWashDetail: true,
                            washIndex: index,
                            displayQuantity: wash.quantity,
                            displayRate: wash.rate,
                            displayAmount: wash.amount,
                            displayQuantityShort: wash.quantityShort
                        });
                    });
                } else {
                    // Fallback for lots without wash details
                    entries.push({
                        ...lot,
                        isWashDetail: false,
                        displayQuantity: lot.quantity,
                        displayRate: lot.rate,
                        displayAmount: lot.amount,
                        displayQuantityShort: lot.quantityShort
                    });
                }
            });
        } else {
            // For stitching and finishing, use original format
            lotsData.forEach(lot => {
                entries.push({
                    ...lot,
                    isWashDetail: false,
                    displayQuantity: lot.quantity,
                    displayRate: lot.rate,
                    displayAmount: lot.amount,
                    displayQuantityShort: lot.quantityShort
                });
            });
        }
        
        const compare = (a, b) => {
            let aValue = a[lotSortBy];
            let bValue = b[lotSortBy];

            if (lotSortBy === 'date') {
                aValue = new Date(aValue);
                bValue = new Date(bValue);
            }
            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = aValue.toLowerCase();

            if (aValue < bValue) return lotSortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return lotSortOrder === 'asc' ? 1 : -1;
            return 0;
        };

        return entries.sort(compare);
    }, [lotsData, lotSortBy, lotSortOrder, vendorType]);

    const pagedLotsData = React.useMemo(() => {
        const start = lotPage * lotRowsPerPage;
        return sortedLotsData.slice(start, start + lotRowsPerPage);
    }, [sortedLotsData, lotPage, lotRowsPerPage]);

    const handlePaymentSort = (field) => {
        if (paymentSortBy === field) {
            setPaymentSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setPaymentSortBy(field);
            setPaymentSortOrder('desc');
        }
    };

    const handleLotSort = (field) => {
        if (lotSortBy === field) {
            setLotSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setLotSortBy(field);
            setLotSortOrder('desc');
        }
    };

    const handleChangePaymentPage = (event, newPage) => {
        setPaymentPage(newPage);
    };

    const handleChangePaymentRowsPerPage = (event) => {
        setPaymentRowsPerPage(parseInt(event.target.value, 10));
        setPaymentPage(0);
    };

    const handleChangeLotPage = (event, newPage) => {
        setLotPage(newPage);
    };

    const handleChangeLotRowsPerPage = (event) => {
        setLotRowsPerPage(parseInt(event.target.value, 10));
        setLotPage(0);
    };

    const totalShortAdjusted = paymentEntries
        .filter((entry) => entry.paymentType === 'short_adjustment')
        .reduce((sum, entry) => sum + (entry.shortQuantity || 0), 0);

    const shortLots = lotsData.filter((lot) => lot.displayQuantityShort > 0);

    const vendorTypeLabel = {
        'stitching': 'Stitching',
        'washing': 'Washing',
        'finishing': 'Finishing'
    };

    return (
        <Container maxWidth="xl" sx={{ pt: '0 !important', pb: 2, px: '0 !important' }}>
            <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold' }}>
                Payment Management
            </Typography>

            {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

            {/* Filters */}
            <Card sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
                <CardContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                            <FormControl fullWidth>
                                <InputLabel>Vendor Type</InputLabel>
                                <Select
                                    value={vendorType}
                                    label="Vendor Type"
                                    onChange={(e) => setVendorType(e.target.value)}
                                >
                                    <MenuItem value="stitching">Stitching</MenuItem>
                                    <MenuItem value="washing">Washing</MenuItem>
                                    <MenuItem value="finishing">Finishing</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                            <FormControl fullWidth disabled={!vendorType}>
                                <InputLabel>Vendor</InputLabel>
                                <Select
                                    value={selectedVendor}
                                    label="Vendor"
                                    onChange={(e) => setSelectedVendor(e.target.value)}
                                >
                                    <MenuItem value="">Select Vendor</MenuItem>
                                    {vendors.map((vendor) => (
                                        <MenuItem key={vendor._id} value={vendor._id}>
                                            {vendor.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        </Grid>
                        {summary && selectedVendor !== '' && (
                            <Grid container spacing={2} sx={{ mt: 2 }}>
                                <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Due
                                    </Typography>
                                    <Typography variant="h6">
                                        {formatCurrency(summary.totalAmount)}
                                    </Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Paid
                                    </Typography>
                                    <Typography variant="h6" sx={{ color: 'green' }}>
                                        {formatCurrency(summary.totalPayment)}
                                    </Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                                    <Typography color="textSecondary" gutterBottom>
                                        Remaining Balance
                                    </Typography>
                                    <Typography
                                        variant="h6"
                                        sx={{ color: summary.totalBalance > 0 ? 'red' : 'green' }}
                                    >
                                        {formatCurrency(summary.totalBalance)}
                                    </Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                                    <Typography color="textSecondary" gutterBottom>
                                        Total Quantity
                                    </Typography>
                                    <Typography variant="h6">{summary.totalQuantity}</Typography>
                                </Grid>
                                <Grid size={{ xs: 6, sm: 6, md: 2 }}>
                                    <Typography color="textSecondary" gutterBottom>
                                        Short Qty
                                    </Typography>
                                <div style={{ display: 'flex'}}>
                                    <Typography variant="h6">{summary.totalShortQuantity}</Typography>
                                    <Typography variant="caption" sx={{ color: 'textSecondary', alignSelf: 'center', ml: 0.8 }}>
                                        (Adjusted: {totalShortAdjusted})
                                    </Typography>
                                </div>
                                </Grid>
                                <Grid size={{ xs: 12, sm: 6, md: 2 }}>
                                    <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column' }}>
                                        <Button
                                            variant="contained"
                                            color="primary"
                                            startIcon={<CreditCardIcon />}
                                            onClick={handleAddPayment}
                                            size="small"
                                        >
                                            Vendor Payment
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            color="secondary"
                                            startIcon={<ShortcutIcon />}
                                            onClick={handleAddShortAdjustment}
                                            size="small"
                                        >
                                            Short Adjustment
                                        </Button>
                                    </Box>
                                </Grid>
                            </Grid>
                        )}
                </CardContent>
            </Card>
            {selectedVendor && vendorType && (
                <>
                    {/* Two Column Layout: Lots Table and Payment History */}
                    <Grid container spacing={2} sx={{ mb: 4, alignItems: 'stretch' }}>
                        {/* Left Column: Current Lots Table */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                <Box sx={{ p: 1, pl: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                                        Lots
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<FileDownloadIcon />}
                                        onClick={exportLotsToExcel}
                                        disabled={!lotsData.length}
                                        sx={{ mr: 1 }}
                                    >
                                        Export Excel
                                    </Button>
                                </Box>
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sortDirection={lotSortBy === 'date' ? lotSortOrder : false}>
                                                    <TableSortLabel
                                                        active={lotSortBy === 'date'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('date')}
                                                    >
                                                        DATE
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell sortDirection={lotSortBy === 'lotNumber' ? lotSortOrder : false}>
                                                    <TableSortLabel
                                                        active={lotSortBy === 'lotNumber'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('lotNumber')}
                                                    >
                                                        LOT
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell sortDirection={lotSortBy === 'clientName' ? lotSortOrder : false}>
                                                    <TableSortLabel
                                                        active={lotSortBy === 'clientName'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('clientName')}
                                                    >
                                                        CLIENT
                                                    </TableSortLabel>
                                                </TableCell>
                                                {vendorType === 'washing' && (
                                                    <TableCell>
                                                        WASH COLOR
                                                    </TableCell>
                                                )}
                                                <TableCell sortDirection={lotSortBy === 'displayQuantity' ? lotSortOrder : false} align="center">
                                                    <TableSortLabel
                                                        active={lotSortBy === 'displayQuantity'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('displayQuantity')}
                                                    >
                                                        PCS
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell sortDirection={lotSortBy === 'displayRate' ? lotSortOrder : false} align="center">
                                                    <TableSortLabel
                                                        active={lotSortBy === 'displayRate'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('displayRate')}
                                                    >
                                                        RATE
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell sortDirection={lotSortBy === 'displayAmount' ? lotSortOrder : false} align="center">
                                                    <TableSortLabel
                                                        active={lotSortBy === 'displayAmount'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('displayAmount')}
                                                    >
                                                        AMOUNT
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell sortDirection={lotSortBy === 'displayQuantityShort' ? lotSortOrder : false} align="center">
                                                    <TableSortLabel
                                                        active={lotSortBy === 'displayQuantityShort'}
                                                        direction={lotSortOrder}
                                                        onClick={() => handleLotSort('displayQuantityShort')}
                                                    >
                                                        SHORT
                                                    </TableSortLabel>
                                                </TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loading && (
                                                <TableRow>
                                                    <TableCell colSpan={vendorType === 'washing' ? 8 : 7} align="center">
                                                        <CircularProgress size={20} />
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {!loading && lotsData.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={vendorType === 'washing' ? 8 : 7} align="center">
                                                        No lots found for this vendor
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {!loading && pagedLotsData.map((lot) => (
                                                <TableRow key={lot.isWashDetail ? `${lot._id}-${lot.washIndex}` : lot._id} hover>
                                                    <TableCell sx={{ fontSize: '0.85rem' }}>
                                                        {new Date(lot.date).toLocaleDateString('en-IN')}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                        {lot.lotNumber}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.85rem' }}>
                                                        {lot.clientName}
                                                    </TableCell>
                                                    {vendorType === 'washing' && (
                                                        <TableCell sx={{ fontSize: '0.85rem' }}>
                                                            {lot.isWashDetail ? (
                                                                <Box>
                                                                    <div style={{ fontWeight: 'bold' }}>{lot.washDetail.washColor}</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>{lot.washDetail.washCreation}</div>
                                                                </Box>
                                                            ) : (
                                                                '-'
                                                            )}
                                                        </TableCell>
                                                    )}
                                                    <TableCell align="center" sx={{ fontSize: '0.85rem' }}>
                                                        {lot.displayQuantity}
                                                    </TableCell>
                                                    <TableCell align="center" sx={{ fontSize: '0.85rem' }}>
                                                        {lot.displayRate}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                        {formatCurrency(lot.displayAmount)}
                                                    </TableCell>
                                                    <TableCell align="center"
                                                        sx={{
                                                            fontSize: '0.85rem',
                                                            fontWeight: lot.displayQuantityShort > 0 ? 'bold' : 'normal',
                                                            color: lot.displayQuantityShort > 0 && 'red'
                                                        }}
                                                    >
                                                        {lot.displayQuantityShort}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <TablePagination
                                    component="div"
                                    count={lotsData.length}
                                    page={lotPage}
                                    onPageChange={handleChangeLotPage}
                                    rowsPerPage={lotRowsPerPage}
                                    onRowsPerPageChange={handleChangeLotRowsPerPage}
                                    rowsPerPageOptions={[5, 10, 25]}
                                />
                            </Paper>
                        </Grid>

                        {/* Right Column: Payment History */}
                        <Grid size={{ xs: 12, md: 6 }}>
                            <Paper elevation={1} sx={{ borderRadius: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column'}}>
                                <Box sx={{ p: 1, pl: 2, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                        Payment History
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<FileDownloadIcon />}
                                        onClick={exportPaymentsToExcel}
                                        disabled={!paymentEntries.length}
                                        sx={{ mr: 1 }}
                                    >
                                        Export Excel
                                    </Button>
                                </Box>
                                <TableContainer component={Paper}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sortDirection={paymentSortBy === 'paymentDate' ? paymentSortOrder : false}>
                                                    <TableSortLabel
                                                        active={paymentSortBy === 'paymentDate'}
                                                        direction={paymentSortOrder}
                                                        onClick={() => handlePaymentSort('paymentDate')}
                                                    >
                                                        DATE
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell>LOT</TableCell>
                                                <TableCell sortDirection={paymentSortBy === 'paymentType' ? paymentSortOrder : false}>
                                                    <TableSortLabel
                                                        active={paymentSortBy === 'paymentType'}
                                                        direction={paymentSortOrder}
                                                        onClick={() => handlePaymentSort('paymentType')}
                                                    >
                                                        TYPE
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell align="center" sortDirection={paymentSortBy === 'amount' ? paymentSortOrder : false}>
                                                    <TableSortLabel
                                                        active={paymentSortBy === 'amount'}
                                                        direction={paymentSortOrder}
                                                        onClick={() => handlePaymentSort('amount')}
                                                    >
                                                        AMOUNT
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell><strong>NOTES</strong></TableCell>
                                                <TableCell><strong>ACTIONS</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loading && (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">
                                                        <CircularProgress size={20} />
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {!loading && paymentEntries.length === 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">
                                                        No payment entries found
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                            {!loading && pagedPaymentEntries.map((entry) => (
                                                <TableRow key={entry._id} hover>
                                                    <TableCell sx={{ fontSize: '0.85rem' }}>
                                                        {new Date(entry.paymentDate).toLocaleDateString('en-IN')}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.85rem' }}>
                                                        {entry.lotId?.lotNumber || '-'}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.85rem' }}>
                                                        <Chip
                                                            label={entry.paymentType === 'payment' ? 'Payment' : 'Short Adj'}
                                                            size="small"
                                                            color={entry.paymentType === 'payment' ? 'primary' : 'secondary'}
                                                            variant="outlined"
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontSize: '0.85rem', fontWeight: 'bold' }}>
                                                        {formatCurrency(entry.amount)}
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.85rem', maxWidth: 150 }}>
                                                        <div style={{
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            {entry.notes || '-'}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell align="center" sx={{ fontSize: '0.85rem' }}>
                                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                            <Tooltip title={entry.paymentType === 'payment' ? 'Edit Payment' : 'Edit Adjustment'} placement='bottom' arrow>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => entry.paymentType === 'payment' ? handleEditPayment(entry) : handleEditShortAdjustment(entry)}
                                                                    sx={{
                                                                        outline: 'none',
                                                                        "&.MuiButtonBase-root:hover": { bgcolor: "transparent" }
                                                                    }}
                                                                >
                                                                    <EditIcon fontSize='small' />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title={entry.paymentType === 'payment' ? 'Delete Payment' : 'Delete Adjustment'} placement='bottom' arrow>
                                                                <IconButton
                                                                    size="small"
                                                                    onClick={() => entry.paymentType === 'payment' ? handleDeletePayment(entry._id) : handleDeleteShortAdjustment(entry._id)}
                                                                    sx={{
                                                                        outline: 'none',
                                                                        "&.MuiButtonBase-root:hover": { bgcolor: "transparent" }
                                                                    }}
                                                                >
                                                                    <DeleteIcon fontSize='small' />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <TablePagination
                                    component="div"
                                    count={paymentEntries.length}
                                    page={paymentPage}
                                    onPageChange={handleChangePaymentPage}
                                    rowsPerPage={paymentRowsPerPage}
                                    onRowsPerPageChange={handleChangePaymentRowsPerPage}
                                    rowsPerPageOptions={[5, 10, 25]}
                                />
                            </Paper>
                        </Grid>
                    </Grid>
                </>
            )}

            {/* Payment Dialog */}
            <Modal 
                open={paymentDialogOpen} 
                onClose={() => setPaymentDialogOpen(false)}
                aria-labelledby="payment-modal"
                aria-describedby="modal-to-add-vendor-payment"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <Box
                    sx={{
                        ml: isMobile ? 0 : drawerWidth + 'px',
                        width: isMobile ? '85%' : '25%',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 24,
                        p: 4,
                    }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" id="payment-modal">{isPaymentEditMode ? 'Edit Vendor Payment' : 'Add Vendor Payment'}</Typography>
                        <IconButton onClick={() => setPaymentDialogOpen(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    <form onSubmit={handlePaymentSubmit(submitPayment)}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12, md: 12 }}>
                                <LocalizationProvider dateAdapter={AdapterDayjs}>
                                    <Controller
                                        name="paymentDate"
                                        control={paymentControl}
                                        rules={{ required: 'Payment date is required' }}
                                        render={({ field }) => (
                                            <DatePicker
                                                {...field}
                                                label="Payment Date"
                                                format="DD-MMM-YYYY"
                                                slots={{ textField: MorphDateTextField }}
                                                sx={{ width: '-webkit-fill-available' }}
                                                onChange={(value) => field.onChange(value)}
                                                slotProps={{
                                                    textField: {
                                                        error: !!paymentErrors.paymentDate,
                                                        helperText: paymentErrors.paymentDate?.message,
                                                        variant: 'standard'
                                                    },
                                                }}
                                            />
                                        )}
                                    />
                                </LocalizationProvider>
                            </Grid>

                            <Grid size={{ xs: 12, md: 12 }}>
                                <Controller
                                    name="amount"
                                    control={paymentControl}
                                    rules={{
                                        required: 'Amount is required',
                                        pattern: {
                                            value: /^-?\d+(\.\d{1,2})?$/,
                                            message: 'Please enter a valid amount',
                                        },
                                    }}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Amount"
                                            fullWidth
                                            margin="normal"
                                            variant="standard"
                                            error={!!paymentErrors.amount}
                                            helperText={paymentErrors.amount?.message}
                                        />
                                    )}
                                />
                            </Grid>

                            <Grid size={{ xs: 12 }}>
                                <Controller
                                    name="notes"
                                    control={paymentControl}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Notes"
                                            fullWidth
                                            margin="normal"
                                            variant="standard"
                                            multiline
                                            rows={3}
                                        />
                                    )}
                                />
                            </Grid>

                            {summary && (
                                <Grid size={{ xs: 12 }}>
                                    <Box sx={{ p: 2, borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                            <strong>Total Amount Due:</strong> {formatCurrency(summary.totalAmount)}
                                        </Typography>
                                        <Typography variant="body2" sx={{ mb: 1 }}>
                                            <strong>Already Paid:</strong> {formatCurrency(summary.totalPayment)}
                                        </Typography>
                                        <Typography variant="body2">
                                            <strong>Remaining Balance:</strong> {formatCurrency(summary.totalBalance)}
                                        </Typography>
                                    </Box>
                                </Grid>
                            )}

                            <Grid size={{ xs: 12, md: 6 }}>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => setPaymentDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                            </Grid>

                            <Grid size={{ xs: 12, md: 6 }}>
                                <Button
                                    type="submit"
                                    fullWidth
                                    endIcon={<SaveIcon />}
                                    loading={paymentDialogLoading}
                                    loadingPosition="end"
                                    variant="contained"
                                >
                                    {isPaymentEditMode ? 'Update Payment' : 'Record Payment'}
                                </Button>
                            </Grid>
                        </Grid>
                    </form>
                </Box>
            </Modal>

            {/* Short Adjustment Dialog */}
            <Modal 
                open={shortDialogOpen} 
                onClose={() => setShortDialogOpen(false)}
                aria-labelledby="short-modal"
                aria-describedby="modal-to-add-short-adjustment"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <Box
                    sx={{
                        ml: isMobile ? 0 : drawerWidth + 'px',
                        width: isMobile ? '85%' : '25%',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        bgcolor: 'background.paper',
                        borderRadius: 2,
                        boxShadow: 24,
                        p: 4,
                    }}
                >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6" id="short-modal">{isShortEditMode ? 'Edit Vendor Short Adjustment' : 'Add Vendor Short Adjustment'}</Typography>
                        <IconButton onClick={() => setShortDialogOpen(false)}>
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    <form onSubmit={handleShortSubmit(submitShortAdjustment)}>
                        <Grid container spacing={2}>
                            <Grid size={{ xs: 12 }}>
                                <Controller
                                    name="lotId"
                                    control={shortControl}
                                    rules={{ required: 'Lot is required' }}
                                    render={({ field }) => (
                                        <FormControl fullWidth margin="normal" error={!!shortErrors.lotId}>
                                            <InputLabel>Lot (Short)</InputLabel>
                                            <Select
                                                {...field}
                                                label="Lot (Short)"
                                                variant="standard"
                                            >
                                                {lotsData.filter(lot => lot.quantityShort > 0).length === 0 ? (
                                                    <MenuItem value="">No lots with short pending</MenuItem>
                                                ) : (
                                                    lotsData.filter(lot => lot.quantityShort > 0).map((lot) => (
                                                        <MenuItem key={lot._id} value={lot._id}>
                                                            {lot.lotNumber} ({lot.quantityShort} short)
                                                        </MenuItem>
                                                    ))
                                                )}
                                            </Select>
                                            {shortErrors.lotId && <Typography color="error" variant="caption">{shortErrors.lotId.message}</Typography>}
                                        </FormControl>
                                    )}
                                />
                            </Grid>

                            <Grid size={{ xs: 12, md: 12 }}>
                                <LocalizationProvider dateAdapter={AdapterDayjs}>
                                    <Controller
                                        name="paymentDate"
                                        control={shortControl}
                                        rules={{ required: 'Payment date is required' }}
                                        render={({ field }) => (
                                            <DatePicker
                                                {...field}
                                                label="Payment Date"
                                                format="DD-MMM-YYYY"
                                                slots={{ textField: MorphDateTextField }}
                                                sx={{ width: '-webkit-fill-available' }}
                                                onChange={(value) => field.onChange(value)}
                                                slotProps={{
                                                    textField: {
                                                        error: !!shortErrors.paymentDate,
                                                        helperText: shortErrors.paymentDate?.message,
                                                        variant: 'standard'
                                                    },
                                                }}
                                            />
                                        )}
                                    />
                                </LocalizationProvider>
                            </Grid>

                            <Grid size={{ xs: 12, md: 12 }}>
                                <Controller
                                    name="quantity"
                                    control={shortControl}
                                    rules={{
                                        required: 'Short quantity is required',
                                        pattern: {
                                            value: /^\d+$/,
                                            message: 'Only numbers allowed',
                                        },
                                    }}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Short Quantity"
                                            fullWidth
                                            margin="normal"
                                            variant="standard"
                                            error={!!shortErrors.quantity}
                                            helperText={shortErrors.quantity?.message}
                                        />
                                    )}
                                />
                            </Grid>

                            <Grid size={{ xs: 12, md: 12 }}>
                                <Controller
                                    name="rate"
                                    control={shortControl}
                                    rules={{
                                        required: 'Rate is required',
                                        pattern: {
                                            value: /^\d+(\.\d{1,2})?$/,
                                            message: 'Please enter a valid rate',
                                        },
                                    }}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Rate per PCS"
                                            fullWidth
                                            margin="normal"
                                            variant="standard"
                                            error={!!shortErrors.rate}
                                            helperText={shortErrors.rate?.message}
                                        />
                                    )}
                                />
                            </Grid>

                            <Grid size={{ xs: 12 }}>
                                <Controller
                                    name="notes"
                                    control={shortControl}
                                    render={({ field }) => (
                                        <TextField
                                            {...field}
                                            label="Notes"
                                            fullWidth
                                            margin="normal"
                                            variant="standard"
                                            multiline
                                            rows={2}
                                        />
                                    )}
                                />
                            </Grid>

                            {shortQuantity && shortRate && (
                                <Grid size={{ xs: 12 }}>
                                    <Box sx={{ p: 2, backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5', borderRadius: 1, border: `1px solid ${theme.palette.divider}` }}>
                                        <Typography variant="body2">
                                            <strong>Total Adjustment Amount:</strong>{' '}
                                            {formatCurrency(parseFloat(shortQuantity) * parseFloat(shortRate))}
                                        </Typography>
                                    </Box>
                                </Grid>
                            )}

                            <Grid size={{ xs: 12, md: 6 }}>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => setShortDialogOpen(false)}
                                >
                                    Cancel
                                </Button>
                            </Grid>

                            <Grid size={{ xs: 12, md: 6 }}>
                                <Button
                                    type="submit"
                                    fullWidth
                                    endIcon={<SaveIcon />}
                                    loading={shortDialogLoading}
                                    loadingPosition="end"
                                    variant="contained"
                                >
                                    {isShortEditMode ? 'Update Adjustment' : 'Record Adjustment'}
                                </Button>
                            </Grid>
                        </Grid>
                    </form>
                </Box>
            </Modal>

            <Dialog
                open={deleteDialogOpen}
                onClose={() => setDeleteDialogOpen(false)}
                aria-labelledby="delete-confirm-dialog-title"
                aria-describedby="delete-confirm-dialog-description"
            >
                <DialogTitle id="delete-confirm-dialog-title">Confirm Delete</DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-confirm-dialog-description">
                        {deleteTarget.type === 'payment'
                            ? 'Do you really want to delete this payment record? This action cannot be undone.'
                            : 'Do you really want to delete this short adjustment record? This action cannot be undone.'}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button onClick={confirmDelete} variant="contained" color="error">
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
};

export default VendorPaymentManagement;

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Collapse, IconButton, Chip, Typography, useTheme, Grid, Select, MenuItem, Menu, Divider } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList, LocalLaundryService, ContentCut, Add, MoreVert as MoreVertIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import WashingGrid from '../Washing/WashingGrid';
import OrderStatusChip from '../../components/OrderStatusChip';
import { grey } from '@mui/material/colors';

function StitchingGridSx({
  processedRecords,
  washingRecords,
  fetchWashingRecords,
  handleUpdateStitchOut,
  handleUpdateWashOut,
  setOpenWashingModal,
  setSelectedLot,
  expandedRows,
  toggleRowExpansion,
  onEditStitching,
  onEditWashing,
  sortBy,
  setSortBy,
  sortDirection,
  setSortDirection,
  filterAnchorEl,
  setFilterAnchorEl,
  filterStatus,
  setFilterStatus,
  searchTerm
}) {
  const theme = useTheme();
  const [mobileExpandedRows, setMobileExpandedRows] = useState({});
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [selectedRecordId, setSelectedRecordId] = useState(null);

  useEffect(() => {
    if (processedRecords && Array.isArray(processedRecords)) {
      processedRecords.forEach(record => {
        if (record.lotId?._id && !(washingRecords && washingRecords[record.lotId._id])) {
          fetchWashingRecords(record.lotId._id);
        }
      });
    }
  }, [processedRecords, washingRecords, fetchWashingRecords]);

  const toggleMobileRowExpansion = (rowId) => {
    setMobileExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
    toggleRowExpansion(rowId);
  };

  // Apply filtering based on searchTerm and filterStatus
  const filteredRecords = useMemo(() => {
    if (!processedRecords || !Array.isArray(processedRecords)) return processedRecords;
    let result = processedRecords;

    // Apply search term filter
    if (searchTerm) {
      result = result.filter(record =>
        record.lotId?.lotNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.lotId?.invoiceNumber?.toString().toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.vendorId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply status filter
    if (filterStatus) {
      result = result.filter(record => {
        if (filterStatus === 'completed') {
          return !!record.stitchOutDate; // Records with a stitchOutDate
        } else if (filterStatus === 'pending') {
          return !record.stitchOutDate; // Records without a stitchOutDate
        }
        return true; // 'all' or unknown filter
      });
    }

    return result;
  }, [processedRecords, searchTerm, filterStatus]);

  const handleMenuOpen = (event, recordId) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedRecordId(recordId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedRecordId(null);
  };

  const handleEditStitching = (record) => {
    onEditStitching(record);
    handleMenuClose();
  };

  const handleAddWashing = (record) => {
    setSelectedLot({
      lotNumber: record.lotId?.lotNumber || '',
      lotId: record.lotId?._id || '',
      invoiceNumber: record.lotId?.invoiceNumber || '',
      lotQuantity: record.quantity
    });
    setOpenWashingModal(true);
    handleMenuClose();
  };

  return (
    <Box sx={{ pt: 1 }}>
      <Grid container spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
        <Grid item xs={12} sm={6} md={4}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Select
              variant="standard"
              size="small"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setSortDirection('asc');
              }}
            >
              <MenuItem dense value="lotNumber">Lot #</MenuItem>
              <MenuItem dense value="invoiceNumber">Invoice #</MenuItem>
              <MenuItem dense value="status">Status</MenuItem>
              <MenuItem dense value="date">Date</MenuItem>
              <MenuItem dense value="vendorName">Vendor</MenuItem>
              <MenuItem dense value="quantity">Quantity</MenuItem>
              <MenuItem dense value="quantityShort">QTY Short</MenuItem>
              <MenuItem dense value="rate">Rate</MenuItem>
            </Select>
            <IconButton
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              sx={{ ml: 1 }}
            >
              {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
            </IconButton>
            <IconButton
              onClick={(e) => setFilterAnchorEl(e.currentTarget)}
            >
              <FilterList />
            </IconButton>
            <Menu
              anchorEl={filterAnchorEl}
              open={Boolean(filterAnchorEl)}
              onClose={() => setFilterAnchorEl(null)}
            >
              <MenuItem dense onClick={() => { setFilterStatus(''); setFilterAnchorEl(null); }}>All</MenuItem>
              <MenuItem dense onClick={() => { setFilterStatus('completed'); setFilterAnchorEl(null); }}>Completed</MenuItem>
              <MenuItem dense onClick={() => { setFilterStatus('pending'); setFilterAnchorEl(null); }}>Pending</MenuItem>
            </Menu>
          </Stack>
        </Grid>
      </Grid>
      {!filteredRecords ? (
        <OrderCardsLoader type="stitching" />
      ) : filteredRecords.length > 0 ? (
        filteredRecords.map((record) => (
          <Card key={record._id} variant="outlined" sx={{ p: 1.3, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {record.lotId?.lotNumber || 'N/A'}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ mt: 0.5 }}>
                  <OrderStatusChip status={record.lotId?.status} />
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'right' }}>
                  <IconButton onClick={() => toggleMobileRowExpansion(record._id)} size="small">
                    <ExpandMoreIcon sx={{ transform: mobileExpandedRows[record._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </IconButton>
                  <IconButton
                    onClick={(e) => handleMenuOpen(e, record._id)}
                    size="small"
                    sx={{ padding: 0 }}
                  >
                    <MoreVertIcon fontSize='small' />
                  </IconButton>
                  <Menu
                    anchorEl={menuAnchorEl}
                    open={Boolean(menuAnchorEl) && selectedRecordId === record._id}
                    onClose={handleMenuClose}
                    slotProps={{
                      paper: {
                        sx: {
                          boxShadow: theme.shadows[3],
                        }
                      },
                      list: {
                        sx: { py: 0 }
                      }
                    }}
                  >
                    <MenuItem dense divider sx={{ p: 1, justifyContent: 'center' }} onClick={() => handleEditStitching(record)}>
                      <EditIcon fontSize='small' sx={{ mr: 0.4, fontSize: '16px' }} />
                      <ContentCut fontSize='small' sx={{ fontSize: '15px' }} />
                    </MenuItem>
                    <MenuItem dense divider sx={{ p: 1, justifyContent: 'center' }} onClick={() => handleAddWashing(record)}>
                      <Add fontSize='small' sx={{ mr: 0.4, fontSize: '16px' }} />
                      <LocalLaundryService fontSize='small' sx={{ fontSize: '15px' }} />
                    </MenuItem>
                  </Menu>
                </Grid>
              </Grid>
              <Stack spacing={1} sx={{ mt: 1 }}>
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Date</strong><br />
                      {getFormattedDate(record.date)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <Typography variant="body2">
                      <strong>Vendor</strong><br />
                      {record.vendorId?.name || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <Typography variant="body2">
                      <strong>Quantity</strong><br />
                      {record.quantity}
                    </Typography>
                  </Grid>
                </Grid>
              </Stack>
              <Collapse in={mobileExpandedRows[record._id]}>
                <Grid container spacing={1} sx={{ mt: 2, textAlign: 'center' }}>
                  <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Invoice #</strong><br />
                      {record.lotId?.invoiceNumber || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <Typography variant="body2">
                      <strong>Qty Short</strong><br />
                      {record.quantityShort}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }}>
                    <Typography variant="body2">
                      <strong>Rate</strong><br />
                      {record.rate}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Stitch Out</strong><br />
                      {record.stitchOutDate ? getFormattedDate(record.stitchOutDate) : 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left', pt: 1 }}>
                    <Typography variant="body2">
                      <WashingGrid
                        washingRecords={washingRecords && washingRecords[record.lotId?._id] || []}
                        lotId={record.lotId?._id}
                        handleUpdateWashOut={handleUpdateWashOut}
                        onEditWashing={onEditWashing}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                        sortDirection={sortDirection}
                        setSortDirection={setSortDirection}
                        filterAnchorEl={filterAnchorEl}
                        setFilterAnchorEl={setFilterAnchorEl}
                        filterStatus={filterStatus}
                        setFilterStatus={setFilterStatus}
                      />
                    </Typography>
                  </Grid>
                </Grid>
              </Collapse>
            </CardContent>
          </Card>
        ))
      ) : (
        'No records found'
      )}
    </Box>
  );
}

export default StitchingGridSx;
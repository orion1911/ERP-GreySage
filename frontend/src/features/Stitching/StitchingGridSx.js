import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Card, CardContent, Stack, Collapse, IconButton, Chip, Typography, useTheme, Grid, Select, MenuItem, Menu, Link, TablePagination } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList, LocalLaundryService, ContentCut, Add, MoreVert as MoreVertIcon, AutoAwesome } from '@mui/icons-material';
import { motion, AnimatePresence } from 'motion/react';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import WashingGrid from '../Washing/WashingGrid';
import FinishingGrid from '../Finishing/FinishingGrid';
import OrderStatusChip from '../../components/OrderStatusChip';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MorphDateIconField } from '../../components/MuiCustom';


function StitchingGridSx({
  processedRecords,
  totalCount,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  washingRecords,
  finishingRecords,
  fetchWashingRecords,
  fetchFinishingRecords,
  handleUpdateStitchOut,
  handleUpdateWashOut,
  handleUpdateFinishOut,
  setOpenWashingModal,
  setOpenFinishingModal,
  setSelectedLot,
  expandedRows,
  toggleRowExpansion,
  onEditStitching,
  onEditWashing,
  onEditFinishing,
  sortBy,
  setSortBy,
  sortDirection,
  setSortDirection,
  filterAnchorEl,
  setFilterAnchorEl,
  filterStatus,
  setFilterStatus,
  readOnly = false
}) {
  const theme = useTheme();
  const [mobileExpandedRows, setMobileExpandedRows] = useState({});
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [selectedRecordId, setSelectedRecordId] = useState(null);

  useEffect(() => {
    if (processedRecords && Array.isArray(processedRecords)) {
      processedRecords.forEach(record => {
        if (record.lotId?._id) {
          if (!(washingRecords && washingRecords[record.lotId._id])) {
            fetchWashingRecords(record.lotId._id);
          }
          if (!(finishingRecords && finishingRecords[record.lotId._id])) {
            fetchFinishingRecords(record.lotId._id);
          }
        }
      });
    }
  }, [processedRecords, washingRecords, finishingRecords, fetchWashingRecords, fetchFinishingRecords]);

  const toggleMobileRowExpansion = (rowId) => {
    setMobileExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
    toggleRowExpansion(rowId);
  };

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
      lotQuantity: record.quantity - (record.quantityShort || 0)
    });
    setOpenWashingModal(true);
    handleMenuClose();
  };

  const handleAddFinishing = (record) => {
    setSelectedLot({
      lotNumber: record.lotId?.lotNumber || '',
      lotId: record.lotId?._id || '',
      invoiceNumber: record.lotId?.invoiceNumber || '',
      lotQuantity: record.quantity
    });
    setOpenFinishingModal(true);
    handleMenuClose();
  };

  return (
    <Box sx={{ pt: 1 }}>
      <Grid container spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
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
      {!processedRecords ? (
        <OrderCardsLoader type="stitching" />
      ) : processedRecords.length > 0 ? (
        processedRecords.map((record) => (
          <Card key={record._id} variant="outlined" sx={{ p: 1.3, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {record.lotId?.lotNumber || 'N/A'}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {readOnly && (
                      <Link
                        component={RouterLink}
                        to={`/stitching/${record.orderId?._id || ''}`}
                        underline="none"
                        sx={{ cursor: 'pointer' }}
                      >
                        {record.orderId?.orderId || '—'}
                      </Link>
                    )}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ mt: 0.5 }}>
                  <OrderStatusChip status={record.lotId?.status} />
                </Grid>
                <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'right' }}>
                  <IconButton onClick={() => toggleMobileRowExpansion(record._id)} size="small">
                    <ExpandMoreIcon sx={{ transform: mobileExpandedRows[record._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                  </IconButton>
                  {!readOnly && (
                    <>
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
                        <MenuItem dense divider sx={{ p: 1, justifyContent: 'center' }} onClick={() => handleAddFinishing(record)}>
                          <Add fontSize='small' sx={{ mr: 0.4, fontSize: '16px' }} />
                          <AutoAwesome fontSize='small' sx={{ fontSize: '15px' }} />
                        </MenuItem>
                      </Menu></>)}
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
                <AnimatePresence>
                  {mobileExpandedRows[record._id] && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    >
                    <Grid container spacing={1} sx={{ mt: 2, textAlign: 'center' }}>
                      <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                        <Typography variant="body2">
                          <strong>Invoice #</strong><br />
                          {record.lotId?.invoiceNumber || 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 4 }}>
                        <Typography variant="body2">
                          <strong>Client</strong><br />
                          {record.orderId?.clientId?.name || 'N/A'}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 4 }}>
                        <Typography variant="body2">
                          <strong>Qty Short</strong><br />
                          {record.quantityShort}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                        <Typography variant="body2">
                          <strong>Rate</strong><br />
                          {record.rate}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 4, sm: 4 }}>
                        <Typography variant="body2">
                          <strong>Stitch Out</strong><br />
                          {readOnly ? (getFormattedDate(record.stitchOutDate)) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                              {record.stitchOutDate && getFormattedDate(record.stitchOutDate)}
                              <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <MorphDateIconField
                                  value={null}
                                  onChange={(e) => handleUpdateStitchOut(record._id, e)}
                                />
                              </LocalizationProvider>
                            </div>)}
                        </Typography>
                      </Grid>
                      <Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left' }}>
                        <Typography variant="body2">
                          <strong>Threads: </strong>
                          {record.threadColors.map((tc, index) => (
                            <div key={index} style={{ display: 'inline-flex' }}>
                              <Box key={index} component="span" sx={{ display: 'block' }}>
                                {tc.color} - {tc.quantity} pcs
                              </Box>
                              <span>{index < record.threadColors.length - 1 ? '\u00A0' +'|'+ '\u00A0' : ''}</span>
                            </div>
                          ))}
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
                            readOnly={readOnly}
                          />
                        </Typography>
                      </Grid>
                      {finishingRecords && finishingRecords[record.lotId?._id]?.length > 0 && (<Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left', pt: 1 }}>
                        <Typography variant="body2">
                          <FinishingGrid
                            finishingRecords={finishingRecords && finishingRecords[record.lotId?._id] || []}
                            lotId={record.lotId?._id}
                            handleUpdateFinishOut={handleUpdateFinishOut}
                            onEditFinishing={onEditFinishing}
                            sortBy={sortBy}
                            setSortBy={setSortBy}
                            sortDirection={sortDirection}
                            setSortDirection={setSortDirection}
                            filterAnchorEl={filterAnchorEl}
                            setFilterAnchorEl={setFilterAnchorEl}
                            filterStatus={filterStatus}
                            setFilterStatus={setFilterStatus}
                            readOnly={readOnly}
                          />
                        </Typography>
                      </Grid>)}
                    </Grid>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Collapse>
            </CardContent>
          </Card>
        ))
      ) : (
        'No records found'
      )}
      {processedRecords && processedRecords.length > 0 && (
        <TablePagination
          component="div"
          count={totalCount || 0}
          page={page || 0}
          onPageChange={onPageChange}
          rowsPerPage={rowsPerPage || 25}
          onRowsPerPageChange={onRowsPerPageChange}
          rowsPerPageOptions={[10, 25, 50]}
        />
      )}
    </Box>
  );
}

export default StitchingGridSx;
import React from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Chip, Typography, useTheme, Grid, Select, MenuItem, Menu } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList, LocalLaundryService, Add } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import WashingGrid from '../Washing/WashingGrid';

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
  setFilterStatus
}) {
  const theme = useTheme();

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
              <MenuItem value="lotNumber">Sort By Lot Number</MenuItem>
              <MenuItem value="invoiceNumber">Sort By Invoice Number</MenuItem>
              <MenuItem value="date">Sort By Date</MenuItem>
              <MenuItem value="vendorName">Sort By Vendor</MenuItem>
              <MenuItem value="quantity">Sort By Quantity</MenuItem>
              <MenuItem value="quantityShort">Sort By Quantity Short</MenuItem>
              <MenuItem value="rate">Sort By Rate</MenuItem>
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
              <MenuItem onClick={() => { setFilterStatus(''); setFilterAnchorEl(null); }}>All</MenuItem>
            </Menu>
          </Stack>
        </Grid>
      </Grid>
      {!processedRecords ? (
        <OrderCardsLoader type="stitching" />
      ) : processedRecords.length > 0 ? (
        processedRecords.map((record) => (
          <Card key={record._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Stack>
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {record.lotId?.lotNumber || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 6, sm: 6 }} sx={{ textAlign: 'right' }}>
                    <IconButton
                      onClick={() => onEditStitching(record)}
                      size="small"
                    >
                      <EditIcon fontSize='small' />
                    </IconButton>
                    <IconButton
                      onClick={() => {
                        setSelectedLot({
                          lotNumber: record.lotId?.lotNumber || '',
                          lotId: record.lotId?._id || '',
                          invoiceNumber: record.lotId?.invoiceNumber || ''
                        });
                        setOpenWashingModal(true);
                      }}
                      size="small"
                    >
                      <Add fontSize='small' />
                      <LocalLaundryService fontSize='small' />
                    </IconButton>
                    <IconButton onClick={() => toggleRowExpansion(record._id)} size="small">
                      <ExpandMoreIcon sx={{ transform: expandedRows[record._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                    </IconButton>
                  </Grid>
                </Grid>
              </Stack>
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
              <Collapse in={expandedRows[record._id]}>
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
                      {/* <strong>Washing Records</strong><br /> */}
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
                  {/* <Grid size={{ xs: 12, sm: 12 }}>
                    <Button
                      variant="contained"
                      startIcon={<EditIcon />}
                      onClick={() => onEditStitching(record)}
                      size="small"
                      sx={{ mt: 1 }}
                      fullWidth
                    >
                      Edit
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={() => {
                        setSelectedLot({
                          lotNumber: record.lotId?.lotNumber || '',
                          lotId: record.lotId?._id || '',
                          invoiceNumber: record.lotId?.invoiceNumber || ''
                        });
                        setOpenWashingModal(true);
                      }}
                      size="small"
                      sx={{ mt: 1 }}
                      fullWidth
                    >
                      Add Washing
                    </Button>
                  </Grid> */}
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
import React from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Chip, Typography, useTheme, Grid, Select, MenuItem, Menu, Divider } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateIconField, MorphDateTextField } from '../../components/MuiCustom';
import { motion, AnimatePresence } from 'motion/react';

function WashingGridSx({
  processedRecords,
  hasWashing,
  lotId,
  handleUpdateWashOut,
  onEditWashing,
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
  const [expandedRows, setExpandedRows] = React.useState({});

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => ({
      ...prev,
      [rowId]: !prev[rowId]
    }));
  };

  return (
    <>
      <strong>WASHING</strong><br />
      <Divider />
      <Box sx={{ pt: 1 }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={!processedRecords ? 'loading' : 'data'}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {!processedRecords ? (
              <OrderCardsLoader type="washing" />
            ) : processedRecords.length > 0 ? (
              processedRecords.map((record, index) => (
                <Stack key={index} spacing={1} sx={{ mt: 1 }}>
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
                      {record.washOutDate ? (
                        <Typography variant="body2">
                          <strong>Wash Out</strong><br />
                          {readOnly ? (getFormattedDate(record.washOutDate)) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                              {getFormattedDate(record.washOutDate)}
                              <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <MorphDateIconField
                                  value={null}
                                  onChange={(e) => handleUpdateWashOut(lotId, record._id, e)}
                                />
                              </LocalizationProvider>
                            </div>)}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2">
                            <strong>Wash Out</strong><br />
                          </Typography>
                          {!readOnly &&
                          <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DatePicker
                              value={null}
                              onChange={(e) => handleUpdateWashOut(lotId, record._id, e)}
                              format='DD-MMM-YYYY'
                              slots={{ textField: MorphDateTextField }}
                              slotProps={{ textField: { variant: 'standard', size: 'small' } }}
                              sx={{ width: 165 }}
                            />
                          </LocalizationProvider>}
                        </>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, sm: 12 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Wash Details</strong><br />
                        <Grid container spacing={1} sx={{ mt: 1 }}>
                          {record.washDetails.map((wd, index) => (
                            // <Box key={index} sx={{ m: 1 }}>
                            <>
                              <Grid size={{ xs: 4, sm: 4 }}><Chip color="success" size="small" label={wd.washColor} /></Grid>
                              <Grid size={{ xs: 8, sm: 8 }}><Chip color="success" size="small" label={wd.washCreation} /></Grid>
                              <Grid size={{ xs: 4, sm: 4 }}><Chip color="success" size="small" label={`QTY: ${wd.quantity}`} /></Grid>
                              <Grid size={{ xs: 8, sm: 8 }}><Chip color="warning" size="small" label={`QTY SHORT: ${wd.quantityShort ?? 0}`} /></Grid>
                              <Grid size={{ xs: 12, sm: 12 }}><Divider /></Grid>
                            </>
                          ))}
                        </Grid>
                      </Typography>
                    </Grid>
                    {!readOnly && <Grid size={{ xs: 12, sm: 12 }}>
                      <Button
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => onEditWashing(record)}
                        size="small"
                        sx={{ mt: 1 }}
                        fullWidth
                      >
                        Edit Washing
                      </Button>
                    </Grid>}
                  </Grid>
                </Stack>
              ))
            ) : (
              'No records found'
            )}
          </motion.div>
        </AnimatePresence>
      </Box>
    </>
  );
}

export default WashingGridSx;
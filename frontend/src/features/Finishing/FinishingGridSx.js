import React from 'react';
import { Box, Card, CardContent, Stack, Button, Typography, useTheme, Grid, Divider } from '@mui/material';
import { Edit as EditIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateIconField, MorphDateTextField } from '../../components/MuiCustom';
import { motion, AnimatePresence } from 'motion/react';

function FinishingGridSx({
  processedRecords,
  hasFinishing,
  lotId,
  handleUpdateFinishOut,
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

  return (
    <>
      <strong>FINISHING</strong><br />
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
              <OrderCardsLoader type="finishing" />
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
                      <Typography variant="body2">
                        <strong>Quantity</strong><br />
                        {record.quantity}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'left' }}>
                      <Typography variant="body2">
                        <strong>Qty Short</strong><br />
                        {record.quantityShort ?? 0}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 4, sm: 4 }}>
                      <Typography variant="body2">
                        <strong>Rate</strong><br />
                        {record.rate}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 4, sm: 4 }}>
                      {record.finishOutDate ? (
                        <Typography variant="body2">
                          <strong>Finish Out</strong><br />
                          {readOnly ? (getFormattedDate(record.finishOutDate)) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                              {getFormattedDate(record.finishOutDate)}
                              <LocalizationProvider dateAdapter={AdapterDayjs}>
                                <MorphDateIconField
                                  value={null}
                                  onChange={(e) => handleUpdateFinishOut(lotId, record._id, e)}
                                />
                              </LocalizationProvider>
                            </div>)}
                        </Typography>
                      ) : (
                        <>
                          <Typography variant="body2">
                            <strong>Finish Out</strong><br />
                          </Typography>
                          {!readOnly &&
                          <LocalizationProvider dateAdapter={AdapterDayjs}>
                            <DatePicker
                              value={null}
                              onChange={(e) => handleUpdateFinishOut(lotId, record._id, e)}
                              format='DD-MMM-YYYY'
                              slots={{ textField: MorphDateTextField }}
                              slotProps={{ textField: { variant: 'standard', size: 'small' } }}
                              sx={{ width: 165 }}
                            />
                          </LocalizationProvider>}
                        </>
                      )}
                    </Grid>
                    {!readOnly && <Grid size={{ xs: 12, sm: 12 }}>
                      <Button
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => onEditFinishing(record)}
                        size="small"
                        sx={{ mt: 1 }}
                        fullWidth
                      >
                        Edit Finishing
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

export default FinishingGridSx;
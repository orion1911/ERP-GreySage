import React from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Chip, Typography, useTheme, Grid, Select, MenuItem, Menu, Divider } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';

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
  setFilterStatus
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
      <strong>Washing Records</strong><br />
      <Divider fullWidth />
      <Box sx={{ pt: 1 }}>
        {!processedRecords ? (
          <OrderCardsLoader type="washing" />
        ) : processedRecords.length > 0 ? (
          processedRecords.map((record) => (
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
                    <strong>Wash Out</strong><br />
                    {getFormattedDate(record.washOutDate)}
                  </Typography>
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
                          <Grid size={{ xs: 12, sm: 12 }}><Divider fullWidth /></Grid>
                        </>
                      ))}
                    </Grid>
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 12 }}>
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
                </Grid>
              </Grid>
            </Stack>
          ))
        ) : (
          'No records found'
        )}
      </Box>
    </>
  );
}

export default WashingGridSx;
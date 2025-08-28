import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Typography, Stack, Box, IconButton, Chip, Grid, Select, MenuItem, Menu, Divider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import { Edit as EditIcon, ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { NoRecordRow, TableRowsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import WashingGridSx from './WashingGridSx';

function WashingGrid({ washingRecords, hasWashing, lotId, handleUpdateWashOut, onEditWashing, sortBy, setSortBy, sortDirection, setSortDirection, filterAnchorEl, setFilterAnchorEl, filterStatus, setFilterStatus, readOnly = false }) {
  const theme = useTheme();
  const { isMobile } = useOutletContext();

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return undefined;
    return [...data].sort((a, b) => {
      let valueA, valueB;
      if (sortKey === 'date') {
        valueA = new Date(a.date);
        valueB = new Date(b.date);
      } else if (sortKey === 'vendorName') {
        valueA = a.vendorId?.name || '';
        valueB = b.vendorId?.name || '';
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueB);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const processedRecords = useMemo(() => {
    let filtered = washingRecords;
    return sortData(filtered, sortBy, sortDirection);
  }, [washingRecords, sortBy, sortDirection]);

  return isMobile ? (
    <WashingGridSx
      processedRecords={processedRecords}
      hasWashing={hasWashing}
      lotId={lotId}
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
  ) : (
    <>
      {/* <strong>Washing Records</strong><br /> */}
      <Box sx={{ p: 0, pl: 0 }}>
        <TableContainer>
          <Table sx={{ backgroundColor: theme.palette.background.default }}>
            <TableHead>
              <TableRow>
                <TableCell align='center' sx={{ paddingTop: 0.3, paddingBottom: 0.3 }}></TableCell>
                <TableCell align='center' sx={{ paddingTop: 0.3, paddingBottom: 0.3 }}>DATE</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>VENDOR</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>WASH DETAIL</TableCell>
                <TableCell align='center' sx={{ whiteSpace: 'nowrap', paddingTop: 0, paddingBottom: 0 }}>WASH OUT</TableCell>
                {!readOnly && <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>ACTIONS</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {!processedRecords ? (
                <TableRowsLoader colsNum={5} rowsNum={5} />
              ) : processedRecords.length > 0 ? (
                processedRecords.map((wr, idx) => (
                  <TableRow key={wr._id}>
                    <TableCell></TableCell>
                    <TableCell align='center' sx={{ borderBottom: idx != processedRecords.length && 0, paddingTop: 0, paddingBottom: 0 }}>{getFormattedDate(wr.date)}</TableCell>
                    <TableCell align='center' sx={{ borderBottom: idx != processedRecords.length && 0, paddingTop: 0, paddingBottom: 0 }}>{wr.vendorId?.name || 'N/A'}</TableCell>
                    <TableCell width="50%" sx={{ borderBottom: idx != processedRecords.length && 0, paddingTop: 0, paddingBottom: 0 }}>
                      <Grid container spacing={0.5} sx={{ mt: 1.5, mb: 1.5 }}>
                        {wr.washDetails.map((wd, index) => (
                          <React.Fragment key={index}>
                            <Grid size={{ sm: 2, md: 2 }}><Chip color="success" size="small" label={wd.washColor} /></Grid>
                            <Grid size={{ sm: 2, md: 2 }}><Chip color="success" size="small" label={`QTY: ${wd.quantity}`} /></Grid>
                            <Grid size={{ sm: 2, md: 2 }}><Chip color="warning" size="small" label={`SHORT: ${wd.quantityShort ?? 0}`} /></Grid>
                            <Grid size={{ sm: 6, md: 6 }}><Chip color="success" size="small" label={wd.washCreation} /></Grid>
                            {index != wr.washDetails.length - 1 && <Grid size={{ sm: 12, md: 12 }}><Divider fullWidth /></Grid>}
                          </React.Fragment>
                        ))}
                      </Grid>
                    </TableCell>
                    <TableCell align='center' sx={{ borderBottom: idx != processedRecords.length && 0, paddingTop: 0, paddingBottom: 0 }}>
                      {/* {wr.washOutDate ?? getFormattedDate(wr.washOutDate)} */}
                      {wr.washOutDate ? (
                        getFormattedDate(wr.washOutDate)
                      ) : (
                        !readOnly &&
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            value={null}
                            onChange={(e) => handleUpdateWashOut(lotId, wr._id, e)}
                            format='DD-MMM-YYYY'
                            slots={{ textField: MorphDateTextField }}
                            sx={{ width: 165 }}
                          />
                        </LocalizationProvider>
                      )}
                    </TableCell>
                    {!readOnly && <TableCell align='center' sx={{ borderBottom: idx != processedRecords.length && 0, paddingTop: 0, paddingBottom: 0 }}>
                      <IconButton onClick={() => onEditWashing(wr)}>
                        <EditIcon fontSize='small' />
                      </IconButton>
                    </TableCell>}
                  </TableRow>
                ))
              ) : (
                <NoRecordRow />
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </>
  );
}

export default WashingGrid;
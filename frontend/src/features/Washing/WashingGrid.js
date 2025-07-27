import React, { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Typography, Stack, Box, IconButton, Chip, Grid, Select, MenuItem, Menu } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import { Edit as EditIcon, ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { NoRecordRow, TableRowsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import WashingGridSx from './WashingGridSx';

function WashingGrid({ washingRecords, hasWashing, lotId, handleUpdateWashOut, onEditWashing, sortBy, setSortBy, sortDirection, setSortDirection, filterAnchorEl, setFilterAnchorEl, filterStatus, setFilterStatus }) {
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
    />
  ) : (
    <>
      {/* <strong>Washing Records</strong><br /> */}
      <Box sx={{ p: 0, pl: 0 }}>
        <TableContainer>
          <Table>
            <TableHead>
              {/* <TableRow sx={{ backgroundColor: theme.palette.background.paper }}>
                <TableCell colSpan={5} sx={{ p: 0.5 }}>
                  <Grid container spacing={2} sx={{ justifyContent: 'flex-end' }}>
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
                          <MenuItem value="date">Sort By Date</MenuItem>
                          <MenuItem value="vendorName">Sort By Vendor</MenuItem>
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
                </TableCell>
              </TableRow> */}
              <TableRow>
                <TableCell align='center'>DATE</TableCell>
                <TableCell align='center'>VENDOR</TableCell>
                <TableCell align='center'>WASH DETAIL</TableCell>
                <TableCell align='center'>WASH OUT</TableCell>
                <TableCell align='center'>ACTIONS</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* {!processedRecords ? (
                <TableRowsLoader colsNum={5} rowsNum={5} />
              ) : processedRecords.length === 0 ? (
                <NoRecordRow />
              ) : ( */}
              {!processedRecords ? (
                <TableRowsLoader colsNum={5} rowsNum={5} />
              ) : processedRecords.length > 0 ? (
                processedRecords.map((wr) => (
                  <TableRow key={wr._id}>
                    <TableCell align='center'>{getFormattedDate(wr.date)}</TableCell>
                    <TableCell align='center'>{wr.vendorId?.name || 'N/A'}</TableCell>
                    <TableCell>
                      {wr.washDetails.map((wd, index) => (
                        <Box sx={{ m: 1, textAlign: 'center', alignContent: 'center', alignItems: 'center' }} key={index}>
                          <Chip color="success" size="small" sx={{ mr: 1 }} label={wd.washColor} />
                          <Chip color="success" size="small" sx={{ mr: 1 }} label={wd.washCreation} />
                          <Chip color="success" size="small" sx={{ mr: 1 }} label={`QTY: ${wd.quantity}`} />
                          <Chip color="warning" size="small" sx={{ mr: 1 }} label={`QTY SHORT: ${wd.quantityShort ?? 0}`} />
                        </Box>
                      ))}
                    </TableCell>
                    <TableCell align='center'>
                      {wr.washOutDate ? (
                        getFormattedDate(wr.washOutDate)
                      ) : (
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
                    <TableCell align='center'>
                      <IconButton onClick={() => onEditWashing(wr)}>
                        <EditIcon />
                      </IconButton>
                    </TableCell>
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
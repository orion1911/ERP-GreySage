import React, { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Typography, Box, IconButton } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateIconField, MorphDateTextField } from '../../components/MuiCustom';
import { Edit as EditIcon } from '@mui/icons-material';
import { NoRecordRow, TableRowsLoader } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import FinishingGridSx from './FinishingGridSx';
import { motion, AnimatePresence } from 'motion/react';

function FinishingGrid({ finishingRecords, hasFinishing, lotId, handleUpdateFinishOut, onEditFinishing, sortBy, setSortBy, sortDirection, setSortDirection, filterAnchorEl, setFilterAnchorEl, filterStatus, setFilterStatus, readOnly = false }) {
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
      } else if (sortKey === 'quantity') {
        valueA = a.quantity || 0;
        valueB = b.quantity || 0;
      } else if (sortKey === 'quantityShort') {
        valueA = a.quantityShort || 0;
        valueB = b.quantityShort || 0;
      } else if (sortKey === 'rate') {
        valueA = a.rate || 0;
        valueB = b.rate || 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueB);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const processedRecords = useMemo(() => {
    let filtered = finishingRecords;
    return sortData(filtered, sortBy, sortDirection);
  }, [finishingRecords, sortBy, sortDirection]);

  return isMobile ? (
    <FinishingGridSx
      processedRecords={processedRecords}
      hasFinishing={hasFinishing}
      lotId={lotId}
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
  ) : (
    <>
      <AnimatePresence mode="wait">
      <motion.div
        key={!processedRecords ? 'loading' : 'data'}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      >
      <Box sx={{ p: 0, pl: 0 }}>
        <TableContainer>
          <Table sx={{ backgroundColor: theme.palette.background.default }}>
            <TableHead>
              <TableRow>
                <TableCell align='center' sx={{ paddingTop: 0.3, paddingBottom: 0.3 }}>DATE</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>VENDOR</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>QUANTITY</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>QTY SHORT</TableCell>
                <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>RATE</TableCell>
                <TableCell align='center' sx={{ whiteSpace: 'nowrap', paddingTop: 0, paddingBottom: 0 }}>FINISH OUT</TableCell>
                {!readOnly && <TableCell align='center' sx={{ paddingTop: 0, paddingBottom: 0 }}>ACTIONS</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {!processedRecords ? (
                <TableRowsLoader colsNum={7} rowsNum={5} />
              ) : processedRecords.length > 0 ? (
                processedRecords.map((fr, idx) => (
                  <TableRow key={fr._id}>
                    <TableCell align='center' sx={{ borderBottom: idx !== processedRecords.length - 1 && 0, paddingTop: 0.3, paddingBottom: 0.3 }}>{getFormattedDate(fr.date)}</TableCell>
                    <TableCell align='center'>{fr.vendorId?.name || 'N/A'}</TableCell>
                    <TableCell align='center'>{fr.quantity}</TableCell>
                    <TableCell align='center'>{fr.quantityShort ?? 0}</TableCell>
                    <TableCell align='center'>{fr.rate}</TableCell>
                    <TableCell align='center'>
                      {fr.finishOutDate ? (
                        readOnly ? (getFormattedDate(fr.finishOutDate)) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
                            {getFormattedDate(fr.finishOutDate)}
                            <LocalizationProvider dateAdapter={AdapterDayjs}>
                              <MorphDateIconField
                                value={null}
                                onChange={(e) => handleUpdateFinishOut(lotId, fr._id, e)}
                              />
                            </LocalizationProvider>
                          </div>)
                      ) : (
                        !readOnly &&
                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                          <DatePicker
                            value={null}
                            onChange={(e) => handleUpdateFinishOut(lotId, fr._id, e)}
                            format='DD-MMM-YYYY'
                            slots={{ textField: MorphDateTextField }}
                            sx={{ width: 165 }}
                          />
                        </LocalizationProvider>
                      )}
                    </TableCell>
                    {!readOnly && <TableCell align='center' sx={{ borderBottom: idx !== processedRecords.length - 1 && 0, paddingTop: 0, paddingBottom: 0 }}>
                      <IconButton onClick={() => onEditFinishing(fr)}>
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
      </motion.div>
      </AnimatePresence>
    </>
  );
}

export default FinishingGrid;
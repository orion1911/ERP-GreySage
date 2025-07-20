import React from 'react';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Typography, Box, IconButton, Chip } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import { Edit as EditIcon } from '@mui/icons-material';
import { NoRecordRow } from '../../components/Skeleton/SkeletonLoader';

function WashingGrid({ washingRecords, lotId, handleUpdateWashOut, onEditWashing }) {
  return (
    <Box sx={{ p: 0, pl: 0 }}>
      {/* {washingRecords && washingRecords.length > 0 ? ( */}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              {/* <TableCell>Invoice #</TableCell> */}
              <TableCell align='center'>DATE</TableCell>
              <TableCell align='center'>VENDOR</TableCell>
              <TableCell align='center'>WASH DETAIL</TableCell>
              <TableCell align='center'>WASH OUT</TableCell>
              <TableCell align='center'>ACTIONS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {washingRecords && washingRecords.length === 0 ? (<NoRecordRow />) : (washingRecords.map((wr) => (
              <TableRow key={wr._id}>
                {/* <TableCell>{wr.lotId.invoiceNumber}</TableCell> */}
                <TableCell align='center'>{new Date(wr.date).toLocaleDateString()}</TableCell>
                <TableCell align='center'>{wr.vendorId?.name || 'N/A'}</TableCell>
                <TableCell>
                  {wr.washDetails.map((wd, index) => (
                    <Box sx={{ m: 1, textAlign: 'center', alignContent: 'center', alignItems: 'center' }} key={index}>
                      <Chip color="success" size="small" sx={{ mr: 1 }} label={wd.washColor} />
                      <Chip color="success" size="small" sx={{ mr: 1 }} label={wd.washCreation} />
                      <Chip color="success" size="small" sx={{ mr: 1 }} label={`QTY: ${wd.quantity}`} />
                      <Chip color="success" size="small" sx={{ mr: 1 }} label={`QTY SHORT: ${wd.quantityShort}`} />
                    </Box>
                  ))}
                </TableCell>
                <TableCell align='center'>
                  {wr.washOutDate ? (
                    new Date(wr.washOutDate).toLocaleDateString()
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
              </TableRow>)))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default WashingGrid;
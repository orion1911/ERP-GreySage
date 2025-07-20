import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import { LocalLaundryService, ExpandMore, Add, ChevronRight, Edit as EditIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import WashingGrid from '../Washing/WashingGrid';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';

function StitchingGrid({
  stitchingRecords,
  washingRecords,
  fetchWashingRecords,
  handleUpdateStitchOut,
  handleUpdateWashOut,
  setOpenWashingModal,
  setSelectedLot,
  searchTerm,
  onEditStitching,
  onEditWashing
}) {
  const theme = useTheme();
  const [expandedRows, setExpandedRows] = useState({});

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => {
      const newExpanded = { ...prev, [rowId]: !prev[rowId] };
      if (newExpanded[rowId]) {
        const row = stitchingRecords.find(r => r._id === rowId);
        if (row && row.lotId?._id && !washingRecords[row.lotId._id]) {
          fetchWashingRecords(row.lotId._id);
        }
      }
      return newExpanded;
    });
  };

  const columns = [
    {
      accessorKey: 'toggleWashing',
      header: ' ',
      cell: ({ row }) => (
        <Tooltip title="Show Washing" placement='bottom' arrow>
          <IconButton
            size="small"
            sx={{
              outline: 'none',
              "&.MuiButtonBase-root:hover": {
                bgcolor: "transparent"
              }
            }}
            onClick={() => toggleRowExpansion(row.original._id)}
          >
            {expandedRows[row.original._id] ? <><LocalLaundryService fontSize='small' /><ExpandMore /></>
              : <><LocalLaundryService fontSize='small' /><ChevronRight /></>}
          </IconButton>
        </Tooltip>
      )
    },
    {
      accessorKey: 'lotId.lotNumber',
      header: 'LOT #',
      enableSorting: true
    },
    {
      accessorKey: 'lotId.invoiceNumber',
      header: 'INVOICE #',
      enableSorting: true
    },
    {
      accessorKey: 'date',
      header: 'DATE',
      enableSorting: true,
      cell: ({ row }) => new Date(row.original.date).toLocaleDateString()
    },
    {
      accessorKey: 'vendorId.name',
      header: 'VENDOR',
      enableSorting: true,
      cell: ({ row }) => row.original.vendorId?.name || 'N/A'
    },
    {
      accessorKey: 'quantity',
      header: 'QTY',
      enableSorting: true
    },
    {
      accessorKey: 'quantityShort',
      header: 'QTY SHORT',
      enableSorting: true
    },
    {
      accessorKey: 'rate',
      header: 'RATE',
      enableSorting: true
    },
    {
      accessorKey: 'stitchOutDate',
      header: 'STITCH OUT',
      enableSorting: true,
      cell: ({ row }) => (
        row.original.stitchOutDate ? (
          new Date(row.original.stitchOutDate).toLocaleDateString()
        ) : ''
        // (
        //   <LocalizationProvider dateAdapter={AdapterDayjs}>
        //     <DatePicker
        //       value={null}
        //       onChange={(e) => handleUpdateStitchOut(row.original._id, e)}
        //       format='DD-MMM-YYYY'
        //       slots={{ textField: MorphDateTextField }}
        //       sx={{ width: 165 }}
        //     />
        //   </LocalizationProvider>
        // )
      )
    },
    {
      accessorKey: 'actions',
      header: () => (<div style={{ textAlign: 'center' }}>ACTIONS</div>),
      align: 'center',
      cell: ({ row }) => (
        <Box>
          <Tooltip title="Edit" placement='bottom' arrow>
            <IconButton onClick={() => onEditStitching(row.original)} sx={{ mr: 1 }}>
              <EditIcon fontSize='small' />
            </IconButton>
          </Tooltip>
          {/* <Tooltip title="Show Washing" placement='bottom' arrow>
            <IconButton size="small" onClick={() => toggleRowExpansion(row.original._id)}>
              {expandedRows[row.original._id] ? <><LocalLaundryService /><ExpandLess /></> : <><LocalLaundryService /><ExpandMore /></>}
            </IconButton>
          </Tooltip> */}
          <Tooltip title="Add Washing" placement='bottom' arrow>
            <IconButton
              size="small"
              sx={{
                mr: 1,
                outline: 'none',
                "&.MuiButtonBase-root:hover": {
                  bgcolor: "transparent"
                }
              }}
              onClick={() => {
                setSelectedLot({
                  lotNumber: row.original.lotId?.lotNumber || '',
                  lotId: row.original.lotId?._id || '',
                  invoiceNumber: row.original.lotId?.invoiceNumber || ''
                });
                setOpenWashingModal(true);
              }}
            >
              <Add fontSize='small' />
              <LocalLaundryService fontSize='small' />
            </IconButton>
          </Tooltip>
        </Box>
      )
    }
  ];

  const table = useReactTable({
    columns,
    data: stitchingRecords,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      globalFilter: searchTerm
    },
    globalFilterFn: (row, columnId, filterValue) => {
      const lotNumber = row.original.lotId?.lotNumber?.toString().toLowerCase() || '';
      const invoiceNumber = row.original.lotId?.invoiceNumber?.toString().toLowerCase() || '';
      const vendorName = row.original.vendorId?.name?.toLowerCase() || '';
      const search = filterValue.toLowerCase();
      return (
        lotNumber.includes(search) ||
        invoiceNumber.includes(search) ||
        vendorName.includes(search)
      );
    }
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  return (
    <TableContainer>
      <Table>
        <TableHead>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(colHeader => (
                <TableCell
                  key={colHeader.column.id}
                  onClick={(event) => {
                    if (isColumnSortable(colHeader.column)) {
                      const sortHandler = colHeader.column.getToggleSortingHandler();
                      if (sortHandler) {
                        sortHandler(event);
                      }
                    }
                  }}
                  style={{
                    cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default',
                    textAlign: 'center',
                    width: colHeader.column.id === 'toggleWashing' && '20px'
                  }}
                >
                  {flexRender(getHeaderContent(colHeader.column), colHeader.getContext())}
                  {isColumnSortable(colHeader.column) && colHeader.column.getIsSorted() ? (colHeader.column.getIsSorted() === 'desc' ? ' 🔽' : ' 🔼') : ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableHead>
        <TableBody>
          {!stitchingRecords ? (
            <TableRowsLoader colsNum={10} rowsNum={10} />
          ) : (stitchingRecords && stitchingRecords.length > 0 ? (
            table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <TableRow>
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      style={{
                        textAlign: 'center',
                        width: cell.column.id === 'toggleWashing' && '20px',
                        padding: cell.column.id === 'toggleWashing' && 0
                      }}>
                      {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedRows[row.original._id] && (
                  <TableRow>
                    <TableCell colSpan={10}>
                      <WashingGrid
                        washingRecords={washingRecords[row.original.lotId?._id] || []}
                        lotId={row.original.lotId?._id}
                        handleUpdateWashOut={handleUpdateWashOut}
                        onEditWashing={onEditWashing}
                      />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))) : <NoRecordRow />)}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default StitchingGrid;
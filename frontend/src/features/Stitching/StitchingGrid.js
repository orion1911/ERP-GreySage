import React, { useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Box, Button, IconButton, Tooltip } from '@mui/material';
import { LocalLaundryService, ExpandMore, ExpandLess, Edit as EditIcon } from '@mui/icons-material';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { MorphDateTextField } from '../../components/MuiCustom';
import WashingGrid from '../Washing/WashingGrid';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/TableSkeletonLoader';

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
      accessorKey: 'lotId.lotNumber',
      header: 'Lot #',
      enableSorting: true
    },
    {
      accessorKey: 'lotId.invoiceNumber',
      header: 'Invoice #',
      enableSorting: true
    },
    {
      accessorKey: 'date',
      header: 'Date',
      enableSorting: true,
      cell: ({ row }) => new Date(row.original.date).toLocaleDateString()
    },
    {
      accessorKey: 'vendorId.name',
      header: 'Vendor',
      enableSorting: true,
      cell: ({ row }) => row.original.vendorId?.name || 'N/A'
    },
    {
      accessorKey: 'quantity',
      header: 'Qty',
      enableSorting: true
    },
    {
      accessorKey: 'quantityShort',
      header: 'Qty Short',
      enableSorting: true
    },
    {
      accessorKey: 'rate',
      header: 'Rate',
      enableSorting: true
    },
    {
      accessorKey: 'stitchOutDate',
      header: 'Stitch Out Date',
      enableSorting: true,
      cell: ({ row }) => (
        row.original.stitchOutDate ? (
          new Date(row.original.stitchOutDate).toLocaleDateString()
        ) : (
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              value={null}
              onChange={(e) => handleUpdateStitchOut(row.original._id, e)}
              format='DD-MMM-YYYY'
              slots={{ textField: MorphDateTextField }}
              sx={{ width: 165 }}
            />
          </LocalizationProvider>
        )
      )
    },
    {
      accessorKey: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Box>
          <Tooltip title="Edit" placement='bottom' arrow>
            <IconButton onClick={() => onEditStitching(row.original)}>
              <EditIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Show Washing" placement='bottom' arrow>
            <IconButton size="small" onClick={() => toggleRowExpansion(row.original._id)}>
              {expandedRows[row.original._id] ? <><LocalLaundryService /><ExpandLess /></> : <><LocalLaundryService /><ExpandMore /></>}
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Washing" placement='bottom' arrow>
            <Button
              variant="contained"
              size="small"
              endIcon={<LocalLaundryService />}
              onClick={() => {
                setSelectedLot({
                  lotNumber: row.original.lotId?.lotNumber || '',
                  lotId: row.original.lotId?._id || '',
                  invoiceNumber: row.original.lotId?.invoiceNumber || ''
                });
                setOpenWashingModal(true);
              }}
              sx={{ mr: 1 }}
            >
              Add
            </Button>
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

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
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
                  style={{ cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default' }}
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
            <TableRowsLoader colsNum={9} rowsNum={10} />
          ) : (stitchingRecords && stitchingRecords.length > 0 ? (
            table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <TableRow>
                  {row.getVisibleCells().map(cell => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedRows[row.original._id] && (
                  <TableRow>
                    <TableCell colSpan={9}>
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
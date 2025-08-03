import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Box, IconButton, Tooltip, Badge } from '@mui/material';
import { LocalLaundryService, ExpandMore, Add, ChevronRight, Edit as EditIcon } from '@mui/icons-material';
import WashingGrid from '../Washing/WashingGrid';
import StitchingGridSx from './StitchingGridSx';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import OrderStatusChip from '../../components/OrderStatusChip';


function StitchingGrid({
  stitchingRecords,
  washingRecords,
  hasWashing,
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
  const { isMobile } = useOutletContext();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  // Fetch washing records without auto-expanding rows
  useEffect(() => {
    if (stitchingRecords && Array.isArray(stitchingRecords)) {
      stitchingRecords.forEach(record => {
        if (record.lotId?._id && !(washingRecords && washingRecords[record.lotId._id])) {
          fetchWashingRecords(record.lotId._id);
        }
      });
    }
  }, [stitchingRecords, washingRecords, fetchWashingRecords]);

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => {
      const newExpanded = { ...prev, [rowId]: !prev[rowId] };
      if (newExpanded[rowId]) {
        const row = stitchingRecords.find(r => r._id === rowId);
        if (row && row.lotId?._id && !(washingRecords && washingRecords[row.lotId._id])) {
          fetchWashingRecords(row.lotId._id);
        }
      }
      return newExpanded;
    });
  };

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return undefined;
    return [...data].sort((a, b) => {
      let valueA, valueB;
      if (sortKey === 'lotNumber') {
        valueA = a.lotId?.lotNumber || '';
        valueB = b.lotId?.lotNumber || '';
      } else if (sortKey === 'invoiceNumber') {
        valueA = a.lotId?.invoiceNumber || '';
        valueB = b.lotId?.invoiceNumber || '';
      } else if (sortKey === 'date') {
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
      } else if (sortKey === 'status') {
        valueA = a.status || 0;
        valueB = b.status || 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueB);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const filterData = (data, search) => {
    if (!data || !Array.isArray(data)) return undefined;
    return data.filter(record =>
      !search ||
      record.lotId?.lotNumber?.toLowerCase().includes(search.toLowerCase()) ||
      record.lotId?.invoiceNumber?.toString().toLowerCase().includes(search.toLowerCase()) ||
      record.vendorId?.name?.toLowerCase().includes(search.toLowerCase())
    );
  };

  const processedRecords = useMemo(() => {
    let filtered = stitchingRecords;
    filtered = filterData(filtered, searchTerm);
    return sortData(filtered, sortBy, sortDirection);
  }, [stitchingRecords, searchTerm, sortBy, sortDirection]);

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
              "&.MuiButtonBase-root:hover": { bgcolor: "transparent" },
              // ...(washingRecords && washingRecords[row.original.lotId?._id]?.length > 0 && {
              //   animation: 'blink 1s infinite',
              //   ...blinkKeyframes
              // })
            }}
            onClick={() => toggleRowExpansion(row.original._id)}
          >
            {expandedRows[row.original._id] ?
              <>
                <LocalLaundryService fontSize='small' />
                <ExpandMore />
              </> :
              <>
                {washingRecords && washingRecords[row.original.lotId?._id]?.length > 0 ? <Badge
                  color="warning"
                  overlap="circular"
                  variant="dot"
                  sx={{
                    '& .MuiBadge-badge': {
                      width: '10px',
                      height: '10px',
                      animation: 'blink 1.4s ease-in-out infinite',
                      '@keyframes blink': {
                        '0%': { opacity: 1 },
                        '50%': { opacity: 0.2 },
                        '100%': { opacity: 1 },
                      },
                    },
                  }}
                >
                  <LocalLaundryService fontSize="small" />
                </Badge> : <LocalLaundryService fontSize="small" />}
                <ChevronRight />
              </>}
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
      cell: ({ row }) => getFormattedDate(row.original.date)
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
      accessorKey: 'status',
      header: 'STATUS',
      enableSorting: true,
      cell: ({ row }) => <OrderStatusChip status={row.original.lotId?.status} />,
    },
    {
      accessorKey: 'stitchOutDate',
      header: 'STITCH OUT',
      enableSorting: true,
      cell: ({ row }) => (
        row.original.stitchOutDate ? getFormattedDate(row.original.stitchOutDate) : ''
      )
    },
    {
      accessorKey: 'actions',
      header: () => (<div style={{ textAlign: 'center' }}>ACTIONS</div>),
      cell: ({ row }) => (
        <Box>
          <Tooltip title="Edit" placement='bottom' arrow>
            <IconButton onClick={() => onEditStitching(row.original)} sx={{ mr: 1 }}>
              <EditIcon fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip title="Add Washing" placement='bottom' arrow>
            <IconButton
              size="small"
              sx={{
                mr: 1,
                outline: 'none',
                "&.MuiButtonBase-root:hover": { bgcolor: "transparent" }
              }}
              onClick={() => {
                setSelectedLot({
                  lotNumber: row.original.lotId?.lotNumber || '',
                  lotId: row.original.lotId?._id || '',
                  invoiceNumber: row.original.lotId?.invoiceNumber || '',
                  lotQuantity: row.original.quantity
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
    data: processedRecords,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { globalFilter: searchTerm }
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  return isMobile ? (
    <StitchingGridSx
      processedRecords={processedRecords}
      washingRecords={washingRecords}
      fetchWashingRecords={fetchWashingRecords}
      handleUpdateStitchOut={handleUpdateStitchOut}
      handleUpdateWashOut={handleUpdateWashOut}
      setOpenWashingModal={setOpenWashingModal}
      setSelectedLot={setSelectedLot}
      expandedRows={expandedRows}
      toggleRowExpansion={toggleRowExpansion}
      onEditStitching={onEditStitching}
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
    <TableContainer>
      <Table>
        <TableHead>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map(colHeader => (
                <TableCell
                  key={colHeader.column.id}
                  onClick={() => {
                    if (isColumnSortable(colHeader.column)) {
                      setSortBy(colHeader.column.id);
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    }
                  }}
                  style={{
                    cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default',
                    textAlign: 'center',
                    width: colHeader.column.id === 'toggleWashing' ? 20 : (colHeader.column.id === 'status' ? 110 : 'auto')
                  }}
                >
                  {flexRender(getHeaderContent(colHeader.column), colHeader.getContext())}
                  {sortBy === colHeader.column.id ? (sortDirection === 'desc' ? ' 🔽' : ' 🔼') : ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableHead>
        <TableBody>
          {!processedRecords ? (
            <TableRowsLoader colsNum={11} rowsNum={10} />
          ) : processedRecords.length > 0 ? (
            table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <TableRow>
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      style={{
                        textAlign: 'center',
                        padding: cell.column.id === 'toggleWashing' ? 0 : 'auto'
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                {expandedRows[row.original._id] && (
                  <TableRow>
                    <TableCell colSpan={12} sx={{ p: 0 }}>
                      <WashingGrid
                        washingRecords={washingRecords && washingRecords[row.original.lotId?._id] || []}
                        hasWashing={hasWashing}
                        lotId={row.original.lotId?._id}
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
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))
          ) : (
            <NoRecordRow />
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default StitchingGrid;
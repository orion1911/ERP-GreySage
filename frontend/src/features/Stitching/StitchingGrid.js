import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useTheme, alpha } from '@mui/material/styles';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, Box, IconButton, Tooltip, Badge, Typography } from '@mui/material';
import { LocalLaundryService, ExpandMore, Add, ChevronRight, Edit as EditIcon, AutoAwesome } from '@mui/icons-material';
import WashingGrid from '../Washing/WashingGrid';
import FinishingGrid from '../Finishing/FinishingGrid';
import StitchingGridSx from './StitchingGridSx';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import OrderStatusChip from '../../components/OrderStatusChip';
import { motion, AnimatePresence } from 'motion/react';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { MorphDateIconField, MorphDateTextField } from '../../components/MuiCustom';

function StitchingGrid({
  stitchingRecords,
  washingRecords,
  finishingRecords,
  hasWashing,
  hasFinishing,
  fetchWashingRecords,
  fetchFinishingRecords,
  handleUpdateStitchOut,
  handleUpdateWashOut,
  handleUpdateFinishOut,
  setOpenWashingModal,
  setOpenFinishingModal,
  setSelectedLot,
  searchTerm,
  vendorFilter = '',
  washingVendorFilter = '',
  finishingVendorFilter = '',
  clientFilter = '',
  statusFilter = '',
  setStatusFilter = () => {},
  onEditStitching,
  onEditWashing,
  onEditFinishing,
  onAdd,
  readOnly = false
}) {
  const theme = useTheme();
  const { isMobile } = useOutletContext();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Washing/finishing records are now bulk-fetched and grouped by lotId in the parent,
  // so no per-row fetch loop here. toggleRowExpansion keeps a lazy fetch as a safety net
  // for any lot whose data wasn't preloaded (e.g. a freshly-added stitching row).
  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => {
      const isOpen = !!prev[rowId];
      // Accordion behaviour: only one row open at a time (clicking the open one collapses it).
      const newExpanded = isOpen ? {} : { [rowId]: true };
      if (!isOpen) {
        const row = stitchingRecords.find(r => r._id === rowId);
        if (row && row.lotId?._id) {
          if (!(washingRecords && washingRecords[row.lotId._id])) {
            fetchWashingRecords(row.lotId._id);
          }
          if (!(finishingRecords && finishingRecords[row.lotId._id])) {
            fetchFinishingRecords(row.lotId._id);
          }
        }
      }
      return newExpanded;
    });
  };

  const parseLotNumber = (lotNumber = '') => {
    return lotNumber.toString().split('/').map(segment => {
      const num = Number(segment);
      return Number.isFinite(num) ? num : segment.toString().toLowerCase();
    });
  };

  const compareLotNumbers = (lotA, lotB, direction = 'asc') => {
    const partsA = parseLotNumber(lotA);
    const partsB = parseLotNumber(lotB);
    const maxLen = Math.max(partsA.length, partsB.length);
    for (let i = 0; i < maxLen; i += 1) {
      const partA = partsA[i];
      const partB = partsB[i];
      if (partA === undefined) return direction === 'asc' ? -1 : 1;
      if (partB === undefined) return direction === 'asc' ? 1 : -1;
      if (partA === partB) continue;
      if (typeof partA === 'number' && typeof partB === 'number') {
        return direction === 'asc' ? partA - partB : partB - partA;
      }
      const aStr = partA.toString();
      const bStr = partB.toString();
      return direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    }
    return 0;
  };

  const compareInvoiceValues = (invoiceA, invoiceB, direction = 'asc') => {
    const numA = Number(invoiceA);
    const numB = Number(invoiceB);
    if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
      return direction === 'asc' ? numA - numB : numB - numA;
    }
    const aStr = invoiceA?.toString().toLowerCase() || '';
    const bStr = invoiceB?.toString().toLowerCase() || '';
    if (aStr < bStr) return direction === 'asc' ? -1 : 1;
    if (aStr > bStr) return direction === 'asc' ? 1 : -1;
    return 0;
  };

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return undefined;
    return [...data].sort((a, b) => {
      let valueA, valueB;
      if (sortKey === 'lotNumber') {
        return compareLotNumbers(a.lotId?.lotNumber, b.lotId?.lotNumber, direction);
      } else if (sortKey === 'invoiceNumber') {
        return compareInvoiceValues(a.lotId?.invoiceNumber, b.lotId?.invoiceNumber, direction);
      } else if (sortKey === 'clientName') {
        valueA = a.lotId?.clientId?.name || '';
        valueB = b.lotId?.clientId?.name || '';
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
        valueA = a.lotId?.status || 0;
        valueB = b.lotId?.status || 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA); // Fixed typo
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
      record.lotId?.clientId?.name?.toString().toLowerCase().includes(search.toLowerCase()) ||
      record.vendorId?.name?.toLowerCase().includes(search.toLowerCase())
    );
  };

  const processedRecords = useMemo(() => {
    let filtered = stitchingRecords;
    filtered = filterData(filtered, searchTerm);
    if (vendorFilter && filtered) {
      filtered = filtered.filter(record => record.vendorId?._id === vendorFilter);
    }
    if (washingVendorFilter && filtered) {
      // Keep stitching rows whose lot has a washing record with the chosen washing vendor.
      filtered = filtered.filter(record => {
        const lotWashing = washingRecords && washingRecords[record.lotId?._id];
        return Array.isArray(lotWashing) && lotWashing.some(w => (w.vendorId?._id || w.vendorId) === washingVendorFilter);
      });
    }
    if (finishingVendorFilter && filtered) {
      // Keep stitching rows whose lot has a finishing record with the chosen finishing vendor.
      filtered = filtered.filter(record => {
        const lotFinishing = finishingRecords && finishingRecords[record.lotId?._id];
        return Array.isArray(lotFinishing) && lotFinishing.some(f => (f.vendorId?._id || f.vendorId) === finishingVendorFilter);
      });
    }
    if (clientFilter && filtered) {
      filtered = filtered.filter(record => record.lotId?.clientId?._id === clientFilter);
    }
    if (statusFilter && filtered) {
      filtered = filtered.filter(record => record.lotId?.status === Number(statusFilter));
    }
    if (filterStatus && filtered) {
      filtered = filtered.filter(record => {
        if (filterStatus === 'completed') return !!record.stitchOutDate;
        if (filterStatus === 'pending') return !record.stitchOutDate;
        return true;
      });
    }
    return sortData(filtered, sortBy, sortDirection);
  }, [stitchingRecords, washingRecords, finishingRecords, searchTerm, vendorFilter, washingVendorFilter, finishingVendorFilter, clientFilter, statusFilter, sortBy, sortDirection, filterStatus]);

  // Reset to the first page when the filters change (but NOT on a plain data update —
  // autoResetPageIndex is disabled below so editing a record keeps you on your page).
  useEffect(() => {
    setPage(0);
  }, [searchTerm, vendorFilter, washingVendorFilter, finishingVendorFilter, clientFilter, statusFilter, filterStatus]);

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
            }}
            onClick={() => toggleRowExpansion(row.original._id)}
          >
            {expandedRows[row.original._id] ?
              <>
                <LocalLaundryService fontSize='small' />
                <ExpandMore />
              </> :
              <>
                {washingRecords && washingRecords[row.original.lotId?._id]?.length > 0 ?
                  <Badge color="primary" variant="dot"
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
                    <LocalLaundryService fontSize='small' />
                    <ChevronRight fontSize='small' />
                  </Badge> :
                  <>
                    <LocalLaundryService fontSize='small' />
                    <ChevronRight fontSize='small' />
                  </>
                }
              </>
            }
          </IconButton>
        </Tooltip>
      )
    },
    {
      accessorKey: 'lotId_display',
      header: 'LOT ID',
      enableSorting: false,
      cell: ({ row }) => row.original.lotId?.lotId || '—',
    },
    {
      accessorKey: 'date',
      header: 'DATE',
      cell: ({ row }) => getFormattedDate(row.original.date),
      enableSorting: true,
    },
    {
      accessorKey: 'lotNumber',
      header: 'LOT #',
      cell: ({ row }) => row.original.lotId?.lotNumber || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'BILL',
      cell: ({ row }) => row.original.lotId?.invoiceNumber || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'clientName',
      header: 'CLIENT',
      cell: ({ row }) => row.original.lotId?.clientId?.name || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'fitStyle',
      header: 'STYLE',
      cell: ({ row }) => row.original.lotId?.fitStyleId?.name || 'N/A',
      enableSorting: false,
    },
    {
      accessorKey: 'fabric',
      header: 'FABRIC',
      cell: ({ row }) => row.original.lotId?.fabric || 'N/A',
      enableSorting: false,
    },
    {
      accessorKey: 'waistSize',
      header: 'SIZE',
      cell: ({ row }) => row.original.lotId?.waistSize || 'N/A',
      enableSorting: false,
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => <OrderStatusChip status={row.original.lotId?.status} />,
      enableSorting: true,
    },
    {
      accessorKey: 'vendorName',
      header: 'VENDOR',
      cell: ({ row }) => row.original.vendorId?.name || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'quantity',
      header: 'QTY',
      cell: ({ row }) => row.original.quantity,
      enableSorting: true,
    },
    {
      accessorKey: 'quantityShort',
      header: 'SHORT',
      cell: ({ row }) => row.original.quantityShort,
      enableSorting: true,
    },
    {
      accessorKey: 'rate',
      header: 'RATE',
      cell: ({ row }) => row.original.rate,
      enableSorting: true,
    },
    {
      accessorKey: 'threadColors',
      header: 'THREADS',
      cell: ({ row }) => {
        const threads = row.original.threadColors || [];
        const fullText = threads.map(tc => `${tc.color}, ${tc.quantity}`).join('  |  ');
        // When there are more than 2 threads, show only the first inline; reveal the rest on hover.
        const overflow = threads.length > 2;
        const visible = overflow ? threads.slice(0, 1) : threads;
        const content = (
          <Box sx={{ maxWidth: 130, mx: 'auto' }}>
            {visible.map((tc, index) => (
              <Typography
                key={index}
                variant="subtitle2"
                noWrap
                sx={{ fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {tc.color}, {tc.quantity}
              </Typography>
            ))}
            {overflow && (
              <Typography variant="caption" color="primary" sx={{ fontSize: '.7rem', fontWeight: 600 }}>
                +{threads.length - 1} more
              </Typography>
            )}
          </Box>
        );
        return overflow
          ? <Tooltip title={fullText} arrow placement="top">{content}</Tooltip>
          : content;
      },
    },
    {
      accessorKey: 'stitchOut',
      header: 'STITCH OUT',
      size: 80,
      cell: ({ row }) => (
        row.original.stitchOutDate ? (
          readOnly ? (getFormattedDate(row.original.stitchOutDate)) : (
            <div style={{ display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
              {getFormattedDate(row.original.stitchOutDate)}
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <MorphDateIconField
                  value={null}
                  onChange={(e) => handleUpdateStitchOut(row.original._id, e)}
                />
              </LocalizationProvider>
            </div>)
        ) : (
          !readOnly && (
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <MorphDateIconField
                value={null}
                onChange={(e) => handleUpdateStitchOut(row.original._id, e)}
              />
            </LocalizationProvider>)
        )
      ),
    },
    {
      accessorKey: 'actions',
      header: 'ACTIONS',
      cell: ({ row }) => (
        readOnly ? null : (
          <Box sx={{ display: 'flex', gap: 0, justifyContent: 'center' }}>
            <Tooltip title="Edit Stitching" placement='bottom' arrow>
              <IconButton
                sx={{
                  mr: 0.2,
                  outline: 'none',
                  "&.MuiButtonBase-root:hover": { bgcolor: "transparent" }
                }}
                onClick={() => onEditStitching(row.original)}
              >
                <EditIcon fontSize='small' />
              </IconButton>
            </Tooltip>
            <Tooltip title="Add Washing" placement='bottom' arrow>
              <IconButton
                sx={{
                  mr: 0.2,
                  outline: 'none',
                  "&.MuiButtonBase-root:hover": { bgcolor: "transparent" }
                }}
                onClick={() => {
                  setSelectedLot({
                    lotNumber: row.original.lotId?.lotNumber || '',
                    lotId: row.original.lotId?._id || '',
                    invoiceNumber: row.original.lotId?.invoiceNumber || '',
                    lotQuantity: row.original.quantity - (row.original.quantityShort || 0)
                  });
                  setOpenWashingModal(true);
                }}
              >
                <Add fontSize='small' />
                <LocalLaundryService fontSize='small' />
              </IconButton>
            </Tooltip>
            <Tooltip title="Add Finishing" placement='bottom' arrow>
              <IconButton
                sx={{
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
                  setOpenFinishingModal(true);
                }}
              >
                <Add fontSize='small' />
                <AutoAwesome fontSize='small' />
              </IconButton>
            </Tooltip>
          </Box>)
      )
    }
  ];

  const table = useReactTable({
    columns,
    data: processedRecords,
    autoResetPageIndex: false, // don't jump back to page 1 when a row is edited/updated
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      // globalFilter: searchTerm,
      columnVisibility: {
        actions: !readOnly,
        lotId_display: false,
      },
      pagination: { pageIndex: page, pageSize: rowsPerPage },
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex: page, pageSize: rowsPerPage }) : updater;
      setPage(next.pageIndex);
      setRowsPerPage(next.pageSize);
    },
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  const paginatedRecordsSx = processedRecords ? processedRecords.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : processedRecords;

  return isMobile ? (
    <StitchingGridSx
      onAdd={onAdd}
      processedRecords={paginatedRecordsSx}
      totalCount={processedRecords ? processedRecords.length : 0}
      page={page}
      rowsPerPage={rowsPerPage}
      onPageChange={(_, newPage) => setPage(newPage)}
      onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
      washingRecords={washingRecords}
      finishingRecords={finishingRecords}
      fetchWashingRecords={fetchWashingRecords}
      fetchFinishingRecords={fetchFinishingRecords}
      handleUpdateStitchOut={handleUpdateStitchOut}
      handleUpdateWashOut={handleUpdateWashOut}
      handleUpdateFinishOut={handleUpdateFinishOut}
      setOpenWashingModal={setOpenWashingModal}
      setOpenFinishingModal={setOpenFinishingModal}
      setSelectedLot={setSelectedLot}
      expandedRows={expandedRows}
      toggleRowExpansion={toggleRowExpansion}
      onEditStitching={onEditStitching}
      onEditWashing={onEditWashing}
      onEditFinishing={onEditFinishing}
      sortBy={sortBy}
      setSortBy={setSortBy}
      sortDirection={sortDirection}
      setSortDirection={setSortDirection}
      filterAnchorEl={filterAnchorEl}
      setFilterAnchorEl={setFilterAnchorEl}
      filterStatus={filterStatus}
      setFilterStatus={setFilterStatus}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
      readOnly={readOnly}
    />
  ) : (
    <AnimatePresence mode="wait">
    <motion.div
      key={!processedRecords ? 'loading' : 'data'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
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
                    width: colHeader.column.id === 'toggleWashing' || colHeader.column.id === 'toggleFinishing' ? 20 : (colHeader.column.id === 'status' ? 90 : 'auto')
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
            <TableRowsLoader colsNum={16} rowsNum={10} />
          ) : processedRecords.length > 0 ? (
            table.getRowModel().rows.map((row, index) => (
              <React.Fragment key={row.id}>
                <TableRow
                  sx={{
                    backgroundColor: index % 2 ? theme.palette.action.hover : 'transparent',
                    transition: 'background-color 0.15s ease',
                    '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.12) },
                  }}
                >
                  {row.getVisibleCells().map(cell => (
                    <TableCell
                      key={cell.id}
                      style={{
                        textAlign: 'center',
                        padding: cell.column.id === 'toggleWashing' || cell.column.id === 'toggleFinishing' ? 0 : 'auto'
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
                <TableRow sx={{ '& td': { border: expandedRows[row.original._id] ? undefined : 0, p: 0 } }}>
                  <TableCell colSpan={17} sx={{ p: 0 }}>
                    <AnimatePresence>
                      {expandedRows[row.original._id] && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          style={{ overflow: 'hidden' }}
                        >
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
                            readOnly={readOnly}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </TableCell>
                </TableRow>
                {finishingRecords && finishingRecords[row.original.lotId?._id]?.length > 0 && (
                  <TableRow sx={{ '& td': { border: expandedRows[row.original._id] ? undefined : 0, p: 0 } }}>
                    <TableCell colSpan={17} sx={{ p: 0 }}>
                      <AnimatePresence>
                        {expandedRows[row.original._id] && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{ overflow: 'hidden' }}
                          >
                            <FinishingGrid
                              finishingRecords={finishingRecords && finishingRecords[row.original.lotId?._id] || []}
                              hasFinishing={hasFinishing}
                              lotId={row.original.lotId?._id}
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
                          </motion.div>
                        )}
                      </AnimatePresence>
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
      <TablePagination
        component="div"
        count={processedRecords ? processedRecords.length : 0}
        page={table.getState().pagination.pageIndex}
        onPageChange={(_, newPage) => table.setPageIndex(newPage)}
        rowsPerPage={table.getState().pagination.pageSize}
        onRowsPerPageChange={(e) => table.setPageSize(Number(e.target.value))}
        rowsPerPageOptions={[10, 25, 50]}
      />
    </TableContainer>
    </motion.div>
    </AnimatePresence>
  );
}

export default StitchingGrid;
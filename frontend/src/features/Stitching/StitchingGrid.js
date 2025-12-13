import React, { useState, useMemo, useEffect } from 'react';
import { useOutletContext, Link as RouterLink } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Box, IconButton, Tooltip, Badge, Link, Typography } from '@mui/material';
import { LocalLaundryService, ExpandMore, Add, ChevronRight, Edit as EditIcon, AutoAwesome } from '@mui/icons-material';
import WashingGrid from '../Washing/WashingGrid';
import FinishingGrid from '../Finishing/FinishingGrid';
import StitchingGridSx from './StitchingGridSx';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import { getFormattedDate } from '../../components/Validators';
import OrderStatusChip from '../../components/OrderStatusChip';
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
  onEditStitching,
  onEditWashing,
  onEditFinishing,
  readOnly = false
}) {
  const theme = useTheme();
  const { isMobile } = useOutletContext();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterAnchorEl, setFilterAnchorEl] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    if (stitchingRecords && Array.isArray(stitchingRecords)) {
      stitchingRecords.forEach(record => {
        if (record.lotId?._id) {
          if (!(washingRecords && washingRecords[record.lotId._id])) {
            fetchWashingRecords(record.lotId._id);
          }
          if (!(finishingRecords && finishingRecords[record.lotId._id])) {
            fetchFinishingRecords(record.lotId._id);
          }
        }
      });
    }
  }, [stitchingRecords]);

  const toggleRowExpansion = (rowId) => {
    setExpandedRows(prev => {
      const newExpanded = { ...prev, [rowId]: !prev[rowId] };
      if (newExpanded[rowId]) {
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
      } else if (sortKey === 'clientName') {
        valueA = a.orderId?.clientId?.name || '';
        valueB = b.orderId?.clientId?.name || '';
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
      record.orderId?.clientId?.name?.toString().toLowerCase().includes(search.toLowerCase()) ||
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
    // {
    //   accessorKey: 'toggleFinishing',
    //   header: ' ',
    //   cell: ({ row }) => (
    //     <Tooltip title="Show Finishing" placement='bottom' arrow>
    //       <IconButton
    //         size="small"
    //         sx={{
    //           outline: 'none',
    //           "&.MuiButtonBase-root:hover": { bgcolor: "transparent" },
    //         }}
    //         onClick={() => toggleRowExpansion(row.original._id)}
    //       >
    //         {expandedRows[row.original._id] ?
    //           <>
    //             <AutoAwesome fontSize='small' />
    //             <ExpandMore />
    //           </> :
    //           <>
    //             {finishingRecords && finishingRecords[row.original.lotId?._id]?.length > 0 ?
    //               <Badge color="primary" variant="dot"
    //                 sx={{
    //                   '& .MuiBadge-badge': {
    //                     width: '10px',
    //                     height: '10px',
    //                     animation: 'blink 1.4s ease-in-out infinite',
    //                     '@keyframes blink': {
    //                       '0%': { opacity: 1 },
    //                       '50%': { opacity: 0.2 },
    //                       '100%': { opacity: 1 },
    //                     },
    //                   },
    //                 }}
    //               >
    //                 <AutoAwesome fontSize='small' />
    //                 <ChevronRight fontSize='small' />
    //               </Badge> :
    //               <>
    //                 <AutoAwesome fontSize='small' />
    //                 <ChevronRight fontSize='small' />
    //               </>
    //             }
    //           </>
    //         }
    //       </IconButton>
    //     </Tooltip>
    //   )
    // },
    {
      accessorKey: 'orderId',
      header: 'ORDER ID',
      enableSorting: false,
      enableHiding: true,
      cell: ({ row }) => (
        <Link
          component={RouterLink}
          to={`/stitching/${row.original.orderId?._id || ''}`}
          underline="none"
          sx={{ fontWeight: 'bold', cursor: 'pointer' }}
        >
          {row.original.orderId?.orderId || '—'}
        </Link>
      ),
    },
    {
      accessorKey: 'lotNumber',
      header: 'LOT #',
      cell: ({ row }) => row.original.lotId?.lotNumber || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'invoiceNumber',
      header: 'INVOICE #',
      cell: ({ row }) => row.original.lotId?.invoiceNumber || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'clientName',
      header: 'CLIENT',
      cell: ({ row }) => row.original.orderId?.clientId?.name || 'N/A',
      enableSorting: true,
    },
    {
      accessorKey: 'status',
      header: 'STATUS',
      cell: ({ row }) => <OrderStatusChip status={row.original.lotId?.status} />,
      enableSorting: true,
    },
    {
      accessorKey: 'date',
      header: 'DATE',
      cell: ({ row }) => getFormattedDate(row.original.date),
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
      header: 'QUANTITY',
      cell: ({ row }) => row.original.quantity,
      enableSorting: true,
    },
    {
      accessorKey: 'quantityShort',
      header: 'QTY SHORT',
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
      cell: ({ row }) => (
        <Box>
          {row.original.threadColors.map((tc, index) => (
            <Typography key={index} variant="subtitle2" style={{ fontSize: '.8rem' }}>
              {tc.color}, {tc.quantity} pcs
            </Typography>
          ))}
        </Box>
      ),
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
                    lotQuantity: row.original.quantity
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      // globalFilter: searchTerm,
      columnVisibility: {
        actions: !readOnly, // Hide the 'actions' column when readOnly is true
        orderId: readOnly
      },
    }
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  return isMobile ? (
    <StitchingGridSx
      processedRecords={processedRecords}
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
      readOnly={readOnly}
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
                    width: colHeader.column.id === 'toggleWashing' || colHeader.column.id === 'toggleFinishing' ? 20 : (colHeader.column.id === 'status' ? 110 : 'auto')
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
            <TableRowsLoader colsNum={13} rowsNum={10} />
          ) : processedRecords.length > 0 ? (
            table.getRowModel().rows.map(row => (
              <React.Fragment key={row.id}>
                <TableRow>
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
                {expandedRows[row.original._id] && (
                  <>
                    <TableRow>
                      <TableCell colSpan={13} sx={{ p: 0 }}>
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
                      </TableCell>
                    </TableRow>
                    {finishingRecords && finishingRecords[row.original.lotId?._id].length > 0 && (<TableRow>
                      <TableCell colSpan={13} sx={{ p: 0 }}>
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
                      </TableCell>
                    </TableRow>)}
                  </>
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
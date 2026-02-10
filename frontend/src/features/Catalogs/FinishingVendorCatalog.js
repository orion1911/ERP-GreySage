import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, useTheme } from '@mui/material';
import { PersonAdd, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import FinishingVendorCatalogSx from './FinishingVendorCatalogSx';
import FinishingVendorCatalogAdd from './FinishingVendorCatalogAdd';
import { motion, AnimatePresence } from 'motion/react';

function FinishingVendorCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [vendorToToggle, setVendorToToggle] = useState(null);

  const getFinishingVendors = () => {
    setLoading(true);
    apiService.finishingVendors.getFinishingVendors(search)
      .then(res => {
        setTimeout(() => {
          setVendors(res);
          setLoading(false);
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getFinishingVendors();
  }, [search]);

  const handleToggleActive = (id) => {
    setVendorToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!vendorToToggle) return;
    setLoading(true);
    apiService.finishingVendors.toggleFinishingVendorActive(vendorToToggle)
      .then(() => {
        setLoading(false);
        getFinishingVendors();
        setConfirmOpen(false);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
        setConfirmOpen(false);
      });
  };

  const handleCancelToggle = () => {
    setConfirmOpen(false);
    setVendorToToggle(null);
  };

  const handleEditVendor = (vendor) => {
    setEditVendor(vendor);
    setOpenModal(true);
  };

  const columns = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true
    },
    {
      accessorKey: 'contact',
      header: 'Contact',
      enableSorting: true
    },
    {
      accessorKey: 'address',
      header: 'Address',
      enableSorting: true
    },
    {
      accessorKey: '_id',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Stack direction="row" spacing={1} justifyContent='center'>
          <IconButton disabled={loading} onClick={() => handleToggleActive(row.original._id)} size="small">
            <DeleteIcon fontSize="small" />
          </IconButton>
          <IconButton disabled={loading} onClick={() => handleEditVendor(row.original)} size="small">
            <EditIcon fontSize="small" />
          </IconButton>
        </Stack>
      )
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      enableSorting: true,
      cell: ({ row }) => (row.original.isActive ? 'Active' : 'Inactive')
    }
  ];

  const table = useReactTable({
    columns,
    data: vendors,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } }
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Finishing Vendor</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
          variant="standard"
          sx={{ maxWidth: '190px' }}
        />
        <Button
          variant="contained"
          endIcon={<PersonAdd />}
          onClick={() => { setEditVendor(null); setOpenModal(true); }}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Add Vendor
        </Button>
      </Box>
      {isMobile ? (
        <FinishingVendorCatalogSx
          vendors={vendors}
          search={search}
          loading={loading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditVendor={handleEditVendor}
        />
      ) : (
        <AnimatePresence mode="wait">
        <motion.div
          key={loading ? 'loading' : 'data'}
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
                      onClick={(event) => {
                        if (isColumnSortable(colHeader.column)) {
                          const sortHandler = colHeader.column.getToggleSortingHandler();
                          if (sortHandler) {
                            sortHandler(event);
                          }
                        }
                      }}
                      style={{ cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default', textWrap: 'nowrap', textAlign: 'center' }}
                    >
                      {flexRender(getHeaderContent(colHeader.column), colHeader.getContext())}
                      {isColumnSortable(colHeader.column) && colHeader.column.getIsSorted() ? (colHeader.column.getIsSorted() === 'desc' ? ' 🔽' : ' 🔼') : ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableHead>
            <TableBody>
              {loading || !vendors ? (
                <TableRowsLoader colsNum={5} rowsNum={10} />
              ) : vendors.length > 0 ? (
                table.getRowModel().rows.map(row => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map(cell => (
                      <TableCell key={cell.id} style={{ textAlign: 'center' }}>
                        {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <NoRecordRow />
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={table.getFilteredRowModel().rows.length}
            page={table.getState().pagination.pageIndex}
            onPageChange={(_, page) => table.setPageIndex(page)}
            rowsPerPage={table.getState().pagination.pageSize}
            onRowsPerPageChange={(e) => table.setPageSize(Number(e.target.value))}
            rowsPerPageOptions={[10, 25, 50]}
          />
        </TableContainer>
        </motion.div>
        </AnimatePresence>
      )}
      <FinishingVendorCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditVendor(null); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getFinishingVendors}
        editVendor={editVendor}
      />
      <Dialog
        open={confirmOpen}
        onClose={handleCancelToggle}
        aria-labelledby="confirm-toggle-title"
        aria-describedby="confirm-toggle-description"
      >
        <DialogTitle id="confirm-toggle-title">
          Confirm Action
        </DialogTitle>
        <DialogContent id="confirm-toggle-description">
          Are you sure you want to {vendors.find(v => v._id === vendorToToggle)?.isActive ? 'disable' : 'enable'} this vendor?
        </DialogContent>
        <DialogActions>
          <Button variant='contained' onClick={handleCancelToggle} color="primary">
            Cancel
          </Button>
          <Button variant='contained' onClick={handleConfirmToggle} color="error" autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default FinishingVendorCatalog;
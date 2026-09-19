import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, useTheme, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { LocalLaundryService as LaundryIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert, RateReview as RateReviewIcon } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import WashingVendorCatalogSx from './WashingVendorCatalogSx';
import WashingVendorCatalogAdd from './WashingVendorCatalogAdd';
import WashingVendorRateCard from './WashingVendorRateCard';
import WashCreationCatalog from './WashCreationCatalog';
import CatalogReorderList from './CatalogReorderList';
import { motion, AnimatePresence } from 'motion/react';

function WashingVendorCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  // Tabbed master (Stock Management pattern): the wash-creation catalog lives here
  // because a creation's rate is priced per washing vendor, not globally.
  const [view, setView] = useState('vendors'); // 'vendors' | 'creations'
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [vendorToToggle, setVendorToToggle] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [rateCardVendor, setRateCardVendor] = useState(null); // opens the per-vendor rate card editor
  // Skeleton is shown ONLY before the very first response. The table used to be gated on
  // `loading`, which flips true on every keystroke (the fetch effect depends on the search
  // term) — so the grid blinked to the skeleton on each character typed.
  const [initialLoading, setInitialLoading] = useState(true);
  // Debounced copy of the search box: the input stays instant, but the request (and the
  // list swap) only fires once the user pauses instead of once per character.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const getWashingVendors = () => {
    setLoading(true);
    apiService.washingVendors.getWashingVendors(debouncedSearch, showInactive)
      .then(res => {
        setTimeout(() => {
          setVendors(res);
          setLoading(false);
          setInitialLoading(false);
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        setLoading(false);
        setInitialLoading(false); // never stay stuck on the skeleton after a failed load
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getWashingVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, showInactive]);

  const handleToggleActive = (id) => {
    setVendorToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!vendorToToggle) return;
    setLoading(true);
    apiService.washingVendors.toggleWashingVendorActive(vendorToToggle)
      .then(() => {
        setLoading(false);
        getWashingVendors();
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

  // Reorder mode shows the FULL active list — clear any search filter first.
  const handleEnterReorder = () => { setSearch(''); setShowInactive(false); setReorderMode(true); };

  const handleSaveOrder = (orderedIds) => {
    setSavingOrder(true);
    apiService.washingVendors.reorderWashingVendors(orderedIds)
      .then(() => {
        setSavingOrder(false);
        setReorderMode(false);
        getWashingVendors();
        showSnackbar('Vendor order updated', 'success');
      })
      .catch(err => {
        setSavingOrder(false);
        console.log(err);
        showSnackbar(err);
      });
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
      accessorKey: 'defaultRate',
      header: 'Rate',
      enableSorting: true,
      cell: ({ row }) => row.original.defaultRate ?? 0
    },
    {
      accessorKey: '_id',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Stack direction="row" spacing={1} justifyContent='center'>
          <IconButton disabled={loading} color="primary" title="Rate Card" onClick={() => setRateCardVendor(row.original)} size="small">
            <RateReviewIcon fontSize="small" />
          </IconButton>
          <IconButton disabled={loading} color={row.original.isActive ? 'warning' : 'success'} onClick={() => handleToggleActive(row.original._id)} size="small">
            {row.original.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
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
      <Typography variant="h4" sx={{ mb: 1 }}>Washing Vendor</Typography>

      {/* Top-level switch, styled exactly like Stock Management's top toggle.
          The creation catalog lives here because a creation is priced per vendor. */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(e, v) => v && setView(v)}
          color="primary"
          sx={{ '& .MuiToggleButton-root': { py: 0.35, fontSize: '0.87rem', fontWeight: 'bold', textTransform: 'none' } }}
        >
          <ToggleButton value="vendors">
            <LaundryIcon fontSize="small" sx={{ mr: 0.5 }} />
            Vendors
          </ToggleButton>
          <ToggleButton value="creations">
            <RateReviewIcon fontSize="small" sx={{ mr: 0.5 }} />
            Wash Creations
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {view === 'creations' ? <WashCreationCatalog /> : (
      <>
      {!reorderMode && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            <TextField
              label="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              variant="standard"
              sx={{ width: 190, maxWidth: '100%' }}
            />
            <FormControlLabel
              control={<Switch size="small" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />}
              label={<Typography variant="caption">Inactive</Typography>}
            />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            <Button
              variant="outlined"
              startIcon={<SwapVert />}
              onClick={handleEnterReorder}
              disabled={loading}
            >
              Order
            </Button>
            <Button
              variant="contained"
              endIcon={<LaundryIcon />}
              onClick={() => { setEditVendor(null); setOpenModal(true); }}
              disabled={loading}
            >
              Add
            </Button>
          </Stack>
        </Box>
      )}
      {reorderMode ? (
        <CatalogReorderList
          items={vendors}
          getPrimary={(v) => v.name}
          getSecondary={(v) => v.contact}
          onSave={handleSaveOrder}
          onCancel={() => setReorderMode(false)}
          saving={savingOrder}
        />
      ) : isMobile ? (
        <WashingVendorCatalogSx
          vendors={vendors}
          search={search}
          loading={loading}
          initialLoading={initialLoading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditVendor={handleEditVendor}
          onReorder={handleEnterReorder}
          onAdd={() => { setEditVendor(null); setOpenModal(true); }}
        />
      ) : (
        <AnimatePresence mode="wait">
        {/* Constant key: the skeleton is gated on initialLoading, so this motion.div
            must NOT remount on every search-keystroke refetch (loading flips) — a
            changing key made AnimatePresence unmount/remount the table = flicker. */}
        <motion.div
          key="data"
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
              {initialLoading ? (
                <TableRowsLoader colsNum={7} rowsNum={10} />
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
      <WashingVendorCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditVendor(null); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getWashingVendors}
        editVendor={editVendor}
      />
      <WashingVendorRateCard
        open={!!rateCardVendor}
        onClose={() => setRateCardVendor(null)}
        vendor={rateCardVendor}
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
      )}
    </>
  );
}

export default WashingVendorCatalog;

import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch } from '@mui/material';
import { LocalLaundryService as LaundryIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import WashCreationCatalogSx from './WashCreationCatalogSx';
import WashCreationCatalogAdd from './WashCreationCatalogAdd';
import CatalogReorderList from './CatalogReorderList';
import { motion, AnimatePresence } from 'motion/react';

// Catalog for wash creations (ICE WASH WISKAR S/SPRAY, …). Name-only — same
// triplet shape as the other catalogs. Rates live on each washing vendor's
// rate card (Washing Vendors > Rates).
function WashCreationCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [creations, setCreations] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editCreation, setEditCreation] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [creationToToggle, setCreationToToggle] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Skeleton is shown ONLY before the very first response — gating the table on `loading`
  // made it blink to the skeleton on every keystroke (the fetch effect depends on the
  // search term). Subsequent search refetches keep the last rows on screen.
  const [initialLoading, setInitialLoading] = useState(true);
  // Debounced copy of the search box: typing stays instant, the request fires on pause.
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const getWashCreations = () => {
    setLoading(true);
    apiService.washCreations.getWashCreations(debouncedSearch, showInactive)
      .then(res => {
        setTimeout(() => {
          setCreations(res);
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
    getWashCreations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, showInactive]);

  const handleToggleActive = (id) => {
    setCreationToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!creationToToggle) return;
    setLoading(true);
    apiService.washCreations.toggleWashCreationActive(creationToToggle)
      .then(() => {
        setLoading(false);
        getWashCreations();
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
    setCreationToToggle(null);
  };

  const handleEditCreation = (creation) => {
    setEditCreation(creation);
    setOpenModal(true);
  };

  // Reorder mode shows the FULL active list — clear any search filter first.
  const handleEnterReorder = () => { setSearch(''); setShowInactive(false); setReorderMode(true); };

  const handleSaveOrder = (orderedIds) => {
    setSavingOrder(true);
    apiService.washCreations.reorderWashCreations(orderedIds)
      .then(() => {
        setSavingOrder(false);
        setReorderMode(false);
        getWashCreations();
        showSnackbar('Wash creation order updated', 'success');
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
      accessorKey: '_id',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Stack direction="row" spacing={1} justifyContent='center'>
          <IconButton disabled={loading} color={row.original.isActive ? 'warning' : 'success'} onClick={() => handleToggleActive(row.original._id)} size="small">
            {row.original.isActive ? <DeleteIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
          </IconButton>
          <IconButton disabled={loading} onClick={() => handleEditCreation(row.original)} size="small">
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
    data: creations,
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
              onClick={() => { setEditCreation(null); setOpenModal(true); }}
              disabled={loading}
            >
              Add
            </Button>
          </Stack>
        </Box>
      )}
      {reorderMode ? (
        <CatalogReorderList
          items={creations}
          getPrimary={(c) => c.name}
          getSecondary={() => ''}
          onSave={handleSaveOrder}
          onCancel={() => setReorderMode(false)}
          saving={savingOrder}
        />
      ) : isMobile ? (
        <WashCreationCatalogSx
          creations={creations}
          search={search}
          loading={loading}
          initialLoading={initialLoading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditCreation={handleEditCreation}
          onReorder={handleEnterReorder}
          onAdd={() => { setEditCreation(null); setOpenModal(true); }}
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
                <TableRowsLoader colsNum={3} rowsNum={10} />
              ) : creations.length > 0 ? (
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
      <WashCreationCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditCreation(null); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getWashCreations}
        editCreation={editCreation}
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
          Are you sure you want to {creations.find(c => c._id === creationToToggle)?.isActive ? 'disable' : 'enable'} this wash creation?
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

export default WashCreationCatalog;
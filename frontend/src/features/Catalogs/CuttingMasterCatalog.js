import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch } from '@mui/material';
import { Engineering as EngineeringIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import CuttingMasterCatalogSx from './CuttingMasterCatalogSx';
import CuttingMasterCatalogAdd from './CuttingMasterCatalogAdd';
import CatalogReorderList from './CatalogReorderList';
import { motion, AnimatePresence } from 'motion/react';

// Catalog for the in-house cutting masters written in the cutting book's margins
// (RAMU MSTR, ANSAR MSTR, …). Name-only — same triplet shape as the vendor catalogs.
function CuttingMasterCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [masters, setMasters] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editMaster, setEditMaster] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [masterToToggle, setMasterToToggle] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const getCuttingMasters = () => {
    setLoading(true);
    apiService.cuttingMasters.getCuttingMasters(search, showInactive)
      .then(res => {
        setTimeout(() => {
          setMasters(res);
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
    getCuttingMasters();
  }, [search, showInactive]);

  const handleToggleActive = (id) => {
    setMasterToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!masterToToggle) return;
    setLoading(true);
    apiService.cuttingMasters.toggleCuttingMasterActive(masterToToggle)
      .then(() => {
        setLoading(false);
        getCuttingMasters();
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
    setMasterToToggle(null);
  };

  const handleEditMaster = (master) => {
    setEditMaster(master);
    setOpenModal(true);
  };

  // Reorder mode shows the FULL active list — clear any search filter first.
  const handleEnterReorder = () => { setSearch(''); setShowInactive(false); setReorderMode(true); };

  const handleSaveOrder = (orderedIds) => {
    setSavingOrder(true);
    apiService.cuttingMasters.reorderCuttingMasters(orderedIds)
      .then(() => {
        setSavingOrder(false);
        setReorderMode(false);
        getCuttingMasters();
        showSnackbar('Cutting master order updated', 'success');
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
          <IconButton disabled={loading} onClick={() => handleEditMaster(row.original)} size="small">
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
    data: masters,
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
      <Typography variant="h4" sx={{ mb: 1 }}>Cutting Masters</Typography>
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
              endIcon={<EngineeringIcon />}
              onClick={() => { setEditMaster(null); setOpenModal(true); }}
              disabled={loading}
            >
              Add
            </Button>
          </Stack>
        </Box>
      )}
      {reorderMode ? (
        <CatalogReorderList
          items={masters}
          getPrimary={(m) => m.name}
          getSecondary={() => ''}
          onSave={handleSaveOrder}
          onCancel={() => setReorderMode(false)}
          saving={savingOrder}
        />
      ) : isMobile ? (
        <CuttingMasterCatalogSx
          masters={masters}
          search={search}
          loading={loading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditMaster={handleEditMaster}
          onReorder={handleEnterReorder}
          onAdd={() => { setEditMaster(null); setOpenModal(true); }}
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
              {loading || !masters ? (
                <TableRowsLoader colsNum={3} rowsNum={10} />
              ) : masters.length > 0 ? (
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
      <CuttingMasterCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditMaster(null); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getCuttingMasters}
        editMaster={editMaster}
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
          Are you sure you want to {masters.find(m => m._id === masterToToggle)?.isActive ? 'disable' : 'enable'} this cutting master?
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

export default CuttingMasterCatalog;

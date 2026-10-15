import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, Alert, CircularProgress, useTheme } from '@mui/material';
import { Style as StyleIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import { TableRowsLoader } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import ProductCatalogSx from './ProductCatalogSx';
import ProductCatalogAdd from './ProductCatalogAdd';
import CatalogReorderList from './CatalogReorderList';

const LOT_STATUS = { 1: 'Cut', 2: 'Stitching', 3: 'Washing', 4: 'Finishing', 5: 'Ready', 6: 'Part Dispatched', 7: 'Dispatched' };

function ProductCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [productToToggle, setProductToToggle] = useState(null);
  // { id, lots } for the style in the confirm dialog. Keyed by id so a slow response
  // for a previously clicked style can't show up against the current one.
  const [toggleUsage, setToggleUsage] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  // Skeleton shows ONLY before first response. Gating on `loading` blinked to the
  // skeleton on every keystroke (fetch effect depends on search term).
  const [initialLoading, setInitialLoading] = useState(true);

  const getFitStyles = () => {
    setLoading(true);
    apiService.fitStyles.getFitstyles(search, showInactive)
      .then(res => {
        setProducts(res);
        setLoading(false);
        setInitialLoading(false);
      })
      .catch(err => {
        setLoading(false);
        setInitialLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getFitStyles();
  }, [search, showInactive]);

  const handleToggleActive = (id) => {
    setProductToToggle(id);
    setToggleUsage(null);
    setConfirmOpen(true);
    // Only disabling needs the check; re-enabling is always allowed.
    if (products.find((p) => p._id === id)?.isActive) {
      apiService.fitStyles.getFitstyleUsage(id)
        .then((res) => setToggleUsage({ id, lots: res.lots, items: res.items || [], truncated: !!res.truncated }))
        .catch((err) => {
          showSnackbar(err);
          setConfirmOpen(false);
        });
    }
  };

  const handleConfirmToggle = () => {
    if (!productToToggle) return;
    setLoading(true);
    apiService.fitStyles.toggleFitstyleActive(productToToggle)
      .then(() => {
        setLoading(false);
        getFitStyles();
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
    setProductToToggle(null);
    setToggleUsage(null);
  };

  const toggleTarget = products.find((p) => p._id === productToToggle);
  const disabling = !!toggleTarget?.isActive;
  const usage = toggleUsage?.id === productToToggle ? toggleUsage.lots : null;
  const checkingUsage = disabling && usage === null;
  const blockedByLots = disabling && usage > 0;
  const usageList = toggleUsage?.id === productToToggle ? toggleUsage : null;
  const usageItems = usageList?.items || [];
  const hasCutLots = usageItems.some((l) => l.status === 1);

  const copyInvoiceNumbers = () => {
    const nums = usageItems.map((l) => l.invoiceNumber).filter((n) => n != null);
    navigator.clipboard.writeText(nums.join(', '))
      .then(() => showSnackbar(`${nums.length} invoice numbers copied`, 'success'))
      .catch(() => showSnackbar('Could not copy to the clipboard'));
  };

  const handleEditProduct = (product) => {
    setEditProduct(product);
    setOpenModal(true);
  };

  // Reorder mode shows the FULL active list — clear search/inactive filters first.
  const handleEnterReorder = () => { setSearch(''); setShowInactive(false); setReorderMode(true); };

  const handleSaveOrder = (orderedIds) => {
    setSavingOrder(true);
    apiService.fitStyles.reorderFitstyles(orderedIds)
      .then(() => {
        setSavingOrder(false);
        setReorderMode(false);
        getFitStyles();
        showSnackbar('Fit Style order updated', 'success');
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
      header: 'Design',
      enableSorting: true
    },
    {
      accessorKey: 'description',
      header: 'Description',
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
          <IconButton disabled={loading} onClick={() => handleEditProduct(row.original)} size="small">
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
    data: products,
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
      <Typography variant="h4" sx={{ mb: 1 }}>Fit Style</Typography>
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
              endIcon={<StyleIcon />}
              onClick={() => { setEditProduct(null); setOpenModal(true); }}
              disabled={loading}
            >
              Add
            </Button>
          </Stack>
        </Box>
      )}
      {reorderMode ? (
        <CatalogReorderList
          items={products}
          getPrimary={(p) => p.name}
          getSecondary={(p) => p.description}
          onSave={handleSaveOrder}
          onCancel={() => setReorderMode(false)}
          saving={savingOrder}
        />
      ) : isMobile ? (
        <ProductCatalogSx
          products={products}
          search={search}
          loading={loading}
          initialLoading={initialLoading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditProduct={handleEditProduct}
          onReorder={handleEnterReorder}
          onAdd={() => { setEditProduct(null); setOpenModal(true); }}
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
              ) : table.getRowModel().rows.length > 0 ? (
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
                <TableRow>
                  <TableCell colSpan={columns.length} style={{ textAlign: 'center' }}>
                    No records found
                  </TableCell>
                </TableRow>
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
      )}
      <ProductCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditProduct(null); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getFitStyles}
        editProduct={editProduct}
      />
      <Dialog
        open={confirmOpen}
        onClose={handleCancelToggle}
        fullWidth
        maxWidth={blockedByLots ? 'sm' : 'xs'}
        aria-labelledby="confirm-toggle-title"
        aria-describedby="confirm-toggle-description"
      >
        <DialogTitle id="confirm-toggle-title">
          {blockedByLots ? 'Fit style in use' : 'Confirm Action'}
        </DialogTitle>
        <DialogContent id="confirm-toggle-description">
          {checkingUsage ? (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={18} />
              <span>Checking whether any lots use this fit style...</span>
            </Stack>
          ) : blockedByLots ? (
            <>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <b>{toggleTarget?.name}</b> is used by {usage} lot{usage === 1 ? '' : 's'}, so it cannot be deleted.
                Move these lots to another fit style first.
              </Alert>
              <Box sx={{ maxHeight: 280, overflowY: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>Invoice #</TableCell>
                      <TableCell>Lot No</TableCell>
                      <TableCell>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {usageItems.map((l) => (
                      <TableRow key={l.lotNumber}>
                        <TableCell>{l.invoiceNumber ?? '-'}</TableCell>
                        <TableCell>{l.lotNumber}</TableCell>
                        <TableCell>{LOT_STATUS[l.status] || l.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              {usageList?.truncated && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Showing {usageItems.length} of {usage} lots.
                </Typography>
              )}
              {hasCutLots && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Lots at Cut have no invoice yet. Change those in the Cutting Book.
                </Typography>
              )}
            </>
          ) : (
            <>Are you sure you want to {disabling ? 'disable' : 'enable'} this fit style?</>
          )}
        </DialogContent>
        <DialogActions>
          {blockedByLots && (
            <Button variant='outlined' onClick={copyInvoiceNumbers}>
              Copy invoice numbers
            </Button>
          )}
          <Button variant='contained' onClick={handleCancelToggle} color="primary">
            {blockedByLots ? 'Close' : 'Cancel'}
          </Button>
          {!blockedByLots && (
            <Button variant='contained' onClick={handleConfirmToggle} color="error" autoFocus disabled={checkingUsage || loading}>
              Confirm
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ProductCatalog;
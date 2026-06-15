import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TablePagination, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Switch, useTheme } from '@mui/material';
import { Style as StyleIcon, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon, SwapVert } from '@mui/icons-material';
import apiService from '../../services/apiService';
import ProductCatalogSx from './ProductCatalogSx';
import ProductCatalogAdd from './ProductCatalogAdd';
import CatalogReorderList from './CatalogReorderList';

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
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const getFitStyles = () => {
    setLoading(true);
    apiService.fitStyles.getFitstyles(search, showInactive)
      .then(res => {
        setProducts(res);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getFitStyles();
  }, [search, showInactive]);

  const handleToggleActive = (id) => {
    setProductToToggle(id);
    setConfirmOpen(true);
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
              {table.getRowModel().rows.length > 0 ? (
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
        aria-labelledby="confirm-toggle-title"
        aria-describedby="confirm-toggle-description"
      >
        <DialogTitle id="confirm-toggle-title">
          Confirm Action
        </DialogTitle>
        <DialogContent id="confirm-toggle-description">
          Are you sure you want to {products.find(p => p._id === productToToggle)?.isActive ? 'disable' : 'enable'} this fit style?
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

export default ProductCatalog;
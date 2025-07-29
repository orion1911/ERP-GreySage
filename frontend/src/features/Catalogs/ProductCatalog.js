import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, useTheme } from '@mui/material';
import { PersonAdd, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';
import ProductCatalogSx from './ProductCatalogSx';
import ProductCatalogAdd from './ProductCatalogAdd';

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

  const getFitStyles = () => {
    setLoading(true);
    apiService.fitStyles.getFitstyles(search)
      .then(res => {
        setProducts(res);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        if (err.response?.status === 401 || err.response?.status === 403) {
          showSnackbar('Session expired. Please log in again.');
          window.location.href = '/login';
        } else {
          showSnackbar(err.response?.data?.error || 'An error occurred');
        }
      });
  };

  useEffect(() => {
    getFitStyles();
  }, [search]);

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
        if (err.response?.status === 401 || err.response?.status === 403) {
          showSnackbar('Session expired. Please log in again.');
          window.location.href = '/login';
        } else if (err.response?.status === 404) {
          showSnackbar('Fit style not found.');
        } else {
          showSnackbar(err.response?.data?.error || 'An error occurred');
        }
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
          <Button
            variant="contained"
            color="error"
            size="small"
            disabled={loading}
            onClick={() => handleToggleActive(row.original._id)}
            startIcon={<DeleteIcon />}
          >
            {row.original.isActive ? 'Disable' : 'Enable'}
          </Button>
          <Button
            variant="contained"
            color="primary"
            size="small"
            disabled={loading}
            onClick={() => handleEditProduct(row.original)}
            startIcon={<EditIcon />}
          >
            Edit
          </Button>
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
    getSortedRowModel: getSortedRowModel()
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  return (
    <>
      <Typography variant="h4" sx={{ mb: 1 }}>Fit Style</Typography>
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
          size='small'
          endIcon={<PersonAdd />}
          onClick={() => { setEditProduct(null); setOpenModal(true); }}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Add Fit Style
        </Button>
      </Box>
      {isMobile ? (
        <ProductCatalogSx
          products={products}
          search={search}
          loading={loading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditProduct={handleEditProduct}
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
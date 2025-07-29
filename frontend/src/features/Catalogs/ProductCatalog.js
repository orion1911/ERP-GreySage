import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Typography, Box } from '@mui/material';
import { PersonAdd } from '@mui/icons-material';
import apiService from '../../services/apiService';
import ProductCatalogSx from './ProductCatalogSx';
import ProductCatalogAdd from './ProductCatalogAdd';

function ProductCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const token = localStorage.getItem('token');

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
  }, [search, token]);

  const handleToggleActive = (id) => {
    setLoading(true);
    apiService.fitStyles.toggleFitstyleActive(id)
      .then(() => {
        setLoading(false);
        getFitStyles();
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
        <Button
          variant="contained"
          color="warning"
          size="small"
          disabled={loading}
          onClick={() => handleToggleActive(row.original._id)}
        >
          {row.original.isActive ? 'Disable' : 'Enable'}
        </Button>
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
          onClick={() => setOpenModal(true)}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Add Fit Style
        </Button>
      </Box>
      {isMobile ? (
        <ProductCatalogSx
          products={products}
          setProducts={setProducts}
          search={search}
          setSearch={setSearch}
          openModal={openModal}
          setOpenModal={setOpenModal}
          loading={loading}
          setLoading={setLoading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          token={token}
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
        onClose={() => setOpenModal(false)}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getFitStyles}
      />
    </>
  );
}

export default ProductCatalog;
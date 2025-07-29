import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Typography, Box } from '@mui/material';
import { PersonAdd } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import StitchingVendorCatalogSx from './StitchingVendorCatalogSx';
import StitchingVendorCatalogAdd from './StitchingVendorCatalogAdd';

function StitchingVendorCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [vendors, setVendors] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');

  const getStitchingVendors = () => {
    setLoading(true);
    apiService.stitchingVendors.getStitchingVendors(search)
      .then(res => {
        setTimeout(() => {
          setVendors(res);
          setLoading(false);
        }, process.env.REACT_APP_DATA_LOAD_TIMEOUT || 0);
      })
      .catch(err => {
        setLoading(false);
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
        } else {
          alert(err.response?.data?.error || 'An error occurred');
        }
      });
  };

  useEffect(() => {
    getStitchingVendors();
  }, [search, token]);

  const handleToggleActive = (id) => {
    setLoading(true);
    apiService.stitchingVendors.toggleStitchingVendorActive(id)
      .then(() => {
        setLoading(false);
        getStitchingVendors();
      })
      .catch(err => {
        setLoading(false);
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
        } else if (err.response?.status === 404) {
          alert('Stitching vendor not found.');
        } else {
          alert(err.response?.data?.error || 'An error occurred');
        }
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
      accessorKey: '_id',
      header: 'Actions',
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          variant="contained"
          color="error"
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
    data: vendors,
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
      <Typography variant="h4" sx={{ mb: 1 }}>Stitching Vendor</Typography>
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
          onClick={() => setOpenModal(true)}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Add Vendor
        </Button>
      </Box>
      {isMobile ? (
        <StitchingVendorCatalogSx
          vendors={vendors}
          search={search}
          loading={loading}
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
        </TableContainer>
      )}
      <StitchingVendorCatalogAdd
        open={openModal}
        onClose={() => setOpenModal(false)}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getStitchingVendors}
      />
    </>
  );
}

export default StitchingVendorCatalog;
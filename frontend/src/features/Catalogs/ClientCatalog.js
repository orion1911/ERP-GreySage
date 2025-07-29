import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box, Grid } from '@mui/material';
import { PersonAdd } from '@mui/icons-material';
import apiService from '../../services/apiService';
import ClientCatalogSx from './ClientCatalogSx';
import ClientCatalogAdd from './ClientCatalogAdd';

function ClientCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const token = localStorage.getItem('token');

  const getClients = () => {
    apiService.client.getClients(search)
      .then(res => setClients(res))
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getClients();
  }, [search, token]);

  

  const handleToggleActive = (id) => {
    setLoading(true);
    apiService.client.updateClient(id)
      .then(res => {
        setLoading(false);
        getClients();
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
        setLoading(false);
      });
  };

  const columns = [
    {
      accessorKey: 'name',
      header: 'Name',
      enableSorting: true
    },
    {
      accessorKey: 'clientCode',
      header: 'Client Code',
      enableSorting: true
    },
    {
      accessorKey: 'contact',
      header: 'Contact',
      enableSorting: true
    },
    // {
    //   accessorKey: 'email',
    //   header: 'Email',
    //   enableSorting: true
    // },
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
          color="warning"
          size='small'
          loading={loading}
          loadingPosition="end"
          onClick={() => handleToggleActive(row.original._id)}
        >
          {row.original.isActive ? 'Disable' : 'Enable'}
        </Button>
      )
    },
    // {
    //   accessorKey: 'isActive',
    //   header: 'Status',
    //   enableSorting: true,
    //   cell: ({ row }) => (row.original.isActive ? 'Active' : 'Inactive')
    // }
  ];

  const table = useReactTable({
    columns,
    data: clients,
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
      <Typography variant="h4" sx={{ mb: 1 }}>Client Catalog</Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'right', mb: 2 }}>
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
          sx={{ mt: 2 }}
        >
          Add Client
        </Button>
      </Box>
      {isMobile ? (
        <ClientCatalogSx
          clients={clients}
          setClients={setClients}
          search={search}
          setSearch={setSearch}
          openModal={openModal}
          setOpenModal={setOpenModal}
          loading={loading}
          setLoading={setLoading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          token={token}
        />) : (
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
      <ClientCatalogAdd
        open={openModal}
        onClose={() => {setOpenModal(false);getClients()}}
      />
    </>
  );
}

export default ClientCatalog;
import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, IconButton, Typography, Box, Stack, Dialog, DialogTitle, DialogContent, DialogActions, useTheme } from '@mui/material';
import { PersonAdd, Edit as EditIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';
import apiService from '../../services/apiService';
import ClientCatalogSx from './ClientCatalogSx';
import ClientCatalogAdd from './ClientCatalogAdd';

function ClientCatalog() {
  const { showSnackbar, isMobile } = useOutletContext();
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editClient, setEditClient] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clientToToggle, setClientToToggle] = useState(null);

  const getClients = () => {
    setLoading(true);
    apiService.client.getClients(search)
      .then(res => {
        setClients(res);
        setLoading(false);
      })
      .catch(err => {
        setLoading(false);
        console.log(err);
        showSnackbar(err);
      });
  };

  useEffect(() => {
    getClients();
  }, [search]);

  const handleToggleActive = (id) => {
    setClientToToggle(id);
    setConfirmOpen(true);
  };

  const handleConfirmToggle = () => {
    if (!clientToToggle) return;
    setLoading(true);
    apiService.client.toggleClientActive(clientToToggle)
      .then(() => {
        setLoading(false);
        getClients();
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
    setClientToToggle(null);
  };

  const handleEditClient = (client) => {
    setEditClient(client);
    setOpenModal(true);
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
    {
      accessorKey: 'email',
      header: 'Email',
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
        <Stack direction="row" spacing={1} justifyContent="center">
          <IconButton disabled={loading} onClick={() => handleToggleActive(row.original._id)} size="small">
            <DeleteIcon fontSize="small" />
          </IconButton>
          <IconButton disabled={loading} onClick={() => handleEditClient(row.original)} size="small">
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
          onClick={() => { setEditClient(null); setOpenModal(true); }}
          disabled={loading}
          sx={{ mt: 2 }}
        >
          Add Client
        </Button>
      </Box>
      {isMobile ? (
        <ClientCatalogSx
          clients={clients}
          search={search}
          loading={loading}
          handleToggleActive={handleToggleActive}
          showSnackbar={showSnackbar}
          handleEditClient={handleEditClient}
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
              {loading || !clients ? (
                <TableRowsLoader colsNum={6} rowsNum={10} />
              ) : clients.length > 0 ? (
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
      <ClientCatalogAdd
        open={openModal}
        onClose={() => { setOpenModal(false); setEditClient(null); getClients(); }}
        loading={loading}
        setLoading={setLoading}
        onAddSuccess={getClients}
        editClient={editClient}
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
          Are you sure you want to {clients.find(c => c._id === clientToToggle)?.isActive ? 'disable' : 'enable'} this client?
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleCancelToggle} color="primary">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmToggle} color="error" autoFocus>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ClientCatalog;
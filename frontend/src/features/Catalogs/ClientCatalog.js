import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box, Modal, IconButton, Paper } from '@mui/material';
import { Close as CloseIcon, Save as SaveIcon, PersonAdd } from '@mui/icons-material';
import apiService from '../../services/apiService';

function ClientCatalog() {
  const { showSnackbar } = useOutletContext();
  const [loading, setLoading] = useState(false);

  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ name: '', clientCodePrefix: '', contact: '', email: '', address: '' });
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

  const generateClientCodePrefix = (name) => {
    if (!name) return '';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'name') {
      setForm(prev => ({
        ...prev,
        name: value,
        clientCodePrefix: generateClientCodePrefix(value)
      }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleAddClient = () => {
    setLoading(true);
    apiService.client.createClient(form)
      .then(res => {
        setLoading(false);
        setOpenModal(false);
        setClients([...clients, res]);
        setForm({ name: '', clientCodePrefix: '', contact: '', email: '', address: '' });
      })
      .catch(err => {
        console.log(err.response);
        showSnackbar(err);
        setLoading(false);
      });
  };

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
        <Button
          variant="contained"
          color="error"
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
          onClick={() => setOpenModal(true)} sx={{ mt: 2 }}
        >
          Add
        </Button>
      </Box>
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
                    style={{ cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default' }}
                  >
                    {flexRender(getHeaderContent(colHeader.column), colHeader.getContext())}
                    {isColumnSortable(colHeader.column) && colHeader.column.getIsSorted() ? (colHeader.column.getIsSorted() === 'desc' ? ' 🔽' : ' 🔼') : ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableHead>
          <TableBody>
            {table.getRowModel().rows.map(row => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Modal
        open={openModal}
        onClose={() => setOpenModal(false)}
        aria-labelledby="add-client-modal"
        aria-describedby="modal-to-add-new-client"
      >
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 400,
            bgcolor: 'background.paper',
            borderRadius: 2,
            boxShadow: 24,
            p: 4,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" id="add-client-modal">Add Client</Typography>
            <IconButton onClick={() => setOpenModal(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <TextField
            name="name"
            label="Name"
            value={form.name}
            onChange={handleChange}
            fullWidth
            margin="normal"
            variant="outlined"
          />
          <TextField
            name="clientCodePrefix"
            label="Client Code Prefix (Suggested)"
            value={form.clientCodePrefix}
            onChange={handleChange}
            fullWidth
            margin="normal"
            variant="outlined"
            helperText="Edit the suggested prefix if needed"
          />
          <TextField
            name="contact"
            label="Contact"
            value={form.contact}
            onChange={handleChange}
            fullWidth
            margin="normal"
            variant="outlined"
          />
          <TextField
            name="email"
            label="Email"
            value={form.email}
            onChange={handleChange}
            fullWidth
            margin="normal"
            variant="outlined"
          />
          <TextField
            name="address"
            label="Address"
            value={form.address}
            onChange={handleChange}
            fullWidth
            margin="normal"
            variant="outlined"
          />
          <Button
            endIcon={<SaveIcon />}
            loading={loading}
            loadingPosition="end"
            variant="contained"
            onClick={handleAddClient}
            sx={{ mt: 2 }}
          >
            SAVE
          </Button>
        </Box>
      </Modal>
    </>
  );
}

export default ClientCatalog;
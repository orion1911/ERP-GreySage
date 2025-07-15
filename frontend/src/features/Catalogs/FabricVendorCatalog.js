import { useState, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box, Modal, IconButton, Paper } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import apiService from '../../services/apiService';

function FabricVendorCatalog() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ name: '', contact: '', address: '' });
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const token = localStorage.getItem('token');

  const getFabricVendors = () => {
    apiService.fabricVendors.getFabricVendors(search)
      .then(res => setVendors(res))
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
        } else {
          alert(err.response?.data?.error || 'An error occurred');
        }
      });
  };

  useEffect(() => {
    getFabricVendors();
  }, [search, token]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAddVendor = () => {
    apiService.fabricVendors.createFabricVendor(form)
      .then(res => {
        setVendors([...vendors, res]);
        setForm({ name: '', contact: '', address: '' });
        setOpenModal(false);
      })
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
        } else {
          alert(err.response?.error || 'An error occurred');
        }
      });
  };

  const handleToggleActive = (id) => {
    apiService.fabricVendors.toggleFabricVendorActive(id)
      .then(res => {
        getFabricVendors();
      })
      .catch(err => {
        if (err.response?.status === 401 || err.response?.status === 403) {
          alert('Session expired. Please log in again.');
          window.location.href = '/login';
        } else if (err.response?.status === 404) {
          alert('Fabric vendor not found.');
        } else {
          alert(err.response?.error || 'An error occurred');
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
        <Button variant="contained" color="error" onClick={() => handleToggleActive(row.original._id)}>
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
        <Typography variant="h4" sx={{ mb: 1 }}>Fabric Vendor Catalog</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'right', mb: 2 }}>
          <TextField
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            variant="standard"
            sx={{ maxWidth: '190px' }}
          />
          <Button variant="contained" onClick={() => setOpenModal(true)} sx={{ mt: 2 }}>
            Add Fabric Vendor
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
          aria-labelledby="add-vendor-modal"
          aria-describedby="modal-to-add-new-vendor"
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
              <Typography variant="h6" id="add-vendor-modal">Add Fabric Vendor</Typography>
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
              name="contact"
              label="Contact"
              value={form.contact}
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
            <Button variant="contained" onClick={handleAddVendor} sx={{ mt: 2 }}>
              SAVE
            </Button>
          </Box>
        </Modal>
    </>
  );
}

export default FabricVendorCatalog;
import { useState, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box } from '@mui/material';
import axios from 'axios';

function ClientManagement() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ name: '', contact: '', email: '', address: '' });
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get(`http://localhost:5000/api/clients?search=${search}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => setClients(res.data))
      .catch(err => alert(err.response.data.error));
  }, [search]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAddClient = () => {
    axios.post('http://localhost:5000/api/clients', form, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        setClients([...clients, res.data]);
        setForm({ name: '', contact: '', email: '', address: '' });
      })
      .catch(err => alert(err.response.data.error));
  };

  const handleDelete = (id) => {
    axios.delete(`http://localhost:5000/api/clients/${id}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(() => setClients(clients.filter(c => c._id !== id)))
      .catch(err => alert(err.response.data.error));
  };

  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'contact', header: 'Contact' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'address', header: 'Address' },
    {
      accessorKey: '_id',
      header: 'Actions',
      cell: ({ row }) => (
        <Button variant="contained" color="error" onClick={() => handleDelete(row.original._id)}>
          Delete
        </Button>
      )
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

  return (
    <>
      <Typography variant="h4" gutterBottom>Client Management</Typography>
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, mb: 2 }}>
        <Typography variant="h6">Add Client</Typography>
        <TextField
          name="name"
          label="Name"
          value={form.name}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <TextField
          name="contact"
          label="Contact"
          value={form.contact}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <TextField
          name="email"
          label="Email"
          value={form.email}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <TextField
          name="address"
          label="Address"
          value={form.address}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <Button variant="contained" onClick={handleAddClient} sx={{ mt: 2 }}>
          Add Client
        </Button>
      </Box>
      <TextField
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        margin="normal"
      />
      <Table {...table.getTableProps()}>
        <TableHead>
          {table.getHeaderGroups().map(headerGroup => (
            <TableRow {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map(column => (
                <TableCell {...column.getHeaderProps(column.getSortByToggleProps())}>
                  {column.render('header')}
                  {column.isSorted ? (column.isSortedDesc ? ' 🔽' : ' 🔼') : ''}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableHead>
        <TableBody {...table.getTableBodyProps()}>
          {table.getRowModel().rows.map(row => {
            row.prepareRow();
            return (
              <TableRow {...row.getRowProps()}>
                {row.cells.map(cell => (
                  <TableCell {...cell.getCellProps()}>{cell.render('cell')}</TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}

export default ClientManagement;
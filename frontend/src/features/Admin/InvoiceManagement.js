import { useState, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableRow, TextField, Button, Container, Typography, Box, MenuItem, Select, InputLabel, FormControl } from '@mui/material';
import axios from 'axios';
import * as XLSX from 'xlsx';

function InvoiceManagement() {
  const [invoices, setInvoices] = useState([]);
  const [clients, setClients] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    invoiceNumber: '',
    clientId: '',
    transactions: [{ productId: '', pieces: 0, date: '', payment: 0 }]
  });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    axios.get(`http://localhost:5000/api/invoices?search=${search}&status=${statusFilter}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => setInvoices(res.data))
      .catch(err => alert(err.response.data.error));

    axios.get('http://localhost:5000/api/clients', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => setClients(res.data))
      .catch(err => alert(err.response.data.error));

    axios.get('http://localhost:5000/api/products', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => setProducts(res.data))
      .catch(err => alert(err.response.data.error));
  }, [search, statusFilter]);

  const handleChange = (e, index) => {
    if (e.target.name.startsWith('transaction')) {
      const transactions = [...form.transactions];
      const field = e.target.name.split('.')[1];
      transactions[index][field] = e.target.value;
      setForm({ ...form, transactions });
    } else {
      setForm({ ...form, [e.target.name]: e.target.value });
    }
  };

  const addTransaction = () => {
    setForm({
      ...form,
      transactions: [...form.transactions, { productId: '', pieces: 0, date: '', payment: 0 }]
    });
  };

  const handleCreateInvoice = () => {
    axios.post('http://localhost:5000/api/invoices', {
      invoiceNumber: form.invoiceNumber,
      clientId: form.clientId,
      transactions: form.transactions.map(t => ({
        productId: t.productId,
        pieces: parseInt(t.pieces),
        date: parseInt(t.date),
        payment: parseFloat(t.payment || 0)
      }))
    }, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => {
        setInvoices([...invoices, res.data]);
        setForm({ invoiceNumber: '', clientId: '', transactions: [{ productId: '', pieces: 0, date: '', payment: 0 }] });
      })
      .catch(err => alert(err.response.data.error));
  };

  const handleExport = () => {
    const data = invoices.map(i => ({
      'Invoice Number': i.invoiceNumber,
      'Client': i.clientId.name,
      'Total Amount': i.totalAmount,
      'Status': i.status
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Invoices');
    XLSX.writeFile(wb, 'invoices.xlsx');
  };

  const columns = [
    { accessorKey: 'invoiceNumber', header: 'Invoice Number' },
    { accessorKey: 'clientId.name', header: 'Client' },
    { accessorKey: 'totalAmount', header: 'Total Amount' },
    { accessorKey: 'status', header: 'Status' }
  ];

  const table = useReactTable({
    columns,
    data: invoices,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <>
      <Typography variant="h4" gutterBottom>Invoice Management</Typography>
      <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2, mb: 2 }}>
        <Typography variant="h6">Create Invoice</Typography>
        <TextField
          name="invoiceNumber"
          label="Invoice Number"
          value={form.invoiceNumber}
          onChange={handleChange}
          fullWidth
          margin="normal"
        />
        <FormControl fullWidth margin="normal">
          <InputLabel>Client</InputLabel>
          <Select name="clientId" value={form.clientId} onChange={handleChange}>
            <MenuItem value="">Select Client</MenuItem>
            {clients.map(c => <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>)}
          </Select>
        </FormControl>
        {form.transactions.map((t, index) => (
          <Box key={index} sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Product</InputLabel>
              <Select name={`transaction.productId.${index}`} value={t.productId} onChange={(e) => handleChange(e, index)}>
                <MenuItem value="">Select Product</MenuItem>
                {products.map(p => <MenuItem key={p._id} value={p._id}>{p.design}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              name={`transaction.pieces.${index}`}
              label="Pieces"
              type="number"
              value={t.pieces}
              onChange={(e) => handleChange(e, index)}
              fullWidth
            />
            <TextField
              name={`transaction.date.${index}`}
              label="Date (Excel serial)"
              value={t.date}
              onChange={(e) => handleChange(e, index)}
              fullWidth
            />
            <TextField
              name={`transaction.payment.${index}`}
              label="Payment"
              type="number"
              value={t.payment}
              onChange={(e) => handleChange(e, index)}
              fullWidth
            />
          </Box>
        ))}
        <Button variant="contained" color="success" onClick={addTransaction} sx={{ mt: 2, mr: 2 }}>
          Add Transaction
        </Button>
        <Button variant="contained" onClick={handleCreateInvoice} sx={{ mt: 2 }}>
          Create Invoice
        </Button>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="partial">Partial</MenuItem>
          </Select>
        </FormControl>
        <Button variant="contained" onClick={handleExport}>Export to Excel</Button>
      </Box>
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

export default InvoiceManagement;
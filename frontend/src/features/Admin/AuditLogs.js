import { useState, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableRow, Button, TextField, Container, Typography } from '@mui/material';
import apiService from '../../services/apiService';

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiService.admin.audit.getAudits()
      .then(res => setLogs(res));
  }, []);

  const columns = [
    { accessorKey: 'action', header: 'Action' },
    { accessorKey: 'user', header: 'User' },
    { accessorKey: 'timestamp', header: 'Timestamp' },
    // {
    //   accessorKey: '_id',
    //   header: 'Actions',
    //   cell: ({ row }) => (
    //     <Button variant="contained" color="error" onClick={() => handleDelete(row.original._id)}>
    //       Delete
    //     </Button>
    //   )
    // }
  ];

  const table = useReactTable({
    columns,
    data: logs,
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
      <Typography variant="h4" gutterBottom>Audit Logs</Typography>
      <TextField
        label="Search"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        fullWidth
        margin="normal"
      />
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
    </>
  );
}

export default AuditLogs;
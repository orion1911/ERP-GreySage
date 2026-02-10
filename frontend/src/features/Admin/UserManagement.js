import { useState, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel, flexRender } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableRow, TablePagination, Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import apiService from '../../services/apiService';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  useEffect(() => {
    apiService.admin.userMgmt.getUsers()
      .then(res => setUsers(res));
  }, []);

  const columns = [
    { accessorKey: 'username', header: 'Username' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'role', header: 'Role' },
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
    data: users,
    state: { globalFilter: search },
    onGlobalFilterChange: setSearch,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } }
  });

  const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
  const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

  const handleDelete = (id) => {
    setUserToDelete(id);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (!userToDelete) return;
    apiService.admin.userMgmt.deleteUser(userToDelete)
      .then(() => {
        setUsers(users.filter(u => u._id !== userToDelete));
        setConfirmOpen(false);
        setUserToDelete(null);
      });
  };

  const handleCancelDelete = () => {
    setConfirmOpen(false);
    setUserToDelete(null);
  };

  return (
    <>
      <Typography variant="h4" gutterBottom>User Management</Typography>
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
      <TablePagination
        component="div"
        count={table.getFilteredRowModel().rows.length}
        page={table.getState().pagination.pageIndex}
        onPageChange={(_, page) => table.setPageIndex(page)}
        rowsPerPage={table.getState().pagination.pageSize}
        onRowsPerPageChange={(e) => table.setPageSize(Number(e.target.value))}
        rowsPerPageOptions={[10, 25, 50]}
      />
      <Dialog open={confirmOpen} onClose={handleCancelDelete}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          Are you sure you want to delete this user?
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleCancelDelete} color="primary">
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmDelete} color="error" autoFocus>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default UserManagement;

import React from 'react';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Grid, IconButton, Button, Stack, Select, Menu, MenuItem, useTheme } from '@mui/material';
import { ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { flexRender } from '@tanstack/react-table';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';

function OrderGridMd({ processedOrders, columns, table, sortBy, sortDirection, setSortBy, setSortDirection, filterAnchorEl, setFilterAnchorEl, filterStatus, setFilterStatus }) {
    const theme = useTheme();

    const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
    const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

    return (
        <TableContainer>
            <Table>
                <TableHead>
                    <TableRow sx={{ backgroundColor: theme.palette.background.paper }}>
                        <TableCell colSpan={columns.length} sx={{ p: 0.5 }}>
                            <Grid container spacing={2} sx={{ justifyContent: 'flex-end' }}>
                                <Grid item xs={12} sm={6} md={4}>
                                    <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
                                        <Select
                                            variant="standard"
                                            size="small"
                                            value={sortBy}
                                            onChange={(e) => {
                                                setSortBy(e.target.value);
                                                setSortDirection('asc');
                                            }}
                                            sx={{ minWidth: 120 }}
                                        >
                                            <MenuItem value="orderId">Order ID</MenuItem>
                                            <MenuItem value="date">Date</MenuItem>
                                            <MenuItem value="clientName">Client</MenuItem>
                                            <MenuItem value="fitStyleName">Fit Style</MenuItem>
                                            <MenuItem value="fabric">Fabric</MenuItem>
                                            <MenuItem value="status">Status</MenuItem>
                                        </Select>
                                        <IconButton
                                            color="primary"
                                            size="small"
                                            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                            sx={{ ml: 1 }}
                                        >
                                            {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
                                        </IconButton>
                                        <Button
                                            variant="standard"
                                            size="small"
                                            startIcon={<FilterList />}
                                            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                                        >
                                            Filter
                                        </Button>
                                        <Menu
                                            anchorEl={filterAnchorEl}
                                            open={Boolean(filterAnchorEl)}
                                            onClose={() => setFilterAnchorEl(null)}
                                        >
                                            <MenuItem onClick={() => { setFilterStatus(''); setFilterAnchorEl(null); }}>All</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('placed'); setFilterAnchorEl(null); }}>Placed</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('stitching'); setFilterAnchorEl(null); }}>Stitching</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('washing'); setFilterAnchorEl(null); }}>Washing</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('finishing'); setFilterAnchorEl(null); }}>Finishing</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('complete'); setFilterAnchorEl(null); }}>Complete</MenuItem>
                                            <MenuItem onClick={() => { setFilterStatus('cancelled'); setFilterAnchorEl(null); }}>Cancelled</MenuItem>
                                        </Menu>
                                    </Stack>
                                </Grid>
                            </Grid>
                        </TableCell>
                    </TableRow>
                    {table.getHeaderGroups().map(headerGroup => (
                        <TableRow key={headerGroup.id}>
                            {headerGroup.headers.map(colHeader => (
                                <TableCell
                                    key={colHeader.column.id}
                                    onClick={() => {
                                        if (isColumnSortable(colHeader.column)) {
                                            setSortBy(colHeader.column.id);
                                            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                        }
                                    }}
                                    style={{
                                        cursor: isColumnSortable(colHeader.column) ? 'pointer' : 'default',
                                        textAlign: (colHeader.column.id === 'status' || colHeader.column.id === 'actions') ? 'center' : 'left',
                                    }}
                                >
                                    {flexRender(getHeaderContent(colHeader.column), colHeader.getContext())}
                                    {sortBy === colHeader.column.id ? (sortDirection === 'desc' ? ' 🔽' : ' 🔼') : ''}
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableHead>
                <TableBody>
                    {!processedOrders ? (
                        <TableRowsLoader colsNum={11} rowsNum={10} />
                    ) : processedOrders.length > 0 ? (
                        processedOrders.map(row => (
                            <TableRow key={row._id}>
                                {table.getRowModel().rows.find(r => r.original._id === row._id)?.getVisibleCells().map(cell => (
                                    <TableCell
                                        key={cell.id}
                                        style={{
                                            textAlign: (cell.column.id === 'totalQuantity' || cell.column.id === 'finalTotalQuantity' || cell.column.id === 'status' || cell.column.id === 'actions') ? 'center' : 'left',
                                        }}
                                    >
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
    );
}

export default OrderGridMd;
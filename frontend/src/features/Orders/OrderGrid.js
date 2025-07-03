import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useReactTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, flexRender } from '@tanstack/react-table';
import { TableContainer, Table, TableBody, TableCell, TableHead, TableRow, Box, IconButton, Chip, Link, Typography } from '@mui/material';
import { Edit as EditIcon, CheckCircle, Cancel, ShoppingCartCheckout, ContentCut, LocalLaundryService, AutoAwesome } from '@mui/icons-material';
import { TableRowsLoader, NoRecordRow } from '../../components/Skeleton/TableSkeletonLoader';

function OrderGrid({ orders, search, onEditOrder }) {
    const navigate = useNavigate();

    const statusLabels = {
        1: 'Placed',
        2: 'Stitching',
        3: 'Washing',
        4: 'Finishing',
        5: 'Complete',
        6: 'Cancelled'
    };

    const statusIcons = {
        1: <ShoppingCartCheckout />,
        2: <ContentCut />,
        3: <LocalLaundryService />,
        4: <AutoAwesome />,
        5: <CheckCircle />,
        6: <Cancel />
    };

    const columns = [
        {
            accessorKey: 'orderId',
            header: 'Order ID',
            enableSorting: true,
            cell: ({ row }) => (
                <Box>
                    <Link component="button" onClick={() => navigate(`/stitching/${row.original._id}`)}>{row.original.orderId}</Link>
                </Box>
            )
        },
        {
            accessorKey: 'date',
            header: 'Date',
            enableSorting: true,
            cell: ({ row }) => new Date(row.original.date).toLocaleDateString()
        },
        {
            accessorKey: 'clientName',
            header: 'Client',
            enableSorting: true,
            cell: ({ row }) => row.original.clientId?.name || 'N/A'
        },
        {
            accessorKey: 'fitStyleName',
            header: 'Fit Style',
            enableSorting: true,
            cell: ({ row }) => row.original.fitStyleId?.name || 'N/A'
        },
        {
            accessorKey: 'fabric',
            header: 'Fabric',
            enableSorting: true
        },
        {
            accessorKey: 'waistSize',
            header: 'Waist Size',
            enableSorting: true
        },
        {
            accessorKey: 'totalQuantity',
            header: 'Qty',
            enableSorting: true
        },
        {
            accessorKey: 'finalTotalQuantity',
            header: 'Final Qty',
            enableSorting: true
        },
        {
            accessorKey: 'threadColors',
            header: 'Threads',
            cell: ({ row }) => (
                <Box>
                    {row.original.threadColors.map((tc, index) => (
                        <Typography key={index}>
                            {tc.color}, {tc.quantity} pcs
                        </Typography>
                    ))}
                </Box>
            )
        },
        {
            accessorKey: 'status',
            header: 'Status',
            enableSorting: true,
            cell: ({ row }) => {
                const status = row.original.status;
                const label = statusLabels[status] || 'Unknown';
                const icon = statusIcons[status] || null;
                return (
                    <Chip
                        icon={icon}
                        label={label}
                        color={
                            status === 1 ? 'primary' :
                                status === 2 ? 'primary' :
                                    status === 3 ? 'primary' :
                                        status === 4 ? 'primary' :
                                            status === 5 ? 'primary' :
                                                status === 6 ? 'secondary' : 'default'
                        }
                        sx={{ width: '100%', alignItems: 'center' }}
                    />
                );
            }
        },
        {
            accessorKey: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <IconButton onClick={() => onEditOrder(row.original)}>
                    <EditIcon />
                </IconButton>
            )
        }
    ];

    const table = useReactTable({
        columns,
        data: orders || [],
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        state: {
            globalFilter: search
        },
        globalFilterFn: (row, columnId, filterValue) => {
            const orderId = row.original.orderId?.toString().toLowerCase() || '';
            const clientName = row.original.clientId?.name?.toString().toLowerCase() || '';
            const fitStyleName = row.original.fitStyleId?.name?.toString().toLowerCase() || '';
            const fabric = row.original.fabric?.toString().toLowerCase() || '';
            const search = filterValue.toLowerCase();
            return (
                orderId.includes(search) ||
                clientName.includes(search) ||
                fitStyleName.includes(search) ||
                fabric.includes(search)
            );
        }
    });

    const getHeaderContent = (column) => column.columnDef && column.columnDef.header ? column.columnDef.header.toUpperCase() : column.id;
    const isColumnSortable = (column) => column.columnDef && column.columnDef.enableSorting === true;

    return (
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
                    {!orders ? (
                        <TableRowsLoader colsNum={11} rowsNum={10} />
                    ) : (orders && orders.length > 0 ? (
                        table.getRowModel().rows.map(row => (
                            <TableRow key={row.id}>
                                {row.getVisibleCells().map(cell => (
                                    <TableCell key={cell.id}>
                                        {flexRender(cell.column.columnDef.cell || cell.getValue(), cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))) : <NoRecordRow />)}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default OrderGrid;
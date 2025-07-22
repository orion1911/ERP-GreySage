import React, { useState, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { Link, IconButton, Chip, Box, Typography } from '@mui/material';
import { Edit as EditIcon, CheckCircle, Cancel, ShoppingCartCheckout, ContentCut, LocalLaundryService, AutoAwesome } from '@mui/icons-material';
import OrderGridSx from './OrderGridSx';
import OrderGridMd from './OrderGridMd';

function OrderGrid({ orders, search: globalSearch, onEditOrder }) {
    const navigate = useNavigate();
    const { isMobile } = useOutletContext();
    const [expandedRows, setExpandedRows] = useState({});
    const [sortBy, setSortBy] = useState('orderId'); // Default sort by Order ID
    const [sortDirection, setSortDirection] = useState('asc'); // Track sort direction
    const [filterAnchorEl, setFilterAnchorEl] = useState(null); // Filter menu anchor
    const [filterStatus, setFilterStatus] = useState(''); // Filter by status

    const statusLabels = {
        1: 'Placed',
        2: 'Stitching',
        3: 'Washing',
        4: 'Finishing',
        5: 'Complete',
        6: 'Cancelled',
    };

    const statusIcons = {
        1: <ShoppingCartCheckout />,
        2: <ContentCut />,
        3: <LocalLaundryService />,
        4: <AutoAwesome />,
        5: <CheckCircle />,
        6: <Cancel />,
    };

    // Custom sorting function with direction
    const sortData = (data, sortKey, direction) => {
        return [...data].sort((a, b) => {
            let valueA, valueB;
            if (sortKey === 'clientName') {
                valueA = a.clientId?.name || '';
                valueB = b.clientId?.name || '';
            } else if (sortKey === 'fitStyleName') {
                valueA = a.fitStyleId?.name || '';
                valueB = b.fitStyleId?.name || '';
            } else if (sortKey === 'orderId') {
                valueA = a.orderId || '';
                valueB = b.orderId || '';
            } else if (sortKey === 'date') {
                valueA = new Date(a.date);
                valueB = new Date(b.date);
            } else if (sortKey === 'fabric') {
                valueA = a.fabric || '';
                valueB = b.fabric || '';
            } else if (sortKey === 'status') {
                valueA = statusLabels[a.status] || '';
                valueB = statusLabels[b.status] || '';
            }
            if (typeof valueA === 'string' && typeof valueB === 'string') {
                return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
            }
            if (direction === 'asc') {
                return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
            } else {
                return valueA < valueB ? 1 : valueA > valueB ? -1 : 0;
            }
        });
    };

    // Custom filtering function
    const filterData = (data, statusFilter) => {
        return data.filter(order =>
            !statusFilter || statusLabels[order.status]?.toLowerCase().includes(statusFilter.toLowerCase())
        );
    };

    // Apply global search, custom sorting, and filtering
    const processedOrders = useMemo(() => {
        let filteredOrders = orders || [];
        if (globalSearch) {
            filteredOrders = filteredOrders.filter(order =>
                order.orderId?.toLowerCase().includes(globalSearch.toLowerCase()) ||
                order.clientId?.name?.toLowerCase().includes(globalSearch.toLowerCase()) ||
                order.fitStyleId?.name?.toLowerCase().includes(globalSearch.toLowerCase()) ||
                order.fabric?.toLowerCase().includes(globalSearch.toLowerCase())
            );
        }
        filteredOrders = filterData(filteredOrders, filterStatus);
        return sortData(filteredOrders, sortBy, sortDirection);
    }, [orders, globalSearch, sortBy, sortDirection, filterStatus]);

    const columns = [
        {
            accessorKey: 'orderId',
            header: 'Order ID',
            enableSorting: true,
            cell: ({ row }) => (
                <Link
                    component="button"
                    onClick={() => navigate(`/stitching/${row.original._id}`)}
                    sx={{ fontWeight: 'bold', textDecoration: 'underline' }}
                >
                    {row.original.orderId}
                </Link>
            ),
        },
        {
            accessorKey: 'date',
            header: 'Date',
            enableSorting: true,
            cell: ({ row }) => new Date(row.original.date).toLocaleDateString(),
        },
        {
            accessorKey: 'clientName',
            header: 'Client',
            enableSorting: true,
            cell: ({ row }) => row.original.clientId?.name || 'N/A',
        },
        {
            accessorKey: 'fitStyleName',
            header: 'Fit Style',
            enableSorting: true,
            cell: ({ row }) => row.original.fitStyleId?.name || 'N/A',
        },
        {
            accessorKey: 'fabric',
            header: 'Fabric',
            enableSorting: true,
        },
        {
            accessorKey: 'waistSize',
            header: 'Waist Size',
            enableSorting: true,
        },
        {
            accessorKey: 'totalQuantity',
            header: 'Qty',
            enableSorting: true,
        },
        {
            accessorKey: 'finalTotalQuantity',
            header: 'Final Qty',
            enableSorting: true,
        },
        {
            accessorKey: 'threadColors',
            header: 'Threads',
            cell: ({ row }) => (
                <Box>
                    {row.original.threadColors.map((tc, index) => (
                        <Typography key={index} variant="body2">
                            {tc.color}, {tc.quantity} pcs
                        </Typography>
                    ))}
                </Box>
            ),
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
                        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    />
                );
            },
        },
        {
            accessorKey: 'actions',
            header: 'Actions',
            cell: ({ row }) => (
                <IconButton onClick={() => onEditOrder(row.original)} size="small">
                    <EditIcon fontSize="small" />
                </IconButton>
            ),
        },
    ];

    const table = useReactTable({
        columns,
        data: processedOrders,
        getCoreRowModel: getCoreRowModel(),
    });

    const toggleRowExpansion = (rowId) => {
        setExpandedRows((prev) => ({
            ...prev,
            [rowId]: !prev[rowId],
        }));
    };

    return isMobile ? (
        <OrderGridSx
            processedOrders={processedOrders}
            navigate={navigate}
            expandedRows={expandedRows}
            toggleRowExpansion={toggleRowExpansion}
            statusLabels={statusLabels}
            statusIcons={statusIcons}
            onEditOrder={onEditOrder}
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortDirection={sortDirection}
            setSortDirection={setSortDirection}
            filterAnchorEl={filterAnchorEl}
            setFilterAnchorEl={setFilterAnchorEl}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
        />
    ) : (
        <OrderGridMd
            processedOrders={processedOrders}
            columns={columns}
            table={table}
            sortBy={sortBy}
            sortDirection={sortDirection}
            setSortBy={setSortBy}
            setSortDirection={setSortDirection}
            filterAnchorEl={filterAnchorEl}
            setFilterAnchorEl={setFilterAnchorEl}
            filterStatus={filterStatus}
            setFilterStatus={setFilterStatus}
        />
    );
}

export default OrderGrid;
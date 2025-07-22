import React from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Chip, Link, Typography, useTheme, Grid, Select, MenuItem, Menu } from '@mui/material';
import { Edit as EditIcon, ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, FilterList } from '@mui/icons-material';
import { OrderCardsLoader, NoRecordRow } from '../../components/Skeleton/SkeletonLoader';

function OrderGridSx({ processedOrders, navigate, expandedRows, toggleRowExpansion, statusLabels, statusIcons, onEditOrder, sortBy, setSortBy, sortDirection, setSortDirection, filterAnchorEl, setFilterAnchorEl, filterStatus, setFilterStatus }) {
    const theme = useTheme();

    return (
        <Box sx={{ pt: 1 }}>
            <Grid container spacing={2} sx={{ mb: 2, justifyContent: 'flex-end' }}>
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
                        >
                            <MenuItem value="orderId">Sort By Order ID</MenuItem>
                            <MenuItem value="date">Sort By Date</MenuItem>
                            <MenuItem value="clientName">Sort By Client</MenuItem>
                            <MenuItem value="fitStyleName">Sort By Fit Style</MenuItem>
                            <MenuItem value="fabric">Sort By Fabric</MenuItem>
                            <MenuItem value="status">Sort By Status</MenuItem>
                        </Select>
                        <IconButton
                            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                            sx={{ ml: 1 }}
                        >
                            {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
                        </IconButton>
                        <IconButton
                            onClick={(e) => setFilterAnchorEl(e.currentTarget)}
                        >
                            <FilterList />
                        </IconButton>
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
            {processedOrders.length > 0 ? (
                processedOrders.map((order) => (
                    <Card key={order._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
                        <CardContent>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="subtitle1" fontWeight="bold">
                                    <Link
                                        component="button"
                                        onClick={() => navigate(`/stitching/${order._id}`)}
                                        sx={{ textDecoration: 'underline' }}
                                    >
                                        {order.orderId}
                                    </Link>
                                </Typography>
                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                                    <Chip
                                        size="small"
                                        icon={statusIcons[order.status]}
                                        label={statusLabels[order.status] || 'Unknown'}
                                        color={
                                            order.status === 1 ? 'primary' :
                                                order.status === 2 ? 'primary' :
                                                    order.status === 3 ? 'primary' :
                                                        order.status === 4 ? 'primary' :
                                                            order.status === 5 ? 'primary' :
                                                                order.status === 6 ? 'secondary' : 'default'
                                        }
                                        sx={{ ml: 1, p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    />
                                </Typography>
                                <IconButton onClick={() => toggleRowExpansion(order._id)} size="small">
                                    <ExpandMoreIcon sx={{ transform: expandedRows[order._id] ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                </IconButton>
                            </Stack>
                            <Stack spacing={1} sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                    <strong>Client:</strong> {order.clientId?.name || 'N/A'}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>Quantity:</strong> {order.totalQuantity}
                                </Typography>
                            </Stack>
                            <Collapse in={expandedRows[order._id]}>
                                <Stack spacing={1} sx={{ mt: 2 }}>
                                    <Typography variant="body2">
                                        <strong>Date:</strong> {new Date(order.date).toLocaleDateString()}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Fit Style:</strong> {order.fitStyleId?.name || 'N/A'}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Fabric:</strong> {order.fabric}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Waist Size:</strong> {order.waistSize}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Final Qty:</strong> {order.finalTotalQuantity}
                                    </Typography>
                                    <Typography variant="body2">
                                        <strong>Threads:</strong>
                                        {order.threadColors.map((tc, index) => (
                                            <Box key={index} component="span" sx={{ display: 'block' }}>
                                                {tc.color}, {tc.quantity} pcs
                                            </Box>
                                        ))}
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        startIcon={<EditIcon />}
                                        onClick={() => onEditOrder(order)}
                                        size="small"
                                        sx={{ mt: 1 }}
                                    >
                                        Edit
                                    </Button>
                                </Stack>
                            </Collapse>
                        </CardContent>
                    </Card>
                ))
            ) : (
                <OrderCardsLoader />
            )}
        </Box>
    );
}

export default OrderGridSx;
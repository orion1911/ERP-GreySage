import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { TextField, Button,  Container, Typography, Box, Paper } from '@mui/material';
import { ShoppingCart } from '@mui/icons-material';
import apiService from '../../services/apiService';
import AddOrderModal from './AddOrderModal';
import OrderGrid from './OrderGrid';

function OrderManagement() {
  const { showSnackbar } = useOutletContext();
  const [orders, setOrders] = useState();
  const [clients, setClients] = useState([]);
  const [fitStyles, setFitStyles] = useState([]);
  const [search, setSearch] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const token = localStorage.getItem('token');

  const fetchData = async () => {
    try {
      const [ordersRes, clientsRes, fitStylesRes] = await Promise.all([
        apiService.orders.getOrders(),
        apiService.client.getClients(),
        apiService.fitStyles.getFitstyles()
      ]);
      setTimeout(() => setOrders(ordersRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setClients(clientsRes);
      setFitStyles(fitStylesRes);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        showSnackbar('Session expired. Please log in again', 'sessionError');
        // window.location.href = '/login';
      } else {
        console.log(err.response);
        showSnackbar(err.response?.data?.error, 'error');
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const onAddOrder = (newOrder) => {
    setOrders([...orders, newOrder]);
    setOpenModal(false);
  };

  const onUpdateOrder = (updatedOrder) => {
    setOrders(orders.map(o => o._id === updatedOrder._id ? updatedOrder : o));
    setOpenModal(false);
    setEditOrder(null);
  };

  const handleEditOrder = (order) => {
    setEditOrder(order);
    setOpenModal(true);
  };

  return (
    <Container sx={{ mt: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h4">Order Management</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'right', mb: 2 }}>
          <TextField
            label="Search Orders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            fullWidth
            variant="standard"
            sx={{ maxWidth: '190px' }}
          />
          <Button
            variant="contained"
            onClick={() => {
              setEditOrder(null); // Clear editOrder for add mode
              setOpenModal(true);
            }}
            endIcon={<ShoppingCart />}
            sx={{ mt: 2 }}
          >
            Add
          </Button>
        </Box>
        <OrderGrid
          orders={orders}
          clients={clients}
          fitStyles={fitStyles}
          search={search}
          onEditOrder={handleEditOrder}
        />
        <AddOrderModal
          open={openModal}
          onClose={() => {
            setOpenModal(false);
            setEditOrder(null);
          }}
          clients={clients}
          fitStyles={fitStyles}
          onAddOrder={onAddOrder}
          onUpdateOrder={onUpdateOrder}
          order={editOrder}
        />
      </Paper>
    </Container>
  );
}

export default OrderManagement;
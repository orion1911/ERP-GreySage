import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Container, Paper, Box, Grid, Stack, Typography, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateRangePicker } from '@mui/x-date-pickers-pro';
import { MorphDateTextField } from '../../components/MuiCustom.js';
import StatCard from './StatCard.js';
import apiService from '../../services/apiService.js';
import TotalQtyByClientBar from './TotalQtyByClientBar.js';

function Dashboard() {
  const { isMobile, showSnackbar } = useOutletContext();
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [orderStats, setOrderStats] = useState([]);
  const [productionStats, setProductionStats] = useState([]);
  const [dateRange, setDateRange] = useState([
    dayjs('2023-11-19'),
    dayjs(new Date()),
  ]);
  const [cardData, setCardData] = useState([]);
  const [sinceInceptionData, setSinceInceptionData] = useState();
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState('all');

  // Fetch clients for dropdown
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await apiService.client.getClients();
        setClients(response);
      } catch (error) {
        console.error('Error fetching clients:', error);
        showSnackbar('Error fetching clients', 'error');
      }
    };
    fetchClients();
  }, []);

  const fetchData = async () => {
    try {
      const params = {
        fromDate: dateRange[0].toISOString(),
        toDate: dateRange[1].toISOString(),
      };
      if (selectedClient !== 'all') {
        params.clientId = selectedClient;
      }

      const [orderStatsRes, productionStatsRes, statusSummaryRes] = await Promise.all([
        apiService.admin.dashboard.getOrderStats(),
        apiService.admin.dashboard.getProductionStats(),
        apiService.admin.dashboard.getOrderStatusSummary(params),
      ]);

      setTimeout(() => setOrderStats(orderStatsRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setTimeout(() => setProductionStats(productionStatsRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setTimeout(() => {
        // Use byClient data if a specific client is selected, otherwise use overall
        setCardData(selectedClient === 'all' ? statusSummaryRes.overall : statusSummaryRes.byClient);
        setSinceInceptionData(statusSummaryRes.sinceInception);
      }, process.env.REACT_APP_DATA_LOAD_TIMEOUT);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        showSnackbar('Session expired. Please log in again', 'sessionError');
      } else {
        showSnackbar(err.response?.data?.error || 'Error fetching data', 'error');
      }
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, dateRange, selectedClient]);

  return (
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Typography variant="h4">Dashboard</Typography>
        </Grid>
        <Grid size={{ xs: 6, sm: 4, md: 2 }} sx={{ mb: 3, mt: 2, textAlign: 'center' }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateRangePicker
              value={dateRange}
              onChange={(newValue) => setDateRange(newValue)}
              format="DD/MM/YY"
              slots={{ textField: MorphDateTextField }}
              slotProps={{ textField: { variant: 'standard', size: 'medium' } }}
              sx={{ width: '95%' }}
            />
          </LocalizationProvider>
        </Grid>
        <Grid size={{ xs: 6, sm: 2, md: 2 }} sx={{ mb: 3, mt: 2.3, textAlign: 'center' }}>
          <FormControl fullWidth>
            {/* <InputLabel id="client-select-label">Client</InputLabel> */}
            <Select
              labelId="client-select-label"
              id="client"
              value={selectedClient}
              label="Client"
              size='small'
              variant='standard'
              onChange={(e) => setSelectedClient(e.target.value)}
            >
              <MenuItem value="all">All</MenuItem>
              {clients.map(client => (
                <MenuItem key={client._id} value={client._id}>
                  {client.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>
      <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
        <Grid
          container
          spacing={2}
          columns={12}
          sx={{ mb: 2 }}
        >
          {cardData.map((card, index) => (
            <Grid key={index} size={{ xs: 6, sm: 6, lg: 4 }}>
              <StatCard {...card} />
            </Grid>
          ))}
          {sinceInceptionData && <Grid key="since-inception" size={{ xs: 6, sm: 6, lg: 4 }}>
            <StatCard {...sinceInceptionData} />
          </Grid>}
          <Grid size={{ xs: 12, md: 12 }}>
            <TotalQtyByClientBar dateRange={dateRange} />
          </Grid>
        </Grid>
      </Box>
    </>
  );
}

export default Dashboard;
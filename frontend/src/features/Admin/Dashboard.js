import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Container, Paper, Box, Grid, Stack, Typography } from '@mui/material';
import dayjs from 'dayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateRangePicker } from '@mui/x-date-pickers-pro';
import { MorphDateTextField } from '../../components/MuiCustom.js';
import StatCard from './StatCard.js';
import apiService from '../../services/apiService.js';
import TotalQtyByClientBar from './TotalQtyByClientBar.js';


const data = [
  {
    title: 'Open Orders',
    value: '14k',
    interval: 'Last 30 days',
    trend: 'up',
    data: [
      200, 24, 220, 260, 240, 380, 100, 240, 280, 240, 300, 340, 320, 360, 340, 380,
      360, 400, 380, 420, 400, 640, 340, 460, 440, 480, 460, 600, 880, 920,
    ],
  },
  {
    title: 'In Stitching',
    value: '18k',
    interval: 'Last 30 days',
    trend: 'down',
    data: [
      1640, 1250, 970, 1130, 1050, 900, 720, 1080, 900, 450, 920, 820, 840, 600, 820,
      780, 800, 760, 380, 740, 660, 620, 840, 500, 520, 480, 400, 360, 300, 220,
    ],
  },
  {
    title: 'In Washing',
    value: '12k',
    interval: 'Last 30 days',
    trend: 'neutral',
    data: [
      500, 400, 510, 530, 520, 600, 530, 520, 510, 730, 520, 510, 530, 620, 510, 530,
      520, 410, 530, 520, 610, 530, 520, 610, 530, 420, 510, 430, 520, 510,
    ],
  },
  {
    title: 'In Finishing',
    value: '2k',
    interval: 'Last 30 days',
    trend: 'neutral',
    data: [
      500, 400, 510, 530, 520, 600, 530, 520, 510, 730, 520, 510, 530, 620, 510, 530,
      520, 410, 530, 520, 610, 530, 520, 610, 530, 420, 510, 430, 520, 510,
    ],
  },
];

function Dashboard() {
  const { isMobile, showSnackbar } = useOutletContext();
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [orderStats, setOrdertats] = useState();
  const [productionStats, setProductionStats] = useState();
  // const [dateRange, setDateRange] = React.useState({
  //   fromDate: dayjs('2022-11-19'),
  //   toDate: dayjs(new Date()),
  // });
  const [dateRange, setDateRange] = React.useState([
    dayjs('2022-04-17'),
    dayjs('2022-04-21'),
  ]);

  const [cardData, setCardData] = useState([]);

  const fetchData = async () => {
    try {
      const [orderStatsRes, productionStatsRes] = await Promise.all([
        apiService.admin.dashboard.getOrderStats(),
        apiService.admin.dashboard.getProductionStats()
      ]);
      setTimeout(() => setOrdertats(orderStatsRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
      setTimeout(() => setProductionStats(productionStatsRes), process.env.REACT_APP_DATA_LOAD_TIMEOUT);
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

  return (
    // <Container maxWidth={false} disableGutters={isMobile ? true : false} sx={{ mt: 4 }}>
    //   <Typography variant="h4">Welcome, {user.username} ({user.role})</Typography>
    // </>
    <>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 6, md: 4, }}>
          <Typography variant="h4">Dashboard</Typography>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }} sx={{ mb: 3, mt: 1, textAlign: 'center' }}>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DateRangePicker
              // label='From Date'
              value={dateRange}
              onChange={(newValue) => setDateRange(newValue)}
              format='DD-MMM-YYYY'
              slots={{ textField: MorphDateTextField }}
              slotProps={{ textField: { variant: 'standard', size: 'medium' } }}
              sx={{ width: '95%' }}
            />
          </LocalizationProvider>
          {/* <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DatePicker
                // label='To Date'
                value={dateRange.toDate}
                onChange={(newValue) => setDateRange(...dateRange, { toDate: newValue })}
                format='DD-MMM-YYYY'
                slots={{ textField: MorphDateTextField }}
                sx={{ width: 155, float: 'right' }}
              />
            </LocalizationProvider> */}
        </Grid>
        {/* <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label='To Date'
              value={dateRange.toDate}
              onChange={(newValue) => setDateRange(...dateRange, { toDate: newValue })}
              format='DD-MMM-YYYY'
              slots={{ textField: MorphDateTextField }}
              sx={{ width: 165 }}
            />
          </LocalizationProvider>
          </Grid> */}
      </Grid>
      <Box sx={{ width: '100%', maxWidth: { sm: '100%', md: '1700px' } }}>
        <Grid
          container
          spacing={2}
          columns={12}
          sx={{ mb: 2 }}
        >
          {data.map((card, index) => (
            <Grid key={index} size={{ xs: 6, sm: 6, lg: 4 }}>
              <StatCard {...card} />
            </Grid>
          ))}
          {/* <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <HighlightedCard />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <SessionsChart />
                </Grid> */}
          <Grid size={{ xs: 12, md: 12 }}>
            <TotalQtyByClientBar />
          </Grid>
        </Grid>
        {/* <Typography component="h2" variant="h6" sx={{ mb: 2 }}>
                Details
              </Typography>
              <Grid container spacing={2} columns={12}>
                <Grid size={{ xs: 12, lg: 9 }}>
                  <CustomizedDataGrid />
                </Grid>
                <Grid size={{ xs: 12, lg: 3 }}>
                  <Stack gap={2} direction={{ xs: 'column', sm: 'row', lg: 'column' }}>
                    <CustomizedTreeView />
                    <ChartUserByCountry />
                  </Stack>
                </Grid>
              </Grid>
              <Copyright sx={{ my: 4 }} /> */}
      </Box>
    </>
  );
}

export default Dashboard;
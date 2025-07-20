import * as React from 'react';
import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart } from '@mui/x-charts/BarChart';
import { useTheme } from '@mui/material/styles';
import apiService from '../../services/apiService.js';
import { Box, Stack, Card, CardContent, Chip, FormControl, Select, MenuItem, Typography } from '@mui/material';
import { TotalQtyByClientBarSkeleton } from '../../components/Skeleton/SkeletonLoader.js';

export default function TotalQtyByClientBar({ dateRange }) {
  const { isMobile, showSnackbar } = useOutletContext();
  const theme = useTheme();
  const [interval, setInterval] = useState('monthly');
  const [totalQuantity, setTotalQuantity] = useState(0);
  const [trend, setTrend] = useState('neutral');
  const [chartData, setChartData] = useState([]);
  const [labels, setLabels] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const params = {
          fromDate: dateRange[0].toISOString(),
          toDate: dateRange[1].toISOString(),
          interval: interval,
        };
        // const response = await apiService.admin.dashboard.getAllClientStats(params);
        const [response] = await Promise.all([
          apiService.admin.dashboard.getAllClientStats(params)
        ]);
        setTimeout(() => setChartData(response.series), process.env.REACT_APP_DATA_LOAD_TIMEOUT);

        setTotalQuantity(response.totalQuantity);
        setTrend(response.trend);
        // setChartData(response.series);
        setLabels(response.labels);
      } catch (error) {
        console.error('Error fetching client monthly quantities:', error);
      }
    };

    fetchData();
  }, [dateRange, interval]);

  const colorPalette = [
    (theme.vars || theme).palette.primary.dark,
    (theme.vars || theme).palette.primary.light,
    (theme.vars || theme).palette.secondary.main,
  ];

  return (
    <>
      {chartData.length > 0 ? <Card variant="outlined">
        <CardContent>
          <Typography component="h2" variant="subtitle2" gutterBottom>
            Total Quantity by Client
          </Typography>
          <Box sx={{ float: 'right', mb: 2 }}>
            <FormControl fullWidth>
              <Select
                labelId="interval-select-label"
                id="interval"
                value={interval}
                label="Interval"
                size='small'
                variant='standard'
                onChange={(e) => setInterval(e.target.value)}
              >
                <MenuItem value="yearly">Yearly</MenuItem>
                <MenuItem value="quarterly">Quarterly</MenuItem>
                <MenuItem value="monthly">Monthly</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Stack sx={{ justifyContent: 'space-between' }}>
            <Stack
              direction="row"
              sx={{
                alignContent: { xs: 'center', sm: 'flex-start' },
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Typography variant="h4" component="p">
                {totalQuantity.toLocaleString()}
              </Typography>
              <Chip size="small" color={trend === 'up' ? 'success' : 'default'} label={trend === 'up' ? '+8%' : '+5%'} />
            </Stack>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {labels.length > 0 ? `Total Quantity ${labels[0]} - ${labels[labels.length - 1]}` : 'Total Quantity for the selected period'}
            </Typography>
          </Stack>
          <BarChart
            borderRadius={8}
            colors={colorPalette}
            xAxis={[
              {
                scaleType: 'band',
                categoryGapRatio: isMobile ? 0.1 : 0.5,
                data: labels,
              },
            ]}
            series={chartData}
            height={250}
            margin={{ left: 0, right: 0, top: 20, bottom: 20 }}
            grid={{ horizontal: true }}
            slotProps={{
              legend: {
                hidden: true,
              },
            }}
          />
        </CardContent>
      </Card> : <TotalQtyByClientBarSkeleton />}
    </>
  );
}
import React, { useState, useMemo } from 'react';
import { Box, Card, CardContent, Stack, Collapse, Button, IconButton, Typography, useTheme, Grid, Select, MenuItem, Tooltip } from '@mui/material';
import { ExpandMore as ExpandMoreIcon, ArrowUpward, ArrowDownward, Edit as EditIcon, Delete as DeleteIcon, Check as CheckIcon } from '@mui/icons-material';
import { OrderCardsLoader } from '../../components/Skeleton/SkeletonLoader';

function ProductCatalogSx({
  products,
  search,
  loading,
  handleToggleActive,
  showSnackbar,
  handleEditProduct
}) {
  const theme = useTheme();
  const [expandedRows, setExpandedRows] = useState({});
  const [sortBy, setSortBy] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const sortData = (data, sortKey, direction) => {
    if (!data || !Array.isArray(data)) return [];
    return [...data].sort((a, b) => {
      let valueA = '';
      let valueB = '';
      if (sortKey === 'name') {
        valueA = a.name || '';
        valueB = b.name || '';
      } else if (sortKey === 'description') {
        valueA = a.description || '';
        valueB = b.description || '';
      } else if (sortKey === 'isActive') {
        valueA = a.isActive ? 1 : 0;
        valueB = b.isActive ? 1 : 0;
      }
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return direction === 'asc' ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }
      return direction === 'asc' ? valueA - valueB : valueB - valueA;
    });
  };

  const filteredProducts = useMemo(() => {
    return products.filter(product =>
      product.name?.toLowerCase().includes(search.toLowerCase()) ||
      product.description?.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, search]);

  const processedProducts = useMemo(() => {
    return sortData(filteredProducts, sortBy, sortDirection);
  }, [filteredProducts, sortBy, sortDirection]);

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
              <MenuItem value="name">Sort By Design</MenuItem>
              <MenuItem value="description">Sort By Description</MenuItem>
              {/* <MenuItem value="isActive">Sort By Status</MenuItem> */}
            </Select>
            <IconButton
              onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
              sx={{ ml: 1 }}
            >
              {sortDirection === 'asc' ? <ArrowUpward /> : <ArrowDownward />}
            </IconButton>
          </Stack>
        </Grid>
      </Grid>
      {!processedProducts ? (
        <OrderCardsLoader type="product" />
      ) : processedProducts.length > 0 ? (
        processedProducts.map((product) => (
          <Card key={product._id} variant="outlined" sx={{ pt: 1, mb: 2, boxShadow: 1, backgroundColor: `${theme.palette.background.paper} !important` }}>
            <CardContent>
              <Stack>
                <Grid container spacing={1} sx={{ textAlign: 'center' }}>
                  <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {product.name || 'N/A'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, sm: 4 }} sx={{ textAlign: 'right' }}>
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Tooltip title={product.isActive ? 'Disable' : 'Enable'}>
                        <IconButton
                          variant="contained"
                          color={product.isActive ? 'warning' : 'success'}
                          size="small"
                          disabled={loading}
                          onClick={() => handleToggleActive(product._id)}
                          sx={{ mt: 0.2 }}
                        >
                          {product.isActive ? <DeleteIcon /> : <CheckIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton
                          variant="contained"
                          color="primary"
                          size="small"
                          disabled={loading}
                          onClick={() => handleEditProduct(product)}
                          sx={{ mt: 0.2 }}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 8, sm: 8 }} sx={{ textAlign: 'left' }}>
                    <Typography variant="body2">
                      <strong>Description</strong><br />
                      {product.description || 'N/A'}
                    </Typography>
                  </Grid>
                </Grid>
              </Stack>
            </CardContent>
          </Card>
        ))
      ) : (
        <Typography variant="body1" sx={{ textAlign: 'center' }}>No records found</Typography>
      )}
    </Box>
  );
}

export default ProductCatalogSx;
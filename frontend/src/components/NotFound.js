import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';

function NotFound() {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center', p: 3 }}>
      <Typography variant="h1" sx={{ fontSize: '6rem', fontWeight: 'bold', mb: 2 }}>404</Typography>
      <Typography variant="h5" sx={{ mb: 3 }}>Page Not Found</Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        The page you are looking for does not exist or has been moved.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboardxl')} size="large">
        Go to Dashboard
      </Button>
    </Box>
  );
}

export default NotFound;

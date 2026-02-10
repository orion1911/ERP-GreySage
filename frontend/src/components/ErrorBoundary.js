import React from 'react';
import { Box, Typography, Button, keyframes } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SettingsIcon from '@mui/icons-material/Settings';

const float = keyframes`
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-12px) rotate(-3deg); }
  75% { transform: translateY(-6px) rotate(3deg); }
`;

const spinSlow = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.15; transform: scale(1.3); }
`;

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', p: 3 }}>
          {/* Animated illustration */}
          <Box sx={{ position: 'relative', width: 160, height: 160, mb: 3 }}>
            {/* Pulsing background circle */}
            <Box sx={{
              position: 'absolute', top: '50%', left: '50%',
              width: 120, height: 120,
              borderRadius: '50%',
              bgcolor: 'error.main',
              transform: 'translate(-50%, -50%)',
              animation: `${pulse} 3s ease-in-out infinite`,
            }} />
            {/* Spinning gear — top-left */}
            <SettingsIcon sx={{
              position: 'absolute', top: 4, left: 8,
              fontSize: 36, color: 'text.disabled',
              animation: `${spinSlow} 6s linear infinite`,
            }} />
            {/* Spinning gear — bottom-right (counter) */}
            <SettingsIcon sx={{
              position: 'absolute', bottom: 8, right: 8,
              fontSize: 28, color: 'text.disabled',
              animation: `${spinSlow} 4s linear infinite reverse`,
            }} />
            {/* Floating warning icon */}
            <WarningAmberIcon sx={{
              position: 'absolute', top: '50%', left: '50%',
              fontSize: 72,
              color: 'error.main',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
              transform: 'translate(-50%, -50%)',
              animation: `${float} 4s ease-in-out infinite`,
            }} />
          </Box>

          <Typography variant="h1" sx={{ fontSize: '4rem', fontWeight: 'bold', mb: 1 }}>Oops</Typography>
          <Typography variant="h5" sx={{ mb: 2, color: 'text.secondary' }}>Something went wrong</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
            An unexpected error occurred. Please try again or go back to the dashboard.
          </Typography>
          <Button variant="contained" onClick={() => { this.setState({ hasError: false }); window.location.href = '/dashboard'; }} size="large">
            Go to Dashboard
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

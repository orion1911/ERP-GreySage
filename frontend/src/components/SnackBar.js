import React from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

export const SnackBar = ({
  open = false,
  message = '',
  severity = 'error', // success, error, warning, info
  autoHideDuration = 4000, // Auto-close after 4 seconds
  anchorOrigin = { vertical: 'bottom', horizontal: 'right' },
}) => {
  // Ensure message is a valid ReactNode (string or null)
  const safeMessage = typeof message === 'string' || React.isValidElement(message) ? message : 'Invalid message';

  return (
    <Snackbar
      open={open}
      autoHideDuration={autoHideDuration}
      anchorOrigin={anchorOrigin}
    >
      <Alert
        severity={severity === 'sessionError' ? 'error' : severity }
        variant="filled"
        sx={{ width: '100%' }}
      >
        {safeMessage}
      </Alert>
    </Snackbar>
  );
};
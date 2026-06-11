import React from 'react';
import { Chip } from '@mui/material';
import { ShoppingCartCheckout, ContentCut, LocalLaundryService, AutoAwesome, CheckCircle, LocalShipping, DoneAll } from '@mui/icons-material';

const statusLabels = {
  1: 'Placed',
  2: 'Stitching',
  3: 'Washing',
  4: 'Finishing',
  5: 'Finished',
  6: 'Part Dispatch',
  7: 'Dispatched',
};

const statusIcons = {
  1: <ShoppingCartCheckout fontSize='small' />,
  2: <ContentCut fontSize='small' />,
  3: <LocalLaundryService fontSize='small' />,
  4: <AutoAwesome fontSize='small' />,
  5: <CheckCircle fontSize='small' />,
  6: <LocalShipping fontSize='small' />,
  7: <DoneAll fontSize='small' />,
};

const OrderStatusChip = ({ status }) => {
  const label = statusLabels[status] || 'Unknown';
  const icon = statusIcons[status] || null;

  // Dispatched (7) gets a custom teal so it doesn't clash with Finished (5)'s green —
  // matches the dashboard's "Dispatched" KPI card colour (#2AA89A).
  const isDispatched = status === 7;
  const isPartial = status === 6;
  const themeColor =
    status === 1 ? 'default' :   // Placed
    status === 2 ? 'primary' :   // Stitching
    status === 3 ? 'secondary' : // Washing
    status === 4 ? 'warning' :   // Finishing
    status === 5 ? 'success' :   // Finished / Ready to dispatch
    status === 6 ? 'info' :      // Partial Dispatch
    'default';

  // Dispatched → teal bg + white text. Partial Dispatch → keep info bg but force white
  // text/icon so it reads the same as Finished.
  const customSx = isDispatched
    ? { bgcolor: '#2AA89A', color: '#fff', '& .MuiChip-icon': { color: '#fff' } }
    : isPartial
      ? { color: '#fff', '& .MuiChip-icon': { color: '#fff' } }
      : {};

  return (
    <Chip
      icon={icon}
      label={label}
      size='small'
      color={isDispatched ? undefined : themeColor}
      sx={{
        height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        ...customSx
      }}
    />
  );
};

export default OrderStatusChip;
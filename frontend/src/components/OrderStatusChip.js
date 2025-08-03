import React from 'react';
import { Chip } from '@mui/material';
import { ShoppingCartCheckout, ContentCut, LocalLaundryService, AutoAwesome, CheckCircle, Cancel } from '@mui/icons-material';

const statusLabels = {
  1: 'Placed',
  2: 'Stitching',
  3: 'Washing',
  4: 'Finishing',
  5: 'Complete',
  6: 'Cancelled',
};

const statusIcons = {
  1: <ShoppingCartCheckout fontSize='small' />,
  2: <ContentCut fontSize='small' />,
  3: <LocalLaundryService fontSize='small' />,
  4: <AutoAwesome fontSize='small' />,
  5: <CheckCircle fontSize='small' />,
  6: <Cancel fontSize='small' />,
};

const OrderStatusChip = ({ status }) => {
  const label = statusLabels[status] || 'Unknown';
  const icon = statusIcons[status] || null;

  return (
    <Chip
      icon={icon}
      label={label}
      size='small'
      color={
        status === 1 ? 'primary' :
        status === 2 ? 'primary' :
        status === 3 ? 'primary' :
        status === 4 ? 'primary' :
        status === 5 ? 'primary' :
        status === 6 ? 'secondary' : 'default'
      }
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    />
  );
};

export default OrderStatusChip;
import React from 'react';
import { PickersTextField } from '@mui/x-date-pickers/PickersTextField';


export const MorphDateTextField = React.forwardRef((props, ref) => (
  <PickersTextField
    {...props}
    ref={ref}
    size={props.size || 'small'}
    variant={props.variant || 'outlined'}
    // sx={{ textAlign: 'center' }}
  />
));
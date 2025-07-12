import React from 'react';
import { PickersTextField } from '@mui/x-date-pickers/PickersTextField';


export const MorphDateTextField = React.forwardRef((props, ref) => (
  <PickersTextField {...props} ref={ref} size="small" variant='outlined' />
));
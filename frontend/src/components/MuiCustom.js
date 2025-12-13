import React from 'react';
import { EditCalendar } from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
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

export const MorphDateIconField = React.forwardRef((props, ref) => {
  return (
    <DatePicker
      {...props}
      ref={ref}
      enableAccessibleFieldDOMStructure={false}
      slotProps={{
        textField: {
          InputProps: {
            sx: {
              input: { display: 'none' },         // hide the text input
              '& fieldset': { display: 'none' },  // hide the outline
            },
          },
        },
        openPickerButton: {
          children: <EditCalendar />,
          sx: { p: 0, m: 0 },
        },
      }}
    />
  );
});
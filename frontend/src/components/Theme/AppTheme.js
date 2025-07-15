import * as React from 'react';
import PropTypes from 'prop-types';
import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import { typographyClasses } from '@mui/material/Typography';
import { inputsCustomizations } from './customizations/inputs';
import { dataDisplayCustomizations } from './customizations/dataDisplay';
import { feedbackCustomizations } from './customizations/feedback';
import { navigationCustomizations } from './customizations/navigation';
import { surfacesCustomizations } from './customizations/surfaces';
import { getDesignTokens, typography, shadows, shape } from './themePrimitives';
import { ThemeProvider as CustomThemeProvider } from './ThemeContext';

function AppTheme({ children, variant = 'purple', setVariant, setDarkMode: setDarkModeProp }) {
  const [darkMode, setDarkMode] = React.useState(true);
  // const [darkMode, setDarkMode] = React.useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  // React.useEffect(() => {
  //   const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  //   const handleChange = (e) => {
  //     setDarkMode(e.matches);
  //     if (setDarkModeProp) setDarkModeProp(e.matches);
  //   };
  //   mediaQuery.addEventListener('change', handleChange);
  //   document.documentElement.setAttribute('data-mui-color-scheme', darkMode ? 'dark' : 'light');
  //   return () => mediaQuery.removeEventListener('change', handleChange);
  // }, [darkMode, setDarkModeProp]);

  const theme = React.useMemo(() => {
    const mode = darkMode ? 'dark' : 'light';
    // const mode = 'dark';
    const designTokens = getDesignTokens(mode, variant);
    return createTheme({
      cssVariables: { colorSchemeSelector: 'data-mui-color-scheme', cssVarPrefix: 'template' },
      palette: designTokens.palette,
      typography,
      shadows,
      shape,
      components: {
        ...inputsCustomizations,
        ...dataDisplayCustomizations,
        ...feedbackCustomizations,
        ...navigationCustomizations,
        ...surfacesCustomizations,
        MuiInputLabel: {
          // styleOverrides: {
          //   root: {
          //     top: '0',
          //     transform: 'translate(14px, 50%) scale(1)',
          //     '&:not(.MuiInputLabel-shrink)': {
          //       transform: 'translate(14px, 18px) scale(1)',
          //     },
          //     '&.MuiInputLabel-shrink': {
          //       transform: 'translate(14px, -6px) scale(0.75)',
          //       backgroundColor: designTokens.palette.background.paper,
          //       padding: '0 5px',
          //       textDecoration: 'none',
          //     },
          //     '&.Mui-focused': {
          //       textDecoration: 'none',
          //     },
          //   },
          //   outlined: {
          //     '&.MuiInputLabel-shrink': {
          //       transform: 'translate(14px, -6px) scale(0.75)',
          //     },
          //   },
          // },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            // root: {
            //   '& .MuiInputLabel-root:not(.MuiInputLabel-shrink)': {
            //     transform: 'translate(14px, 18px) scale(1)',
            //   },
            //   '& .MuiInputLabel-root.Mui-focused, & .MuiInputLabel-root.MuiInputLabel-shrink': {
            //     transform: 'translate(14px, -6px) scale(0.75)',
            //   },
            // },
            // notchedOutline: {
            //   borderColor: designTokens.palette.grey[400],
            //   '& legend': {
            //     display: 'block',
            //     padding: '0 5px',
            //   },
            // },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            root: ({ theme }) => ({
              '& .MuiDrawer-paper': {
                // borderRight: `1px solid ${theme.palette.divider}`,
                ...(mode === 'light' && {
                  backgroundColor: 'hsl(0deg 0% 99%)',
                  boxShadow: '14px 17px 40px 4px #7090b014',
                  color: theme.palette.text.primary, // Reference themePrimitives.js
                }),
              },
            }),
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: ({ theme }) => ({
              ...(mode === 'light' && {
                backgroundColor: 'hsl(0deg 0% 99%)',
                boxShadow: '14px 17px 40px 4px #7090b014',
                borderRadius: '10px',
              }),
            }),
          },
        },
        // MuiListItemButton: {
        //   styleOverrides: {
        //     root: ({ theme }) => ({
        //       '&:hover': {
        //         ...(theme.palette.mode === 'light' && {
        //           backgroundColor: theme.palette.primary.light,
        //           [`& .${typographyClasses.root}`]: {
        //             color: theme.palette.text.primary, // Dark text for contrast in light mode
        //           },
        //         }),
        //         ...theme.applyStyles('dark', {
        //           backgroundColor: theme.palette.primary.dark,
        //           [`& .${typographyClasses.root}`]: {
        //             color: theme.palette.text.primary, // White text in dark mode
        //           },
        //         }),
        //       },
        //       '&.Mui-selected': {
        //         backgroundColor: theme.palette.primary.dark,
        //       },
        //     }),
        //   },
        // },
        MuiListItemText: {
          styleOverrides: {
            root: ({ theme }) => ({
              '& .MuiTypography-root': {
                ...(mode === 'light' && {
                  color: theme.palette.text.primary, // Reference themePrimitives.js
                }),
              },
            }),
          },
        },
        MuiIconButton: {
          defaultProps: {
            size: 'small',
          },
          styleOverrides: {
            root: ({ theme }) => ({
              ...(mode === 'light' && {
                color: theme.palette.text.primary, // Reference themePrimitives.js
              }),
            }),
          },
        },
        MuiSelect: {
          defaultProps: {
            size: 'small',
          },
          styleOverrides: {
            root: ({ theme }) => ({
              // backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              ...(mode === 'light' && {
                color: theme.palette.text.primary, // Reference themePrimitives.js
                '& .MuiSvgIcon-root': {
                  color: theme.palette.text.primary, // Reference themePrimitives.js
                },
              }),
            }),
          },
        },
        MuiButton: {
          defaultProps: {
            size: 'small',
          },
          styleOverrides: {
            contained: ({ theme }) => ({
              '&:hover': {
                backgroundColor: theme.palette.primary.dark,
                color: theme.palette.primary.contrastText,
              },
            }),
            containedError: ({ theme }) => ({
              '&:hover': {
                backgroundColor: theme.palette.error.dark,
                color: theme.palette.error.contrastText,
              },
            }),
          },
        },
        MuiTextField: {
          defaultProps: {
            size: 'small',
          },
        },
        MuiTable: {
          styleOverrides: {
            root: ({ theme }) => ({
              borderCollapse: 'collapse',
              backgroundColor: theme.palette.background.paper,
              border: 0,
              width: '100%',
            }),
          },
        },
        MuiTableHead: {
          styleOverrides: {
            root: ({ theme }) => ({
              backgroundColor: 'transparent',
              color: theme.palette.text.tableHeader, // Reference themePrimitives.js
              ...(mode === 'dark' && {
                backgroundColor: theme.palette.grey[800],
                color: theme.palette.text.primary,
              }),
            }),
          },
        },
        // MuiTableRow: {
        //   styleOverrides: {
        //     root: ({ theme }) => ({
        //       '&:nth-of-type(odd)': {
        //         // backgroundColor: theme.palette.action.hover,
        //       },
        //       '&:hover': {
        //         backgroundColor: theme.palette.action.selected,
        //       },
        //     }),
        //   },
        // },
        MuiTableCell: {
          styleOverrides: {
            root: ({ theme }) => ({
              borderBottom: `1px solid ${theme.palette.divider}`,
              padding: theme.spacing(1),
              color: theme.palette.text.primary,
              verticalAlign: 'middle',
            }),
            head: ({ theme }) => ({
              fontWeight: 'bold',
              color: theme.palette.text.primary,
              borderBottom: `1px solid ${theme.palette.divider}`,
              padding: theme.spacing(1),
              ...(mode === 'light' && {
                color: theme.palette.text.tableHeader, // Reference themePrimitives.js
                fontSize: '.85rem',
              }),
            }),
          },
        },
      },
    });
  }, [darkMode, variant]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.setAttribute('data-mui-color-scheme', newMode ? 'dark' : 'light');
  };

  return (
    <CustomThemeProvider value={{ toggleDarkMode, setVariant }}>
      <MuiThemeProvider theme={theme} key={darkMode ? 'dark' : 'light'}>
        {children}
      </MuiThemeProvider>
    </CustomThemeProvider>
  );
}

AppTheme.propTypes = {
  children: PropTypes.node,
  variant: PropTypes.oneOf(['purple', 'earthy', 'monochrome']),
  setVariant: PropTypes.func,
  setDarkMode: PropTypes.func,
};

export default AppTheme;
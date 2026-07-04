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
  // Initialize darkMode from localStorage, default to true (dark mode)
  const [darkMode, setDarkMode] = React.useState(() => {
    const saved = localStorage.getItem('darkMode');
    return saved !== null ? JSON.parse(saved) : true;
  });

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

  // Apply data-mui-color-scheme attribute on mount and when darkMode changes
  React.useEffect(() => {
    document.documentElement.setAttribute('data-mui-color-scheme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

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
        // Global Paper styling — applied to every <Paper>, and inherited by
        // <Card>, <Dialog>, <Menu>, <Popover>, etc., since they're all Paper
        // underneath. Anything that should match the Sidebar's surface gets it
        // automatically; no per-component sx override needed.
        //
        //  * backgroundColor: palette.background.paper — exact tone of the
        //    sidebar Box, so cards on a page can't drift to a different shade.
        //  * backgroundImage: 'none' — strips MUI's dark-mode elevation overlay
        //    (a translucent white linear-gradient) which would otherwise make
        //    Paper render LIGHTER than the Sidebar's plain Box at any non-zero
        //    elevation.
        //  * Shared rounded corners (10px) in both modes for consistency.
        //  * Explicit shadows for BOTH modes — the prior light-only shadow used
        //    `#7090b014` (alpha 0.08), too faint to perceive against the slight
        //    blue page background. Dark-mode default Paper shadow was hard to
        //    see on dark.default too. These values give an obvious "card lifted
        //    off the page" feel at any elevation.
        //  * `variant: 'outlined'` Cards opt out via `MuiPaper-outlined` class
        //    (MUI's default), so they keep the border-only look they choose.
        MuiPaper: {
          styleOverrides: {
            root: ({ theme }) => ({
              backgroundColor: theme.palette.background.paper,
              backgroundImage: 'none',
              borderRadius: '10px',
              boxShadow: mode === 'light'
                ? '0 4px 16px rgba(17, 27, 74, 0.10)'   // soft cool-blue cast picks up the page tint
                : '0 4px 16px rgba(0, 0, 0, 0.45)',     // stronger on dark.default to read clearly
            }),
          },
        },
        // Card extends Paper but defines its own MuiCard-root class, so we
        // mirror the Paper override here so Card surfaces match Paper exactly.
        MuiCard: {
          styleOverrides: {
            root: ({ theme }) => ({
              backgroundColor: theme.palette.background.paper,
              backgroundImage: 'none',
              borderRadius: '10px',
              boxShadow: mode === 'light'
                ? '0 4px 16px rgba(17, 27, 74, 0.10)'
                : '0 4px 16px rgba(0, 0, 0, 0.45)',
            }),
          },
        },
        // TableContainer is a plain <div> by default — it does NOT inherit
        // Paper styling. Without this override, standalone tables (catalogs,
        // dashboard, etc.) sit flat on the page background with no shadow,
        // while Paper-wrapped tables get the elevation. Apply the same
        // background/radius/shadow so every table-as-card reads consistently,
        // then drop the styling when the TableContainer IS nested inside a
        // Paper (avoid stacked shadows / nested rounded corners).
        MuiTableContainer: {
          styleOverrides: {
            root: ({ theme }) => ({
              backgroundColor: theme.palette.background.paper,
              backgroundImage: 'none',
              borderRadius: '10px',
              boxShadow: mode === 'light'
                ? '0 4px 16px rgba(17, 27, 74, 0.10)'
                : '0 4px 16px rgba(0, 0, 0, 0.45)',
              // `.MuiPaper-root &` = "if an ancestor is a Paper, apply these"
              // — Emotion supports the parent-selector pattern via &.
              '.MuiPaper-root &': {
                boxShadow: 'none',
                borderRadius: 0,
                backgroundColor: 'transparent',
              },
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
            root: {
              fontFamily: 'DM Sans, sans-serif',
            },
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
              textTransform: 'uppercase', // App-wide convention: all table headers are uppercase.
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
        MuiTypography: {
          styleOverrides: {
            root: {
              fontFamily: 'DM Sans, sans-serif'
            }
          }
        },
        MuiDialogTitle: {
          styleOverrides: {
            root: {
              fontFamily: 'DM Sans, sans-serif',
            },
          },
        },
        MuiDialogContent: {
          styleOverrides: {
            root: {
              fontFamily: 'DM Sans, sans-serif',
            },
          },
        },
        MuiDialogActions: {
          styleOverrides: {
            root: {
              fontFamily: 'DM Sans, sans-serif',
            },
          },
        },
        // MuiMenu: {
        //   styleOverrides: {
        //     MuiPaper: ({ theme }) => ({
        //       backgroundColor: theme.palette.background.default,
        //     }),
        //   },
        // },
      },
    });
  }, [darkMode, variant]);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', JSON.stringify(newMode));
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
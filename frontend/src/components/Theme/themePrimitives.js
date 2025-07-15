import { createTheme, alpha } from '@mui/material/styles';

// To update color Hues, refer doc "SalesAndAccounting\docs\ThemeHueManipulation.md"
const defaultTheme = createTheme();
const customShadows = [...defaultTheme.shadows];

// Primary Brand (aligned with #443df6, hsl(242, 91%, 61%))
export const brand = {
  50: 'hsl(242, 91%, 95%)',
  100: 'hsl(242, 91%, 90%)',
  200: 'hsl(242, 91%, 85%)',
  300: 'hsl(242, 91%, 80%)',
  400: 'hsl(242, 91%, 75%)',
  500: 'hsl(242, 91%, 68%)',
  600: 'hsl(242, 91%, 61%)',  // Matches #443df6 (main color)
  700: 'hsl(242, 91%, 50%)',
  800: 'hsl(242, 91%, 40%)',
  900: 'hsl(242, 91%, 30%)',
};

// Green (used for success across all variants)
export const green = {
  50: 'hsl(120, 80%, 98%)',
  100: 'hsl(120, 75%, 94%)',
  200: 'hsl(120, 75%, 87%)',
  300: 'hsl(120, 61%, 77%)',
  400: 'hsl(120, 44%, 53%)',
  500: 'hsl(120, 59%, 30%)',
  600: 'hsl(120, 70%, 25%)',
  700: 'hsl(120, 75%, 16%)',
  800: 'hsl(120, 84%, 10%)',
  900: 'hsl(120, 87%, 6%)',
};

// Teal (unused but retained for potential future use)
export const teal = {
  50: 'hsl(180, 80%, 98%)',
  100: 'hsl(180, 75%, 94%)',
  200: 'hsl(180, 75%, 87%)',
  300: 'hsl(180, 61%, 77%)',
  400: 'hsl(180, 44%, 53%)',
  500: 'hsl(180, 59%, 30%)',
  600: 'hsl(180, 70%, 25%)',
  700: 'hsl(180, 75%, 16%)',
  800: 'hsl(180, 84%, 10%)',
  900: 'hsl(180, 87%, 6%)',
};

// Earthy Theme (used for earthy variant)
export const brown = {
  50: 'hsl(30, 80%, 95%)',
  100: 'hsl(30, 80%, 90%)',
  200: 'hsl(30, 80%, 80%)',
  300: 'hsl(30, 75%, 65%)',
  400: 'hsl(30, 70%, 48%)',
  500: 'hsl(30, 70%, 42%)',
  600: 'hsl(30, 70%, 35%)',
  700: 'hsl(30, 75%, 30%)',
  800: 'hsl(30, 80%, 20%)',
  900: 'hsl(30, 80%, 15%)',
};

// Olive (unused but retained for potential future use)
export const olive = {
  50: 'hsl(90, 60%, 98%)',
  100: 'hsl(90, 55%, 94%)',
  200: 'hsl(90, 55%, 87%)',
  300: 'hsl(90, 50%, 77%)',
  400: 'hsl(90, 45%, 53%)',
  500: 'hsl(90, 50%, 30%)',
  600: 'hsl(90, 55%, 25%)',
  700: 'hsl(90, 60%, 16%)',
  800: 'hsl(90, 65%, 10%)',
  900: 'hsl(90, 70%, 6%)',
};

// Monochrome Theme (used for monochrome variant)
export const blueGray = {
  50: 'hsl(200, 50%, 95%)',
  100: 'hsl(200, 50%, 92%)',
  200: 'hsl(200, 50%, 80%)',
  300: 'hsl(200, 50%, 65%)',
  400: 'hsl(200, 48%, 48%)',
  500: 'hsl(200, 48%, 42%)',
  600: 'hsl(200, 48%, 55%)',
  700: 'hsl(200, 50%, 35%)',
  800: 'hsl(200, 50%, 16%)',
  900: 'hsl(200, 50%, 21%)',
};

// Shared Gray
export const gray = {
  50: 'hsl(220, 35%, 97%)',
  100: 'hsl(220, 30%, 94%)',
  200: 'hsl(220, 20%, 88%)',
  300: 'hsl(220, 20%, 80%)',
  400: 'hsl(220, 20%, 65%)',
  500: 'hsl(220, 20%, 42%)',
  600: 'hsl(220, 20%, 35%)',
  700: 'hsl(220, 20%, 25%)',
  800: 'hsl(220, 30%, 6%)',
  900: 'hsl(220, 35%, 3%)',
};

// Shared Accent Colors
export const orange = {
  50: 'hsl(45, 100%, 97%)',
  100: 'hsl(45, 92%, 90%)',
  200: 'hsl(45, 94%, 80%)',
  300: 'hsl(45, 90%, 65%)',
  400: 'hsl(45, 90%, 40%)',
  500: 'hsl(45, 90%, 35%)',
  600: 'hsl(45, 91%, 25%)',
  700: 'hsl(45, 94%, 20%)',
  800: 'hsl(45, 95%, 16%)',
  900: 'hsl(45, 93%, 12%)',
};

export const red = {
  50: 'hsl(0, 100%, 97%)',
  100: 'hsl(0, 92%, 90%)',
  200: 'hsl(0, 94%, 80%)',
  300: 'hsl(0, 90%, 65%)',
  400: 'hsl(0, 90%, 40%)',
  500: 'hsl(0, 90%, 30%)',
  600: 'hsl(0, 91%, 25%)',
  700: 'hsl(0, 94%, 18%)',
  800: 'hsl(0, 95%, 12%)',
  900: 'hsl(0, 93%, 6%)',
};

export const getDesignTokens = (mode, variant = 'purple') => {
  customShadows[1] =
    mode === 'dark'
      ? 'hsla(220, 30%, 5%, 0.7) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.8) 0px 8px 16px -5px'
      : 'hsla(220, 30%, 5%, 0.07) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.07) 0px 8px 16px -5px';

  const themes = {
    purple: brand,
    earthy: brown,
    monochrome: blueGray,
  };

  const primary = themes[variant] || brand;

  return {
    palette: {
      mode,
      primary: {
        light: primary[400],
        main: primary[600],
        dark: primary[700],
        contrastText: gray[50],
        ...(mode === 'dark' && {
          contrastText: gray[50],
          light: primary[400],
          main: primary[600],
          dark: primary[700],
        }),
      },
      info: {
        light: primary[100],
        main: primary[300],
        dark: primary[600],
        contrastText: gray[50],
        ...(mode === 'dark' && {
          contrastText: primary[300],
          light: primary[500],
          main: primary[700],
          dark: primary[900],
        }),
      },
      warning: {
        light: orange[300],
        main: orange[400],
        dark: orange[800],
        ...(mode === 'dark' && {
          light: orange[400],
          main: orange[500],
          dark: orange[700],
        }),
      },
      error: {
        light: red[300],
        main: red[400],
        dark: red[800],
        ...(mode === 'dark' && {
          light: red[400],
          main: red[500],
          dark: red[700],
        }),
      },
      success: {
        light: green[300],
        main: green[400],
        dark: green[800],
        ...(mode === 'dark' && {
          light: green[400],
          main: green[500],
          dark: green[700],
        }),
      },
      grey: {
        ...gray,
      },
      divider: mode === 'dark' ? alpha(gray[700], 0.6) : alpha(gray[300], 0.4),
      background: {
        default: 'hsl(222deg 83.33% 97.65%)',
        paper: 'hsl(0deg 0% 99%)',
        ...(mode === 'dark' && {
          default: 'hsl(230, 62%, 14%)',
          paper: 'hsl(230, 62%, 18%)',
        }),
      },
      text: {
        primary: mode === 'dark' ? gray[50] : '#1b254b', // Updated to requested light mode font color
        secondary: mode === 'dark' ? gray[200] : '#1b254b80', // 50% opacity of #1b254b for secondary
        placeholder: mode === 'dark' ? gray[300] : '#1b254b80', // 50% opacity of #1b254b for placeholder
        tableHeader: mode === 'dark' ? gray[50] : '#a3aed0', // Defined for table headers
      },
      action: {
        hover: alpha(gray[300], 0.2),
        selected: `${alpha(gray[300], 0.4)}`,
        ...(mode === 'dark' && {
          hover: alpha(gray[600], 0.2),
          selected: alpha(gray[600], 0.4),
        }),
      },
      baseShadow:
        mode === 'dark'
          ? 'hsla(220, 30%, 5%, 0.7) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.8) 0px 8px 16px -5px'
          : 'hsla(220, 30%, 5%, 0.07) 0px 4px 16px 0px, hsla(220, 25%, 10%, 0.07) 0px 8px 16px -5px',
    },
    typography: {
      fontFamily: 'DM Sans, sans-serif', // Updated to requested font family
      h1: {
        fontSize: defaultTheme.typography.pxToRem(48),
        fontWeight: 600,
        lineHeight: 1.2,
        letterSpacing: -0.5,
      },
      h2: {
        fontSize: defaultTheme.typography.pxToRem(36),
        fontWeight: 600,
        lineHeight: 1.2,
      },
      h3: {
        fontSize: defaultTheme.typography.pxToRem(30),
        lineHeight: 1.2,
      },
      h4: {
        fontSize: defaultTheme.typography.pxToRem(24),
        fontWeight: 600,
        lineHeight: 1.5,
      },
      h5: {
        fontSize: defaultTheme.typography.pxToRem(20),
        fontWeight: 600,
      },
      h6: {
        fontSize: defaultTheme.typography.pxToRem(18),
        fontWeight: 600,
      },
      subtitle1: {
        fontSize: defaultTheme.typography.pxToRem(18),
      },
      subtitle2: {
        fontSize: defaultTheme.typography.pxToRem(14),
        fontWeight: 500,
      },
      body1: {
        fontSize: defaultTheme.typography.pxToRem(14),
      },
      body2: {
        fontSize: defaultTheme.typography.pxToRem(14),
        fontWeight: 400,
      },
      caption: {
        fontSize: defaultTheme.typography.pxToRem(12),
        fontWeight: 400,
      },
    },
    shape: {
      borderRadius: 8,
    },
    shadows: customShadows,
  };
};

// Default colorSchemes uses purple (brand) palette
export const colorSchemes = {
  light: {
    palette: getDesignTokens('light', 'purple').palette,
  },
  dark: {
    palette: getDesignTokens('dark', 'purple').palette,
  },
};

export const typography = {
  fontFamily: 'DM Sans, sans-serif', // Updated to requested font family
  h1: {
    fontSize: defaultTheme.typography.pxToRem(48),
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: defaultTheme.typography.pxToRem(36),
    fontWeight: 600,
    lineHeight: 1.2,
  },
  h3: {
    fontSize: defaultTheme.typography.pxToRem(30),
    lineHeight: 1.2,
  },
  h4: {
    fontSize: defaultTheme.typography.pxToRem(24),
    fontWeight: 600,
    lineHeight: 1.5,
  },
  h5: {
    fontSize: defaultTheme.typography.pxToRem(20),
    fontWeight: 600,
  },
  h6: {
    fontSize: defaultTheme.typography.pxToRem(18),
    fontWeight: 600,
  },
  subtitle1: {
    fontSize: defaultTheme.typography.pxToRem(18),
  },
  subtitle2: {
    fontSize: defaultTheme.typography.pxToRem(14),
    fontWeight: 500,
  },
  body1: {
    fontSize: defaultTheme.typography.pxToRem(14),
  },
  body2: {
    fontSize: defaultTheme.typography.pxToRem(14),
    fontWeight: 400,
  },
  caption: {
    fontSize: defaultTheme.typography.pxToRem(12),
    fontWeight: 400,
  },
};

export const shape = {
  borderRadius: 8,
};

const defaultShadows = [
  'none',
  'var(--template-palette-baseShadow)',
  ...defaultTheme.shadows.slice(2),
];

export const shadows = defaultShadows;
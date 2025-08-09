import React from 'react';
import IconButton from '@mui/material/IconButton';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import { useTheme } from '@mui/material/styles';
import { useThemeContext } from './ThemeContext';

function ThemeToggle() {
  const theme = useTheme();
  const { toggleDarkMode } = useThemeContext();

  return (
    <IconButton onClick={toggleDarkMode} color="inherit">
      {theme.palette.mode === 'dark' ? <Brightness7Icon fontSize='small' /> : <Brightness4Icon fontSize='small' />}
    </IconButton>
  );
}

export default ThemeToggle;
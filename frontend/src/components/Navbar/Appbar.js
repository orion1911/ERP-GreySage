import React from 'react';
import { AppBar, Toolbar, IconButton, FormControl, Select, MenuItem, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, PowerSettingsNew as LogoutIcon } from '@mui/icons-material';
import ThemeToggle from '../Theme/ThemeToggle';

function Appbar({ variant, setVariant, isMobile, handleDrawerToggle }) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleVariantChange = (event) => {
    const newVariant = event.target.value;
    console.log('Appbar: Changing variant to', newVariant);
    setVariant(newVariant);
  };

  return (
    <AppBar
      position="absolute"
      sx={{
        top: 0,
        right: 0,
        width: isMobile ? 'auto' : '200px',
        mr: isMobile ? 1 : 1.3,
        boxShadow: 'none',
        backgroundColor: 'transparent !important',
        background: 'none',
        zIndex: 1200,
      }}
    >
      <Toolbar sx={{ justifyContent: 'flex-end', p: 1 }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isMobile && (
            <IconButton
              onClick={handleDrawerToggle}
              sx={{ color: 'inherit' }}
            >
              <MenuIcon />
            </IconButton>
          )}
          {/* <FormControl size="small" sx={{ minWidth: isMobile ? 40 : 85 }}>
            <Select
              value={variant}
              onChange={handleVariantChange}
              sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
              }}
            >
              <MenuItem value="purple">Purple</MenuItem>
              <MenuItem value="earthy">Earthy</MenuItem>
              <MenuItem value="monochrome">Mono</MenuItem>
            </Select>
          </FormControl> */}
          <ThemeToggle />
          <IconButton
            onClick={handleLogout}
            color='inherit'
          >
            <LogoutIcon fontSize='small' />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Appbar;
import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, IconButton, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, PowerSettingsNew as LogoutIcon, Close as CloseIcon } from '@mui/icons-material';
import { motion } from 'motion/react';
import ThemeToggle from '../Theme/ThemeToggle';

function Appbar({ variant, setVariant, isMobile, handleDrawerToggle, collapsed }) {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleMenuClick = () => {
    handleDrawerToggle(); // Toggle sidebar, which updates collapsed
  };

  useEffect(() => {
    if (!collapsed) {
      setIsVisible(true); // Ensure visible before expanding
    }
  }, [collapsed]);

  const handleAnimationComplete = () => {
    if (collapsed) {
      setIsVisible(false); // Hide after collapse animation completes
    }
  };

  return (
    <motion.div
      initial={{ width: isMobile ? 48 : '200px' }}
      animate={{ width: isMobile ? (!collapsed ? 150 : 48) : '200px' }}
      transition={{ duration: 0.225, ease: 'easeInOut' }}
    >
      <AppBar
        position="absolute"
        sx={{
          top: 0,
          right: 0,
          width: '30%',
          mr: isMobile ? 1 : 1.3,
          boxShadow: 'none',
          backgroundColor: 'transparent !important',
          background: 'none',
          zIndex: 1200,
        }}
      >
        <Toolbar sx={{ justifyContent: 'flex-end', p: 1 }}>
          {isMobile ? (
            <Box sx={{ display: 'flex', flexDirection: 'row-reverse', gap: 1, alignItems: 'center' }}>
              <IconButton
                onClick={handleMenuClick}
                color='inherit'
                style={{ "backdropFilter": "blur(5px)", "WebkitBackdropFilter": "blur(5px)" }}
              >
                {collapsed ? <MenuIcon /> : <CloseIcon />}
              </IconButton>
              <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: collapsed ? 40 : 0, opacity: collapsed ? 0 : 1 }}
                transition={{ duration: 0.225, ease: 'easeInOut' }}
                onAnimationComplete={handleAnimationComplete}
                style={{ visibility: isVisible || !collapsed ? 'visible' : 'hidden', display: 'flex', gap: 1 }}
              >
                <ThemeToggle />
                <IconButton
                  onClick={handleLogout}
                  color='inherit'
                  style={{ "backdropFilter": "blur(5px)", "WebkitBackdropFilter": "blur(5px)" }}
                >
                  <LogoutIcon fontSize="small" />
                </IconButton>
              </motion.div>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <ThemeToggle />
              <IconButton
                onClick={handleLogout}
                color='inherit'
                style={{ "backdropFilter": "blur(5px)", "WebkitBackdropFilter": "blur(5px)" }}
              >
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </AppBar>
    </motion.div>
  );
}

export default Appbar;
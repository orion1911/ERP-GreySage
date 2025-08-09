import React, { useState } from 'react';
import { AppBar, Toolbar, IconButton, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Menu as MenuIcon, PowerSettingsNew as LogoutIcon, Close as CloseIcon } from '@mui/icons-material';
import { motion } from 'motion/react';
import ThemeToggle from '../Theme/ThemeToggle';

function Appbar({ variant, setVariant, isMobile, handleDrawerToggle }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleMenuClick = () => {
    if (!expanded) {
      setIsVisible(true); // Ensure visible before expanding
    }
    setExpanded(!expanded); // Toggle Appbar expansion
    handleDrawerToggle(); // Toggle sidebar
  };

  const handleAnimationComplete = () => {
    if (!expanded) {
      setIsVisible(false); // Hide after collapse animation completes
    }
  };

  return (
    <motion.div
      initial={{ width: isMobile ? 48 : '200px' }}
      animate={{ width: isMobile ? (expanded ? 150 : 48) : '200px' }}
      transition={{ duration: 0.225, ease: 'easeInOut' }}
    >
      <AppBar
        position="absolute"
        sx={{
          top: 0,
          right: 0,
          width: '100%',
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
                sx={{ color: 'inherit' }}
              >
                {expanded ? <CloseIcon /> : <MenuIcon />}
              </IconButton>
              <motion.div
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: expanded ? 0 : 40, opacity: expanded ? 1 : 0 }}
                transition={{ duration: 0.225, ease: 'easeInOut' }}
                onAnimationComplete={handleAnimationComplete}
                style={{ visibility: isVisible || expanded ? 'visible' : 'hidden', display: 'flex', gap: 1 }}
              >
                <ThemeToggle />
                <IconButton
                  onClick={handleLogout}
                  color='inherit'
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
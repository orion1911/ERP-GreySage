import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography, FormControl, Select, MenuItem, Divider } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import ThemeToggle from '../Theme/ThemeToggle';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ReceiptIcon from '@mui/icons-material/Receipt';
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import AssessmentIcon from '@mui/icons-material/Assessment';
import GroupIcon from '@mui/icons-material/Group';
import AuditIcon from '@mui/icons-material/History';
import LogoutIcon from '@mui/icons-material/Logout';
import DryCleaningIcon from '@mui/icons-material/DryCleaning';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import LaundryIcon from '@mui/icons-material/LocalLaundryService';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { ShoppingCart as ShoppingCartIcon, Leaderboard as LeaderboardIcon } from '@mui/icons-material';
import { motion } from 'motion/react'; // Import motion from @motionone/dom

function Sidebar({ variant, setVariant, collapsed, setCollapsed, handleDrawerToggle }) {
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const handleVariantChange = (event) => {
    const newVariant = event.target.value;
    console.log('Navbar: Changing variant to', newVariant);
    setVariant(newVariant);
  };

  const drawerWidth = collapsed ? 60 : 240;

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <LeaderboardIcon /> },
    { label: 'Orders', path: '/orders', icon: <ShoppingCartIcon /> },
    { label: 'Invoices', path: '/invoices', icon: <ReceiptIcon /> },
    { label: 'Clients', path: '/clients', icon: <PeopleIcon /> },
    { label: 'Fit Style', path: '/products', icon: <InventoryIcon /> },
    { label: 'Fabric Vendors', path: '/fabric-vendors', icon: <DryCleaningIcon /> },
    { label: 'Stitching Vendors', path: '/stitching-vendors', icon: <ContentCutIcon /> },
    { label: 'Washing Vendors', path: '/washing-vendors', icon: <LaundryIcon /> },
    { label: 'Finishing Vendors', path: '/finishing-vendors', icon: <AutoAwesomeIcon /> },
    { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
    ...(user?.role === 'admin' ? [
      { label: 'Users', path: '/users', icon: <GroupIcon /> },
      { label: 'Audit Logs', path: '/audit-logs', icon: <AuditIcon /> },
    ] : []),
    { label: 'Logout', onClick: handleLogout, icon: <LogoutIcon /> },
  ];

  return (
    <Box
      sx={{
        width: drawerWidth,
        height: '100%', // Inherit full height from viewport
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between', // Push ThemeToggle to bottom
        backgroundColor: theme.palette.background.paper,
        transition: theme.transitions.create(['width'], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        overflowX: 'hidden', // Prevent horizontal scrollbar
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', p: 1, justifyContent: collapsed ? 'center' : 'space-between', overflowX: 'hidden' }}>
        {!collapsed && (
          <Typography
            variant="h4"
            component='div'
            sx={{
              pl: 2,
              whiteSpace: 'nowrap', // Prevents text wrapping
              overflow: 'hidden',
            }}>
            G R E Y S A G E
          </Typography>
        )}
        <IconButton
          onClick={collapsed ? handleDrawerToggle : () => setCollapsed(!collapsed)}
          sx={{ color: 'inherit' }}
          // sx={{ color: theme.palette.primary.contrastText }}
        >
          {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>
      <Divider sx={{ backgroundColor: 'inherit', opacity: 1 }} />
      <List sx={{ flexGrow: 1, overflow: 'auto', overflowX: 'hidden', flexShrink: 0 }}>
        {navItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ overflowX: 'hidden' }}>
            <motion.div
              whileHover={{
                y: [0, -2, 0], // Move up 4px and back to original position
                x: [0, 2, 0],
                transition: { duration: 0.3, easing: "ease-in-out" }, // Smooth ease-in-out transition
              }}
              style={{ width: '100%', overflowX: 'hidden' }}
            >
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => (item.path ? navigate(item.path) : item.onClick())}
                sx={{
                  backgroundColor: location.pathname === item.path ? theme.palette.action.selected : 'transparent',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1 : 2,
                  overflowX: 'hidden',
                }}
                disabled={item.path === '/invoices'}
              >
                <ListItemIcon
                  sx={{
                    minWidth: collapsed ? 'auto' : 30,
                    color: 'inherit',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  sx={{
                    display: collapsed ? 'none' : 'block',
                    overflowX: 'hidden',
                  }}
                />
              </ListItemButton>
            </motion.div>
          </ListItem>
        ))}
      </List>
      <Box sx={{ p: 1, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', gap: 1, overflowX: 'hidden' }}>
        {/* <FormControl size="small" sx={{ minWidth: collapsed ? 40 : 85 }}>
          <Select
            value={variant}
            onChange={handleVariantChange}
            sx={{
              backgroundColor: collapsed ? 'transparent' : theme.palette.primary.dark,
            }}
          >
            <MenuItem value="purple">Purple</MenuItem>
            <MenuItem value="earthy">Earthy</MenuItem>
            <MenuItem value="monochrome">Mono</MenuItem>
          </Select>
        </FormControl> */}
        <ThemeToggle />
      </Box>
    </Box>
  );
}

export default Sidebar;
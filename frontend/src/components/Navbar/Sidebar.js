import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography, Divider } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Menu as MenuIcon, ChevronLeft as ChevronLeftIcon, Receipt as ReceiptIcon,
  People as PeopleIcon, Inventory as InventoryIcon,
  Assessment as AssessmentIcon, Group as GroupIcon, History as AuditIcon,
  DryCleaning as DryCleaningIcon, LocalLaundryService as LaundryIcon,
  AutoAwesome as AutoAwesomeIcon, PieChart as PieChartIcon,
  Leaderboard as LeaderboardIcon, ContentCut as ContentCutIcon,
  CreditCard as CreditCardIcon, RequestQuote as InvoiceIcon,
  AccountBalance as ClientPayIcon, Business as CompanyIcon
} from '@mui/icons-material';
import { motion } from 'motion/react';

function Sidebar({ variant, setVariant, collapsed, setCollapsed, handleDrawerToggle, isMobile }) {
  const user = JSON.parse(localStorage.getItem('user'));
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();

  // const handleLogout = () => {
  //   localStorage.removeItem('token');
  //   localStorage.removeItem('user');
  //   navigate('/login');
  // };

  const handleVariantChange = (event) => {
    const newVariant = event.target.value;
    console.log('Navbar: Changing variant to', newVariant);
    setVariant(newVariant);
  };

  const handleMenuClick = (item) => {
    if (item.path) {
      navigate(item.path);
      setCollapsed(true); // collapse after navigation on every screen size
    }
  };

  const drawerWidth = collapsed ? 60 : 200;

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <PieChartIcon /> },
    // { label: 'Dashboard XL', path: '/dashboardxl', icon: <LeaderboardIcon /> },
    { label: 'Stitching', path: '/stitching', icon: <ContentCutIcon /> },
    { label: 'Sales / Invoices', path: '/sales/invoices', icon: <InvoiceIcon /> },
    { label: 'Client Payments', path: '/sales/client-payments', icon: <ClientPayIcon /> },
    { label: 'Vendor Payments', path: '/vendor-payments', icon: <CreditCardIcon /> },
    { label: 'Clients', path: '/clients', icon: <PeopleIcon /> },
    { label: 'Fit Style', path: '/products', icon: <InventoryIcon /> },
    { label: 'Fabric Vendors', path: '/fabric-vendors', icon: <DryCleaningIcon /> },
    { label: 'Stitching Vendors', path: '/stitching-vendors', icon: <ContentCutIcon /> },
    { label: 'Washing Vendors', path: '/washing-vendors', icon: <LaundryIcon /> },
    { label: 'Finishing Vendors', path: '/finishing-vendors', icon: <AutoAwesomeIcon /> },
    { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
    ...(user?.role === 'admin' ? [
      { label: 'Company Settings', path: '/admin/company-settings', icon: <CompanyIcon /> },
      { label: 'Users', path: '/users', icon: <GroupIcon /> },
      { label: 'Audit Logs', path: '/audit-logs', icon: <AuditIcon /> },
    ] : []),
  ];

  return (
    <Box
      sx={{
        width: drawerWidth,
        height: '100vh', // Full viewport height
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.palette.background.paper,
        transition: theme.transitions.create(['width'], {
          easing: theme.transitions.easing.sharp,
          duration: theme.transitions.duration.enteringScreen,
        }),
        // Lock both axes so the outer box never scrolls — the inner List handles overflow.
        overflow: 'hidden',
      }}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        p: 1,
        justifyContent: collapsed ? 'center' : 'space-between',
        // overflow: 'hidden' (BOTH axes) — using overflowX alone forces overflowY to 'auto'
        // (CSS spec), which triggered a tiny vertical scrollbar on this header row
        // because Typography line-height slightly exceeded the row's effective height.
        // That scrollbar's arrow buttons rendered right next to the GREYSAGE logo.
        overflow: 'hidden',
        flexShrink: 0
      }}>
        {!collapsed && (
          <Typography
            variant="h5"
            component='div'
            sx={{
              pl: 1.5,
              letterSpacing: '0.25em',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              flexGrow: 1,
            }}>
            GREYSAGE
          </Typography>
        )}
        <IconButton
          size="small"
          onClick={collapsed ? handleDrawerToggle : () => setCollapsed(!collapsed)}
          sx={{ color: 'inherit', flexShrink: 0 }}
        >
          {collapsed ? <MenuIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>
      <Divider sx={{ backgroundColor: 'inherit', opacity: 1 }} />
      <List sx={(t) => {
        const thumb = t.palette.mode === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(17,27,74,0.35)';
        const thumbHover = t.palette.mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(17,27,74,0.6)';
        return {
          flexGrow: 1,
          // CRITICAL: min-height defaults to 'auto' for flex items, which makes the List
          // grow to fit its content. min-height: 0 lets it shrink and scroll properly.
          minHeight: 0,
          // 'scroll' forces the scrollbar to always render (even if content fits), so it
          // remains a consistent visual element. Change to 'auto' if you'd rather have it
          // only when needed — but then it's invisible on tall viewports.
          overflowY: 'scroll',
          overflowX: 'hidden',
          // KEY INSIGHT: WebKit/Chromium renders scrollbar arrow buttons ONLY when CSS
          // references ::-webkit-scrollbar-button. Even `display: none` on that selector
          // ACTIVATES the button rendering. We never mention scrollbar-button — style
          // only the parts we want visible (scrollbar, track, thumb).
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': { background: 'transparent' },
          '&::-webkit-scrollbar-thumb': { backgroundColor: thumb, borderRadius: 3 },
          '&::-webkit-scrollbar-thumb:hover': { backgroundColor: thumbHover },
        };
      }}>
        {navItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ overflowX: 'hidden' }}>
            <motion.div
              whileHover={{
                y: [0, -2, 0],
                x: [0, 2, 0],
                transition: { duration: 0.3, easing: "ease-in-out" },
              }}
              style={{ width: '100%', overflowX: 'hidden' }}
            >
              <ListItemButton
                selected={location.pathname === item.path}
                onClick={() => handleMenuClick(item)}
                sx={{
                  backgroundColor: location.pathname === item.path ? theme.palette.action.selected : 'transparent',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1 : 2,
                  overflowX: 'hidden',
                  whiteSpace: 'nowrap'
                }}
                disabled={item.path === '/reports' || item.path === '/audit-logs' || item.path === '/users'}
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
        {/* <ThemeToggle /> */}
      </Box>
    </Box>
  );
}

export default Sidebar;
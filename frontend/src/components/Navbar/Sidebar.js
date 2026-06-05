import * as React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, IconButton, Typography, Divider, Collapse } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import {
  Menu as MenuIcon, ChevronLeft as ChevronLeftIcon, Receipt as ReceiptIcon,
  People as PeopleIcon, Inventory as InventoryIcon,
  Assessment as AssessmentIcon, Group as GroupIcon, History as AuditIcon,
  DryCleaning as DryCleaningIcon, LocalLaundryService as LaundryIcon,
  AutoAwesome as AutoAwesomeIcon, PieChart as PieChartIcon,
  Leaderboard as LeaderboardIcon, ContentCut as ContentCutIcon,
  CreditCard as CreditCardIcon, RequestQuote as InvoiceIcon,
  AccountBalance as ClientPayIcon, Business as CompanyIcon,
  Warehouse as WarehouseIcon, Category as CategoryIcon,
  ExpandLess as ExpandLessIcon, ExpandMore as ExpandMoreIcon
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
    { label: 'Stock Management', path: '/stock', icon: <WarehouseIcon /> },
    {
      label: 'Masters', icon: <CategoryIcon />, children: [
        { label: 'Clients', path: '/clients', icon: <PeopleIcon /> },
        { label: 'Fit Style', path: '/products', icon: <InventoryIcon /> },
        { label: 'Fabric Vendors', path: '/fabric-vendors', icon: <DryCleaningIcon /> },
        { label: 'Stitching Vendors', path: '/stitching-vendors', icon: <ContentCutIcon /> },
        { label: 'Washing Vendors', path: '/washing-vendors', icon: <LaundryIcon /> },
        { label: 'Finishing Vendors', path: '/finishing-vendors', icon: <AutoAwesomeIcon /> },
      ]
    },
    { label: 'Reports', path: '/reports', icon: <AssessmentIcon /> },
    ...(user?.role === 'admin' ? [
      { label: 'Company Settings', path: '/admin/company-settings', icon: <CompanyIcon /> },
      // { label: 'Users', path: '/users', icon: <GroupIcon /> },
      // { label: 'Audit Logs', path: '/audit-logs', icon: <AuditIcon /> },
    ] : []),
  ];

  // Expanded/collapsed state per parent group. Auto-open a group whose child route
  // is currently active so the user sees where they are.
  const [openMenus, setOpenMenus] = React.useState(() => {
    const init = {};
    for (const item of navItems) {
      if (item.children) init[item.label] = item.children.some(c => c.path === location.pathname);
    }
    return init;
  });

  const handleParentClick = (item) => {
    // When the sidebar is collapsed (icon-only), expand it first AND open the group so
    // the sub-items become visible; otherwise just toggle the group.
    if (collapsed) {
      setCollapsed(false);
      setOpenMenus(prev => ({ ...prev, [item.label]: true }));
    } else {
      setOpenMenus(prev => ({ ...prev, [item.label]: !prev[item.label] }));
    }
  };

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
          onClick={collapsed ? handleDrawerToggle : () => setCollapsed(!collapsed)}
          // Icon size 24px (medium) to visually match the ListItemIcon glyphs below.
          // AppTheme sets IconButton defaultProps.size='small', which renders SvgIcons
          // at ~18px — that made the hamburger look smaller than the menu icons.
          sx={{ color: 'inherit', flexShrink: 0, '& .MuiSvgIcon-root': { fontSize: '1.5rem' } }}
        >
          {/* {collapsed ? <MenuIcon /> : <ChevronLeftIcon />} */}
          {collapsed && <MenuIcon /> }
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
          // 'auto' so the scrollbar only renders when content actually overflows. When
          // collapsed the narrow icon column fits without scrolling, so we don't want an
          // empty 6px track sitting in the sidebar. ('scroll' previously forced it visible.)
          overflowY: 'auto',
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
        {navItems.map((item, index) => {
          // ── Parent group with expandable sub-items (e.g. Masters) ──
          if (item.children) {
            const childActive = item.children.some(c => c.path === location.pathname);
            const expanded = !collapsed && !!openMenus[item.label];
            return (
              <React.Fragment key={index}>
                <ListItem disablePadding sx={{ overflowX: 'hidden' }}>
                  <motion.div
                    whileHover={{ y: [0, -2, 0], x: [0, 2, 0], transition: { duration: 0.3, easing: 'ease-in-out' } }}
                    style={{ width: '100%', overflowX: 'hidden' }}
                  >
                    <ListItemButton
                      selected={childActive}
                      onClick={() => handleParentClick(item)}
                      sx={{
                        backgroundColor: childActive ? theme.palette.action.selected : 'transparent',
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        px: collapsed ? 1 : 2,
                        overflowX: 'hidden',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 'auto' : 30, color: 'inherit' }}>
                        {item.icon}
                      </ListItemIcon>
                      <ListItemText primary={item.label} sx={{ display: collapsed ? 'none' : 'block', overflowX: 'hidden' }} />
                      {!collapsed && (openMenus[item.label] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />)}
                    </ListItemButton>
                  </motion.div>
                </ListItem>
                <Collapse in={expanded} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding>
                    {item.children.map((child, ci) => (
                      <ListItem key={ci} disablePadding sx={{ overflowX: 'hidden' }}>
                        <ListItemButton
                          selected={location.pathname === child.path}
                          onClick={() => handleMenuClick(child)}
                          sx={{
                            pl: 3,
                            backgroundColor: location.pathname === child.path ? theme.palette.action.selected : 'transparent',
                            overflowX: 'hidden',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 30, color: 'inherit' }}>{child.icon}</ListItemIcon>
                          <ListItemText primary={child.label} sx={{ overflowX: 'hidden' }} />
                        </ListItemButton>
                      </ListItem>
                    ))}
                  </List>
                </Collapse>
              </React.Fragment>
            );
          }

          // ── Leaf item ──
          return (
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
          );
        })}
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
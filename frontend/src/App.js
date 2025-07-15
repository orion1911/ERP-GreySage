import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { LicenseInfo } from '@mui/x-license';
import { Box, Stack, Container, useMediaQuery, useTheme, IconButton } from '@mui/material';
import { SnackBar } from './components/SnackBar';
import "@fontsource/dm-sans";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/400-italic.css";
import "@fontsource/dm-sans/700-italic.css";
import AppTheme from './components/Theme/AppTheme';
import Sidebar from './components/Navbar/Sidebar';
import Login from './features/Login/Login';
import Register from './features/Login/Register';
import UserManagement from './features/Admin/UserManagement';
import InvoiceManagement from './features/Admin/InvoiceManagement';
import Reports from './features/Admin/Reports';
import AuditLogs from './features/Admin/AuditLogs';
import Dashboard from './features/Admin/Dashboard';
import ClientCatalog from './features/Catalogs/ClientCatalog';
import ProductCatalog from './features/Catalogs/ProductCatalog';
import FabricVendorCatalog from './features/Catalogs/FabricVendorCatalog';
import StitchingVendorCatalog from './features/Catalogs/StitchingVendorCatalog';
import WashingVendorCatalog from './features/Catalogs/WashingVendorCatalog';
import FinishingVendorCatalog from './features/Catalogs/FinishingVendorCatalog';
import OrderManagement from './features/Orders/OrderManagement';
import StitchingManagement from './features/Stitching/StitchingManagement';
import Appbar from './components/Navbar/Appbar';
// import WashingManagement from './features/Washing/WashingManagement';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  if (!token) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/dashboard" />;
  return children;
};

const AdminLayout = () => (
  <ProtectedRoute allowedRoles={['admin']}>
    <Outlet />
  </ProtectedRoute>
);

const AuthenticatedLayout = ({ variant, setVariant }) => {
  LicenseInfo.setLicenseKey(process.env.REACT_APP_MUI_LICENSE_KEY);
  const theme = useTheme();
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  const isMobile = useMediaQuery(theme.breakpoints.down('sm')); // Mobile breakpoint (<600px)
  const [collapsed, setCollapsed] = React.useState(isMobile); // Default to collapsed on mobile
  const drawerWidth = collapsed ? 60 : 240;

  const handleDrawerToggle = () => {
    setCollapsed(!collapsed); // Toggle collapse state for both mobile and desktop
  };

  // Handle click outside to collapse navbar on mobile
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (isMobile && !collapsed) {
        const navbar = document.querySelector('.navbar');
        if (navbar && !navbar.contains(event.target)) {
          setCollapsed(true);
        }
      }
    };

    if (isMobile && !collapsed) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobile, collapsed]);

  let snackbarTimeout;
  const showSnackbar = (error, severity = 'error') => {
    let message = error;
    clearTimeout(snackbarTimeout);

    if (typeof error === 'object') {
      if (error.response.status === 401 || error.response.status === 403) {
        severity = 'sessionError';
      }
      else if (error.response && error.response.data && error.response.data.error) {
        message = error.response.data.error;
      } else {
        message = 'An unexpected API error occurred';
      }
    }
    if (severity === 'sessionError') {
      message = 'Session expired. Please log in again.';
    }
    setSnackbar({ open: true, message: message, severity: severity });

    snackbarTimeout = setTimeout(() => {
      setSnackbar((prev) => ({ ...prev, open: false }));
    }, 4000); // Match autoHideDuration in SnackBar.js
  };

  useEffect(() => {
    if (snackbar.severity === 'sessionError' && !snackbar.open) {
      // Redirect to login if session error
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }, [snackbar.open])

  return (
    <ProtectedRoute>
      <Box sx={{ display: 'flex', minHeight: '100vh', height: '100vh', backgroundColor: theme.palette.background.default, overflow: 'hidden' }}>
        {/* Navbar as a fixed sidebar */}
        <Box
          className="navbar" // Add class for click detection
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            transition: theme.transitions.create(['width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.enteringScreen,
            }),
            position: isMobile ? 'fixed' : 'static', // Fixed position for both mobile and desktop
            top: 0,
            bottom: 0,
            height: '100vh', // Full viewport height
            zIndex: theme.zIndex.drawer,
            boxShadow: '2px 0 5px rgba(0,0,0,0.2)', // Optional shadow
            overflowX: 'hidden', // Prevent horizontal scrollbar
          }}
        >
          <Sidebar
            variant={variant}
            setVariant={setVariant}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            handleDrawerToggle={handleDrawerToggle}
          />
        </Box>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            // p: 3,
            width: '100%',
            mt: 2,
            // ml: `${drawerWidth}px`, // Offset by sidebar width
            ml: isMobile ? '60px' : '0', // Offset by sidebar width
            minHeight: '100vh',
            overflowY: 'auto', // Independent vertical scrolling
            backgroundColor: theme.palette.background.default,
          }}
        >
          <SnackBar
            open={snackbar.open}
            message={snackbar.message}
            severity={snackbar.severity}
          />
          <Stack
            spacing={2}
            sx={{
              alignItems: 'center',
              mx: 3,
              pb: 5,
              // mt: { xs: 8, md: 0 },
            }}
          >
            {/* <Appbar /> */}
            <Container maxWidth={false} disableGutters={isMobile ? true : false} sx={{ mt: 4, mb: 4 }}>
              <Outlet context={{ isMobile, drawerWidth, showSnackbar }} />
            </Container>
          </Stack>
        </Box>
      </Box>
    </ProtectedRoute>
  );
};

function App() {
  const [variant, setVariant] = React.useState('purple');
  const [darkMode, setDarkMode] = React.useState(false);

  return (
    <AppTheme variant={variant} setVariant={setVariant} setDarkMode={setDarkMode}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login variant={variant} setVariant={setVariant} />} />
          <Route path="/register" element={<Register />} />
          <Route element={<AuthenticatedLayout variant={variant} setVariant={setVariant} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/orders" element={<OrderManagement />} />
            <Route path="/stitching/:orderId" element={<StitchingManagement />} />
            {/* <Route path="/washing/:orderId" element={<WashingManagement />} /> */}
            <Route path="/invoices" element={<InvoiceManagement />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/clients" element={<ClientCatalog />} />
            <Route path="/products" element={<ProductCatalog />} />
            <Route path="/fabric-vendors" element={<FabricVendorCatalog />} />
            <Route path="/stitching-vendors" element={<StitchingVendorCatalog />} />
            <Route path="/washing-vendors" element={<WashingVendorCatalog />} />
            <Route path="/finishing-vendors" element={<FinishingVendorCatalog />} />
            <Route element={<AdminLayout />}>
              <Route path="/users" element={<UserManagement />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
            </Route>
          </Route>
          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AppTheme>
  );
}

export default App;
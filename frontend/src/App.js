import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useOutletContext } from 'react-router-dom';
import { LicenseInfo } from '@mui/x-license';
import { Box, Stack, Container, useMediaQuery, useTheme } from '@mui/material';
import { SnackBar } from './components/SnackBar';
import "@fontsource/dm-sans";
import "@fontsource/dm-sans/700.css";
import "@fontsource/dm-sans/400-italic.css";
import "@fontsource/dm-sans/700-italic.css";
import AppTheme from './components/Theme/AppTheme';
import Sidebar from './components/Navbar/Sidebar';
import Appbar from './components/Navbar/Appbar';
import Login from './features/Login/Login';
import Register from './features/Login/Register';
import UserManagement from './features/Admin/UserManagement';
import CompanySettings from './features/Admin/CompanySettings';
import Reports from './features/Admin/Reports';
import AuditLogs from './features/Admin/AuditLogs';
import Dashboard from './features/Admin/Dashboard';
import DashboardExcel from './features/Admin/DashboardExcel';
import ClientCatalog from './features/Catalogs/ClientCatalog';
import ProductCatalog from './features/Catalogs/ProductCatalog';
import FabricVendorCatalog from './features/Catalogs/FabricVendorCatalog';
import StitchingVendorCatalog from './features/Catalogs/StitchingVendorCatalog';
import WashingVendorCatalog from './features/Catalogs/WashingVendorCatalog';
import FinishingVendorCatalog from './features/Catalogs/FinishingVendorCatalog';
import StitchingManagement from './features/Stitching/StitchingManagement';
import { VendorPaymentManagement } from './features/VendorPayments';
import { InvoiceManagement, DispatchManagement } from './features/Sales';
import { ClientPaymentManagement } from './features/ClientPayments';
import { StockManagement } from './features/Stock';
import PublicFinishingExtras from './features/Stock/PublicFinishingExtras';
import NotFound from './components/NotFound';
import ErrorBoundary from './components/ErrorBoundary';

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user'));
  if (!token) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) return <Navigate to="/dashboard" />;
  return children;
};

const AdminLayout = () => {
  // Forward the parent AuthenticatedLayout's context (isMobile, drawerWidth, showSnackbar)
  // down to nested admin pages. Without this, useOutletContext() in child pages returns undefined.
  const parentContext = useOutletContext();
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <Outlet context={parentContext} />
    </ProtectedRoute>
  );
};

const AuthenticatedLayout = ({ isMobile, variant, setVariant }) => {
  const theme = useTheme();
  
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  
  // Collapsed by default on every screen size; user expands via the hamburger.
  const [collapsed, setCollapsed] = React.useState(true);
  const drawerWidth = collapsed ? 60 : 200;

  const handleDrawerToggle = () => {
    setCollapsed(!collapsed);
  };

  // Auto-collapse on any click outside the sidebar (desktop and mobile).
  React.useEffect(() => {
    if (collapsed) return; // already collapsed, nothing to do
    const handleClickOutside = (event) => {
      const navbar = document.querySelector('.navbar');
      if (navbar && !navbar.contains(event.target)) {
        setCollapsed(true);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [collapsed]);

  let snackbarTimeout;
  const showSnackbar = (error, severity = 'error') => {
    let message = error;
    clearTimeout(snackbarTimeout);

    if (typeof error === 'object' && error !== null) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        severity = 'sessionError';
      }
      else if (error.response?.data?.error) {
        message = error.response.data.error;
      } else {
        message = error.response?.data || error.message || 'An error occurred';
      }
    }
    if (severity === 'sessionError') {
      message = 'Session expired. Please log in again.';
    }
    setSnackbar({ open: true, message: message, severity: severity });

    snackbarTimeout = setTimeout(() => setSnackbar(prev => ({ ...prev, open: false })), 6000);
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
        <Box
          className="navbar"
          sx={{
            width: isMobile && collapsed ? 0 : drawerWidth,
              flexShrink: 0,
              transition: theme.transitions.create(['width'], {
                easing: theme.transitions.easing.sharp,
                duration: theme.transitions.duration.enteringScreen,
              }),
              position: isMobile ? 'fixed' : 'static',
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
            isMobile={isMobile}
          />
        </Box>
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            width: '100%',
            mt: 2,
            minHeight: '100vh',
            overflowY: 'auto',
            backgroundColor: theme.palette.background.default,
          }}
        >
          <Appbar
            variant={variant}
            setVariant={setVariant}
            isMobile={isMobile}
            handleDrawerToggle={handleDrawerToggle}
            collapsed={collapsed} // Pass collapsed state to sync Appbar
          />
          <SnackBar
            open={snackbar.open}
            message={snackbar.message}
            severity={snackbar.severity}
          />
          <Stack
            spacing={2}
            sx={{
              alignItems: 'center',
              mx: 2,
              pb: 5,
            }}
          >
            <Container maxWidth={false} disableGutters={isMobile ? true : false} sx={{ mt: 4, mb: 4 }}>
              <ErrorBoundary>
                <Outlet context={{ isMobile, drawerWidth, showSnackbar }} />
              </ErrorBoundary>
            </Container>
          </Stack>
        </Box>
      </Box>
    </ProtectedRoute>
  );
};

function App() {
  LicenseInfo.setLicenseKey(process.env.REACT_APP_MUI_LICENSE_KEY);

  const [variant, setVariant] = React.useState('purple');
  // Removed unused darkMode state; persistence is now handled internally in AppTheme.js

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <>
      <AppTheme variant={variant} setVariant={setVariant}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login isMobile={isMobile} variant={variant} setVariant={setVariant} />} />
            {/* Public, no-login read-only status board for finishing vendors. */}
            <Route path="/finishing-extras" element={<PublicFinishingExtras />} />
            <Route element={<AuthenticatedLayout isMobile={isMobile} variant={variant} setVariant={setVariant} />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboardxl" element={<DashboardExcel />} />
              <Route path="/stitching" element={<StitchingManagement />} />
              <Route path="/stock" element={<StockManagement />} />
              <Route path="/vendor-payments" element={<VendorPaymentManagement />} />
              <Route path="/sales/invoices" element={<InvoiceManagement />} />
              <Route path="/sales/dispatch" element={<DispatchManagement />} />
              <Route path="/sales/client-payments" element={<ClientPaymentManagement />} />
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
                <Route path="/admin/company-settings" element={<CompanySettings />} />
                {/* Account creation is an admin action. This was previously a PUBLIC
                    route, which — combined with the form's Role dropdown and an
                    unauthenticated POST /api/register — let anyone self-register as
                    an administrator. */}
                <Route path="/register" element={<Register isMobile={isMobile} variant={variant} setVariant={setVariant} />} />
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/login" />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppTheme>
    </>
  );
}

export default App;
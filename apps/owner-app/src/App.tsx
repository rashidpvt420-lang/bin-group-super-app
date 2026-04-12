
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { Box, Button, Typography, CssBaseline, CircularProgress } from '@mui/material';


import LandingPage from './pages/LandingPage';
import OwnerLandingPage from './pages/OwnerLandingPage';

import LoginPage from './pages/LoginPage';

import InvoiceVerificationPage from './pages/public/InvoiceVerificationPage';
import CertificateVerificationPage from './pages/public/CertificateVerificationPage';
import PropertyOnboardingPage from './pages/PropertyOnboardingPage';

import DashboardPage from './pages/DashboardPage';
import FinancialDashboardPage from './pages/FinancialDashboardPage';
import HealthScorePage from './pages/HealthScorePage';
import TurnoverEnginePage from './pages/TurnoverEnginePage';
import InvoiceDetailsPage from './pages/InvoiceDetailsPage';

import TenantSOSPage from './pages/TenantSOSPage';
import TechnicianPortalPage from './pages/TechnicianPortalPage';
import TicketDetailPage from './pages/TicketDetailPage';
import ReportingDashboard from './pages/ReportingDashboard';
import SovereignAiBox from './components/SovereignAiBox';
import BrokerPortalPage from './pages/BrokerPortalPage';
import AuditorPortalPage from './pages/public/AuditorPortalPage';

import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';

import ProtectedRoute from './components/ProtectedRoute';
import BinGroupHeader from './components/SovereignHeader';

import { RoleProvider, useRole } from './context/RoleContext';
import { LanguageProvider } from './context/LanguageContext';
import { CustomThemeProvider } from './context/ThemeContext';

import ErrorBoundary from './components/ErrorBoundary';

/**
 * [CRITICAL] FULL-SCREEN BLOCKING LOADER
 * Prevents any UI bleed or incorrect route rendering during role resolution.
 */
function LoadingScreen() {
  return (
    <Box sx={{ 
      height: '100vh', 
      width: '100vw', 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      bgcolor: '#000',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999
    }}>
      <CircularProgress sx={{ color: '#C6A75E', mb: 4 }} size={60} thickness={2} />
      <Typography variant="h6" sx={{ color: '#C6A75E', fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase' }}>
        Authenticating BIN-Groups Identity...
      </Typography>
    </Box>
  );
}

/**
 * [INSTITUTIONAL ROUTER]
 * Handles strict redirection for authenticated users who land on the root or login pages.
 */
function RoleRedirector({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useRole();
  const location = useLocation();

  if (loading) return <LoadingScreen />;

  // Only redirect if on login or root landing page
  if (user && (location.pathname === '/' || location.pathname === '/login')) {
    const normalizedRole = (role || '').toLowerCase();
    if (normalizedRole === 'tenant') return <Navigate to="/tenant" replace />;
    if (normalizedRole === 'technician') return <Navigate to="/tech" replace />;
    if (normalizedRole === 'broker') return <Navigate to="/broker" replace />;
    if (normalizedRole === 'owner' || normalizedRole === 'ceo') return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { loading: roleLoading, error: roleError, user } = useRole();

  // [STRICT BLOCK]
  if (roleLoading) {
    return <LoadingScreen />;
  }

  if (roleError && !user) {
    return (
      <Box sx={{ 
        height: '100vh', 
        width: '100vw', 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        bgcolor: '#000',
        p: 4,
        textAlign: 'center'
      }}>
        <Typography variant="h4" sx={{ color: '#ff4444', fontWeight: 900, mb: 2 }}>IDENTITY FAULT</Typography>
        <Typography variant="body1" sx={{ color: '#fff', opacity: 0.8, mb: 4, maxWidth: 600 }}>{roleError}</Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 900 }}>RELOAD SYSTEM</Button>
      </Box>
    );
  }

  return (
    <RoleRedirector>
      <Routes>
        <Route path="/" element={<OwnerLandingPage />} />
        <Route path="/v1" element={<LandingPage />} />
        <Route path="/reports" element={<ProtectedRoute allowedRoles={['admin', 'owner']}><ReportingDashboard /></ProtectedRoute>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terms-of-service" element={<TermsPage />} />
        <Route path="/privacy-policy" element={<PrivacyPage />} />
        <Route path="/support" element={<SupportPage />} />
        
        {/* Property Lifecycle Portals */}
        <Route path="/onboarding/*" element={<ProtectedRoute allowedRoles={['owner']}><PropertyOnboardingPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['owner']}><DashboardPage /></ProtectedRoute>} />
        <Route path="/financials" element={<ProtectedRoute allowedRoles={['owner']}><FinancialDashboardPage /></ProtectedRoute>} />
        <Route path="/properties/:id/health" element={<ProtectedRoute allowedRoles={['owner']}><HealthScorePage /></ProtectedRoute>} />
        <Route path="/analytics/turnover" element={<ProtectedRoute allowedRoles={['owner']}><TurnoverEnginePage /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<ProtectedRoute allowedRoles={['owner']}><InvoiceDetailsPage /></ProtectedRoute>} />
        
        {/* Sector Portals */}
        <Route path="/tenant/*" element={<ProtectedRoute allowedRoles={['tenant']}><TenantSOSPage /></ProtectedRoute>} />
        <Route path="/tech/*" element={<ProtectedRoute allowedRoles={['technician']}><TechnicianPortalPage /></ProtectedRoute>} />
        <Route path="/tech/ticket/:id" element={<ProtectedRoute allowedRoles={['technician']}><TicketDetailPage /></ProtectedRoute>} />
        <Route path="/broker/*" element={<ProtectedRoute allowedRoles={['broker']}><BrokerPortalPage /></ProtectedRoute>} />
        <Route path="/auditor/*" element={<ProtectedRoute allowedRoles={['auditor']}><AuditorPortalPage /></ProtectedRoute>} />

        {/* Public Protocol Validators */}
        <Route path="/verify/invoice/:id" element={<InvoiceVerificationPage />} />
        <Route path="/verify/cert/:id" element={<CertificateVerificationPage />} />

        {/* Institutional Recovery Redirects */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SovereignAiBox />
    </RoleRedirector>
  );
}

export default function App() {
  
  return (
    <Router>
      <ErrorBoundary>
        <LanguageProvider>
          <CustomThemeProvider>
            <RoleProvider>
              <CssBaseline />
              <Box sx={{ minHeight: '100vh', bgcolor: '#000', display: 'flex', flexDirection: 'column' }}>
                <BinGroupHeader />
                <Box component="main" sx={{ flexGrow: 1, position: 'relative' }}>
                   <AppContent />
                </Box>
              </Box>
            </RoleProvider>
          </CustomThemeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </Router>
  );
}

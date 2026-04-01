
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { Box, Button, Typography, CssBaseline } from '@mui/material';


import LandingPage from './pages/LandingPage';

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
import BrokerPortalPage from './pages/BrokerPortalPage';
import AuditorPortalPage from './pages/public/AuditorPortalPage';

import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';

import ProtectedRoute from './components/ProtectedRoute';
import SovereignHeader from './components/SovereignHeader';

import { RoleProvider } from './context/RoleContext';
import { LanguageProvider } from './context/LanguageContext';
import { CustomThemeProvider } from './context/ThemeContext';

import ErrorBoundary from './components/ErrorBoundary';


function AppContent() {
  const [safetyReleased, setSafetyReleased] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      console.warn('⚠️ [APP-CONTENT] Global mount safety threshold (5s) reached. Forcing UI release.');
      setSafetyReleased(true);
    }, 5000);
    
    // [BIN-STABILITY] Signal root mount success to index logic
    if (typeof window !== 'undefined' && (window as any)._BIN_MOUNT_SUCCESS) {
        (window as any)._BIN_MOUNT_SUCCESS();
    }
    
    return () => {
        
        clearTimeout(timer);
    };
  }, []);

  // [SOVEREIGN-STABILITY] Forcing release if providers hang longer than 5s
  if (safetyReleased) {
    console.warn('⚡ [BOOT] Safety released. Forcing render of global routes.');
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
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
                <SovereignHeader />
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

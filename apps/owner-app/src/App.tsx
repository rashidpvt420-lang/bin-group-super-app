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

export default function App() {
  return (
    <Router>
      <ErrorBoundary>
        <LanguageProvider>
          <CustomThemeProvider>
            <RoleProvider>
              <CssBaseline />
              <SovereignHeader />
              <Routes>
                {/* PUBLIC COMPLIANCE ROUTES */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/verify" element={<InvoiceVerificationPage />} />
                <Route path="/verify-cert" element={<CertificateVerificationPage />} />
                <Route path="/onboarding" element={<PropertyOnboardingPage />} />
                <Route path="/privacy-policy" element={<PrivacyPage />} />
                <Route path="/terms-of-service" element={<TermsPage />} />
                <Route path="/support" element={<SupportPage />} />
                
                {/* LEGACY ALIASES (Prevent Breakage) */}
                <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
                <Route path="/terms" element={<Navigate to="/terms-of-service" replace />} />

                {/* OWNER PORTAL (Authenticated) */}
                <Route path="/dashboard" element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <DashboardPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/financial" element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <FinancialDashboardPage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/health" element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <HealthScorePage />
                  </ProtectedRoute>
                } />
                <Route path="/dashboard/turnover" element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <TurnoverEnginePage />
                  </ProtectedRoute>
                } />
                <Route path="/invoice/:id" element={
                  <ProtectedRoute allowedRoles={['owner', 'admin']}>
                    <InvoiceDetailsPage />
                  </ProtectedRoute>
                } />

                {/* OTHER PORTALS */}
                <Route path="/tenant" element={
                  <ProtectedRoute allowedRoles={['tenant', 'admin']}>
                    <TenantSOSPage />
                  </ProtectedRoute>
                } />
                <Route path="/tech" element={
                    <ProtectedRoute allowedRoles={['technician', 'admin']}>
                      <TechnicianPortalPage />
                    </ProtectedRoute>
                } />
                <Route path="/tech/ticket/:id" element={
                    <ProtectedRoute allowedRoles={['technician', 'admin']}>
                      <TicketDetailPage />
                    </ProtectedRoute>
                } />
                 {/* Technician email alias mapping alias */}
                <Route path="/technician" element={<Navigate to="/tech" replace />} />
                
                <Route path="/broker" element={
                  <ProtectedRoute allowedRoles={['broker', 'admin']}>
                    <BrokerPortalPage />
                  </ProtectedRoute>
                } />
                <Route path="/auditor" element={
                  <ProtectedRoute allowedRoles={['auditor', 'admin']}>
                    <AuditorPortalPage />
                  </ProtectedRoute>
                } />

                {/* ADMIN REDIRECT */}
                <Route path="/admin" element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Box sx={{ p: 4, textAlign: 'center' }}>
                      <Typography variant="h4" color="white" fontWeight="900">REDIRECTING TO COMMAND CENTER...</Typography>
                      <Button variant="contained" href="/admin/" sx={{ mt: 2 }}>PROCEED TO ADMIN PANEL</Button>
                    </Box>
                  </ProtectedRoute>
                } />

                {/* Catch-all for other paths */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </RoleProvider>
          </CustomThemeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </Router>
  );
}

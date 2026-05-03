
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { Box, Button, Typography, CssBaseline, CircularProgress } from '@mui/material';


import LandingPage from './pages/LandingPage';
import OwnerLandingPage from './pages/OwnerLandingPage';

import LoginPage from './pages/LoginPage';
import RoleGatewayPage from './pages/RoleGatewayPage';

import InvoiceVerificationPage from './pages/public/InvoiceVerificationPage';
import CertificateVerificationPage from './pages/public/CertificateVerificationPage';
import PublicMarketingPage from './pages/public/PublicMarketingPage';
import PropertyOnboardingPage from './pages/PropertyOnboardingPage';

import DashboardPage from './pages/DashboardPage';
import FinancialDashboardPage from './pages/FinancialDashboardPage';
import HealthScorePage from './pages/HealthScorePage';
import MaintenanceCalendarPage from './pages/MaintenanceCalendarPage';
import TurnoverEnginePage from './pages/TurnoverEnginePage';
import GovernmentPropertyPage from './pages/GovernmentPropertyPage';
import InvoiceDetailsPage from './pages/InvoiceDetailsPage';
import PropertyUnitsPage from './pages/PropertyUnitsPage';
import NotificationInboxPage from './pages/NotificationInboxPage';
import DesignStudioPage from './pages/DesignStudioPage';
import DesignRequestDetailPage from './pages/DesignRequestDetailPage';

import TenantSOSPage from './pages/TenantSOSPage';
import TechnicianPortalPage from './pages/TechnicianPortalPage';
import TicketDetailPage from './pages/TicketDetailPage';
import ReportingDashboard from './pages/ReportingDashboard';
import ExecutiveReportingPage from './pages/ExecutiveReportingPage';
import BrokerPortalPage from './pages/BrokerPortalPage';
import AuditorPortalPage from './pages/public/AuditorPortalPage';

import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';
import TenantInvitePage from './pages/TenantInvitePage';

import ProtectedRoute from './components/ProtectedRoute';
import BinGroupHeader from './components/SovereignHeader';

import { RoleProvider, useRole } from './context/RoleContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { CustomThemeProvider } from './context/ThemeContext';
import { useI18nKeyGuard } from './utils/i18nKeyGuard';

import ErrorBoundary from './components/ErrorBoundary';
import { SovereignAIChat, AIProvider, SovereignAlertHandler } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import IOSPwaGuardian from './components/IOSPwaGuardian';

/**
 * [CRITICAL] FULL-SCREEN BLOCKING LOADER
 * Prevents any UI bleed or incorrect route rendering during role resolution.
 */
function LoadingScreen() {
  const { t } = useLanguage();
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
        {t('common.auth_sync') || 'Authenticating BIN-Groups Identity...'}
      </Typography>
    </Box>
  );
}

function I18nKeyGuardMount() {
  useI18nKeyGuard();
  return null;
}

const PUBLIC_ROUTE_PATHS = new Set([
  '/',
  '/owner-landing',
  '/v1',
  '/login',
  '/terms-of-service',
  '/privacy-policy',
  '/terms',
  '/privacy',
  '/support',
  '/owners',
  '/tenants',
  '/technicians',
  '/brokers',
  '/property-management',
  '/maintenance',
  '/ai-design-studio',
  '/majlis-care',
  '/stadiums',
  '/hotels',
  '/malls',
  '/hospitals',
  '/government-properties',
  '/security',
  '/contact',
  '/request-demo',
  '/tenant-invite',
]);

const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * [INSTITUTIONAL ROUTER]
 * Handles strict redirection for authenticated users who land on the root or login pages.
 */
function RoleRedirector({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useRole();
  const location = useLocation();
  const publicRoute = isPublicRoute(location.pathname);

  if (loading && !publicRoute) return <LoadingScreen />;

  // Only redirect if on login, root landing page, or role gateway
  const isAuthEntryPage = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/gateway';
  if (user && !loading && isAuthEntryPage) {
    const normalizedRole = (role || '').toLowerCase();
    if (normalizedRole === 'tenant') return <Navigate to="/tenant" replace />;
    if (normalizedRole === 'technician') return <Navigate to="/technician" replace />;
    if (normalizedRole === 'broker') return <Navigate to="/broker" replace />;
    if (normalizedRole === 'owner' || normalizedRole === 'ceo') return <Navigate to="/owner-dashboard" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { loading: roleLoading, error: roleError, user, role } = useRole();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const publicRoute = isPublicRoute(location.pathname);

  // [STRICT BLOCK]
  if (roleLoading && !publicRoute) {
    return <LoadingScreen />;
  }

  if (roleError && !user && !publicRoute) {
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
        <Typography variant="h4" sx={{ color: '#ff4444', fontWeight: 900, mb: 2 }}>{t('common.identity_fault')}</Typography>
        <Typography variant="body1" sx={{ color: '#fff', opacity: 0.8, mb: 4, maxWidth: 600 }}>
          {t('common.role_error_prefix')} {roleError}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#C6A75E', color: '#000', fontWeight: 900 }}>{t('common.reload_sys')}</Button>
      </Box>
    );
  }

  return (
    <RoleRedirector>
      <Routes>
        <Route path="/" element={<PublicMarketingPage page="home" />} />
        <Route path="/owner-landing" element={<OwnerLandingPage />} />
        <Route path="/v1" element={<LandingPage />} />
        <Route path="/gateway" element={<RoleGatewayPage />} />
        <Route path="/analytics/reporting" element={<ProtectedRoute allowedRoles={['admin', 'owner']}><ReportingDashboard /></ProtectedRoute>} />
        <Route path="/analytics/executive" element={<ProtectedRoute allowedRoles={['admin', 'owner']}><ExecutiveReportingPage /></ProtectedRoute>} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/terms-of-service" element={<TermsPage />} />
        <Route path="/privacy-policy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/owners" element={<PublicMarketingPage page="owners" />} />
        <Route path="/tenants" element={<PublicMarketingPage page="tenants" />} />
        <Route path="/technicians" element={<PublicMarketingPage page="technicians" />} />
        <Route path="/brokers" element={<PublicMarketingPage page="brokers" />} />
        <Route path="/property-management" element={<PublicMarketingPage page="property-management" />} />
        <Route path="/maintenance" element={<PublicMarketingPage page="maintenance" />} />
        <Route path="/ai-design-studio" element={<PublicMarketingPage page="ai-design-studio" />} />
        <Route path="/majlis-care" element={<PublicMarketingPage page="majlis-care" />} />
        <Route path="/stadiums" element={<PublicMarketingPage page="stadiums" />} />
        <Route path="/hotels" element={<PublicMarketingPage page="hotels" />} />
        <Route path="/malls" element={<PublicMarketingPage page="malls" />} />
        <Route path="/hospitals" element={<PublicMarketingPage page="hospitals" />} />
        <Route path="/government-properties" element={<PublicMarketingPage page="government-properties" />} />
        <Route path="/security" element={<PublicMarketingPage page="security" />} />
        <Route path="/contact" element={<PublicMarketingPage page="contact" />} />
        <Route path="/request-demo" element={<PublicMarketingPage page="request-demo" />} />
        
        {/* Property Lifecycle Portals */}
        <Route path="/onboarding/*" element={<PropertyOnboardingPage />} />
        <Route path="/government/:id" element={<ProtectedRoute allowedRoles={['owner', 'admin']}><GovernmentPropertyPage /></ProtectedRoute>} />
        <Route path="/owner-dashboard" element={<ProtectedRoute allowedRoles={['owner']}><DashboardPage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<Navigate to="/owner-dashboard" replace />} />
        <Route path="/financials" element={<ProtectedRoute allowedRoles={['owner']}><FinancialDashboardPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute allowedRoles={['owner', 'admin', 'technician']}><MaintenanceCalendarPage /></ProtectedRoute>} />
        <Route path="/properties/:id/health" element={<ProtectedRoute allowedRoles={['owner']}><HealthScorePage /></ProtectedRoute>} />
        <Route path="/analytics/turnover" element={<ProtectedRoute allowedRoles={['owner']}><TurnoverEnginePage /></ProtectedRoute>} />
        <Route path="/properties/:propertyId/units" element={<ProtectedRoute allowedRoles={['owner']}><PropertyUnitsPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'technician', 'broker']}><NotificationInboxPage /></ProtectedRoute>} />
        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignStudioPage /></ProtectedRoute>} />
        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignRequestDetailPage /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
        
        {/* Sector Portals */}
        <Route path="/tenant/*" element={<ProtectedRoute allowedRoles={['tenant']}><TenantSOSPage /></ProtectedRoute>} />
        <Route path="/technician/*" element={<ProtectedRoute allowedRoles={['technician']}><TechnicianPortalPage /></ProtectedRoute>} />
        <Route path="/tech/*" element={<Navigate to="/technician" replace />} />
        <Route path="/technician/ticket/:id" element={<ProtectedRoute allowedRoles={['technician']}><TicketDetailPage /></ProtectedRoute>} />
        <Route path="/broker/*" element={<ProtectedRoute allowedRoles={['broker']}><BrokerPortalPage /></ProtectedRoute>} />
        <Route path="/auditor/*" element={<ProtectedRoute allowedRoles={['auditor']}><AuditorPortalPage /></ProtectedRoute>} />

        {/* Public Protocol Validators */}
        <Route path="/verify/invoice/:id" element={<InvoiceVerificationPage />} />
        <Route path="/verify/cert/:id" element={<CertificateVerificationPage />} />
        <Route path="/tenant-invite" element={<TenantInvitePage />} />

        {/* Institutional Recovery Redirects */}
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />
      <IOSPwaGuardian />
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
              <AIProvider>
                <CssBaseline />
                <I18nKeyGuardMount />
                <Box sx={{ minHeight: '100vh', bgcolor: '#000', display: 'flex', flexDirection: 'column' }}>
                  <Routes><Route path="/" element={null} /><Route path="*" element={<BinGroupHeader />} /></Routes>
                  <Box component="main" sx={{ flexGrow: 1, position: 'relative' }}>
                    <AppContent />
                  </Box>
                  <SovereignAlertHandler />
                </Box>
              </AIProvider>
            </RoleProvider>
          </CustomThemeProvider>
        </LanguageProvider>
      </ErrorBoundary>
    </Router>
  );
}

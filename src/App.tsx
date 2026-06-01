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
import TenantApp from './tenant/TenantApp';
import TechnicianApp from './technician/TechnicianApp';
import ReportingDashboard from './pages/ReportingDashboard';
import ExecutiveReportingPage from './pages/ExecutiveReportingPage';
import BrokerApp from './broker/BrokerApp';
import AuditorPortalPage from './pages/public/AuditorPortalPage';
import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';
import TenantInvitePage from './pages/TenantInvitePage';
import AdminTerminal from './admin/AdminTerminal';
import ProtectedRoute from './components/ProtectedRoute';
import BinGroupHeader from './components/SovereignHeader';
import OwnerApp from './owner/OwnerApp';
import CompanyProfilePage from './pages/public/CompanyProfilePage';
import DemoVideosPage from './pages/public/DemoVideosPage';
import { AuthProvider, useRole, LanguageProvider, useLanguage, SovereignAIChat, AIProvider, SovereignAlertHandler } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import IOSPwaGuardian from './components/IOSPwaGuardian';
import { NavigationControl } from './components/navigation/NavigationControl';
import { CustomThemeProvider } from './context/ThemeContext';
import { attachForegroundPushListener, registerPushNotifications, shouldRequestPushForRole } from './services/pushNotificationService';

/**
 * [CRITICAL FIX #1]: One-time legacy onboarding cleanup
 * This guard ensures ONLY old keys are removed, NEVER the active v3 store.
 * The active v3 store ('bin-group-onboarding-v3') persists correctly and should NEVER be cleared here.
 */
const LEGACY_ONBOARDING_KEYS = ['onboardingStore', 'onboardingStep', 'selectedContract', 'propertyDraft', 'ownerOnboarding', 'bin-group-onboarding-v2'];
const MIGRATION_KEY = 'bin_migration_v4_legacy_onboarding_cleanup_done';
const ACTIVE_ONBOARDING_STORE_KEY = 'bin-group-onboarding-v3';

function runOneTimeLegacyOnboardingCleanup() {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'true') return;
    
    // SAFETY: Verify active store key exists before cleanup
    const hasActiveStore = localStorage.getItem(ACTIVE_ONBOARDING_STORE_KEY);
    
    // Only clear legacy keys, never the active store
    LEGACY_ONBOARDING_KEYS.forEach((key) => localStorage.removeItem(key));
    
    // Mark migration complete
    localStorage.setItem(MIGRATION_KEY, 'true');
    
    console.log('[APP] One-time legacy cleanup done. Active store preserved:', !!hasActiveStore);
  } catch (error) {
    console.warn('[APP] One-time legacy onboarding cleanup failed', error);
  }
}

runOneTimeLegacyOnboardingCleanup();

function LoadingScreen() {
  const { t } = useLanguage();
  const [showRecovery, setShowRecovery] = React.useState(false);
  const [diagnostics, setDiagnostics] = React.useState<any>({});

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setShowRecovery(true);
      setDiagnostics({
        userAgent: navigator.userAgent,
        authReady: window.__BIN_GROUPS_BOOT__?.authReady,
        reactMounted: window.__BIN_GROUPS_BOOT__?.reactMounted,
        timeElapsed: Date.now() - (window.__BIN_GROUPS_BOOT__?.startedAt || Date.now()),
        pathname: window.location.pathname
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleClearSession = () => {
    const currentLang = localStorage.getItem('bin_language');
    const activeOnboarding = localStorage.getItem(ACTIVE_ONBOARDING_STORE_KEY);
    localStorage.clear();
    if (currentLang) localStorage.setItem('bin_language', currentLang);
    if (activeOnboarding) localStorage.setItem(ACTIVE_ONBOARDING_STORE_KEY, activeOnboarding);
    sessionStorage.clear();
    window.location.href = '/login';
  };

  return (
    <Box sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#000', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
      {!showRecovery ? (
        <>
          <CircularProgress sx={{ color: '#C6A75E', mb: 4 }} size={60} thickness={2} />
          <Typography variant="h6" sx={{ color: '#C6A75E', fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase' }}>
            {t('common.auth_sync') || 'Authenticating BIN-Groups Identity...'}
          </Typography>
        </>
      ) : (
        <Box sx={{ maxWidth: 600, width: '100%', textAlign: 'center', bgcolor: 'rgba(255,0,0,0.1)', border: '1px solid #ef4444', borderRadius: 2, p: 4 }}>
          <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>SOVEREIGN CONNECTION TIMEOUT</Typography>
          <Typography variant="body2" sx={{ color: '#fff', opacity: 0.8, mb: 3 }}>
            The authentication gateway failed to resolve within the 8-second SLA. Please verify your connection or reset your secure session.
          </Typography>
          <Box sx={{ textAlign: 'left', bgcolor: '#000', p: 2, borderRadius: 1, mb: 3, border: '1px solid rgba(255,255,255,0.1)' }}>
             <Typography variant="caption" sx={{ color: '#C6A75E', fontWeight: 700, display: 'block', mb: 1 }}>DIAGNOSTICS:</Typography>
             <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', display: 'block' }}>
                Route: {diagnostics.pathname}<br/>
                React Mounted: {String(diagnostics.reactMounted)}<br/>
                Auth Ready: {String(diagnostics.authReady)}<br/>
                Firebase Connected: {diagnostics.authReady ? 'ESTABLISHED' : 'FAULT'}
             </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" color="error" onClick={handleClearSession}>RESET SESSION</Button>
            <Button variant="contained" sx={{ bgcolor: '#C6A75E', color: '#000' }} onClick={() => window.location.reload()}>RELOAD NODE</Button>
            <Button variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }} onClick={() => window.location.href = '/login'}>GO TO LOGIN</Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function PushNotificationBootstrap() {
  const { user, role } = useRole();

  React.useEffect(() => {
    let detach: undefined | (() => void);
    let cancelled = false;

    if (!user?.uid || !shouldRequestPushForRole(role)) return undefined;

    registerPushNotifications(user.uid, role)
      .then((result) => {
        if (!result.enabled) {
          const reason = 'reason' in result ? result.reason : 'unknown';
          console.warn('[Push] Registration skipped:', reason);
        }
      })
      .catch((error) => console.warn('[Push] Registration failed:', error));

    attachForegroundPushListener().then((unsubscribe) => {
      if (cancelled && typeof unsubscribe === 'function') unsubscribe();
      else detach = typeof unsubscribe === 'function' ? unsubscribe : undefined;
    });

    return () => {
      cancelled = true;
      if (detach) detach();
    };
  }, [user?.uid, role]);

  return null;
}

const PUBLIC_ROUTE_PATHS = new Set([
  '/', '/owner-landing', '/v1', '/login', '/terms-of-service', '/privacy-policy', '/terms', '/privacy', '/support',
  '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',
  '/majlis-care', '/stadiums', '/hotels', '/malls', '/hospitals', '/government-properties', '/security', '/contact',
  '/services', '/request-demo', '/videos', '/demo-videos', '/tenant-invite', '/company',
]);

const PUBLIC_ROUTE_PREFIXES = ['/onboarding', '/verify', '/invoices'];

function isPublicRoute(pathname: string) {
  return PUBLIC_ROUTE_PATHS.has(pathname) || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function RoleRedirector({ children }: { children: React.ReactNode }) {
  const { user, role, loading } = useRole();
  const location = useLocation();
  const publicRoute = isPublicRoute(location.pathname);

  if (loading && !publicRoute) return <LoadingScreen />;

  const isAuthEntryPage = location.pathname === '/' || location.pathname === '/login' || location.pathname === '/gateway';
  if (user && !loading && isAuthEntryPage) {
    const normalizedRole = (role || '').toLowerCase();
    if (normalizedRole === 'tenant') return <Navigate to="/tenant/dashboard" replace />;
    if (normalizedRole === 'technician') return <Navigate to="/technician/dashboard" replace />;
    if (normalizedRole === 'broker') return <Navigate to="/broker/dashboard" replace />;
    if (
      normalizedRole === 'admin' ||
      normalizedRole === 'ceo' ||
      normalizedRole === 'hr_manager' ||
      normalizedRole === 'hr_staff' ||
      normalizedRole === 'finance_staff' ||
      normalizedRole === 'account_manager' ||
      normalizedRole === 'finance_admin' ||
      normalizedRole === 'dispatcher' ||
      normalizedRole === 'operations_manager'
    ) return <Navigate to="/admin/dashboard" replace />;
    if (normalizedRole === 'owner') return <Navigate to="/owner/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { loading: roleLoading, error: roleError, user, role } = useRole();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const publicRoute = isPublicRoute(location.pathname);
  const isAdminRoute = location.pathname.startsWith('/admin');

  if (roleLoading && !publicRoute) return <LoadingScreen />;

  if (roleError && !user && !publicRoute) {
    return (
      <Box sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#000', p: 4, textAlign: 'center', overflowY: 'auto' }}>
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
      <PushNotificationBootstrap />
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
        <Route path="/ai-design-studio" element={<Navigate to="/request-demo?demo=ai-design" replace />} />
        <Route path="/majlis-care" element={<PublicMarketingPage page="majlis-care" />} />
        <Route path="/stadiums" element={<PublicMarketingPage page="stadiums" />} />
        <Route path="/hotels" element={<PublicMarketingPage page="hotels" />} />
        <Route path="/malls" element={<PublicMarketingPage page="malls" />} />
        <Route path="/hospitals" element={<PublicMarketingPage page="hospitals" />} />
        <Route path="/government-properties" element={<PublicMarketingPage page="government-properties" />} />
        <Route path="/security" element={<PublicMarketingPage page="security" />} />
        <Route path="/services" element={<PublicMarketingPage page="property-management" />} />
        <Route path="/contact" element={<PublicMarketingPage page="contact" />} />
        <Route path="/request-demo" element={<DemoVideosPage />} />
        <Route path="/videos" element={<DemoVideosPage />} />
        <Route path="/demo-videos" element={<Navigate to="/videos" replace />} />
        <Route path="/company" element={<CompanyProfilePage />} />
        <Route path="/onboarding/*" element={<PropertyOnboardingPage />} />
        <Route path="/government/:id" element={<ProtectedRoute allowedRoles={['owner', 'admin']}><GovernmentPropertyPage /></ProtectedRoute>} />
        <Route path="/owner-dashboard" element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="/dashboard" element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="/financials" element={<ProtectedRoute allowedRoles={['owner']}><FinancialDashboardPage /></ProtectedRoute>} />
        <Route path="/calendar" element={<ProtectedRoute allowedRoles={['owner', 'admin', 'technician']}><MaintenanceCalendarPage /></ProtectedRoute>} />
        <Route path="/properties/:id/health" element={<ProtectedRoute allowedRoles={['owner']}><HealthScorePage /></ProtectedRoute>} />
        <Route path="/analytics/turnover" element={<ProtectedRoute allowedRoles={['owner']}><TurnoverEnginePage /></ProtectedRoute>} />
        <Route path="/properties/:propertyId/units" element={<ProtectedRoute allowedRoles={['owner']}><PropertyUnitsPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute allowedRoles={['owner', 'tenant', 'technician', 'broker']}><NotificationInboxPage /></ProtectedRoute>} />
        <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignStudioPage /></ProtectedRoute>} />
        <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignRequestDetailPage /></ProtectedRoute>} />
        <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
        <Route path="/tenant/*" element={<ProtectedRoute allowedRoles={['tenant']}><TenantApp /></ProtectedRoute>} />
        <Route path="/technician/*" element={<ProtectedRoute allowedRoles={['technician']}><TechnicianApp /></ProtectedRoute>} />
        <Route path="/tech/*" element={<Navigate to="/technician/dashboard" replace />} />
        <Route path="/broker/*" element={<ProtectedRoute allowedRoles={['broker']}><BrokerApp /></ProtectedRoute>} />
        <Route path="/owner/*" element={<ProtectedRoute allowedRoles={['owner', 'ceo']}><OwnerApp /></ProtectedRoute>} />
        <Route path="/auditor/*" element={<ProtectedRoute allowedRoles={['auditor']}><AuditorPortalPage /></ProtectedRoute>} />
        <Route path="/admin/*" element={<ProtectedRoute allowedRoles={[
          'admin', 'ceo', 'hr_manager', 'hr_staff', 'finance_staff', 'account_manager', 'finance_admin', 'dispatcher', 'operations_manager'
        ]}><AdminTerminal /></ProtectedRoute>} />
        <Route path="/verify/invoice/:id" element={<InvoiceVerificationPage />} />
        <Route path="/verify/cert/:id" element={<CertificateVerificationPage />} />
        <Route path="/tenant-invite" element={<TenantInvitePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!location.pathname.startsWith('/onboarding') && !publicRoute && !isAdminRoute && ['owner', 'tenant'].includes((role || '').toLowerCase()) && (
        <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />
      )}
      <IOSPwaGuardian />
      {!isAdminRoute && <NavigationControl />}
    </RoleRedirector>
  );
}

export default function App() {
  return (
    <Router>
      <LanguageProvider>
        <CustomThemeProvider>
          <AuthProvider>
            <AIProvider>
              <CssBaseline />
              <Box sx={{ minHeight: '100dvh', height: 'auto', bgcolor: '#000', display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: 'visible', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
                <Routes>
                  <Route path="/" element={null} />
                  <Route path="/owners" element={null} />
                  <Route path="/tenants" element={null} />
                  <Route path="/technicians" element={null} />
                  <Route path="/brokers" element={null} />
                  <Route path="/property-management" element={null} />
                  <Route path="/maintenance" element={null} />
                  <Route path="/majlis-care" element={null} />
                  <Route path="/stadiums" element={null} />
                  <Route path="/hotels" element={null} />
                  <Route path="/malls" element={null} />
                  <Route path="/hospitals" element={null} />
                  <Route path="/government-properties" element={null} />
                  <Route path="/security" element={null} />
                  <Route path="/services" element={null} />
                  <Route path="/contact" element={null} />
                  <Route path="/request-demo" element={null} />
                  <Route path="/videos" element={null} />
                  <Route path="/demo-videos" element={null} />
                  <Route path="/ai-design-studio" element={null} />
                  <Route path="/tenant/*" element={null} />
                  <Route path="/owner/*" element={null} />
                  <Route path="/technician/*" element={null} />
                  <Route path="/admin/*" element={null} />
                  <Route path="/broker/*" element={null} />
                  <Route path="*" element={<BinGroupHeader />} />
                </Routes>
                <Box component="main" sx={{ flexGrow: 1, position: 'relative', minHeight: 0, overflow: 'visible' }}>
                  <AppContent />
                </Box>
                <SovereignAlertHandler />
              </Box>
            </AIProvider>
          </AuthProvider>
        </CustomThemeProvider>
      </LanguageProvider>
    </Router>
  );
}


import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Box, Button, Typography, CssBaseline, CircularProgress } from '@mui/material';

import LandingPage from './pages/LandingPage';
import OwnerLandingPage from './pages/OwnerLandingPage';
import LoginPage from './pages/LoginPage';
import RoleGatewayPage from './pages/RoleGatewayPage';
import InvoiceVerificationPage from './pages/public/InvoiceVerificationPage';
import CertificateVerificationPage from './pages/public/CertificateVerificationPage';
import PublicMarketingPage from './pages/public/PublicMarketingPage';
import PropertyOnboardingPage from './pages/PropertyOnboardingPage';
import InvoiceDetailsPage from './pages/InvoiceDetailsPage';
import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';
import PilotFeedbackPage from './pages/public/PilotFeedbackPage';
import TenantInvitePage from './pages/TenantInvitePage';
import DemoVideosPage from './pages/public/DemoVideosPage';
import ProtectedRoute from './components/ProtectedRoute';
import BinGroupHeader from './components/SovereignHeader';
import { AuthProvider, useRole, LanguageProvider, useLanguage, SovereignAIChat, AIProvider, SovereignAlertHandler } from '@bin/shared';
import IOSPwaGuardian from './components/IOSPwaGuardian';
import { NavigationControl } from './components/navigation/NavigationControl';
import { CustomThemeProvider } from './context/ThemeContext';

const FinancialDashboardPage = React.lazy(() => import('./pages/FinancialDashboardPage'));
const HealthScorePage = React.lazy(() => import('./pages/HealthScorePage'));
const MaintenanceCalendarPage = React.lazy(() => import('./pages/MaintenanceCalendarPage'));
const TurnoverEnginePage = React.lazy(() => import('./pages/TurnoverEnginePage'));
const GovernmentPropertyPage = React.lazy(() => import('./pages/GovernmentPropertyPage'));
const PropertyUnitsPage = React.lazy(() => import('./pages/PropertyUnitsPage'));
const NotificationInboxPage = React.lazy(() => import('./pages/NotificationInboxPage'));
const DesignStudioPage = React.lazy(() => import('./pages/DesignStudioPage'));
const DesignRequestDetailPage = React.lazy(() => import('./pages/DesignRequestDetailPage'));
const TenantApp = React.lazy(() => import('./tenant/TenantApp'));
const TechnicianApp = React.lazy(() => import('./technician/TechnicianApp'));
const ReportingDashboard = React.lazy(() => import('./pages/ReportingDashboard'));
const ExecutiveReportingPage = React.lazy(() => import('./pages/ExecutiveReportingPage'));
const BrokerApp = React.lazy(() => import('./broker/BrokerApp'));
const AuditorPortalPage = React.lazy(() => import('./pages/public/AuditorPortalPage'));
const AdminTerminal = React.lazy(() => import('./admin/AdminTerminal'));
const OwnerApp = React.lazy(() => import('./owner/OwnerApp'));

const LEGACY_ONBOARDING_KEYS = ['onboardingStore', 'onboardingStep', 'selectedContract', 'propertyDraft', 'ownerOnboarding', 'bin-group-onboarding-v2'];
const MIGRATION_KEY = 'bin_migration_v4_legacy_onboarding_cleanup_done';
const ACTIVE_ONBOARDING_STORE_KEY = 'bin-group-onboarding-v3';

const ADMIN_STAFF_ROLES = [
  'admin',
  'super_admin',
  'ceo',
  'manager',
  'operations_admin',
  'finance_admin',
  'hr_admin',
  'support_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'dispatcher',
  'operations_manager',
];

const NOTIFICATION_ROLES = [
  'owner',
  'tenant',
  'technician',
  'broker',
  ...ADMIN_STAFF_ROLES,
];

function runOneTimeLegacyOnboardingCleanup() {
  try {
    if (localStorage.getItem(MIGRATION_KEY) === 'true') return;
    const hasActiveStore = localStorage.getItem(ACTIVE_ONBOARDING_STORE_KEY);
    LEGACY_ONBOARDING_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(MIGRATION_KEY, 'true');
    console.log('[APP] One-time legacy cleanup done. Active store preserved:', !!hasActiveStore);
  } catch (error) {
    console.warn('[APP] One-time legacy onboarding cleanup failed', error);
  }
}

runOneTimeLegacyOnboardingCleanup();

function RouteFallback() {
  return (
    <Box sx={{ minHeight: '42vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFFFFF', color: '#111827' }}>
      <Box sx={{ textAlign: 'center' }}>
        <CircularProgress sx={{ color: '#C9A646', mb: 2 }} size={34} thickness={3} />
        <Typography variant="body2" sx={{ color: '#667085', fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Loading BIN GROUP module...
        </Typography>
      </Box>
    </Box>
  );
}

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
    }, 5000);
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
    <Box sx={{ minHeight: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFFFFF', position: 'fixed', top: 0, left: 0, zIndex: 9999, p: 3 }}>
      {!showRecovery ? (
        <>
          <CircularProgress sx={{ color: '#C9A646', mb: 4 }} size={60} thickness={2} />
          <Typography variant="h6" sx={{ color: '#111827', fontWeight: 900, letterSpacing: 4, textTransform: 'uppercase', textAlign: 'center' }}>
            {t('common.auth_sync') || 'Authenticating BIN-Groups Identity...'}
          </Typography>
        </>
      ) : (
        <Box sx={{ maxWidth: 600, width: '100%', textAlign: 'center', bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4, p: 4, boxShadow: '0 18px 48px rgba(17,24,39,0.08)' }}>
          <Typography variant="h5" sx={{ color: '#111827', fontWeight: 900, mb: 2 }}>Connection is slow</Typography>
          <Typography variant="body2" sx={{ color: '#667085', mb: 3 }}>
            The secure workspace is still loading. Reset the local session only if this screen repeats after refresh.
          </Typography>
          <Box sx={{ textAlign: 'left', bgcolor: '#F8F9FB', p: 2, borderRadius: 2, mb: 3, border: '1px solid #E5E7EB' }}>
             <Typography variant="caption" sx={{ color: '#B8932F', fontWeight: 800, display: 'block', mb: 1 }}>DIAGNOSTICS:</Typography>
             <Typography variant="caption" sx={{ color: '#667085', fontFamily: 'monospace', display: 'block' }}>
                Route: {diagnostics.pathname}<br/>
                React Mounted: {String(diagnostics.reactMounted)}<br/>
                Auth Ready: {String(diagnostics.authReady)}<br/>
                Firebase Connected: {diagnostics.authReady ? 'ESTABLISHED' : 'PENDING'}
             </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button variant="outlined" color="error" onClick={handleClearSession}>RESET SESSION</Button>
            <Button variant="contained" sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 900 }} onClick={() => window.location.reload()}>RELOAD</Button>
            <Button variant="outlined" sx={{ borderColor: '#C9A646', color: '#B8932F' }} onClick={() => window.location.href = '/login'}>GO TO LOGIN</Button>
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

    if (!user?.uid) return undefined;

    import('./services/pushNotificationService')
      .then(({ attachForegroundPushListener, registerPushNotifications, shouldRequestPushForRole }) => {
        if (cancelled || !shouldRequestPushForRole(role)) return;

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
      })
      .catch((error) => console.warn('[Push] Bootstrap import failed:', error));

    return () => {
      cancelled = true;
      if (detach) detach();
    };
  }, [user?.uid, role]);

  return null;
}

const PUBLIC_ROUTE_PATHS = new Set([
  '/', '/owner-landing', '/v1', '/login', '/gateway', '/terms-of-service', '/privacy-policy', '/terms', '/privacy', '/support', '/feedback', '/pilot-feedback',
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
    if (ADMIN_STAFF_ROLES.includes(normalizedRole)) return <Navigate to="/admin/dashboard" replace />;
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
      <Box sx={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#FFFFFF', p: 4, textAlign: 'center', overflowY: 'auto' }}>
        <Typography variant="h4" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>{t('common.identity_fault')}</Typography>
        <Typography variant="body1" sx={{ color: '#667085', mb: 4, maxWidth: 600 }}>
          {t('common.role_error_prefix')} {roleError}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 900 }}>{t('common.reload_sys')}</Button>
      </Box>
    );
  }

  return (
    <RoleRedirector>
      <PushNotificationBootstrap />
      <React.Suspense fallback={<RouteFallback />}>
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
          <Route path="/feedback" element={<PilotFeedbackPage />} />
          <Route path="/pilot-feedback" element={<PilotFeedbackPage />} />
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
          <Route path="/company" element={<Navigate to="/" replace />} />
          <Route path="/onboarding/*" element={<PropertyOnboardingPage />} />
          <Route path="/government/:id" element={<ProtectedRoute allowedRoles={['owner', 'admin']}><GovernmentPropertyPage /></ProtectedRoute>} />
          <Route path="/owner-dashboard" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="/dashboard" element={<Navigate to="/owner/dashboard" replace />} />
          <Route path="/financials" element={<ProtectedRoute allowedRoles={['owner']}><FinancialDashboardPage /></ProtectedRoute>} />
          <Route path="/calendar" element={<ProtectedRoute allowedRoles={['owner', 'admin', 'technician']}><MaintenanceCalendarPage /></ProtectedRoute>} />
          <Route path="/properties/:id/health" element={<ProtectedRoute allowedRoles={['owner']}><HealthScorePage /></ProtectedRoute>} />
          <Route path="/analytics/turnover" element={<ProtectedRoute allowedRoles={['owner']}><TurnoverEnginePage /></ProtectedRoute>} />
          <Route path="/properties/:propertyId/units" element={<ProtectedRoute allowedRoles={['owner']}><PropertyUnitsPage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute allowedRoles={NOTIFICATION_ROLES}><NotificationInboxPage /></ProtectedRoute>} />
          <Route path="/design-studio" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignStudioPage /></ProtectedRoute>} />
          <Route path="/design-studio/request/:id" element={<ProtectedRoute allowedRoles={['owner', 'tenant']}><DesignRequestDetailPage /></ProtectedRoute>} />
          <Route path="/invoices/:id" element={<InvoiceDetailsPage />} />
          <Route path="/tenant/*" element={<ProtectedRoute allowedRoles={['tenant']}><TenantApp /></ProtectedRoute>} />
          <Route path="/technician/*" element={<ProtectedRoute allowedRoles={['technician']}><TechnicianApp /></ProtectedRoute>} />
          <Route path="/tech/*" element={<Navigate to="/technician/dashboard" replace />} />
          <Route path="/broker/*" element={<ProtectedRoute allowedRoles={['broker']}><BrokerApp /></ProtectedRoute>} />
          <Route path="/owner/*" element={<ProtectedRoute allowedRoles={['owner', 'ceo']}><OwnerApp /></ProtectedRoute>} />
          <Route path="/auditor/*" element={<ProtectedRoute allowedRoles={['auditor']}><AuditorPortalPage /></ProtectedRoute>} />
          <Route path="/admin/*" element={<ProtectedRoute allowedRoles={ADMIN_STAFF_ROLES}><AdminTerminal /></ProtectedRoute>} />
          <Route path="/verify/invoice/:id" element={<InvoiceVerificationPage />} />
          <Route path="/verify/cert/:id" element={<CertificateVerificationPage />} />
          <Route path="/tenant-invite" element={<TenantInvitePage />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </React.Suspense>
      {!location.pathname.startsWith('/onboarding') && !publicRoute && !isAdminRoute && ['owner', 'tenant'].includes((role || '').toLowerCase()) && (
        <SovereignAIChat role={(role || 'unknown').toLowerCase() as any} onNavigate={navigate} />
      )}
      <IOSPwaGuardian />
      {!isAdminRoute && <NavigationControl />}
    </RoleRedirector>
  );
}

const HEADERLESS_ROUTES = new Set([
  '/', '/owners', '/tenants', '/technicians', '/brokers', '/property-management', '/maintenance',
  '/majlis-care', '/stadiums', '/hotels', '/malls', '/hospitals', '/government-properties', '/security',
  '/services', '/contact', '/request-demo', '/videos', '/demo-videos', '/company', '/ai-design-studio',
  '/login', '/gateway', '/terms-of-service', '/privacy-policy', '/terms', '/privacy', '/support', '/feedback', '/pilot-feedback',
  '/owner-landing', '/v1', '/tenant-invite',
]);

function HeaderSlot() {
  const location = useLocation();
  const pathname = location.pathname;
  const hideHeader = HEADERLESS_ROUTES.has(pathname)
    || pathname.startsWith('/onboarding')
    || pathname.startsWith('/verify')
    || pathname.startsWith('/invoices')
    || pathname.startsWith('/tenant')
    || pathname.startsWith('/owner')
    || pathname.startsWith('/technician')
    || pathname.startsWith('/admin')
    || pathname.startsWith('/broker');

  return hideHeader ? null : <BinGroupHeader />;
}

export default function App() {
  return (
    <Router>
      <LanguageProvider>
        <CustomThemeProvider>
          <AuthProvider>
            <AIProvider>
              <CssBaseline />
              <HeaderSlot />
              <AppContent />
              <SovereignAlertHandler />
            </AIProvider>
          </AuthProvider>
        </CustomThemeProvider>
      </LanguageProvider>
    </Router>
  );
}

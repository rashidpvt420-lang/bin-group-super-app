import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Box, Button, Typography, CssBaseline, CircularProgress } from '@mui/material';

import PublicMarketingPage from './pages/public/PublicMarketingPage';
import PrivacyPage from './pages/public/PrivacyPage';
import TermsPage from './pages/public/TermsPage';
import SupportPage from './pages/public/SupportPage';
import PilotFeedbackPage from './pages/public/PilotFeedbackPage';
import DemoVideosPage from './pages/public/DemoVideosPage';
import PublicSecurityPage from './pages/public/PublicSecurityPage';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { CustomThemeProvider } from './context/ThemeContext';
import { AIProvider } from './context/AIContext';
import { SovereignAIChat } from './components/SovereignAIChat';
import IOSPwaGuardian from './components/IOSPwaGuardian';

function lazyWithRetry(componentImport: () => Promise<any>) {
  return React.lazy(async () => {
    try {
      return await componentImport();
    } catch (error: any) {
      console.error("Dynamic import failed. Checking if reload is needed...", error);
      const isChunkLoadError =
        /failed to fetch/i.test(error.message || '') ||
        /dynamically imported module/i.test(error.message || '') ||
        /loading chunk/i.test(error.message || '') ||
        /chunk/i.test(error.message || '');

      if (isChunkLoadError) {
        try {
          const lastReload = sessionStorage.getItem('bin_chunk_reload_timestamp');
          const now = Date.now();
          if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
            sessionStorage.setItem('bin_chunk_reload_timestamp', String(now));
            console.warn("Forcing page reload to fetch updated bundle chunks.");
            window.location.reload();
            return new Promise(() => {});
          }
        } catch (e) {
          console.error("Error setting session storage or reloading", e);
        }
      }
      throw error;
    }
  });
}

const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const OwnerLandingPage = lazyWithRetry(() => import('./pages/OwnerLandingPage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const RoleGatewayPage = lazyWithRetry(() => import('./pages/RoleGatewayPage'));
const PropertyOnboardingPage = lazyWithRetry(() => import('./pages/PropertyOnboardingPage'));
const CompanyProfilePage = lazyWithRetry(() => import('./pages/public/CompanyProfilePage'));
const InvoiceVerificationPage = lazyWithRetry(() => import('./pages/public/InvoiceVerificationPage'));
const CertificateVerificationPage = lazyWithRetry(() => import('./pages/public/CertificateVerificationPage'));
const InvoiceDetailsPage = lazyWithRetry(() => import('./pages/InvoiceDetailsPage'));
const TenantInvitePage = lazyWithRetry(() => import('./pages/TenantInvitePage'));

const AuthenticatedShell = lazyWithRetry(() => import('./components/AuthenticatedShell'));
const ProtectedRoute = lazyWithRetry(() => import('./components/ProtectedRoute'));

const FinancialDashboardPage = lazyWithRetry(() => import('./pages/FinancialDashboardPage'));
const HealthScorePage = lazyWithRetry(() => import('./pages/HealthScorePage'));
const MaintenanceCalendarPage = lazyWithRetry(() => import('./pages/MaintenanceCalendarPage'));
const TurnoverEnginePage = lazyWithRetry(() => import('./pages/TurnoverEnginePage'));
const GovernmentPropertyPage = lazyWithRetry(() => import('./pages/GovernmentPropertyPage'));
const PropertyUnitsPage = lazyWithRetry(() => import('./pages/PropertyUnitsPage'));
const NotificationInboxPage = lazyWithRetry(() => import('./pages/NotificationInboxPage'));
const DesignStudioPage = lazyWithRetry(() => import('./pages/DesignStudioPage'));
const DesignRequestDetailPage = lazyWithRetry(() => import('./pages/DesignRequestDetailPage'));
const TenantApp = lazyWithRetry(() => import('./tenant/TenantApp'));
const TechnicianApp = lazyWithRetry(() => import('./technician/TechnicianApp'));
const ReportingDashboard = lazyWithRetry(() => import('./pages/ReportingDashboard'));
const ExecutiveReportingPage = lazyWithRetry(() => import('./pages/ExecutiveReportingPage'));
const BrokerApp = lazyWithRetry(() => import('./broker/BrokerApp'));
const AuditorPortalPage = lazyWithRetry(() => import('./pages/public/AuditorPortalPage'));
const AdminTerminal = lazyWithRetry(() => import('./admin/AdminTerminal'));
const OwnerApp = lazyWithRetry(() => import('./owner/OwnerApp'));

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

const ROLE_PORTAL_PREFIXES = ['/owner', '/tenant', '/technician', '/tech', '/broker', '/admin', '/auditor'];

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
    }, 12000);
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

type AuthOptions = {
  showChrome?: boolean;
  publicAuth?: boolean;
};

function withAuth(children: React.ReactNode, options: AuthOptions = {}) {
  return (
    <AuthenticatedShell
      showChrome={options.showChrome ?? true}
      publicAuth={options.publicAuth ?? false}
      loadingFallback={<LoadingScreen />}
    >
      {children}
    </AuthenticatedShell>
  );
}

function protectedRoute(allowedRoles: string[], children: React.ReactNode) {
  return withAuth(<ProtectedRoute allowedRoles={allowedRoles}>{children}</ProtectedRoute>);
}

function PublicSovereignAIEntry() {
  const location = useLocation();
  const isRolePortalRoute = ROLE_PORTAL_PREFIXES.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`));
  if (isRolePortalRoute) return null;
  return <SovereignAIChat role="unknown" />;
}

function AppContent() {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<PublicMarketingPage page="home" />} />
        <Route path="/owner-landing" element={withAuth(<OwnerLandingPage />, { publicAuth: true, showChrome: false })} />
        <Route path="/v1" element={withAuth(<LandingPage />, { publicAuth: true, showChrome: false })} />
        <Route path="/gateway" element={withAuth(<RoleGatewayPage />, { publicAuth: true, showChrome: false })} />
        <Route path="/login" element={withAuth(<LoginPage />, { publicAuth: true, showChrome: false })} />
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
        <Route path="/security" element={<PublicSecurityPage />} />
        <Route path="/services" element={<PublicMarketingPage page="property-management" />} />
        <Route path="/contact" element={<PublicMarketingPage page="contact" />} />
        <Route path="/request-demo" element={<DemoVideosPage />} />
        <Route path="/videos" element={<DemoVideosPage />} />
        <Route path="/demo-videos" element={<Navigate to="/videos" replace />} />
        <Route path="/company" element={<CompanyProfilePage />} />
        <Route path="/company-profile" element={<CompanyProfilePage />} />
        <Route path="/about" element={<CompanyProfilePage />} />
        <Route path="/about-us" element={<CompanyProfilePage />} />
        <Route path="/onboarding/*" element={withAuth(<PropertyOnboardingPage />, { publicAuth: true, showChrome: false })} />
        <Route path="/government/:id" element={protectedRoute(['owner', 'admin'], <GovernmentPropertyPage />)} />
        <Route path="/owner-dashboard" element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="/dashboard" element={<Navigate to="/owner/dashboard" replace />} />
        <Route path="/financials" element={protectedRoute(['owner'], <FinancialDashboardPage />)} />
        <Route path="/calendar" element={protectedRoute(['owner', 'admin', 'technician'], <MaintenanceCalendarPage />)} />
        <Route path="/properties/:id/health" element={protectedRoute(['owner'], <HealthScorePage />)} />
        <Route path="/analytics/reporting" element={protectedRoute(['admin', 'owner'], <ReportingDashboard />)} />
        <Route path="/analytics/executive" element={protectedRoute(['admin', 'owner'], <ExecutiveReportingPage />)} />
        <Route path="/analytics/turnover" element={protectedRoute(['owner'], <TurnoverEnginePage />)} />
        <Route path="/properties/:propertyId/units" element={protectedRoute(['owner'], <PropertyUnitsPage />)} />
        <Route path="/notifications" element={protectedRoute(NOTIFICATION_ROLES, <NotificationInboxPage />)} />
        <Route path="/design-studio" element={protectedRoute(['owner', 'tenant'], <DesignStudioPage />)} />
        <Route path="/design-studio/request/:id" element={protectedRoute(['owner', 'tenant'], <DesignRequestDetailPage />)} />
        <Route path="/invoices/:id" element={withAuth(<InvoiceDetailsPage />, { publicAuth: true, showChrome: false })} />
        <Route path="/tenant/*" element={protectedRoute(['tenant'], <TenantApp />)} />
        <Route path="/technician/*" element={protectedRoute(['technician'], <TechnicianApp />)} />
        <Route path="/tech/*" element={<Navigate to="/technician/dashboard" replace />} />
        <Route path="/broker/*" element={protectedRoute(['broker'], <BrokerApp />)} />
        <Route path="/owner/*" element={protectedRoute(['owner', 'ceo'], <OwnerApp />)} />
        <Route path="/auditor/*" element={protectedRoute(['auditor'], <AuditorPortalPage />)} />
        <Route path="/admin/*" element={protectedRoute(ADMIN_STAFF_ROLES, <AdminTerminal />)} />
        <Route path="/verify/invoice/:id" element={<InvoiceVerificationPage />} />
        <Route path="/verify/cert/:id" element={<CertificateVerificationPage />} />
        <Route path="/tenant-invite" element={<TenantInvitePage />} />
        <Route path="/home" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </React.Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <LanguageProvider>
        <CustomThemeProvider>
          <AIProvider>
            <CssBaseline />
            <AppContent />
            <PublicSovereignAIEntry />
            <IOSPwaGuardian />
          </AIProvider>
        </CustomThemeProvider>
      </LanguageProvider>
    </Router>
  );
}

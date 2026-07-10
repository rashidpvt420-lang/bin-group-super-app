import React from 'react';
import { BrowserRouter as Router, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Button, CircularProgress, CssBaseline, Typography } from '@mui/material';
import { LogOut, User as UserIcon } from 'lucide-react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { AIProvider, LanguageProvider, SovereignAIChat, SovereignAlertHandler, useLanguage } from '@bin/shared';

import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import BulkImporter from './components/BulkImporter';
import AdminPaymentApproval from './components/AdminPaymentApproval';
import InstitutionalReportsPanel from './components/reports/InstitutionalReportsPanel';
import PilotCommandCenter from './components/pilot/PilotCommandCenter';
import PublicLaunchOpsPanel from './components/ops/PublicLaunchOpsPanel';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { adminTheme } from './theme/adminTheme';

import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OwnerManagementPage from './pages/owners/OwnerManagementPage';
import OwnerDetailsPage from './pages/owners/OwnerDetailsPage';
import TenantsManagementPage from './pages/tenants/TenantsManagementPage';
import TicketsManagementPage from './pages/tickets/TicketsManagementPage';
import TechniciansManagementPage from './pages/technicians/TechniciansManagementPage';
import TechnicianDutyMonitorPage from './pages/technicians/TechnicianDutyMonitorPage';
import TechnicianPerformancePage from './pages/technicians/TechnicianPerformancePage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import SOSFeedPage from './pages/sos/SOSFeedPage';
import InstitutionalDocumentVaultPage from './pages/documents/InstitutionalDocumentVaultPage';
import PropertyPassportPage from './pages/properties/PropertyPassportPage';
import LiveMapPage from './pages/map/LiveMapPage';
import PaymentApprovalsPage from './pages/financials/PaymentApprovalsPage';
import PayrollManagementPage from './pages/financials/PayrollManagementPage';
import ProfitabilityDashboardPage from './pages/financials/ProfitabilityDashboardPage';
import TransactionsPage from './pages/financials/TransactionsPage';
import BrokerManagementPage from './pages/brokers/BrokerManagementPage';
import BrokerCommissionHubPage from './pages/brokers/BrokerCommissionHubPage';
import AuditLogPage from './pages/AuditLogPage';
import ProductionControlCenter from './pages/ProductionControlCenter';
import SmokeTestPage from './pages/smoke-test/SmokeTestPage';

import AdminPropertyApprovalsPage from './pages/admin/AdminPropertyApprovalsPage';
import AuditShieldPage from './pages/admin/AuditShieldPage';
import BinConnectInboxPage from './pages/admin/BinConnectInboxPage';
import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';
import CompliancePage from './pages/admin/CompliancePage';
import ContractTerminationPage from './pages/admin/ContractTerminationPage';
import DataGovernanceAuditPage from './pages/admin/DataGovernanceAuditPage';
import DesignStudioAdminPage from './pages/admin/DesignStudioAdminPage';
import GeoRepairCommandCenter from './pages/admin/GeoRepairCommandCenter';
import HRManagementPage from './pages/admin/HRManagementPage';
import { IntakeVaultPage } from './pages/admin/IntakeVaultPage';
import LiveOpsCommandCenter from './pages/admin/LiveOpsCommandCenter';
import OrphanWarRoomPage from './pages/admin/OrphanWarRoomPage';
import PilotCompletionCommandPage from './pages/admin/PilotCompletionCommandPage';
import PricingMatrixPage from './pages/admin/PricingMatrixPage';
import ProfitabilityPage from './pages/admin/ProfitabilityPage';
import PropertyManagementPage from './pages/admin/PropertyManagementPage';
import PropertyOnboardingPage from './pages/admin/PropertyOnboardingPage';
import PublicLaunchCommandCenterPage from './pages/admin/PublicLaunchCommandCenterPage';
import RfqTrustWorkflowPage from './pages/admin/RfqTrustWorkflowPage';
import StaffAccessPage from './pages/admin/StaffAccessPage';
import UnitStatusPage from './pages/admin/UnitStatusPage';
import VendorCommandCenterPage from './pages/admin/VendorCommandCenterPage';
import WhatsAppTriageQueuePage from './pages/admin/WhatsAppTriageQueuePage';

import AdminBrokerAttributionQueuePage from './pages/ops/AdminBrokerAttributionQueuePage';
import AmenityControlPage from './pages/ops/AmenityControlPage';
import AnnouncementsPage from './pages/ops/AnnouncementsPage';
import CommunityModerationPage from './pages/ops/CommunityModerationPage';
import DisputeQueuePage from './pages/ops/DisputeQueuePage';
import DocumentLibraryPage from './pages/ops/DocumentLibraryPage';
import EmergencyCommandCenterPage from './pages/ops/EmergencyCommandCenterPage';
import KeyRegisterPage from './pages/ops/KeyRegisterPage';
import MarketplaceApprovalsPage from './pages/ops/MarketplaceApprovalsPage';
import MessagesPage from './pages/ops/MessagesPage';
import ParcelDeskPage from './pages/ops/ParcelDeskPage';
import StaffDirectoryPage from './pages/ops/StaffDirectoryPage';
import TenantServicesQueuePage from './pages/ops/TenantServicesQueuePage';
import TenantUnitLinkQueuePage from './pages/ops/TenantUnitLinkQueuePage';
import VisitorParkingPage from './pages/ops/VisitorParkingPage';

const cacheRtl = createCache({ key: 'muirtl-admin', stylisPlugins: [prefixer, rtlPlugin] });
const cacheLtr = createCache({ key: 'muiltr-admin' });

function AdminOnly({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute adminOnly>{children}</ProtectedRoute>;
}

function AppContent() {
  const { isAuthenticated, loading, error } = useAuth();
  const { t, isRTL } = useLanguage();
  const [safetyReleased, setSafetyReleased] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSafetyReleased(true), 12000);
    return () => window.clearTimeout(timer);
  }, []);

  if (loading && !safetyReleased) {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#020617', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress sx={{ color: '#DAA520', mb: 3 }} />
          <Typography sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 2 }}>{t('dash.command_subtitle') || 'Loading admin command center'}</Typography>
        </Box>
      </Box>
    );
  }

  if (error && !isAuthenticated) {
    return (
      <Box sx={{ height: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#020617', p: 4, textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Box>
          <Typography variant="h4" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>Admin verification failed</Typography>
          <Typography sx={{ color: '#fff', opacity: 0.8, mb: 3 }}>{error}</Typography>
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }}>Reload</Button>
        </Box>
      </Box>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {isAuthenticated && (
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/dashboard/full" element={<Navigate to="/dashboard" replace />} />

          <Route path="/owners" element={<ProtectedRoute><OwnerManagementPage /></ProtectedRoute>} />
          <Route path="/owners/:id" element={<ProtectedRoute><OwnerDetailsPage /></ProtectedRoute>} />
          <Route path="/properties/approvals" element={<AdminOnly><AdminPropertyApprovalsPage /></AdminOnly>} />
          <Route path="/properties/passport" element={<ProtectedRoute><PropertyPassportPage /></ProtectedRoute>} />
          <Route path="/properties/manage" element={<AdminOnly><PropertyManagementPage /></AdminOnly>} />
          <Route path="/onboard-property" element={<AdminOnly><PropertyOnboardingPage /></AdminOnly>} />
          <Route path="/admin/units" element={<AdminOnly><UnitStatusPage /></AdminOnly>} />
          <Route path="/admin/unit-status" element={<Navigate to="/admin/units" replace />} />
          <Route path="/unit-links" element={<AdminOnly><TenantUnitLinkQueuePage /></AdminOnly>} />

          <Route path="/tenants" element={<ProtectedRoute><TenantsManagementPage /></ProtectedRoute>} />
          <Route path="/tenant-services" element={<AdminOnly><TenantServicesQueuePage /></AdminOnly>} />
          <Route path="/ops/announcements" element={<AdminOnly><AnnouncementsPage /></AdminOnly>} />
          <Route path="/ops/amenities" element={<AdminOnly><AmenityControlPage /></AdminOnly>} />
          <Route path="/ops/parcels" element={<AdminOnly><ParcelDeskPage /></AdminOnly>} />
          <Route path="/ops/visitor-parking" element={<AdminOnly><VisitorParkingPage /></AdminOnly>} />
          <Route path="/ops/keys" element={<AdminOnly><KeyRegisterPage /></AdminOnly>} />
          <Route path="/ops/community" element={<AdminOnly><CommunityModerationPage /></AdminOnly>} />
          <Route path="/ops/marketplace" element={<AdminOnly><MarketplaceApprovalsPage /></AdminOnly>} />
          <Route path="/ops/messages" element={<AdminOnly><MessagesPage /></AdminOnly>} />
          <Route path="/ops/staff-directory" element={<AdminOnly><StaffDirectoryPage /></AdminOnly>} />

          <Route path="/tickets" element={<ProtectedRoute><TicketsManagementPage /></ProtectedRoute>} />
          <Route path="/disputes" element={<AdminOnly><DisputeQueuePage /></AdminOnly>} />
          <Route path="/sos" element={<ProtectedRoute><SOSFeedPage /></ProtectedRoute>} />
          <Route path="/ops/emergency" element={<AdminOnly><EmergencyCommandCenterPage /></AdminOnly>} />
          <Route path="/technicians" element={<ProtectedRoute><TechniciansManagementPage /></ProtectedRoute>} />
          <Route path="/technicians/map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
          <Route path="/technicians/performance" element={<AdminOnly><TechnicianPerformancePage /></AdminOnly>} />
          <Route path="/ops/technicians" element={<AdminOnly><TechnicianDutyMonitorPage /></AdminOnly>} />

          <Route path="/broker" element={<AdminOnly><BrokerManagementPage /></AdminOnly>} />
          <Route path="/broker-attributions" element={<AdminOnly><AdminBrokerAttributionQueuePage /></AdminOnly>} />
          <Route path="/broker-commissions" element={<AdminOnly><BrokerCommissionHubPage /></AdminOnly>} />

          <Route path="/financials" element={<AdminOnly><ProfitabilityDashboardPage /></AdminOnly>} />
          <Route path="/financials/payroll" element={<AdminOnly><PayrollManagementPage /></AdminOnly>} />
          <Route path="/transactions" element={<AdminOnly><TransactionsPage /></AdminOnly>} />
          <Route path="/manual-approvals" element={<AdminOnly><AdminPaymentApproval /></AdminOnly>} />
          <Route path="/payments" element={<AdminOnly><PaymentApprovalsPage /></AdminOnly>} />
          <Route path="/admin/payments" element={<Navigate to="/payments" replace />} />
          <Route path="/profitability" element={<AdminOnly><ProfitabilityPage /></AdminOnly>} />

          <Route path="/document-vault" element={<AdminOnly><InstitutionalDocumentVaultPage /></AdminOnly>} />
          <Route path="/document-library" element={<AdminOnly><DocumentLibraryPage /></AdminOnly>} />
          <Route path="/vault" element={<AdminOnly><IntakeVaultPage /></AdminOnly>} />
          <Route path="/audit" element={<AdminOnly><AuditLogPage /></AdminOnly>} />
          <Route path="/audit-shield" element={<AdminOnly><AuditShieldPage /></AdminOnly>} />
          <Route path="/compliance" element={<AdminOnly><CompliancePage /></AdminOnly>} />
          <Route path="/ops/data-governance" element={<AdminOnly><DataGovernanceAuditPage /></AdminOnly>} />
          <Route path="/reports" element={<AdminOnly><ReportsPage /></AdminOnly>} />
          <Route path="/reports/institutional" element={<AdminOnly><InstitutionalReportsPanel /></AdminOnly>} />

          <Route path="/control-center" element={<AdminOnly><ProductionControlCenter /></AdminOnly>} />
          <Route path="/ops/live" element={<AdminOnly><LiveOpsCommandCenter /></AdminOnly>} />
          <Route path="/ops/geo-repair" element={<AdminOnly><GeoRepairCommandCenter /></AdminOnly>} />
          <Route path="/ops/whatsapp-triage" element={<AdminOnly><WhatsAppTriageQueuePage /></AdminOnly>} />
          <Route path="/ops/rfq" element={<AdminOnly><RfqTrustWorkflowPage /></AdminOnly>} />
          <Route path="/ops/vendors" element={<AdminOnly><VendorCommandCenterPage /></AdminOnly>} />
          <Route path="/ops/bin-connect" element={<AdminOnly><BinConnectInboxPage /></AdminOnly>} />
          <Route path="/ops/pilot-completion" element={<AdminOnly><PilotCompletionCommandPage /></AdminOnly>} />
          <Route path="/ops/public-launch-command" element={<AdminOnly><PublicLaunchCommandCenterPage /></AdminOnly>} />
          <Route path="/ops/public" element={<AdminOnly><PublicLaunchOpsPanel /></AdminOnly>} />
          <Route path="/pilot" element={<AdminOnly><PilotCommandCenter /></AdminOnly>} />
          <Route path="/smoke-test" element={<AdminOnly><SmokeTestPage /></AdminOnly>} />
          <Route path="/orphans" element={<AdminOnly><OrphanWarRoomPage /></AdminOnly>} />

          <Route path="/design-studio" element={<AdminOnly><DesignStudioAdminPage /></AdminOnly>} />
          <Route path="/hr" element={<AdminOnly><HRManagementPage /></AdminOnly>} />
          <Route path="/staff-access" element={<AdminOnly><StaffAccessPage /></AdminOnly>} />
          <Route path="/contracts/termination" element={<AdminOnly><ContractTerminationPage /></AdminOnly>} />
          <Route path="/admin/pricing-matrix" element={<AdminOnly><PricingMatrixPage /></AdminOnly>} />
          <Route path="/admin/bin-gpt-engineer" element={<AdminOnly><BinGptEngineerPage /></AdminOnly>} />
          <Route path="/bulk-import" element={<AdminOnly><BulkImporter /></AdminOnly>} />
          <Route path="/settings" element={<AdminOnly><SettingsPage /></AdminOnly>} />
        </Route>
      )}
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

function Layout() {
  const { t, isRTL } = useLanguage();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: '#020617', overflow: 'hidden', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Navigation />
      <Box sx={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <Box sx={{ px: { xs: 2, md: 4 }, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'rgba(2,6,23,0.88)', borderBottom: '1px solid rgba(255,255,255,0.06)', zIndex: 1100 }}>
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, letterSpacing: 2 }}>
            {t('nav.administry') || 'ADMIN'} / <Box component="span" sx={{ color: '#DAA520' }}>COMMAND · UAE 🇦🇪</Box>
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <LanguageSwitcher />
            <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1.25, px: 2, py: 0.75, borderRadius: 100, bgcolor: 'rgba(255,255,255,0.04)' }}>
              <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: '#DAA520', display: 'grid', placeItems: 'center' }}><UserIcon size={14} color="#000" /></Box>
              <Box><Typography variant="caption" sx={{ color: '#fff', fontWeight: 900, display: 'block' }}>{user?.displayName?.split(' ')[0] || 'ADMIN'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.62rem' }}>{user?.role || 'operator'}</Typography></Box>
            </Box>
            <Button onClick={async () => { await logout(); navigate('/login', { replace: true }); }} startIcon={<LogOut size={16} />} sx={{ color: '#ef4444', fontWeight: 900 }}>Logout</Button>
          </Box>
        </Box>
        <Box component="main" sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', bgcolor: '#020617' }}><Outlet /></Box>
      </Box>
      <Box sx={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }}><SovereignAIChat role="admin" onNavigate={navigate} /></Box>
      <SovereignAlertHandler />
    </Box>
  );
}

function AdminThemeProviderWrapper() {
  const { isRTL } = useLanguage();
  const theme = React.useMemo(() => createTheme({ ...adminTheme as any, direction: isRTL ? 'rtl' : 'ltr' }), [isRTL]);
  return (
    <CacheProvider value={isRTL ? cacheRtl : cacheLtr}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Router>
          <AuthProvider>
            <AIProvider><AppContent /></AIProvider>
          </AuthProvider>
        </Router>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default function App() {
  return <LanguageProvider><AdminThemeProviderWrapper /></LanguageProvider>;
}

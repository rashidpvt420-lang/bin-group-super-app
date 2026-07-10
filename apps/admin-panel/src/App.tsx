import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Alert, Box, Button, CircularProgress, CssBaseline, Stack, Typography } from '@mui/material';
import { LanguageProvider, AIProvider, SovereignAIChat, SovereignAlertHandler, useLanguage } from '@bin/shared';

import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import UnifiedLogin from './components/UnifiedLogin';
import Navigation from './components/Navigation';
import { adminTheme, binThemeTokens } from './theme/adminTheme';

import AdminSimpleDashboardPage from './pages/dashboard/AdminSimpleDashboardPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import OwnersPage from './pages/owners/OwnerManagementPage';
import OwnerDetailsPage from './pages/owners/OwnerDetailsPage';
import TenantsPage from './pages/tenants/TenantsManagementPage';
import TicketsPage from './pages/tickets/TicketsManagementPage';
import TechniciansPage from './pages/technicians/TechniciansManagementPage';
import TechnicianDutyMonitorPage from './pages/technicians/TechnicianDutyMonitorPage';
import LiveMapPage from './pages/map/LiveMapPage';
import SOSFeedPage from './pages/sos/SOSFeedPage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import InstitutionalDocumentVaultPage from './pages/documents/InstitutionalDocumentVaultPage';
import BrokerManagementPage from './pages/brokers/BrokerManagementPage';
import BrokerCommissionHubPage from './pages/brokers/BrokerCommissionHubPage';
import PropertyPassportPage from './pages/properties/PropertyPassportPage';
import AuditLogPage from './pages/AuditLogPage';
import ProductionControlCenter from './pages/ProductionControlCenter';

import ProfitabilityDashboardPage from './pages/financials/ProfitabilityDashboardPage';
import PayrollManagementPage from './pages/financials/PayrollManagementPage';
import TransactionsPage from './pages/financials/TransactionsPage';
import PaymentApprovalsPage from './pages/financials/PaymentApprovalsPage';

import AuditShieldPage from './pages/admin/AuditShieldPage';
import ProfitabilityPage from './pages/admin/ProfitabilityPage';
import CompliancePage from './pages/admin/CompliancePage';
import { IntakeVaultPage } from './pages/admin/IntakeVaultPage';
import OrphanWarRoomPage from './pages/admin/OrphanWarRoomPage';
import PropertyOnboardingPage from './pages/admin/PropertyOnboardingPage';
import DesignStudioAdminPage from './pages/admin/DesignStudioAdminPage';
import HRManagementPage from './pages/admin/HRManagementPage';
import PricingMatrixPage from './pages/admin/PricingMatrixPage';
import UnitStatusPage from './pages/admin/UnitStatusPage';
import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';
import StaffAccessPage from './pages/admin/StaffAccessPage';
import AdminPropertyApprovalsPage from './pages/admin/AdminPropertyApprovalsPage';
import ContractTerminationPage from './pages/admin/ContractTerminationPage';
import WhatsAppTriageQueuePage from './pages/admin/WhatsAppTriageQueuePage';
import RfqTrustWorkflowPage from './pages/admin/RfqTrustWorkflowPage';
import VendorCommandCenterPage from './pages/admin/VendorCommandCenterPage';
import DataGovernanceAuditPage from './pages/admin/DataGovernanceAuditPage';
import BinConnectInboxPage from './pages/admin/BinConnectInboxPage';
import PilotCompletionCommandPage from './pages/admin/PilotCompletionCommandPage';
import PublicLaunchCommandCenterPage from './pages/admin/PublicLaunchCommandCenterPage';

import AdminBrokerAttributionQueuePage from './pages/ops/AdminBrokerAttributionQueuePage';
import TenantUnitLinkQueuePage from './pages/ops/TenantUnitLinkQueuePage';
import TenantServicesQueuePage from './pages/ops/TenantServicesQueuePage';
import MessagesPage from './pages/ops/MessagesPage';
import DisputeQueuePage from './pages/ops/DisputeQueuePage';

import BulkImporter from './components/BulkImporter';
import AdminPaymentApproval from './components/AdminPaymentApproval';
import InstitutionalReportsPanel from './components/reports/InstitutionalReportsPanel';
import PilotCommandCenter from './components/pilot/PilotCommandCenter';
import PublicLaunchOpsPanel from './components/ops/PublicLaunchOpsPanel';

const DRAWER_WIDTH = 280;

function AdminLoading() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.tray, color: binThemeTokens.gold, display: 'grid', placeItems: 'center', px: 3, textAlign: 'center' }}>
      <Stack spacing={3} alignItems="center">
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
        <Typography sx={{ fontWeight: 950, letterSpacing: 4, textTransform: 'uppercase' }}>
          Authenticating Admin Command Center
        </Typography>
      </Stack>
    </Box>
  );
}

function LoginRoute() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <AdminLoading />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return <UnifiedLogin />;
}

function AdminShell({ children }: { children: React.ReactNode }) {
  const { isRTL } = useLanguage();
  const { error } = useAuth();

  return (
    <ProtectedRoute>
      <Box sx={{ minHeight: '100vh', bgcolor: binThemeTokens.tray, display: 'flex', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Navigation />
        <Box
          component="main"
          sx={{
            flexGrow: 1,
            minHeight: '100vh',
            bgcolor: binThemeTokens.tray,
            ml: isRTL ? 0 : `${DRAWER_WIDTH}px`,
            mr: isRTL ? `${DRAWER_WIDTH}px` : 0,
            width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
            overflowX: 'hidden',
          }}
        >
          {error ? <Alert severity="warning" sx={{ m: 2 }}>{error}</Alert> : null}
          {children}
        </Box>
      </Box>
    </ProtectedRoute>
  );
}

function protectedPage(children: React.ReactNode, adminOnly = false, extraRoles: string[] = []) {
  return (
    <AdminShell>
      <ProtectedRoute adminOnly={adminOnly} extraRoles={extraRoles}>{children}</ProtectedRoute>
    </AdminShell>
  );
}

function AdminPrefixRedirect() {
  const location = useLocation();
  const strippedPath = location.pathname.replace(/^\/admin(?=\/|$)/, '') || '/dashboard';
  return <Navigate to={`${strippedPath}${location.search}${location.hash}`} replace />;
}

function NotFoundRoute() {
  return (
    <AdminShell>
      <Box sx={{ minHeight: '65vh', display: 'grid', placeItems: 'center', p: 4 }}>
        <Stack spacing={2} alignItems="center" textAlign="center">
          <Typography variant="h4" sx={{ fontWeight: 950 }}>Admin route not found</Typography>
          <Typography color="text.secondary">The requested legacy route is not registered in the canonical Admin Panel.</Typography>
          <Button variant="contained" href="/dashboard">Open Command Center</Button>
        </Stack>
      </Box>
    </AdminShell>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      <Route path="/dashboard" element={protectedPage(<AdminSimpleDashboardPage />)} />
      <Route path="/dashboard/full" element={protectedPage(<DashboardPage />)} />

      <Route path="/owners" element={protectedPage(<OwnersPage />)} />
      <Route path="/owners/:id" element={protectedPage(<OwnerDetailsPage />)} />
      <Route path="/tenants" element={protectedPage(<TenantsPage />)} />
      <Route path="/tickets" element={protectedPage(<TicketsPage />)} />
      <Route path="/technicians" element={protectedPage(<TechniciansPage />)} />
      <Route path="/technicians/map" element={protectedPage(<LiveMapPage />)} />
      <Route path="/live-map" element={<Navigate to="/technicians/map" replace />} />
      <Route path="/sos" element={protectedPage(<SOSFeedPage />)} />
      <Route path="/disputes" element={protectedPage(<DisputeQueuePage />, true)} />

      <Route path="/financials" element={protectedPage(<ProfitabilityDashboardPage />, true)} />
      <Route path="/financials/payroll" element={protectedPage(<PayrollManagementPage />, true)} />
      <Route path="/transactions" element={protectedPage(<TransactionsPage />, true)} />
      <Route path="/payments" element={protectedPage(<PaymentApprovalsPage />, true)} />
      <Route path="/manual-approvals" element={protectedPage(<AdminPaymentApproval />, true)} />
      <Route path="/profitability" element={protectedPage(<ProfitabilityPage />, true)} />

      <Route path="/broker" element={protectedPage(<BrokerManagementPage />, true)} />
      <Route path="/broker-attributions" element={protectedPage(<AdminBrokerAttributionQueuePage />, true)} />
      <Route path="/broker-commissions" element={protectedPage(<BrokerCommissionHubPage />, true)} />

      <Route path="/properties/passport" element={protectedPage(<PropertyPassportPage />)} />
      <Route path="/properties/approvals" element={protectedPage(<AdminPropertyApprovalsPage />, true)} />
      <Route path="/onboard-property" element={protectedPage(<PropertyOnboardingPage />, true)} />
      <Route path="/units" element={protectedPage(<UnitStatusPage />, true)} />
      <Route path="/unit-links" element={protectedPage(<TenantUnitLinkQueuePage />, true)} />
      <Route path="/tenant-services" element={protectedPage(<TenantServicesQueuePage />, true)} />
      <Route path="/contracts/termination" element={protectedPage(<ContractTerminationPage />, true)} />

      <Route path="/document-vault" element={protectedPage(<InstitutionalDocumentVaultPage />, true)} />
      <Route path="/vault" element={protectedPage(<IntakeVaultPage />, true)} />
      <Route path="/audit" element={protectedPage(<AuditLogPage />, true)} />
      <Route path="/audit-shield" element={protectedPage(<AuditShieldPage />, true)} />
      <Route path="/compliance" element={protectedPage(<CompliancePage />, true)} />
      <Route path="/ops/data-governance" element={protectedPage(<DataGovernanceAuditPage />, true)} />

      <Route path="/control-center" element={protectedPage(<ProductionControlCenter />, true)} />
      <Route path="/ops/technicians" element={protectedPage(<TechnicianDutyMonitorPage />, true)} />
      <Route path="/ops/messages" element={protectedPage(<MessagesPage />, true)} />
      <Route path="/ops/whatsapp-triage" element={protectedPage(<WhatsAppTriageQueuePage />, true)} />
      <Route path="/ops/rfq" element={protectedPage(<RfqTrustWorkflowPage />, true)} />
      <Route path="/ops/vendors" element={protectedPage(<VendorCommandCenterPage />, true)} />
      <Route path="/ops/bin-connect" element={protectedPage(<BinConnectInboxPage />, true)} />
      <Route path="/ops/pilot-completion" element={protectedPage(<PilotCompletionCommandPage />, true)} />
      <Route path="/ops/public-launch-command" element={protectedPage(<PublicLaunchCommandCenterPage />, true)} />
      <Route path="/ops/public" element={protectedPage(<PublicLaunchOpsPanel />, true)} />
      <Route path="/pilot" element={protectedPage(<PilotCommandCenter />, true)} />

      <Route path="/reports" element={protectedPage(<ReportsPage />, true)} />
      <Route path="/reports/institutional" element={protectedPage(<InstitutionalReportsPanel />, true)} />
      <Route path="/design-studio" element={protectedPage(<DesignStudioAdminPage />, true)} />
      <Route path="/orphans" element={protectedPage(<OrphanWarRoomPage />, true)} />
      <Route path="/bulk-import" element={protectedPage(<BulkImporter />, true)} />
      <Route path="/pricing-matrix" element={protectedPage(<PricingMatrixPage />, true)} />
      <Route path="/bin-gpt-engineer" element={protectedPage(<BinGptEngineerPage />, true)} />
      <Route path="/staff-access" element={protectedPage(<StaffAccessPage />, true)} />
      <Route path="/hr" element={protectedPage(<HRManagementPage />, true, ['hr_manager', 'hr_staff'])} />
      <Route path="/settings" element={protectedPage(<SettingsPage />, true)} />

      <Route path="/admin" element={<AdminPrefixRedirect />} />
      <Route path="/admin/*" element={<AdminPrefixRedirect />} />
      <Route path="/admin/payments" element={<Navigate to="/payments" replace />} />
      <Route path="/admin/pricing-matrix" element={<Navigate to="/pricing-matrix" replace />} />
      <Route path="/admin/units" element={<Navigate to="/units" replace />} />
      <Route path="/admin/unit-status" element={<Navigate to="/units" replace />} />
      <Route path="/admin/bin-gpt-engineer" element={<Navigate to="/bin-gpt-engineer" replace />} />

      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <LanguageProvider>
        <AuthProvider>
          <AIProvider>
            <Router>
              <AppRoutes />
              <SovereignAIChat />
              <SovereignAlertHandler />
            </Router>
          </AIProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

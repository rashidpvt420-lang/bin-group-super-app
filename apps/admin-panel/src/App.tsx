// Dedicated BIN GROUP operational admin application.
import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CssBaseline from '@mui/material/CssBaseline';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage } from '@bin/shared/context/LanguageContext';
import { AIProvider } from '@bin/shared/context/AIContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/auth/LoginPage';
import { adminTheme } from './theme/adminTheme';

const AdminLayout = lazy(() => import('./components/AdminLayout'));
const BulkImporter = lazy(() => import('./components/BulkImporter'));
const InstitutionalReportsPanel = lazy(() => import('./components/reports/InstitutionalReportsPanel'));
const PilotCommandCenter = lazy(() => import('./components/pilot/PilotCommandCenter'));
const PublicLaunchOpsPanel = lazy(() => import('./components/ops/PublicLaunchOpsPanel'));

const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const OwnersPage = lazy(() => import('./pages/owners/OwnerManagementPage'));
const TenantsPage = lazy(() => import('./pages/tenants/TenantsManagementPage'));
const TicketsPage = lazy(() => import('./pages/tickets/TicketsManagementPage'));
const TechniciansPage = lazy(() => import('./pages/technicians/TechniciansManagementPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const AdminSecurityProfilePage = lazy(() => import('./pages/settings/AdminSecurityProfilePage'));
const AdminMfaRecoveryPage = lazy(() => import('./pages/settings/AdminMfaRecoveryPage'));
const AdminContractControlPage = lazy(() => import('./pages/admin/AdminContractControlPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));
const SOSFeedPage = lazy(() => import('./pages/sos/SOSFeedPage'));
const InstitutionalDocumentVaultPage = lazy(() => import('./pages/documents/InstitutionalDocumentVaultPage'));
const AuditShieldPage = lazy(() => import('./pages/admin/AuditShieldPage'));
const ProfitabilityPage = lazy(() => import('./pages/admin/ProfitabilityPage'));
const CompliancePage = lazy(() => import('./pages/admin/CompliancePage'));
const BrokerManagementPage = lazy(() => import('./pages/brokers/BrokerManagementPage'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage'));
const PayrollManagementPage = lazy(() => import('./pages/financials/PayrollManagementPage'));
const TransactionsPage = lazy(() => import('./pages/financials/TransactionsPage'));
const ProfitabilityDashboardPage = lazy(() => import('./pages/financials/ProfitabilityDashboardPage'));
const IntakeVaultPage = lazy(() =>
    import('./pages/admin/IntakeVaultPage').then((module) => ({ default: module.IntakeVaultPage })),
);
const OrphanWarRoomPage = lazy(() => import('./pages/admin/OrphanWarRoomPage'));
const PropertyOnboardingPage = lazy(() => import('./pages/admin/PropertyOnboardingPage'));
const DesignStudioAdminPage = lazy(() => import('./pages/admin/DesignStudioAdminPage'));
const HRManagementPage = lazy(() => import('./pages/admin/HRManagementPage'));
const PropertyPassportPage = lazy(() => import('./pages/properties/PropertyPassportPage'));
const ProductionControlCenter = lazy(() => import('./pages/ProductionControlCenter'));
const LiveMapPage = lazy(() => import('./pages/map/LiveMapPage'));
const PricingMatrixPage = lazy(() => import('./pages/admin/PricingMatrixPage'));
const TechnicianDutyMonitorPage = lazy(() => import('./pages/technicians/TechnicianDutyMonitorPage'));
const PaymentApprovalsPage = lazy(() => import('./pages/financials/PaymentApprovalsPage'));
const UnitStatusPage = lazy(() => import('./pages/admin/UnitStatusPage'));
const BinGptEngineerPage = lazy(() => import('./pages/admin/BinGptEngineerPage'));
const WhatsAppTriageQueuePage = lazy(() => import('./pages/admin/WhatsAppTriageQueuePage'));
const RfqTrustWorkflowPage = lazy(() => import('./pages/admin/RfqTrustWorkflowPage'));
const VendorCommandCenterPage = lazy(() => import('./pages/admin/VendorCommandCenterPage'));
const DataGovernanceAuditPage = lazy(() => import('./pages/admin/DataGovernanceAuditPage'));
const BinConnectInboxPage = lazy(() => import('./pages/admin/BinConnectInboxPage'));
const PilotCompletionCommandPage = lazy(() => import('./pages/admin/PilotCompletionCommandPage'));
const PublicLaunchCommandCenterPage = lazy(() => import('./pages/admin/PublicLaunchCommandCenterPage'));
const AmenityControlPage = lazy(() => import('./pages/ops/AmenityControlPage'));
const AnnouncementsPage = lazy(() => import('./pages/ops/AnnouncementsPage'));
const DocumentLibraryPage = lazy(() => import('./pages/ops/DocumentLibraryPage'));
const KeyRegisterPage = lazy(() => import('./pages/ops/KeyRegisterPage'));
const ParcelDeskPage = lazy(() => import('./pages/ops/ParcelDeskPage'));
const VisitorParkingPage = lazy(() => import('./pages/ops/VisitorParkingPage'));
const MarketplaceApprovalsPage = lazy(() => import('./pages/ops/MarketplaceApprovalsPage'));
const StaffDirectoryPage = lazy(() => import('./pages/ops/StaffDirectoryPage'));
const MessagesPage = lazy(() => import('./pages/ops/MessagesPage'));
const CommunityModerationPage = lazy(() => import('./pages/ops/CommunityModerationPage'));
const ScheduledServicesOperationsPage = lazy(() => import('./pages/ops/ScheduledServicesOperationsPage'));
const TenantUnitLinkQueuePage = lazy(() => import('./pages/ops/TenantUnitLinkQueuePage'));

const cacheRtl = createCache({ key: 'muirtl-admin', stylisPlugins: [prefixer, rtlPlugin] });
const cacheLtr = createCache({ key: 'muiltr-admin' });

function AdminRouteFallback() {
    const { t, isRTL } = useLanguage();
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <CircularProgress size={36} sx={{ color: '#DAA520', mb: 3 }} />
            <Typography variant="body2" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 2, textAlign: 'center' }}>
                {t('common.auth_sync') || (isRTL ? 'جارٍ تحميل الوحدة الآمنة' : 'Loading secure Admin module')}
            </Typography>
        </Box>
    );
}

function AppContent() {
    const { isAuthenticated, loading, error } = useAuth();
    const { t, isRTL } = useLanguage();

    if (loading) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
                <CircularProgress sx={{ color: '#DAA520', mb: 4 }} />
                <Typography variant="h6" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 2, textAlign: isRTL ? 'right' : 'left' }}>
                    {t('dash.command_subtitle') || (isRTL ? 'جارٍ التحقق من مركز قيادة المسؤول' : 'Authenticating Admin Command Center')}
                </Typography>
            </Box>
        );
    }

    return (
        <Suspense fallback={<AdminRouteFallback />}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                {isAuthenticated && (
                    <Route element={<AdminLayout />}>
                        <Route path="/" element={<Navigate to="/dashboard" replace />} />
                        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                        <Route path="/profile" element={<ProtectedRoute adminOnly><AdminSecurityProfilePage /></ProtectedRoute>} />
                        <Route path="/mfa-recovery" element={<ProtectedRoute adminOnly><AdminMfaRecoveryPage /></ProtectedRoute>} />
                        <Route path="/contracts" element={<ProtectedRoute adminOnly><AdminContractControlPage /></ProtectedRoute>} />
                        <Route path="/financials" element={<ProtectedRoute adminOnly><ProfitabilityDashboardPage /></ProtectedRoute>} />
                        <Route path="/financials/payroll" element={<ProtectedRoute adminOnly><PayrollManagementPage /></ProtectedRoute>} />
                        <Route path="/transactions" element={<ProtectedRoute adminOnly><TransactionsPage /></ProtectedRoute>} />
                        <Route path="/broker" element={<ProtectedRoute adminOnly><BrokerManagementPage /></ProtectedRoute>} />
                        <Route path="/broker-attributions" element={<ProtectedRoute adminOnly><BrokerManagementPage /></ProtectedRoute>} />
                        <Route path="/broker-commissions" element={<ProtectedRoute adminOnly><BrokerManagementPage /></ProtectedRoute>} />
                        <Route path="/owners" element={<ProtectedRoute adminOnly><OwnersPage /></ProtectedRoute>} />
                        <Route path="/tenants" element={<ProtectedRoute><TenantsPage /></ProtectedRoute>} />
                        <Route path="/unit-links" element={<ProtectedRoute adminOnly><TenantUnitLinkQueuePage /></ProtectedRoute>} />
                        <Route path="/tenant-services" element={<ProtectedRoute><ScheduledServicesOperationsPage /></ProtectedRoute>} />
                        <Route path="/control-center" element={<ProtectedRoute adminOnly><ProductionControlCenter /></ProtectedRoute>} />
                        <Route path="/properties/passport" element={<ProtectedRoute><PropertyPassportPage /></ProtectedRoute>} />
                        <Route path="/bulk-import" element={<ProtectedRoute adminOnly><BulkImporter /></ProtectedRoute>} />
                        <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
                        <Route path="/technicians" element={<ProtectedRoute><TechniciansPage /></ProtectedRoute>} />
                        <Route path="/technicians/map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
                        <Route path="/live-map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
                        <Route path="/sos" element={<ProtectedRoute><SOSFeedPage /></ProtectedRoute>} />
                        <Route path="/document-vault" element={<ProtectedRoute adminOnly><InstitutionalDocumentVaultPage /></ProtectedRoute>} />
                        <Route path="/audit-shield" element={<ProtectedRoute adminOnly><AuditShieldPage /></ProtectedRoute>} />
                        <Route path="/reports" element={<ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
                        <Route path="/manual-approvals" element={<Navigate to="/payments" replace />} />
                        <Route path="/admin/payments" element={<ProtectedRoute adminOnly><PaymentApprovalsPage /></ProtectedRoute>} />
                        <Route path="/payments" element={<ProtectedRoute adminOnly><PaymentApprovalsPage /></ProtectedRoute>} />
                        <Route path="/profitability" element={<ProtectedRoute adminOnly><ProfitabilityPage /></ProtectedRoute>} />
                        <Route path="/compliance" element={<ProtectedRoute adminOnly><CompliancePage /></ProtectedRoute>} />
                        <Route path="/pilot" element={<ProtectedRoute adminOnly><PilotCommandCenter /></ProtectedRoute>} />
                        <Route path="/ops/public" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />
                        <Route path="/ops/whatsapp-triage" element={<ProtectedRoute adminOnly><WhatsAppTriageQueuePage /></ProtectedRoute>} />
                        <Route path="/ops/bin-connect" element={<ProtectedRoute adminOnly><BinConnectInboxPage /></ProtectedRoute>} />
                        <Route path="/ops/pilot-completion" element={<ProtectedRoute adminOnly><PilotCompletionCommandPage /></ProtectedRoute>} />
                        <Route path="/ops/public-launch-command" element={<ProtectedRoute adminOnly><PublicLaunchCommandCenterPage /></ProtectedRoute>} />
                        <Route path="/ops/rfq" element={<ProtectedRoute adminOnly><RfqTrustWorkflowPage /></ProtectedRoute>} />
                        <Route path="/ops/vendors" element={<ProtectedRoute adminOnly><VendorCommandCenterPage /></ProtectedRoute>} />
                        <Route path="/ops/data-governance" element={<ProtectedRoute adminOnly><DataGovernanceAuditPage /></ProtectedRoute>} />
                        <Route path="/reports/institutional" element={<ProtectedRoute adminOnly><InstitutionalReportsPanel /></ProtectedRoute>} />
                        <Route path="/ops/technicians" element={<ProtectedRoute adminOnly><TechnicianDutyMonitorPage /></ProtectedRoute>} />
                        <Route path="/vault" element={<ProtectedRoute adminOnly><IntakeVaultPage /></ProtectedRoute>} />
                        <Route path="/orphans" element={<ProtectedRoute adminOnly><OrphanWarRoomPage /></ProtectedRoute>} />
                        <Route path="/onboard-property" element={<ProtectedRoute adminOnly><PropertyOnboardingPage /></ProtectedRoute>} />
                        <Route path="/design-studio" element={<ProtectedRoute adminOnly><DesignStudioAdminPage /></ProtectedRoute>} />
                        <Route path="/hr" element={<ProtectedRoute adminOnly extraRoles={['hr_manager', 'hr_staff']}><HRManagementPage /></ProtectedRoute>} />
                        <Route path="/audit" element={<ProtectedRoute adminOnly><AuditLogPage /></ProtectedRoute>} />
                        <Route path="/admin/pricing-matrix" element={<ProtectedRoute adminOnly><PricingMatrixPage /></ProtectedRoute>} />
                        <Route path="/pricing-matrix" element={<ProtectedRoute adminOnly><PricingMatrixPage /></ProtectedRoute>} />
                        <Route path="/admin/units" element={<ProtectedRoute adminOnly><UnitStatusPage /></ProtectedRoute>} />
                        <Route path="/admin/unit-status" element={<ProtectedRoute adminOnly><UnitStatusPage /></ProtectedRoute>} />
                        <Route path="/units" element={<ProtectedRoute adminOnly><UnitStatusPage /></ProtectedRoute>} />
                        <Route path="/admin/bin-gpt-engineer" element={<ProtectedRoute adminOnly><BinGptEngineerPage /></ProtectedRoute>} />
                        <Route path="/bin-gpt-engineer" element={<ProtectedRoute adminOnly><BinGptEngineerPage /></ProtectedRoute>} />
                        <Route path="/ops/amenity-control" element={<ProtectedRoute adminOnly><AmenityControlPage /></ProtectedRoute>} />
                        <Route path="/ops/announcements" element={<ProtectedRoute adminOnly><AnnouncementsPage /></ProtectedRoute>} />
                        <Route path="/ops/document-library" element={<ProtectedRoute adminOnly><DocumentLibraryPage /></ProtectedRoute>} />
                        <Route path="/ops/key-register" element={<ProtectedRoute adminOnly><KeyRegisterPage /></ProtectedRoute>} />
                        <Route path="/ops/parcel-desk" element={<ProtectedRoute adminOnly><ParcelDeskPage /></ProtectedRoute>} />
                        <Route path="/ops/visitor-parking" element={<ProtectedRoute adminOnly><VisitorParkingPage /></ProtectedRoute>} />
                        <Route path="/ops/marketplace-approvals" element={<ProtectedRoute adminOnly><MarketplaceApprovalsPage /></ProtectedRoute>} />
                        <Route path="/ops/staff-directory" element={<ProtectedRoute adminOnly><StaffDirectoryPage /></ProtectedRoute>} />
                        <Route path="/ops/messages" element={<ProtectedRoute adminOnly><MessagesPage /></ProtectedRoute>} />
                        <Route path="/ops/community-moderation" element={<ProtectedRoute adminOnly><CommunityModerationPage /></ProtectedRoute>} />
                    </Route>
                )}

                {!isAuthenticated && error && (
                    <Route path="/auth-error" element={<Alert severity="error">{String(error)}</Alert>} />
                )}
                <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return (
        <LanguageProvider>
            <AdminThemeProviderWrapper />
        </LanguageProvider>
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
                        <AIProvider>
                            <AppContent />
                        </AIProvider>
                    </AuthProvider>
                </Router>
            </ThemeProvider>
        </CacheProvider>
    );
}

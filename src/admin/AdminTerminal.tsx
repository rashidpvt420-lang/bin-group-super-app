import React from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useLanguage } from '@bin/shared';
import { safeText } from './utils/safeFormatters';
import BrandWatermark from '../components/BrandWatermark';
import { adminTheme } from './theme/adminTheme';

const Navigation = React.lazy(() => import('./components/Navigation'));
const BulkImporter = React.lazy(() => import('./components/BulkImporter'));
const AdminPaymentApproval = React.lazy(() => import('./components/AdminPaymentApproval'));
const AdminContractActivationApproval = React.lazy(() => import('./components/AdminContractActivationApproval'));
const InstitutionalReportsPanel = React.lazy(() => import('./components/reports/InstitutionalReportsPanel'));
const PilotCommandCenter = React.lazy(() => import('./components/pilot/PilotCommandCenter'));
const PublicLaunchOpsPanel = React.lazy(() => import('./components/ops/PublicLaunchOpsPanel'));
const DashboardPage = React.lazy(() => import('./pages/dashboard/DashboardPage'));
const OwnersPage = React.lazy(() => import('./pages/owners/OwnerManagementPage'));
const TenantsPage = React.lazy(() => import('./pages/tenants/TenantsManagementPage'));
const TicketsPage = React.lazy(() => import('./pages/tickets/TicketsManagementPage'));
const TechniciansPage = React.lazy(() => import('./pages/technicians/TechniciansManagementPage'));
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'));
const ReportsPage = React.lazy(() => import('./pages/reports/ReportsPage'));
const SOSFeedPage = React.lazy(() => import('./pages/sos/SOSFeedPage'));
const OwnerDetailsPage = React.lazy(() => import('./pages/owners/OwnerDetailsPage'));
const InstitutionalDocumentVaultPage = React.lazy(() => import('./pages/documents/InstitutionalDocumentVaultPage'));
const DocumentOSPage = React.lazy(() => import('./pages/documents/DocumentOSPage'));
const AuditShieldPage = React.lazy(() => import('./pages/admin/AuditShieldPage'));
const ProfitabilityPage = React.lazy(() => import('./pages/admin/ProfitabilityPage'));
const CompliancePage = React.lazy(() => import('./pages/admin/CompliancePage'));
const BrokerManagementPage = React.lazy(() => import('./pages/brokers/BrokerManagementPage'));
const AuditLogPage = React.lazy(() => import('./pages/AuditLogPage'));
const PayrollManagementPage = React.lazy(() => import('./pages/financials/PayrollManagementPage'));
const TransactionsPage = React.lazy(() => import('./pages/financials/TransactionsPage'));
const ProfitabilityDashboardPage = React.lazy(() => import('./pages/financials/ProfitabilityDashboardPage'));
const IntakeVaultPage = React.lazy(() => import('./pages/admin/IntakeVaultPage').then((module) => ({ default: module.IntakeVaultPage })));
const OrphanWarRoomPage = React.lazy(() => import('./pages/admin/OrphanWarRoomPage'));
const PropertyOnboardingPage = React.lazy(() => import('./pages/admin/PropertyOnboardingPage'));
const DesignStudioAdminPage = React.lazy(() => import('./pages/admin/DesignStudioAdminPage'));
const BinGptEngineerPage = React.lazy(() => import('./pages/admin/BinGptEngineerPage'));
const HRManagementPage = React.lazy(() => import('./pages/admin/HRManagementPage'));
const PropertyPassportPage = React.lazy(() => import('./pages/properties/PropertyPassportPage'));
const BuildingRegistryPage = React.lazy(() => import('./pages/properties/BuildingRegistryPage'));
const ProductionControlCenter = React.lazy(() => import('./pages/ProductionControlCenter'));
const LiveMapPage = React.lazy(() => import('./pages/map/LiveMapPage'));
const PricingMatrixPage = React.lazy(() => import('./pages/admin/PricingMatrixPage'));
const TechnicianDutyMonitorPage = React.lazy(() => import('./pages/technicians/TechnicianDutyMonitorPage'));
const SovereignControlPage = React.lazy(() => import('./pages/admin/SovereignControlPage'));
const SmartBuildingMonitorPage = React.lazy(() => import('./pages/dashboard/SmartBuildingMonitorPage'));
const AdminContractsPage = React.lazy(() => import('./pages/contracts/AdminContractsPage'));
const AdminPermissionsPage = React.lazy(() => import('./pages/admin/AdminPermissionsPage'));
const CompanyProfileAdminPage = React.lazy(() => import('./pages/admin/CompanyProfileAdminPage'));

const safeRtlPlugin = (rtlPlugin as any).default || rtlPlugin;
const cacheRtl = createCache({ key: 'muirtl-admin', stylisPlugins: [prefixer, safeRtlPlugin] });
const cacheLtr = createCache({ key: 'muiltr-admin' });

const AdminModuleFallback = () => (
    <Box sx={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F8F9FB' }}>
        <CircularProgress sx={{ color: '#B8932F' }} />
    </Box>
);

function AdminLayout() {
    const { isRTL, lang, tx } = useLanguage();
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            window.location.href = '/login';
        } catch {
            window.location.href = '/login';
        }
    };

    void handleLogout;
    
    return (
        <Box className="admin-shell" sx={{ display: 'flex', minHeight: '100vh', width: '100%', bgcolor: '#FFFFFF', overflow: 'visible', direction: isRTL ? 'rtl' : 'ltr', position: 'relative', isolation: 'isolate' }}>
            <BrandWatermark opacity={0.03} compact />
            <Navigation />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', overflow: 'visible', position: 'relative', zIndex: 1 }}>
                <Box sx={{ px: 4, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#FFFFFF', borderBottom: '1px solid #E5E7EB', zIndex: 1100, flexDirection: isRTL ? 'row-reverse' : 'row', position: 'sticky', top: 0 }}>
                    <Typography variant="overline" sx={{ color: '#667085', fontWeight: 900, letterSpacing: 2 }}>
                        {label('admin.shell.breadcrumb_admin', 'ADMIN / ', 'المسؤول / ')}<Box component="span" sx={{ color: '#B8932F' }}>{label('admin.shell.command_uae', 'COMMAND · UAE 🇦🇪', 'التحكم · الإمارات 🇦🇪')}</Box>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }} />
                </Box>
                <Box component="main" sx={{ flexGrow: 1, overflow: 'visible', p: 0, bgcolor: '#F8F9FB', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
                    <Box sx={{ flexGrow: 1 }}>
                        <Outlet />
                    </Box>
                    <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
                        <Typography variant="caption" sx={{ color: '#667085', fontWeight: 800, letterSpacing: 2 }}>
                            {label('admin.footer', '© 2026 BIN GROUP SOVEREIGN · COMMAND CENTER · MADE IN UAE 🇦🇪', '© 2026 بن جروب السيادي · مركز القيادة · صنع في الإمارات 🇦🇪')}
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

function AdminContent() {
    const { loading, error, isAuthenticated } = useAuth();
    const { lang, tx } = useLanguage();
    const [showTimeout, setShowTimeout] = React.useState(false);

    React.useEffect(() => {
        if (!loading) return undefined;
        const timer = setTimeout(() => setShowTimeout(true), 8000);
        return () => clearTimeout(timer);
    }, [loading]);

    if (loading) {
        if (!showTimeout) {
            return <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box>;
        }
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, textAlign: 'center' }}>
                <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>{lang === 'ar' ? 'انتهت مهلة بوابة المسؤول' : 'ADMIN GATEWAY TIMEOUT'}</Typography>
                <Typography variant="body1" sx={{ color: '#fff', mb: 4, maxWidth: 500 }}>{lang === 'ar' ? 'فشل اتصال المسؤول السيادي خلال 8 ثوانٍ. تحقق من بيانات الدخول أو أعد ضبط الجلسة.' : 'The Admin Sovereign Connection failed to resolve within 8 seconds. Please check your credentials or reset your session.'}</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button variant="outlined" color="error" onClick={() => { 
                        const currentLang = localStorage.getItem('bin_language');
                        const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
                        localStorage.clear(); 
                        if (currentLang) localStorage.setItem('bin_language', currentLang);
                        if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
                        sessionStorage.clear(); 
                        window.location.href = '/login'; 
                    }}>{lang === 'ar' ? 'إعادة ضبط الجلسة' : 'RESET SESSION'}</Button>
                    <Button variant="contained" sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }} onClick={() => window.location.reload()}>{lang === 'ar' ? 'إعادة تحميل البوابة' : 'RELOAD GATEWAY'}</Button>
                </Box>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, textAlign: 'center' }}>
                <Typography variant="h5" sx={{ color: '#ef4444', fontWeight: 900, mb: 2 }}>{lang === 'ar' ? 'تم رفض دخول المسؤول' : 'ADMIN ACCESS DENIED'}</Typography>
                <Typography variant="body1" sx={{ color: '#fff', mb: 4 }}>{safeText(error)}</Typography>
                <Button variant="contained" sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }} onClick={() => window.location.href = '/login?intendedRole=admin'}>{tx('nav.login', 'RETURN TO LOGIN')}</Button>
            </Box>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login?intendedRole=admin" replace />;
    }

    return (
        <React.Suspense fallback={<AdminModuleFallback />}>
            <Routes>
                <Route element={<AdminLayout />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<DashboardPage />} />
                    <Route path="smart-building" element={<SmartBuildingMonitorPage />} />
                    <Route path="sovereign-control" element={<SovereignControlPage />} />
                    <Route path="financials" element={<ProfitabilityDashboardPage />} />
                    <Route path="financials/payroll" element={<PayrollManagementPage />} />
                    <Route path="transactions" element={<TransactionsPage />} />
                    <Route path="document-os" element={<DocumentOSPage />} />
                    <Route path="document-vault" element={<InstitutionalDocumentVaultPage />} />
                    <Route path="vault" element={<IntakeVaultPage />} />
                    <Route path="audit-shield" element={<AuditShieldPage />} />
                    <Route path="design-studio" element={<DesignStudioAdminPage />} />
                    <Route path="ai-studio" element={<DesignStudioAdminPage />} />
                    <Route path="bingpt-engineer" element={<BinGptEngineerPage />} />
                    <Route path="orphans" element={<OrphanWarRoomPage />} />
                    <Route path="manual-approvals" element={<AdminContractActivationApproval />} />
                    <Route path="control-center" element={<ProductionControlCenter />} />
                    <Route path="pricing-matrix" element={<PricingMatrixPage />} />
                    <Route path="pricing" element={<PricingMatrixPage />} />
                    <Route path="owners" element={<OwnersPage />} />
                    <Route path="owners/:id" element={<OwnerDetailsPage />} />
                    <Route path="tenants" element={<TenantsPage />} />
                    <Route path="broker" element={<BrokerManagementPage />} />
                    <Route path="properties/passport" element={<PropertyPassportPage />} />
                    <Route path="properties/registry" element={<BuildingRegistryPage />} />
                    <Route path="technicians" element={<TechniciansPage />} />
                    <Route path="technicians/map" element={<LiveMapPage />} />
                    <Route path="ops/technicians" element={<TechnicianDutyMonitorPage />} />
                    <Route path="duty-command" element={<TechnicianDutyMonitorPage />} />
                    <Route path="tickets" element={<TicketsPage />} />
                    <Route path="sos" element={<SOSFeedPage />} />
                    <Route path="hr" element={<HRManagementPage />} />
                    <Route path="bulk-import" element={<BulkImporter />} />
                    <Route path="profitability" element={<ProfitabilityPage />} />
                    <Route path="compliance" element={<CompliancePage />} />
                    <Route path="pilot" element={<PilotCommandCenter />} />
                    <Route path="ops/public" element={<PublicLaunchOpsPanel />} />
                    <Route path="reports/institutional" element={<InstitutionalReportsPanel />} />
                    <Route path="audit" element={<AuditLogPage />} />
                    <Route path="reports" element={<ReportsPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="payment-approval" element={<AdminPaymentApproval />} />
                    <Route path="onboard-property" element={<PropertyOnboardingPage />} />
                    <Route path="contracts" element={<AdminContractsPage />} />
                    <Route path="permissions" element={<AdminPermissionsPage />} />
                    <Route path="company-profile" element={<CompanyProfileAdminPage />} />
                    <Route path="*" element={<Navigate to="dashboard" replace />} />
                </Route>
            </Routes>
        </React.Suspense>
    );
}

export default function AdminTerminal() {
    const { isRTL } = useLanguage();
    return (
        <CacheProvider value={isRTL ? cacheRtl : cacheLtr}>
            <ThemeProvider theme={adminTheme}>
                <AuthProvider>
                    <AdminContent />
                </AuthProvider>
            </ThemeProvider>
        </CacheProvider>
    );
}

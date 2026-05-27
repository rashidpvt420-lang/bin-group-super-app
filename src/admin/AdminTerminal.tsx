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
import Navigation from './components/Navigation';
import BulkImporter from './components/BulkImporter';
import AdminPaymentApproval from './components/AdminPaymentApproval';
import AdminContractActivationApproval from './components/AdminContractActivationApproval';
import InstitutionalReportsPanel from './components/reports/InstitutionalReportsPanel';
import PilotCommandCenter from './components/pilot/PilotCommandCenter';
import PublicLaunchOpsPanel from './components/ops/PublicLaunchOpsPanel';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { safeText } from './utils/safeFormatters';
import DashboardPage from './pages/dashboard/DashboardPage';
import OwnersPage from './pages/owners/OwnerManagementPage';
import TenantsPage from './pages/tenants/TenantsManagementPage';
import TicketsPage from './pages/tickets/TicketsManagementPage';
import TechniciansPage from './pages/technicians/TechniciansManagementPage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import SOSFeedPage from './pages/sos/SOSFeedPage';
import OwnerDetailsPage from './pages/owners/OwnerDetailsPage';
import InstitutionalDocumentVaultPage from './pages/documents/InstitutionalDocumentVaultPage';
import DocumentOSPage from './pages/documents/DocumentOSPage';
import AuditShieldPage from './pages/admin/AuditShieldPage';
import ProfitabilityPage from './pages/admin/ProfitabilityPage';
import CompliancePage from './pages/admin/CompliancePage';
import BrokerManagementPage from './pages/brokers/BrokerManagementPage';
import AuditLogPage from './pages/AuditLogPage';
import PayrollManagementPage from './pages/financials/PayrollManagementPage';
import TransactionsPage from './pages/financials/TransactionsPage';
import ProfitabilityDashboardPage from './pages/financials/ProfitabilityDashboardPage';
import { IntakeVaultPage } from './pages/admin/IntakeVaultPage';
import OrphanWarRoomPage from './pages/admin/OrphanWarRoomPage';
import PropertyOnboardingPage from './pages/admin/PropertyOnboardingPage';
import DesignStudioAdminPage from './pages/admin/DesignStudioAdminPage';
import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';
import HRManagementPage from './pages/admin/HRManagementPage';
import PropertyPassportPage from './pages/properties/PropertyPassportPage';
import BuildingRegistryPage from './pages/properties/BuildingRegistryPage';
import ProductionControlCenter from './pages/ProductionControlCenter';
import LiveMapPage from './pages/map/LiveMapPage';
import PricingMatrixPage from './pages/admin/PricingMatrixPage';
import TechnicianDutyMonitorPage from './pages/technicians/TechnicianDutyMonitorPage';
import SovereignControlPage from './pages/admin/SovereignControlPage';
import SmartBuildingMonitorPage from './pages/dashboard/SmartBuildingMonitorPage';
import AddPropertyPage from './pages/properties/AddPropertyPage';
import AdminContractsPage from './pages/contracts/AdminContractsPage';
import AdminPermissionsPage from './pages/admin/AdminPermissionsPage';
import CompanyProfileAdminPage from './pages/admin/CompanyProfileAdminPage';
import { adminTheme } from './theme/adminTheme';

const cacheRtl = createCache({ key: 'muirtl-admin', stylisPlugins: [prefixer, rtlPlugin] });
const cacheLtr = createCache({ key: 'muiltr-admin' });

function AdminLayout() {
    const { isRTL, lang, tx } = useLanguage();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            window.location.href = '/login';
        } catch {
            window.location.href = '/login';
        }
    };
    
    return (
        <Box sx={{ display: 'flex', height: '100vh', width: '100vw', bgcolor: '#020617', overflow: 'hidden', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Navigation />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', position: 'relative' }}>
                <Box sx={{ px: 4, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: 'rgba(2, 6, 23, 0.8)', backdropFilter: 'blur(10px)', borderBottom: '1px solid rgba(255,255,255,0.05)', zIndex: 1100, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>
                        {lang === 'ar' ? 'المسؤول / ' : 'ADMIN / '}<Box component="span" sx={{ color: '#DAA520' }}>{lang === 'ar' ? 'التحكم · الإمارات 🇦🇪' : 'COMMAND · UAE 🇦🇪'}</Box>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <LanguageSwitcher />
                        <Button onClick={handleLogout} sx={{ color: '#ef4444', fontWeight: 900 }}>{tx('nav.logout', 'LOGOUT')}</Button>
                    </Box>
                </Box>
                <Box component="main" sx={{ flexGrow: 1, overflowY: 'auto', p: 0, bgcolor: '#020617', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ flexGrow: 1 }}>
                        <Outlet />
                    </Box>
                    <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)' }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                            © 2026 BIN GROUP SOVEREIGN · COMMAND CENTER · MADE IN UAE 🇦🇪
                        </Typography>
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

function AdminContent() {
    const { loading, error } = useAuth();
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
                <Button variant="contained" sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }} onClick={() => window.location.href = '/login'}>{tx('nav.login', 'RETURN TO LOGIN')}</Button>
            </Box>
        );
    }

    return (
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

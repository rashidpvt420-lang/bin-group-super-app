// admin-panel/src/App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Button, Typography, CssBaseline, CircularProgress, Stack } from '@mui/material';
import { LogOut, User as UserIcon } from 'lucide-react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';

// ─── LIVE PRODUCTION IMPORTS ──────────────────────────────────────────
import rtlPlugin from 'stylis-plugin-rtl';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider, useLanguage, SovereignAIChat, AIProvider, SovereignAlertHandler } from '@bin/shared';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import BulkImporter from './components/BulkImporter';
import AdminPaymentApproval from './components/AdminPaymentApproval';
import InstitutionalReportsPanel from './components/reports/InstitutionalReportsPanel';
import PilotCommandCenter from './components/pilot/PilotCommandCenter';
import PublicLaunchOpsPanel from './components/ops/PublicLaunchOpsPanel';
import { LanguageSwitcher } from './components/LanguageSwitcher';

// Pages
import LoginPage from './pages/auth/LoginPage';
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
import HRManagementPage from './pages/admin/HRManagementPage';
import PropertyPassportPage from './pages/properties/PropertyPassportPage';
import ProductionControlCenter from './pages/ProductionControlCenter';
import LiveMapPage from './pages/map/LiveMapPage';
import PricingMatrixPage from './pages/admin/PricingMatrixPage';
import TechnicianDutyMonitorPage from './pages/technicians/TechnicianDutyMonitorPage';
import PaymentApprovalsPage from './pages/financials/PaymentApprovalsPage';
import UnitStatusPage from './pages/admin/UnitStatusPage';
import BinGptEngineerPage from './pages/admin/BinGptEngineerPage';
import StaffAccessPage from './pages/admin/StaffAccessPage';
import AdminPropertyApprovalsPage from './pages/admin/AdminPropertyApprovalsPage';
import ContractTerminationPage from './pages/admin/ContractTerminationPage';
import { adminTheme } from './theme/adminTheme';

const cacheRtl = createCache({
    key: 'muirtl-admin',
    stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
    key: 'muiltr-admin',
});

function resetAdminSession() {
    try {
        const lang = localStorage.getItem('bin_language');
        localStorage.clear();
        sessionStorage.clear();
        if (lang) localStorage.setItem('bin_language', lang);
    } catch {
        // Continue navigation even if storage is blocked.
    }
    window.location.href = '/login';
}

function AppContent() {
    const { isAuthenticated, loading, error } = useAuth();
    const { t, isRTL } = useLanguage();
    const location = useLocation();
    const [safetyReleased, setSafetyReleased] = React.useState(false);
    const [showRecovery, setShowRecovery] = React.useState(false);
    const isLoginRoute = location.pathname === '/login' || location.pathname.startsWith('/login/');

    React.useEffect(() => {
        const recoveryTimer = setTimeout(() => {
            if (loading) setShowRecovery(true);
        }, 4500);
        const releaseTimer = setTimeout(() => {
            if (loading) {
                console.warn('[ADMIN-SHELL] Boot timeout. Releasing UI for deep recovery.');
                setSafetyReleased(true);
            }
        }, 12000);
        return () => {
            clearTimeout(recoveryTimer);
            clearTimeout(releaseTimer);
        };
    }, [loading]);

    if (loading && !safetyReleased) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, direction: isRTL ? 'rtl' : 'ltr', textAlign: 'center' }}>
                <CircularProgress sx={{ color: '#DAA520', mb: 4 }} />
                <Typography variant="h6" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 2, textAlign: 'center' }}>
                    {t('dash.command_subtitle') || 'AUTHENTICATING SOVEREIGN IDENTITY...'}
                </Typography>
                {showRecovery && (
                    <Stack spacing={1.5} sx={{ mt: 4, width: '100%', maxWidth: 420 }}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>
                            Admin authentication is taking longer than expected. This is usually a stale session, blocked Firebase Auth domain, or expired cross-domain handoff.
                        </Typography>
                        <Button variant="contained" onClick={resetAdminSession} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>
                            Reset Session & Open Admin Login
                        </Button>
                        <Button variant="outlined" onClick={() => window.location.reload()} sx={{ borderColor: '#DAA520', color: '#DAA520', fontWeight: 950 }}>
                            Retry Authentication
                        </Button>
                    </Stack>
                )}
            </Box>
        );
    }

    if (error && !isAuthenticated && !isLoginRoute) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
                <Typography variant="h4" sx={{ color: '#ff4444', fontWeight: 900, mb: 2 }}>{t('common.sys_init_fault')}</Typography>
                <Typography variant="body1" sx={{ color: '#fff', opacity: 0.8, mb: 4, maxWidth: 600 }}>{error}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" onClick={resetAdminSession} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }}>RESET & LOGIN</Button>
                    <Button variant="outlined" onClick={() => window.location.reload()} sx={{ borderColor: '#DAA520', color: '#DAA520', fontWeight: 900 }}>{t('common.reload_sys')}</Button>
                </Stack>
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
                    <Route path="/financials" element={<ProtectedRoute adminOnly><ProfitabilityDashboardPage /></ProtectedRoute>} />
                    <Route path="/financials/payroll" element={<ProtectedRoute adminOnly><PayrollManagementPage /></ProtectedRoute>} />
                    <Route path="/transactions" element={<ProtectedRoute adminOnly><TransactionsPage /></ProtectedRoute>} />
                    <Route path="/broker" element={<ProtectedRoute adminOnly><BrokerManagementPage /></ProtectedRoute>} />
                    <Route path="/owners" element={<ProtectedRoute><OwnersPage /></ProtectedRoute>} />
                    <Route path="/tenants" element={<ProtectedRoute><TenantsPage /></ProtectedRoute>} />
                    <Route path="/control-center" element={<ProtectedRoute adminOnly><ProductionControlCenter /></ProtectedRoute>} />
                    <Route path="/properties/passport" element={<ProtectedRoute><PropertyPassportPage /></ProtectedRoute>} />
                    <Route path="/properties/approvals" element={<ProtectedRoute adminOnly><AdminPropertyApprovalsPage /></ProtectedRoute>} />
                    <Route path="/contracts/termination" element={<ProtectedRoute adminOnly><ContractTerminationPage /></ProtectedRoute>} />
                    <Route path="/bulk-import" element={<ProtectedRoute adminOnly><BulkImporter /></ProtectedRoute>} />
                    <Route path="/owners/:id" element={<ProtectedRoute><OwnerDetailsPage /></ProtectedRoute>} />
                    <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
                    <Route path="/technicians" element={<ProtectedRoute><TechniciansPage /></ProtectedRoute>} />
                    <Route path="/technicians/map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
                    <Route path="/sos" element={<ProtectedRoute><SOSFeedPage /></ProtectedRoute>} />
                    <Route path="/document-vault" element={<ProtectedRoute adminOnly><InstitutionalDocumentVaultPage /></ProtectedRoute>} />
                    <Route path="/audit-shield" element={<ProtectedRoute adminOnly><AuditShieldPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
                    <Route path="/manual-approvals" element={<ProtectedRoute adminOnly><AdminPaymentApproval /></ProtectedRoute>} />
                    <Route path="/admin/payments" element={<ProtectedRoute adminOnly><PaymentApprovalsPage /></ProtectedRoute>} />
                    <Route path="/payments" element={<ProtectedRoute adminOnly><PaymentApprovalsPage /></ProtectedRoute>} />
                    <Route path="/profitability" element={<ProtectedRoute adminOnly><ProfitabilityPage /></ProtectedRoute>} />
                    <Route path="/compliance" element={<ProtectedRoute adminOnly><CompliancePage /></ProtectedRoute>} />
                    <Route path="/pilot" element={<ProtectedRoute adminOnly><PilotCommandCenter /></ProtectedRoute>} />
                    <Route path="/ops/public" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />
                    <Route path="/reports/institutional" element={<ProtectedRoute adminOnly><InstitutionalReportsPanel /></ProtectedRoute>} />
                    <Route path="/ops/technicians" element={<ProtectedRoute adminOnly><TechnicianDutyMonitorPage /></ProtectedRoute>} />
                    <Route path="/vault" element={<ProtectedRoute adminOnly><IntakeVaultPage /></ProtectedRoute>} />
                    <Route path="/orphans" element={<ProtectedRoute adminOnly><OrphanWarRoomPage /></ProtectedRoute>} />
                    <Route path="/onboard-property" element={<ProtectedRoute adminOnly><PropertyOnboardingPage /></ProtectedRoute>} />
                    <Route path="/design-studio" element={<ProtectedRoute adminOnly><DesignStudioAdminPage /></ProtectedRoute>} />
                    <Route path="/hr" element={<ProtectedRoute adminOnly><HRManagementPage /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute adminOnly><AuditLogPage /></ProtectedRoute>} />
                    <Route path="/admin/pricing-matrix" element={<ProtectedRoute adminOnly><PricingMatrixPage /></ProtectedRoute>} />
                    <Route path="/admin/units" element={<ProtectedRoute adminOnly><UnitStatusPage /></ProtectedRoute>} />
                    <Route path="/admin/unit-status" element={<ProtectedRoute adminOnly><UnitStatusPage /></ProtectedRoute>} />
                    <Route path="/admin/bin-gpt-engineer" element={<ProtectedRoute adminOnly><BinGptEngineerPage /></ProtectedRoute>} />
                    <Route path="/staff-access" element={<ProtectedRoute adminOnly><StaffAccessPage /></ProtectedRoute>} />
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

    const handleLogout = async () => {
        try {
            console.log('[ADMIN] Initiating global logout sequence...');
            await logout();
        } catch (err) {
            console.error('Logout failure:', err);
            window.location.href = '/login';
        }
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#F5F5F5', direction: isRTL ? 'rtl' : 'ltr' }}>
            <CssBaseline />
            <Navigation />
            <Box component="main" sx={{ flexGrow: 1, p: 3, overflowY: 'auto' }}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 2, gap: 2 }}>
                    <LanguageSwitcher />
                    <Button
                        onClick={() => navigate('/settings')}
                        startIcon={<UserIcon size={18} />}
                        sx={{ color: '#111827' }}
                    >
                        {user?.email || 'Admin'}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<LogOut size={18} />}
                        onClick={handleLogout}
                    >
                        {t('common.logout') || t('nav.logout') || 'Logout'}
                    </Button>
                </Box>
                <Outlet />
            </Box>
            <SovereignAIChat role="admin" />
        </Box>
    );
}

export default function App() {
    const { isRTL } = useLanguage();
    const cache = isRTL ? cacheRtl : cacheLtr;
    const theme = createTheme({ ...adminTheme, direction: isRTL ? 'rtl' : 'ltr' } as any);

    return (
        <CacheProvider value={cache}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <AIProvider>
                    <AuthProvider>
                        <Router>
                            <AppContent />
                            <SovereignAlertHandler />
                        </Router>
                    </AuthProvider>
                </AIProvider>
            </ThemeProvider>
        </CacheProvider>
    );
}

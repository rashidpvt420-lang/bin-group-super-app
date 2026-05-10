import { alpha } from '@mui/material/styles';
// admin-panel/src/App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Button, Typography, CssBaseline, CircularProgress } from '@mui/material';
import { LogOut, User as UserIcon } from 'lucide-react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';

// ─── LIVE PRODUCTION IMPORTS ──────────────────────────────────────────
import rtlPlugin from 'stylis-plugin-rtl';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { LanguageProvider } from '../context/LanguageContext';
import { SovereignAIChat } from '../components/SovereignAIChat';
import { AIProvider } from '../context/AIContext';
import { SovereignAlertHandler } from '../components/SovereignAlertHandler';
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
import { TechnicianMapPage } from './pages/Placeholders';
import PricingMatrixPage from './pages/admin/PricingMatrixPage';
import AdminDutyCommandPage from './pages/technicians/AdminDutyCommandPage';
import { adminTheme } from './theme/adminTheme';

// Create RTL/LTR Caches
const cacheRtl = createCache({
    key: 'muirtl-admin',
    stylisPlugins: [prefixer, rtlPlugin],
});

const cacheLtr = createCache({
    key: 'muiltr-admin',
});

function AppContent() {
    const { isAuthenticated, loading, error } = useAuth();
    const { t, isRTL } = useLanguage();
    const [safetyReleased, setSafetyReleased] = React.useState(false);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (loading) {
                console.warn("[ADMIN-SHELL] Boot timeout. Releasing UI for deep recovery.");
                setSafetyReleased(true);
            }
        }, 12000);
        return () => clearTimeout(timer);
    }, [loading]);

    if (loading && !safetyReleased) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
                <CircularProgress sx={{ color: '#DAA520', mb: 4 }} />
                <Typography variant="h6" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 2, textAlign: isRTL ? 'right' : 'left' }}>
                    {t('dash.command_subtitle')}
                </Typography>
            </Box>
        );
    }

    if (error && !isAuthenticated) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617', p: 4, textAlign: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
                <Typography variant="h4" sx={{ color: '#ff4444', fontWeight: 900, mb: 2 }}>{t('common.sys_init_fault')}</Typography>
                <Typography variant="body1" sx={{ color: '#fff', opacity: 0.8, mb: 4, maxWidth: 600 }}>{error}</Typography>
                <Button variant="contained" onClick={() => window.location.reload()} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900 }}>{t('common.reload_sys')}</Button>
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
                    <Route path="/bulk-import" element={<ProtectedRoute adminOnly><BulkImporter /></ProtectedRoute>} />
                    <Route path="/owners/:id" element={<ProtectedRoute><OwnerDetailsPage /></ProtectedRoute>} />
                    <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
                    <Route path="/technicians" element={<ProtectedRoute><TechniciansPage /></ProtectedRoute>} />
                    <Route path="/technicians/map" element={<ProtectedRoute><TechnicianMapPage /></ProtectedRoute>} />
                    <Route path="/sos" element={<ProtectedRoute><SOSFeedPage /></ProtectedRoute>} />
                    <Route path="/document-vault" element={<ProtectedRoute adminOnly><InstitutionalDocumentVaultPage /></ProtectedRoute>} />
                    <Route path="/audit-shield" element={<ProtectedRoute adminOnly><AuditShieldPage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
                    <Route path="/manual-approvals" element={<ProtectedRoute adminOnly><AdminPaymentApproval /></ProtectedRoute>} />
                    <Route path="/profitability" element={<ProtectedRoute adminOnly><ProfitabilityPage /></ProtectedRoute>} />
                    <Route path="/compliance" element={<ProtectedRoute adminOnly><CompliancePage /></ProtectedRoute>} />
                    <Route path="/pilot" element={<ProtectedRoute adminOnly><PilotCommandCenter /></ProtectedRoute>} />
                    <Route path="/ops/public" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />
                    <Route path="/reports/institutional" element={<ProtectedRoute adminOnly><InstitutionalReportsPanel /></ProtectedRoute>} />
                    <Route path="/admin/duty-command" element={<ProtectedRoute adminOnly><AdminDutyCommandPage /></ProtectedRoute>} />
                    <Route path="/vault" element={<ProtectedRoute adminOnly><IntakeVaultPage /></ProtectedRoute>} />
                    <Route path="/orphans" element={<ProtectedRoute adminOnly><OrphanWarRoomPage /></ProtectedRoute>} />
                    <Route path="/onboard-property" element={<ProtectedRoute adminOnly><PropertyOnboardingPage /></ProtectedRoute>} />
                    <Route path="/design-studio" element={<ProtectedRoute adminOnly><DesignStudioAdminPage /></ProtectedRoute>} />
                    <Route path="/hr" element={<ProtectedRoute adminOnly><HRManagementPage /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute adminOnly><AuditLogPage /></ProtectedRoute>} />
                    <Route path="/admin/pricing-matrix" element={<ProtectedRoute adminOnly><PricingMatrixPage /></ProtectedRoute>} />
                </Route>
            )}

            <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        </Routes>
    );
}

function Layout() {
    const { t, isRTL } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            console.log("[ADMIN] Initiating global logout sequence...");
            localStorage.clear();
            sessionStorage.clear();
            await signOut(auth);
            window.location.href = '/login';
        } catch (err) {
            console.error("Logout failure:", err);
            window.location.href = '/login';
        }
    };
    
    return (
        <Box sx={{ 
            display: 'flex', 
            height: '100vh', 
            width: '100vw',
            bgcolor: '#020617',
            overflow: 'hidden',
            direction: isRTL ? 'rtl' : 'ltr'
        }}>
            <Navigation />
            
            <Box sx={{ 
                flexGrow: 1, 
                display: 'flex', 
                flexDirection: 'column',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative'
            }}>
                {/* GLOBAL ADMIN TOP BAR */}
                <Box sx={{ 
                    px: 4,
                    py: 1.5,
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    bgcolor: 'rgba(2, 6, 23, 0.8)', 
                    backdropFilter: 'blur(10px)',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    zIndex: 1100
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 2 }}>
                            {t('nav.administry')} / <Box component="span" sx={{ color: '#DAA520' }}>COMMAND</Box>
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <LanguageSwitcher />
                        
                        <Box sx={{ width: '1px', height: 24, bgcolor: 'rgba(255,255,255,0.1)' }} />
                        
                        {/* User Badge */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.5, borderRadius: 100, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#DAA520', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <UserIcon size={14} color="#000" />
                            </Box>
                            <Box>
                                <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 900, display: 'block', lineHeight: 1 }}>
                                    {user?.displayName?.split(' ')[0] || 'ADMIN'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                    {user?.role || 'operator'}
                                </Typography>
                            </Box>
                        </Box>

                        <Button 
                            onClick={handleLogout}
                            startIcon={<LogOut size={16} />}
                            sx={{ 
                                color: '#ef4444', 
                                fontWeight: 900, 
                                fontSize: '0.75rem',
                                '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' }
                            }}
                        >
                            {t('nav.logout') || 'LOGOUT'}
                        </Button>
                    </Box>
                </Box>

                <Box component="main" sx={{ 
                    flexGrow: 1, 
                    overflowY: 'auto',
                    p: 0,
                    bgcolor: '#020617',
                    display: 'flex',
                    flexDirection: 'column',
                    '&::-webkit-scrollbar': { width: '8px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.1)', borderRadius: '4px' }
                }}>
                    <Box sx={{ flexGrow: 1 }}>
                        <Outlet />
                    </Box>
                    
                    <Box component="footer" sx={{ p: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900 }}>
                            © 2026 BIN GROUP | {t('landing.footer.built_for_uae')} | 
                            <Typography 
                                component="a" 
                                href="https://bin-groups.com/privacy-policy" 
                                sx={{ color: '#DAA520', textDecoration: 'none', ml: 1, fontWeight: 'bold' }}
                            >
                                {t('footer.privacy')}
                            </Typography>
                        </Typography>
                    </Box>
                </Box>
            </Box>
            
            {/* AI CHAT PORTAL */}
            <Box sx={{ position: 'fixed', bottom: 0, right: 0, zIndex: 9999 }}>
                <SovereignAIChat role="admin" onNavigate={navigate} />
            </Box>
            <SovereignAlertHandler />
        </Box>
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
    
    const theme = React.useMemo(() => createTheme({
        ...adminTheme as any,
        direction: isRTL ? 'rtl' : 'ltr',
    }), [isRTL]);

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


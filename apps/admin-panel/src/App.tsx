// admin-panel/src/App.tsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';


import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navigation from './components/Navigation';
import BulkImporter from './components/BulkImporter';
import AdminPaymentApproval from './components/AdminPaymentApproval';
import PricingAuditViewer from './components/pricing/PricingAuditViewer';
import PilotCommandCenter from './components/pilot/PilotCommandCenter';
import PublicLaunchOpsPanel from './components/ops/PublicLaunchOpsPanel';
import InstitutionalReportsPanel from './components/reports/InstitutionalReportsPanel';
import MarketIntelligenceDashboard from './components/market/MarketIntelligenceDashboard';
import TechnicianCommandCenter from './components/ops/TechnicianCommandCenter';

// Pages
import LoginPage from './pages/auth/LoginPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import LiveMapPage from './pages/map/LiveMapPage';
import OwnersPage from './pages/owners/OwnerManagementPage';
import TenantsPage from './pages/tenants/TenantsManagementPage';
import TicketsPage from './pages/tickets/TicketsManagementPage';
import TechniciansPage from './pages/technicians/TechniciansManagementPage';
import SettingsPage from './pages/settings/SettingsPage';
import ReportsPage from './pages/reports/ReportsPage';
import PricingPage from './pages/pricing/PricingPage';
import SOSFeedPage from './pages/sos/SOSFeedPage';
import PartsStorePage from './pages/procurement/PartsStorePage';
import OwnerDetailsPage from './pages/owners/OwnerDetailsPage';
import AuditShieldPage from './pages/admin/AuditShieldPage';
import ProfitabilityPage from './pages/admin/ProfitabilityPage';
import CompliancePage from './pages/admin/CompliancePage';
import LiveOpsCommandCenter from './pages/admin/LiveOpsCommandCenter';
import BrokerManagementPage from './pages/brokers/BrokerManagementPage';
import AuditLogPage from './pages/AuditLogPage';
import { IntakeVaultPage } from './pages/admin/IntakeVaultPage';
import { FinancialTickerPage, TechnicianMapPage } from './pages/Placeholders';
import { adminTheme } from './theme/adminTheme';

// Removed legacy primary theme definition to use centralized adminTheme.ts
function AppContent() {
    const { isAuthenticated, loading } = useAuth();
    const [safetyReleased, setSafetyReleased] = React.useState(false);

    React.useEffect(() => {
        const timer = setTimeout(() => {
            if (loading) {
                console.warn("[ADMIN-SHELL] Boot timeout. Forcing UI release.");
                setSafetyReleased(true);
            }
        }, 5000);
        return () => clearTimeout(timer);
    }, [loading]);

    if (loading && !safetyReleased) {
        return (
            <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#020617' }}>
                <CircularProgress sx={{ color: '#DAA520' }} />
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
                    <Route path="/map" element={<ProtectedRoute><LiveMapPage /></ProtectedRoute>} />
                    <Route path="/financials" element={<ProtectedRoute adminOnly><FinancialTickerPage /></ProtectedRoute>} />
                    <Route path="/broker" element={<ProtectedRoute adminOnly><BrokerManagementPage /></ProtectedRoute>} />
                    <Route path="/owners" element={<ProtectedRoute><OwnersPage /></ProtectedRoute>} />
                    <Route path="/tenants" element={<ProtectedRoute><TenantsPage /></ProtectedRoute>} />
                    <Route path="/bulk-import" element={<ProtectedRoute adminOnly><BulkImporter /></ProtectedRoute>} />
                    <Route path="/owners/:id" element={<ProtectedRoute><OwnerDetailsPage /></ProtectedRoute>} />
                    <Route path="/tickets" element={<ProtectedRoute><TicketsPage /></ProtectedRoute>} />
                    <Route path="/technicians" element={<ProtectedRoute><TechniciansPage /></ProtectedRoute>} />
                    <Route path="/technicians/map" element={<ProtectedRoute><TechnicianMapPage /></ProtectedRoute>} />
                    <Route path="/sos" element={<ProtectedRoute><SOSFeedPage /></ProtectedRoute>} />
                    <Route path="/audit-shield" element={<ProtectedRoute adminOnly><AuditShieldPage /></ProtectedRoute>} />
                    <Route path="/pricing" element={<ProtectedRoute adminOnly><PricingPage /></ProtectedRoute>} />
                    <Route path="/pricing/audit/:id" element={<ProtectedRoute adminOnly><PricingAuditViewer /></ProtectedRoute>} />
                    <Route path="/procurement" element={<ProtectedRoute adminOnly><PartsStorePage /></ProtectedRoute>} />
                    <Route path="/reports" element={<ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute adminOnly><SettingsPage /></ProtectedRoute>} />
                    <Route path="/admin/manual-approvals" element={<ProtectedRoute adminOnly><AdminPaymentApproval /></ProtectedRoute>} />
                    <Route path="/admin/profitability" element={<ProtectedRoute adminOnly><ProfitabilityPage /></ProtectedRoute>} />
                    <Route path="/admin/compliance" element={<ProtectedRoute adminOnly><CompliancePage /></ProtectedRoute>} />
                    <Route path="/admin/live-ops" element={<ProtectedRoute adminOnly><LiveOpsCommandCenter /></ProtectedRoute>} />
                    <Route path="/admin/pilot" element={<ProtectedRoute adminOnly><PilotCommandCenter /></ProtectedRoute>} />
                    <Route path="/admin/ops/public" element={<ProtectedRoute adminOnly><PublicLaunchOpsPanel /></ProtectedRoute>} />
                    <Route path="/admin/reports/institutional" element={<ProtectedRoute adminOnly><InstitutionalReportsPanel /></ProtectedRoute>} />
                    <Route path="/admin/market-intel" element={<ProtectedRoute adminOnly><MarketIntelligenceDashboard /></ProtectedRoute>} />
                    <Route path="/admin/ops/technicians" element={<ProtectedRoute adminOnly><TechnicianCommandCenter /></ProtectedRoute>} />
                    <Route path="/admin/vault" element={<ProtectedRoute adminOnly><IntakeVaultPage /></ProtectedRoute>} />
                    <Route path="/audit" element={<ProtectedRoute adminOnly><AuditLogPage /></ProtectedRoute>} />
                </Route>
            )}

            <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        </Routes>
    );
}


function Layout() {
    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', bgcolor: '#020617' }}>
            <Box sx={{ display: 'flex', flexGrow: 1 }}>
                <Navigation />
                <Box component="main" sx={{ flexGrow: 1, p: 0, overflow: 'auto' }}>
                    <Outlet />
                </Box>
            </Box>
            <Box component="footer" sx={{ p: 4, borderTop: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: 2, fontWeight: 900 }}>
                    © 2026 BIN GROUP | ARCHITECTED FOR THE SEVEN EMIRATES | 
                    <Typography 
                        component="a" 
                        href="/privacy-policy" 
                        sx={{ color: '#DAA520', textDecoration: 'none', ml: 1, fontWeight: 'bold' }}
                    >
                        Privacy Policy
                    </Typography>
                </Typography>
            </Box>
        </Box>
    );
}

export default function App() {
    return (
        <ThemeProvider theme={adminTheme}>
            <CssBaseline />
            <Router basename="/admin">
                <AuthProvider>
                    <AppContent />
                </AuthProvider>
            </Router>
        </ThemeProvider>
    );
}

import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ThemeProvider, alpha } from '@mui/material/styles';
import { Alert, Box, Button, CircularProgress, CssBaseline, Paper, Stack, Typography } from '@mui/material';
import { ShieldCheck } from 'lucide-react';
import { LanguageProvider, useLanguage } from '@bin/shared';

import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import UnifiedLogin from './components/UnifiedLogin';
import Navigation from './components/Navigation';
import AdminPageFrame from './components/AdminPageFrame';
import DashboardPage from './pages/dashboard/DashboardPage';
import StaffAccessPage from './pages/admin/StaffAccessPage';
import { adminTheme, binThemeTokens } from './theme/adminTheme';

const DRAWER_WIDTH = 280;

function AdminLoading() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: binThemeTokens.tray,
        color: binThemeTokens.gold,
        display: 'grid',
        placeItems: 'center',
        px: 3,
        textAlign: 'center',
      }}
    >
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

  return (
    <ProtectedRoute adminOnly>
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
          {children}
        </Box>
      </Box>
    </ProtectedRoute>
  );
}

function AdminPrefixRedirect() {
  const location = useLocation();
  const strippedPath = location.pathname.replace(/^\/admin(?=\/|$)/, '') || '/dashboard';
  const target = `${strippedPath}${location.search}${location.hash}`;
  return <Navigate to={target} replace />;
}

function AdminPlaceholder({ title, body }: { title: string; body?: string }) {
  return (
    <AdminPageFrame title={title} subtitle="Protected admin route mounted inside the dedicated admin-panel app.">
      <Paper
        sx={{
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          bgcolor: alpha(binThemeTokens.gold, 0.04),
          border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`,
        }}
      >
        <Stack spacing={2.5} alignItems="flex-start">
          <ShieldCheck color={binThemeTokens.gold} size={34} />
          <Typography variant="h5" sx={{ fontWeight: 950 }}>
            {title} is available from the admin command center.
          </Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, maxWidth: 760, lineHeight: 1.8 }}>
            {body || 'This route is protected by the standalone admin Firebase Auth gate. It no longer redirects back to the public app, so admin navigation cannot dead-end between the two hosting sites.'}
          </Typography>
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
            Use the left navigation or return to the Executive Command Center while this operational module finishes loading live data.
          </Alert>
          <Button variant="contained" href="/dashboard">
            Return to Command Center
          </Button>
        </Stack>
      </Paper>
    </AdminPageFrame>
  );
}

function protectedPage(children: React.ReactNode) {
  return <AdminShell>{children}</AdminShell>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={protectedPage(<DashboardPage />)} />

      <Route path="/owners" element={protectedPage(<AdminPlaceholder title="Owners & Client Approvals" />)} />
      <Route path="/tenants" element={protectedPage(<AdminPlaceholder title="Tenant Operations" />)} />
      <Route path="/tickets" element={protectedPage(<AdminPlaceholder title="Mission Tickets" />)} />
      <Route path="/technicians" element={protectedPage(<AdminPlaceholder title="Technician Corps" />)} />
      <Route path="/manual-approvals" element={protectedPage(<AdminPlaceholder title="Manual Payment Approvals" />)} />
      <Route path="/ops/whatsapp-triage" element={protectedPage(<AdminPlaceholder title="WhatsApp Triage" />)} />
      <Route path="/ops/rfq" element={protectedPage(<AdminPlaceholder title="RFQ Trust Workflow" />)} />
      <Route path="/ops/vendors" element={protectedPage(<AdminPlaceholder title="Vendor Command" />)} />
      <Route path="/ops/data-governance" element={protectedPage(<AdminPlaceholder title="PDPL Governance" />)} />
      <Route path="/hr" element={protectedPage(<StaffAccessPage />)} />
      <Route path="/audit" element={protectedPage(<AdminPlaceholder title="Systemic Audit Log" />)} />

      <Route path="/financials" element={protectedPage(<AdminPlaceholder title="Treasury & Payroll Hub" />)} />
      <Route path="/document-vault" element={protectedPage(<AdminPlaceholder title="Document Vault" />)} />
      <Route path="/vault" element={protectedPage(<AdminPlaceholder title="Institutional Audit Vault" />)} />
      <Route path="/design-studio" element={protectedPage(<AdminPlaceholder title="Design Studio Manager" />)} />
      <Route path="/orphans" element={protectedPage(<AdminPlaceholder title="Orphan War Room" />)} />
      <Route path="/control-center" element={protectedPage(<AdminPlaceholder title="Sovereign Control Center" />)} />
      <Route path="/ops/bin-connect" element={protectedPage(<AdminPlaceholder title="BIN Connect Inbox" />)} />
      <Route path="/ops/pilot-completion" element={protectedPage(<AdminPlaceholder title="Pilot Completion" />)} />
      <Route path="/ops/public-launch-command" element={protectedPage(<AdminPlaceholder title="Public Launch Command" />)} />
      <Route path="/pricing-matrix" element={protectedPage(<AdminPlaceholder title="Pricing Matrix 2026" />)} />
      <Route path="/bin-gpt-engineer" element={protectedPage(<AdminPlaceholder title="BIN-GPT Engineer" />)} />
      <Route path="/broker" element={protectedPage(<AdminPlaceholder title="Broker Management" />)} />
      <Route path="/broker-attributions" element={protectedPage(<AdminPlaceholder title="Broker Attribution Queue" />)} />
      <Route path="/broker-commissions" element={protectedPage(<AdminPlaceholder title="Broker Commission Hub" />)} />
      <Route path="/unit-links" element={protectedPage(<AdminPlaceholder title="Tenant Unit Links" />)} />
      <Route path="/tenant-services" element={protectedPage(<AdminPlaceholder title="Tenant Services" />)} />
      <Route path="/ops/messages" element={protectedPage(<AdminPlaceholder title="Operations Messages" />)} />
      <Route path="/properties/passport" element={protectedPage(<AdminPlaceholder title="Property Passports" />)} />
      <Route path="/units" element={protectedPage(<AdminPlaceholder title="Unit Status Control" />)} />
      <Route path="/ops/technicians" element={protectedPage(<AdminPlaceholder title="Duty Command Center" />)} />
      <Route path="/sos" element={protectedPage(<AdminPlaceholder title="SOS Live Feed" />)} />
      <Route path="/settings" element={protectedPage(<AdminPlaceholder title="Admin Support Settings" />)} />
      <Route path="/reports" element={protectedPage(<AdminPlaceholder title="Admin Reports" />)} />
      <Route path="/live-map" element={protectedPage(<AdminPlaceholder title="Live Map" />)} />

      <Route path="/admin" element={<AdminPrefixRedirect />} />
      <Route path="/admin/*" element={<AdminPrefixRedirect />} />
      <Route path="*" element={protectedPage(<AdminPlaceholder title="Admin Command Center" />)} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <LanguageProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

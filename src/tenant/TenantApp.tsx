import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, IconButton, Stack, Button, alpha } from '@mui/material';
import { ArrowLeft, Home, User } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import PortalSessionControls from '../components/PortalSessionControls';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon from '../components/SafeIcon';
import TenantProfileReadinessCard from './components/TenantProfileReadinessCard';

import TenantSimpleDashboardPage from './pages/TenantSimpleDashboardPage';
import TenantDashboardPage from './pages/TenantDashboardLightPage';
import TenantScheduledServicePage from './pages/TenantScheduledServicePage';
import TenantAIConciergePage from './pages/TenantAIConciergePage';
import TenantRequestPage from './pages/TenantRequestPage';
import TenantTicketsPage from './pages/TenantTicketsPage';
import TenantTicketDetailPage from './pages/TenantTicketDetailPage';
import TenantChatPage from './pages/TenantChatPage';
import TenantEmergencyPage from './pages/TenantEmergencyPage';
import TenantProfilePage from './pages/TenantProfilePage';
import TenantDocumentsPage from './pages/TenantDocumentsPage';
import TenantUnitPage from './pages/TenantUnitPage';
import DesignStudioPage from '../pages/DesignStudioPage';
import DesignRequestDetailPage from '../pages/DesignRequestDetailPage';
import TenantGatePassPage from './pages/TenantGatePassPage';
import TenantAmenitiesPage from './pages/TenantAmenitiesPage';
import TenantPaymentsPage from './pages/TenantPaymentsPage';
import TenantMoveInspectionPage from './pages/TenantMoveInspectionPage';
import TenantNoticesPage from './pages/TenantNoticesPage';
import TenantKeysPage from './pages/TenantKeysPage';
import TenantParcelsPage from './pages/TenantParcelsPage';
import TenantVisitorParkingPage from './pages/TenantVisitorParkingPage';
import TenantMarketplacePage from './pages/TenantMarketplacePage';
import TenantStaffDirectoryPage from './pages/TenantStaffDirectoryPage';
import TenantMessagesPage from './pages/TenantMessagesPage';
import TenantCommunityPage from './pages/TenantCommunityPage';
import TenantRenewalsPage from './pages/TenantRenewalsPage';

const TenantProfileWithReadiness = () => <><TenantProfileReadinessCard /><TenantProfilePage /></>;

const TenantLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isRTL, tx, lang } = useLanguage();
    const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const isSimpleHome = location.pathname === '/tenant' || location.pathname === '/tenant/dashboard';
    const isLightRoute = isSimpleHome || location.pathname === '/tenant/dashboard/full' || location.pathname === '/tenant/scheduled-service' || location.pathname === '/tenant/find-room-rent' || location.pathname === '/tenant/marketplace';
    const quickButtonSx = {
        display: { xs: 'none', md: 'inline-flex' },
        color: binThemeTokens.textPrimary,
        border: `1px solid ${alpha(binThemeTokens.gold, 0.42)}`,
        borderRadius: 3,
        fontWeight: 950,
        bgcolor: binThemeTokens.card,
        textTransform: 'none',
        whiteSpace: 'nowrap',
        '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.08), borderColor: binThemeTokens.gold },
    } as const;

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: isLightRoute ? binThemeTokens.softCanvas : binThemeTokens.black, color: isLightRoute ? binThemeTokens.textPrimary : '#FFFFFF', direction: isRTL ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', position: 'relative', isolation: 'isolate' }}>
            <BrandWatermark opacity={isLightRoute ? 0.025 : 0.038} />
            <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'rgba(255,255,255,0.96)', color: binThemeTokens.textPrimary, backdropFilter: 'blur(16px)', borderBottom: `1px solid ${binThemeTokens.border}`, boxShadow: '0 8px 24px rgba(17, 24, 39, 0.06)', zIndex: 1200 }}>
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 1 }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ minWidth: 0 }}>
                        {!isSimpleHome && <IconButton aria-label={tx('nav.back', copy('Back', 'رجوع'))} onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary, border: `1px solid ${binThemeTokens.border}`, bgcolor: binThemeTokens.card }}><SafeIcon icon={ArrowLeft} size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} /></IconButton>}
                        <IconButton aria-label={tx('nav.home', copy('Tenant dashboard', 'لوحة المستأجر'))} onClick={() => navigate('/tenant/dashboard')} sx={{ color: binThemeTokens.goldHover, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.24)}` }}><SafeIcon icon={Home} size={22} /></IconButton>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>{tx('portal.tenant.title', copy('TENANT PORTAL', 'بوابة المستأجر'))}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.goldHover, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>{tx('portal.tenant.subtitle', copy('NO-CALL SERVICE MODE', 'خدمة بدون اتصالات'))}</Typography>
                        </Box>
                    </Stack>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Button onClick={() => navigate('/tenant/find-room-rent')} sx={quickButtonSx}>{tx('tenant.quick.findRoomRent', copy('Find Room Rent', 'غرفة للإيجار'))}</Button>
                        <Button onClick={() => navigate('/tenant/request')} sx={quickButtonSx}>{tx('tenant.quick.report', copy('Report Issue', 'إبلاغ عن مشكلة'))}</Button>
                        <Button onClick={() => navigate('/tenant/emergency')} sx={{ ...quickButtonSx, color: binThemeTokens.danger, borderColor: alpha(binThemeTokens.danger, 0.35), bgcolor: alpha(binThemeTokens.danger, 0.04), '&:hover': { bgcolor: alpha(binThemeTokens.danger, 0.08), borderColor: binThemeTokens.danger } }}>{tx('tenant.quick.emergency', copy('Emergency', 'طوارئ'))}</Button>
                        <Button onClick={() => navigate('/tenant/payments')} sx={quickButtonSx}>{tx('tenant.quick.payments', copy('Payments', 'المدفوعات'))}</Button>
                        <NotificationBell />
                        <IconButton aria-label={copy('Tenant profile', 'ملف المستأجر')} onClick={() => navigate('/tenant/profile')} sx={{ color: binThemeTokens.textPrimary, bgcolor: binThemeTokens.card, border: `1px solid ${binThemeTokens.border}`, borderRadius: 3, '&:hover': { bgcolor: binThemeTokens.softCanvas } }}><SafeIcon icon={User} size={18} /></IconButton>
                        <PortalSessionControls role="tenant" accent={binThemeTokens.goldHover} />
                    </Stack>
                </Toolbar>
            </AppBar>
            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, position: 'relative', zIndex: 1, overflowX: 'hidden' }}><Box sx={{ animation: 'fadeIn 0.5s ease-out', minWidth: 0 }}>{children}</Box></Container>
            <Box sx={{ py: 3, textAlign: 'center', borderTop: `1px solid ${isLightRoute ? binThemeTokens.border : 'rgba(255,255,255,0.05)'}`, bgcolor: isLightRoute ? binThemeTokens.card : 'rgba(11,11,12,0.5)', position: 'relative', zIndex: 1 }}><Typography variant="caption" sx={{ color: isLightRoute ? binThemeTokens.textTertiary : 'rgba(255,255,255,0.3)', fontWeight: 800, letterSpacing: 2 }}>{copy('2026 BIN GROUP PROPERTY OPERATIONS OS', '2026 نظام BIN GROUP لتشغيل العقارات')}</Typography></Box>
            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </Box>
    );
};

export default function TenantApp() {
    return (
        <TenantLayout>
            <Routes>
                <Route path="/" element={<TenantSimpleDashboardPage />} />
                <Route path="/dashboard" element={<TenantSimpleDashboardPage />} />
                <Route path="/dashboard/full" element={<TenantDashboardPage />} />
                <Route path="/scheduled-service" element={<TenantScheduledServicePage />} />
                <Route path="/unit" element={<TenantUnitPage />} />
                <Route path="/ai-concierge" element={<TenantAIConciergePage />} />
                <Route path="/request" element={<TenantRequestPage />} />
                <Route path="/tickets" element={<TenantTicketsPage />} />
                <Route path="/ticket/:id" element={<TenantTicketDetailPage />} />
                <Route path="/chat" element={<TenantChatPage />} />
                <Route path="/chat/:ticketId" element={<TenantChatPage />} />
                <Route path="/emergency" element={<TenantEmergencyPage />} />
                <Route path="/profile" element={<TenantProfileWithReadiness />} />
                <Route path="/documents" element={<TenantDocumentsPage />} />
                <Route path="/design-studio" element={<DesignStudioPage />} />
                <Route path="/design-studio/request/:id" element={<DesignRequestDetailPage />} />
                <Route path="/gate-pass" element={<TenantGatePassPage />} />
                <Route path="/amenities" element={<TenantAmenitiesPage />} />
                <Route path="/payments" element={<TenantPaymentsPage />} />
                <Route path="/move-inspection" element={<TenantMoveInspectionPage />} />
                <Route path="/move-inspection/:type" element={<TenantMoveInspectionPage />} />
                <Route path="/notices" element={<TenantNoticesPage />} />
                <Route path="/keys" element={<TenantKeysPage />} />
                <Route path="/parcels" element={<TenantParcelsPage />} />
                <Route path="/visitor-parking" element={<TenantVisitorParkingPage />} />
                <Route path="/find-room-rent" element={<TenantMarketplacePage />} />
                <Route path="/marketplace" element={<TenantMarketplacePage />} />
                <Route path="/staff-directory" element={<TenantStaffDirectoryPage />} />
                <Route path="/messages" element={<TenantMessagesPage />} />
                <Route path="/community" element={<TenantCommunityPage />} />
                <Route path="/renewals" element={<TenantRenewalsPage />} />
            </Routes>
        </TenantLayout>
    );
}

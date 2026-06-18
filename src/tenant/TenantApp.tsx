import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import {
    Box, Container, AppBar, Toolbar, Typography, IconButton,
    Breadcrumbs, Link as MuiLink, alpha, Stack
} from '@mui/material';
import { ArrowLeft, Home, User } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import PortalSessionControls from '../components/PortalSessionControls';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon from '../components/SafeIcon';
import BinConnectChatBox from '../components/BinConnectChatBox';

import TenantDashboardPage from './pages/TenantDashboardPage';
import TenantRequestPage from './pages/TenantRequestPage';
import TenantTicketsPage from './pages/TenantTicketsPage';
import TenantTicketDetailPage from './pages/TenantTicketDetailPage';
import TenantChatPage from './pages/TenantChatPage';
import TenantEmergencyPage from './pages/TenantEmergencyPage';
import TenantProfilePage from './pages/TenantProfilePage';
import TenantDocumentsPage from './pages/TenantDocumentsPage';
import TenantPaymentsPage from './pages/TenantPaymentsPage';
import TenantUnitPage from './pages/TenantUnitPage';
import DesignStudioPage from '../pages/DesignStudioPage';
import DesignRequestDetailPage from '../pages/DesignRequestDetailPage';
import TenantGatePassPage from './pages/TenantGatePassPage';
import TenantAmenitiesPage from './pages/TenantAmenitiesPage';

const TenantLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isRTL, lang, t, tx } = useLanguage();
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    const pathnames = location.pathname.split('/').filter((x) => x);

    return (
        <Box sx={{
            minHeight: '100vh',
            bgcolor: binThemeTokens.black,
            color: binThemeTokens.textPrimary,
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            isolation: 'isolate'
        }}>
            <BrandWatermark opacity={0.038} />
            <AppBar
                position="sticky"
                elevation={0}
                sx={{
                    bgcolor: 'rgba(11, 11, 12, 0.9)',
                    backdropFilter: 'blur(16px)',
                    borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`,
                    zIndex: 1200
                }}
            >
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 }, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row', minWidth: 0 }}>
                        {location.pathname !== '/tenant' && location.pathname !== '/tenant/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary }}>
                                <SafeIcon icon={ArrowLeft} size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <IconButton onClick={() => navigate('/tenant/dashboard')} sx={{ color: binThemeTokens.gold }}>
                            <SafeIcon icon={Home} size={22} />
                        </IconButton>
                        <Box sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>
                                {label('portal.tenant.title', 'TENANT PORTAL', 'بوابة المستأجر')}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                {label('portal.tenant.subtitle', 'SOVEREIGN RESIDENCY NODE · UAE 🇦🇪', 'عقدة السكن السيادية · الإمارات 🇦🇪')}
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/tenant/profile')} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <SafeIcon icon={User} size={18} />
                        </IconButton>
                        <PortalSessionControls role="tenant" dark accent={binThemeTokens.gold} />
                    </Stack>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1, position: 'relative', zIndex: 1 }}>
                {pathnames.length > 1 && (
                    <Breadcrumbs
                        sx={{
                            mb: 4,
                            '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' },
                            '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' }
                        }}
                    >
                        <MuiLink component="button" onClick={() => navigate('/tenant')} sx={{ color: binThemeTokens.gold, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                            {t('nav.dashboard')}
                        </MuiLink>
                        {pathnames.slice(1).map((value, index) => {
                            const isLast = index === pathnames.slice(1).length - 1;
                            return (
                                <Typography key={index} sx={{ color: isLast ? '#FFF' : 'rgba(255,255,255,0.4)', fontWeight: 900, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                    {label(`nav.${value.replace('-', '_')}`, value.replace('-', ' '), value.replace('-', ' '))}
                                </Typography>
                            );
                        })}
                    </Breadcrumbs>
                )}
                <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>
                    {children}
                </Box>
            </Container>

            <BinConnectChatBox role="tenant" dark />

            <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)', position: 'relative', zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · UAE PROPERTY OPERATIONS OS · MADE IN UAE 🇦🇪
                </Typography>
            </Box>

            <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </Box>
    );
};

export default function TenantApp() {
    return (
        <TenantLayout>
            <Routes>
                <Route path="/" element={<TenantDashboardPage />} />
                <Route path="/dashboard" element={<TenantDashboardPage />} />
                <Route path="/unit" element={<TenantUnitPage />} />
                <Route path="/request" element={<TenantRequestPage />} />
                <Route path="/tickets" element={<TenantTicketsPage />} />
                <Route path="/ticket/:id" element={<TenantTicketDetailPage />} />
                <Route path="/chat" element={<TenantChatPage />} />
                <Route path="/chat/:ticketId" element={<TenantChatPage />} />
                <Route path="/emergency" element={<TenantEmergencyPage />} />
                <Route path="/profile" element={<TenantProfilePage />} />
                <Route path="/documents" element={<TenantDocumentsPage />} />
                <Route path="/payments" element={<TenantPaymentsPage />} />
                <Route path="/design-studio" element={<DesignStudioPage />} />
                <Route path="/design-studio/request/:id" element={<DesignRequestDetailPage />} />
                <Route path="/gate-pass" element={<TenantGatePassPage />} />
                <Route path="/amenities" element={<TenantAmenitiesPage />} />
            </Routes>
        </TenantLayout>
    );
}

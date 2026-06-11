import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, Button } from '@mui/material';
import { ArrowLeft, Wrench, ChevronRight, User } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';
import PortalSessionControls from '../components/PortalSessionControls';
import BrandWatermark from '../components/BrandWatermark';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';

import TechnicianDashboardPage from './pages/TechnicianDashboardPage';
import TechnicianJobsPage from './pages/TechnicianJobsPage';
import TechnicianJobDetailPage from './pages/TechnicianJobDetailPage';
import TechnicianChatPage from './pages/TechnicianChatPage';
import TechnicianMapPage from './pages/TechnicianMapPage';
import TechnicianHistoryPage from './pages/TechnicianHistoryPage';
import TechnicianProfilePage from './pages/TechnicianProfilePage';
import TechnicianHRPage from './pages/TechnicianHRPageV2';

const shell = {
    ink: '#111827',
    muted: '#667085',
    canvas: '#FFFFFF',
    soft: '#F8F9FB',
    border: '#E5E7EB',
    gold: binThemeTokens.gold,
};

const TechnicianLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isRTL, lang, t, tx } = useLanguage();
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    const pathnames = location.pathname.split('/').filter((x) => x);
    const isDashboard = location.pathname === '/technician' || location.pathname === '/technician/dashboard';

    return (
        <Box className="technician-shell" sx={{ minHeight: '100vh', bgcolor: shell.canvas, color: shell.ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', isolation: 'isolate' }}>
            <BrandWatermark opacity={0.025} compact />
            <AppBar
                position="sticky"
                sx={{
                    bgcolor: 'rgba(255,255,255,0.96)',
                    color: shell.ink,
                    backdropFilter: 'blur(20px)',
                    borderBottom: `1px solid ${shell.border}`,
                    px: { xs: 1, md: 4 },
                    zIndex: 1200,
                    boxShadow: '0 10px 28px rgba(17,24,39,0.06)',
                }}
                elevation={0}
            >
                <Toolbar sx={{ justifyContent: 'space-between', px: 0, flexDirection: isRTL ? 'row-reverse' : 'row', gap: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4, flexDirection: isRTL ? 'row-reverse' : 'row', minWidth: 0 }}>
                        {!isDashboard && (
                            <Button
                                onClick={() => navigate(-1)}
                                startIcon={renderSafeIcon(ArrowLeft, { size: 18, style: { transform: isRTL ? 'rotate(180deg)' : 'none' } })}
                                sx={{
                                    color: shell.ink,
                                    border: `1px solid ${shell.gold}`,
                                    borderRadius: 2,
                                    fontWeight: 950,
                                    minHeight: 42,
                                    px: 1.6,
                                    bgcolor: '#FFFFFF',
                                    '& .MuiButton-startIcon': { mr: isRTL ? 0 : 0.8, ml: isRTL ? 0.8 : 0 },
                                }}
                            >
                                {t('nav.back') || (lang === 'ar' ? 'رجوع' : 'Back')}
                            </Button>
                        )}
                        <Typography
                            variant="h6"
                            fontWeight="950"
                            sx={{
                                color: shell.gold,
                                textTransform: 'uppercase',
                                letterSpacing: 1.6,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.2,
                                fontSize: { xs: '0.82rem', md: '1.15rem' },
                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                textAlign: isRTL ? 'right' : 'left',
                                minWidth: 0,
                            }}
                        >
                            <SafeIcon icon={Wrench} size={19} /> {label('portal.technician.title', 'FIELD SOVEREIGN - UAE', 'الميدان السيادي - الإمارات')}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.8, md: 1.5 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <NotificationBell />
                        <Button onClick={() => navigate('/technician/profile')} startIcon={renderSafeIcon(User, { size: 18 })} sx={{ color: shell.gold, border: `1px solid ${shell.gold}`, borderRadius: 2, fontWeight: 900 }}>
                            {label('nav.profile', 'Profile', 'الملف الشخصي')}
                        </Button>
                        <PortalSessionControls role="technician" accent={shell.gold} />
                    </Box>
                </Toolbar>
            </AppBar>

            <Container maxWidth="xl" sx={{ py: { xs: 3.5, md: 6 }, px: { xs: 2, sm: 3, md: 5 }, position: 'relative', zIndex: 1 }}>
                {!isDashboard && (
                    <Box sx={{ mb: 4, display: 'flex', gap: 1, alignItems: 'center', color: shell.muted, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Button variant="text" onClick={() => navigate('/technician')} sx={{ color: shell.muted, fontWeight: 800 }}>
                            {t('nav.dashboard') || 'DASHBOARD'}
                        </Button>
                        {pathnames.slice(1).map((value, index) => {
                            const fallback = value.replace('-', ' ').toUpperCase();
                            const labelText = label(`nav.${value.toLowerCase().replace('-', '_')}`, fallback, fallback);
                            return <Typography key={`${value}-${index}`} sx={{ color: shell.gold, fontWeight: 900, fontSize: '0.75rem' }}><SafeIcon icon={ChevronRight} size={12} /> {labelText}</Typography>;
                        })}
                    </Box>
                )}
                <Box sx={{ animation: 'fadeIn 0.5s ease-out', maxWidth: isDashboard ? 1280 : 980, mx: 'auto' }}>
                    {children}
                </Box>
            </Container>

            <Box sx={{ py: 3, textAlign: 'center', borderTop: `1px solid ${shell.border}`, bgcolor: shell.soft, mt: 'auto', position: 'relative', zIndex: 1 }}>
                <Typography variant="caption" sx={{ color: shell.muted, fontWeight: 800, letterSpacing: 1.5 }}>
                    © 2026 BIN GROUP · FIELD NODE · MADE IN UAE
                </Typography>
            </Box>
        </Box>
    );
};

export default function TechnicianApp() {
    return (
        <TechnicianLayout>
            <Routes>
                <Route path="/" element={<TechnicianDashboardPage />} />
                <Route path="/dashboard" element={<TechnicianDashboardPage />} />
                <Route path="/jobs" element={<TechnicianJobsPage />} />
                <Route path="/job/:id" element={<TechnicianJobDetailPage />} />
                <Route path="/chat" element={<TechnicianChatPage />} />
                <Route path="/chat/:ticketId" element={<TechnicianChatPage />} />
                <Route path="/map" element={<TechnicianMapPage />} />
                <Route path="/history" element={<TechnicianHistoryPage />} />
                <Route path="/profile" element={<TechnicianProfilePage />} />
                <Route path="/hr" element={<TechnicianHRPage />} />
            </Routes>
        </TechnicianLayout>
    );
}

import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { 
    Box, Container, AppBar, Toolbar, Typography, IconButton, 
    Breadcrumbs, Link as MuiLink, alpha, Stack, Avatar 
} from '@mui/material';
import { ArrowLeft, Home, Globe, User, Bell, Settings } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';

import TenantDashboardPage from './pages/TenantDashboardPage';
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

const TenantLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { toggleLanguage, isRTL, language, t } = useLanguage();

    const pathnames = location.pathname.split('/').filter((x) => x);

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            bgcolor: binThemeTokens.black, 
            color: binThemeTokens.textPrimary, 
            direction: isRTL ? 'rtl' : 'ltr',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {/* Sovereign Portal Header */}
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
                <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        {location.pathname !== '/tenant' && location.pathname !== '/tenant/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: binThemeTokens.textPrimary }}>
                                <ArrowLeft size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <IconButton onClick={() => navigate('/tenant/dashboard')} sx={{ color: binThemeTokens.gold }}>
                            <Home size={22} />
                        </IconButton>
                        <Box sx={{ ml: 1 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', textTransform: 'uppercase', letterSpacing: 2, fontSize: '0.9rem', lineHeight: 1 }}>
                                {t('sector.tenants.eyebrow') || 'TENANT PORTAL'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1, fontSize: '0.6rem' }}>
                                SOVEREIGN RESIDENCY NODE
                            </Typography>
                        </Box>
                    </Box>

                    <Stack direction="row" spacing={1} alignItems="center">
                        <IconButton onClick={toggleLanguage} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, px: 2 }}>
                            <Globe size={18} color={binThemeTokens.gold} />
                            <Typography variant="caption" sx={{ ml: 1, mr: isRTL ? 1 : 0, fontWeight: 950, color: binThemeTokens.gold }}>
                                {language === 'en' ? 'AR' : 'EN'}
                            </Typography>
                        </IconButton>
                        <NotificationBell />
                        <IconButton onClick={() => navigate('/tenant/profile')} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <User size={18} />
                        </IconButton>
                    </Stack>
                </Toolbar>
            </AppBar>
            
            <Container maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
                {pathnames.length > 1 && (
                    <Breadcrumbs 
                        sx={{ 
                            mb: 4, 
                            '& .MuiBreadcrumbs-separator': { color: 'rgba(255,255,255,0.2)' },
                            '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' }
                        }}
                    >
                        <MuiLink 
                            component="button" 
                            onClick={() => navigate('/tenant')} 
                            sx={{ color: binThemeTokens.gold, fontWeight: 900, textDecoration: 'none', fontSize: '0.75rem', textTransform: 'uppercase' }}
                        >
                            {t('nav.dashboard')}
                        </MuiLink>
                        {pathnames.slice(1).map((value, index) => {
                            const isLast = index === pathnames.slice(1).length - 1;
                            return (
                                <Typography 
                                    key={index} 
                                    sx={{ 
                                        color: isLast ? '#FFF' : 'rgba(255,255,255,0.4)', 
                                        fontWeight: 900, 
                                        fontSize: '0.75rem', 
                                        textTransform: 'uppercase' 
                                    }}
                                >
                                    {value.replace('-', ' ')}
                                </Typography>
                            );
                        })}
                    </Breadcrumbs>
                )}
                <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>
                    {children}
                </Box>
            </Container>

            {/* Support Footer */}
            <Box sx={{ py: 3, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(11, 11, 12, 0.5)' }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, letterSpacing: 2 }}>
                    © 2026 BIN GROUP SOVEREIGN · UAE PROPERTY OPERATIONS OS
                </Typography>
            </Box>

            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
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
                <Route path="/design-studio" element={<DesignStudioPage />} />
                <Route path="/design-studio/request/:id" element={<DesignRequestDetailPage />} />
                <Route path="/gate-pass" element={<TenantGatePassPage />} />
                <Route path="/amenities" element={<TenantAmenitiesPage />} />
            </Routes>
        </TenantLayout>
    );
}

import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, IconButton, Breadcrumbs, Link as MuiLink, alpha, Avatar } from '@mui/material';
import { ArrowLeft, Globe, Wrench, ChevronRight } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { NotificationBell } from '../components/NotificationBell';

import TechnicianDashboardPage from './pages/TechnicianDashboardPage';
import TechnicianJobsPage from './pages/TechnicianJobsPage';
import TechnicianJobDetailPage from './pages/TechnicianJobDetailPage';
import TechnicianChatPage from './pages/TechnicianChatPage';
import TechnicianMapPage from './pages/TechnicianMapPage';
import TechnicianHistoryPage from './pages/TechnicianHistoryPage';
import TechnicianProfilePage from './pages/TechnicianProfilePage';

const TechnicianLayout = ({ children }: { children: React.ReactNode }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useRole();
    const { setLang, isRTL, lang, t, tx } = useLanguage();
    const toggleLanguage = () => setLang(lang === 'en' ? 'ar' : 'en');
    const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

    const pathnames = location.pathname.split('/').filter((x) => x);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
            <AppBar 
                position="sticky" 
                sx={{ 
                    bgcolor: 'rgba(2, 6, 23, 0.8)', 
                    backdropFilter: 'blur(20px)', 
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    px: { xs: 1, md: 4 }
                }} 
                elevation={0}
            >
                <Toolbar sx={{ justifyContent: 'space-between', px: 0, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {location.pathname !== '/technician' && location.pathname !== '/technician/dashboard' && (
                            <IconButton onClick={() => navigate(-1)} sx={{ color: '#FFF' }}>
                                <ArrowLeft size={20} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                            </IconButton>
                        )}
                        <Typography 
                            variant="h6" 
                            fontWeight="950" 
                            sx={{ 
                                color: binThemeTokens.gold, 
                                textTransform: 'uppercase', 
                                letterSpacing: 2,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                                fontSize: { xs: '0.9rem', md: '1.25rem' },
                                flexDirection: isRTL ? 'row-reverse' : 'row',
                                textAlign: isRTL ? 'right' : 'left'
                            }}
                        >
                            <Wrench size={20} /> {label('portal.technician.title', 'FIELD SOVEREIGN', 'الميدان السيادي')}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 3 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <IconButton onClick={toggleLanguage} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, px: 2 }}>
                            <Globe size={18} />
                            <Typography variant="caption" sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, fontWeight: 900 }}>
                                {lang === 'en' ? 'AR' : 'EN'}
                            </Typography>
                        </IconButton>
                        
                        <NotificationBell />

                        <Avatar 
                            onClick={() => navigate('/technician/profile')}
                            sx={{ 
                                width: 36, 
                                height: 36, 
                                bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, 
                                color: binThemeTokens.gold,
                                fontSize: '0.8rem',
                                fontWeight: 900,
                                cursor: 'pointer'
                            }}
                        >
                            {user?.displayName?.charAt(0) || 'T'}
                        </Avatar>
                    </Box>
                </Toolbar>
            </AppBar>
            
            <Container maxWidth="md" sx={{ py: 6 }}>
                {location.pathname !== '/technician' && location.pathname !== '/technician/dashboard' && (
                    <Breadcrumbs 
                        separator={<ChevronRight size={14} style={{ transform: isRTL ? 'rotate(180deg)' : 'none', color: 'rgba(255,255,255,0.2)' }} />}
                        sx={{ mb: 4, '& .MuiBreadcrumbs-ol': { flexDirection: isRTL ? 'row-reverse' : 'row' } }}
                    >
                        <MuiLink component="button" variant="caption" onClick={() => navigate('/technician')} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textDecoration: 'none', '&:hover': { color: binThemeTokens.gold } }}>
                            {t('nav.dashboard') || 'DASHBOARD'}
                        </MuiLink>
                        {pathnames.slice(1).map((value, index) => {
                            const routeTo = `/${pathnames.slice(0, index + 2).join('/')}`;
                            const isLast = index === pathnames.slice(1).length - 1;
                            const fallback = value.replace('-', ' ').toUpperCase();
                            const labelText = label(`nav.${value.toLowerCase().replace('-', '_')}`, fallback, fallback);
                            return isLast ? (
                                <Typography key={routeTo} sx={{ color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.75rem' }}>{labelText}</Typography>
                            ) : (
                                <MuiLink key={routeTo} component="button" variant="caption" onClick={() => navigate(routeTo)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textDecoration: 'none', '&:hover': { color: binThemeTokens.gold } }}>
                                    {labelText}
                                </MuiLink>
                            );
                        })}
                    </Breadcrumbs>
                )}
                <Box sx={{ animation: 'fadeIn 0.5s ease-out' }}>
                    {children}
                </Box>
            </Container>
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
            </Routes>
        </TechnicianLayout>
    );
}

import React, { useEffect, useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, Container, AppBar, Toolbar, Typography, IconButton, Breadcrumbs, Link as MuiLink, alpha, Avatar, Badge, Tooltip } from '@mui/material';
import { ArrowLeft, Home, Bell, Globe, Wrench, ChevronRight, LogOut, Briefcase, UserCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth, signOut, db, collection, query, where, onSnapshot } from '../lib/firebase';

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
    const { toggleLanguage, isRTL, language, t } = useLanguage();
    const [unreadCount, setUnreadCount] = useState(0);

    const pathnames = location.pathname.split('/').filter((x) => x);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(
            collection(db, 'notifications'),
            where('recipientId', '==', user.uid),
            where('read', '==', false)
        );
        const unsub = onSnapshot(q, (snap) => setUnreadCount(snap.size), () => setUnreadCount(0));
        return () => unsub();
    }, [user?.uid]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login', { replace: true });
    };

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
                <Toolbar sx={{ justifyContent: 'space-between', px: 0, gap: 2 }}>
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
                                fontSize: { xs: '0.9rem', md: '1.25rem' }
                            }}
                        >
                            <Wrench size={20} /> {t('dash.terminal.technician') || 'TECHNICIAN'}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1.5 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <Tooltip title="Dashboard">
                            <IconButton onClick={() => navigate('/technician/dashboard')} sx={{ color: 'rgba(255,255,255,0.65)' }}>
                                <Home size={19} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Jobs">
                            <IconButton onClick={() => navigate('/technician/jobs')} sx={{ color: 'rgba(255,255,255,0.65)' }}>
                                <Briefcase size={19} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Notifications">
                            <IconButton onClick={() => navigate('/notifications')} sx={{ color: binThemeTokens.gold }}>
                                <Badge badgeContent={unreadCount} color="error" max={99}>
                                    <Bell size={20} />
                                </Badge>
                            </IconButton>
                        </Tooltip>
                        <IconButton onClick={toggleLanguage} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, px: { xs: 1, md: 2 } }}>
                            <Globe size={18} />
                            <Typography variant="caption" sx={{ ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0, fontWeight: 900, display: { xs: 'none', sm: 'block' } }}>
                                {language === 'en' ? 'العربية' : 'ENGLISH'}
                            </Typography>
                        </IconButton>
                        <Tooltip title="Profile">
                            <IconButton onClick={() => navigate('/technician/profile')} sx={{ color: 'rgba(255,255,255,0.65)' }}>
                                <UserCircle size={20} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="Logout">
                            <IconButton onClick={handleLogout} sx={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)', bgcolor: 'rgba(239,68,68,0.05)' }}>
                                <LogOut size={18} />
                            </IconButton>
                        </Tooltip>
                        <Avatar 
                            sx={{ 
                                width: 36, 
                                height: 36, 
                                bgcolor: alpha(binThemeTokens.gold, 0.1), 
                                border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, 
                                color: binThemeTokens.gold,
                                fontSize: '0.8rem',
                                fontWeight: 900
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
                        <MuiLink 
                            component="button" 
                            variant="caption" 
                            onClick={() => navigate('/technician')} 
                            sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textDecoration: 'none', '&:hover': { color: binThemeTokens.gold } }}
                        >
                            {t('nav.dashboard') || 'DASHBOARD'}
                        </MuiLink>
                        {pathnames.slice(1).map((value, index) => {
                            const routeTo = `/${pathnames.slice(0, index + 2).join('/')}`;
                            const isLast = index === pathnames.slice(1).length - 1;
                            const label = t(`nav.${value.toLowerCase()}`) || value.toUpperCase();
                            return isLast ? (
                                <Typography key={routeTo} sx={{ color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.75rem' }}>{label}</Typography>
                            ) : (
                                <MuiLink 
                                    key={routeTo} 
                                    component="button" 
                                    variant="caption" 
                                    onClick={() => navigate(routeTo)} 
                                    sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textDecoration: 'none', '&:hover': { color: binThemeTokens.gold } }}
                                >
                                    {label}
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

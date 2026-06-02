import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, alpha, Badge, Stack } from '@mui/material';
import { useLanguage, useRole } from '@bin/shared';
import { useCustomTheme } from '../context/ThemeContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth, db, collection, query, where, onSnapshot } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate, useLocation } from 'react-router-dom';

const BinGroupHeader: React.FC = () => {
    const { lang, setLang, t, isRTL } = useLanguage();
    const { mode, toggleTheme } = useCustomTheme();
    const { user, role } = useRole();
    const navigate = useNavigate();
    const location = useLocation();
    const [unreadCount, setUnreadCount] = useState(0);
    const isCompanyRoute = location.pathname === '/' || location.pathname === '/company';
    const normalizedRole = (role || '').toLowerCase();
    const canUseAiStudio = normalizedRole === 'owner' || normalizedRole === 'tenant';

    const madeInUaeLabel = lang === 'ar' ? 'صنع في الإمارات 🇦🇪' : 'MADE IN UAE 🇦🇪';
    const companyProfileLabel = lang === 'ar' ? 'ملف الشركة' : 'Company Profile';
    const startOnboardingLabel = lang === 'ar' ? 'ابدأ التسجيل' : 'Start Onboarding';

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, 'notifications'), where('recipientId', '==', user.uid), where('read', '==', false));
        const unsubscribe = onSnapshot(q, (snap) => setUnreadCount(snap.size));
        return () => unsubscribe();
    }, [user]);

    const toggleLanguage = () => setLang(lang === 'en' ? 'ar' : 'en');

    const openRoleLogin = (roleId: string) => {
        navigate(`/login?intendedRole=${encodeURIComponent(roleId)}`);
    };

    const goDashboard = () => {
        const r = normalizedRole;
        if (r === 'admin' || r === 'ceo') navigate('/admin/dashboard');
        else if (r === 'owner') navigate('/owner/dashboard');
        else if (r === 'tenant') navigate('/tenant/dashboard');
        else if (r === 'technician') navigate('/technician/dashboard');
        else if (r === 'broker') navigate('/broker/dashboard');
        else navigate('/gateway');
    };

    return (
        <AppBar position="sticky" dir={isRTL ? 'rtl' : 'ltr'} sx={{
            bgcolor: mode === 'dark' ? 'rgba(11,11,12,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`,
            boxShadow: 'none',
            color: mode === 'dark' ? '#fff' : '#000',
            zIndex: 1500
        }}>
            <Toolbar sx={{ justifyContent: 'space-between', direction: isRTL ? 'rtl' : 'ltr' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} onClick={() => navigate('/company')}>
                    <Box component="img" src="/logo.png" sx={{ width: 40, height: 40, borderRadius: 1 }} onError={(e: any) => e.target.style.display = 'none'} />
                    <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: 1, display: { xs: 'none', sm: 'block' } }}>
                        BIN-<Typography component="span" variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>GROUPS</Typography>
                    </Typography>
                    <Box sx={{ display: { xs: 'none', md: 'block' }, px: 1, py: 0.2, borderRadius: 1, bgcolor: alpha(binThemeTokens.gold, 0.15), border: `1px solid ${binThemeTokens.gold}`, color: binThemeTokens.gold, fontSize: '0.65rem', fontWeight: 950, ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0 }}>
                        {madeInUaeLabel}
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 } }}>
                    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1 }}>
                        {!user || isCompanyRoute ? (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button onClick={() => navigate('/company')} sx={{ color: binThemeTokens.gold, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    {companyProfileLabel}
                                </Button>
                                <Button onClick={() => navigate('/onboarding')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    {startOnboardingLabel}
                                </Button>
                            </Stack>
                        ) : (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button onClick={goDashboard} sx={{ color: binThemeTokens.gold, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    {t('nav.dashboard')}
                                </Button>
                                <Button onClick={() => navigate('/company')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                    {companyProfileLabel}
                                </Button>
                                {canUseAiStudio && (
                                    <Button onClick={() => navigate('/design-studio')} sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                        {t('nav.ai_studio')}
                                    </Button>
                                )}
                            </Stack>
                        )}
                    </Box>

                    <Button onClick={toggleLanguage} sx={{ color: binThemeTokens.gold, fontWeight: 900, minWidth: 0, px: 1 }} startIcon={<TranslateIcon />}>
                        {lang === 'en' ? 'AR' : 'EN'}
                    </Button>

                    {role && !isCompanyRoute && (
                        <Box sx={{ px: 1.5, py: 0.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontSize: '0.75rem', fontWeight: 900, display: { xs: 'none', md: 'block' } }}>
                            {role.toUpperCase()}
                        </Box>
                    )}

                    {user && !isCompanyRoute && (
                        <IconButton onClick={() => navigate('/notifications')} sx={{ color: binThemeTokens.gold }}>
                            <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { fontWeight: 900, fontSize: '0.65rem' } }}>
                                <NotificationsIcon />
                            </Badge>
                        </IconButton>
                    )}

                    {!user && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button onClick={() => navigate('/gateway')} sx={{ color: mode === 'dark' ? '#fff' : '#000', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}>
                                {t('gateway.login')}
                            </Button>
                            <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.85rem' }}>
                                {t('login.get_started')}
                            </Button>
                        </Box>
                    )}

                    <IconButton onClick={toggleTheme} sx={{ color: binThemeTokens.gold }}>
                        {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                    </IconButton>

                    {user && !isCompanyRoute && (
                        <Button variant="contained" size="small" onClick={() => signOut(auth).finally(() => { window.location.href = '/company'; })} startIcon={<LogoutIcon />} sx={{ bgcolor: '#ef4444', '&:hover': { bgcolor: '#dc2626' }, color: '#fff', fontWeight: 900, fontSize: '0.75rem', display: { xs: 'none', sm: 'flex' } }}>
                            {t('nav.logout')}
                        </Button>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default BinGroupHeader;

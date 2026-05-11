import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, alpha, Badge, Stack } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { useCustomTheme } from '../context/ThemeContext';
import { useRole } from '../context/RoleContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth, db, collection, query, where, onSnapshot } from '@/lib/firebase';
import { signOut } from 'firebase/auth';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from 'react-router-dom';

const BinGroupHeader: React.FC = () => {
    const { lang, setLang, t, isRTL } = useLanguage();
    const { mode, toggleTheme } = useCustomTheme();
    const { user, role } = useRole();
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, 'notifications'), where('recipientId', '==', user.uid), where('read', '==', false));
        const unsubscribe = onSnapshot(q, (snap) => setUnreadCount(snap.size));
        return () => unsubscribe();
    }, [user]);

    const toggleLanguage = () => {
        setLang(lang === 'en' ? 'ar' : 'en');
    };

    return (
        <AppBar position="sticky" sx={{ 
            bgcolor: mode === 'dark' ? 'rgba(11,11,12,0.85)' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(10px)',
            borderBottom: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`,
            boxShadow: 'none',
            color: mode === 'dark' ? '#fff' : '#000',
            zIndex: 1500
        }}>
            <Toolbar sx={{ justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <Box 
                        component="img" 
                        src="/logo.png" 
                        sx={{ width: 40, height: 40, borderRadius: 1 }} 
                        onError={(e: any) => e.target.style.display = 'none'}
                    />
                    <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: 1, display: { xs: 'none', sm: 'block' } }}>
                        BIN-<Typography component="span" variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>GROUPS</Typography>
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 } }}>
                    <Box sx={{ display: { xs: 'none', lg: 'flex' }, alignItems: 'center', gap: 1 }}>
                        {!user ? (
                            ['owner', 'tenant', 'technician', 'broker'].map((item) => (
                                <Button 
                                    key={item} 
                                    onClick={() => navigate(`/${item}`)} 
                                    sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'capitalize', fontSize: '0.85rem' }}
                                >
                                    {t(`gateway.role.${item}`)}
                                </Button>
                            ))
                        ) : (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Button 
                                    onClick={() => {
                                        const r = (role || '').toLowerCase();
                                        if (r === 'admin' || r === 'ceo') navigate('/admin/dashboard');
                                        else if (r === 'owner') navigate('/owner/dashboard');
                                        else navigate(`/${r}/dashboard`);
                                    }} 
                                    sx={{ color: binThemeTokens.gold, fontWeight: 900, textTransform: 'uppercase', fontSize: '0.85rem' }}
                                >
                                    {t('nav.dashboard')}
                                </Button>
                                <Button 
                                    onClick={() => navigate('/admin/identity')}
                                    sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}
                                >
                                    {t('nav.company_profile')}
                                </Button>
                                <Button 
                                    onClick={() => navigate('/design-studio')}
                                    sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}
                                >
                                    {t('nav.ai_studio')}
                                </Button>
                            </Stack>
                        )}
                    </Box>
                    
                    <Button 
                        onClick={toggleLanguage} 
                        sx={{ color: binThemeTokens.gold, fontWeight: 900, minWidth: 0, px: 1 }}
                        startIcon={<TranslateIcon />}
                    >
                        {lang === 'en' ? 'AR' : 'EN'}
                    </Button>

                    {role && (
                        <Box sx={{ 
                            px: 1.5, py: 0.5, borderRadius: 2, 
                            bgcolor: alpha(binThemeTokens.gold, 0.1),
                            color: binThemeTokens.gold,
                            fontSize: '0.75rem', fontWeight: 900,
                            display: { xs: 'none', md: 'block' }
                        }}>
                            {role.toUpperCase()}
                        </Box>
                    )}

                    {user && (
                        <IconButton onClick={() => navigate('/notifications')} sx={{ color: binThemeTokens.gold }}>
                            <Badge badgeContent={unreadCount} color="error" sx={{ '& .MuiBadge-badge': { fontWeight: 900, fontSize: '0.65rem' } }}>
                                <NotificationsIcon />
                            </Badge>
                        </IconButton>
                    )}

                    {!user && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button 
                                onClick={() => navigate('/login')}
                                sx={{ color: mode === 'dark' ? '#fff' : '#000', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.85rem' }}
                            >
                                {t('gateway.login')}
                            </Button>
                            <Button 
                                variant="contained"
                                onClick={() => navigate('/onboarding')}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.85rem' }}
                            >
                                {t('login.get_started')}
                            </Button>
                        </Box>
                    )}

                    <IconButton onClick={toggleTheme} sx={{ color: binThemeTokens.gold }}>
                        {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                    </IconButton>

                    {user && (
                        <Button 
                            variant="contained"
                            size="small"
                            onClick={() => { 
                                const currentLang = localStorage.getItem('app_lang');
                                localStorage.clear(); 
                                if (currentLang) localStorage.setItem('app_lang', currentLang);
                                sessionStorage.clear();
                                signOut(auth).finally(() => {
                                    window.location.href = '/';
                                });
                            }}
                            startIcon={<LogoutIcon />}
                            sx={{ 
                                bgcolor: '#ef4444', 
                                '&:hover': { bgcolor: '#dc2626' },
                                color: '#fff',
                                fontWeight: 900,
                                fontSize: '0.75rem',
                                display: { xs: 'none', sm: 'flex' }
                            }}
                        >
                            {t('nav.logout')}
                        </Button>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default BinGroupHeader;


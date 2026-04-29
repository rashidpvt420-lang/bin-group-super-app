import React, { useState, useEffect } from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, alpha, Badge } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { useCustomTheme } from '../context/ThemeContext';
import { useRole } from '../context/RoleContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import NotificationsIcon from '@mui/icons-material/Notifications';
import { binThemeTokens } from '../theme/binGroupTheme';
import { auth, db, collection, query, where, onSnapshot } from '../lib/firebase';
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
        const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('read', '==', false));
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
                        {['owners', 'tenants', 'technicians', 'brokers', 'security'].map((item) => (
                            <Button 
                                key={item} 
                                onClick={() => navigate(`/${item}`)} 
                                sx={{ color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)', fontWeight: 800, textTransform: 'capitalize', fontSize: '0.85rem' }}
                            >
                                {item.replace('-', ' ')}
                            </Button>
                        ))}
                    </Box>
                    {/* Role Badge */}
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

                    {/* Notifications */}
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
                                Login
                            </Button>
                            <Button 
                                variant="contained"
                                onClick={() => navigate('/onboarding')}
                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.85rem', px: 2 }}
                            >
                                Get Started
                            </Button>
                        </Box>
                    )}

                    {/* Language Switcher */}
                    <Button 
                        onClick={toggleLanguage}
                        startIcon={<TranslateIcon sx={{ color: binThemeTokens.gold }} />}
                        sx={{ color: mode === 'dark' ? '#fff' : '#000', fontWeight: 700 }}
                    >
                        {lang === 'en' ? 'العربية' : 'English'}
                    </Button>

                    {/* Theme Switcher */}
                    <IconButton onClick={toggleTheme} sx={{ color: binThemeTokens.gold }}>
                        {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                    </IconButton>

                    {/* Prominent Global Logout */}
                    {user && (
                        <Button 
                            variant="contained"
                            size="small"
                            onClick={() => { localStorage.clear(); signOut(auth).then(() => window.location.href = '/'); }}
                            sx={{ 
                                bgcolor: alpha('#ef4444', 0.1), 
                                color: '#ef4444',
                                fontWeight: 900,
                                minWidth: '40px',
                                px: { xs: 1, sm: 2 },
                                ml: 1,
                                '&:hover': { bgcolor: alpha('#ef4444', 0.2) }
                            }}
                        >
                            <LogoutIcon sx={{ mr: { xs: 0, sm: 1 }, fontSize: '1.25rem' }} />
                            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('nav.logout') || 'Sign Out'}</Box>
                        </Button>
                    )}
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default BinGroupHeader;

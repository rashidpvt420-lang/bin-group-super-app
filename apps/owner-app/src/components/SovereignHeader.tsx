import React from 'react';
import { AppBar, Toolbar, Typography, Box, Button, IconButton, alpha } from '@mui/material';
import { useLanguage } from '../context/LanguageContext';
import { useCustomTheme } from '../context/ThemeContext';
import { useRole } from '../context/RoleContext';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import { binThemeTokens } from '../theme/binGroupTheme';

const SovereignHeader: React.FC = () => {
    const { lang, setLang, t, isRTL } = useLanguage();
    const { mode, toggleTheme } = useCustomTheme();
    const { user, role, godMode } = useRole();

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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box 
                        component="img" 
                        src="/logo.png" 
                        sx={{ width: 40, height: 40, borderRadius: 1 }} 
                        onError={(e: any) => e.target.style.display = 'none'}
                    />
                    <Typography variant="h6" fontWeight="900" sx={{ letterSpacing: 1, display: { xs: 'none', sm: 'block' } }}>
                        BIN-GROUP <Typography component="span" variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>SOVEREIGN</Typography>
                    </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 2 } }}>
                    {/* Role Badge */}
                    {role && (
                        <Box sx={{ 
                            px: 1.5, py: 0.5, borderRadius: 2, 
                            bgcolor: godMode ? binThemeTokens.gold : alpha(binThemeTokens.gold, 0.1),
                            color: godMode ? '#000' : binThemeTokens.gold,
                            fontSize: '0.75rem', fontWeight: 900,
                            display: { xs: 'none', md: 'block' }
                        }}>
                            {role.toUpperCase()} {godMode ? 'GOD-MODE' : ''}
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

                    {/* App Links (Responsive) */}
                    <Box sx={{ display: { xs: 'none', lg: 'flex' }, gap: 1 }}>
                        <Button color="inherit" href="/dashboard">{t('nav.dashboard')}</Button>
                        <Button color="inherit" href="/onboarding">{t('nav.onboarding')}</Button>
                        {role === 'admin' && <Button color="primary" variant="outlined" href="/admin">{t('nav.admin')}</Button>}
                    </Box>
                </Box>
            </Toolbar>
        </AppBar>
    );
};

export default SovereignHeader;

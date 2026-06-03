import React, { useEffect, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Stack, alpha } from '@mui/material';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, LayoutDashboard, LogIn, LogOut, Paintbrush, Languages } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

const ADMIN_DASHBOARD_ROLES = new Set([
  'admin',
  'ceo',
  'super_admin',
  'hr_manager',
  'hr_staff',
  'finance_staff',
  'account_manager',
  'finance_admin',
  'dispatcher',
  'operations_manager',
]);

export const NavigationControl: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useRole();
  const { isRTL, t, lang, setLang } = useLanguage();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      setShowScrollTop(scrollTop > 160);
      setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 160);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [location.pathname]);

  const normalizedRole = (role || '').toLowerCase();
  const toggleLanguage = () => setLang(lang === 'en' ? 'ar' : 'en');

  const getDashboardRoute = () => {
    if (ADMIN_DASHBOARD_ROLES.has(normalizedRole)) return '/admin/dashboard';
    if (normalizedRole === 'tenant') return '/tenant/dashboard';
    if (normalizedRole === 'technician') return '/technician/dashboard';
    if (normalizedRole === 'broker') return '/broker/dashboard';
    if (normalizedRole === 'owner') return '/owner/dashboard';
    return '/';
  };

  const getProfileRoute = () => {
    if (ADMIN_DASHBOARD_ROLES.has(normalizedRole)) return '/admin/dashboard';
    if (normalizedRole === 'tenant') return '/tenant/profile';
    if (normalizedRole === 'technician') return '/technician/profile';
    if (normalizedRole === 'broker') return '/broker/profile';
    if (normalizedRole === 'owner') return '/owner/profile';
    return user ? getDashboardRoute() : '/login';
  };

  const getAIStudioRoute = (): string | null => {
    if (normalizedRole === 'owner') return '/owner/design-studio';
    if (normalizedRole === 'tenant') return '/tenant/design-studio';
    if (normalizedRole === 'broker') return '/broker/referrals';
    if (ADMIN_DASHBOARD_ROLES.has(normalizedRole)) return '/admin/design-studio';
    return null;
  };

  const handleBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate(getDashboardRoute());
  };

  const handleSignOut = async () => {
    await signOut(auth);
    navigate('/login', { replace: true });
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const scrollToBottom = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });

  // Never render on admin routes — admin shell has its own sidebar navigation
  if (location.pathname.startsWith('/admin')) return null;
  if (['/', '/login', '/gateway'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;

  const profileLabel = lang === 'ar' ? 'الملف الشخصي' : 'Profile';
  const madeInUaeLabel = lang === 'ar' ? 'صنع في الإمارات 🇦🇪' : 'Made in UAE 🇦🇪';
  const switchLanguageLabel = lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية';
  const aiStudioRoute = getAIStudioRoute();

  const buttonSx = {
    bgcolor: alpha('#020617', 0.92),
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.86)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    '&:hover': {
      bgcolor: alpha(binThemeTokens.gold, 0.18),
      color: binThemeTokens.gold,
      borderColor: alpha(binThemeTokens.gold, 0.45),
    },
  };

  return (
    <Box sx={{ position: 'fixed', bottom: { xs: 18, sm: 28 }, right: isRTL ? 'auto' : { xs: 14, sm: 28 }, left: isRTL ? { xs: 14, sm: 28 } : 'auto', zIndex: 1400, pointerEvents: 'none' }}>
      <Stack spacing={1.1} sx={{ pointerEvents: 'auto' }}>
        {showScrollTop && <Tooltip title={t('nav.scroll_top') || (lang === 'ar' ? 'الانتقال إلى الأعلى' : 'Scroll to top')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToTop} sx={buttonSx}><ArrowUp size={20} /></IconButton></Tooltip>}
        <Tooltip title={t('nav.back') || (lang === 'ar' ? 'رجوع' : 'Back')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleBack} sx={buttonSx}>{isRTL ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}</IconButton></Tooltip>
        <Tooltip title={t('nav.dashboard') || (lang === 'ar' ? 'لوحة التحكم' : 'Dashboard')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getDashboardRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><LayoutDashboard size={20} /></IconButton></Tooltip>
        {aiStudioRoute && <Tooltip title={t('nav.ai_studio') || (lang === 'ar' ? 'استوديو التصميم الذكي' : 'AI Studio')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(aiStudioRoute)} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>}
        <Tooltip title={switchLanguageLabel} placement={isRTL ? 'right' : 'left'}>
          <IconButton onClick={toggleLanguage} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important`, gap: 0.6 }}>
            <Languages size={19} />
            <Box component="span" sx={{ fontSize: '0.62rem', fontWeight: 950, lineHeight: 1 }}>{lang === 'en' ? 'AR' : 'EN'}</Box>
          </IconButton>
        </Tooltip>
        {user ? <Tooltip title={t('nav.logout') || (lang === 'ar' ? 'تسجيل الخروج' : 'Logout')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleSignOut} sx={{ ...buttonSx, color: '#ef4444' }}><LogOut size={20} /></IconButton></Tooltip> : <Tooltip title={t('nav.login') || (lang === 'ar' ? 'تسجيل الدخول' : 'Login')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate('/login')} sx={{ ...buttonSx, color: binThemeTokens.gold }}><LogIn size={20} /></IconButton></Tooltip>}
        {showScrollBottom && <Tooltip title={t('nav.scroll_bottom') || (lang === 'ar' ? 'الانتقال إلى الأسفل' : 'Scroll to bottom')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToBottom} sx={buttonSx}><ArrowDown size={20} /></IconButton></Tooltip>}
        <Button size="small" onClick={() => navigate(getProfileRoute())} sx={{ ...buttonSx, px: 1.5, minWidth: 44, fontSize: '0.62rem', fontWeight: 950, color: binThemeTokens.gold }}>{profileLabel}</Button>
        <Box sx={{ ...buttonSx, px: 1.5, py: 0.8, borderRadius: 1, minWidth: 44, fontSize: '0.58rem', fontWeight: 950, color: binThemeTokens.gold, textAlign: 'center' }}>{madeInUaeLabel}</Box>
      </Stack>
    </Box>
  );
};

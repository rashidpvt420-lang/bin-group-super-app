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
      setShowScrollTop(scrollTop > 220);
      setShowScrollBottom(scrollTop + clientHeight < scrollHeight - 220);
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

  // Never render on admin routes — admin shell has its own sidebar navigation.
  if (location.pathname.startsWith('/admin')) return null;
  if (['/', '/login', '/gateway'].includes(location.pathname) || location.pathname.startsWith('/onboarding')) return null;

  const profileLabel = lang === 'ar' ? 'الملف' : 'Profile';
  const madeInUaeLabel = lang === 'ar' ? 'الإمارات 🇦🇪' : 'UAE 🇦🇪';
  const switchLanguageLabel = lang === 'en' ? 'Switch to Arabic' : 'التبديل إلى الإنجليزية';
  const aiStudioRoute = getAIStudioRoute();

  const buttonSx = {
    width: { xs: 44, sm: 46 },
    height: { xs: 44, sm: 46 },
    minWidth: { xs: 44, sm: 46 },
    borderRadius: '16px !important',
    bgcolor: `${alpha('#020617', 0.94)} !important`,
    backdropFilter: 'blur(16px)',
    border: `1px solid ${alpha(binThemeTokens.gold, 0.26)} !important`,
    color: 'rgba(255,255,255,0.9) !important',
    boxShadow: '0 10px 28px rgba(0,0,0,0.45)',
    p: 0,
    '& svg': { width: 19, height: 19, strokeWidth: 2.5 },
    '&:hover': {
      bgcolor: `${alpha(binThemeTokens.gold, 0.18)} !important`,
      color: `${binThemeTokens.gold} !important`,
      borderColor: `${alpha(binThemeTokens.gold, 0.55)} !important`,
    },
  };

  const textButtonSx = {
    ...buttonSx,
    width: { xs: 72, sm: 86 },
    minWidth: { xs: 72, sm: 86 },
    height: { xs: 38, sm: 40 },
    px: 1,
    fontSize: { xs: '0.62rem', sm: '0.68rem' },
    lineHeight: 1.05,
    fontWeight: 950,
    color: `${binThemeTokens.gold} !important`,
    textTransform: 'none',
  };

  return (
    <Box sx={{ position: 'fixed', bottom: { xs: 12, sm: 22 }, right: isRTL ? 'auto' : { xs: 8, sm: 18 }, left: isRTL ? { xs: 8, sm: 18 } : 'auto', zIndex: 1400, pointerEvents: 'none' }}>
      <Stack spacing={0.75} sx={{ pointerEvents: 'auto', alignItems: isRTL ? 'flex-start' : 'flex-end' }}>
        {showScrollTop && <Tooltip title={t('nav.scroll_top') || (lang === 'ar' ? 'الانتقال إلى الأعلى' : 'Scroll to top')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToTop} sx={buttonSx}><ArrowUp /></IconButton></Tooltip>}
        <Tooltip title={t('nav.back') || (lang === 'ar' ? 'رجوع' : 'Back')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleBack} sx={buttonSx}>{isRTL ? <ArrowRight /> : <ArrowLeft />}</IconButton></Tooltip>
        <Tooltip title={t('nav.dashboard') || (lang === 'ar' ? 'لوحة التحكم' : 'Dashboard')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getDashboardRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><LayoutDashboard /></IconButton></Tooltip>
        {aiStudioRoute && <Tooltip title={t('nav.ai_studio') || (lang === 'ar' ? 'استوديو التصميم الذكي' : 'AI Studio')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(aiStudioRoute)} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush /></IconButton></Tooltip>}
        <Tooltip title={switchLanguageLabel} placement={isRTL ? 'right' : 'left'}>
          <IconButton onClick={toggleLanguage} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important`, gap: 0.3 }}>
            <Languages />
            <Box component="span" sx={{ fontSize: '0.55rem', fontWeight: 950, lineHeight: 1 }}>{lang === 'en' ? 'AR' : 'EN'}</Box>
          </IconButton>
        </Tooltip>
        {user ? <Tooltip title={t('nav.logout') || (lang === 'ar' ? 'تسجيل الخروج' : 'Logout')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleSignOut} sx={{ ...buttonSx, color: '#ef4444 !important' }}><LogOut /></IconButton></Tooltip> : <Tooltip title={t('nav.login') || (lang === 'ar' ? 'تسجيل الدخول' : 'Login')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate('/login')} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><LogIn /></IconButton></Tooltip>}
        {showScrollBottom && <Tooltip title={t('nav.scroll_bottom') || (lang === 'ar' ? 'الانتقال إلى الأسفل' : 'Scroll to bottom')} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToBottom} sx={buttonSx}><ArrowDown /></IconButton></Tooltip>}
        <Button size="small" onClick={() => navigate(getProfileRoute())} sx={textButtonSx}>{profileLabel}</Button>
        <Box sx={{ ...textButtonSx, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{madeInUaeLabel}</Box>
      </Stack>
    </Box>
  );
};

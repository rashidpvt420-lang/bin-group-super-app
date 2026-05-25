import React, { useEffect, useState } from 'react';
import { Box, Button, IconButton, Tooltip, Stack, alpha } from '@mui/material';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, LayoutDashboard, LogIn, LogOut, Paintbrush } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { auth } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export const NavigationControl: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, user } = useRole();
  const { isRTL, t } = useLanguage();
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

  const getDashboardRoute = () => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return '/admin/dashboard';
    if (r === 'tenant') return '/tenant/dashboard';
    if (r === 'technician') return '/technician/dashboard';
    if (r === 'broker') return '/broker/dashboard';
    if (r === 'owner' || r === 'ceo') return '/owner/dashboard';
    return '/';
  };

  const canAccessAIStudio = () => {
    const r = (role || '').toLowerCase();
    return user && ['owner', 'tenant', 'broker', 'admin', 'ceo'].includes(r);
  };

  const getAIStudioRoute = () => {
    if (canAccessAIStudio()) return '/design-studio';
    return '/ai-design-studio';
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

  if (
    ['/', '/login', '/gateway'].includes(location.pathname) ||
    location.pathname.startsWith('/onboarding') ||
    location.pathname.startsWith('/admin')
  ) return null;

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
        {showScrollTop && <Tooltip title={t('nav.scroll_top') || 'Scroll to top'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToTop} sx={buttonSx}><ArrowUp size={20} /></IconButton></Tooltip>}
        <Tooltip title={t('nav.back') || 'Back'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleBack} sx={buttonSx}>{isRTL ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}</IconButton></Tooltip>
        <Tooltip title={t('nav.dashboard') || 'Dashboard'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getDashboardRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><LayoutDashboard size={20} /></IconButton></Tooltip>
        <Tooltip title="AI Studio" placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate(getAIStudioRoute())} sx={{ ...buttonSx, color: `${binThemeTokens.gold} !important` }}><Paintbrush size={20} /></IconButton></Tooltip>
        {user ? <Tooltip title="Logout" placement={isRTL ? 'right' : 'left'}><IconButton onClick={handleSignOut} sx={{ ...buttonSx, color: '#ef4444' }}><LogOut size={20} /></IconButton></Tooltip> : <Tooltip title="Login" placement={isRTL ? 'right' : 'left'}><IconButton onClick={() => navigate('/login')} sx={{ ...buttonSx, color: binThemeTokens.gold }}><LogIn size={20} /></IconButton></Tooltip>}
        {showScrollBottom && <Tooltip title={t('nav.scroll_bottom') || 'Scroll to bottom'} placement={isRTL ? 'right' : 'left'}><IconButton onClick={scrollToBottom} sx={buttonSx}><ArrowDown size={20} /></IconButton></Tooltip>}
        <Button size="small" onClick={() => navigate('/company')} sx={{ ...buttonSx, px: 1.5, minWidth: 44, fontSize: '0.62rem', fontWeight: 950, color: binThemeTokens.gold }}>Profile</Button>
      </Stack>
    </Box>
  );
};

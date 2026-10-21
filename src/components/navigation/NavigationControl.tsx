import React from 'react';
import { Button } from '@mui/material';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const hiddenRoutes = new Set(['/', '/login', '/gateway']);
// These pages already place navigation in document flow. The fixed control
// sat on the start edge of the heading, and Arabic RTL put it on the heading.
const inFlowNavigationRoutes = new Set(['/homes', '/request-demo', '/videos']);

export const portalRoutePrefixes = ['/owner', '/tenant', '/technician', '/tech', '/broker', '/staff'];

export const NavigationControl: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isRTL, lang, t } = useLanguage();

  if (hiddenRoutes.has(location.pathname) || inFlowNavigationRoutes.has(location.pathname)) return null;
  if (location.pathname.startsWith('/admin')) return null;
  if (location.pathname.startsWith('/onboarding')) return null;
  // Portals draw their own Back button inside their header; a second floating
  // one covered the header title on phones (audit 2026-10-21 P0-1).
  if (portalRoutePrefixes.some((prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`))) return null;

  const label = t('nav.back') || (lang === 'ar' ? 'رجوع' : 'Back');

  const goBack = () => {
    if (window.history.length > 2) navigate(-1);
    else navigate('/');
  };

  return (
    <Button
      type="button"
      onClick={goBack}
      startIcon={isRTL ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
      sx={{
        position: 'fixed',
        // Bottom-left, clear of the page header (it used to sit at top: 104px
        // over the header buttons) and of the AI assistant on the right.
        bottom: { xs: 'calc(16px + env(safe-area-inset-bottom))', md: 24 },
        left: { xs: 14, md: 24 },
        zIndex: 1250,
        minHeight: 42,
        px: 1.8,
        borderRadius: 2,
        bgcolor: '#FFFFFF',
        color: '#111827',
        border: `1px solid ${binThemeTokens.gold}`,
        boxShadow: '0 10px 24px rgba(17,24,39,0.12)',
        fontWeight: 950,
        textTransform: 'none',
        '& .MuiButton-startIcon': {
          mr: isRTL ? 0 : 0.8,
          ml: isRTL ? 0.8 : 0,
        },
        '&:hover': {
          bgcolor: 'rgba(201,166,70,0.10)',
        },
      }}
    >
      {label}
    </Button>
  );
};

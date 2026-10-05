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

export const NavigationControl: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isRTL, lang, t } = useLanguage();

  if (hiddenRoutes.has(location.pathname) || inFlowNavigationRoutes.has(location.pathname)) return null;
  if (location.pathname.startsWith('/admin')) return null;
  if (location.pathname.startsWith('/onboarding')) return null;
  // The technician AppBar already has an in-flow Back button. The fixed copy duplicated it and sat
  // over the sync strips and page headings (and on the technician home it sent users to '/').
  if (location.pathname === '/technician' || location.pathname.startsWith('/technician/')) return null;

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
        top: { xs: 104, md: 96 },
        left: isRTL ? 'auto' : { xs: 14, md: 24 },
        right: isRTL ? { xs: 14, md: 24 } : 'auto',
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

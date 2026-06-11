import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import PortalSessionControls from '../components/PortalSessionControls';

const ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app';

const currentAdminPath = () => {
  if (typeof window === 'undefined') return '/dashboard';
  const path = window.location.pathname.replace(/^\/admin/, '') || '/dashboard';
  return path.startsWith('/') ? path : `/${path}`;
};

export default function AdminTerminal() {
  const { isRTL, lang, tx } = useLanguage();
  const targetUrl = `${ADMIN_PANEL_URL}${currentAdminPath()}`;

  const openAdminPanel = () => {
    window.location.href = targetUrl;
  };

  const resetAndLogin = async () => {
    try {
      await signOut(auth);
    } catch {
      // Continue with local reset.
    }
    try {
      const currentLang = localStorage.getItem('bin_language');
      const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
      localStorage.clear();
      sessionStorage.clear();
      if (currentLang) localStorage.setItem('bin_language', currentLang);
      if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
    } catch {
      // Ignore storage failures and continue navigation.
    }
    window.location.href = `${ADMIN_PANEL_URL}/login`;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#020617',
        color: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: { xs: 2, md: 4 },
        direction: isRTL ? 'rtl' : 'ltr',
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(201,166,70,0.18), transparent 42%)',
        position: 'relative',
      }}
    >
      <Box sx={{ position: 'absolute', top: 24, [isRTL ? 'left' : 'right']: 24 }}>
        <PortalSessionControls role="admin" dark accent="#C9A646" />
      </Box>
      <Box
        sx={{
          width: '100%',
          maxWidth: 720,
          bgcolor: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(201,166,70,0.35)',
          borderRadius: 5,
          p: { xs: 3, md: 5 },
          textAlign: 'center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        }}
      >
        <Typography variant="overline" sx={{ color: '#C9A646', fontWeight: 950, letterSpacing: 4 }}>
          BIN GROUP ADMIN
        </Typography>
        <Typography variant="h3" sx={{ mt: 2, mb: 2, fontWeight: 950, letterSpacing: -1.5 }}>
          {tx('admin.bridge.title', 'Admin Command Center')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, mb: 4, lineHeight: 1.7 }}>
          {tx(
            'admin.bridge.desc',
            'The stable production admin console runs on the dedicated admin hosting site. Use it for owner approvals, tickets, technicians, contracts, payments, and sovereign operations.'
          )}
        </Typography>

        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent="center">
          <Button
            variant="contained"
            onClick={openAdminPanel}
            sx={{
              bgcolor: '#C9A646',
              color: '#111827',
              fontWeight: 950,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              '&:hover': { bgcolor: '#E5C86B' },
            }}
          >
            {tx('admin.bridge.open', 'Open Admin Panel')}
          </Button>
          <Button
            variant="outlined"
            onClick={resetAndLogin}
            sx={{
              borderColor: 'rgba(201,166,70,0.65)',
              color: '#E5C86B',
              fontWeight: 950,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              '&:hover': { borderColor: '#E5C86B', bgcolor: 'rgba(201,166,70,0.08)' },
            }}
          >
            {tx('admin.bridge.reset', 'Reset & Login')}
          </Button>
        </Stack>

        <Typography variant="caption" sx={{ display: 'block', mt: 4, color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>
          {lang === 'ar' ? 'بوابة المسؤول المستقرة' : 'Stable admin URL'}: {ADMIN_PANEL_URL}
        </Typography>
      </Box>
    </Box>
  );
}

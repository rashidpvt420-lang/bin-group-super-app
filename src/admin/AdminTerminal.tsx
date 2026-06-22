import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import PortalSessionControls from '../components/PortalSessionControls';

const ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app';

const currentAdminPath = () => {
  if (typeof window === 'undefined') return '/dashboard';
  const path = window.location.pathname.replace(/^\/admin/, '') || '/dashboard';
  return path.startsWith('/') ? path : `/${path}`;
};

// Best-effort: exchange the session already open here for a one-time custom
// token the admin-panel origin can redeem, so staff don't have to sign in a
// second time after the cross-domain redirect. Any failure (offline, the
// function not deployed yet, etc.) just falls back to the plain URL, which
// still lands on the admin-panel's own login form exactly as it does today.
const withBridgeToken = async (url: string) => {
  try {
    const mintBridgeToken = httpsCallable(functions, 'mintAdminBridgeToken');
    const result: any = await mintBridgeToken();
    const token = result?.data?.token;
    if (!token) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}bridge_token=${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn('[ADMIN-BRIDGE] Token mint failed; falling back to manual re-login.', err);
    return url;
  }
};

export default function AdminTerminal() {
  const { isRTL, lang, tx } = useLanguage();
  const targetPath = currentAdminPath();
  const targetUrl = `${ADMIN_PANEL_URL}${targetPath}`;
  const loginUrl = `${ADMIN_PANEL_URL}/login`;

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const url = await withBridgeToken(targetUrl);
      if (!cancelled) window.location.replace(url);
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetUrl]);

  const openAdminPanel = async () => {
    window.location.href = await withBridgeToken(targetUrl);
  };

  const openAdminLogin = () => {
    window.location.href = loginUrl;
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
    window.location.href = loginUrl;
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
          maxWidth: 760,
          bgcolor: 'rgba(15, 23, 42, 0.94)',
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
          {tx('admin.bridge.title', 'Redirecting to Admin Command Center')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, mb: 3, lineHeight: 1.7 }}>
          {tx(
            'admin.bridge.desc',
            'The main app does not contain the admin login form. You are being sent to the dedicated production admin panel for owner approvals, tickets, technicians, contracts, payments, and sovereign operations.'
          )}
        </Typography>

        <Box sx={{ mb: 4, px: 2.5, py: 1.5, borderRadius: 2, bgcolor: 'rgba(201,166,70,0.10)', border: '1px solid rgba(201,166,70,0.30)' }}>
          <Typography variant="body2" sx={{ color: '#E5C86B', fontWeight: 800, lineHeight: 1.6 }}>
            {tx(
              'admin.bridge.reauth_notice',
              'Heads up: the admin panel is a separate secure app. We try to carry your session over automatically; if that fails, sign in again with your admin credentials when you arrive.'
            )}
          </Typography>
        </Box>

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
            onClick={openAdminLogin}
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
            {tx('admin.bridge.login', 'Open Admin Login')}
          </Button>
          <Button
            variant="outlined"
            onClick={resetAndLogin}
            sx={{
              borderColor: 'rgba(239,68,68,0.55)',
              color: '#FCA5A5',
              fontWeight: 950,
              px: 4,
              py: 1.5,
              borderRadius: 2,
              '&:hover': { borderColor: '#FCA5A5', bgcolor: 'rgba(239,68,68,0.08)' },
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

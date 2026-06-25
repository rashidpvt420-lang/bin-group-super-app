import React from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import PortalSessionControls from '../components/PortalSessionControls';

const ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app';
const ADMIN_PANEL_ORIGIN = new URL(ADMIN_PANEL_URL).origin;

const currentAdminPath = () => {
  if (typeof window === 'undefined') return '/dashboard';
  const path = window.location.pathname.replace(/^\/admin/, '') || '/dashboard';
  return path.startsWith('/') ? path : `/${path}`;
};

// Resolve the deep-link path against the fixed admin-panel origin and verify
// the result still resolves to that exact origin before it's ever used to
// navigate, so this can never be coerced into leaving bin-group-admin-panel.
// web.app no matter what currentAdminPath() returns.
const resolveAdminUrl = (path: string) => {
  const resolved = new URL(path, ADMIN_PANEL_URL);
  return resolved.origin === ADMIN_PANEL_ORIGIN ? resolved.toString() : `${ADMIN_PANEL_URL}/dashboard`;
};

// Best-effort: exchange the session already open here for a one-time custom
// token the admin-panel origin can redeem, so staff don't have to sign in a
// second time after the cross-domain redirect. Any failure (offline, the
// function not deployed yet, etc.) falls back to the plain login flow, tagged
// with #sso_failed=1 so the admin-panel can tell the user SSO was attempted
// and failed, instead of silently landing on what looks like a fresh login.
const withBridgeToken = async (url: string) => {
  try {
    const mintBridgeToken = httpsCallable(functions, 'mintAdminBridgeToken');
    const result: any = await mintBridgeToken();
    const token = result?.data?.token;
    if (!token) return `${ADMIN_PANEL_URL}/login#sso_failed=1`;
    // Carried in the fragment, not the query string: fragments are never sent
    // to the server, so the token can't leak into access logs or Referer headers.
    return `${url}#bridge_token=${encodeURIComponent(token)}`;
  } catch (err) {
    console.warn('[ADMIN-BRIDGE] Token mint failed; falling back to manual admin login.', err);
    return `${ADMIN_PANEL_URL}/login#sso_failed=1`;
  }
};

export default function AdminTerminal() {
  const { isRTL, lang, tx } = useLanguage();
  const targetPath = currentAdminPath();
  const targetUrl = resolveAdminUrl(targetPath);

  React.useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const url = await withBridgeToken(targetUrl);
      if (!cancelled) {
        window.location.replace(url.startsWith(ADMIN_PANEL_URL) ? url : `${ADMIN_PANEL_URL}/login#sso_failed=1`);
      }
    }, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [targetUrl]);

  const openAdminPanel = async () => {
    const url = await withBridgeToken(targetUrl);
    window.location.href = url.startsWith(ADMIN_PANEL_URL) ? url : `${ADMIN_PANEL_URL}/login#sso_failed=1`;
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
    window.location.href = `${ADMIN_PANEL_URL}/login#sso_failed=1`;
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
          {tx('admin.bridge.title', 'Opening Admin Command Center')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 700, mb: 3, lineHeight: 1.7 }}>
          {tx(
            'admin.bridge.desc',
            'The public app does not contain admin credentials. You are being sent to the dedicated production admin panel for approvals, tickets, technicians, contracts, payments, and sovereign operations.'
          )}
        </Typography>

        <Box sx={{ mb: 4, px: 2.5, py: 1.5, borderRadius: 2, bgcolor: 'rgba(201,166,70,0.10)', border: '1px solid rgba(201,166,70,0.30)' }}>
          <Typography variant="body2" sx={{ color: '#E5C86B', fontWeight: 800, lineHeight: 1.6 }}>
            {tx(
              'admin.bridge.reauth_notice',
              'Single admin entrypoint: we first try secure session handoff. If that fails, the same button opens the dedicated admin login with a clear SSO failure notice.'
            )}
          </Typography>
        </Box>

        <Stack direction="column" spacing={2} justifyContent="center">
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
            {tx('admin.bridge.open', 'Continue to Admin Command Center')}
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
            {tx('admin.bridge.reset', 'Reset Session & Open Admin Login')}
          </Button>
        </Stack>

        <Typography variant="caption" sx={{ display: 'block', mt: 4, color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>
          {lang === 'ar' ? 'بوابة المسؤول المستقرة' : 'Stable admin URL'}: {ADMIN_PANEL_URL}
        </Typography>
      </Box>
    </Box>
  );
}

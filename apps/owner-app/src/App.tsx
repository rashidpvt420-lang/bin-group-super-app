import React from 'react';
import { Alert, Box, Button, CssBaseline, Stack, Typography } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const redirectTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#B8932F' },
    background: { default: '#FFFFFF', paper: '#F8F9FB' },
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
});

const MAIN_APP_URL = (process.env.REACT_APP_MAIN_APP_URL || 'https://bin-group-57c60.web.app').replace(/\/+$/, '');

function normalizeLegacyOwnerPath(pathname: string): string {
  if (!pathname || pathname === '/' || pathname === '/index.html') return '/owner/dashboard';
  if (pathname === '/owner-dashboard' || pathname === '/dashboard') return '/owner/dashboard';
  if (pathname === '/financials') return '/owner/financials';
  if (pathname === '/calendar') return '/calendar';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function buildCanonicalTarget(): string {
  if (typeof window === 'undefined') return `${MAIN_APP_URL}/owner/dashboard`;

  const currentPath = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const isLoginLikeRoute = currentPath === '/' || currentPath === '/login' || currentPath === '/index.html';

  if (isLoginLikeRoute) {
    const params = new URLSearchParams();
    params.set('intendedRole', 'owner');
    params.set('returnTo', '/owner/dashboard');
    params.set('source', 'legacy-owner-app');
    return `${MAIN_APP_URL}/login?${params.toString()}`;
  }

  return `${MAIN_APP_URL}${normalizeLegacyOwnerPath(currentPath)}${search}${hash}`;
}

function LegacyOwnerRedirectShell() {
  const target = React.useMemo(() => buildCanonicalTarget(), []);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#FFFFFF',
        color: '#111827',
        display: 'grid',
        placeItems: 'center',
        px: 3,
      }}
    >
      <Stack
        spacing={3}
        alignItems="center"
        sx={{
          width: '100%',
          maxWidth: 720,
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          bgcolor: '#FFFFFF',
          border: '1px solid #E5E7EB',
          boxShadow: '0 30px 80px rgba(17, 24, 39, 0.12)',
          textAlign: 'center',
        }}
      >
        <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 4 }}>
          BIN GROUP OWNER PORTAL
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: -0.5 }}>
          Owner app has been consolidated into the main Super App
        </Typography>
        <Typography variant="body1" sx={{ color: '#667085', lineHeight: 1.8 }}>
          The old standalone owner-app bundle is now a safe handoff only. Owner, Tenant, Technician, Broker, and Admin workflows use the canonical main app routes so dashboard fixes are not split across two folders.
        </Typography>
        <Alert severity="warning" variant="outlined" sx={{ borderColor: 'rgba(184,147,47,0.42)', color: '#6B580F' }}>
          Do not add new owner routes here. Add them under <strong>src/owner/OwnerApp.tsx</strong> in the main app.
        </Alert>
        <Button
          variant="contained"
          href={target}
          sx={{
            bgcolor: '#B8932F',
            color: '#FFFFFF',
            fontWeight: 950,
            px: 4,
            '&:hover': { bgcolor: '#A08027' },
          }}
        >
          Continue to Canonical Super App
        </Button>
        <Typography variant="caption" sx={{ color: '#98A2B3', fontWeight: 800, overflowWrap: 'anywhere' }}>
          Target: {target}
        </Typography>
      </Stack>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={redirectTheme}>
      <CssBaseline />
      <LegacyOwnerRedirectShell />
    </ThemeProvider>
  );
}

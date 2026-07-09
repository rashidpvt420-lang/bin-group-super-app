import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Alert, Box, Button, CircularProgress, CssBaseline, Stack, Typography } from '@mui/material';

const redirectTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#DAA520' },
    background: { default: '#020617', paper: '#0f172a' },
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
  },
});

const MAIN_APP_URL = (process.env.REACT_APP_MAIN_APP_URL || 'https://bin-group-57c60.web.app').replace(/\/+$/, '');

function buildCanonicalAdminTarget(): string {
  if (typeof window === 'undefined') return `${MAIN_APP_URL}/admin/dashboard`;

  const currentPath = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const isLoginLikeRoute = currentPath === '/' || currentPath === '/login' || currentPath === '/index.html';

  if (isLoginLikeRoute) {
    const params = new URLSearchParams();
    params.set('intendedRole', 'admin');
    params.set('returnTo', '/admin/dashboard');
    params.set('source', 'legacy-admin-panel');
    return `${MAIN_APP_URL}/login?${params.toString()}`;
  }

  const normalizedPath = currentPath.replace(/^\/admin(?=\/|$)/, '') || '/dashboard';
  const adminPath = normalizedPath === '/dashboard' ? '/admin/dashboard' : `/admin${normalizedPath}`;
  return `${MAIN_APP_URL}${adminPath}${search}${hash}`;
}

function RedirectShell() {
  const [seconds, setSeconds] = React.useState(3);
  const target = React.useMemo(() => buildCanonicalAdminTarget(), []);

  React.useEffect(() => {
    const tick = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    const timer = window.setTimeout(() => {
      window.location.replace(target);
    }, 900);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(timer);
    };
  }, [target]);

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        color: '#fff',
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
          maxWidth: 640,
          p: { xs: 3, md: 5 },
          borderRadius: 5,
          bgcolor: 'rgba(15, 23, 42, 0.94)',
          border: '1px solid rgba(218, 165, 32, 0.24)',
          boxShadow: '0 30px 80px rgba(2, 6, 23, 0.45)',
          textAlign: 'center',
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
        <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, letterSpacing: 4 }}>
          BIN GROUP ADMIN
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: -0.5 }}>
          Opening the canonical command center
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.8 }}>
          The dedicated admin-panel domain is now legacy redirect-only. Admin authentication and command operations run inside the main BIN GROUP app at /admin/dashboard.
        </Typography>
        <Alert severity="info" variant="outlined" sx={{ borderColor: 'rgba(218,165,32,0.35)', color: 'rgba(255,255,255,0.78)' }}>
          Redirecting in {seconds}s. This prevents the old admin-panel login timeout and removes cross-domain dead-ends.
        </Alert>
        <Button
          variant="contained"
          href={target}
          sx={{
            bgcolor: 'primary.main',
            color: '#020617',
            fontWeight: 950,
            px: 4,
            '&:hover': { bgcolor: '#e2ba45' },
          }}
        >
          Continue to Admin Command Center
        </Button>
      </Stack>
    </Box>
  );
}

export default function App() {
  return (
    <ThemeProvider theme={redirectTheme}>
      <CssBaseline />
      <RedirectShell />
    </ThemeProvider>
  );
}

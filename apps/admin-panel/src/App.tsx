import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { Box, Button, CircularProgress, CssBaseline, Stack, Typography } from '@mui/material';

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

const buildUnifiedTarget = (): string => {
  if (typeof window === 'undefined') {
    return `${MAIN_APP_URL}/login?intendedRole=admin&returnTo=%2Fadmin%2Fdashboard`;
  }

  const currentPath = window.location.pathname || '/';
  const isLoginLikeRoute = currentPath === '/' || currentPath === '/login' || currentPath === '/index.html';

  if (isLoginLikeRoute) {
    const params = new URLSearchParams();
    params.set('intendedRole', 'admin');
    params.set('returnTo', '/admin/dashboard');
    return `${MAIN_APP_URL}/login?${params.toString()}`;
  }

  return `${MAIN_APP_URL}/admin/dashboard`;
};

function RedirectShell() {
  const target = React.useMemo(() => buildUnifiedTarget(), []);

  React.useEffect(() => {
    window.location.replace(target);
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
          maxWidth: 560,
          p: 5,
          borderRadius: 4,
          bgcolor: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(218, 165, 32, 0.24)',
          boxShadow: '0 30px 80px rgba(2, 6, 23, 0.45)',
          textAlign: 'center',
        }}
      >
        <CircularProgress sx={{ color: 'primary.main' }} />
        <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: 1 }}>
          BIN GROUP Unified Access
        </Typography>
        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.8 }}>
          The separate admin sign-in has been removed. You are being redirected to the single BIN GROUP login and dashboard flow.
        </Typography>
        <Button
          variant="contained"
          href={target}
          sx={{
            bgcolor: 'primary.main',
            color: '#020617',
            fontWeight: 900,
            px: 3,
            '&:hover': { bgcolor: '#e2ba45' },
          }}
        >
          Continue الآن
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

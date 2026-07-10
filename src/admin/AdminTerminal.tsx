import React from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const ADMIN_PANEL_URL = (import.meta.env.VITE_ADMIN_PANEL_URL || 'https://bin-group-admin-panel.web.app').replace(/\/+$/, '');

function canonicalTarget(pathname: string, search: string, hash: string) {
  const suffix = pathname.replace(/^\/admin(?=\/|$)/, '') || '/dashboard';
  const route = suffix === '/' ? '/dashboard' : suffix;
  return `${ADMIN_PANEL_URL}${route}${search}${hash}`;
}

export default function AdminTerminal() {
  const location = useLocation();
  const target = React.useMemo(
    () => canonicalTarget(location.pathname, location.search, location.hash),
    [location.hash, location.pathname, location.search],
  );

  React.useEffect(() => {
    const timer = window.setTimeout(() => window.location.replace(target), 350);
    return () => window.clearTimeout(timer);
  }, [target]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#020617', color: '#fff', p: 3 }}>
      <Paper sx={{ width: '100%', maxWidth: 620, p: { xs: 3, md: 5 }, textAlign: 'center', bgcolor: '#0f172a', color: '#fff', border: '1px solid rgba(218,165,32,0.28)', borderRadius: 5 }}>
        <Stack spacing={2.5} alignItems="center">
          <Box sx={{ width: 54, height: 54, borderRadius: 3, bgcolor: 'rgba(218,165,32,0.14)', color: '#DAA520', display: 'grid', placeItems: 'center' }}><ShieldCheck size={28} /></Box>
          <CircularProgress size={30} sx={{ color: '#DAA520' }} />
          <Typography variant="h4" sx={{ fontWeight: 950 }}>Opening Canonical Admin Panel</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.75 }}>
            All admin dashboards, approvals, operations, reports, launch evidence and security controls now live in one dedicated application.
          </Typography>
          <Alert severity="info" sx={{ width: '100%', textAlign: 'left' }}>
            The old in-app admin dashboard has been retired to prevent duplicated routes and missing features.
          </Alert>
          <Button href={target} variant="contained" endIcon={<ExternalLink size={17} />} sx={{ bgcolor: '#DAA520', color: '#020617', fontWeight: 950 }}>
            Continue to Admin Panel
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

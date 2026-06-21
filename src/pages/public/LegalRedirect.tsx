import React from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';

/**
 * Sends legal-page routes to the real, reviewed static HTML documents in /public
 * instead of rendering through the SPA's translation-key system. Must use a real
 * browser navigation (not react-router's <Navigate>) so Firebase Hosting serves
 * the static file directly rather than falling through to the SPA rewrite.
 */
export default function LegalRedirect({ to }: { to: string }) {
  React.useEffect(() => {
    window.location.replace(to);
  }, [to]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack alignItems="center" spacing={1}>
        <Typography variant="body1" fontWeight={700}>Redirecting…</Typography>
        <Link href={to}>Click here if you are not redirected automatically</Link>
      </Stack>
    </Box>
  );
}

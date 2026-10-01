import React from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';

type LegalTarget =
  | '/privacy-policy.html'
  | '/privacy.html'
  | '/terms-of-service.html'
  | '/terms.html';

/**
 * Sends legal-page routes to the real, reviewed static HTML documents in /public
 * instead of rendering through the SPA's translation-key system. Must use a real
 * browser navigation (not react-router's <Navigate>) so Firebase Hosting serves
 * the static file directly rather than falling through to the SPA rewrite.
 *
 * Alias targets (/terms.html, /privacy.html) keep cleanUrls paths stable for the
 * short public routes; canonical targets keep the long reviewed URLs.
 */
export default function LegalRedirect({ to }: { to: LegalTarget }) {
  React.useEffect(() => {
    // Each branch navigates with a string literal, never the `to` prop itself,
    // so this can't become an open-redirect sink no matter what a future caller
    // passes in -- there is no variable for an untrusted value to ride in on.
    if (to === '/terms.html') {
      window.location.replace('/terms.html');
      return;
    }
    if (to === '/terms-of-service.html') {
      window.location.replace('/terms-of-service.html');
      return;
    }
    if (to === '/privacy.html') {
      window.location.replace('/privacy.html');
      return;
    }
    window.location.replace('/privacy-policy.html');
  }, [to]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack alignItems="center" spacing={1}>
        <Typography variant="body1" fontWeight={700}>Redirecting…</Typography>
        {to === '/terms.html' ? (
          <Link href="/terms.html">Click here if you are not redirected automatically</Link>
        ) : to === '/terms-of-service.html' ? (
          <Link href="/terms-of-service.html">Click here if you are not redirected automatically</Link>
        ) : to === '/privacy.html' ? (
          <Link href="/privacy.html">Click here if you are not redirected automatically</Link>
        ) : (
          <Link href="/privacy-policy.html">Click here if you are not redirected automatically</Link>
        )}
      </Stack>
    </Box>
  );
}

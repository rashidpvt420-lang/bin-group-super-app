import React from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';

type LegalTarget = '/privacy-policy.html' | '/terms-of-service.html';

/**
 * Sends legal-page routes to the real, reviewed static HTML documents in /public
 * instead of rendering through the SPA's translation-key system. Must use a real
 * browser navigation (not react-router's <Navigate>) so Firebase Hosting serves
 * the static file directly rather than falling through to the SPA rewrite.
 */
export default function LegalRedirect({ to }: { to: LegalTarget }) {
  const isTerms = to === '/terms-of-service.html';

  React.useEffect(() => {
    // Each branch navigates with a string literal, never the `to` prop itself,
    // so this can't become an open-redirect sink no matter what a future caller
    // passes in -- there is no variable for an untrusted value to ride in on.
    if (isTerms) {
      window.location.replace('/terms-of-service.html');
    } else {
      window.location.replace('/privacy-policy.html');
    }
  }, [isTerms]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack alignItems="center" spacing={1}>
        <Typography variant="body1" fontWeight={700}>Redirecting…</Typography>
        {isTerms ? (
          <Link href="/terms-of-service.html">Click here if you are not redirected automatically</Link>
        ) : (
          <Link href="/privacy-policy.html">Click here if you are not redirected automatically</Link>
        )}
      </Stack>
    </Box>
  );
}

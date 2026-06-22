import React from 'react';
import { Box, Link, Stack, Typography } from '@mui/material';

// Closed set of legal documents this component is allowed to send users to.
// Validated at runtime (not just by the TS prop type) so this can never become
// an open-redirect sink even if a future caller passes an untrusted value.
const ALLOWED_LEGAL_TARGETS = ['/privacy-policy.html', '/terms-of-service.html'] as const;
type LegalTarget = (typeof ALLOWED_LEGAL_TARGETS)[number];

/**
 * Sends legal-page routes to the real, reviewed static HTML documents in /public
 * instead of rendering through the SPA's translation-key system. Must use a real
 * browser navigation (not react-router's <Navigate>) so Firebase Hosting serves
 * the static file directly rather than falling through to the SPA rewrite.
 */
export default function LegalRedirect({ to }: { to: LegalTarget }) {
  const safeTarget = ALLOWED_LEGAL_TARGETS.includes(to) ? to : '/privacy-policy.html';

  React.useEffect(() => {
    window.location.replace(safeTarget);
  }, [safeTarget]);

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Stack alignItems="center" spacing={1}>
        <Typography variant="body1" fontWeight={700}>Redirecting…</Typography>
        <Link href={safeTarget}>Click here if you are not redirected automatically</Link>
      </Stack>
    </Box>
  );
}

import React from 'react';
import { Alert, Box, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

function readParam(name: string) {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name) || '';
}

export default function PaymentResultPage({ status }: { status: 'success' | 'failed' }) {
  const sessionId = readParam('session_id');
  const ownerUid = readParam('ownerUid');
  const intakeId = readParam('intakeId');
  const ticketId = readParam('ticketId');
  const designRequestId = readParam('designRequestId');
  const ok = status === 'success';
  const reference = intakeId || ticketId || designRequestId || ownerUid || sessionId || 'Not available';

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: '#000', color: '#fff', py: { xs: 5, md: 10 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: 'rgba(15,23,42,.84)', border: `1px solid ${ok ? 'rgba(16,185,129,.35)' : 'rgba(239,68,68,.35)'}` }}>
          <Stack spacing={3} alignItems="center" textAlign="center">
            {ok ? <CheckCircle size={58} color="#10b981" /> : <XCircle size={58} color="#ef4444" />}
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>
              BIN GROUP PAYMENT RESULT
            </Typography>
            <Typography variant="h4" fontWeight={950}>
              {ok ? 'Payment received' : 'Payment was not completed'}
            </Typography>
            <Typography sx={{ color: 'rgba(255,255,255,.68)', lineHeight: 1.8 }}>
              {ok
                ? 'Your payment result was returned by the payment provider. If this payment belongs to an owner onboarding contract, activation still depends on backend verification and profile sync.'
                : 'The payment checkout was cancelled or failed. You can return to the portal and submit a manual bank-transfer verification request.'}
            </Typography>
            <Alert severity={ok ? 'success' : 'warning'} sx={{ width: '100%', textAlign: 'left' }}>
              Reference: {reference}
            </Alert>
            {ok && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,.58)' }}>
                <Clock size={16} />
                <Typography variant="caption" fontWeight={800}>Dashboard unlock may require a short sync after webhook processing.</Typography>
              </Stack>
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: '100%', justifyContent: 'center' }}>
              <Button variant="contained" href="/owner/activation" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>
                Owner Activation
              </Button>
              <Button variant="outlined" href="/" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>
                Return Home
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}

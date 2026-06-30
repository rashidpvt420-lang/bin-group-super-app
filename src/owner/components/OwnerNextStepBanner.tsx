import React from 'react';
import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { binThemeTokens } from '../../theme/binGroupTheme';

type OwnerNextStepBannerProps = {
  missingTitleDeed: boolean;
  hasVerifiedIban: boolean;
  pendingPayments: number;
  pendingApprovals: number;
  overdueTenants: number;
};

export default function OwnerNextStepBanner({ missingTitleDeed, hasVerifiedIban, pendingPayments, pendingApprovals, overdueTenants }: OwnerNextStepBannerProps) {
  let nextStep = null;

  if (missingTitleDeed) {
    nextStep = {
      title: 'Upload Title Deed',
      desc: 'Verify your property ownership to unlock full payouts and verified badges.',
      action: 'Upload now',
      href: '#owner-properties',
      color: '#ef4444'
    };
  } else if (!hasVerifiedIban) {
    nextStep = {
      title: 'Verify IBAN',
      desc: 'Add your verified bank details so we can transfer rent collections.',
      action: 'Add IBAN',
      href: '/owner/iban',
      color: '#f59e0b'
    };
  } else if (pendingPayments > 0) {
    nextStep = {
      title: 'Approve Pending Rent',
      desc: `You have ${pendingPayments} rent payment(s) awaiting your verification.`,
      action: 'Review payments',
      href: '#owner-money-snapshot',
      color: binThemeTokens.gold
    };
  } else if (overdueTenants > 0) {
    nextStep = {
      title: 'Resolve Overdue Rent',
      desc: `You have ${overdueTenants} tenant(s) with overdue rent.`,
      action: 'Manage ledger',
      href: '#owner-money-snapshot',
      color: '#ef4444'
    };
  } else if (pendingApprovals > 0) {
    nextStep = {
      title: 'Approve Ticket Evidence',
      desc: `You have ${pendingApprovals} maintenance item(s) awaiting approval.`,
      action: 'Review tickets',
      href: '#complaints-command-center',
      color: '#f59e0b'
    };
  }

  if (!nextStep) {
    return (
      <Paper sx={{ p: 2, bgcolor: alpha('#10b981', 0.1), border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CheckCircle2 color="#10b981" />
        <Typography sx={{ color: '#10b981', fontWeight: 700 }}>All caught up! Your dashboard requires no immediate action.</Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 3, bgcolor: alpha(nextStep.color, 0.08), border: `1px solid ${alpha(nextStep.color, 0.2)}`, borderRadius: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
        <Stack direction="row" spacing={2} alignItems="center">
          <AlertCircle color={nextStep.color} size={32} />
          <Box>
            <Typography variant="caption" sx={{ color: nextStep.color, fontWeight: 950, letterSpacing: 2 }}>YOUR NEXT STEP</Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>{nextStep.title}</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5 }}>{nextStep.desc}</Typography>
          </Box>
        </Stack>
        <Button variant="contained" href={nextStep.href} endIcon={<ChevronRight size={18} />} sx={{ bgcolor: nextStep.color, color: '#000', fontWeight: 900, whiteSpace: 'nowrap', px: 4, py: 1.5, borderRadius: 2 }}>
          {nextStep.action}
        </Button>
      </Stack>
    </Paper>
  );
}

import { Box, Button, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import RoleQuickActionsPanel from '../../components/RoleQuickActionsPanel';
import OwnerApprovalCommandStrip from '../../components/OwnerApprovalCommandStrip';
import { useOwnerCommandCounts } from '../hooks/useOwnerCommandCounts';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function OwnerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx } = useLanguage();
  const commandCounts = useOwnerCommandCounts();

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>{tx('owner.simple.overline', 'OWNER SIMPLE MODE')}</Typography>
          <Typography variant="h3" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 1 }}>{tx('owner.simple.title', 'What needs your attention?')}</Typography>
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 760 }}>{tx('owner.simple.desc', 'See approvals, risk, maintenance cost, tenant issues, documents, and reports without searching through the full owner portal.')}</Typography>
        </Box>

        <OwnerApprovalCommandStrip
          isRTL={isRTL}
          pendingCostApprovals={commandCounts.pendingCostApprovals}
          highRiskTickets={commandCounts.highRiskTickets}
          openDisputes={commandCounts.openDisputes}
          expiringDocuments={commandCounts.expiringDocuments}
          monthlyCostVariancePct={commandCounts.monthlyCostVariancePct}
        />

        <RoleQuickActionsPanel role="owner" isRTL={isRTL} title={tx('owner.simple.primaryTitle', 'Main owner actions')} subtitle={tx('owner.simple.primarySubtitle', 'The owner view starts with decisions, proof, money, and property health.')} />

        <Paper sx={{ p: 2.5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
          <Stack spacing={1.2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{tx('owner.simple.reportPromise', 'Monthly report promise')}</Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{tx('owner.simple.reportPromiseDesc', 'Owners should receive a monthly evidence report showing tickets, spend, photos, SLA performance, disputes, tenant satisfaction, and next-month risks.')}</Typography>
            {commandCounts.loading && <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{tx('owner.simple.loadingSignals', 'Loading live owner signals...')}</Typography>}
          </Stack>
        </Paper>

        <Button onClick={() => navigate('/owner/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: binThemeTokens.goldHover, fontWeight: 950 }}>{tx('owner.simple.advanced', 'Open advanced dashboard')}</Button>
      </Stack>
    </Box>
  );
}

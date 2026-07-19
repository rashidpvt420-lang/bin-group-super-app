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
          <Typography sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 760 }}>{tx('owner.simple.desc', 'See contract offers, room-rent requests, approvals, risk, maintenance cost, tenant issues, documents, and reports without searching through the full owner portal.')}</Typography>
        </Box>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${alpha(binThemeTokens.gold, 0.26)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 2 }}>{tx('owner.simple.contractFirst', 'CONTRACT OFFERS FIRST')}</Typography>
              <Typography variant="h5" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950, mt: 0.5 }}>{tx('owner.simple.roomRentTitle', 'Find a Room Rent — BIN handles renter contacts for you.')}</Typography>
              <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mt: 1, maxWidth: 820 }}>{tx('owner.simple.roomRentDesc', 'Start from the BIN service contract, then submit vacant rooms. We publish only contract-backed rooms, show repair history to renters, and route applications back to you for owner approval and signed contract handling.')}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.2}>
              <Button onClick={() => navigate('/owner/contracts')} sx={{ color: binThemeTokens.goldHover, fontWeight: 950, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, borderRadius: 3, bgcolor: '#fff' }}>{tx('owner.simple.openContracts', 'Open contract offers')}</Button>
              <Button onClick={() => navigate('/owner/find-room-rent')} sx={{ color: '#111827', fontWeight: 950, borderRadius: 3, bgcolor: binThemeTokens.gold, '&:hover': { bgcolor: binThemeTokens.goldHover } }}>{tx('owner.simple.findRoomRent', 'Find Room Rent')}</Button>
            </Stack>
          </Stack>
        </Paper>

        <OwnerApprovalCommandStrip
          isRTL={isRTL}
          pendingCostApprovals={commandCounts.pendingCostApprovals}
          highRiskTickets={commandCounts.highRiskTickets}
          openDisputes={commandCounts.openDisputes}
          expiringDocuments={commandCounts.expiringDocuments}
          monthlyCostVariancePct={commandCounts.monthlyCostVariancePct}
        />

        <RoleQuickActionsPanel role="owner" isRTL={isRTL} title={tx('owner.simple.primaryTitle', 'Main owner actions')} subtitle={tx('owner.simple.primarySubtitle', 'The owner view starts with contracts, renter handling, decisions, proof, money, and property health.')} />

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

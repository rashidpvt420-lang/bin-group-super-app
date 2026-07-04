import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckSquare, FileWarning, ReceiptText, Wrench } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

type OwnerApprovalCommandStripProps = {
  pendingCostApprovals?: number;
  highRiskTickets?: number;
  openDisputes?: number;
  expiringDocuments?: number;
  monthlyCostVariancePct?: number | null;
  isRTL?: boolean;
};

const asCount = (value: number | undefined) => Math.max(0, Number(value || 0));

export default function OwnerApprovalCommandStrip({
  pendingCostApprovals = 0,
  highRiskTickets = 0,
  openDisputes = 0,
  expiringDocuments = 0,
  monthlyCostVariancePct = null,
  isRTL = false,
}: OwnerApprovalCommandStripProps) {
  const navigate = useNavigate();
  const urgentTotal = asCount(pendingCostApprovals) + asCount(highRiskTickets) + asCount(openDisputes) + asCount(expiringDocuments);
  const costVarianceAlert = typeof monthlyCostVariancePct === 'number' && Math.abs(monthlyCostVariancePct) >= 15;

  const cards = [
    {
      id: 'approvals',
      label: 'Cost approvals',
      value: asCount(pendingCostApprovals),
      icon: <CheckSquare size={22} />,
      route: '/owner/approvals',
      help: 'Repairs waiting for owner decision.',
    },
    {
      id: 'risk',
      label: 'High-risk tickets',
      value: asCount(highRiskTickets),
      icon: <AlertTriangle size={22} />,
      route: '/owner/tickets',
      help: 'Issues that can affect comfort, safety, or asset value.',
    },
    {
      id: 'disputes',
      label: 'Disputes',
      value: asCount(openDisputes),
      icon: <Wrench size={22} />,
      route: '/owner/complaints',
      help: 'Tenant or completion proof disputes.',
    },
    {
      id: 'documents',
      label: 'Expiring docs',
      value: asCount(expiringDocuments),
      icon: <FileWarning size={22} />,
      route: '/owner/documents',
      help: 'Contracts, warranties, insurance, or certificates needing review.',
    },
  ];

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: urgentTotal ? alpha('#ef4444', 0.075) : alpha(binThemeTokens.gold, 0.045), border: `1px solid ${urgentTotal ? alpha('#ef4444', 0.24) : alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>OWNER COMMAND STRIP</Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>What needs my approval today?</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>Keeps owners focused on decisions, risk, proof, and cost.</Typography>
          </Box>
          <Chip
            icon={<ReceiptText size={16} />}
            label={costVarianceAlert ? `Cost variance ${monthlyCostVariancePct}%` : urgentTotal ? `${urgentTotal} action${urgentTotal === 1 ? '' : 's'} pending` : 'No urgent owner actions'}
            sx={{ bgcolor: urgentTotal || costVarianceAlert ? alpha('#ef4444', 0.15) : alpha('#10b981', 0.15), color: urgentTotal || costVarianceAlert ? '#fca5a5' : '#6ee7b7', fontWeight: 950 }}
          />
        </Stack>
        <Grid container spacing={2}>
          {cards.map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card.id}>
              <Button
                fullWidth
                onClick={() => navigate(card.route)}
                sx={{ minHeight: 116, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: alpha(binThemeTokens.gold, 0.35) } }}
              >
                <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ color: card.value > 0 ? '#fca5a5' : binThemeTokens.gold }}>{card.icon}</Box>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>{card.value}</Typography>
                  <Typography sx={{ fontWeight: 950 }}>{card.label}</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.54)', lineHeight: 1.45 }}>{card.help}</Typography>
                </Stack>
              </Button>
            </Grid>
          ))}
        </Grid>
      </Stack>
    </Paper>
  );
}

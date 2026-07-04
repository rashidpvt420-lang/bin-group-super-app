import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { FileCheck2, Handshake, Link2, QrCode, WalletCards } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';

type BrokerAttributionQuickStartCardProps = {
  referralLinkReady?: boolean;
  qrReady?: boolean;
  activeLeads?: number;
  attributedContracts?: number;
  pendingCommissionAmount?: number;
  isRTL?: boolean;
};

export default function BrokerAttributionQuickStartCard({
  referralLinkReady = false,
  qrReady = false,
  activeLeads = 0,
  attributedContracts = 0,
  pendingCommissionAmount = 0,
  isRTL = false,
}: BrokerAttributionQuickStartCardProps) {
  const navigate = useNavigate();
  const readiness = [referralLinkReady, qrReady, attributedContracts > 0].filter(Boolean).length;
  const readinessPct = Math.round((readiness / 3) * 100);

  const actions = [
    { id: 'referral', label: 'Referral link', value: referralLinkReady ? 'Ready' : 'Set up', icon: <Link2 size={20} />, route: '/broker/referrals' },
    { id: 'qr', label: 'QR lead capture', value: qrReady ? 'Ready' : 'Generate', icon: <QrCode size={20} />, route: '/broker/leads' },
    { id: 'contracts', label: 'Attributed contracts', value: String(attributedContracts), icon: <FileCheck2 size={20} />, route: '/broker/attribution' },
    { id: 'commission', label: 'Pending commission', value: `AED ${Number(pendingCommissionAmount || 0).toLocaleString()}`, icon: <WalletCards size={20} />, route: '/broker/commissions' },
  ];

  return (
    <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
      <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>BROKER ATTRIBUTION</Typography>
            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>Prove who brought the owner, tenant, or property</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>Attribution should be recorded before contract activation so commission status stays transparent.</Typography>
          </Box>
          <Chip icon={<Handshake size={16} />} label={`${readinessPct}% attribution ready`} sx={{ bgcolor: readinessPct === 100 ? alpha('#10b981', 0.15) : alpha('#f59e0b', 0.15), color: readinessPct === 100 ? '#6ee7b7' : '#fcd34d', fontWeight: 950 }} />
        </Stack>
        <Grid container spacing={2}>
          {actions.map((action) => (
            <Grid item xs={12} sm={6} md={3} key={action.id}>
              <Button fullWidth onClick={() => navigate(action.route)} sx={{ minHeight: 110, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.1), borderColor: alpha(binThemeTokens.gold, 0.35) } }}>
                <Stack spacing={1} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ color: binThemeTokens.gold }}>{action.icon}</Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.58)', fontWeight: 900 }}>{action.label}</Typography>
                  <Typography sx={{ fontWeight: 950 }}>{action.value}</Typography>
                </Stack>
              </Button>
            </Grid>
          ))}
        </Grid>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>Active leads currently tracked: {Number(activeLeads || 0).toLocaleString()}</Typography>
      </Stack>
    </Paper>
  );
}

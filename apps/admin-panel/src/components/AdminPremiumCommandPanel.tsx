import React from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Bot, Car, CheckCircle2, ClipboardCheck, ShieldCheck, Wrench } from 'lucide-react';
import { binThemeTokens } from '../theme/adminTheme';

type Props = {
  kpis: Record<string, any>;
  onNavigate: (path: string) => void;
};

const valueOf = (item: any) => Number(String(item?.value || 0).replace(/[^0-9.-]/g, '')) || 0;

export default function AdminPremiumCommandPanel({ kpis, onNavigate }: Props) {
  const paymentQueue = valueOf(kpis.pendingPaymentVerifications);
  const openMissions = valueOf(kpis.openMissions);
  const ownerQueue = valueOf(kpis.pendingOwnerApprovals);
  const launchReady = paymentQueue === 0 && ownerQueue === 0;
  const commandCards = [
    { label: 'Launch blockers', value: launchReady ? 'Clear' : `${paymentQueue + ownerQueue} pending`, icon: <ShieldCheck size={20} />, color: launchReady ? '#10b981' : binThemeTokens.gold, path: '/ops/public-launch-command' },
    { label: '5-profile smoke', value: 'Run required', icon: <ClipboardCheck size={20} />, color: '#3b82f6', path: '/ops/pilot-completion' },
    { label: 'AI concierge', value: 'Pilot shell', icon: <Bot size={20} />, color: binThemeTokens.gold, path: '/ops/bin-connect' },
    { label: 'QR visitor passes', value: 'Visitor parking', icon: <Car size={20} />, color: '#8b5cf6', path: '/ops/visitor-parking' },
    { label: 'Live command', value: `${openMissions} missions`, icon: <Wrench size={20} />, color: openMissions ? binThemeTokens.gold : '#10b981', path: '/ops/technicians' },
  ];

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, mb: 5, borderRadius: 6, bgcolor: 'rgba(15,23,42,0.62)', border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}` }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PREMIUM TRUST COMMAND</Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>Simple, premium, trustworthy launch control</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.52)', mt: 1 }}>Public launch blockers, 5-role smoke, command visibility, visitor access, and No-Call identity in one admin view.</Typography>
        </Box>
        <Chip icon={<CheckCircle2 size={16} />} label={launchReady ? 'QUEUE CLEAR' : 'ADMIN QUEUE NEEDS ACTION'} sx={{ bgcolor: alpha(launchReady ? '#10b981' : binThemeTokens.gold, 0.12), color: launchReady ? '#10b981' : binThemeTokens.gold, fontWeight: 950, '& .MuiChip-icon': { color: launchReady ? '#10b981' : binThemeTokens.gold } }} />
      </Stack>
      <Grid container spacing={2}>
        {commandCards.map((card) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={card.label}>
            <Paper onClick={() => onNavigate(card.path)} sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${alpha(card.color, 0.22)}`, borderRadius: 4, cursor: 'pointer', '&:hover': { borderColor: card.color } }}>
              <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
              <Typography sx={{ color: '#fff', fontWeight: 950 }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.42)', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" onClick={() => onNavigate('/ops/public-launch-command')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Finish launch blockers</Button>
        <Button variant="outlined" onClick={() => onNavigate('/ops/technicians')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Live command</Button>
        <Button variant="outlined" onClick={() => onNavigate('/ops/visitor-parking')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>QR visitor access</Button>
      </Stack>
    </Paper>
  );
}

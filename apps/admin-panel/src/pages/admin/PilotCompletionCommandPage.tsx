import React from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, ClipboardCheck, GitPullRequest, Rocket, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/adminTheme';

const conversionItems = [
  ['Maintenance ticket', 'Convert BIN Connect/Majlis messages into actionable maintenance work.'],
  ['Complaint', 'Escalate tenant/owner dissatisfaction into auditable complaint review.'],
  ['RFQ', 'Move quote requests into vendor comparison and owner approval.'],
  ['HR/support task', 'Route staff, technician, or Majlis support requests to HR/ops.'],
  ['Feature request', 'Convert dashboard suggestions into product backlog evidence.'],
];

const proofItems = [
  'Firebase Auth production proof',
  'Storage upload/download proof',
  'Functions live smoke test',
  'FCM/push notification proof',
  'Google Maps/GPS proof',
  'AI signed-in production proof',
  'Payment/manual bank activation proof',
  'Android/iOS PWA proof',
  'Mobile PDF download proof',
  'Arabic RTL sweep',
  'Every-button audit',
  'Logout test',
];

export default function PilotCompletionCommandPage() {
  const navigate = useNavigate();
  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PILOT COMPLETION COMMAND</Typography>
          <Typography variant="h3" fontWeight={950}>Launch Evidence & BIN Connect Conversion Desk</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.62)', maxWidth: 920, mt: 1 }}>Admin command layer for converting messages into work and keeping hard-launch proof honest before unrestricted public release.</Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label="Controlled pilot: ready for friends/team testing" sx={{ bgcolor: alpha(binThemeTokens.gold, .14), color: binThemeTokens.gold, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>This page does not mark production proof gates as passed. Each gate still requires evidence: screenshot/log ID, tester, device, role, date, and production URL.</Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {conversionItems.map(([title, body]) => (
          <Grid item xs={12} md={title === 'Feature request' ? 12 : 6} key={title}>
            <Paper sx={{ p: 3, borderRadius: 4, height: '100%', bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
              <Stack spacing={1.2}><GitPullRequest color={binThemeTokens.gold} /><Typography fontWeight={950}>{title}</Typography><Typography sx={{ color: 'rgba(255,255,255,.68)' }}>{body}</Typography><Button onClick={() => navigate('/ops/bin-connect')} sx={{ color: binThemeTokens.gold, alignSelf: 'flex-start', fontWeight: 950 }}>Open BIN Connect Inbox</Button></Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Hard-launch evidence checklist</Typography></Stack>
        <Grid container spacing={2}>{proofItems.map((item) => <Grid item xs={12} md={4} key={item}><Stack direction="row" spacing={1.2} alignItems="flex-start"><CheckCircle2 size={16} color={binThemeTokens.gold} /><Typography sx={{ color: '#fff', fontWeight: 850 }}>{item}</Typography></Stack></Grid>)}</Grid>
      </Paper>
    </Box>
  );
}

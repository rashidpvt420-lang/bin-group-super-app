import React from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { BarChart3, CheckCircle2, ClipboardCheck, MessageSquare, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../theme/binGroupTheme';
import { FRIENDS_PILOT_CHECKLIST, OWNER_ROI_FORMULA, PILOT_COMPLETION_PACK } from '../lib/pilotCompletionBlueprint';
import type { PilotRole } from '../lib/pilotCompletionBlueprint';

const roleTitles: Record<PilotRole, string> = {
  owner: 'Owner ROI, Trust & Approval Center',
  tenant: 'Tenant Simple Service Center',
  technician: 'Technician Field Proof Center',
  broker: 'Broker Growth & Commission Center',
  admin: 'Admin Pilot Completion Command',
};

const roleSubtitles: Record<PilotRole, string> = {
  owner: 'Spending thresholds, ROI report model, warranty ledger, move-in/out evidence, and cost-saved visibility.',
  tenant: 'Three-button service model, happiness score, repair warranty, and BIN Connect continuation.',
  technician: 'Mobile field proof, GPS check-in, one-tap execution, offline sync, and route discipline.',
  broker: 'Referral lifecycle, public referral-link plan, broker ranking, and commission payout proof.',
  admin: 'BIN Connect conversion desk, launch evidence, App Check, push, payment, and every-button proof planning.',
};

export default function PilotCompletionPage({ role, dark = false }: { role: PilotRole; dark?: boolean }) {
  const navigate = useNavigate();
  const items = PILOT_COMPLETION_PACK[role];
  const textColor = dark ? '#FFFFFF' : binThemeTokens.textPrimary;
  const muted = dark ? 'rgba(255,255,255,.62)' : binThemeTokens.textSecondary;
  const panel = dark ? 'rgba(255,255,255,.045)' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,.10)' : binThemeTokens.border;

  return (
    <Box sx={{ color: textColor }}>
      <Stack spacing={1.2} sx={{ mb: 4 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.goldHover, fontWeight: 950, letterSpacing: 3 }}>PILOT COMPLETION PACK</Typography>
        <Typography variant="h3" fontWeight={950}>{roleTitles[role]}</Typography>
        <Typography sx={{ color: muted, maxWidth: 980 }}>{roleSubtitles[role]}</Typography>
      </Stack>

      <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>
        These pages add the missing pilot-readiness layer. They do not mark hard public launch gates as passed; real proof still requires device logs, screenshots, tester, date, role, and production URL.
      </Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {items.map((item) => (
          <Grid item xs={12} md={role === 'admin' || role === 'technician' || role === 'broker' ? 6 : 4} key={item.title}>
            <Paper sx={{ p: 3, height: '100%', borderRadius: 4, bgcolor: panel, border: `1px solid ${border}`, boxShadow: dark ? 'none' : '0 16px 40px rgba(17,24,39,.05)' }}>
              <Stack spacing={1.4}>
                <ShieldCheck color={binThemeTokens.gold} size={24} />
                <Typography variant="h6" fontWeight={950}>{item.title}</Typography>
                <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75 }}>{item.purpose}</Typography>
                <Stack spacing={0.8}>
                  {item.nowAvailable.map((point) => (
                    <Stack direction="row" spacing={1} alignItems="flex-start" key={point}>
                      <CheckCircle2 size={16} color={binThemeTokens.gold} />
                      <Typography variant="body2" sx={{ color: textColor, fontWeight: 800 }}>{point}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Chip label={`Next proof: ${item.nextProof}`} sx={{ alignSelf: 'flex-start', bgcolor: alpha(binThemeTokens.gold, .12), color: binThemeTokens.goldHover, fontWeight: 900, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: .8 } }} />
              </Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {role === 'owner' && (
        <Paper sx={{ p: 3, borderRadius: 4, mb: 4, bgcolor: panel, border: `1px solid ${border}` }}>
          <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><BarChart3 color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Owner ROI formula</Typography></Stack>
          <Grid container spacing={2}>{OWNER_ROI_FORMULA.map((item) => <Grid item xs={12} sm={6} md={3} key={item}><Box sx={{ p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, .07), border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}><Typography fontWeight={900}>{item}</Typography></Box></Grid>)}</Grid>
        </Paper>
      )}

      {role === 'admin' && (
        <Paper sx={{ p: 3, borderRadius: 4, mb: 4, bgcolor: panel, border: `1px solid ${border}` }}>
          <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>Friends/team pilot checklist</Typography></Stack>
          <Grid container spacing={2}>{FRIENDS_PILOT_CHECKLIST.map((item) => <Grid item xs={12} md={6} key={item}><Stack direction="row" spacing={1.2} alignItems="flex-start"><CheckCircle2 size={16} color={binThemeTokens.gold} /><Typography sx={{ color: textColor, fontWeight: 850 }}>{item}</Typography></Stack></Grid>)}</Grid>
        </Paper>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <Button variant="contained" startIcon={<MessageSquare size={16} />} onClick={() => navigate(role === 'admin' ? '/ops/bin-connect' : `/${role}/bin-connect`)} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950 }}>Open BIN Connect</Button>
        {role === 'owner' && <Button variant="outlined" onClick={() => navigate('/owner/roi')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.goldHover, fontWeight: 950 }}>Open existing ROI page</Button>}
      </Stack>
    </Box>
  );
}

import React from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, ClipboardCheck, GitPullRequest, Rocket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

export default function PilotCompletionCommandPage() {
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();

  const conversionItems = [
    [t('admin.pilot_completion.conversion_maintenance_title'), t('admin.pilot_completion.conversion_maintenance_body')],
    [t('admin.pilot_completion.conversion_complaint_title'), t('admin.pilot_completion.conversion_complaint_body')],
    [t('admin.pilot_completion.conversion_rfq_title'), t('admin.pilot_completion.conversion_rfq_body')],
    [t('admin.pilot_completion.conversion_hr_title'), t('admin.pilot_completion.conversion_hr_body')],
    [t('admin.pilot_completion.conversion_feature_title'), t('admin.pilot_completion.conversion_feature_body')],
  ];

  const proofItems = [
    t('admin.pilot_completion.proof_firebase_auth'),
    t('admin.pilot_completion.proof_storage'),
    t('admin.pilot_completion.proof_functions_smoke'),
    t('admin.pilot_completion.proof_fcm_push'),
    t('admin.pilot_completion.proof_maps_gps'),
    t('admin.pilot_completion.proof_ai_signed_in'),
    t('admin.pilot_completion.proof_payment_activation'),
    t('admin.pilot_completion.proof_android_ios_pwa'),
    t('admin.pilot_completion.proof_mobile_pdf_download'),
    t('admin.pilot_completion.proof_arabic_rtl_sweep'),
    t('admin.pilot_completion.proof_every_button_audit'),
    t('admin.pilot_completion.proof_logout_test'),
  ];

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{t('admin.pilot_completion.eyebrow')}</Typography>
          <Typography variant="h3" fontWeight={950}>{t('admin.pilot_completion.page_title')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.62)', maxWidth: 920, mt: 1 }}>{t('admin.pilot_completion.page_desc')}</Typography>
        </Box>
        <Chip icon={<Rocket size={16} />} label={t('admin.pilot_completion.controlled_pilot_chip')} sx={{ bgcolor: alpha(binThemeTokens.gold, .14), color: binThemeTokens.gold, fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
      </Stack>

      <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>{t('admin.pilot_completion.proof_gate_warning')}</Alert>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {conversionItems.map(([title, body], index) => (
          <Grid item xs={12} md={index === conversionItems.length - 1 ? 12 : 6} key={title}>
            <Paper sx={{ p: 3, borderRadius: 4, height: '100%', bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
              <Stack spacing={1.2}><GitPullRequest color={binThemeTokens.gold} /><Typography fontWeight={950}>{title}</Typography><Typography sx={{ color: 'rgba(255,255,255,.68)' }}>{body}</Typography><Button onClick={() => navigate('/ops/bin-connect')} sx={{ color: binThemeTokens.gold, alignSelf: 'flex-start', fontWeight: 950 }}>{t('admin.pilot_completion.open_bin_connect_button')}</Button></Stack>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.045)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}>
        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950}>{t('admin.pilot_completion.checklist_title')}</Typography></Stack>
        <Grid container spacing={2}>{proofItems.map((item) => <Grid item xs={12} md={4} key={item}><Stack direction="row" spacing={1.2} alignItems="flex-start"><CheckCircle2 size={16} color={binThemeTokens.gold} /><Typography sx={{ color: '#fff', fontWeight: 850 }}>{item}</Typography></Stack></Grid>)}</Grid>
      </Paper>
    </Box>
  );
}

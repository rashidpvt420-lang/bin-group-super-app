import React from 'react';
import { Box, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowLeft, ArrowRight, Briefcase, Camera, AlertTriangle, Activity, CheckCircle2, Building2, Wrench, CreditCard, ShieldCheck, MapPin, Users } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';

type RoleKey = 'owner' | 'tenant' | 'technician' | 'broker';

interface JourneyStep {
  icon: React.ReactNode;
  labelKey: string;
  labelFallback: string;
}

const ROLE_STEPS: Record<RoleKey, JourneyStep[]> = {
  owner: [
    { icon: <Building2 size={16} />, labelKey: 'journey.owner.step1', labelFallback: 'Add Property' },
    { icon: <Wrench size={16} />, labelKey: 'journey.owner.step2', labelFallback: 'Choose Service' },
    { icon: <CreditCard size={16} />, labelKey: 'journey.owner.step3', labelFallback: 'Approve Payment' },
    { icon: <ShieldCheck size={16} />, labelKey: 'journey.owner.step4', labelFallback: 'Track Work & Proof' },
  ],
  tenant: [
    { icon: <AlertTriangle size={16} />, labelKey: 'journey.tenant.step1', labelFallback: 'Report Issue' },
    { icon: <Camera size={16} />, labelKey: 'journey.tenant.step2', labelFallback: 'Add Photo' },
    { icon: <Activity size={16} />, labelKey: 'journey.tenant.step3', labelFallback: 'Follow Status' },
    { icon: <CheckCircle2 size={16} />, labelKey: 'journey.tenant.step4', labelFallback: 'Approve or Dispute' },
  ],
  technician: [
    { icon: <Briefcase size={16} />, labelKey: 'journey.technician.step1', labelFallback: 'Accept Job' },
    { icon: <MapPin size={16} />, labelKey: 'journey.technician.step2', labelFallback: 'Go On Site' },
    { icon: <Camera size={16} />, labelKey: 'journey.technician.step3', labelFallback: 'Update & Upload Proof' },
    { icon: <CheckCircle2 size={16} />, labelKey: 'journey.technician.step4', labelFallback: 'Close Correctly' },
  ],
  broker: [
    { icon: <Users size={16} />, labelKey: 'journey.broker.step1', labelFallback: 'Submit Lead' },
    { icon: <Activity size={16} />, labelKey: 'journey.broker.step2', labelFallback: 'Track Approval' },
    { icon: <CreditCard size={16} />, labelKey: 'journey.broker.step3', labelFallback: 'Follow Commission' },
  ],
};

export default function RoleJourneyStrip({ role, dark = false }: { role: RoleKey; dark?: boolean }) {
  const { tx, isRTL } = useLanguage();
  const steps = ROLE_STEPS[role];
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;
  const labelColor = dark ? 'rgba(255,255,255,0.85)' : binThemeTokens.textPrimary;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, md: 2.25 },
        mb: 3,
        borderRadius: 3,
        border: `1px solid ${alpha(binThemeTokens.gold, dark ? 0.22 : 0.25)}`,
        bgcolor: dark ? 'rgba(15,23,42,0.72)' : alpha(binThemeTokens.gold, 0.045),
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <Typography
        variant="overline"
        sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2.5, display: 'block', mb: 1.5 }}
      >
        {tx('journey.title', 'How This Works For You')}
      </Typography>
      <Stack direction="row" flexWrap="wrap" alignItems="center" sx={{ gap: { xs: 1.5, md: 0.5 } }}>
        {steps.map((step, idx) => (
          <React.Fragment key={step.labelKey}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  bgcolor: binThemeTokens.gold,
                  color: '#111827',
                }}
              >
                {step.icon}
              </Box>
              <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', color: labelColor, whiteSpace: 'nowrap' }}>
                {tx(step.labelKey, step.labelFallback)}
              </Typography>
            </Stack>
            {idx < steps.length - 1 && (
              <Box sx={{ color: alpha(binThemeTokens.gold, 0.6), display: { xs: 'none', md: 'flex' }, px: { md: 1.5 } }}>
                <ArrowIcon size={15} />
              </Box>
            )}
          </React.Fragment>
        ))}
      </Stack>
    </Paper>
  );
}

import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, CircleDashed, RefreshCcw, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Readiness = {
  complete: boolean;
  progress: number;
  checks: Record<string, boolean>;
  blockers: string[];
  checkedAtMs: number;
};

const definitions: Record<string, [string, string]> = {
  identityVerified: ['Identity verified', 'الهوية موثقة'],
  phoneVerified: ['Mobile verified', 'الهاتف موثّق'],
  propertyProofApproved: ['Property proof approved', 'إثبات العقار معتمد'],
  locationApproved: ['Location approved', 'الموقع معتمد'],
  contractSigned: ['Contract signed', 'العقد موقّع'],
  depositReceived: ['15% deposit received', 'تم استلام دفعة 15٪'],
  adminApproved: ['Admin approval', 'اعتماد الإدارة'],
  dashboardUnlocked: ['Dashboard unlocked', 'لوحة التحكم مفتوحة'],
};

export default function OwnerProfileReadinessCard() {
  const { lang, isRTL } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [readiness, setReadiness] = React.useState<Readiness | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await httpsCallable(functions, 'getOwnerProfileReadiness')({});
      setReadiness(result.data as Readiness);
    } catch (loadError: any) {
      setError(loadError?.message || copy('Owner activation readiness could not be loaded.', 'تعذر تحميل جاهزية تفعيل المالك.'));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  React.useEffect(() => { void load(); }, [load]);

  return (
    <Paper data-testid="owner-profile-readiness" sx={{ p: { xs: 3, md: 4 }, mb: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><ShieldCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950} color="#FFF">{copy('Owner Activation Readiness', 'جاهزية تفعيل المالك')}</Typography></Stack>
          <Typography variant="body2" color="text.secondary" mt={0.5}>{copy('Server-verified identity, property, contract, payment and approval state.', 'حالة الهوية والعقار والعقد والدفع والاعتماد الموثقة من الخادم.')}</Typography>
        </Box>
        <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshCcw size={17} />} onClick={() => void load()} disabled={loading} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>{copy('Refresh', 'تحديث')}</Button>
      </Stack>
      {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
      {readiness && <>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" mt={3} mb={1}>
          <Typography fontWeight={900} color="#FFF">{readiness.complete ? copy('Fully activated', 'مفعّل بالكامل') : copy('Activation in progress', 'التفعيل قيد التنفيذ')}</Typography>
          <Typography fontWeight={950} color={binThemeTokens.gold}>{readiness.progress}%</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={readiness.progress} sx={{ height: 9, borderRadius: 99, mb: 3 }} />
        <Grid container spacing={1.5}>{Object.entries(definitions).map(([key, [en, ar]]) => { const ready = readiness.checks[key] === true; return <Grid item xs={12} sm={6} md={3} key={key}><Box sx={{ p: 1.7, height: '100%', borderRadius: 3, bgcolor: alpha(ready ? '#10b981' : '#f59e0b', 0.08), border: `1px solid ${alpha(ready ? '#10b981' : '#f59e0b', 0.28)}` }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">{ready ? <CheckCircle2 size={17} color="#10b981" /> : <CircleDashed size={17} color="#f59e0b" />}<Typography variant="body2" fontWeight={900} color="#FFF">{copy(en, ar)}</Typography></Stack><Chip size="small" label={ready ? copy('Complete', 'مكتمل') : copy('Pending', 'معلق')} color={ready ? 'success' : 'warning'} sx={{ mt: 1 }} /></Box></Grid>; })}</Grid>
      </>}
    </Paper>
  );
}

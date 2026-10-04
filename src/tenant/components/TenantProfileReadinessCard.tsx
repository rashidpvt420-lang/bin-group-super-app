import React from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, CircleDashed, RefreshCcw, ShieldCheck } from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { db } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ReadinessCheck = { key: string; en: string; ar: string; ready: boolean };

const normalizedStatus = (value: unknown) => String(value || '').trim().toUpperCase();
const approvedStatus = (value: unknown) => ['APPROVED', 'VERIFIED', 'COMPLETED'].includes(normalizedStatus(value));
const activeResidenceStatus = (value: unknown) => ['ACTIVE', 'OCCUPIED'].includes(normalizedStatus(value));

export default function TenantProfileReadinessCard() {
  const { user } = useRole();
  const { lang, isRTL } = useLanguage();
  const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
  const [checks, setChecks] = React.useState<ReadinessCheck[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError('');
    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const profile = userSnap.data() || {};
      const unitLookups = [
        getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid))),
        getDocs(query(collection(db, 'units'), where('tenantUid', '==', user.uid))),
        ...(user.email ? [getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())))] : []),
      ];
      const snapshots = await Promise.all(unitLookups);
      const units = new Map<string, any>();
      for (const snapshot of snapshots) for (const item of snapshot.docs) units.set(item.id, { id: item.id, ...item.data() });
      const residenceRecords = [...units.values()];
      const active = residenceRecords.filter((item) => activeResidenceStatus(item.leaseStatus || item.tenancyStatus || item.status));
      const leaseVerified = active.some((item) => (
        item.leaseVerified === true ||
        item.contractVerified === true ||
        approvedStatus(item.leaseReviewStatus || item.contractReviewStatus || item.leaseVerificationStatus)
      ));
      const unitApproved = active.some((item) => (
        item.unitLinkVerified === true ||
        item.adminApproved === true ||
        approvedStatus(item.unitLinkStatus || item.tenantLinkStatus || item.assignmentStatus)
      ));
      const moveInReady = active.some((item) => (
        item.moveInInspectionCompleted === true ||
        approvedStatus(item.moveInStatus || item.handoverStatus || item.moveInReviewStatus)
      ));
      const identityVerified = profile.identityVerified === true || profile.kycVerified === true || approvedStatus(profile.identityStatus || profile.kycStatus || profile.verificationStatus);
      const nextChecks: ReadinessCheck[] = [
        { key: 'email', en: 'Email verified', ar: 'البريد الإلكتروني موثّق', ready: Boolean(user.emailVerified) },
        { key: 'identity', en: 'Identity verified', ar: 'الهوية موثقة', ready: identityVerified },
        { key: 'residence', en: 'Active residence assigned', ar: 'تم تعيين سكن نشط', ready: active.length > 0 },
        { key: 'unit', en: 'Unit link approved', ar: 'ربط الوحدة معتمد', ready: unitApproved },
        { key: 'lease', en: 'Lease verified', ar: 'عقد الإيجار موثّق', ready: leaseVerified },
        { key: 'movein', en: 'Move-in evidence complete', ar: 'إثبات الدخول مكتمل', ready: moveInReady },
        { key: 'emergency', en: 'Emergency contact registered', ar: 'جهة اتصال الطوارئ مسجلة', ready: Boolean(profile.emergencyContact?.name && profile.emergencyContact?.phone) },
        { key: 'language', en: 'Language preference saved', ar: 'تم حفظ تفضيل اللغة', ready: ['en', 'ar'].includes(String(profile.language || profile.preferredLanguage || '')) },
      ];
      setChecks(nextChecks);
    } catch (loadError: any) {
      setError(loadError?.message || copy('Tenant readiness could not be loaded.', 'تعذر تحميل جاهزية المستأجر.'));
    } finally {
      setLoading(false);
    }
  }, [user?.uid, user?.email, user?.emailVerified, lang]);

  React.useEffect(() => { void load(); }, [load]);
  const completeCount = checks.filter((item) => item.ready).length;
  const progress = checks.length ? Math.round((completeCount / checks.length) * 100) : 0;

  return (
    <Paper data-testid="tenant-profile-readiness" sx={{ p: { xs: 3, md: 4 }, mb: 4, borderRadius: 6, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><ShieldCheck color={binThemeTokens.gold} /><Typography variant="h5" fontWeight={950} color="#FFF">{copy('Tenant Profile Readiness', 'جاهزية ملف المستأجر')}</Typography></Stack>
          <Typography variant="body2" color="text.secondary" mt={0.5}>{copy('Identity, residence, unit-link, lease and move-in readiness.', 'جاهزية الهوية والسكن وربط الوحدة وعقد الإيجار والدخول.')}</Typography>
        </Box>
        <Button startIcon={loading ? <CircularProgress size={16} /> : <RefreshCcw size={17} />} onClick={() => void load()} disabled={loading} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>{copy('Refresh', 'تحديث')}</Button>
      </Stack>
      {error && <Alert severity="warning" sx={{ mt: 2 }}>{error}</Alert>}
      {!!checks.length && <>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" mt={3} mb={1}><Typography color="#FFF" fontWeight={900}>{progress === 100 ? copy('Profile ready', 'الملف جاهز') : copy('Profile setup in progress', 'إعداد الملف قيد التنفيذ')}</Typography><Typography color={binThemeTokens.gold} fontWeight={950}>{progress}%</Typography></Stack>
        <LinearProgress variant="determinate" value={progress} sx={{ height: 9, borderRadius: 99, mb: 3 }} />
        <Grid container spacing={1.5}>{checks.map((item) => <Grid item xs={12} sm={6} md={3} key={item.key}><Box sx={{ p: 1.7, height: '100%', borderRadius: 3, bgcolor: alpha(item.ready ? '#10b981' : '#f59e0b', 0.08), border: `1px solid ${alpha(item.ready ? '#10b981' : '#f59e0b', 0.28)}` }}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">{item.ready ? <CheckCircle2 size={17} color="#10b981" /> : <CircleDashed size={17} color="#f59e0b" />}<Typography variant="body2" fontWeight={900} color="#FFF">{copy(item.en, item.ar)}</Typography></Stack><Chip size="small" label={item.ready ? copy('Complete', 'مكتمل') : copy('Pending', 'معلق')} color={item.ready ? 'success' : 'warning'} sx={{ mt: 1 }} /></Box></Grid>)}</Grid>
      </>}
    </Paper>
  );
}

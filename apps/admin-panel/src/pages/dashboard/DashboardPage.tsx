import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Activity, AlertTriangle, Building2, CheckCircle2, CreditCard, Gauge, Map, RefreshCw, Rocket, ShieldCheck, TicketCheck, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { collection, db, doc, getCountFromServer, getDoc, getDocs, limit, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

const launchGates = [
  { key: 'adminCredentialLogin', en: 'Admin credential login', ar: 'تسجيل دخول الإدارة' },
  { key: 'fiveProfileSmoke', en: 'Five-profile live workflow', ar: 'اختبار سير العمل للملفات الخمسة' },
  { key: 'stripeLiveMode', en: 'Stripe live payment', ar: 'دفع Stripe المباشر' },
  { key: 'appCheckProduction', en: 'App Check enforcement', ar: 'تفعيل App Check' },
  { key: 'brandedEmailSender', en: 'Branded email delivery', ar: 'إرسال البريد الرسمي' },
  { key: 'adminSecretRotation', en: 'Credential and secret rotation', ar: 'تغيير بيانات الدخول والأسرار' },
  { key: 'tenantNotificationDelivery', en: 'Tenant notification delivery', ar: 'توصيل إشعارات المستأجر' },
  { key: 'technicianGpsStorageProof', en: 'Technician GPS and evidence', ar: 'إثبات موقع الفني والمرفقات' },
  { key: 'brokerCommissionLock', en: 'Broker attribution and commission', ar: 'إسناد الوسيط والعمولة' },
  { key: 'renewalWatch', en: 'Renewal automation evidence', ar: 'إثبات أتمتة التجديد' },
] as const;

const actions = [
  { en: 'Owner Activation', ar: 'تفعيل المالك', route: '/owners', icon: Building2, enDescription: 'Onboarding, documents, payment, property and activation review.', arDescription: 'مراجعة التسجيل والمستندات والدفع والعقار والتفعيل.' },
  { en: 'SLA & Tickets', ar: 'الطلبات واتفاقية الخدمة', route: '/tickets', icon: Gauge, enDescription: 'Open workload, timers, dispatch state and breach risk.', arDescription: 'الطلبات المفتوحة والمؤقتات وحالة التوزيع ومخاطر التجاوز.' },
  { en: 'Payment Approvals', ar: 'موافقات الدفع', route: '/payments', icon: CreditCard, enDescription: 'Review manual proof and Stripe-paid records before unlocking owners.', arDescription: 'مراجعة الإثبات اليدوي ودفعات Stripe قبل فتح حساب المالك.' },
  { en: 'Emergency Command', ar: 'مركز الطوارئ', route: '/ops/emergency', icon: AlertTriangle, enDescription: 'SOS, critical incidents and immediate dispatch pressure.', arDescription: 'حالات الاستغاثة والحوادث الحرجة والتوزيع الفوري.' },
  { en: 'Technician Map', ar: 'خريطة الفنيين', route: '/technicians/map', icon: Map, enDescription: 'Coverage, duty status, location and assignment visibility.', arDescription: 'التغطية وحالة الدوام والموقع والمهام المسندة.' },
  { en: 'Broker Attribution', ar: 'إسناد الوسطاء', route: '/broker-attributions', icon: TicketCheck, enDescription: 'Prove source ownership before commission creation.', arDescription: 'إثبات مصدر الصفقة قبل إنشاء العمولة.' },
  { en: 'Community Operations', ar: 'عمليات المجتمع', route: '/tenant-services', icon: Users, enDescription: 'Tenant services, unit links and building operations.', arDescription: 'خدمات المستأجر وربط الوحدات وعمليات المبنى.' },
  { en: 'Public Launch Evidence', ar: 'أدلة الإطلاق العام', route: '/ops/public-launch-command', icon: Rocket, enDescription: 'Record and verify every hard-launch production gate.', arDescription: 'تسجيل والتحقق من كل بوابة للإطلاق العام.' },
] as const;

const PENDING_PAYMENT_STATUSES = [
  'pending', 'pending_admin_approval', 'submitted', 'PENDING', 'PENDING_VERIFICATION',
  'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION', 'REVIEW_REQUIRED',
];
const upper = (value: unknown) => String(value || '').trim().toUpperCase();

async function countPaymentsAwaitingAdmin() {
  const [pendingSnapshot, requiredSnapshot] = await Promise.all([
    getDocs(query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATUSES), limit(250))),
    getDocs(query(collection(db, 'payment_transactions'), where('adminApprovalRequired', '==', true), limit(250))),
  ]);
  const merged = new Map<string, any>();
  [...pendingSnapshot.docs, ...requiredSnapshot.docs].forEach((item) => merged.set(item.id, item.data()));
  return [...merged.values()].filter((payment) => {
    const status = upper(payment.status || payment.paymentStatus);
    return !['APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'].includes(status)
      && payment.dashboardUnlockApproved !== true
      && payment.adminApproved !== true;
  }).length;
}

type LaunchSummary = Record<string, unknown>;
type Metric = { key: string; en: string; ar: string; value: number | null; route: string; icon: React.ElementType };

const baseMetrics: Metric[] = [
  { key: 'owners', en: 'Owners', ar: 'الملاك', value: null, route: '/owners', icon: Building2 },
  { key: 'tenants', en: 'Tenants', ar: 'المستأجرون', value: null, route: '/tenants', icon: Users },
  { key: 'technicians', en: 'Technicians', ar: 'الفنيون', value: null, route: '/technicians', icon: Wrench },
  { key: 'brokers', en: 'Brokers', ar: 'الوسطاء', value: null, route: '/broker', icon: TicketCheck },
  { key: 'openTickets', en: 'Open Tickets', ar: 'الطلبات المفتوحة', value: null, route: '/tickets', icon: Activity },
  { key: 'pendingPayments', en: 'Payment Review', ar: 'مراجعة المدفوعات', value: null, route: '/payments', icon: CreditCard },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [metrics, setMetrics] = React.useState<Metric[]>(baseMetrics);
  const [launchSummary, setLaunchSummary] = React.useState<LaunchSummary>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [lastLoadedAt, setLastLoadedAt] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    const loaders: Record<string, () => Promise<number>> = {
      owners: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'owner')))).data().count,
      tenants: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'tenant')))).data().count,
      technicians: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'technician')))).data().count,
      brokers: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'broker')))).data().count,
      openTickets: async () => (await getCountFromServer(query(collection(db, 'maintenanceTickets'), where('status', 'in', ['OPEN', 'open', 'ASSIGNED', 'assigned', 'IN_PROGRESS', 'in_progress', 'emergency_submitted'])))).data().count,
      pendingPayments: countPaymentsAwaitingAdmin,
    };

    try {
      const resolved = await Promise.all(baseMetrics.map(async (metric) => {
        try { return { ...metric, value: await loaders[metric.key]() }; }
        catch (metricError) { console.warn(`Metric ${metric.key} failed`, metricError); return { ...metric, value: null }; }
      }));
      setMetrics(resolved);
      const launchDoc = await getDoc(doc(db, 'system_health', 'admin_summaries'));
      setLaunchSummary(launchDoc.exists() ? launchDoc.data() : {});
      setLastLoadedAt(new Date().toLocaleString(ar ? 'ar-AE' : 'en-AE'));
    } catch (loadError: any) {
      setError(loadError?.message || copy('Unable to load production admin evidence.', 'تعذر تحميل أدلة الإدارة من بيئة الإنتاج.'));
    } finally {
      setLoading(false);
    }
  }, [ar]);

  React.useEffect(() => { void load(); }, [load]);

  const passed = launchGates.filter((gate) => launchSummary[gate.key] === true).length;
  const publicReady = passed === launchGates.length;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3.5}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{copy('CANONICAL ADMIN COMMAND CENTER', 'مركز قيادة الإدارة الموحد')}</Typography>
            <Typography variant="h3" sx={{ fontWeight: 950, mt: 0.5 }}>{copy('Live Operations & Launch Control', 'العمليات المباشرة والتحكم في الإطلاق')}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>{copy('One admin dashboard for owners, tenants, technicians, brokers, payments, incidents and launch evidence.', 'لوحة إدارة واحدة للملاك والمستأجرين والفنيين والوسطاء والمدفوعات والحوادث وأدلة الإطلاق.')}</Typography>
          </Box>
          <Button onClick={load} disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />} variant="outlined" sx={{ borderColor: alpha(binThemeTokens.gold, 0.5), color: binThemeTokens.gold, fontWeight: 900 }}>{copy('Refresh', 'تحديث')}</Button>
        </Stack>

        <Alert severity={publicReady ? 'success' : 'warning'} icon={publicReady ? <ShieldCheck /> : <AlertTriangle />}>
          {publicReady ? copy('All ten hard-public-launch evidence gates are verified.', 'تم التحقق من بوابات الإطلاق العام العشر بالكامل.') : copy(`${passed}/${launchGates.length} hard-launch evidence gates verified. Unrestricted public launch remains NO-GO.`, `تم التحقق من ${passed}/${launchGates.length} من بوابات الإطلاق. الإطلاق العام غير المقيّد ما زال غير مسموح.`)}
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}

        <Grid container spacing={2}>{metrics.map((metric) => { const Icon = metric.icon; return <Grid item xs={12} sm={6} md={4} key={metric.key}><Card onClick={() => navigate(metric.route)} sx={{ cursor: 'pointer', height: '100%', bgcolor: 'rgba(15,23,42,0.94)', color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 4 }}><CardContent><Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center"><Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{copy(metric.en, metric.ar).toUpperCase()}</Typography><Typography variant="h3" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 0.5 }}>{loading && metric.value === null ? '—' : metric.value ?? '—'}</Typography></Box><Box sx={{ color: binThemeTokens.gold, p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Icon size={23} /></Box></Stack></CardContent></Card></Grid>; })}</Grid>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2, textAlign: isRTL ? 'right' : 'left' }}>{copy('Daily Command Actions', 'إجراءات القيادة اليومية')}</Typography>
          <Grid container spacing={2}>{actions.map((action) => { const Icon = action.icon; return <Grid item xs={12} sm={6} md={3} key={action.route}><Button fullWidth onClick={() => navigate(action.route)} sx={{ height: '100%', minHeight: 125, p: 2, justifyContent: 'flex-start', textAlign: isRTL ? 'right' : 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}><Stack alignItems={isRTL ? 'flex-end' : 'flex-start'} spacing={1}><Icon size={22} color={binThemeTokens.gold} /><Typography sx={{ fontWeight: 950 }}>{copy(action.en, action.ar)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>{copy(action.enDescription, action.arDescription)}</Typography></Stack></Button></Grid>; })}</Grid>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{copy('Hard-Launch Evidence', 'أدلة الإطلاق العام')}</Typography><Chip label={`${passed}/${launchGates.length} ${copy('PASS', 'مكتمل')}`} color={publicReady ? 'success' : 'warning'} sx={{ fontWeight: 950 }} /></Stack>
          <Grid container spacing={1.5}>{launchGates.map((gate) => { const ok = launchSummary[gate.key] === true; return <Grid item xs={12} sm={6} md={4} key={gate.key}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center" sx={{ p: 1.5, borderRadius: 3, bgcolor: ok ? alpha('#10b981', 0.08) : alpha('#f59e0b', 0.08), border: `1px solid ${ok ? alpha('#10b981', 0.22) : alpha('#f59e0b', 0.22)}` }}>{ok ? <CheckCircle2 size={18} color="#10b981" /> : <AlertTriangle size={18} color="#f59e0b" />}<Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="body2" sx={{ color: '#fff', fontWeight: 850 }}>{copy(gate.en, gate.ar)}</Typography><Typography variant="caption" sx={{ color: ok ? '#6ee7b7' : '#fcd34d', fontWeight: 900 }}>{ok ? copy('VERIFIED', 'تم التحقق') : copy('PENDING LIVE PROOF', 'بانتظار دليل مباشر')}</Typography></Box></Stack></Grid>; })}</Grid>
          {lastLoadedAt && <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.4)', mt: 2, textAlign: isRTL ? 'right' : 'left' }}>{copy('Last synced', 'آخر مزامنة')}: {lastLoadedAt}</Typography>}
        </Paper>
      </Stack>
    </Box>
  );
}

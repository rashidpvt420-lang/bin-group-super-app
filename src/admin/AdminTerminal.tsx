import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { signOut } from 'firebase/auth';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  FileCheck2,
  Home,
  LockKeyhole,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { auth, collection, db, doc, getCountFromServer, getDoc, getDocs, limit, orderBy, query, where } from '../lib/firebase';
import { useLanguage } from '@bin/shared';
import PortalSessionControls from '../components/PortalSessionControls';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';

const LEGACY_ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app';

 type Metric = {
  key: string;
  label: string;
  value: number | null;
  helper: string;
  icon: React.ElementType;
  severity?: 'success' | 'warning' | 'info';
};

type AuditEvent = {
  id: string;
  action: string;
  actorRole?: string;
  targetType?: string;
  createdAt?: unknown;
};

type LaunchSummary = Record<string, unknown>;

const baseMetrics: Metric[] = [
  { key: 'owners', label: 'Owners', value: null, helper: 'Registered owner profiles', icon: Building2, severity: 'success' },
  { key: 'tenants', label: 'Tenants', value: null, helper: 'Registered tenant profiles', icon: Users, severity: 'info' },
  { key: 'technicians', label: 'Technicians', value: null, helper: 'Field technician profiles', icon: Wrench, severity: 'info' },
  { key: 'brokers', label: 'Brokers', value: null, helper: 'Broker partner profiles', icon: Home, severity: 'info' },
  { key: 'openTickets', label: 'Open tickets', value: null, helper: 'Live maintenance workload', icon: ClipboardCheck, severity: 'warning' },
  { key: 'pendingPayments', label: 'Payment review', value: null, helper: 'Owner payments waiting for admin verification', icon: CreditCard, severity: 'warning' },
];

const launchGates = [
  { key: 'adminCredentialLogin', label: 'Admin production credential login' },
  { key: 'fiveProfileSmoke', label: 'Five-profile live workflow smoke test' },
  { key: 'stripeLiveMode', label: 'Stripe live payment mode' },
  { key: 'appCheckProduction', label: 'Firebase App Check production enforcement' },
  { key: 'brandedEmailSender', label: 'BIN GROUP branded email delivery' },
  { key: 'adminSecretRotation', label: 'Admin credential and secret rotation' },
  { key: 'tenantNotificationDelivery', label: 'Tenant notification delivery' },
  { key: 'technicianGpsStorageProof', label: 'Technician GPS and evidence upload' },
  { key: 'brokerCommissionLock', label: 'Broker attribution and commission lock' },
  { key: 'renewalWatch', label: 'Contract renewal watch and document queue' },
] as const;

const operationalRunbook = [
  { label: 'Build main app', command: 'npm run build' },
  { label: 'Build Cloud Functions', command: 'npm run build:functions' },
  { label: 'Rules + stability guard', command: 'npm run test:stability' },
  { label: 'Hard launch readiness', command: 'npm run test:hard-launch-readiness' },
  { label: 'Mobile store readiness', command: 'npm run test:mobile-store-readiness' },
];

const portalSmokeTests = [
  'Owner: onboarding → contract signature → payment proof → admin approval → dashboard unlock.',
  'Tenant: unit linked → maintenance request with photo → ticket tracking → completion review.',
  'Technician: open job → claim/accept → arrive → before/after proof → resolve.',
  'Broker: referral/lead submission → attribution proof → commission state visible.',
  'Admin: owner/payment/ticket/user visibility → approval/rejection → audit trail captured.',
];

const formatDate = (value: unknown) => {
  const raw: any = value;
  if (!raw) return 'not recorded';
  if (typeof raw?.toDate === 'function') return raw.toDate().toLocaleString('en-AE');
  if (typeof raw === 'string') return raw;
  return 'not recorded';
};

export default function AdminTerminal() {
  const { isRTL, lang, tx } = useLanguage();
  const [metrics, setMetrics] = React.useState<Metric[]>(baseMetrics);
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [launchSummary, setLaunchSummary] = React.useState<LaunchSummary>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = React.useState<string>('');

  const label = (key: string, fallback: string) => tx(key, fallback);

  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaders: Record<string, () => Promise<number>> = {
        owners: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'owner')))).data().count,
        tenants: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'tenant')))).data().count,
        technicians: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'technician')))).data().count,
        brokers: async () => (await getCountFromServer(query(collection(db, 'users'), where('role', '==', 'broker')))).data().count,
        openTickets: async () => (await getCountFromServer(query(collection(db, 'maintenanceTickets'), where('status', 'in', ['OPEN', 'open', 'ASSIGNED', 'assigned', 'IN_PROGRESS', 'in_progress', 'emergency_submitted'])))).data().count,
        pendingPayments: async () => (await getCountFromServer(query(collection(db, 'payment_transactions'), where('verificationState', '==', 'ADMIN_VERIFICATION_REQUIRED')))).data().count,
      };

      const resolved = await Promise.all(
        baseMetrics.map(async (metric) => {
          try {
            const value = await loaders[metric.key]();
            return { ...metric, value };
          } catch (metricError) {
            console.warn(`[ADMIN-COMMAND] Metric failed: ${metric.key}`, metricError);
            return { ...metric, value: null };
          }
        }),
      );
      setMetrics(resolved);

      try {
        const auditSnap = await getDocs(query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(6)));
        setEvents(auditSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<AuditEvent, 'id'>) })));
      } catch (auditError) {
        console.warn('[ADMIN-COMMAND] Audit log preview failed:', auditError);
        setEvents([]);
      }

      try {
        const healthSnap = await getDoc(doc(db, 'system_health', 'admin_summaries'));
        setLaunchSummary(healthSnap.exists() ? healthSnap.data() : {});
      } catch (healthError) {
        console.warn('[ADMIN-COMMAND] Launch evidence load failed:', healthError);
        setLaunchSummary({});
      }

      setLastLoadedAt(new Date().toLocaleString('en-AE'));
    } catch (err: any) {
      console.error('[ADMIN-COMMAND] Dashboard load failed:', err);
      setError(err?.message || 'Unable to load admin command center metrics.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const passedLaunchGates = launchGates.filter((gate) => launchSummary[gate.key] === true).length;
  const allLaunchGatesPassed = passedLaunchGates === launchGates.length;

  const resetAndLogin = async () => {
    try {
      await signOut(auth);
    } catch {
      // Continue with local reset.
    }
    try {
      const currentLang = localStorage.getItem('bin_language');
      const activeOnboarding = localStorage.getItem('bin-group-onboarding-v3');
      localStorage.clear();
      sessionStorage.clear();
      if (currentLang) localStorage.setItem('bin_language', currentLang);
      if (activeOnboarding) localStorage.setItem('bin-group-onboarding-v3', activeOnboarding);
    } catch {
      // Ignore storage failures and continue navigation.
    }
    window.location.href = '/login?intendedRole=admin&returnTo=%2Fadmin%2Fdashboard';
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#020617',
        color: '#FFFFFF',
        p: { xs: 2, md: 4 },
        direction: isRTL ? 'rtl' : 'ltr',
        backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(201,166,70,0.18), transparent 42%)',
      }}
    >
      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 4 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1.5}>
          <Box sx={{ width: 46, height: 46, borderRadius: 3, bgcolor: '#C9A646', color: '#111827', display: 'grid', placeItems: 'center' }}>
            <SafeIcon icon={ShieldCheck} size={24} />
          </Box>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: '#E5C86B', fontWeight: 950, letterSpacing: 3 }}>
              BIN GROUP ADMIN
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: -0.8 }}>
              {label('admin.command.title', 'Unified Command Center')}
            </Typography>
          </Box>
        </Stack>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
          <Button onClick={loadDashboard} disabled={loading} startIcon={renderSafeIcon(RefreshCcw, { size: 16 })} sx={{ color: '#E5C86B', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 900 }}>
            {loading ? 'Syncing' : 'Refresh'}
          </Button>
          <PortalSessionControls role="admin" dark accent="#C9A646" />
        </Stack>
      </Stack>

      <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 3, bgcolor: 'rgba(59,130,246,0.10)', color: '#BFDBFE', border: '1px solid rgba(59,130,246,0.30)', '& .MuiAlert-icon': { color: '#60A5FA' } }}>
        The canonical admin route is <strong>/admin/dashboard</strong>. Public-launch readiness below is evidence-backed and is not inferred from the page rendering successfully.
      </Alert>

      {!loading && (
        <Alert severity={allLaunchGatesPassed ? 'success' : 'warning'} sx={{ mb: 3, bgcolor: allLaunchGatesPassed ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: allLaunchGatesPassed ? '#BBF7D0' : '#FDE68A', border: `1px solid ${allLaunchGatesPassed ? 'rgba(34,197,94,0.30)' : 'rgba(245,158,11,0.30)'}` }}>
          {allLaunchGatesPassed
            ? 'All ten public-launch evidence gates are recorded as PASS.'
            : `${passedLaunchGates} of ${launchGates.length} public-launch evidence gates are proven. The correct launch decision is NO-GO until all ten are verified live.`}
        </Alert>
      )}

      {error && (
        <Alert severity="warning" sx={{ mb: 3, bgcolor: 'rgba(245,158,11,0.10)', color: '#FDE68A', border: '1px solid rgba(245,158,11,0.28)' }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {metrics.map((metric) => (
          <Grid item xs={12} sm={6} md={4} key={metric.key}>
            <Card sx={{ height: '100%', bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.4 }}>{metric.label}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 950, color: '#E5C86B', my: 1 }}>
                      {loading && metric.value === null ? <CircularProgress size={26} sx={{ color: '#E5C86B' }} /> : metric.value ?? '—'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700 }}>{metric.helper}</Typography>
                  </Box>
                  <Box sx={{ width: 42, height: 42, borderRadius: 3, bgcolor: 'rgba(201,166,70,0.10)', display: 'grid', placeItems: 'center', color: '#E5C86B' }}>
                    <SafeIcon icon={metric.icon} size={21} />
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: '#E5C86B' }}>Public-Launch Evidence Gates</Typography>
                <Chip
                  label={loading ? 'SYNCING' : allLaunchGatesPassed ? 'PUBLIC READY' : `${passedLaunchGates}/${launchGates.length} PASS`}
                  sx={{ bgcolor: allLaunchGatesPassed ? 'rgba(34,197,94,0.14)' : 'rgba(245,158,11,0.14)', color: allLaunchGatesPassed ? '#86EFAC' : '#FDE68A', fontWeight: 950 }}
                />
              </Stack>
              <Stack spacing={1.25}>
                {launchGates.map((gate) => {
                  const passed = launchSummary[gate.key] === true;
                  const evidence = launchSummary[`${gate.key}Evidence`];
                  const verifiedAt = launchSummary[`${gate.key}VerifiedAt`];
                  return (
                    <Box key={gate.key} sx={{ p: 1.4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${passed ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.18)'}` }}>
                      <Stack direction="row" spacing={1.2} alignItems="flex-start">
                        {passed ? <CheckCircle2 size={18} color="#4ADE80" style={{ marginTop: 2, flexShrink: 0 }} /> : <AlertTriangle size={18} color="#F59E0B" style={{ marginTop: 2, flexShrink: 0 }} />}
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>{gate.label}</Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: passed ? '#86EFAC' : '#FDE68A', fontWeight: 900 }}>
                            {passed ? `PASS · ${formatDate(verifiedAt)}` : 'PENDING · no accepted live proof'}
                          </Typography>
                          {evidence ? <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.52)', overflowWrap: 'anywhere' }}>{String(evidence)}</Typography> : null}
                        </Box>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
              <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />
              <Typography variant="subtitle2" sx={{ color: '#E5C86B', fontWeight: 950, mb: 1.5 }}>Five-profile smoke test sequence</Typography>
              <Stack spacing={1}>
                {portalSmokeTests.map((test) => (
                  <Typography key={test} variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 700 }}>• {test}</Typography>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack spacing={2.5}>
            <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 950, color: '#E5C86B', mb: 2 }}>Verification Runbook</Typography>
                <Stack spacing={1.25}>
                  {operationalRunbook.map((item) => (
                    <Box key={item.command} sx={{ p: 1.4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.54)', fontWeight: 900 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: '#E5C86B', fontFamily: 'monospace', fontWeight: 900 }}>{item.command}</Typography>
                    </Box>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card sx={{ bgcolor: 'rgba(15, 23, 42, 0.94)', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#fff' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 950, color: '#E5C86B' }}>Recent Audit Trail</Typography>
                  <SafeIcon icon={Activity} size={18} />
                </Stack>
                {events.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700 }}>
                    No audit preview loaded. This may mean no audit documents exist yet, or Firestore denied the preview query.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {events.map((event) => (
                      <Box key={event.id} sx={{ p: 1.4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)' }}>
                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 900 }}>{event.action || 'AUDIT_EVENT'}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.54)', fontWeight: 700 }}>
                          {event.actorRole || 'actor'} · {event.targetType || 'target'} · {formatDate(event.createdAt)}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                )}
                {lastLoadedAt && <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'rgba(255,255,255,0.38)', fontWeight: 800 }}>Last synced: {lastLoadedAt}</Typography>}
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} sx={{ mt: 3 }}>
        <Button href="/analytics/reporting" startIcon={renderSafeIcon(BarChart3, { size: 17 })} sx={{ color: '#111827', bgcolor: '#C9A646', fontWeight: 950, '&:hover': { bgcolor: '#E5C86B' } }}>
          Reporting
        </Button>
        <Button href="/notifications" startIcon={renderSafeIcon(Bell, { size: 17 })} sx={{ color: '#E5C86B', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>
          Notifications
        </Button>
        <Button href="/verify" startIcon={renderSafeIcon(FileCheck2, { size: 17 })} sx={{ color: '#E5C86B', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>
          Public Verification
        </Button>
        <Button href="/security" startIcon={renderSafeIcon(LockKeyhole, { size: 17 })} sx={{ color: '#E5C86B', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>
          Trust & Security
        </Button>
        <Button href={LEGACY_ADMIN_PANEL_URL} target="_blank" rel="noreferrer" startIcon={renderSafeIcon(ExternalLink, { size: 17 })} sx={{ color: 'rgba(255,255,255,0.64)', border: '1px solid rgba(255,255,255,0.18)', fontWeight: 900 }}>
          Legacy panel
        </Button>
        <Button onClick={resetAndLogin} startIcon={renderSafeIcon(LogOut, { size: 17 })} sx={{ color: '#FCA5A5', border: '1px solid rgba(239,68,68,0.45)', fontWeight: 900 }}>
          Reset session
        </Button>
      </Stack>

      <Typography variant="caption" sx={{ display: 'block', mt: 4, color: 'rgba(255,255,255,0.42)', fontWeight: 800, textAlign: 'center' }}>
        {lang === 'ar' ? 'مركز التحكم الداخلي' : 'In-app admin command center'} · /admin/dashboard
      </Typography>
    </Box>
  );
}

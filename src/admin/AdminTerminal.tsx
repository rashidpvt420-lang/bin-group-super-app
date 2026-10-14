import React from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import { multiFactor, signOut } from 'firebase/auth';
import {
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  Gauge,
  Home,
  LockKeyhole,
  LogOut,
  Map,
  RefreshCcw,
  ShieldCheck,
  TicketCheck,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, collection, db, getCountFromServer, getDocs, limit, orderBy, query, where } from '../lib/firebase';
import { PHASE1_PAYMENT_POLICY, normalizeCommitSha, useLanguage } from '@bin/shared';
import PortalSessionControls from '../components/PortalSessionControls';
import SafeIcon, { renderSafeIcon } from '../components/SafeIcon';
import { CANONICAL_SLA_POLICY } from '../config/uaeDominationBlueprint';

const ADMIN_OPERATIONS_CONSOLE_URL = 'https://bin-group-admin-panel.web.app';
const RELEASE_SHA = normalizeCommitSha(import.meta.env.VITE_RELEASE_COMMIT_SHA);

const commandActions = [
  { label: 'Owner activation', helper: 'Approve owners, properties and onboarding evidence.', path: '/owners', icon: Building2 },
  { label: 'Payment approvals', helper: 'Verify Phase 1 Cash/Cheque proof before account activation.', path: '/payments', icon: CreditCard },
  { label: 'Live dispatch', helper: 'Control technician workload and urgent tickets.', path: '/control-center', icon: Map },
  { label: 'Tenant operations', helper: 'Review tenants, units, requests and corrections.', path: '/tenants', icon: Users },
  { label: 'Broker attribution', helper: 'Review leads, source proof and commission state.', path: '/broker', icon: TicketCheck },
  { label: 'Launch control', helper: 'Open the exact-SHA launch evidence authority. This page never declares public readiness.', path: '/ops/public-launch-command', icon: ShieldCheck },
] as const;

type Metric = {
  key: string;
  label: string;
  value: number | null;
  helper: string;
  icon: React.ElementType;
};

type AuditEvent = {
  id: string;
  action: string;
  actorRole?: string;
  targetType?: string;
  createdAt?: unknown;
};

type CoverageCard = {
  key: string;
  label: string;
  value: string;
  helper: string;
  source: string;
  icon: React.ElementType;
  status: 'live' | 'proof-required' | 'software-map' | 'authoritative-handoff';
};

const baseMetrics: Metric[] = [
  { key: 'owners', label: 'Owners', value: null, helper: 'Registered owner profiles', icon: Building2 },
  { key: 'tenants', label: 'Tenants', value: null, helper: 'Registered tenant profiles', icon: Users },
  { key: 'technicians', label: 'Technicians', value: null, helper: 'Field technician profiles', icon: Wrench },
  { key: 'brokers', label: 'Brokers', value: null, helper: 'Broker partner profiles', icon: Home },
  { key: 'openTickets', label: 'Open tickets', value: null, helper: 'Live maintenance workload', icon: ClipboardCheck },
  { key: 'pendingPayments', label: 'Payment review', value: null, helper: 'Cash/Cheque evidence waiting for admin verification', icon: CreditCard },
];

const operationalRunbook = [
  { label: 'Build main app', command: 'npm run build' },
  { label: 'Build Cloud Functions', command: 'npm run build:functions' },
  { label: 'Rules + stability guard', command: 'npm run test:stability' },
  { label: 'Route consolidation guard', command: 'npm run test:route-consolidation' },
  { label: 'Hard launch readiness', command: 'npm run test:hard-launch-readiness' },
  { label: 'Mobile store readiness', command: 'npm run test:mobile-store-readiness' },
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = React.useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();
  const showingProfile = location.pathname.endsWith('/profile');

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
            return { ...metric, value: await loaders[metric.key]() };
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

  const metricValue = React.useCallback((key: string) => metrics.find((metric) => metric.key === key)?.value ?? null, [metrics]);
  const coverageCards: CoverageCard[] = [
    { key: 'owners', label: 'Owner activation', value: String(metricValue('owners') ?? '—'), helper: 'Owner profiles, properties, contracts, Cash/Cheque proof, dashboard unlock.', source: label('admin.coverage.source.owners', 'Source: registered owner accounts'), icon: Building2, status: 'live' },
    { key: 'tenants', label: 'Tenant operations', value: String(metricValue('tenants') ?? '—'), helper: 'Linked units, tickets, documents, payments, notices, and renewal workflow.', source: label('admin.coverage.source.tenants', 'Source: registered tenant accounts'), icon: Users, status: 'live' },
    { key: 'technicians', label: 'Technician dispatch', value: String(metricValue('technicians') ?? '—'), helper: 'Jobs, map, offline queue, proof readiness, HR, and closure evidence.', source: label('admin.coverage.source.technicians', 'Source: registered technician accounts'), icon: Wrench, status: 'live' },
    { key: 'brokers', label: 'Broker attribution', value: String(metricValue('brokers') ?? '—'), helper: 'Leads, referrals, attribution proof, commissions, documents, and profile.', source: label('admin.coverage.source.brokers', 'Source: registered broker accounts'), icon: TicketCheck, status: 'live' },
    { key: 'tickets', label: 'Open SLA load', value: String(metricValue('openTickets') ?? '—'), helper: 'Shared maintenance workload across tenant, technician, owner, and admin views.', source: label('admin.coverage.source.tickets', 'Source: open maintenance tickets'), icon: Gauge, status: 'live' },
    { key: 'payments', label: 'Payment review', value: String(metricValue('pendingPayments') ?? '—'), helper: PHASE1_PAYMENT_POLICY.policyText, source: label('admin.coverage.source.payments', 'Source: payments waiting for verification'), icon: CreditCard, status: 'live' },
    { key: 'launch', label: 'Launch authority', value: RELEASE_SHA ? label('admin.coverage.launch.linked', 'Release linked') : label('admin.coverage.launch.unlinked', 'Not linked'), helper: 'Public readiness exists only in the protected exact-SHA Launch Command Center. This operational dashboard cannot issue a public-launch clearance.', source: RELEASE_SHA ? `${label('admin.coverage.source.launch', 'Source: Launch Command Center')} · ${RELEASE_SHA.slice(0, 8)}` : label('admin.coverage.source.launchMissing', 'Source: Launch Command Center · release not set on this build'), icon: ShieldCheck, status: 'authoritative-handoff' },
    { key: 'routes', label: 'Route consolidation', value: '1 app', helper: label('admin.coverage.routes.helper', 'Every role uses this one app. The older owner and admin apps only hand off to it.'), source: label('admin.coverage.source.routes', 'Source: automated route check'), icon: Map, status: 'software-map' },
  ];

  const resetAndLogin = async () => {
    try {
      await signOut(auth);
    } catch {
      // Continue with local reset.
    }
    try {
      const currentLang = localStorage.getItem('bin_language');
      localStorage.clear();
      sessionStorage.clear();
      if (currentLang) localStorage.setItem('bin_language', currentLang);
    } catch {
      // Ignore storage failures and continue navigation.
    }
    window.location.href = '/login?intendedRole=admin&returnTo=%2Fadmin%2Fdashboard';
  };

  const openOperationsTool = (path: string) => {
    window.location.assign(`${ADMIN_OPERATIONS_CONSOLE_URL}${path}`);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#F8F9FB', color: '#111827', p: { xs: 2, md: 4 }, direction: isRTL ? 'rtl' : 'ltr', backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(201,166,70,0.18), transparent 42%)' }}>
      <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 4 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} alignItems="center" spacing={1.5}>
          <Box sx={{ width: 46, height: 46, borderRadius: 3, bgcolor: '#C9A646', color: '#111827', display: 'grid', placeItems: 'center' }}><SafeIcon icon={ShieldCheck} size={24} /></Box>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 950, letterSpacing: 3 }}>BIN GROUP ADMIN</Typography>
            <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: -0.8 }}>{label('admin.command.title', 'Unified Command Center')}</Typography>
          </Box>
        </Stack>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
          <Button onClick={loadDashboard} disabled={loading} startIcon={renderSafeIcon(RefreshCcw, { size: 16 })} sx={{ color: '#7A5C12', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 900 }}>{loading ? 'Syncing' : 'Refresh'}</Button>
          <Button onClick={() => navigate(showingProfile ? '/admin/dashboard' : '/admin/profile')} startIcon={renderSafeIcon(UserRound, { size: 17 })} aria-label={showingProfile ? 'Return to Admin dashboard' : 'Open Admin profile and security'} sx={{ color: '#111827', border: '1px solid #E5E7EB', fontWeight: 900 }}>{showingProfile ? 'Command Center' : (auth.currentUser?.displayName || 'Admin Profile')}</Button>
          <PortalSessionControls role="admin" accent="#7A5C12" />
        </Stack>
      </Stack>

      <Alert severity={RELEASE_SHA ? 'info' : 'warning'} sx={{ mb: 3, bgcolor: 'rgba(59,130,246,0.10)', color: '#1E40AF', border: '1px solid rgba(59,130,246,0.30)' }}>
        Operational dashboard only. Release SHA: <strong>{RELEASE_SHA || 'UNAVAILABLE'}</strong>. Public launch decisions are calculated only in the dedicated Launch Command Center from exact-SHA, evidence-layer-qualified records.
      </Alert>

      <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(201,166,70,0.08)', color: '#7A5C12', border: '1px solid rgba(201,166,70,0.28)' }}>
        <strong>{PHASE1_PAYMENT_POLICY.policyText}</strong>
      </Alert>

      {showingProfile ? (
        <Card sx={{ mb: 3, bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.32)', borderRadius: 4, color: '#111827' }}>
          <CardContent>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
              <Stack direction="row" spacing={2} alignItems="center">
                <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: '#C9A646', color: '#111827', display: 'grid', placeItems: 'center' }}><SafeIcon icon={UserRound} size={30} /></Box>
                <Box>
                  <Typography variant="overline" sx={{ color: '#7A5C12', fontWeight: 950, letterSpacing: 2 }}>ADMIN IDENTITY & SECURITY</Typography>
                  <Typography variant="h5" sx={{ fontWeight: 950 }}>{auth.currentUser?.displayName || 'BIN GROUP Administrator'}</Typography>
                  <Typography sx={{ color: '#4B5563' }}>{auth.currentUser?.email || 'Authenticated Admin'}</Typography>
                </Box>
              </Stack>
              <Stack spacing={1} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
                <Chip label={auth.currentUser?.emailVerified ? 'Email verified' : 'Email verification required'} color={auth.currentUser?.emailVerified ? 'success' : 'warning'} sx={{ fontWeight: 900 }} />
                <Chip label={`${auth.currentUser ? multiFactor(auth.currentUser).enrolledFactors.length : 0} MFA factor(s) enrolled`} color={auth.currentUser && multiFactor(auth.currentUser).enrolledFactors.length > 0 ? 'success' : 'warning'} sx={{ fontWeight: 900 }} />
              </Stack>
            </Stack>
            <Alert severity="info" sx={{ mt: 3 }}>Daily command access belongs to this signed-in Admin. Emergency account recovery remains a protected two-person approval process.</Alert>
          </CardContent>
        </Card>
      ) : (
        <>
          {!loading && (
            <Alert severity={(metricValue('openTickets') || 0) > 0 || (metricValue('pendingPayments') || 0) > 0 ? 'warning' : 'success'} sx={{ mb: 3, bgcolor: 'rgba(201,166,70,0.08)', color: '#7A5C12', border: '1px solid rgba(201,166,70,0.28)' }}>
              <Typography sx={{ fontWeight: 950 }}>Next Admin action</Typography>
              <Typography variant="body2" sx={{ color: '#374151' }}>
                {(metricValue('openTickets') || 0) > 0
                  ? `${metricValue('openTickets')} open ticket(s) require operations ownership before lower-priority administration.`
                  : (metricValue('pendingPayments') || 0) > 0
                    ? `${metricValue('pendingPayments')} Cash/Cheque payment review(s) are waiting for evidence-based approval or rejection.`
                    : 'No open ticket or payment-review count is currently reported. Continue with owner activation and audit review.'}
              </Typography>
            </Alert>
          )}
          <Card sx={{ mb: 3, bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.30)', borderRadius: 4, color: '#111827' }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: '#7A5C12', fontWeight: 950 }}>Main Admin Actions</Typography>
              <Typography variant="body2" sx={{ color: '#4B5563', mb: 2 }}>Start and control daily operations here.</Typography>
              <Grid container spacing={2}>
                {commandActions.map((action) => (
                  <Grid item xs={12} sm={6} md={4} key={action.label}>
                    <Button fullWidth onClick={() => openOperationsTool(action.path)} startIcon={renderSafeIcon(action.icon, { size: 20 })} sx={{ minHeight: 112, p: 2, justifyContent: 'flex-start', textAlign: 'left', alignItems: 'flex-start', color: '#111827', bgcolor: '#F8F9FB', border: '1px solid rgba(201,166,70,0.20)', borderRadius: 3, '&:hover': { bgcolor: 'rgba(201,166,70,0.10)', borderColor: '#C9A646' } }}>
                      <Box><Typography sx={{ fontWeight: 950 }}>{action.label}</Typography><Typography variant="caption" sx={{ color: '#4B5563', textTransform: 'none' }}>{action.helper}</Typography></Box>
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </>
      )}

      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        {metrics.map((metric) => (
          <Grid item xs={12} sm={6} md={4} key={metric.key}>
            <Card sx={{ height: '100%', bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
              <CardContent>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#4B5563', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.4 }}>{metric.label}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 950, color: '#7A5C12', my: 1 }}>{loading && metric.value === null ? <CircularProgress size={26} sx={{ color: '#7A5C12' }} /> : metric.value ?? '—'}</Typography>
                    <Typography variant="body2" sx={{ color: '#4B5563', fontWeight: 700 }}>{metric.helper}</Typography>
                  </Box>
                  <Box sx={{ width: 42, height: 42, borderRadius: 3, bgcolor: 'rgba(201,166,70,0.10)', display: 'grid', placeItems: 'center', color: '#7A5C12' }}><SafeIcon icon={metric.icon} size={21} /></Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card sx={{ mb: 3, bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="h6" sx={{ fontWeight: 950, color: '#7A5C12' }}>Canonical Admin Coverage</Typography><Typography variant="body2" sx={{ color: '#4B5563', mt: 0.5 }}>Operational truth here; release truth is delegated to the exact-SHA Launch Command Center.</Typography></Box>
            <Chip label={label('admin.coverage.chip', 'Single command center')} sx={{ bgcolor: 'rgba(201,166,70,0.14)', color: '#7A5C12', fontWeight: 950, alignSelf: { xs: 'flex-start', md: 'center' } }} />
          </Stack>
          <Grid container spacing={2}>
            {coverageCards.map((item) => (
              <Grid item xs={12} sm={6} md={3} key={item.key}>
                <Box sx={{ height: '100%', p: 1.6, borderRadius: 3, bgcolor: '#F8F9FB', border: '1px solid #E5E7EB' }}>
                  <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}><Box sx={{ width: 34, height: 34, borderRadius: 2, display: 'grid', placeItems: 'center', bgcolor: 'rgba(201,166,70,0.10)', color: '#7A5C12' }}><SafeIcon icon={item.icon} size={18} /></Box><Box sx={{ minWidth: 0 }}><Typography variant="body2" sx={{ color: '#111827', fontWeight: 950 }}>{item.label}</Typography><Typography variant="caption" sx={{ color: item.status === 'proof-required' ? '#92400E' : '#166534', fontWeight: 900 }}>{item.status.replace('-', ' ').toUpperCase()}</Typography></Box></Stack>
                  <Typography variant="h4" sx={{ color: '#7A5C12', fontWeight: 950 }}>{item.value}</Typography>
                  <Typography variant="body2" sx={{ color: '#4B5563', fontWeight: 700, mt: 0.6 }}>{item.helper}</Typography>
                  <Typography variant="caption" sx={{ color: '#6B7280', fontWeight: 800, overflowWrap: 'anywhere' }}>{item.source}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={7}>
          <Card sx={{ height: '100%', bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" sx={{ fontWeight: 950, color: '#7A5C12' }}>Public Launch Authority</Typography><Chip label={label('admin.launch.handoffChip', 'Handled in Launch Command Center')} sx={{ bgcolor: 'rgba(245,158,11,0.14)', color: '#92400E', fontWeight: 950 }} /></Stack>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This operational dashboard intentionally does not calculate or cache a public-launch PASS/NO-GO result. Open the protected Launch Command Center, which requires PASSED evidence, exact release SHA matching, and the required hosted/physical-device evidence layer. Waivers do not count as hard-public-launch passes.
              </Alert>
              <Button fullWidth variant="contained" onClick={() => openOperationsTool('/ops/public-launch-command')} startIcon={renderSafeIcon(ShieldCheck, { size: 18 })} sx={{ bgcolor: '#C9A646', color: '#111827', fontWeight: 950, mb: 2 }}>Open exact-SHA Launch Command Center</Button>
              <Typography variant="body2" sx={{ color: '#4B5563' }}>Phase 1 payment authority: <strong>{PHASE1_PAYMENT_POLICY.approvedMethods.join(' + ')}</strong>. Bank Transfer and Stripe/Card are disabled.</Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Stack spacing={2.5}>
            <Card sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
              <CardContent><Typography variant="h6" sx={{ fontWeight: 950, color: '#7A5C12', mb: 2 }}>Verification Runbook</Typography><Stack spacing={1.25}>{operationalRunbook.map((item) => <Box key={item.command} sx={{ p: 1.4, borderRadius: 2, bgcolor: '#F8F9FB', border: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="caption" sx={{ color: '#4B5563', fontWeight: 900 }}>{item.label}</Typography><Typography variant="body2" sx={{ color: '#7A5C12', fontFamily: 'monospace', fontWeight: 900 }}>{item.command}</Typography></Box>)}</Stack></CardContent>
            </Card>

            <Card sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
              <CardContent><Typography variant="h6" sx={{ fontWeight: 950, color: '#7A5C12', mb: 2 }}>Canonical SLA Policy</Typography><Stack spacing={1}>{Object.entries(CANONICAL_SLA_POLICY).map(([priority, policy]) => <Box key={priority} sx={{ p: 1.25, borderRadius: 2, bgcolor: '#F8F9FB', border: '1px solid rgba(255,255,255,0.06)' }}><Stack direction="row" justifyContent="space-between" spacing={2}><Typography variant="body2" sx={{ color: '#111827', fontWeight: 950 }}>{policy.label}</Typography><Typography variant="body2" sx={{ color: '#7A5C12', fontWeight: 950 }}>{policy.minutes}m</Typography></Stack><Typography variant="caption" sx={{ color: '#4B5563' }}>{policy.adminEscalationCopy}</Typography></Box>)}</Stack></CardContent>
            </Card>

            <Card sx={{ bgcolor: '#FFFFFF', border: '1px solid rgba(201,166,70,0.22)', borderRadius: 4, color: '#111827' }}>
              <CardContent><Typography variant="h6" sx={{ fontWeight: 950, color: '#7A5C12', mb: 2 }}>Recent Audit Trail</Typography>{events.length === 0 ? <Typography variant="body2" sx={{ color: '#4B5563' }}>No audit preview loaded. This may mean no audit documents exist yet, or Firestore denied the preview query.</Typography> : <Stack spacing={1}>{events.map((event) => <Box key={event.id} sx={{ p: 1.4, borderRadius: 2, bgcolor: '#F8F9FB' }}><Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>{event.action || 'AUDIT_EVENT'}</Typography><Typography variant="caption" sx={{ color: '#4B5563', fontWeight: 700 }}>{event.actorRole || 'actor'} · {event.targetType || 'target'} · {formatDate(event.createdAt)}</Typography></Box>)}</Stack>}{lastLoadedAt && <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#6B7280', fontWeight: 800 }}>Last synced: {lastLoadedAt}</Typography>}</CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>

      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={1.5} sx={{ mt: 3 }}>
        <Button href="/analytics/reporting" startIcon={renderSafeIcon(BarChart3, { size: 17 })} sx={{ color: '#111827', bgcolor: '#C9A646', fontWeight: 950, '&:hover': { bgcolor: '#7A5C12' } }}>Reporting</Button>
        <Button href="/notifications" startIcon={renderSafeIcon(Bell, { size: 17 })} sx={{ color: '#7A5C12', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>Notifications</Button>
        <Button href="/verify" startIcon={renderSafeIcon(FileCheck2, { size: 17 })} sx={{ color: '#7A5C12', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>Public Verification</Button>
        <Button href="/security" startIcon={renderSafeIcon(LockKeyhole, { size: 17 })} sx={{ color: '#7A5C12', border: '1px solid rgba(201,166,70,0.42)', fontWeight: 950 }}>Trust & Security</Button>
        <Button onClick={() => navigate('/admin/profile')} startIcon={renderSafeIcon(UserRound, { size: 17 })} sx={{ color: '#111827', bgcolor: '#C9A646', fontWeight: 950, '&:hover': { bgcolor: '#7A5C12' } }}>Admin Profile & Security</Button>
        <Button onClick={resetAndLogin} startIcon={renderSafeIcon(LogOut, { size: 17 })} sx={{ color: '#B91C1C', border: '1px solid rgba(239,68,68,0.45)', fontWeight: 900 }}>Reset session</Button>
      </Stack>

      <Typography variant="caption" sx={{ display: 'block', mt: 4, color: '#6B7280', fontWeight: 800, textAlign: 'center' }}>{lang === 'ar' ? 'مركز التحكم الداخلي' : 'In-app admin command center'} · /admin/dashboard</Typography>
    </Box>
  );
}

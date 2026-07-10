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
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  FileCheck2,
  Map,
  RefreshCcw,
  ShieldCheck,
  TicketCheck,
  Users,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  db,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPremiumCommandPanel from '../../components/AdminPremiumCommandPanel';

type Metric = {
  key: string;
  label: string;
  value: number | null;
  helper: string;
  route: string;
  icon: React.ElementType;
};

type AuditEvent = {
  id: string;
  action?: string;
  actorRole?: string;
  targetType?: string;
  createdAt?: unknown;
};

type LaunchSummary = Record<string, unknown>;

const launchGates = [
  { key: 'adminCredentialLogin', label: 'Admin credential login' },
  { key: 'fiveProfileSmoke', label: 'Five-profile live workflow' },
  { key: 'stripeLiveMode', label: 'Stripe live payment' },
  { key: 'appCheckProduction', label: 'App Check enforcement' },
  { key: 'brandedEmailSender', label: 'Branded email delivery' },
  { key: 'adminSecretRotation', label: 'Credential rotation' },
  { key: 'tenantNotificationDelivery', label: 'Tenant notifications' },
  { key: 'technicianGpsStorageProof', label: 'Technician GPS and proof' },
  { key: 'brokerCommissionLock', label: 'Broker commission lock' },
  { key: 'renewalWatch', label: 'Renewal automation' },
] as const;

const operations = [
  { label: 'Live Operations', route: '/ops/live', icon: <Activity size={20} /> },
  { label: 'Geo Repair', route: '/ops/geo-repair', icon: <Map size={20} /> },
  { label: 'Emergency Command', route: '/ops/emergency', icon: <AlertTriangle size={20} /> },
  { label: 'Visitor Parking', route: '/ops/visitor-parking', icon: <TicketCheck size={20} /> },
  { label: 'Amenities', route: '/ops/amenities', icon: <Building2 size={20} /> },
  { label: 'Announcements', route: '/ops/announcements', icon: <FileCheck2 size={20} /> },
  { label: 'Parcel Desk', route: '/ops/parcels', icon: <Building2 size={20} /> },
  { label: 'Key Register', route: '/ops/keys', icon: <ShieldCheck size={20} /> },
  { label: 'Marketplace', route: '/ops/marketplace', icon: <CreditCard size={20} /> },
  { label: 'Community Moderation', route: '/ops/community-moderation', icon: <Users size={20} /> },
  { label: 'Technician Performance', route: '/technicians/performance', icon: <Wrench size={20} /> },
  { label: 'Live Smoke Test', route: '/smoke-test', icon: <CheckCircle2 size={20} /> },
];

function formatDate(value: unknown) {
  const candidate = value as { toDate?: () => Date } | string | number | null | undefined;
  if (candidate && typeof candidate === 'object' && typeof candidate.toDate === 'function') {
    return candidate.toDate().toLocaleString('en-AE');
  }
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('en-AE');
  }
  return 'not recorded';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = React.useState<Metric[]>([]);
  const [launchSummary, setLaunchSummary] = React.useState<LaunchSummary>({});
  const [auditEvents, setAuditEvents] = React.useState<AuditEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [lastSync, setLastSync] = React.useState<string>('');

  const count = React.useCallback(async (countQuery: ReturnType<typeof query>) => {
    try {
      return (await getCountFromServer(countQuery)).data().count;
    } catch (countError) {
      console.warn('[ADMIN-DASHBOARD] Count query degraded:', countError);
      return null;
    }
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [owners, tenants, technicians, brokers, openMissions, pendingPayments, pendingOwners, emergencyTickets] = await Promise.all([
        count(query(collection(db, 'users'), where('role', '==', 'owner'))),
        count(query(collection(db, 'users'), where('role', '==', 'tenant'))),
        count(query(collection(db, 'users'), where('role', '==', 'technician'))),
        count(query(collection(db, 'users'), where('role', '==', 'broker'))),
        count(query(collection(db, 'maintenanceTickets'), where('status', 'in', ['OPEN', 'open', 'ASSIGNED', 'assigned', 'IN_PROGRESS', 'in_progress', 'ARRIVED', 'arrived']))),
        count(query(collection(db, 'payment_transactions'), where('verificationState', '==', 'ADMIN_VERIFICATION_REQUIRED'))),
        count(query(collection(db, 'owner_registration_requests'), where('status', 'in', ['pending_admin_approval', 'PENDING_ADMIN_APPROVAL', 'pending_payment_verification']))),
        count(query(collection(db, 'maintenanceTickets'), where('priority', 'in', ['EMERGENCY', 'emergency', 'URGENT', 'urgent']))),
      ]);

      setMetrics([
        { key: 'owners', label: 'Owners', value: owners, helper: 'Registered owner profiles', route: '/owners', icon: Building2 },
        { key: 'tenants', label: 'Tenants', value: tenants, helper: 'Registered tenant profiles', route: '/tenants', icon: Users },
        { key: 'technicians', label: 'Technicians', value: technicians, helper: 'Field technician profiles', route: '/technicians', icon: Wrench },
        { key: 'brokers', label: 'Brokers', value: brokers, helper: 'Broker partner profiles', route: '/broker', icon: Users },
        { key: 'openMissions', label: 'Open missions', value: openMissions, helper: 'Active maintenance workload', route: '/tickets', icon: TicketCheck },
        { key: 'pendingPaymentVerifications', label: 'Payment review', value: pendingPayments, helper: 'Payments waiting for verification', route: '/payments', icon: CreditCard },
        { key: 'pendingOwnerApprovals', label: 'Owner approvals', value: pendingOwners, helper: 'Owner onboarding decisions', route: '/owners', icon: ShieldCheck },
        { key: 'emergencyTickets', label: 'Emergency queue', value: emergencyTickets, helper: 'Emergency and urgent records', route: '/sos', icon: AlertTriangle },
      ]);

      try {
        const launchDoc = await getDoc(doc(db, 'system_health', 'admin_summaries'));
        setLaunchSummary(launchDoc.exists() ? launchDoc.data() : {});
      } catch (launchError) {
        console.warn('[ADMIN-DASHBOARD] Launch evidence unavailable:', launchError);
        setLaunchSummary({});
      }

      try {
        const auditSnapshot = await getDocs(query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(6)));
        setAuditEvents(auditSnapshot.docs.map((auditDoc) => ({ id: auditDoc.id, ...(auditDoc.data() as Omit<AuditEvent, 'id'>) })));
      } catch (auditError) {
        console.warn('[ADMIN-DASHBOARD] Audit preview unavailable:', auditError);
        setAuditEvents([]);
      }

      setLastSync(new Date().toLocaleString('en-AE'));
    } catch (loadError) {
      console.error('[ADMIN-DASHBOARD] Load failed:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load the Admin dashboard.');
    } finally {
      setLoading(false);
    }
  }, [count]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const kpis = React.useMemo(() => Object.fromEntries(metrics.map((metric) => [metric.key, { value: metric.value ?? 0 }])), [metrics]);
  const passedLaunchGates = launchGates.filter((gate) => launchSummary[gate.key] === true).length;
  const publicReady = passedLaunchGates === launchGates.length;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>CANONICAL ADMIN COMMAND CENTER</Typography>
            <Typography variant="h3" sx={{ fontWeight: 950, mt: 1 }}>One dashboard. Every operational route.</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, maxWidth: 900 }}>
              Live role counts, maintenance pressure, payment and owner queues, production launch evidence, and direct access to every restored Admin operation.
            </Typography>
          </Box>
          <Button onClick={() => void load()} disabled={loading} startIcon={<RefreshCcw size={17} />} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.45), fontWeight: 900 }}>
            {loading ? 'Syncing' : 'Refresh live data'}
          </Button>
        </Stack>

        {error ? <Alert severity="error">{error}</Alert> : null}
        <Alert severity={publicReady ? 'success' : 'warning'}>
          {publicReady
            ? 'All ten production evidence gates are recorded as PASS.'
            : `${passedLaunchGates}/${launchGates.length} production evidence gates are proven. Hard public launch remains NO-GO.`}
        </Alert>

        <Grid container spacing={2}>
          {metrics.map((metric) => (
            <Grid item xs={12} sm={6} md={3} key={metric.key}>
              <Card onClick={() => navigate(metric.route)} sx={{ height: '100%', cursor: 'pointer', bgcolor: 'rgba(15,23,42,0.82)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', '&:hover': { borderColor: alpha(binThemeTokens.gold, 0.5) } }}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 900, textTransform: 'uppercase' }}>{metric.label}</Typography>
                      <Typography variant="h3" sx={{ color: binThemeTokens.gold, fontWeight: 950, my: 1 }}>
                        {loading && metric.value === null ? <CircularProgress size={25} sx={{ color: binThemeTokens.gold }} /> : metric.value ?? '—'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>{metric.helper}</Typography>
                    </Box>
                    <Box sx={{ color: binThemeTokens.gold }}><metric.icon size={22} /></Box>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <AdminPremiumCommandPanel kpis={kpis} onNavigate={navigate} />

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.82)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>RESTORED OPERATIONS</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>These pages existed in the repository but were not reachable from the previous Admin shell.</Typography>
            </Box>
            <Grid container spacing={1.5}>
              {operations.map((operation) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={operation.route}>
                  <Button fullWidth onClick={() => navigate(operation.route)} sx={{ minHeight: 76, justifyContent: 'flex-start', gap: 1.2, color: '#fff', bgcolor: 'rgba(2,6,23,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, '&:hover': { borderColor: alpha(binThemeTokens.gold, 0.45) } }}>
                    <Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{operation.icon}</Box>
                    <Typography sx={{ fontWeight: 900 }}>{operation.label}</Typography>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,0.82)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.gold }}>Hard-launch evidence</Typography>
                <Chip label={`${passedLaunchGates}/${launchGates.length} PASS`} color={publicReady ? 'success' : 'warning'} sx={{ fontWeight: 950 }} />
              </Stack>
              <Grid container spacing={1.5}>
                {launchGates.map((gate) => {
                  const passed = launchSummary[gate.key] === true;
                  return (
                    <Grid item xs={12} sm={6} key={gate.key}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(2,6,23,0.6)' }}>
                        {passed ? <CheckCircle2 size={18} color="#4ade80" /> : <AlertTriangle size={18} color="#f59e0b" />}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 900 }}>{gate.label}</Typography>
                          <Typography variant="caption" sx={{ color: passed ? '#86efac' : '#fde68a' }}>{passed ? 'PASS' : 'PENDING'}</Typography>
                        </Box>
                      </Stack>
                    </Grid>
                  );
                })}
              </Grid>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,0.82)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
              <Typography variant="h6" sx={{ fontWeight: 950, color: binThemeTokens.gold, mb: 2 }}>Recent protected audit events</Typography>
              <Stack spacing={1.2}>
                {auditEvents.length ? auditEvents.map((event) => (
                  <Box key={event.id} sx={{ p: 1.4, borderRadius: 2, bgcolor: 'rgba(2,6,23,0.62)' }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>{event.action || 'AUDIT_EVENT'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{event.actorRole || 'actor'} · {event.targetType || 'target'} · {formatDate(event.createdAt)}</Typography>
                  </Box>
                )) : <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)' }}>No audit preview is available for this account.</Typography>}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Last synchronized: {lastSync || 'not yet synchronized'}</Typography>
      </Stack>
    </Box>
  );
}

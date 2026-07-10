import React from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Activity, AlertTriangle, Building2, CheckCircle2, CreditCard, Gauge, Map, RefreshCw, Rocket, ShieldCheck, TicketCheck, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, getCountFromServer, getDoc, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

const launchGates = [
  { key: 'adminCredentialLogin', label: 'Admin credential login' },
  { key: 'fiveProfileSmoke', label: 'Five-profile live workflow' },
  { key: 'stripeLiveMode', label: 'Stripe live payment' },
  { key: 'appCheckProduction', label: 'App Check enforcement' },
  { key: 'brandedEmailSender', label: 'Branded email delivery' },
  { key: 'adminSecretRotation', label: 'Credential and secret rotation' },
  { key: 'tenantNotificationDelivery', label: 'Tenant notification delivery' },
  { key: 'technicianGpsStorageProof', label: 'Technician GPS and evidence' },
  { key: 'brokerCommissionLock', label: 'Broker attribution and commission' },
  { key: 'renewalWatch', label: 'Renewal automation evidence' },
] as const;

const actions = [
  { label: 'Owner Activation', route: '/owners', icon: Building2, description: 'Onboarding, documents, payment, property and activation review.' },
  { label: 'SLA & Tickets', route: '/tickets', icon: Gauge, description: 'Open workload, timers, dispatch state and breach risk.' },
  { label: 'Payment Approvals', route: '/payments', icon: CreditCard, description: 'Verify offline payments and investigate card exceptions.' },
  { label: 'Emergency Command', route: '/ops/emergency', icon: AlertTriangle, description: 'SOS, critical incidents and immediate dispatch pressure.' },
  { label: 'Technician Map', route: '/technicians/map', icon: Map, description: 'Coverage, duty status, location and assignment visibility.' },
  { label: 'Broker Attribution', route: '/broker-attributions', icon: TicketCheck, description: 'Prove source ownership before commission creation.' },
  { label: 'Community Operations', route: '/tenant-services', icon: Users, description: 'Tenant services, unit links and building operations.' },
  { label: 'Public Launch Evidence', route: '/ops/public-launch-command', icon: Rocket, description: 'Record and verify every hard-launch production gate.' },
] as const;

type LaunchSummary = Record<string, unknown>;
type Metric = { key: string; label: string; value: number | null; route: string; icon: React.ElementType };

const baseMetrics: Metric[] = [
  { key: 'owners', label: 'Owners', value: null, route: '/owners', icon: Building2 },
  { key: 'tenants', label: 'Tenants', value: null, route: '/tenants', icon: Users },
  { key: 'technicians', label: 'Technicians', value: null, route: '/technicians', icon: Wrench },
  { key: 'brokers', label: 'Brokers', value: null, route: '/broker', icon: TicketCheck },
  { key: 'openTickets', label: 'Open Tickets', value: null, route: '/tickets', icon: Activity },
  { key: 'pendingPayments', label: 'Payment Review', value: null, route: '/payments', icon: CreditCard },
];

export default function DashboardPage() {
  const navigate = useNavigate();
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
      pendingPayments: async () => (await getCountFromServer(query(collection(db, 'payment_transactions'), where('verificationState', '==', 'ADMIN_VERIFICATION_REQUIRED')))).data().count,
    };

    try {
      const resolved = await Promise.all(baseMetrics.map(async (metric) => {
        try { return { ...metric, value: await loaders[metric.key]() }; }
        catch (metricError) { console.warn(`Metric ${metric.key} failed`, metricError); return { ...metric, value: null }; }
      }));
      setMetrics(resolved);
      const launchDoc = await getDoc(doc(db, 'system_health', 'admin_summaries'));
      setLaunchSummary(launchDoc.exists() ? launchDoc.data() : {});
      setLastLoadedAt(new Date().toLocaleString('en-AE'));
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load production admin evidence.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const passed = launchGates.filter((gate) => launchSummary[gate.key] === true).length;
  const publicReady = passed === launchGates.length;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack spacing={3.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>CANONICAL ADMIN COMMAND CENTER</Typography>
            <Typography variant="h3" sx={{ fontWeight: 950, mt: 0.5 }}>Live Operations & Launch Control</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.62)', mt: 1 }}>One admin dashboard for owners, tenants, technicians, brokers, payments, incidents and launch evidence.</Typography>
          </Box>
          <Button onClick={load} disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <RefreshCw size={16} />} variant="outlined" sx={{ borderColor: alpha(binThemeTokens.gold, 0.5), color: binThemeTokens.gold, fontWeight: 900 }}>Refresh</Button>
        </Stack>

        <Alert severity={publicReady ? 'success' : 'warning'} icon={publicReady ? <ShieldCheck /> : <AlertTriangle />}>
          {publicReady ? 'All ten hard-public-launch evidence gates are verified.' : `${passed}/${launchGates.length} hard-launch evidence gates verified. Unrestricted public launch remains NO-GO.`}
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}

        <Grid container spacing={2}>
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <Grid item xs={12} sm={6} md={4} key={metric.key}>
                <Card onClick={() => navigate(metric.route)} sx={{ cursor: 'pointer', height: '100%', bgcolor: 'rgba(15,23,42,0.94)', color: '#fff', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 4 }}>
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{metric.label.toUpperCase()}</Typography><Typography variant="h3" sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 0.5 }}>{loading && metric.value === null ? '—' : metric.value ?? '—'}</Typography></Box>
                      <Box sx={{ color: binThemeTokens.gold, p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}><Icon size={23} /></Box>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            );
          })}
        </Grid>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(binThemeTokens.gold, 0.045), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
          <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>Daily Command Actions</Typography>
          <Grid container spacing={2}>
            {actions.map((action) => {
              const Icon = action.icon;
              return <Grid item xs={12} sm={6} md={3} key={action.route}><Button fullWidth onClick={() => navigate(action.route)} sx={{ height: '100%', minHeight: 125, p: 2, justifyContent: 'flex-start', textAlign: 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.78)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}><Stack alignItems="flex-start" spacing={1}><Icon size={22} color={binThemeTokens.gold} /><Typography sx={{ fontWeight: 950 }}>{action.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>{action.description}</Typography></Stack></Button></Grid>;
            })}
          </Grid>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.9)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>Hard-Launch Evidence</Typography><Chip label={`${passed}/${launchGates.length} PASS`} color={publicReady ? 'success' : 'warning'} sx={{ fontWeight: 950 }} /></Stack>
          <Grid container spacing={1.5}>{launchGates.map((gate) => { const ok = launchSummary[gate.key] === true; return <Grid item xs={12} sm={6} md={4} key={gate.key}><Stack direction="row" spacing={1.2} alignItems="center" sx={{ p: 1.5, borderRadius: 3, bgcolor: ok ? alpha('#10b981', 0.08) : alpha('#f59e0b', 0.08), border: `1px solid ${ok ? alpha('#10b981', 0.22) : alpha('#f59e0b', 0.22)}` }}>{ok ? <CheckCircle2 size={18} color="#10b981" /> : <AlertTriangle size={18} color="#f59e0b" />}<Box><Typography variant="body2" sx={{ color: '#fff', fontWeight: 850 }}>{gate.label}</Typography><Typography variant="caption" sx={{ color: ok ? '#6ee7b7' : '#fcd34d', fontWeight: 900 }}>{ok ? 'VERIFIED' : 'PENDING LIVE PROOF'}</Typography></Box></Stack></Grid>; })}</Grid>
          {lastLoadedAt && <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.4)', mt: 2 }}>Last synced: {lastLoadedAt}</Typography>}
        </Paper>
      </Stack>
    </Box>
  );
}

// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';
import {
  Activity,
  AlertTriangle,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Home,
  Shield,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, limit, onSnapshot, orderBy, query, Timestamp, where } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import CeoContactButtons from '../../components/CeoContactButtons';

type RecordRow = { id: string; [key: string]: any };

type Metric = {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: string;
  route?: string;
};

type MrrStats = {
  currentMonth: number;
  previousMonth: number;
  trendPercent: number;
};

const ACTIVE_TICKET_STATUSES = [
  'OPEN',
  'PENDING',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'open',
  'accepted',
];

const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const PENDING_COMMISSION_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];
const OPEN_REVIEW_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW', 'pending_admin_approval', 'pending_approval'];
const TECH_PENDING_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval', 'pending_approval'];
const APPROVED_PAYMENT_STATES = ['PAID', 'PAID_MANUAL', 'RECONCILED', 'ADMIN_VERIFIED', 'VERIFIED', 'paid', 'reconciled', 'verified'];

const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeStatus = (value: any) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const normalizeKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const resolveSlaPolicyMs = (mission: RecordRow) => {
  const severity = normalizeStatus(mission.severity || mission.priority || mission.urgency || mission.category);
  if (severity.includes('EMERGENCY') || severity.includes('CRITICAL')) return 30 * 60 * 1000;
  if (severity.includes('HIGH') || severity.includes('URGENT')) return 2 * 60 * 60 * 1000;
  return 4 * 60 * 60 * 1000;
};

const resolveSlaDueAt = (mission: RecordRow) => {
  const explicitDue = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
  if (explicitDue) return explicitDue;
  const created = getMillis(mission.createdAt || mission.reportedAt || mission.openedAt);
  return created ? created + resolveSlaPolicyMs(mission) : 0;
};

const isBreached = (mission: RecordRow) => {
  if (mission.slaBreached === true || String(mission.slaStatus || '').toUpperCase() === 'BREACHED') return true;
  const due = resolveSlaDueAt(mission);
  return due > 0 && due < Date.now();
};

const isNearBreach = (mission: RecordRow) => {
  const due = resolveSlaDueAt(mission);
  if (!due) return false;
  const remainingMs = due - Date.now();
  return remainingMs > 0 && remainingMs <= 60 * 60 * 1000;
};

const formatSla = (mission: RecordRow) => {
  if (mission.slaRemaining || mission.slaText) return String(mission.slaRemaining || mission.slaText);
  const due = resolveSlaDueAt(mission);
  if (!due) return 'SLA not configured';
  const diff = due - Date.now();
  const absolute = Math.abs(diff);
  const hours = Math.floor(absolute / 3_600_000);
  const minutes = Math.floor((absolute % 3_600_000) / 60_000);
  return diff < 0 ? `Breached by ${hours}h ${minutes}m` : `${hours}h ${minutes}m remaining`;
};

const statusTone = (value: any) => {
  const status = normalizeStatus(value);
  if (['READY', 'ACTIVE', 'PASS', 'GREEN', 'VERIFIED', 'CLEAR', 'PAID', 'RECONCILED', 'HEALTHY'].some((word) => status.includes(word))) return '#10b981';
  if (['BLOCKED', 'FAIL', 'ERROR', 'BREACH', 'EXPIRED', 'DENIED', 'DOWN'].some((word) => status.includes(word))) return '#ef4444';
  if (['PENDING', 'REVIEW', 'UNKNOWN', 'WARNING', 'DEGRADED'].some((word) => status.includes(word))) return '#f59e0b';
  return 'rgba(255,255,255,0.62)';
};

const reviewPathFor = (item: RecordRow) => {
  if (item.type === 'OWNER_ONBOARDING') return `/vault?intakeId=${encodeURIComponent(item.id)}`;
  if (item.type === 'TECH_ONBOARD') return `/technicians?reviewId=${encodeURIComponent(item.id)}`;
  if (item.type === 'PAYMENT_PROOF') return `/admin/payments?paymentId=${encodeURIComponent(item.id)}`;
  if (item.type === 'BROKER_COMMISSION') return `/broker?commissionId=${encodeURIComponent(item.id)}`;
  return '/manual-approvals';
};

const approvedPayment = (row: RecordRow) => {
  const statusValues = [row.status, row.paymentStatus, row.verificationState, row.settlementStatus].map((value) => String(value || ''));
  return statusValues.some((value) => APPROVED_PAYMENT_STATES.includes(value) || APPROVED_PAYMENT_STATES.includes(value.toUpperCase()));
};

const transactionAmount = (row: RecordRow) => Number(row.amountReceived || row.mobilizationAmount || row.amount || row.totalAmount || row.contractValue || row.annualValue || 0);

const paymentEventMillis = (row: RecordRow) => getMillis(
  row.approvedAt
  || row.paymentApprovedAt
  || row.adminApprovedAt
  || row.reconciledAt
  || row.verifiedAt
  || row.paidAt
  || row.createdAt
  || row.updatedAt,
);

const calculateMrr = (rows: RecordRow[]): MrrStats => {
  const now = new Date();
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  let currentMonth = 0;
  let previousMonth = 0;

  rows.filter(approvedPayment).forEach((row) => {
    const paidAt = paymentEventMillis(row);
    const amount = transactionAmount(row);
    if (!paidAt || !amount) return;
    if (paidAt >= currentStart) currentMonth += amount;
    if (paidAt >= previousStart && paidAt < currentStart) previousMonth += amount;
  });

  const trendPercent = previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : currentMonth > 0 ? 100 : 0;
  return { currentMonth, previousMonth, trendPercent };
};

const hasExpiredField = (row: RecordRow) => {
  const candidates = [row.expiryDate, row.expiresAt, row.permitExpiry, row.tradeLicenseExpiry, row.insuranceExpiry, row.certificationExpiry, row.contractExpiryDate];
  return candidates.some((value) => {
    const expiry = getMillis(value);
    return expiry > 0 && expiry < Date.now();
  });
};

const formatDateTime = (value: any) => {
  const millis = getMillis(value);
  return millis ? new Date(millis).toLocaleString('en-AE') : 'Not recorded';
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [properties, setProperties] = useState(0);
  const [units, setUnits] = useState(0);
  const [missions, setMissions] = useState<RecordRow[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<RecordRow[]>([]);
  const [commissionQueue, setCommissionQueue] = useState<RecordRow[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<RecordRow[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [mrrStats, setMrrStats] = useState<MrrStats>({ currentMonth: 0, previousMonth: 0, trendPercent: 0 });
  const [expiredDocuments, setExpiredDocuments] = useState<RecordRow[]>([]);
  const [systemHealth, setSystemHealth] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    const listen = (label: string, source: any, onNext: (snap: any) => void) => {
      const unsubscribe = onSnapshot(source, onNext, (error: any) => {
        console.warn(`[ADMIN_DASHBOARD] ${label} stream failed`, error);
      });
      unsubscribers.push(unsubscribe);
    };

    listen('properties', collection(db, 'properties'), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      setProperties(rows.length);
      setUnits(rows.reduce((sum, row) => sum + Number(row.units || row.totalUnits || row.unitsCount || 0), 0));
      setLastSync(new Date());
    });

    listen('active tickets', query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      rows.sort((a, b) => resolveSlaDueAt(a) - resolveSlaDueAt(b));
      setMissions(rows.slice(0, 20));
      setLastSync(new Date());
    });

    listen('payment queue', query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setPaymentQueue(rows.sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
      setLastSync(new Date());
    });

    listen('recent payments', query(collection(db, 'payment_transactions'), orderBy('createdAt', 'desc'), limit(200)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      setMrrStats(calculateMrr(rows));
      setLastSync(new Date());
    });

    listen('broker commissions', query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setCommissionQueue(rows.sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
      setLastSync(new Date());
    });

    listen('owner onboarding reviews', query(collection(db, 'intake_submissions'), where('status', 'in', OPEN_REVIEW_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'OWNER_ONBOARDING', origin: 'Owner onboarding', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setApprovalQueue((current) => {
        const techRows = current.filter((row) => row.type === 'TECH_ONBOARD');
        return [...rows, ...techRows].sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt));
      });
      setLastSync(new Date());
    });

    listen('technician reviews', query(collection(db, 'users'), where('role', '==', 'technician'), limit(100)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'TECH_ONBOARD', origin: 'Technician onboarding', ...(row.data() as Record<string, any>) })) as RecordRow[];
      const pendingRows = rows.filter((row) => TECH_PENDING_STATES.includes(String(row.status || row.approvalStatus || '')));
      setApprovalQueue((current) => {
        const ownerRows = current.filter((row) => row.type === 'OWNER_ONBOARDING');
        return [...ownerRows, ...pendingRows].sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt));
      });
      setLastSync(new Date());
    });

    listen('expired documents', query(collection(db, 'documents'), where('expiryDate', '<', Timestamp.now()), limit(50)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, source: 'documents', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setExpiredDocuments((current) => [...rows, ...current.filter((row) => row.source === 'property_passports')]);
      setLastSync(new Date());
    });

    listen('passport expiry scan', query(collection(db, 'property_passports'), limit(100)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, source: 'property_passports', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setExpiredDocuments((current) => [...current.filter((row) => row.source === 'documents'), ...rows.filter(hasExpiredField)]);
      setLastSync(new Date());
    });

    listen('system health', collection(db, 'system_health'), (snap) => {
      const health: Record<string, any> = {};
      snap.docs.forEach((row: any) => {
        const data = row.data() as Record<string, any>;
        health[row.id] = data;
        health[normalizeKey(row.id)] = data;
        if (data.key) health[normalizeKey(String(data.key))] = data;
        if (data.service) health[normalizeKey(String(data.service))] = data;
      });
      setSystemHealth(health);
      setLastSync(new Date());
    });

    listen('admin summary', doc(db, 'admin_summaries', 'global'), (snap) => {
      setSummary(snap.exists() ? (snap.data() as Record<string, any>) : {});
      setLastSync(new Date());
    });

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const breachedMissions = useMemo(() => missions.filter(isBreached), [missions]);
  const nearBreach = useMemo(() => missions.filter(isNearBreach).length, [missions]);
  const actionQueue = useMemo(() => [...approvalQueue, ...paymentQueue, ...commissionQueue].slice(0, 12), [approvalQueue, paymentQueue, commissionQueue]);
  const pendingReviewRoute = useMemo(() => {
    const hasTech = approvalQueue.some((row) => row.type === 'TECH_ONBOARD');
    const hasOwner = approvalQueue.some((row) => row.type === 'OWNER_ONBOARDING');
    if (hasTech && !hasOwner) return '/technicians?review=pending';
    if (hasOwner && !hasTech) return '/vault?filter=pending';
    return '/manual-approvals';
  }, [approvalQueue]);
  const launchHealth = summary.launchHealth || summary.gates || {};
  const smokeStatus = summary.smokeStatus || summary.profileSmoke || summary.fiveProfileSmoke || {};
  const webhook = systemHealth.whatsappwebhook || systemHealth.whatsapp_webhook || summary.whatsappWebhook || summary.webhookHealth || {};

  const healthValue = (...keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeKey(key);
      const systemRow = systemHealth[normalized] || systemHealth[key];
      if (systemRow?.status || systemRow?.state || systemRow?.value) return systemRow.status || systemRow.state || systemRow.value;
      if (launchHealth[key] || launchHealth[normalized]) return launchHealth[key] || launchHealth[normalized];
      if (summary[key] || summary[normalized]) return summary[key] || summary[normalized];
    }
    return 'UNKNOWN';
  };

  const metrics: Metric[] = [
    { label: 'Total Properties', value: properties, icon: <Home size={18} />, tone: '#3b82f6', route: '/properties/passport' },
    { label: 'Total Units', value: units, icon: <Building2 size={18} />, tone: '#8b5cf6' },
    { label: 'Open Missions', value: missions.length, icon: <Wrench size={18} />, tone: '#f59e0b', route: '/tickets' },
    { label: 'SLA Breaches', value: breachedMissions.length, icon: <AlertTriangle size={18} />, tone: breachedMissions.length ? '#ef4444' : '#10b981', route: '/tickets?sla=breached' },
    { label: 'SLA Near Breach', value: nearBreach, icon: <Clock size={18} />, tone: nearBreach ? '#f59e0b' : '#10b981', route: '/tickets?sla=near' },
    { label: 'Payment Verifications', value: paymentQueue.length, icon: <DollarSign size={18} />, tone: paymentQueue.length ? '#f59e0b' : '#10b981', route: '/admin/payments' },
    { label: 'Broker Commissions', value: commissionQueue.length, icon: <Briefcase size={18} />, tone: commissionQueue.length ? '#f59e0b' : '#10b981', route: '/broker' },
    { label: 'Pending Reviews', value: approvalQueue.length, icon: <Shield size={18} />, tone: approvalQueue.length ? '#f59e0b' : '#10b981', route: pendingReviewRoute },
    { label: 'Expired Documents', value: expiredDocuments.length, icon: <FileText size={18} />, tone: expiredDocuments.length ? '#ef4444' : '#10b981', route: '/document-vault' },
  ];

  const healthRows = [
    ['CI Deploy Status', healthValue('ciDeployStatus', 'ci_deploy', 'mainAppBuild')],
    ['Firebase Functions', healthValue('firebaseFunctions', 'functionsDeploy', 'functions')],
    ['App Check', healthValue('appCheck', 'firebaseAppCheck')],
    ['Firestore Rules', healthValue('firestoreRules')],
    ['Storage Rules', healthValue('storageRules')],
    ['WhatsApp Webhook', healthValue('whatsappWebhook', 'whatsapp_webhook')],
    ['Payment Gateway', healthValue('paymentGateway', 'stripe', 'paymentVerification')],
    ['Branded Email', healthValue('brandedEmail', 'emailSender')],
  ];

  const smokeRows = [
    ['Owner Login', smokeStatus.owner || healthValue('ownerSmoke', 'owner_login')],
    ['Tenant Login', smokeStatus.tenant || healthValue('tenantSmoke', 'tenant_login')],
    ['Technician Login', smokeStatus.technician || healthValue('technicianSmoke', 'technician_login')],
    ['Broker Login', smokeStatus.broker || healthValue('brokerSmoke', 'broker_login')],
    ['Admin Login', smokeStatus.admin || healthValue('adminSmoke', 'admin_login')],
  ];

  return (
    <AdminPageFrame title="Executive Command Center" subtitle="HARD-LIVE OPERATIONS TERMINAL" lastUpdated={lastSync} onRefresh={() => window.location.reload()}>
      <Stack spacing={4}>
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Button variant="contained" onClick={() => navigate('/onboard-property')}>Add Property</Button>
          <Button variant="outlined" onClick={() => navigate('/admin/payments')}>Verify Payments</Button>
          <Button variant="outlined" onClick={() => navigate('/document-vault')}>Document Vault</Button>
          <Button variant="outlined" onClick={() => navigate('/reports')}>Command Report</Button>
          <Button variant="outlined" onClick={() => navigate('/ops/whatsapp-triage')}>WhatsApp Triage</Button>
        </Stack>

        <Grid container spacing={2}>
          {metrics.map((metric) => (
            <Grid item xs={12} sm={6} md={3} key={metric.label}>
              <Paper onClick={() => metric.route && navigate(metric.route)} sx={{ p: 2.5, minHeight: 128, bgcolor: binThemeTokens.graphite, border: `1px solid ${alpha(metric.tone, 0.32)}`, borderRadius: 4, cursor: metric.route ? 'pointer' : 'default' }}>
                <Box sx={{ color: metric.tone, mb: 1 }}>{metric.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900 }}>{metric.label.toUpperCase()}</Typography>
                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{metric.value}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 0, overflow: 'hidden', bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
              <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}>
                  <CheckCircle2 color={binThemeTokens.gold} /> Action Queues
                </Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Origin</TableCell>
                      <TableCell>Linked Record</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {actionQueue.map((item) => (
                      <TableRow key={`${item.type}-${item.id}`} hover>
                        <TableCell>{item.origin || item.type || 'Review'}</TableCell>
                        <TableCell>{item.ownerEmail || item.tenantEmail || item.brokerEmail || item.payerEmail || item.email || item.id}</TableCell>
                        <TableCell>
                          <Chip size="small" label={normalizeStatus(item.status || item.approvalStatus || item.verificationState)} sx={{ color: statusTone(item.status || item.approvalStatus || item.verificationState), bgcolor: alpha(statusTone(item.status || item.approvalStatus || item.verificationState), 0.12), fontWeight: 900 }} />
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" onClick={() => navigate(reviewPathFor(item))}>Review</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {actionQueue.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 5, color: 'rgba(255,255,255,0.35)' }}>No pending actions.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
                <Activity color={binThemeTokens.gold} /> SLA Breach Queue
              </Typography>
              <Stack spacing={1.5}>
                {missions.slice(0, 6).map((mission) => (
                  <Paper key={mission.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: `1px solid ${isBreached(mission) ? alpha('#ef4444', 0.42) : 'rgba(255,255,255,0.08)'}`, borderRadius: 3 }}>
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION #{mission.id.slice(0, 8).toUpperCase()}</Typography>
                    <Typography sx={{ color: '#fff', fontWeight: 900 }}>{mission.title || mission.issueType || mission.category || 'Maintenance mission'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{mission.propertyName || mission.propertyTitle || 'Property not linked'}</Typography>
                    <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                      <Typography variant="caption" sx={{ color: isBreached(mission) ? '#ef4444' : 'rgba(255,255,255,0.62)', fontWeight: 800 }}>SLA: {formatSla(mission)}</Typography>
                      <Chip size="small" label={normalizeStatus(mission.status)} />
                    </Stack>
                  </Paper>
                ))}
                {missions.length === 0 && <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800, py: 4, textAlign: 'center' }}>No active missions.</Typography>}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            <StatusPanel title="Launch Health" icon={<FileText color={binThemeTokens.gold} />} rows={healthRows} />
          </Grid>
          <Grid item xs={12} lg={6}>
            <StatusPanel title="5-Profile Smoke Status" icon={<Shield color={binThemeTokens.gold} />} rows={smokeRows} />
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>MRR Intelligence</Typography>
              <Stack spacing={1.5}>
                <MetricLine label="CURRENT MONTH COLLECTIONS" value={money(mrrStats.currentMonth)} />
                <MetricLine label="PREVIOUS MONTH" value={money(mrrStats.previousMonth)} muted />
                <MetricLine label="MONTH TREND" value={`${mrrStats.trendPercent.toFixed(1)}%`} color={mrrStats.trendPercent >= 0 ? '#10b981' : '#ef4444'} />
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>WhatsApp Webhook Health</Typography>
              <Stack spacing={1.5}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>Status</Typography>
                  <Chip size="small" label={normalizeStatus(webhook.status || webhook.state || healthValue('whatsappWebhook'))} sx={{ bgcolor: alpha(statusTone(webhook.status || webhook.state || healthValue('whatsappWebhook')), 0.12), color: statusTone(webhook.status || webhook.state || healthValue('whatsappWebhook')), fontWeight: 900 }} />
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>Signature</Typography>
                  <Typography sx={{ color: '#fff', fontWeight: 900 }}>{normalizeStatus(webhook.signatureStatus || webhook.signature || 'UNKNOWN')}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 800 }}>Error Count</Typography>
                  <Typography sx={{ color: Number(webhook.errorCount || 0) ? '#ef4444' : '#10b981', fontWeight: 900 }}>{Number(webhook.errorCount || 0)}</Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>Last inbound: {formatDateTime(webhook.latestInboundAt || webhook.lastInboundAt || webhook.updatedAt)}</Typography>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
              <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>Expired Document Queue</Typography>
              <Stack spacing={1}>
                {expiredDocuments.slice(0, 5).map((row) => (
                  <Stack key={`${row.source}-${row.id}`} direction="row" justifyContent="space-between" sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{row.title || row.documentName || row.propertyName || row.id}</Typography>
                    <Chip size="small" label="EXPIRED" sx={{ color: '#ef4444', bgcolor: alpha('#ef4444', 0.12), fontWeight: 900 }} />
                  </Stack>
                ))}
                {expiredDocuments.length === 0 && <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800, py: 4, textAlign: 'center' }}>No expired documents detected.</Typography>}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>COMMAND SUPPORT TERMINAL</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>Critical operational support channels remain available while launch gates are verified.</Typography>
            </Box>
            <CeoContactButtons compact />
          </Stack>
        </Paper>
      </Stack>
    </AdminPageFrame>
  );
}

function StatusPanel({ title, icon, rows }: { title: string; icon: React.ReactNode; rows: Array<[string, any]> }) {
  return (
    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
      <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}>
        {icon} {title}
      </Typography>
      <Grid container spacing={1.5}>
        {rows.map(([label, value]) => (
          <Grid item xs={12} sm={6} key={label}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
              <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{label}</Typography>
              <Chip size="small" label={normalizeStatus(value)} sx={{ bgcolor: alpha(statusTone(value), 0.12), color: statusTone(value), fontWeight: 900 }} />
            </Stack>
          </Grid>
        ))}
      </Grid>
    </Paper>
  );
}

function MetricLine({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>{label}</Typography>
      <Typography sx={{ color: color || (muted ? 'rgba(255,255,255,0.72)' : '#fff'), fontWeight: 950 }}>{value}</Typography>
    </Box>
  );
}

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
import {
    collection,
    db,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
    where
} from '../../lib/firebase';
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

// Tickets are written with an SLA budget (slaMinutes) and a createdAt
// timestamp at every intake surface (tenant requests, SOS, AI concierge,
// owner complaints) — not an explicit due-date field. Explicit
// slaDueAt/slaDeadline/dueAt fields are honored first for forward
// compatibility, but the real-world fallback is createdAt + slaMinutes.
const getSlaDueMillis = (mission: any) => {
    const explicit = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    if (explicit) return explicit;
    const slaMinutes = Number(mission.slaMinutes);
    const createdAt = getMillis(mission.createdAt);
    if (Number.isFinite(slaMinutes) && slaMinutes > 0 && createdAt > 0) return createdAt + slaMinutes * 60000;
    return 0;
};

const isNearBreach = (mission: any) => {
    const due = getSlaDueMillis(mission);
    if (!due) return false;
    const remainingMs = due - Date.now();
    return remainingMs > 0 && remainingMs <= 60 * 60 * 1000;
};

const isBreached = (mission: any) => {
    if (mission.slaBreached === true || mission.slaStatus === 'BREACHED') return true;
    const due = getSlaDueMillis(mission);
    return due > 0 && due < Date.now();
};

const formatSla = (mission: any) => {
    if (mission.slaRemaining || mission.slaText) return String(mission.slaRemaining || mission.slaText);
    const due = getSlaDueMillis(mission);
    if (!due) return 'SLA not configured';
    const diff = due - Date.now();
    const abs = Math.abs(diff);
    const hours = Math.floor(abs / (60 * 60 * 1000));
    const minutes = Math.floor((abs % (60 * 60 * 1000)) / (60 * 1000));
    return diff < 0 ? `Breached by ${hours}h ${minutes}m` : `${hours}h ${minutes}m remaining`;
};

// Approval queue rows are summaries assembled from multiple collections
// (intake_submissions, technician users, payment_transactions,
// broker_commissions); the full approval/reject workflow lives on dedicated
// pages, so REVIEW routes there instead of duplicating it. /manual-approvals
// only ever renders a payment-verification queue (it ignores query params),
// so owner/technician onboarding approvals must route to their real review
// surfaces instead.
const reviewPathFor = (item: any) => {
    if (item.type === 'OWNER_ONBOARDING') return '/vault';
    if (item.type === 'TECH_ONBOARD') return '/technicians';
    if (item.type === 'PAYMENT_PROOF') return '/manual-approvals';
    if (item.type === 'BROKER_COMMISSION') return '/broker';
    return '/dashboard';
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

    const [propertyNamesById, setPropertyNamesById] = useState<Record<string, string>>({});
    const [revenueTrend, setRevenueTrend] = useState<{ status: 'loading' | 'success' | 'error'; current: number; growthPercent: number | null }>({ status: 'loading', current: 0, growthPercent: null });

    const updateKPI = (key: string, value: number | string, status: KPIStatus = 'success') => {
        setKpis((prev) => ({ ...prev, [key]: { ...prev[key], value, status } }));
    };

    listen('payment queue', query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setPaymentQueue(rows.sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
      setLastSync(new Date());
    });

    useEffect(() => {
        const unsubscribers: (() => void)[] = [];

        unsubscribers.push(onSnapshot(collection(db, 'properties'),
            (snap) => {
                updateKPI('totalProperties', snap.size);
                let totalUnits = 0;
                const namesById: Record<string, string> = {};
                snap.docs.forEach((row) => {
                    const data = row.data();
                    totalUnits += Number(data.units || data.totalUnits || data.unitsCount || 0);
                    const name = data.propertyName || data.name;
                    if (name) namesById[row.id] = name;
                });
                updateKPI('totalUnits', totalUnits);
                setPropertyNamesById(namesById);
            },
            (err) => { handleKPIError('totalProperties', err); handleKPIError('totalUnits', err); }
        ));

        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'tenant')), (snap) => updateKPI('activeTenants', snap.size), (err) => handleKPIError('activeTenants', err)));
        unsubscribers.push(onSnapshot(query(collection(db, 'tenant_invites'), where('status', '==', 'PENDING')), (snap) => updateKPI('pendingTenantInvites', snap.size), (err) => handleKPIError('pendingTenantInvites', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
            const missions = snap.docs.map((row) => {
                const data = row.data();
                return { id: row.id, updatedAt: data.updatedAt, createdAt: data.createdAt, ...data };
            });
            updateKPI('openMissions', missions.length);
            updateKPI('slaBreaches', missions.filter(isBreached).length);
            updateKPI('nearBreaches', missions.filter(isNearBreach).length);
            setOperationsMissions(missions.sort((a, b) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt)).slice(0, 10));
        }, (err) => { handleKPIError('openMissions', err); handleKPIError('slaBreaches', err); handleKPIError('nearBreaches', err); }));

        unsubscribers.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('priority', 'in', ['EMERGENCY', 'emergency'])), (snap) => {
            const activeEmergencyCount = snap.docs.filter((row) => !['COMPLETED', 'CLOSED', 'completed', 'closed'].includes(String(row.data().status || ''))).length;
            updateKPI('emergencyRequests', activeEmergencyCount);
        }, (err) => handleKPIError('emergencyRequests', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', ['ACTIVE', 'active'])), (snap) => updateKPI('activeTechnicians', snap.size), (err) => handleKPIError('activeTechnicians', err)));
        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'broker')), (snap) => updateKPI('activeBrokers', snap.size), (err) => handleKPIError('activeBrokers', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'intake_submissions'), where('status', 'in', PENDING_OWNER_STATUSES)), (snap) => {
            const items = snap.docs.map((row) => {
                const data = row.data();
                return { id: row.id, origin: 'Owner onboarding', type: 'OWNER_ONBOARDING', linkedName: data.companyProfile?.name || data.ownerEmail || data.ownerUid || data.ownerId, createdAt: data.submittedAt || data.createdAt, ...data };
            });
            updateKPI('pendingOwnerApprovals', items.length);
            setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'OWNER_ONBOARDING'), ...items].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
        }, (err) => handleKPIError('pendingOwnerApprovals', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', PENDING_TECHNICIAN_STATUSES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, origin: 'Technician onboarding', type: 'TECH_ONBOARD', linkedName: row.data().displayName || row.data().email || row.id, createdAt: row.data().createdAt, ...row.data() }));
            updateKPI('pendingTechnicianApprovals', items.length);
            setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'TECH_ONBOARD'), ...items].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
        }, (err) => handleKPIError('pendingTechnicianApprovals', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', linkedName: row.data().ownerEmail || row.data().tenantEmail || row.data().payerEmail || row.id, createdAt: row.data().createdAt || row.data().submittedAt, ...row.data() }));
            updateKPI('pendingPaymentVerifications', items.length);
            setPaymentProofs(items.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 5));
        }, (err) => handleKPIError('pendingPaymentVerifications', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', linkedName: row.data().brokerName || row.data().brokerEmail || row.data().brokerId || row.id, createdAt: row.data().createdAt || row.data().submittedAt, ...row.data() }));
            updateKPI('pendingBrokerCommissions', items.length);
            setCommissionQueue(items.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 5));
        }, (err) => handleKPIError('pendingBrokerCommissions', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'contracts'), where('status', '==', 'ACTIVE')), (snap) => updateKPI('activeContracts', snap.size), (err) => handleKPIError('activeContracts', err)));
        unsubscribers.push(onSnapshot(collection(db, 'propertyPassports'), (snap) => updateKPI('propertyPassports', snap.size), (err) => handleKPIError('propertyPassports', err)));

        unsubscribers.push(onSnapshot(collection(db, 'documents'), (snap) => {
            updateKPI('documentsUploaded', snap.size);
            const expired = snap.docs.filter((row) => {
                const data = row.data();
                return isExpired(data.expiryDate || data.expiresAt || data.validUntil || data.tradeLicenseExpiry || data.passportExpiry);
            }).length;
            setExpiredDocuments(expired);
            updateKPI('expiredDocs', expired);
        }, (err) => { handleKPIError('documentsUploaded', err); handleKPIError('expiredDocs', err); }));

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        unsubscribers.push(onSnapshot(query(collection(db, 'audit_logs'), where('createdAt', '>=', Timestamp.fromDate(today))), (snap) => updateKPI('auditEventsToday', snap.size), (err) => handleKPIError('auditEventsToday', err)));

        unsubscribers.push(onSnapshot(doc(db, 'system_stats', 'orphans'), (snap) => updateKPI('orphanRecords', snap.exists() ? snap.data().total || 0 : 0), (err) => handleKPIError('orphanRecords', err)));

        unsubscribers.push(onSnapshot(doc(db, 'admin_summaries', 'global'), (snap) => {
            const data = snap.exists() ? snap.data() : {};
            setSummary(data);
            updateKPI('totalCollections', money(data.totalCollections));
            updateKPI('pendingLiquidity', money(data.pendingLiquidity));
            updateKPI('overduePayments', money(data.overduePayments));
            updateKPI('payrollPending', money(data.payrollPending));
        }, (err) => {
            handleKPIError('totalCollections', err);
            handleKPIError('pendingLiquidity', err);
            handleKPIError('overduePayments', err);
            handleKPIError('payrollPending', err);
        }));

        unsubscribers.push(onSnapshot(query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(10)), (snap) => {
            setRecentActivity(snap.docs.map((row) => {
                const data = row.data();
                return { id: row.id, actor: data.actor?.displayName || data.actorRole || data.actorId || 'SYSTEM', action: data.action || data.eventType || 'updated system state', module: data.module || data.targetType || 'Audit', status: data.status || 'RECORDED', timestamp: data.createdAt || data.timestamp || new Date() } as ActivityItem;
            }));
        }));

        // 11. Revenue trend (MRR growth) — same confirmed-payment-status
        // aggregation pattern already used by ReportsPage.tsx, comparing the
        // trailing 30 days of verified payment_transactions against the
        // preceding 30 days.
        const CONFIRMED_PAYMENT_STATUSES = new Set(['VERIFIED', 'APPROVED', 'PAID']);
        const now = new Date();
        const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const priorPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        getDocs(query(
            collection(db, "payment_transactions"),
            where("createdAt", ">=", Timestamp.fromDate(priorPeriodStart)),
            where("createdAt", "<=", Timestamp.fromDate(now))
        )).then((snap) => {
            let current = 0;
            let prior = 0;
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                if (!CONFIRMED_PAYMENT_STATUSES.has(String(data.status || '').toUpperCase())) return;
                const ts = data.createdAt?.toDate ? data.createdAt.toDate() : null;
                if (!ts) return;
                const amount = Number(data.amount || 0);
                if (ts >= periodStart) current += amount;
                else prior += amount;
            });
            const growthPercent = prior > 0 ? ((current - prior) / prior) * 100 : null;
            setRevenueTrend({ status: 'success', current, growthPercent });
        }).catch((err) => {
            console.warn('[Dashboard] revenue trend fetch failed:', err);
            setRevenueTrend({ status: 'error', current: 0, growthPercent: null });
        });

        setLastSync(new Date());
        return () => unsubscribers.forEach((unsub) => unsub());
    }, []);

    const launchHealthRows: LaunchHealthRow[] = [
        { label: 'Main App Build', status: getHealth(summary, 'mainAppBuild'), detail: 'Production route smoke' },
        { label: 'Command Panel Build', status: getHealth(summary, 'commandPanelBuild'), detail: 'Internal operations shell' },
        { label: 'Owner App Build', status: getHealth(summary, 'ownerAppBuild'), detail: 'Owner portal deploy' },
        { label: 'Functions Deploy', status: getHealth(summary, 'functionsDeploy'), detail: 'Cloud Functions health' },
        { label: 'Firestore Rules', status: getHealth(summary, 'firestoreRules'), detail: 'Rules hardening proof' },
        { label: 'Storage Rules', status: getHealth(summary, 'storageRules'), detail: 'Evidence access rules' },
        { label: 'App Check', status: getHealth(summary, 'appCheck'), detail: 'Production site key' },
        { label: 'Payment Verification', status: getHealth(summary, 'paymentVerification'), detail: 'Live or manual proof queue' },
        { label: 'Branded Email', status: getHealth(summary, 'brandedEmail'), detail: 'Outbound sender status' },
        { label: 'BIN Connect', status: getHealth(summary, 'binConnect'), detail: 'WhatsApp/webhook health' }
    ];

    const verifiedMonthly = Number(summary.monthlyCollections || summary.mrr || summary.monthlyRecurringRevenue || summary.totalCollections || 0);
    const growth = typeof summary.monthlyGrowthPct === 'number' ? `${summary.monthlyGrowthPct >= 0 ? '+' : ''}${summary.monthlyGrowthPct}%` : 'Trend unavailable';
    const securityScore = Number(summary.securityScore || summary.launchHealth?.securityScore || 0);
    const securityStatus = summary.securityStatus || summary.launchHealth?.securityStatus || (securityScore > 0 ? 'Measured' : 'Pending proof');

    const renderKPI = (key: string) => {
        const kpi = kpis[key];
        const isEmpty = kpi.value === 0 || kpi.value === 'AED 0';
        const borderColor = kpi.status === 'denied' || kpi.status === 'error' ? binThemeTokens.danger : alpha(binThemeTokens.gold, 0.1);
        const value = kpi.status === 'denied' ? 'ACCESS DENIED' : kpi.status === 'error' ? 'ERROR LOADING' : kpi.status === 'loading' ? 'Loading' : kpi.value;
        return (
            <Paper key={key} onClick={() => kpi.path && navigate(kpi.path)} sx={{ p: 2, bgcolor: binThemeTokens.graphite, border: `1px solid ${borderColor}`, borderRadius: 4, cursor: kpi.path ? 'pointer' : 'default', minHeight: 126 }}>
                <Box sx={{ color: kpi.status === 'denied' || kpi.status === 'error' ? binThemeTokens.danger : kpi.color, mb: 1 }}>{kpi.status === 'denied' ? <Lock size={18} /> : kpi.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 950, color: isEmpty ? 'rgba(255,255,255,0.2)' : '#fff' }}>{value}</Typography>
                {isEmpty && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 700, fontStyle: 'italic' }}>No records yet</Typography>}
            </Paper>
        );
    };

    listen('broker commissions', query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setCommissionQueue(rows.sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
      setLastSync(new Date());
    });

                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>PORTFOLIO KPIs</Typography>
                <Grid container spacing={2} sx={{ mb: 6 }}>
                    {Object.keys(kpis).map((key) => <Grid item xs={12} sm={6} md={3} lg={2.4} key={key}>{renderKPI(key)}</Grid>)}
                </Grid>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Shield color={binThemeTokens.gold} /> ACTION QUEUES</Typography>
                                <Chip label={`${approvalQueue.length + paymentProofs.length + commissionQueue.length} AWAITING`} size="small" sx={{ fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
                            </Box>
                            <TableContainer sx={{ maxHeight: 430 }}>
                                <Table stickyHeader size="small">
                                    <TableHead><TableRow><TableCell sx={{ bgcolor: '#0f172a' }}>ORIGIN</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>TYPE</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>LINKED</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>SUBMITTED</TableCell><TableCell sx={{ bgcolor: '#0f172a' }} align="right">ACTION</TableCell></TableRow></TableHead>
                                    <TableBody>{renderQueueRows([...approvalQueue, ...paymentProofs, ...commissionQueue], 'ALL CLEAR: NO PENDING ACTIONS')}</TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Wrench color={binThemeTokens.gold} /> LIVE OPERATIONS</Typography>
                            <Stack spacing={2}>
                                {operationsMissions.map((job) => (
                                    <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: `1px solid ${isBreached(job) ? alpha(binThemeTokens.danger, 0.35) : 'rgba(255,255,255,0.05)'}` }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION #{job.id.substring(0, 8)}</Typography><Chip label={job.priority || 'NORMAL'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? alpha(binThemeTokens.danger, 0.1) : 'rgba(255,255,255,0.05)', color: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? binThemeTokens.danger : 'inherit', fontWeight: 900 }} /></Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{job.title || job.issueType || job.category || 'Maintenance mission'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{job.propertyName || job.propertyTitle || propertyNamesById[job.propertyId] || 'Property not linked'}</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}><Box sx={{ display: 'flex', gap: 0.5 }}><Clock size={12} style={{ color: 'rgba(255,255,255,0.3)' }} /><Typography variant="caption" sx={{ color: isBreached(job) ? binThemeTokens.danger : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>SLA: {formatSla(job)}</Typography></Box><Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{normalizeStatus(job.status)}</Typography></Box>
                                    </Box>
                                ))}
                                {operationsMissions.length === 0 && <Box sx={{ py: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} /><Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO ACTIVE MISSIONS</Typography></Box>}
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 color={binThemeTokens.gold} /> LAUNCH HEALTH</Typography>
                            <Stack spacing={1.5}>{launchHealthRows.map((row) => <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{row.detail}</Typography></Box><Chip size="small" label={normalizeStatus(row.status)} sx={{ bgcolor: alpha(statusColor(row.status), 0.12), color: statusColor(row.status), fontWeight: 950 }} /></Box>)}</Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><DollarSign color={binThemeTokens.gold} /> FINANCIAL INTELLIGENCE</Typography>
                            <Stack spacing={3}><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>MONTHLY COLLECTIONS</Typography><Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><Typography variant="h4" fontWeight="950">{money(verifiedMonthly)}</Typography><Typography variant="caption" sx={{ color: statusColor(growth === 'Trend unavailable' ? 'UNKNOWN' : 'READY'), fontWeight: 900 }}>{growth}</Typography></Box></Box><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>30-DAY REVENUE (LIVE)</Typography><Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><Typography variant="h6" fontWeight="950">{revenueTrend.status === 'loading' ? 'Loading' : revenueTrend.status === 'error' ? 'Unavailable' : `AED ${Math.round(revenueTrend.current).toLocaleString()}`}</Typography>{revenueTrend.status === 'success' && revenueTrend.growthPercent !== null && <Typography variant="caption" sx={{ color: revenueTrend.growthPercent >= 0 ? '#10b981' : binThemeTokens.danger, fontWeight: 900 }}>{revenueTrend.growthPercent >= 0 ? '+' : ''}{revenueTrend.growthPercent.toFixed(1)}%</Typography>}{revenueTrend.status === 'success' && revenueTrend.growthPercent === null && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>No prior period</Typography>}</Box></Box><Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} /><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Verified Collections</Typography><Typography variant="body2" sx={{ fontWeight: 900 }}>{kpis.totalCollections.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Pending Liquidity</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>{kpis.pendingLiquidity.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Overdue Payments</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.danger }}>{kpis.overduePayments.value}</Typography></Box><Button fullWidth variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/transactions')}>FULL LEDGER ACCESS</Button></Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><FileText color={binThemeTokens.gold} /> COMPLIANCE & DOCS</Typography>
                            <Box sx={{ mb: 3 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SYSTEM SECURITY STATUS</Typography><Chip label={normalizeStatus(securityStatus)} size="small" sx={{ bgcolor: alpha(statusColor(securityStatus), 0.1), color: statusColor(securityStatus), fontWeight: 900, fontSize: '0.6rem' }} /></Box><Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}><LinearProgress variant="determinate" value={Math.max(0, Math.min(100, securityScore))} sx={{ height: 4, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { bgcolor: statusColor(securityStatus) } }} /></Box></Box>
                            <Stack spacing={2}><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(59,130,246,0.1)', borderRadius: 2, color: '#3b82f6' }}><Shield size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Governance Audit</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>audit_logs listener active</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: statusColor(kpis.auditEventsToday.status === 'success' ? 'ACTIVE' : 'UNKNOWN'), fontWeight: 900 }}>{kpis.auditEventsToday.status === 'success' ? 'ACTIVE' : 'UNKNOWN'}</Typography></Box><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(245,158,11,0.1)', borderRadius: 2, color: '#f59e0b' }}><FileWarning size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Expired Documents</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Firestore-driven expiry check</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: expiredDocuments ? '#f59e0b' : '#10b981', fontWeight: 900 }}>{expiredDocuments} PENDING</Typography></Box></Stack>
                            <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate('/document-vault')}>OPEN VAULT</Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Activity color={binThemeTokens.gold} /> RECENT ACTIVITY</Typography>
                            <Stack spacing={2.5}>{recentActivity.map((log) => <Box key={log.id} sx={{ display: 'flex', gap: 2 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} /><Box><Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{log.actor} <Box component="span" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{log.action}</Box></Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, display: 'block', mt: 0.5 }}>{log.module} • {(log.timestamp as any)?.toDate ? (log.timestamp as any).toDate().toLocaleTimeString() : 'Just now'}</Typography></Box></Box>)}{recentActivity.length === 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>NO RECENT ACTIVITY LOGGED</Typography>}</Stack>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>COMMAND SUPPORT TERMINAL</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600 }}>Support channels are available for critical infrastructure failure. Standard audit logs and system monitoring remain the primary path for routine operations.</Typography></Box><CeoContactButtons compact /></Stack>
                </Paper>
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

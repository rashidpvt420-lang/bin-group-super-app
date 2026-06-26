// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
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
  where,
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
  note?: string;
};

type MrrStats = {
  currentMonth: number;
  previousMonth: number;
  trendPercent: number | null;
};

type UserStats = {
  owners: number;
  tenants: number;
  technicians: number;
  activeTechnicians: number;
  brokers: number;
};

type PropertyStats = {
  properties: number;
  units: number;
  namesById: Record<string, string>;
};

type LaunchHealthRow = {
  label: string;
  status: string;
  detail: string;
  route?: string;
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

const CLOSED_TICKET_STATUSES = ['COMPLETED', 'CLOSED', 'RESOLVED', 'completed', 'closed', 'resolved'];
const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const PENDING_COMMISSION_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];
const OPEN_REVIEW_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW', 'pending_admin_approval', 'pending_approval'];
const TECH_PENDING_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval', 'pending_approval'];
const ACTIVE_CONTRACT_STATES = ['ACTIVE', 'SIGNED', 'active', 'signed'];
const APPROVED_PAYMENT_STATES = new Set(['PAID', 'PAID_MANUAL', 'RECONCILED', 'ADMIN_VERIFIED', 'VERIFIED', 'APPROVED']);

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

const statusTone = (value: any) => {
  const status = normalizeStatus(value);
  if (['READY', 'ACTIVE', 'PASS', 'GREEN', 'VERIFIED', 'CLEAR', 'PAID', 'RECONCILED', 'HEALTHY', 'ONLINE'].some((word) => status.includes(word))) return '#10b981';
  if (['BLOCKED', 'FAIL', 'ERROR', 'BREACH', 'EXPIRED', 'DENIED', 'DOWN', 'OVERDUE'].some((word) => status.includes(word))) return binThemeTokens.danger;
  if (['PENDING', 'REVIEW', 'UNKNOWN', 'WARNING', 'DEGRADED', 'CONFIG'].some((word) => status.includes(word))) return binThemeTokens.warning;
  return 'rgba(255,255,255,0.62)';
};

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
  const slaMinutes = Number(mission.slaMinutes || mission.slaBudgetMinutes);
  if (created && Number.isFinite(slaMinutes) && slaMinutes > 0) return created + slaMinutes * 60_000;
  return created ? created + resolveSlaPolicyMs(mission) : 0;
};

const isBreached = (mission: RecordRow) => {
  if (mission.slaBreached === true || normalizeStatus(mission.slaStatus).includes('BREACHED')) return true;
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

const formatDateTime = (value: any) => {
  const millis = getMillis(value);
  return millis ? new Date(millis).toLocaleString('en-AE') : 'Not recorded';
};

const isExpiredOrExpiring = (value: any) => {
  const expiry = getMillis(value);
  if (!expiry) return false;
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  return expiry <= Date.now() + thirtyDays;
};

const reviewPathFor = (item: RecordRow) => {
  if (item.type === 'OWNER_ONBOARDING') return '/vault';
  if (item.type === 'TECH_ONBOARD') return '/technicians';
  if (item.type === 'PAYMENT_PROOF') return '/manual-approvals';
  if (item.type === 'BROKER_COMMISSION') return '/broker';
  return '/dashboard';
};

const linkedNameFor = (row: RecordRow) => row.linkedName || row.ownerEmail || row.tenantEmail || row.payerEmail || row.brokerName || row.brokerEmail || row.displayName || row.email || row.propertyName || row.id;

const getHealth = (summary: Record<string, any>, key: string) => String(summary?.launchHealth?.[key] || summary?.systemHealth?.[key] || summary?.[key] || 'PENDING');

export default function DashboardPage() {
  const navigate = useNavigate();
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [propertyStats, setPropertyStats] = useState<PropertyStats>({ properties: 0, units: 0, namesById: {} });
  const [userStats, setUserStats] = useState<UserStats>({ owners: 0, tenants: 0, technicians: 0, activeTechnicians: 0, brokers: 0 });
  const [operationsMissions, setOperationsMissions] = useState<RecordRow[]>([]);
  const [ownerApprovalQueue, setOwnerApprovalQueue] = useState<RecordRow[]>([]);
  const [technicianApprovalQueue, setTechnicianApprovalQueue] = useState<RecordRow[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<RecordRow[]>([]);
  const [commissionQueue, setCommissionQueue] = useState<RecordRow[]>([]);
  const [activeContracts, setActiveContracts] = useState(0);
  const [documentStats, setDocumentStats] = useState<{ total: number; expiring: RecordRow[] }>({ total: 0, expiring: [] });
  const [auditEventsToday, setAuditEventsToday] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecordRow[]>([]);
  const [orphanRecords, setOrphanRecords] = useState(0);
  const [propertyPassports, setPropertyPassports] = useState(0);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [systemHealth, setSystemHealth] = useState<Record<string, any>>({});
  const [mrrStats, setMrrStats] = useState<MrrStats>({ currentMonth: 0, previousMonth: 0, trendPercent: null });
  const [streamErrors, setStreamErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    const markSync = () => setLastSync(new Date());
    const reportError = (label: string) => (error: any) => {
      console.warn(`[ADMIN_DASHBOARD] ${label} stream failed`, error);
      setStreamErrors((prev) => ({ ...prev, [label]: error?.message || 'Listener failed' }));
    };
    const listen = (label: string, source: any, onNext: (snap: any) => void) => {
      const unsubscribe = onSnapshot(source, (snap: any) => {
        setStreamErrors((prev) => {
          if (!prev[label]) return prev;
          const next = { ...prev };
          delete next[label];
          return next;
        });
        onNext(snap);
        markSync();
      }, reportError(label));
      unsubscribers.push(unsubscribe);
    };

    listen('properties', collection(db, 'properties'), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      const namesById: Record<string, string> = {};
      const units = rows.reduce((sum, row) => {
        const name = row.propertyName || row.name || row.title;
        if (name) namesById[row.id] = String(name);
        return sum + Number(row.units || row.totalUnits || row.unitsCount || row.unitCount || 0);
      }, 0);
      setPropertyStats({ properties: rows.length, units, namesById });
    });

    listen('users', collection(db, 'users'), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      const roleOf = (row: RecordRow) => String(row.role || row.userRole || '').toLowerCase();
      const statusOf = (row: RecordRow) => String(row.status || row.approvalStatus || '').toUpperCase();

      setUserStats({
        owners: rows.filter((row) => roleOf(row) === 'owner').length,
        tenants: rows.filter((row) => roleOf(row) === 'tenant').length,
        technicians: rows.filter((row) => roleOf(row) === 'technician').length,
        activeTechnicians: rows.filter((row) => roleOf(row) === 'technician' && ['ACTIVE', 'APPROVED', 'VERIFIED'].some((state) => statusOf(row).includes(state))).length,
        brokers: rows.filter((row) => roleOf(row) === 'broker').length,
      });

      setTechnicianApprovalQueue(rows
        .filter((row) => roleOf(row) === 'technician' && TECH_PENDING_STATES.includes(String(row.status || row.approvalStatus || '')))
        .map((row) => ({ ...row, type: 'TECH_ONBOARD', origin: 'Technician onboarding', linkedName: row.displayName || row.email || row.id, createdAt: row.createdAt || row.submittedAt }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
        .slice(0, 8));
    });

    listen('active tickets', query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      setOperationsMissions(rows
        .filter((row) => !CLOSED_TICKET_STATUSES.includes(String(row.status || '')))
        .sort((a, b) => getMillis(b.updatedAt || b.createdAt || b.reportedAt) - getMillis(a.updatedAt || a.createdAt || a.reportedAt))
        .slice(0, 12));
    });

    listen('owner approvals', query(collection(db, 'intake_submissions'), where('status', 'in', OPEN_REVIEW_STATES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'OWNER_ONBOARDING', origin: 'Owner onboarding', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setOwnerApprovalQueue(rows
        .map((row) => ({
          ...row,
          linkedName: row.companyProfile?.name || row.ownerEmail || row.ownerUid || row.ownerId || row.id,
          createdAt: row.submittedAt || row.createdAt,
        }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt))
        .slice(0, 8));
    });

    listen('payment queue', query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setPaymentQueue(rows
        .map((row) => ({ ...row, linkedName: linkedNameFor(row), createdAt: row.createdAt || row.submittedAt }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    });

    listen('broker commissions', query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES), limit(10)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', ...(row.data() as Record<string, any>) })) as RecordRow[];
      setCommissionQueue(rows
        .map((row) => ({ ...row, linkedName: linkedNameFor(row), createdAt: row.createdAt || row.submittedAt || row.requestedAt }))
        .sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    });

    listen('contracts', query(collection(db, 'contracts'), where('status', 'in', ACTIVE_CONTRACT_STATES)), (snap) => {
      setActiveContracts(snap.size || snap.docs.length);
    });

    listen('property passports', collection(db, 'propertyPassports'), (snap) => {
      setPropertyPassports(snap.size || snap.docs.length);
    });

    listen('documents', collection(db, 'documents'), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      const expiring = rows
        .filter((row) => isExpiredOrExpiring(row.expiryDate || row.expiresAt || row.validUntil || row.tradeLicenseExpiry || row.passportExpiry))
        .sort((a, b) => getMillis(a.expiryDate || a.expiresAt || a.validUntil || a.tradeLicenseExpiry || a.passportExpiry) - getMillis(b.expiryDate || b.expiresAt || b.validUntil || b.tradeLicenseExpiry || b.passportExpiry))
        .slice(0, 8);
      setDocumentStats({ total: rows.length, expiring });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    listen('audit today', query(collection(db, 'audit_logs'), where('createdAt', '>=', Timestamp.fromDate(today))), (snap) => {
      setAuditEventsToday(snap.size || snap.docs.length);
    });

    listen('recent activity', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(10)), (snap) => {
      setRecentActivity(snap.docs.map((row: any) => {
        const data = row.data() as Record<string, any>;
        return {
          id: row.id,
          actor: data.actor?.displayName || data.actorRole || data.actorId || 'SYSTEM',
          action: data.action || data.eventType || 'updated system state',
          module: data.module || data.targetType || 'Audit',
          status: data.status || 'RECORDED',
          timestamp: data.createdAt || data.timestamp,
        };
      }));
    });

    listen('orphan records', doc(db, 'system_stats', 'orphans'), (snap) => {
      setOrphanRecords(snap.exists() ? Number(snap.data()?.total || snap.data()?.count || 0) : 0);
    });

    listen('admin summary', doc(db, 'admin_summaries', 'global'), (snap) => {
      setSummary(snap.exists() ? (snap.data() as Record<string, any>) : {});
    });

    listen('system health', doc(db, 'system_health', 'dashboard'), (snap) => {
      setSystemHealth(snap.exists() ? (snap.data() as Record<string, any>) : {});
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const priorPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    getDocs(query(
      collection(db, 'payment_transactions'),
      where('createdAt', '>=', Timestamp.fromDate(priorPeriodStart)),
      where('createdAt', '<=', Timestamp.fromDate(now)),
    )).then((snap) => {
      let currentMonth = 0;
      let previousMonth = 0;
      snap.docs.forEach((docSnap: any) => {
        const data = docSnap.data() as Record<string, any>;
        if (!APPROVED_PAYMENT_STATES.has(String(data.status || '').toUpperCase())) return;
        const createdAt = getMillis(data.createdAt || data.paidAt || data.verifiedAt);
        const amount = Number(data.amount || data.total || data.amountPaid || 0);
        if (!createdAt || !Number.isFinite(amount)) return;
        if (createdAt >= periodStart.getTime()) currentMonth += amount;
        else previousMonth += amount;
      });
      setMrrStats({
        currentMonth,
        previousMonth,
        trendPercent: previousMonth > 0 ? ((currentMonth - previousMonth) / previousMonth) * 100 : null,
      });
    }).catch((error) => {
      console.warn('[ADMIN_DASHBOARD] Revenue trend fetch failed', error);
      setStreamErrors((prev) => ({ ...prev, revenueTrend: error?.message || 'Revenue trend failed' }));
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [refreshToken]);

  const approvalQueue = useMemo(
    () => [...ownerApprovalQueue, ...technicianApprovalQueue].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)),
    [ownerApprovalQueue, technicianApprovalQueue],
  );

  const actionQueue = useMemo(
    () => [...approvalQueue, ...paymentQueue, ...commissionQueue].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 12),
    [approvalQueue, paymentQueue, commissionQueue],
  );

  const activeEmergencyMissions = operationsMissions.filter((mission) => normalizeStatus(mission.priority || mission.severity || mission.category).includes('EMERGENCY'));
  const breachedMissions = operationsMissions.filter(isBreached);
  const nearBreachMissions = operationsMissions.filter(isNearBreach);

  const metrics: Metric[] = useMemo(() => [
    { label: 'Properties', value: propertyStats.properties, icon: <Building2 size={20} />, tone: binThemeTokens.gold, route: '/owners', note: 'Managed portfolio' },
    { label: 'Units', value: propertyStats.units, icon: <Home size={20} />, tone: '#38bdf8', route: '/admin/unit-status', note: 'Linked unit count' },
    { label: 'Owners', value: userStats.owners, icon: <Briefcase size={20} />, tone: '#a78bfa', route: '/owners', note: 'Owner accounts' },
    { label: 'Tenants', value: userStats.tenants, icon: <Home size={20} />, tone: '#34d399', route: '/tenants', note: 'Tenant accounts' },
    { label: 'Open Missions', value: operationsMissions.length, icon: <Wrench size={20} />, tone: '#60a5fa', route: '/tickets', note: 'Active work orders' },
    { label: 'SLA Breaches', value: breachedMissions.length, icon: <AlertTriangle size={20} />, tone: breachedMissions.length ? binThemeTokens.danger : '#10b981', route: '/tickets', note: 'Needs dispatch action' },
    { label: 'Near Breach', value: nearBreachMissions.length, icon: <Clock size={20} />, tone: nearBreachMissions.length ? binThemeTokens.warning : '#10b981', route: '/tickets', note: 'Under 60 minutes' },
    { label: 'SOS/Emergency', value: activeEmergencyMissions.length, icon: <Shield size={20} />, tone: activeEmergencyMissions.length ? binThemeTokens.danger : '#10b981', route: '/sos', note: 'Priority response' },
    { label: 'Technicians', value: userStats.activeTechnicians, icon: <Wrench size={20} />, tone: '#22c55e', route: '/technicians', note: `${userStats.technicians} total` },
    { label: 'Brokers', value: userStats.brokers, icon: <Briefcase size={20} />, tone: '#f97316', route: '/broker', note: 'Lead partners' },
    { label: 'Owner Approvals', value: ownerApprovalQueue.length, icon: <CheckCircle2 size={20} />, tone: ownerApprovalQueue.length ? binThemeTokens.warning : '#10b981', route: '/vault', note: 'Intake review' },
    { label: 'Tech Approvals', value: technicianApprovalQueue.length, icon: <CheckCircle2 size={20} />, tone: technicianApprovalQueue.length ? binThemeTokens.warning : '#10b981', route: '/technicians', note: 'Onboarding review' },
    { label: 'Payment Reviews', value: paymentQueue.length, icon: <DollarSign size={20} />, tone: paymentQueue.length ? binThemeTokens.warning : '#10b981', route: '/manual-approvals', note: 'Manual verification' },
    { label: 'Broker Commissions', value: commissionQueue.length, icon: <DollarSign size={20} />, tone: commissionQueue.length ? binThemeTokens.warning : '#10b981', route: '/broker', note: 'Payout approval' },
    { label: 'Active Contracts', value: activeContracts, icon: <FileText size={20} />, tone: '#38bdf8', route: '/contracts/termination', note: 'Live agreements' },
    { label: 'Docs Expiring', value: documentStats.expiring.length, icon: <FileText size={20} />, tone: documentStats.expiring.length ? binThemeTokens.warning : '#10b981', route: '/document-vault', note: `${documentStats.total} documents` },
    { label: 'Audit Today', value: auditEventsToday, icon: <Activity size={20} />, tone: '#c084fc', route: '/audit', note: 'Governance events' },
    { label: 'Orphans', value: orphanRecords, icon: <AlertTriangle size={20} />, tone: orphanRecords ? binThemeTokens.danger : '#10b981', route: '/orphans', note: 'Data integrity' },
  ], [
    activeContracts,
    auditEventsToday,
    breachedMissions.length,
    commissionQueue.length,
    documentStats.expiring.length,
    documentStats.total,
    nearBreachMissions.length,
    operationsMissions.length,
    orphanRecords,
    ownerApprovalQueue.length,
    paymentQueue.length,
    propertyStats.properties,
    propertyStats.units,
    technicianApprovalQueue.length,
    userStats,
    activeEmergencyMissions.length,
  ]);

  const mergedHealth = useMemo(() => ({ ...systemHealth, ...summary, launchHealth: { ...(systemHealth.launchHealth || {}), ...(summary.launchHealth || {}) } }), [summary, systemHealth]);

  const launchHealthRows: LaunchHealthRow[] = [
    { label: 'Main App Build', status: getHealth(mergedHealth, 'mainAppBuild'), detail: 'Production route smoke', route: '/ops/public' },
    { label: 'Admin Panel Build', status: getHealth(mergedHealth, 'commandPanelBuild') || getHealth(mergedHealth, 'adminPanelBuild'), detail: 'Internal command center', route: '/control-center' },
    { label: 'Owner Portal Build', status: getHealth(mergedHealth, 'ownerAppBuild'), detail: 'Owner route health', route: '/owners' },
    { label: 'Functions Deploy', status: getHealth(mergedHealth, 'functionsDeploy'), detail: 'Cloud Functions runtime', route: '/control-center' },
    { label: 'Firestore Rules', status: getHealth(mergedHealth, 'firestoreRules'), detail: 'RBAC and data boundary proof', route: '/audit-shield' },
    { label: 'Storage Rules', status: getHealth(mergedHealth, 'storageRules'), detail: 'Evidence and document access', route: '/audit-shield' },
    { label: 'App Check', status: getHealth(mergedHealth, 'appCheck'), detail: 'Production site key', route: '/settings' },
    { label: 'Payment Verification', status: paymentQueue.length ? 'PENDING REVIEW' : getHealth(mergedHealth, 'paymentVerification'), detail: 'Manual/live proof queue', route: '/manual-approvals' },
    { label: 'Broker Ops', status: commissionQueue.length ? 'PENDING REVIEW' : getHealth(mergedHealth, 'brokerOps'), detail: 'Lead and commission flow', route: '/broker' },
    { label: 'Document Vault', status: documentStats.expiring.length ? 'WARNING' : getHealth(mergedHealth, 'documentVault'), detail: 'Passport, contracts, PDFs', route: '/document-vault' },
  ];

  const verifiedMonthly = Number(summary.monthlyCollections || summary.mrr || summary.monthlyRecurringRevenue || summary.totalCollections || mrrStats.currentMonth || 0);
  const growth = typeof summary.monthlyGrowthPct === 'number'
    ? `${summary.monthlyGrowthPct >= 0 ? '+' : ''}${summary.monthlyGrowthPct}%`
    : mrrStats.trendPercent === null
      ? 'No prior period'
      : `${mrrStats.trendPercent >= 0 ? '+' : ''}${mrrStats.trendPercent.toFixed(1)}%`;
  const securityScore = Number(summary.securityScore || summary.launchHealth?.securityScore || systemHealth.securityScore || 0);
  const securityStatus = summary.securityStatus || summary.launchHealth?.securityStatus || systemHealth.securityStatus || (securityScore > 0 ? 'Measured' : 'Pending proof');
  const errorCount = Object.keys(streamErrors).length;

  return (
    <AdminPageFrame
      title="Command Center"
      subtitle="Admin launch cockpit for approvals, payments, broker commissions, live maintenance, documents, audit, and public launch readiness."
      status={errorCount ? `${errorCount} STREAM WARNING${errorCount > 1 ? 'S' : ''}` : 'LIVE'}
      lastUpdated={lastSync}
      onRefresh={() => setRefreshToken((value) => value + 1)}
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <Stack spacing={4}>
        {errorCount > 0 && (
          <Paper sx={{ p: 2.5, borderRadius: 4, bgcolor: alpha(binThemeTokens.warning, 0.08), border: `1px solid ${alpha(binThemeTokens.warning, 0.28)}` }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
              <AlertTriangle color={binThemeTokens.warning} size={22} />
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 950, color: binThemeTokens.warning }}>Some admin listeners need attention</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.66)', fontWeight: 650 }}>
                  {Object.entries(streamErrors).slice(0, 3).map(([label, message]) => `${label}: ${message}`).join(' | ')}
                </Typography>
              </Box>
              <Button variant="outlined" onClick={() => navigate('/audit-shield')}>Open Audit Shield</Button>
            </Stack>
          </Paper>
        )}

        <Grid container spacing={2}>
          {metrics.map((metric) => (
            <Grid item xs={12} sm={6} md={4} lg={2} key={metric.label}>
              <MetricCard metric={metric} onClick={() => metric.route && navigate(metric.route)} />
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 5, bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}>
              <SectionHeader
                icon={<Shield color={binThemeTokens.gold} size={22} />}
                title="Action Queues"
                subtitle="Owner intake, technician approvals, payment proofs, and broker commissions."
                action={<Chip label={`${actionQueue.length} awaiting`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />}
              />
              <TableContainer sx={{ maxHeight: 430 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950 }}>Origin</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950 }}>Type</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950 }}>Linked record</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950 }}>Submitted</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a', fontWeight: 950 }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {actionQueue.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} sx={{ py: 5, textAlign: 'center', color: 'rgba(255,255,255,0.34)', fontWeight: 900 }}>
                          ALL CLEAR: NO PENDING ADMIN ACTIONS
                        </TableCell>
                      </TableRow>
                    ) : actionQueue.map((item) => (
                      <TableRow key={`${item.type}-${item.id}`} hover>
                        <TableCell>{item.origin || 'Admin queue'}</TableCell>
                        <TableCell>
                          <Chip size="small" label={normalizeStatus(item.type)} sx={{ bgcolor: alpha(statusTone(item.status), 0.12), color: statusTone(item.status), fontWeight: 900 }} />
                        </TableCell>
                        <TableCell>{linkedNameFor(item)}</TableCell>
                        <TableCell>{formatDateTime(item.createdAt || item.submittedAt || item.requestedAt)}</TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="outlined" onClick={() => navigate(reviewPathFor(item))}>Review</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 0, borderRadius: 5, overflow: 'hidden', bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, height: '100%' }}>
              <SectionHeader
                icon={<Wrench color={binThemeTokens.gold} size={22} />}
                title="Live Operations"
                subtitle="Active maintenance missions with SLA risk."
                action={<Button size="small" variant="outlined" onClick={() => navigate('/tickets')}>Open Tickets</Button>}
              />
              <Stack spacing={1.5} sx={{ p: 3, pt: 0, maxHeight: 430, overflowY: 'auto' }}>
                {operationsMissions.length === 0 ? (
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <CheckCircle2 size={44} color="rgba(255,255,255,0.14)" />
                    <Typography sx={{ mt: 1.5, color: 'rgba(255,255,255,0.36)', fontWeight: 900 }}>NO ACTIVE MISSIONS</Typography>
                  </Box>
                ) : operationsMissions.map((job) => {
                  const breached = isBreached(job);
                  const near = isNearBreach(job);
                  const missionTone = breached ? binThemeTokens.danger : near ? binThemeTokens.warning : '#10b981';
                  return (
                    <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: `1px solid ${alpha(missionTone, breached || near ? 0.45 : 0.16)}` }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>MISSION #{String(job.id).substring(0, 8)}</Typography>
                        <Chip size="small" label={normalizeStatus(job.priority || job.severity || 'NORMAL')} sx={{ height: 20, bgcolor: alpha(missionTone, 0.12), color: missionTone, fontWeight: 900, fontSize: '0.65rem' }} />
                      </Stack>
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 850 }}>{job.title || job.issueType || job.category || 'Maintenance mission'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.46)', display: 'block', mt: 0.4 }}>
                        {job.propertyName || job.propertyTitle || propertyStats.namesById[job.propertyId] || 'Property not linked'}
                      </Typography>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.25 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Clock size={13} color={missionTone} />
                          <Typography variant="caption" sx={{ color: missionTone, fontWeight: 800 }}>SLA: {formatSla(job)}</Typography>
                        </Stack>
                        <Typography variant="caption" sx={{ color: statusTone(job.status), fontWeight: 950 }}>{normalizeStatus(job.status)}</Typography>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 5, bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <CheckCircle2 color={binThemeTokens.gold} /> Launch Health
              </Typography>
              <Stack spacing={1.5}>
                {launchHealthRows.map((row) => (
                  <Box key={row.label} onClick={() => row.route && navigate(row.route)} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center', cursor: row.route ? 'pointer' : 'default', p: 1.25, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.025)' }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 850 }}>{row.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{row.detail}</Typography>
                    </Box>
                    <Chip size="small" label={normalizeStatus(row.status)} sx={{ bgcolor: alpha(statusTone(row.status), 0.12), color: statusTone(row.status), fontWeight: 950 }} />
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 5, bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <DollarSign color={binThemeTokens.gold} /> Financial Intelligence
              </Typography>
              <Stack spacing={2.25}>
                <MetricLine label="Monthly collections" value={money(verifiedMonthly)} color="#fff" />
                <MetricLine label="30-day verified revenue" value={money(mrrStats.currentMonth)} color="#fff" />
                <MetricLine label="Revenue trend" value={growth} color={growth.startsWith('-') ? binThemeTokens.danger : '#10b981'} />
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                <MetricLine label="Total collections" value={money(summary.totalCollections)} muted />
                <MetricLine label="Pending liquidity" value={money(summary.pendingLiquidity)} color={binThemeTokens.gold} />
                <MetricLine label="Overdue payments" value={money(summary.overduePayments)} color={binThemeTokens.danger} />
                <Button fullWidth variant="outlined" onClick={() => navigate('/transactions')}>Open Ledger</Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 5, bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}`, height: '100%' }}>
              <Typography variant="h6" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <FileText color={binThemeTokens.gold} /> Compliance & Documents
              </Typography>
              <Stack spacing={2.25}>
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.46)', fontWeight: 900 }}>Security status</Typography>
                    <Chip size="small" label={normalizeStatus(securityStatus)} sx={{ bgcolor: alpha(statusTone(securityStatus), 0.12), color: statusTone(securityStatus), fontWeight: 900 }} />
                  </Stack>
                  <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, securityScore))} sx={{ height: 6, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: statusTone(securityStatus) } }} />
                </Box>
                <MetricLine label="Property passports" value={String(propertyPassports)} muted />
                <MetricLine label="Document vault total" value={String(documentStats.total)} muted />
                <MetricLine label="Expiring/expired documents" value={String(documentStats.expiring.length)} color={documentStats.expiring.length ? binThemeTokens.warning : '#10b981'} />
                <Button fullWidth variant="outlined" onClick={() => navigate('/document-vault')}>Open Vault</Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 3, borderRadius: 5, bgcolor: binThemeTokens.panel, border: `1px solid ${alpha(binThemeTokens.gold, 0.12)}` }}>
              <Typography variant="h6" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
                <Activity color={binThemeTokens.gold} /> Recent Activity
              </Typography>
              <Stack spacing={2}>
                {recentActivity.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.36)', fontWeight: 800, py: 3, textAlign: 'center' }}>NO RECENT ACTIVITY LOGGED</Typography>
                ) : recentActivity.map((log) => (
                  <Stack key={log.id} direction="row" spacing={2} alignItems="flex-start">
                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: statusTone(log.status), mt: 0.75 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ color: '#fff', fontWeight: 850 }}>
                        {log.actor} <Box component="span" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{log.action}</Box>
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 750 }}>
                        {log.module} • {formatDateTime(log.timestamp)}
                      </Typography>
                    </Box>
                    <Chip size="small" label={normalizeStatus(log.status)} sx={{ bgcolor: alpha(statusTone(log.status), 0.12), color: statusTone(log.status), fontWeight: 900 }} />
                  </Stack>
                ))}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, height: '100%' }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>Command Support Terminal</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.64)', fontWeight: 650, mt: 1, mb: 3 }}>
                Use this block for critical infrastructure failures only. Routine launch issues should move through audit, reports, approvals, and operational queues.
              </Typography>
              <CeoContactButtons compact />
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </AdminPageFrame>
  );
}

function SectionHeader({ icon, title, subtitle, action }: { icon: React.ReactNode; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <Box>
        <Typography variant="h6" sx={{ fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.25 }}>{icon} {title}</Typography>
        {subtitle && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 750 }}>{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

function MetricCard({ metric, onClick }: { metric: Metric; onClick?: () => void }) {
  const empty = metric.value === 0 || metric.value === 'AED 0';
  return (
    <Paper
      onClick={onClick}
      sx={{
        p: 2,
        minHeight: 132,
        borderRadius: 4,
        cursor: metric.route ? 'pointer' : 'default',
        bgcolor: binThemeTokens.panel,
        border: `1px solid ${alpha(metric.tone, 0.24)}`,
        transition: 'transform 0.16s ease, border-color 0.16s ease',
        '&:hover': metric.route ? { transform: 'translateY(-2px)', borderColor: alpha(metric.tone, 0.5) } : undefined,
      }}
    >
      <Box sx={{ color: metric.tone, mb: 1 }}>{metric.icon}</Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.44)', fontWeight: 950, display: 'block' }}>{metric.label}</Typography>
      <Typography variant="h5" sx={{ color: empty ? 'rgba(255,255,255,0.42)' : '#fff', fontWeight: 950, lineHeight: 1.1 }}>{metric.value}</Typography>
      {metric.note && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 750, display: 'block', mt: 0.75 }}>{metric.note}</Typography>}
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

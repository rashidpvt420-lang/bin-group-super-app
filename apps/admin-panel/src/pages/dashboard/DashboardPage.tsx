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
  Users,
  Wallet,
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
type RevenueTrend = { status: 'loading' | 'success' | 'error'; current: number; growthPercent: number | null };
type KpiStatus = 'loading' | 'success' | 'error' | 'denied';
type KpiCard = {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  path?: string;
  status?: KpiStatus;
  helper?: string;
};

type ActivityItem = {
  id: string;
  actor: string;
  action: string;
  module: string;
  status: string;
  timestamp: any;
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
  'WAITING_PARTS',
  'ESCALATED',
  'open',
  'pending',
  'assigned',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
];
const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const PENDING_COMMISSION_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];
const PENDING_OWNER_STATUSES = ['AWAITING_VERIFICATION', 'PENDING', 'PENDING_ADMIN_REVIEW', 'pending_admin_review'];
const PENDING_TECHNICIAN_STATUSES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval', 'pending_approval'];
const CONFIRMED_PAYMENT_STATUSES = new Set(['VERIFIED', 'APPROVED', 'PAID', 'PAID_MANUAL', 'RECONCILED', 'ADMIN_VERIFIED']);

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

const resolveSlaPolicyMs = (mission: RecordRow) => {
  const explicitMinutes = Number(mission.slaMinutes || mission.slaBudgetMinutes || 0);
  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) return explicitMinutes * 60_000;

  const severity = normalizeStatus(mission.severity || mission.priority || mission.urgency || mission.category);
  if (severity.includes('EMERGENCY') || severity.includes('CRITICAL')) return 30 * 60_000;
  if (severity.includes('HIGH') || severity.includes('URGENT')) return 2 * 60 * 60_000;
  return 4 * 60 * 60_000;
};

const resolveSlaDueAt = (mission: RecordRow) => {
  const explicitDue = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
  if (explicitDue) return explicitDue;
  const created = getMillis(mission.createdAt || mission.reportedAt || mission.openedAt);
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
  return remainingMs > 0 && remainingMs <= 60 * 60_000;
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

const statusColor = (value: any) => {
  const status = normalizeStatus(value);
  if (['READY', 'ACTIVE', 'PASS', 'GREEN', 'VERIFIED', 'CLEAR', 'PAID', 'RECONCILED', 'HEALTHY'].some((word) => status.includes(word))) return '#10b981';
  if (['BLOCKED', 'FAIL', 'ERROR', 'BREACH', 'EXPIRED', 'DENIED', 'DOWN'].some((word) => status.includes(word))) return binThemeTokens.danger;
  if (['PENDING', 'REVIEW', 'UNKNOWN', 'WARNING', 'DEGRADED'].some((word) => status.includes(word))) return binThemeTokens.warning;
  return 'rgba(255,255,255,0.62)';
};

const reviewPathFor = (item: RecordRow) => {
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

const isExpired = (value: any) => {
  const millis = getMillis(value);
  return millis > 0 && millis < Date.now();
};

const getHealth = (summary: Record<string, any>, key: string) => {
  return summary.launchHealth?.[key] || summary.systemHealth?.[key] || summary[key] || 'UNKNOWN';
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const [properties, setProperties] = useState(0);
  const [units, setUnits] = useState(0);
  const [activeTenants, setActiveTenants] = useState(0);
  const [pendingTenantInvites, setPendingTenantInvites] = useState(0);
  const [activeTechnicians, setActiveTechnicians] = useState(0);
  const [activeBrokers, setActiveBrokers] = useState(0);
  const [activeContracts, setActiveContracts] = useState(0);
  const [propertyPassports, setPropertyPassports] = useState(0);
  const [documentsUploaded, setDocumentsUploaded] = useState(0);
  const [expiredDocuments, setExpiredDocuments] = useState(0);
  const [auditEventsToday, setAuditEventsToday] = useState(0);
  const [orphanRecords, setOrphanRecords] = useState(0);
  const [operationsMissions, setOperationsMissions] = useState<RecordRow[]>([]);
  const [propertyNamesById, setPropertyNamesById] = useState<Record<string, string>>({});
  const [approvalQueue, setApprovalQueue] = useState<RecordRow[]>([]);
  const [paymentProofs, setPaymentProofs] = useState<RecordRow[]>([]);
  const [commissionQueue, setCommissionQueue] = useState<RecordRow[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [revenueTrend, setRevenueTrend] = useState<RevenueTrend>({ status: 'loading', current: 0, growthPercent: null });
  const [streamErrors, setStreamErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    const unsubscribers: Array<() => void> = [];
    const markSync = () => setLastSync(new Date());
    const listen = (label: string, source: any, onNext: (snap: any) => void) => {
      try {
        const unsubscribe = onSnapshot(
          source,
          (snap: any) => {
            onNext(snap);
            markSync();
            setStreamErrors((prev) => {
              if (!prev[label]) return prev;
              const next = { ...prev };
              delete next[label];
              return next;
            });
          },
          (error: any) => {
            console.warn(`[ADMIN_DASHBOARD] ${label} stream failed`, error);
            setStreamErrors((prev) => ({ ...prev, [label]: error?.code || error?.message || 'stream failed' }));
          }
        );
        unsubscribers.push(unsubscribe);
      } catch (error: any) {
        console.warn(`[ADMIN_DASHBOARD] ${label} stream could not start`, error);
        setStreamErrors((prev) => ({ ...prev, [label]: error?.code || error?.message || 'stream failed' }));
      }
    };

    listen('properties', collection(db, 'properties'), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
      const names: Record<string, string> = {};
      rows.forEach((row) => {
        const name = row.propertyName || row.name || row.title;
        if (name) names[row.id] = String(name);
      });
      setProperties(rows.length);
      setUnits(rows.reduce((sum, row) => sum + Number(row.units || row.totalUnits || row.unitsCount || 0), 0));
      setPropertyNamesById(names);
    });

    listen('active tenants', query(collection(db, 'users'), where('role', '==', 'tenant')), (snap) => setActiveTenants(snap.size));
    listen('pending tenant invites', query(collection(db, 'tenant_invites'), where('status', '==', 'PENDING')), (snap) => setPendingTenantInvites(snap.size));
    listen('active technicians', query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', ['ACTIVE', 'active'])), (snap) => setActiveTechnicians(snap.size));
    listen('active brokers', query(collection(db, 'users'), where('role', '==', 'broker')), (snap) => setActiveBrokers(snap.size));
    listen('active contracts', query(collection(db, 'contracts'), where('status', '==', 'ACTIVE')), (snap) => setActiveContracts(snap.size));
    listen('property passports', collection(db, 'propertyPassports'), (snap) => setPropertyPassports(snap.size));

    listen('maintenance missions', query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({ id: row.id, updatedAt: row.data().updatedAt, createdAt: row.data().createdAt, ...(row.data() as Record<string, any>) })) as RecordRow[];
      setOperationsMissions(rows.sort((a, b) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt)).slice(0, 10));
    });

    listen('owner approvals', query(collection(db, 'intake_submissions'), where('status', 'in', PENDING_OWNER_STATUSES)), (snap) => {
      const rows = snap.docs.map((row: any) => {
        const data = row.data();
        return {
          id: row.id,
          origin: 'Owner onboarding',
          type: 'OWNER_ONBOARDING',
          linkedName: data.companyProfile?.name || data.ownerAccount?.email || data.ownerEmail || data.ownerUid || row.id,
          createdAt: data.submittedAt || data.createdAt,
          ...data,
        } as RecordRow;
      });
      setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'OWNER_ONBOARDING'), ...rows].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    });

    listen('technician approvals', query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', PENDING_TECHNICIAN_STATUSES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({
        id: row.id,
        origin: 'Technician onboarding',
        type: 'TECH_ONBOARD',
        linkedName: row.data().displayName || row.data().email || row.id,
        createdAt: row.data().createdAt,
        ...(row.data() as Record<string, any>),
      }));
      setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'TECH_ONBOARD'), ...rows].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
    });

    listen('payment proofs', query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({
        id: row.id,
        type: 'PAYMENT_PROOF',
        origin: 'Payment verification',
        linkedName: row.data().ownerEmail || row.data().tenantEmail || row.data().payerEmail || row.id,
        createdAt: row.data().createdAt || row.data().submittedAt,
        ...(row.data() as Record<string, any>),
      }));
      setPaymentProofs(rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 8));
    });

    listen('broker commissions', query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES)), (snap) => {
      const rows = snap.docs.map((row: any) => ({
        id: row.id,
        type: 'BROKER_COMMISSION',
        origin: 'Broker commission',
        linkedName: row.data().brokerName || row.data().brokerEmail || row.data().brokerId || row.id,
        createdAt: row.data().createdAt || row.data().submittedAt,
        ...(row.data() as Record<string, any>),
      }));
      setCommissionQueue(rows.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 8));
    });

    listen('documents', collection(db, 'documents'), (snap) => {
      setDocumentsUploaded(snap.size);
      setExpiredDocuments(snap.docs.filter((row: any) => {
        const data = row.data();
        return isExpired(data.expiryDate || data.expiresAt || data.validUntil || data.tradeLicenseExpiry || data.passportExpiry);
      }).length);
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    listen('audit today', query(collection(db, 'audit_logs'), where('createdAt', '>=', Timestamp.fromDate(today))), (snap) => setAuditEventsToday(snap.size));
    listen('orphans', doc(db, 'system_stats', 'orphans'), (snap) => setOrphanRecords(snap.exists() ? Number(snap.data().total || 0) : 0));
    listen('admin summary', doc(db, 'admin_summaries', 'global'), (snap) => setSummary(snap.exists() ? snap.data() : {}));
    listen('recent activity', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(10)), (snap) => {
      setRecentActivity(snap.docs.map((row: any) => {
        const data = row.data();
        return {
          id: row.id,
          actor: data.actor?.displayName || data.actorRole || data.actorId || 'SYSTEM',
          action: data.action || data.eventType || 'updated system state',
          module: data.module || data.targetType || 'Audit',
          status: data.status || 'RECORDED',
          timestamp: data.createdAt || data.timestamp || new Date(),
        } as ActivityItem;
      }));
    });

    const now = new Date();
    const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const priorPeriodStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    getDocs(query(collection(db, 'payment_transactions'), where('createdAt', '>=', Timestamp.fromDate(priorPeriodStart)), where('createdAt', '<=', Timestamp.fromDate(now))))
      .then((snap) => {
        if (!alive) return;
        let current = 0;
        let prior = 0;
        snap.docs.forEach((docSnap: any) => {
          const data = docSnap.data();
          if (!CONFIRMED_PAYMENT_STATUSES.has(String(data.status || '').toUpperCase())) return;
          const ts = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          if (!ts) return;
          const amount = Number(data.amount || data.amountPaid || 0);
          if (ts >= periodStart) current += amount;
          else prior += amount;
        });
        setRevenueTrend({ status: 'success', current, growthPercent: prior > 0 ? ((current - prior) / prior) * 100 : null });
      })
      .catch((error) => {
        console.warn('[ADMIN_DASHBOARD] revenue trend fetch failed', error);
        if (alive) setRevenueTrend({ status: 'error', current: 0, growthPercent: null });
      });

    return () => {
      alive = false;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  const openMissions = operationsMissions.length;
  const emergencyRequests = operationsMissions.filter((mission) => normalizeStatus(mission.priority || mission.category).includes('EMERGENCY')).length;
  const slaBreaches = operationsMissions.filter(isBreached).length;
  const nearBreaches = operationsMissions.filter(isNearBreach).length;
  const pendingOwnerApprovals = approvalQueue.filter((item) => item.type === 'OWNER_ONBOARDING').length;
  const pendingTechApprovals = approvalQueue.filter((item) => item.type === 'TECH_ONBOARD').length;
  const totalActionCount = approvalQueue.length + paymentProofs.length + commissionQueue.length;
  const verifiedMonthly = Number(summary.monthlyCollections || summary.mrr || summary.monthlyRecurringRevenue || summary.totalCollections || 0);
  const securityScore = Number(summary.securityScore || summary.launchHealth?.securityScore || 0);
  const securityStatus = summary.securityStatus || summary.launchHealth?.securityStatus || (securityScore > 0 ? 'Measured' : 'Pending proof');

  const kpiCards: KpiCard[] = useMemo(() => [
    { label: 'Total Properties', value: properties, icon: <Building2 size={20} />, color: binThemeTokens.gold, path: '/properties/passport' },
    { label: 'Total Units', value: units, icon: <Home size={20} />, color: '#60a5fa', path: '/unit-status' },
    { label: 'Active Tenants', value: activeTenants, icon: <Users size={20} />, color: '#10b981', path: '/tenants' },
    { label: 'Pending Invites', value: pendingTenantInvites, icon: <Clock size={20} />, color: binThemeTokens.warning, path: '/bulk-import' },
    { label: 'Open Missions', value: openMissions, icon: <Wrench size={20} />, color: openMissions ? binThemeTokens.warning : '#10b981', path: '/tickets' },
    { label: 'Emergency SOS', value: emergencyRequests, icon: <AlertTriangle size={20} />, color: emergencyRequests ? binThemeTokens.danger : '#10b981', path: '/emergency-command' },
    { label: 'SLA Breaches', value: slaBreaches, icon: <AlertTriangle size={20} />, color: slaBreaches ? binThemeTokens.danger : '#10b981', path: '/tickets' },
    { label: 'Near Breaches', value: nearBreaches, icon: <Clock size={20} />, color: nearBreaches ? binThemeTokens.warning : '#10b981', path: '/tickets' },
    { label: 'Active Technicians', value: activeTechnicians, icon: <Wrench size={20} />, color: '#22c55e', path: '/technicians' },
    { label: 'Active Brokers', value: activeBrokers, icon: <Briefcase size={20} />, color: '#a78bfa', path: '/broker' },
    { label: 'Owner Approvals', value: pendingOwnerApprovals, icon: <Shield size={20} />, color: pendingOwnerApprovals ? binThemeTokens.warning : '#10b981', path: '/vault' },
    { label: 'Tech Approvals', value: pendingTechApprovals, icon: <Shield size={20} />, color: pendingTechApprovals ? binThemeTokens.warning : '#10b981', path: '/technicians' },
    { label: 'Payment Verifications', value: paymentProofs.length, icon: <Wallet size={20} />, color: paymentProofs.length ? binThemeTokens.warning : '#10b981', path: '/manual-approvals' },
    { label: 'Broker Commissions', value: commissionQueue.length, icon: <DollarSign size={20} />, color: commissionQueue.length ? binThemeTokens.warning : '#10b981', path: '/broker' },
    { label: 'Active Contracts', value: activeContracts, icon: <FileText size={20} />, color: binThemeTokens.gold, path: '/contracts' },
    { label: 'Property Passports', value: propertyPassports, icon: <FileText size={20} />, color: '#60a5fa', path: '/properties/passport' },
    { label: 'Documents', value: documentsUploaded, icon: <FileText size={20} />, color: '#818cf8', path: '/document-vault' },
    { label: 'Expired Documents', value: expiredDocuments, icon: <AlertTriangle size={20} />, color: expiredDocuments ? binThemeTokens.warning : '#10b981', path: '/document-vault' },
    { label: 'Audit Events Today', value: auditEventsToday, icon: <Activity size={20} />, color: binThemeTokens.gold, path: '/audit-log' },
    { label: 'Orphan Records', value: orphanRecords, icon: <AlertTriangle size={20} />, color: orphanRecords ? binThemeTokens.danger : '#10b981', path: '/orphans' },
    { label: 'Total Collections', value: money(summary.totalCollections), icon: <DollarSign size={20} />, color: '#10b981', path: '/transactions' },
    { label: 'Pending Liquidity', value: money(summary.pendingLiquidity), icon: <Wallet size={20} />, color: binThemeTokens.warning, path: '/transactions' },
    { label: 'Overdue Payments', value: money(summary.overduePayments), icon: <AlertTriangle size={20} />, color: Number(summary.overduePayments || 0) > 0 ? binThemeTokens.danger : '#10b981', path: '/transactions' },
    { label: 'Payroll Pending', value: money(summary.payrollPending), icon: <DollarSign size={20} />, color: binThemeTokens.gold, path: '/payroll' },
  ], [activeBrokers, activeContracts, activeTechnicians, activeTenants, auditEventsToday, commissionQueue.length, documentsUploaded, emergencyRequests, expiredDocuments, nearBreaches, openMissions, orphanRecords, paymentProofs.length, pendingOwnerApprovals, pendingTechApprovals, pendingTenantInvites, properties, propertyPassports, slaBreaches, summary, units]);

  const launchHealthRows = [
    { label: 'Main App Build', status: getHealth(summary, 'mainAppBuild'), detail: 'Production route smoke' },
    { label: 'Command Panel Build', status: getHealth(summary, 'commandPanelBuild'), detail: 'Admin operations shell' },
    { label: 'Owner App Build', status: getHealth(summary, 'ownerAppBuild'), detail: 'Owner portal deploy' },
    { label: 'Functions Deploy', status: getHealth(summary, 'functionsDeploy'), detail: 'Cloud Functions health' },
    { label: 'Firestore Rules', status: getHealth(summary, 'firestoreRules'), detail: 'Rules hardening proof' },
    { label: 'Storage Rules', status: getHealth(summary, 'storageRules'), detail: 'Evidence access rules' },
    { label: 'App Check', status: getHealth(summary, 'appCheck'), detail: 'Production site key' },
    { label: 'Payment Verification', status: getHealth(summary, 'paymentVerification'), detail: 'Live or manual proof queue' },
    { label: 'Branded Email', status: getHealth(summary, 'brandedEmail'), detail: 'Outbound sender status' },
    { label: 'BIN Connect', status: getHealth(summary, 'binConnect'), detail: 'WhatsApp/webhook health' },
  ];

  const quickActions = [
    { label: 'Add Property', path: '/onboard-property' },
    { label: 'Import Tenants', path: '/bulk-import' },
    { label: 'Verify Payments', path: '/manual-approvals' },
    { label: 'Document Vault', path: '/document-vault' },
    { label: 'Pricing Matrix', path: '/admin/pricing-matrix' },
    { label: 'Orphan War Room', path: '/orphans' },
    { label: 'Duty Command', path: '/ops/technicians' },
    { label: 'Admin Report', path: '/reports' },
  ];

  const renderKpi = (card: KpiCard) => {
    const isEmpty = card.value === 0 || card.value === 'AED 0';
    return (
      <Paper
        key={card.label}
        onClick={card.path ? () => navigate(card.path as string) : undefined}
        sx={{
          p: 2,
          bgcolor: binThemeTokens.graphite,
          border: `1px solid ${alpha(card.color, 0.28)}`,
          borderRadius: 4,
          cursor: card.path ? 'pointer' : 'default',
          minHeight: 126,
          transition: 'border-color 160ms ease, transform 160ms ease',
          '&:hover': card.path ? { borderColor: card.color, transform: 'translateY(-2px)' } : undefined,
        }}
      >
        <Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', fontWeight: 900, display: 'block' }}>{card.label.toUpperCase()}</Typography>
        <Typography variant="h6" sx={{ fontWeight: 950, color: isEmpty ? 'rgba(255,255,255,0.35)' : '#fff' }}>{card.value}</Typography>
        {card.helper && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', display: 'block', mt: 0.5 }}>{card.helper}</Typography>}
        {isEmpty && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.22)', fontWeight: 700, fontStyle: 'italic' }}>No records yet</Typography>}
      </Paper>
    );
  };

  const renderQueueRows = (rows: RecordRow[], emptyText: string) => {
    if (!rows.length) {
      return (
        <TableRow>
          <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'rgba(255,255,255,0.28)', fontWeight: 900 }}>{emptyText}</TableCell>
        </TableRow>
      );
    }

    return rows.map((item) => (
      <TableRow key={`${item.type}-${item.id}`} hover>
        <TableCell>{item.origin || 'Operations'}</TableCell>
        <TableCell><Chip label={String(item.type || 'REVIEW').replace(/_/g, ' ')} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} /></TableCell>
        <TableCell>{item.linkedName || item.companyProfile?.name || item.propertyName || item.id}</TableCell>
        <TableCell>{formatDateTime(item.createdAt || item.submittedAt)}</TableCell>
        <TableCell align="right"><Button size="small" variant="outlined" onClick={() => navigate(reviewPathFor(item))}>Review</Button></TableCell>
      </TableRow>
    ));
  };

  const allQueueRows = [...approvalQueue, ...paymentProofs, ...commissionQueue]
    .sort((a, b) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt));
  const streamErrorCount = Object.keys(streamErrors).length;

  return (
    <AdminPageFrame
      title="Executive Command Center"
      subtitle="Live Firestore operational truth: approvals, missions, finance, launch health, documents, and audit events."
      status={streamErrorCount ? `${streamErrorCount} STREAM WARNINGS` : 'LIVE'}
      lastUpdated={lastSync}
      onRefresh={() => window.location.reload()}
    >
      <Stack spacing={4}>
        {streamErrorCount > 0 && (
          <Paper sx={{ p: 2.5, borderRadius: 4, bgcolor: alpha(binThemeTokens.warning, 0.08), border: `1px solid ${alpha(binThemeTokens.warning, 0.28)}` }}>
            <Typography sx={{ color: binThemeTokens.warning, fontWeight: 950 }}>Some live streams are unavailable.</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.5 }}>
              {Object.entries(streamErrors).map(([key, value]) => `${key}: ${value}`).join(' • ')}
            </Typography>
          </Paper>
        )}

        <Paper sx={{ p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}` }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>P0 CONTROL BAR</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 780 }}>These shortcuts are wired to the real review, finance, document, pricing, orphan, technician, and report surfaces. The dashboard no longer uses fake SLA/property fallbacks.</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {quickActions.map((action) => <Button key={action.path} variant="outlined" size="small" onClick={() => navigate(action.path)}>{action.label}</Button>)}
            </Stack>
          </Stack>
        </Paper>

        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>LIVE KPI CARDS</Typography>
          <Grid container spacing={2}>
            {kpiCards.map((card) => <Grid item xs={12} sm={6} md={3} lg={2.4} key={card.label}>{renderKpi(card)}</Grid>)}
          </Grid>
        </Box>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Shield color={binThemeTokens.gold} /> Action Queues</Typography>
                <Chip label={`${totalActionCount} AWAITING`} size="small" sx={{ fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
              </Box>
              <TableContainer sx={{ maxHeight: 430 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ bgcolor: '#0f172a' }}>Origin</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a' }}>Type</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a' }}>Linked</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a' }}>Submitted</TableCell>
                      <TableCell sx={{ bgcolor: '#0f172a' }} align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>{renderQueueRows(allQueueRows, 'ALL CLEAR: NO PENDING ACTIONS')}</TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Wrench color={binThemeTokens.gold} /> Live Operations</Typography>
              <Stack spacing={2}>
                {operationsMissions.map((job) => (
                  <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: `1px solid ${isBreached(job) ? alpha(binThemeTokens.danger, 0.35) : isNearBreach(job) ? alpha(binThemeTokens.warning, 0.35) : 'rgba(255,255,255,0.05)'}` }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION #{job.id.substring(0, 8)}</Typography>
                      <Chip label={job.priority || 'NORMAL'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: normalizeStatus(job.priority).includes('EMERGENCY') ? alpha(binThemeTokens.danger, 0.1) : 'rgba(255,255,255,0.05)', color: normalizeStatus(job.priority).includes('EMERGENCY') ? binThemeTokens.danger : 'inherit', fontWeight: 900 }} />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{job.title || job.issueType || job.category || 'Maintenance mission'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{job.propertyName || job.propertyTitle || propertyNamesById[job.propertyId] || 'Property not linked'}</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}><Clock size={12} style={{ color: 'rgba(255,255,255,0.3)' }} /><Typography variant="caption" sx={{ color: isBreached(job) ? binThemeTokens.danger : isNearBreach(job) ? binThemeTokens.warning : 'rgba(255,255,255,0.55)', fontWeight: 700 }}>SLA: {formatSla(job)}</Typography></Box>
                      <Typography variant="caption" sx={{ color: statusColor(job.status), fontWeight: 900 }}>{normalizeStatus(job.status)}</Typography>
                    </Box>
                  </Box>
                ))}
                {operationsMissions.length === 0 && <Box sx={{ py: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="rgba(255,255,255,0.12)" /><Typography sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 800, mt: 2 }}>NO ACTIVE MISSIONS</Typography></Box>}
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 color={binThemeTokens.gold} /> Launch Health</Typography>
              <Stack spacing={1.5}>{launchHealthRows.map((row) => <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{row.detail}</Typography></Box><Chip size="small" label={normalizeStatus(row.status)} sx={{ bgcolor: alpha(statusColor(row.status), 0.12), color: statusColor(row.status), fontWeight: 950 }} /></Box>)}</Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><DollarSign color={binThemeTokens.gold} /> Financial Intelligence</Typography>
              <Stack spacing={3}>
                <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>MONTHLY COLLECTIONS</Typography><Typography variant="h4" fontWeight="950">{money(verifiedMonthly)}</Typography></Box>
                <Box>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>30-DAY REVENUE</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="h6" fontWeight="950">{revenueTrend.status === 'loading' ? 'Loading' : revenueTrend.status === 'error' ? 'Unavailable' : money(revenueTrend.current)}</Typography>
                    {revenueTrend.status === 'success' && revenueTrend.growthPercent !== null && <Typography variant="caption" sx={{ color: revenueTrend.growthPercent >= 0 ? '#10b981' : binThemeTokens.danger, fontWeight: 900 }}>{revenueTrend.growthPercent >= 0 ? '+' : ''}{revenueTrend.growthPercent.toFixed(1)}%</Typography>}
                    {revenueTrend.status === 'success' && revenueTrend.growthPercent === null && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>No prior period</Typography>}
                  </Box>
                </Box>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Verified Collections</Typography><Typography variant="body2" sx={{ fontWeight: 900 }}>{money(summary.totalCollections)}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Pending Liquidity</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>{money(summary.pendingLiquidity)}</Typography></Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Overdue Payments</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.danger }}>{money(summary.overduePayments)}</Typography></Box>
                <Button fullWidth variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/transactions')}>Full Ledger Access</Button>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><FileText color={binThemeTokens.gold} /> Compliance & Docs</Typography>
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SYSTEM SECURITY STATUS</Typography><Chip label={normalizeStatus(securityStatus)} size="small" sx={{ bgcolor: alpha(statusColor(securityStatus), 0.1), color: statusColor(securityStatus), fontWeight: 900, fontSize: '0.6rem' }} /></Box>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, securityScore))} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: statusColor(securityStatus) } }} />
              </Box>
              <Stack spacing={2}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(59,130,246,0.1)', borderRadius: 2, color: '#3b82f6' }}><Shield size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Governance Audit</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>audit_logs listener active</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: '#10b981', fontWeight: 900 }}>ACTIVE</Typography></Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(245,158,11,0.1)', borderRadius: 2, color: '#f59e0b' }}><AlertTriangle size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>Expired Documents</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Firestore-driven expiry check</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: expiredDocuments ? '#f59e0b' : '#10b981', fontWeight: 900 }}>{expiredDocuments} PENDING</Typography></Box>
              </Stack>
              <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate('/document-vault')}>Open Vault</Button>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Activity color={binThemeTokens.gold} /> Recent Activity</Typography>
              <Stack spacing={2.5}>{recentActivity.map((log) => <Box key={log.id} sx={{ display: 'flex', gap: 2 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} /><Box><Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{log.actor} <Box component="span" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{log.action}</Box></Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, display: 'block', mt: 0.5 }}>{log.module} • {formatDateTime(log.timestamp)}</Typography></Box></Box>)}{recentActivity.length === 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>NO RECENT ACTIVITY LOGGED</Typography>}</Stack>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>Command Support Terminal</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600 }}>Support channels remain available for critical infrastructure failure. Routine operations should continue through the audited queues above.</Typography></Box><CeoContactButtons compact /></Stack>
        </Paper>
      </Stack>
    </AdminPageFrame>
  );
}

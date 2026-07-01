// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@bin/shared';
import {
    Alert,
    Box,
    Button,
    Chip,
    Divider,
    Grid,
    LinearProgress,
    Paper,
    Snackbar,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
    alpha
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
    FileWarning,
    Gavel,
    Home,
    Lock,
    Plus,
    Shield,
    TrendingUp,
    Upload,
    Wrench,
    Zap
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

type KPIStatus = 'loading' | 'success' | 'error' | 'denied';

type KPIState = {
    value: number | string | null;
    status: KPIStatus;
    label: string;
    icon: React.ReactNode;
    color: string;
    path?: string;
};

type ActivityItem = {
    id: string;
    timestamp: Timestamp | Date;
    actor: string;
    action: string;
    module: string;
    status: string;
};

type LaunchHealthRow = {
    label: string;
    status: string;
    detail?: string;
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
    'accepted'
];

const PENDING_OWNER_STATUSES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW', 'pending_admin_approval', 'pending_approval'];
const PENDING_TECHNICIAN_STATUSES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending_admin_approval', 'pending_approval'];
const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const PENDING_COMMISSION_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];

const getMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (value?.seconds) return value.seconds * 1000;
    if (value?._seconds) return value._seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: any) => {
    const millis = getMillis(value);
    return millis ? new Date(millis).toLocaleDateString() : 'Recent';
};

const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;

const normalizeStatus = (value: any) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();

const statusColor = (status: any) => {
    const normalized = normalizeStatus(status);
    if (['PASS', 'PASSED', 'READY', 'GREEN', 'ACTIVE', 'SECURE', 'VERIFIED'].some((word) => normalized.includes(word))) return '#10b981';
    if (['FAIL', 'FAILED', 'RED', 'ERROR', 'BLOCKED', 'EXPIRED', 'DENIED'].some((word) => normalized.includes(word))) return binThemeTokens.danger;
    if (['PENDING', 'WARNING', 'AMBER', 'UNKNOWN', 'REVIEW'].some((word) => normalized.includes(word))) return '#f59e0b';
    return 'rgba(255,255,255,0.55)';
};

const isExpired = (value: any) => {
    const millis = getMillis(value);
    return millis > 0 && millis < Date.now();
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

const getHealth = (source: any, key: string) => source?.launchHealth?.[key] || source?.gates?.[key] || source?.[key] || 'UNKNOWN';

export default function DashboardPage() {
    const navigate = useNavigate();
    const { t, isRTL } = useLanguage();
    const kpiLabels: Record<string, string> = {
        totalProperties: t('admin.dashboard.kpi_total_properties'),
        totalUnits: t('admin.dashboard.kpi_total_units'),
        activeTenants: t('admin.dashboard.kpi_active_tenants'),
        pendingTenantInvites: t('admin.dashboard.kpi_pending_invites'),
        openMissions: t('admin.dashboard.kpi_open_missions'),
        slaBreaches: t('admin.dashboard.kpi_sla_breaches'),
        nearBreaches: t('admin.dashboard.kpi_near_breaches'),
        emergencyRequests: t('admin.dashboard.kpi_emergency_requests'),
        activeTechnicians: t('admin.dashboard.kpi_active_technicians'),
        activeBrokers: t('admin.dashboard.kpi_active_brokers'),
        pendingOwnerApprovals: t('admin.dashboard.kpi_pending_owner_approvals'),
        pendingTechnicianApprovals: t('admin.dashboard.kpi_pending_technician_approvals'),
        pendingPaymentVerifications: t('admin.dashboard.kpi_pending_payment_verifications'),
        pendingBrokerCommissions: t('admin.dashboard.kpi_pending_broker_commissions'),
        activeContracts: t('admin.dashboard.kpi_active_contracts'),
        propertyPassports: t('admin.dashboard.kpi_property_passports'),
        documentsUploaded: t('admin.dashboard.kpi_documents_uploaded'),
        expiredDocs: t('admin.dashboard.kpi_expired_docs'),
        auditEventsToday: t('admin.dashboard.kpi_audit_events_today'),
        orphanRecords: t('admin.dashboard.kpi_orphan_records'),
        totalCollections: t('admin.dashboard.kpi_total_collections'),
        pendingLiquidity: t('admin.dashboard.kpi_pending_liquidity'),
        overduePayments: t('admin.dashboard.kpi_overdue_payments'),
        payrollPending: t('admin.dashboard.kpi_payroll_pending'),
    };
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [summary, setSummary] = useState<any>({});
    const [expiredDocuments, setExpiredDocuments] = useState(0);
    const [approvalQueue, setApprovalQueue] = useState<any[]>([]);
    const [operationsMissions, setOperationsMissions] = useState<any[]>([]);
    const [paymentProofs, setPaymentProofs] = useState<any[]>([]);
    const [commissionQueue, setCommissionQueue] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

    const [kpis, setKpis] = useState<Record<string, KPIState>>({
        totalProperties: { label: 'Total Properties', value: null, status: 'loading', icon: <Home size={18} />, color: '#3b82f6', path: '/properties/passport' },
        totalUnits: { label: 'Total Units', value: null, status: 'loading', icon: <Building2 size={18} />, color: '#8b5cf6' },
        activeTenants: { label: 'Active Tenants', value: null, status: 'loading', icon: <UsersIcon />, color: '#10b981', path: '/tenants' },
        pendingTenantInvites: { label: 'Pending Invites', value: null, status: 'loading', icon: <UsersIcon />, color: '#f59e0b' },
        openMissions: { label: 'Open Missions', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#f59e0b', path: '/tickets' },
        slaBreaches: { label: 'SLA Breaches', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: binThemeTokens.danger, path: '/tickets?sla=breached' },
        nearBreaches: { label: 'SLA Near Breach', value: null, status: 'loading', icon: <Clock size={18} />, color: '#f59e0b', path: '/tickets?sla=near' },
        emergencyRequests: { label: 'Emergency SOS', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: binThemeTokens.danger, path: '/sos' },
        activeTechnicians: { label: 'Active Technicians', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#10b981', path: '/technicians' },
        activeBrokers: { label: 'Active Brokers', value: null, status: 'loading', icon: <Briefcase size={18} />, color: '#8b5cf6', path: '/broker' },
        pendingOwnerApprovals: { label: 'Owner Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b', path: '/manual-approvals?type=owner' },
        pendingTechnicianApprovals: { label: 'Tech Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b', path: '/manual-approvals?type=technician' },
        pendingPaymentVerifications: { label: 'Payment Verifications', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b', path: '/manual-approvals?type=payment' },
        pendingBrokerCommissions: { label: 'Broker Commissions', value: null, status: 'loading', icon: <Briefcase size={18} />, color: '#f59e0b', path: '/broker' },
        activeContracts: { label: 'Active Contracts', value: null, status: 'loading', icon: <FileText size={18} />, color: '#10b981' },
        propertyPassports: { label: 'Property Passports', value: null, status: 'loading', icon: <FileText size={18} />, color: '#3b82f6', path: '/properties/passport' },
        documentsUploaded: { label: 'Documents', value: null, status: 'loading', icon: <FileText size={18} />, color: '#8b5cf6', path: '/document-vault' },
        expiredDocs: { label: 'Expired Documents', value: null, status: 'loading', icon: <FileWarning size={18} />, color: '#f59e0b', path: '/document-vault?filter=expired' },
        auditEventsToday: { label: 'Audit Events Today', value: null, status: 'loading', icon: <Activity size={18} />, color: '#3b82f6', path: '/audit' },
        orphanRecords: { label: 'Orphan Records', value: null, status: 'loading', icon: <FileWarning size={18} />, color: binThemeTokens.danger, path: '/orphans' },
        totalCollections: { label: 'Total Collections', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#10b981', path: '/transactions' },
        pendingLiquidity: { label: 'Pending Liquidity', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b' },
        overduePayments: { label: 'Overdue Payments', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: binThemeTokens.danger },
        payrollPending: { label: 'Payroll Pending', value: null, status: 'loading', icon: <Gavel size={18} />, color: '#f59e0b', path: '/financials/payroll' }
    });

    const [propertyNamesById, setPropertyNamesById] = useState<Record<string, string>>({});
    const [revenueTrend, setRevenueTrend] = useState<{ status: 'loading' | 'success' | 'error'; current: number; growthPercent: number | null }>({ status: 'loading', current: 0, growthPercent: null });

    const updateKPI = (key: string, value: number | string, status: KPIStatus = 'success') => {
        setKpis((prev) => ({ ...prev, [key]: { ...prev[key], value, status } }));
    };

    const handleKPIError = (key: string, error: any) => {
        const status = error?.code === 'permission-denied' ? 'denied' : 'error';
        setKpis((prev) => ({ ...prev, [key]: { ...prev[key], status } }));
    };

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
                return { id: row.id, origin: t('admin.dashboard.origin_owner_onboarding'), type: 'OWNER_ONBOARDING', linkedName: data.companyProfile?.name || data.ownerEmail || data.ownerUid || data.ownerId, createdAt: data.submittedAt || data.createdAt, ...data };
            });
            updateKPI('pendingOwnerApprovals', items.length);
            setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'OWNER_ONBOARDING'), ...items].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
        }, (err) => handleKPIError('pendingOwnerApprovals', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', PENDING_TECHNICIAN_STATUSES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, origin: t('admin.dashboard.origin_tech_onboard'), type: 'TECH_ONBOARD', linkedName: row.data().displayName || row.data().email || row.id, createdAt: row.data().createdAt, ...row.data() }));
            updateKPI('pendingTechnicianApprovals', items.length);
            setApprovalQueue((prev) => [...prev.filter((item) => item.type !== 'TECH_ONBOARD'), ...items].sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)));
        }, (err) => handleKPIError('pendingTechnicianApprovals', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: t('admin.dashboard.origin_payment_verification'), linkedName: row.data().ownerEmail || row.data().tenantEmail || row.data().payerEmail || row.id, createdAt: row.data().createdAt || row.data().submittedAt, ...row.data() }));
            updateKPI('pendingPaymentVerifications', items.length);
            setPaymentProofs(items.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 5));
        }, (err) => handleKPIError('pendingPaymentVerifications', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES)), (snap) => {
            const items = snap.docs.map((row) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: t('admin.dashboard.origin_broker_commission'), linkedName: row.data().brokerName || row.data().brokerEmail || row.data().brokerId || row.id, createdAt: row.data().createdAt || row.data().submittedAt, ...row.data() }));
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
        { label: t('admin.dashboard.health_main_app_build'), status: getHealth(summary, 'mainAppBuild'), detail: t('admin.dashboard.health_main_app_build_detail') },
        { label: t('admin.dashboard.health_command_panel_build'), status: getHealth(summary, 'commandPanelBuild'), detail: t('admin.dashboard.health_command_panel_build_detail') },
        { label: t('admin.dashboard.health_owner_app_build'), status: getHealth(summary, 'ownerAppBuild'), detail: t('admin.dashboard.health_owner_app_build_detail') },
        { label: t('admin.dashboard.health_functions_deploy'), status: getHealth(summary, 'functionsDeploy'), detail: t('admin.dashboard.health_functions_deploy_detail') },
        { label: t('admin.dashboard.health_firestore_rules'), status: getHealth(summary, 'firestoreRules'), detail: t('admin.dashboard.health_firestore_rules_detail') },
        { label: t('admin.dashboard.health_storage_rules'), status: getHealth(summary, 'storageRules'), detail: t('admin.dashboard.health_storage_rules_detail') },
        { label: t('admin.dashboard.health_app_check'), status: getHealth(summary, 'appCheck'), detail: t('admin.dashboard.health_app_check_detail') },
        { label: t('admin.dashboard.health_payment_verification'), status: getHealth(summary, 'paymentVerification'), detail: t('admin.dashboard.health_payment_verification_detail') },
        { label: t('admin.dashboard.health_branded_email'), status: getHealth(summary, 'brandedEmail'), detail: t('admin.dashboard.health_branded_email_detail') },
        { label: t('admin.dashboard.health_bin_connect'), status: getHealth(summary, 'binConnect'), detail: t('admin.dashboard.health_bin_connect_detail') }
    ];

    const verifiedMonthly = Number(summary.monthlyCollections || summary.mrr || summary.monthlyRecurringRevenue || summary.totalCollections || 0);
    const growth = typeof summary.monthlyGrowthPct === 'number' ? `${summary.monthlyGrowthPct >= 0 ? '+' : ''}${summary.monthlyGrowthPct}%` : 'Trend unavailable';
    const securityScore = Number(summary.securityScore || summary.launchHealth?.securityScore || 0);
    const securityStatus = summary.securityStatus || summary.launchHealth?.securityStatus || (securityScore > 0 ? 'Measured' : 'Pending proof');

    const renderKPI = (key: string) => {
        const kpi = kpis[key];
        const isEmpty = kpi.value === 0 || kpi.value === 'AED 0';
        const borderColor = kpi.status === 'denied' || kpi.status === 'error' ? binThemeTokens.danger : alpha(binThemeTokens.gold, 0.1);
        const value = kpi.status === 'denied' ? t('admin.dashboard.access_denied') : kpi.status === 'error' ? t('admin.dashboard.error_loading') : kpi.status === 'loading' ? t('admin.dashboard.loading_label') : kpi.value;
        return (
            <Paper key={key} onClick={() => kpi.path && navigate(kpi.path)} sx={{ p: 2, bgcolor: binThemeTokens.graphite, border: `1px solid ${borderColor}`, borderRadius: 4, cursor: kpi.path ? 'pointer' : 'default', minHeight: 126 }}>
                <Box sx={{ color: kpi.status === 'denied' || kpi.status === 'error' ? binThemeTokens.danger : kpi.color, mb: 1 }}>{kpi.status === 'denied' ? <Lock size={18} /> : kpi.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpiLabels[key] || kpi.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 950, color: isEmpty ? 'rgba(255,255,255,0.2)' : '#fff' }}>{value}</Typography>
                {isEmpty && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 700, fontStyle: 'italic' }}>{t('admin.dashboard.no_records')}</Typography>}
            </Paper>
        );
    };

    const renderQueueRows = (rows: any[], empty: string) => rows.length ? rows.map((item) => (
        <TableRow key={`${item.type}-${item.id}`} hover>
            <TableCell sx={{ fontWeight: 700 }}>{item.origin}</TableCell>
            <TableCell><Chip label={item.type || 'Standard'} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 900 }} /></TableCell>
            <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{item.linkedName || item.userId || t('admin.dashboard.not_linked')}</TableCell>
            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{formatDate(item.createdAt || item.submittedAt)}</TableCell>
            <TableCell align="right"><Button size="small" variant="outlined" onClick={() => navigate(reviewPathFor(item))} sx={{ fontWeight: 900, fontSize: '0.65rem' }}>{t('admin.dashboard.review_btn')}</Button></TableCell>
        </TableRow>
    )) : (
        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{empty}</TableCell></TableRow>
    );

    return (
        <AdminPageFrame title={t('admin.dashboard.page_title')} subtitle={t('admin.dashboard.page_subtitle')} lastUpdated={lastSync} onRefresh={() => window.location.reload()}>
            <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
                <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1, mb: 4, '&::-webkit-scrollbar': { height: 4 } }}>
                    <Button startIcon={<Plus />} variant="contained" onClick={() => navigate('/onboard-property')}>{t('admin.dashboard.btn_add_property')}</Button>
                    <Button startIcon={<Upload />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/bulk-import')}>{t('admin.dashboard.btn_import_tenants')}</Button>
                    <Button startIcon={<CheckCircle2 />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/manual-approvals')}>{t('admin.dashboard.btn_verify_payments')}</Button>
                    <Button startIcon={<FileText />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/document-vault')}>{t('admin.dashboard.btn_document_vault')}</Button>
                    <Button startIcon={<Zap />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/admin/pricing-matrix')}>{t('admin.dashboard.btn_pricing_matrix')}</Button>
                    <Button startIcon={<Shield />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/orphans')}>{t('admin.dashboard.btn_orphan_war_room')}</Button>
                    <Button startIcon={<Activity />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/ops/technicians')}>{t('admin.dashboard.btn_duty_command')}</Button>
                    <Button startIcon={<TrendingUp />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/reports')}>{t('admin.dashboard.btn_command_report')}</Button>
                </Stack>

                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>{t('admin.dashboard.portfolio_kpis_label')}</Typography>
                <Grid container spacing={2} sx={{ mb: 6 }}>
                    {Object.keys(kpis).map((key) => <Grid item xs={12} sm={6} md={3} lg={2.4} key={key}>{renderKPI(key)}</Grid>)}
                </Grid>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}><Shield color={binThemeTokens.gold} /> {t('admin.dashboard.action_queues_title')}</Typography>
                                <Chip label={t('admin.dashboard.awaiting_chip').replace('{count}', String(approvalQueue.length + paymentProofs.length + commissionQueue.length))} size="small" sx={{ fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
                            </Box>
                            <TableContainer sx={{ maxHeight: 430 }}>
                                <Table stickyHeader size="small">
                                    <TableHead><TableRow><TableCell sx={{ bgcolor: '#0f172a' }}>{t('admin.dashboard.col_origin')}</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>{t('admin.dashboard.col_type')}</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>{t('admin.dashboard.col_linked')}</TableCell><TableCell sx={{ bgcolor: '#0f172a' }}>{t('admin.dashboard.col_submitted')}</TableCell><TableCell sx={{ bgcolor: '#0f172a' }} align="right">{t('admin.dashboard.col_action')}</TableCell></TableRow></TableHead>
                                    <TableBody>{renderQueueRows([...approvalQueue, ...paymentProofs, ...commissionQueue], t('admin.dashboard.queue_empty'))}</TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Wrench color={binThemeTokens.gold} /> {t('admin.dashboard.live_operations_title')}</Typography>
                            <Stack spacing={2}>
                                {operationsMissions.map((job) => (
                                    <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: `1px solid ${isBreached(job) ? alpha(binThemeTokens.danger, 0.35) : 'rgba(255,255,255,0.05)'}` }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('admin.dashboard.mission_label').replace('{id}', job.id.substring(0, 8))}</Typography><Chip label={job.priority || 'NORMAL'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? alpha(binThemeTokens.danger, 0.1) : 'rgba(255,255,255,0.05)', color: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? binThemeTokens.danger : 'inherit', fontWeight: 900 }} /></Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{job.title || job.issueType || job.category || t('admin.dashboard.mission_fallback')}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{job.propertyName || job.propertyTitle || propertyNamesById[job.propertyId] || t('admin.dashboard.property_not_linked')}</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}><Box sx={{ display: 'flex', gap: 0.5 }}><Clock size={12} style={{ color: 'rgba(255,255,255,0.3)' }} /><Typography variant="caption" sx={{ color: isBreached(job) ? binThemeTokens.danger : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>SLA: {formatSla(job)}</Typography></Box><Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{normalizeStatus(job.status)}</Typography></Box>
                                    </Box>
                                ))}
                                {operationsMissions.length === 0 && <Box sx={{ py: 6, textAlign: 'center' }}><CheckCircle2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} /><Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('admin.dashboard.no_active_missions')}</Typography></Box>}
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><CheckCircle2 color={binThemeTokens.gold} /> {t('admin.dashboard.launch_health_title')}</Typography>
                            <Stack spacing={1.5}>{launchHealthRows.map((row) => <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}><Box><Typography variant="body2" sx={{ fontWeight: 800 }}>{row.label}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{row.detail}</Typography></Box><Chip size="small" label={normalizeStatus(row.status)} sx={{ bgcolor: alpha(statusColor(row.status), 0.12), color: statusColor(row.status), fontWeight: 950 }} /></Box>)}</Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><DollarSign color={binThemeTokens.gold} /> {t('admin.dashboard.financial_intelligence_title')}</Typography>
                            <Stack spacing={3}><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.dashboard.monthly_collections_label')}</Typography><Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><Typography variant="h4" fontWeight="950">{money(verifiedMonthly)}</Typography><Typography variant="caption" sx={{ color: statusColor(growth === 'Trend unavailable' ? 'UNKNOWN' : 'READY'), fontWeight: 900 }}>{growth}</Typography></Box></Box><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.dashboard.revenue_30d_label')}</Typography><Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><Typography variant="h6" fontWeight="950">{revenueTrend.status === 'loading' ? t('admin.dashboard.loading_label') : revenueTrend.status === 'error' ? t('admin.dashboard.revenue_unavailable') : `AED ${Math.round(revenueTrend.current).toLocaleString()}`}</Typography>{revenueTrend.status === 'success' && revenueTrend.growthPercent !== null && <Typography variant="caption" sx={{ color: revenueTrend.growthPercent >= 0 ? '#10b981' : binThemeTokens.danger, fontWeight: 900 }}>{revenueTrend.growthPercent >= 0 ? '+' : ''}{revenueTrend.growthPercent.toFixed(1)}%</Typography>}{revenueTrend.status === 'success' && revenueTrend.growthPercent === null && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{t('admin.dashboard.no_prior_period')}</Typography>}</Box></Box><Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} /><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{t('admin.dashboard.verified_collections_label')}</Typography><Typography variant="body2" sx={{ fontWeight: 900 }}>{kpis.totalCollections.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{t('admin.dashboard.pending_liquidity_label')}</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>{kpis.pendingLiquidity.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{t('admin.dashboard.overdue_payments_label')}</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.danger }}>{kpis.overduePayments.value}</Typography></Box><Button fullWidth variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/transactions')}>{t('admin.dashboard.full_ledger_btn')}</Button></Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><FileText color={binThemeTokens.gold} /> {t('admin.dashboard.compliance_docs_title')}</Typography>
                            <Box sx={{ mb: 3 }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{t('admin.dashboard.security_status_label')}</Typography><Chip label={normalizeStatus(securityStatus)} size="small" sx={{ bgcolor: alpha(statusColor(securityStatus), 0.1), color: statusColor(securityStatus), fontWeight: 900, fontSize: '0.6rem' }} /></Box><Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}><LinearProgress variant="determinate" value={Math.max(0, Math.min(100, securityScore))} sx={{ height: 4, bgcolor: 'transparent', '& .MuiLinearProgress-bar': { bgcolor: statusColor(securityStatus) } }} /></Box></Box>
                            <Stack spacing={2}><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(59,130,246,0.1)', borderRadius: 2, color: '#3b82f6' }}><Shield size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{t('admin.dashboard.governance_audit_label')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('admin.dashboard.audit_logs_active_desc')}</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: statusColor(kpis.auditEventsToday.status === 'success' ? 'ACTIVE' : 'UNKNOWN'), fontWeight: 900 }}>{kpis.auditEventsToday.status === 'success' ? t('admin.dashboard.status_active') : t('admin.dashboard.status_unknown')}</Typography></Box><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}><Box sx={{ p: 1, bgcolor: 'rgba(245,158,11,0.1)', borderRadius: 2, color: '#f59e0b' }}><FileWarning size={16} /></Box><Box><Typography variant="body2" sx={{ fontWeight: 700 }}>{t('admin.dashboard.expired_documents_label')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{t('admin.dashboard.firestore_expiry_desc')}</Typography></Box><Typography variant="caption" sx={{ ml: 'auto', color: expiredDocuments ? '#f59e0b' : '#10b981', fontWeight: 900 }}>{t('admin.dashboard.docs_pending_count').replace('{count}', String(expiredDocuments))}</Typography></Box></Stack>
                            <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate('/document-vault')}>{t('admin.dashboard.open_vault_btn')}</Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Activity color={binThemeTokens.gold} /> {t('admin.dashboard.recent_activity_title')}</Typography>
                            <Stack spacing={2.5}>{recentActivity.map((log) => <Box key={log.id} sx={{ display: 'flex', gap: 2 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} /><Box><Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{log.actor} <Box component="span" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{log.action}</Box></Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, display: 'block', mt: 0.5 }}>{log.module} • {(log.timestamp as any)?.toDate ? (log.timestamp as any).toDate().toLocaleTimeString() : t('admin.dashboard.just_now')}</Typography></Box></Box>)}{recentActivity.length === 0 && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>{t('admin.dashboard.no_recent_activity')}</Typography>}</Stack>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center"><Box><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{t('admin.dashboard.support_terminal_overline')}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600 }}>{t('admin.dashboard.support_terminal_desc')}</Typography></Box><CeoContactButtons compact /></Stack>
                </Paper>
            </Box>
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}><Alert severity={snackbar.severity} sx={{ fontWeight: 900, borderRadius: 3 }}>{snackbar.message}</Alert></Snackbar>
        </AdminPageFrame>
    );
}

function UsersIcon() {
    return <Building2 size={18} />;
}

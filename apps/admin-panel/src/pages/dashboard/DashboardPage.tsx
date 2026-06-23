// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useState } from 'react';
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

const isNearBreach = (mission: any) => {
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    if (!due) return false;
    const remainingMs = due - Date.now();
    return remainingMs > 0 && remainingMs <= 60 * 60 * 1000;
};

const isBreached = (mission: any) => {
    if (mission.slaBreached === true || mission.slaStatus === 'BREACHED') return true;
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    return due > 0 && due < Date.now();
};

const formatSla = (mission: any) => {
    if (mission.slaRemaining || mission.slaText) return String(mission.slaRemaining || mission.slaText);
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    if (!due) return 'SLA not configured';
    const diff = due - Date.now();
    const abs = Math.abs(diff);
    const hours = Math.floor(abs / (60 * 60 * 1000));
    const minutes = Math.floor((abs % (60 * 60 * 1000)) / (60 * 1000));
    return diff < 0 ? `Breached by ${hours}h ${minutes}m` : `${hours}h ${minutes}m remaining`;
};

const reviewPathFor = (item: any) => {
    if (item.type === 'OWNER_ONBOARDING') return `/manual-approvals?type=owner&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'TECH_ONBOARD') return `/manual-approvals?type=technician&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'PAYMENT_PROOF') return `/manual-approvals?type=payment&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'BROKER_COMMISSION') return `/broker?commissionId=${encodeURIComponent(item.id)}`;
    return '/manual-approvals';
};

const getHealth = (source: any, key: string) => source?.launchHealth?.[key] || source?.gates?.[key] || source?.[key] || 'UNKNOWN';

export default function DashboardPage() {
    const navigate = useNavigate();
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

    const updateKPI = (key: string, value: number | string, status: KPIStatus = 'success') => {
        setKpis((prev) => ({ ...prev, [key]: { ...prev[key], value, status } }));
    };

    const handleKPIError = (key: string, error: any) => {
        const status = error?.code === 'permission-denied' ? 'denied' : 'error';
        setKpis((prev) => ({ ...prev, [key]: { ...prev[key], status } }));
    };

    useEffect(() => {
        const unsubscribers: (() => void)[] = [];

        unsubscribers.push(onSnapshot(collection(db, 'properties'), (snap) => {
            updateKPI('totalProperties', snap.size);
            updateKPI('totalUnits', snap.docs.reduce((sum, row) => sum + Number(row.data().units || row.data().totalUnits || row.data().unitsCount || 0), 0));
        }, (err) => { handleKPIError('totalProperties', err); handleKPIError('totalUnits', err); }));

        unsubscribers.push(onSnapshot(query(collection(db, 'users'), where('role', '==', 'tenant')), (snap) => updateKPI('activeTenants', snap.size), (err) => handleKPIError('activeTenants', err)));
        unsubscribers.push(onSnapshot(query(collection(db, 'tenant_invites'), where('status', '==', 'PENDING')), (snap) => updateKPI('pendingTenantInvites', snap.size), (err) => handleKPIError('pendingTenantInvites', err)));

        unsubscribers.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
            const missions = snap.docs.map((row) => ({ id: row.id, ...row.data() }));
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

    const renderQueueRows = (rows: any[], empty: string) => rows.length ? rows.map((item) => (
        <TableRow key={`${item.type}-${item.id}`} hover>
            <TableCell sx={{ fontWeight: 700 }}>{item.origin}</TableCell>
            <TableCell><Chip label={item.type || 'Standard'} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 900 }} /></TableCell>
            <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{item.linkedName || item.userId || 'Not linked'}</TableCell>
            <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>{formatDate(item.createdAt || item.submittedAt)}</TableCell>
            <TableCell align="right"><Button size="small" variant="outlined" onClick={() => navigate(reviewPathFor(item))} sx={{ fontWeight: 900, fontSize: '0.65rem' }}>REVIEW</Button></TableCell>
        </TableRow>
    )) : (
        <TableRow><TableCell colSpan={5} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{empty}</TableCell></TableRow>
    );

    return (
        <AdminPageFrame title="Executive Command Center" subtitle="HARD-LIVE OPERATIONS TERMINAL" lastUpdated={lastSync} onRefresh={() => window.location.reload()}>
            <Box sx={{ pb: 8 }}>
                <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1, mb: 4, '&::-webkit-scrollbar': { height: 4 } }}>
                    <Button startIcon={<Plus />} variant="contained" onClick={() => navigate('/onboard-property')}>Add Property</Button>
                    <Button startIcon={<Upload />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/bulk-import')}>Import Tenants</Button>
                    <Button startIcon={<CheckCircle2 />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/manual-approvals')}>Verify Payments</Button>
                    <Button startIcon={<FileText />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/document-vault')}>Document Vault</Button>
                    <Button startIcon={<Zap />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/admin/pricing-matrix')}>Pricing Matrix</Button>
                    <Button startIcon={<Shield />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/orphans')}>Orphan War Room</Button>
                    <Button startIcon={<Activity />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/ops/technicians')}>Duty Command</Button>
                    <Button startIcon={<TrendingUp />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/reports')}>Command Report</Button>
                </Stack>

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
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{job.propertyName || job.propertyTitle || 'Property not linked'}</Typography>
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
                            <Stack spacing={3}><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>MONTHLY COLLECTIONS</Typography><Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}><Typography variant="h4" fontWeight="950">{money(verifiedMonthly)}</Typography><Typography variant="caption" sx={{ color: statusColor(growth === 'Trend unavailable' ? 'UNKNOWN' : 'READY'), fontWeight: 900 }}>{growth}</Typography></Box></Box><Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} /><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Verified Collections</Typography><Typography variant="body2" sx={{ fontWeight: 900 }}>{kpis.totalCollections.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Pending Liquidity</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>{kpis.pendingLiquidity.value}</Typography></Box><Box sx={{ display: 'flex', justifyContent: 'space-between' }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Overdue Payments</Typography><Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.danger }}>{kpis.overduePayments.value}</Typography></Box><Button fullWidth variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/transactions')}>FULL LEDGER ACCESS</Button></Stack>
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
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}><Alert severity={snackbar.severity} sx={{ fontWeight: 900, borderRadius: 3 }}>{snackbar.message}</Alert></Snackbar>
        </AdminPageFrame>
    );
}

function UsersIcon() {
    return <Building2 size={18} />;
}

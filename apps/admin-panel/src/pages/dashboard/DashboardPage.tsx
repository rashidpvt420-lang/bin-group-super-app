// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useState } from 'react';
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
    Home,
    Shield,
    Wrench
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, limit, onSnapshot, query, where } from '../../lib/firebase';
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

const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const PENDING_COMMISSION_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];
const OPEN_REVIEW_STATES = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW', 'pending_admin_approval', 'pending_approval'];

const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;

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

const isBreached = (mission: RecordRow) => {
    if (mission.slaBreached === true || String(mission.slaStatus || '').toUpperCase() === 'BREACHED') return true;
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    return due > 0 && due < Date.now();
};

const isNearBreach = (mission: RecordRow) => {
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    if (!due) return false;
    const remainingMs = due - Date.now();
    return remainingMs > 0 && remainingMs <= 60 * 60 * 1000;
};

const formatSla = (mission: RecordRow) => {
    if (mission.slaRemaining || mission.slaText) return String(mission.slaRemaining || mission.slaText);
    const due = getMillis(mission.slaDueAt || mission.slaDeadline || mission.dueAt);
    if (!due) return 'SLA not configured';
    const diff = due - Date.now();
    const absolute = Math.abs(diff);
    const hours = Math.floor(absolute / 3_600_000);
    const minutes = Math.floor((absolute % 3_600_000) / 60_000);
    return diff < 0 ? `Breached by ${hours}h ${minutes}m` : `${hours}h ${minutes}m remaining`;
};

const statusTone = (value: any) => {
    const status = normalizeStatus(value);
    if (['READY', 'ACTIVE', 'PASS', 'GREEN', 'VERIFIED', 'CLEAR'].some((word) => status.includes(word))) return '#10b981';
    if (['BLOCKED', 'FAIL', 'ERROR', 'BREACH', 'EXPIRED', 'DENIED'].some((word) => status.includes(word))) return '#ef4444';
    if (['PENDING', 'REVIEW', 'UNKNOWN', 'WARNING'].some((word) => status.includes(word))) return '#f59e0b';
    return 'rgba(255,255,255,0.62)';
};

const reviewPathFor = (item: RecordRow) => {
    if (item.type === 'OWNER_ONBOARDING') return `/manual-approvals?type=owner&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'TECH_ONBOARD') return `/manual-approvals?type=technician&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'PAYMENT_PROOF') return `/manual-approvals?type=payment&id=${encodeURIComponent(item.id)}`;
    if (item.type === 'BROKER_COMMISSION') return `/broker?commissionId=${encodeURIComponent(item.id)}`;
    return '/manual-approvals';
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

    useEffect(() => {
        const unsubscribers: Array<() => void> = [];

        unsubscribers.push(onSnapshot(collection(db, 'properties'), (snap) => {
            const rows = snap.docs.map((row) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
            setProperties(rows.length);
            setUnits(rows.reduce((sum, row) => sum + Number(row.units || row.totalUnits || row.unitsCount || 0), 0));
            setLastSync(new Date());
        }));

        unsubscribers.push(onSnapshot(query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)), (snap) => {
            const rows = snap.docs.map((row) => ({ id: row.id, ...(row.data() as Record<string, any>) })) as RecordRow[];
            rows.sort((a: RecordRow, b: RecordRow) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt));
            setMissions(rows.slice(0, 10));
            setLastSync(new Date());
        }));

        unsubscribers.push(onSnapshot(query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATES), limit(10)), (snap) => {
            const rows = snap.docs.map((row) => ({ id: row.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', ...(row.data() as Record<string, any>) })) as RecordRow[];
            setPaymentQueue(rows.sort((a: RecordRow, b: RecordRow) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
        }));

        unsubscribers.push(onSnapshot(query(collection(db, 'broker_commissions'), where('status', 'in', PENDING_COMMISSION_STATES), limit(10)), (snap) => {
            const rows = snap.docs.map((row) => ({ id: row.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', ...(row.data() as Record<string, any>) })) as RecordRow[];
            setCommissionQueue(rows.sort((a: RecordRow, b: RecordRow) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
        }));

        unsubscribers.push(onSnapshot(query(collection(db, 'intake_submissions'), where('status', 'in', OPEN_REVIEW_STATES), limit(10)), (snap) => {
            const rows = snap.docs.map((row) => ({ id: row.id, type: 'OWNER_ONBOARDING', origin: 'Owner onboarding', ...(row.data() as Record<string, any>) })) as RecordRow[];
            setApprovalQueue(rows.sort((a: RecordRow, b: RecordRow) => getMillis(b.createdAt || b.submittedAt) - getMillis(a.createdAt || a.submittedAt)));
        }));

        unsubscribers.push(onSnapshot(doc(db, 'admin_summaries', 'global'), (snap) => {
            setSummary(snap.exists() ? (snap.data() as Record<string, any>) : {});
        }));

        return () => unsubscribers.forEach((unsub) => unsub());
    }, []);

    const breached = missions.filter(isBreached).length;
    const nearBreach = missions.filter(isNearBreach).length;
    const actionQueue = [...approvalQueue, ...paymentQueue, ...commissionQueue];
    const launchHealth = summary.launchHealth || summary.gates || {};

    const metrics: Metric[] = [
        { label: 'Total Properties', value: properties, icon: <Home size={18} />, tone: '#3b82f6', route: '/properties/passport' },
        { label: 'Total Units', value: units, icon: <Building2 size={18} />, tone: '#8b5cf6' },
        { label: 'Open Missions', value: missions.length, icon: <Wrench size={18} />, tone: '#f59e0b', route: '/tickets' },
        { label: 'SLA Breaches', value: breached, icon: <AlertTriangle size={18} />, tone: breached ? '#ef4444' : '#10b981', route: '/tickets?sla=breached' },
        { label: 'SLA Near Breach', value: nearBreach, icon: <Clock size={18} />, tone: nearBreach ? '#f59e0b' : '#10b981', route: '/tickets?sla=near' },
        { label: 'Payment Verifications', value: paymentQueue.length, icon: <DollarSign size={18} />, tone: paymentQueue.length ? '#f59e0b' : '#10b981', route: '/manual-approvals?type=payment' },
        { label: 'Broker Commissions', value: commissionQueue.length, icon: <Briefcase size={18} />, tone: commissionQueue.length ? '#f59e0b' : '#10b981', route: '/broker' },
        { label: 'Owner Reviews', value: approvalQueue.length, icon: <Shield size={18} />, tone: approvalQueue.length ? '#f59e0b' : '#10b981', route: '/manual-approvals?type=owner' }
    ];

    const healthRows = [
        ['Main App Build', launchHealth.mainAppBuild || summary.mainAppBuild || 'UNKNOWN'],
        ['Command Panel Build', launchHealth.commandPanelBuild || summary.commandPanelBuild || 'UNKNOWN'],
        ['Owner App Build', launchHealth.ownerAppBuild || summary.ownerAppBuild || 'UNKNOWN'],
        ['Functions Deploy', launchHealth.functionsDeploy || summary.functionsDeploy || 'UNKNOWN'],
        ['Firestore Rules', launchHealth.firestoreRules || summary.firestoreRules || 'UNKNOWN'],
        ['Storage Rules', launchHealth.storageRules || summary.storageRules || 'UNKNOWN'],
        ['App Check', launchHealth.appCheck || summary.appCheck || 'UNKNOWN'],
        ['Payment Verification', launchHealth.paymentVerification || summary.paymentVerification || 'UNKNOWN'],
        ['Branded Email', launchHealth.brandedEmail || summary.brandedEmail || 'UNKNOWN'],
        ['BIN Connect', launchHealth.binConnect || summary.binConnect || 'UNKNOWN']
    ];

    return (
        <AdminPageFrame title="Executive Command Center" subtitle="HARD-LIVE OPERATIONS TERMINAL" lastUpdated={lastSync} onRefresh={() => window.location.reload()}>
            <Stack spacing={4}>
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                    <Button variant="contained" onClick={() => navigate('/onboard-property')}>Add Property</Button>
                    <Button variant="outlined" onClick={() => navigate('/manual-approvals')}>Verify Payments</Button>
                    <Button variant="outlined" onClick={() => navigate('/document-vault')}>Document Vault</Button>
                    <Button variant="outlined" onClick={() => navigate('/reports')}>Command Report</Button>
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
                                <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}><CheckCircle2 color={binThemeTokens.gold} /> Action Queues</Typography>
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead><TableRow><TableCell>Origin</TableCell><TableCell>Linked Record</TableCell><TableCell>Status</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
                                    <TableBody>
                                        {actionQueue.map((item) => (
                                            <TableRow key={`${item.type}-${item.id}`} hover>
                                                <TableCell>{item.origin || item.type || 'Review'}</TableCell>
                                                <TableCell>{item.ownerEmail || item.tenantEmail || item.brokerEmail || item.payerEmail || item.id}</TableCell>
                                                <TableCell><Chip size="small" label={normalizeStatus(item.status)} sx={{ color: statusTone(item.status), bgcolor: alpha(statusTone(item.status), 0.12), fontWeight: 900 }} /></TableCell>
                                                <TableCell align="right"><Button size="small" onClick={() => navigate(reviewPathFor(item))}>Review</Button></TableCell>
                                            </TableRow>
                                        ))}
                                        {actionQueue.length === 0 && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5, color: 'rgba(255,255,255,0.35)' }}>No pending actions.</TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}><Activity color={binThemeTokens.gold} /> Live Operations</Typography>
                            <Stack spacing={1.5}>
                                {missions.slice(0, 5).map((mission) => (
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
                        <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}><FileText color={binThemeTokens.gold} /> Launch Health</Typography>
                            <Grid container spacing={1.5}>
                                {healthRows.map(([label, value]) => (
                                    <Grid item xs={12} sm={6} key={label}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 2 }}>
                                            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{label}</Typography>
                                            <Chip size="small" label={normalizeStatus(value)} sx={{ bgcolor: alpha(statusTone(value), 0.12), color: statusTone(value), fontWeight: 900 }} />
                                        </Stack>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, height: '100%' }}>
                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}><DollarSign color={binThemeTokens.gold} /> Financial Intelligence</Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={4}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>COLLECTIONS</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{money(summary.totalCollections || summary.monthlyCollections || summary.mrr)}</Typography></Grid>
                                <Grid item xs={12} sm={4}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>PENDING</Typography><Typography sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{money(summary.pendingLiquidity)}</Typography></Grid>
                                <Grid item xs={12} sm={4}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>OVERDUE</Typography><Typography sx={{ color: '#ef4444', fontWeight: 950 }}>{money(summary.overduePayments)}</Typography></Grid>
                            </Grid>
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

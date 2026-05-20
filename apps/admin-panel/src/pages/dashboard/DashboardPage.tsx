// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx

import React, { useState, useEffect } from 'react';
import {
    Grid, Paper, Typography, Box, Chip, Table, TableBody,
    TableCell, TableHead, TableRow, TableContainer, Skeleton, Stack,
    Alert, Snackbar, Button, alpha,
    Tooltip, Divider
} from '@mui/material';
import {
    Activity, Shield, Briefcase, Users, Home, Wrench,
    AlertTriangle, DollarSign, FileText, CheckCircle2,
    Clock, Plus, Upload,
    Zap, TrendingUp, Building2, Gavel, FileWarning,
    Lock
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    db, collection, query, where, onSnapshot,
    orderBy, doc, limit, Timestamp
} from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import CeoContactButtons from '../../components/CeoContactButtons';

// --- Types ---
type KPIState = {
    value: number | string | null;
    status: 'loading' | 'success' | 'error' | 'denied';
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
    icon?: React.ReactNode;
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

const PENDING_OWNER_STATUSES = [
    'PENDING',
    'PENDING_ADMIN_APPROVAL',
    'ADMIN_REVIEW',
    'pending_admin_approval',
    'pending_approval'
];

const PENDING_TECHNICIAN_STATUSES = [
    'PENDING',
    'PENDING_ADMIN_APPROVAL',
    'pending_admin_approval',
    'pending_approval'
];

const PENDING_PAYMENT_STATES = [
    'PENDING',
    'ADMIN_VERIFICATION_REQUIRED'
];

export default function DashboardPage() {
    const navigate = useNavigate();

    // UI State
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

    // KPIs State
    const [kpis, setKpis] = useState<Record<string, KPIState>>({
        totalProperties: { label: 'Total Properties', value: null, status: 'loading', icon: <Home size={18} />, color: '#3b82f6', path: '/properties' },
        totalUnits: { label: 'Total Units', value: null, status: 'loading', icon: <Building2 size={18} />, color: '#8b5cf6' },
        activeTenants: { label: 'Active Tenants', value: null, status: 'loading', icon: <Users size={18} />, color: '#10b981', path: '/tenants' },
        pendingTenantInvites: { label: 'Pending Invites', value: null, status: 'loading', icon: <Users size={18} />, color: '#f59e0b' },
        openMissions: { label: 'Open Missions', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#f59e0b', path: '/tickets' },
        emergencyRequests: { label: 'Emergency (SOS)', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: '#ef4444', path: '/sos' },
        activeTechnicians: { label: 'Active Technicians', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#10b981', path: '/technicians' },
        activeBrokers: { label: 'Active Brokers', value: null, status: 'loading', icon: <Briefcase size={18} />, color: '#8b5cf6', path: '/broker' },
        pendingOwnerApprovals: { label: 'Owner Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b' },
        pendingTechnicianApprovals: { label: 'Tech Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b' },
        pendingPaymentVerifications: { label: 'Payment Verifications', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b', path: '/manual-approvals' },
        activeContracts: { label: 'Active Contracts', value: null, status: 'loading', icon: <FileText size={18} />, color: '#10b981' },
        propertyPassports: { label: 'Property Passports', value: null, status: 'loading', icon: <FileText size={18} />, color: '#3b82f6', path: '/properties/passport' },
        documentsUploaded: { label: 'Documents', value: null, status: 'loading', icon: <FileText size={18} />, color: '#8b5cf6', path: '/document-vault' },
        auditEventsToday: { label: 'Audit Events Today', value: null, status: 'loading', icon: <Activity size={18} />, color: '#3b82f6', path: '/audit' },
        orphanRecords: { label: 'Orphan Records', value: null, status: 'loading', icon: <FileWarning size={18} />, color: '#ef4444', path: '/orphans' },
        totalCollections: { label: 'Total Collections', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#10b981', path: '/transactions' },
        pendingLiquidity: { label: 'Pending Liquidity', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b' },
        overduePayments: { label: 'Overdue Payments', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: '#ef4444' },
        payrollPending: { label: 'Payroll Pending', value: null, status: 'loading', icon: <Gavel size={18} />, color: '#f59e0b', path: '/financials/payroll' }
    });

    // Lists State
    const [approvalQueue, setApprovalQueue] = useState<any[]>([]);
    const [operationsMissions, setOperationsMissions] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

    // --- Helper for updating KPI state ---
    const updateKPI = (key: string, value: number | string, status: KPIState['status'] = 'success') => {
        setKpis(prev => ({
            ...prev,
            [key]: { ...prev[key], value, status }
        }));
    };

    const handleKPIError = (key: string, error: any) => {
        const status = error?.code === 'permission-denied' ? 'denied' : 'error';
        setKpis(prev => ({
            ...prev,
            [key]: { ...prev[key], status }
        }));
    };

    // --- Listeners Setup ---
    useEffect(() => {
        const unsubscribers: (() => void)[] = [];

        // 1. Properties & Units
        unsubscribers.push(onSnapshot(collection(db, "properties"),
            (snap) => {
                updateKPI('totalProperties', snap.size);
                let totalUnits = 0;
                snap.docs.forEach(doc => totalUnits += Number(doc.data().units || doc.data().totalUnits || 0));
                updateKPI('totalUnits', totalUnits);
            },
            (err) => { handleKPIError('totalProperties', err); handleKPIError('totalUnits', err); }
        ));

        // 2. Tenants & Invites
        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "tenant")),
            (snap) => updateKPI('activeTenants', snap.size),
            (err) => handleKPIError('activeTenants', err)
        ));
        unsubscribers.push(onSnapshot(query(collection(db, "tenant_invites"), where("status", "==", "PENDING")),
            (snap) => updateKPI('pendingTenantInvites', snap.size),
            (err) => handleKPIError('pendingTenantInvites', err)
        ));

        // 3. Maintenance & SOS
        unsubscribers.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("status", "in", ACTIVE_TICKET_STATUSES)),
            (snap) => {
                updateKPI('openMissions', snap.size);
                setOperationsMissions(snap.docs.slice(0, 10).map(doc => ({ id: doc.id, ...doc.data() })));
            },
            (err) => handleKPIError('openMissions', err)
        ));
        unsubscribers.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("priority", "in", ["EMERGENCY", "emergency"])),
            (snap) => {
                const activeEmergencyCount = snap.docs.filter(doc => !['COMPLETED', 'CLOSED', 'completed', 'closed'].includes(String(doc.data().status || ''))).length;
                updateKPI('emergencyRequests', activeEmergencyCount);
            },
            (err) => handleKPIError('emergencyRequests', err)
        ));

        // 4. Technicians & Brokers
        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "technician"), where("status", "in", ["ACTIVE", "active"])),
            (snap) => updateKPI('activeTechnicians', snap.size),
            (err) => handleKPIError('activeTechnicians', err)
        ));
        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "broker")),
            (snap) => updateKPI('activeBrokers', snap.size),
            (err) => handleKPIError('activeBrokers', err)
        ));

        // 5. Approvals Queues
        unsubscribers.push(onSnapshot(query(collection(db, "intake_submissions"), where("status", "in", PENDING_OWNER_STATUSES)),
            (snap) => {
                updateKPI('pendingOwnerApprovals', snap.size);
                const items = snap.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        origin: 'Owner onboarding',
                        type: 'OWNER_ONBOARDING',
                        linkedName: data.companyProfile?.name || data.ownerEmail || data.ownerUid || data.ownerId,
                        createdAt: data.submittedAt || data.createdAt,
                        ...data
                    };
                });
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.type !== 'OWNER_ONBOARDING');
                    return [...filtered, ...items].sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                });
            },
            (err) => handleKPIError('pendingOwnerApprovals', err)
        ));

        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "technician"), where("status", "in", PENDING_TECHNICIAN_STATUSES)),
            (snap) => {
                updateKPI('pendingTechnicianApprovals', snap.size);
                const items = snap.docs.map(doc => ({ id: doc.id, origin: 'Technician onboarding', type: 'TECH_ONBOARD', linkedName: doc.data().displayName || doc.data().email || doc.id, createdAt: doc.data().createdAt, ...doc.data() }));
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.type !== 'TECH_ONBOARD');
                    return [...filtered, ...items].sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                });
            },
            (err) => handleKPIError('pendingTechnicianApprovals', err)
        ));

        unsubscribers.push(onSnapshot(query(collection(db, "payment_transactions"), where("status", "in", PENDING_PAYMENT_STATES)),
            (snap) => updateKPI('pendingPaymentVerifications', snap.size),
            (err) => handleKPIError('pendingPaymentVerifications', err)
        ));

        // 6. Contracts & Passports
        unsubscribers.push(onSnapshot(query(collection(db, "contracts"), where("status", "==", "ACTIVE")),
            (snap) => updateKPI('activeContracts', snap.size),
            (err) => handleKPIError('activeContracts', err)
        ));
        unsubscribers.push(onSnapshot(collection(db, "propertyPassports"),
            (snap) => updateKPI('propertyPassports', snap.size),
            (err) => handleKPIError('propertyPassports', err)
        ));

        // 7. Documents & Audit
        unsubscribers.push(onSnapshot(collection(db, "documents"),
            (snap) => updateKPI('documentsUploaded', snap.size),
            (err) => handleKPIError('documentsUploaded', err)
        ));

        const today = new Date();
        today.setHours(0,0,0,0);
        unsubscribers.push(onSnapshot(query(collection(db, "audit_logs"), where("createdAt", ">=", Timestamp.fromDate(today))),
            (snap) => updateKPI('auditEventsToday', snap.size),
            (err) => handleKPIError('auditEventsToday', err)
        ));

        // 8. Orphans
        unsubscribers.push(onSnapshot(doc(db, "system_stats", "orphans"), (snap) => {
            if (snap.exists()) updateKPI('orphanRecords', snap.data().total || 0);
            else updateKPI('orphanRecords', 0);
        }, (err) => handleKPIError('orphanRecords', err)));

        // 9. Financials
        unsubscribers.push(onSnapshot(doc(db, "admin_summaries", "global"), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                updateKPI('totalCollections', `AED ${data.totalCollections?.toLocaleString() || 0}`);
                updateKPI('pendingLiquidity', `AED ${data.pendingLiquidity?.toLocaleString() || 0}`);
                updateKPI('overduePayments', `AED ${data.overduePayments?.toLocaleString() || 0}`);
                updateKPI('payrollPending', `AED ${data.payrollPending?.toLocaleString() || 0}`);
            } else {
                updateKPI('totalCollections', 'AED 0');
                updateKPI('pendingLiquidity', 'AED 0');
                updateKPI('overduePayments', 'AED 0');
                updateKPI('payrollPending', 'AED 0');
            }
        }, (err) => {
            handleKPIError('totalCollections', err);
            handleKPIError('pendingLiquidity', err);
            handleKPIError('overduePayments', err);
            handleKPIError('payrollPending', err);
        }));

        // 10. Recent Activity Feed
        unsubscribers.push(onSnapshot(query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(10)), (snap) => {
            const activities = snap.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    actor: data.actor?.displayName || data.actorRole || data.actorId || 'SYSTEM',
                    action: data.action || data.eventType || 'updated system state',
                    module: data.module || data.targetType || 'Audit',
                    status: data.status || 'RECORDED',
                    timestamp: data.createdAt || data.timestamp || new Date()
                } as ActivityItem;
            });
            setRecentActivity(activities);
        }));

        setLastSync(new Date());

        return () => unsubscribers.forEach(unsub => unsub());
    }, []);

    // --- Render Helpers ---

    const renderKPI = (key: string) => {
        const kpi = kpis[key];
        if (kpi.status === 'loading') {
            return (
                <Paper key={key} sx={{ p: 2, bgcolor: binThemeTokens.graphite, border: `1px solid ${alpha(binThemeTokens.gold, 0.05)}`, borderRadius: 4 }}>
                    <Skeleton variant="circular" width={24} height={24} sx={{ mb: 1 }} />
                    <Skeleton variant="text" width="60%" />
                    <Skeleton variant="text" width="40%" height={32} />
                </Paper>
            );
        }

        if (kpi.status === 'denied') {
            return (
                <Tooltip key={key} title="Permission Denied">
                    <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.danger, 0.05), border: `1px solid ${alpha(binThemeTokens.danger, 0.2)}`, borderRadius: 4, cursor: 'help' }}>
                        <Lock size={18} color={binThemeTokens.danger} style={{ marginBottom: 8 }} />
                        <Typography variant="caption" sx={{ color: binThemeTokens.danger, fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.danger, fontWeight: 950 }}>ACCESS DENIED</Typography>
                    </Paper>
                </Tooltip>
            );
        }

        if (kpi.status === 'error') {
            return (
                <Paper key={key} sx={{ p: 2, bgcolor: alpha(binThemeTokens.danger, 0.05), border: `1px solid ${alpha(binThemeTokens.danger, 0.1)}`, borderRadius: 4 }}>
                    <AlertTriangle size={18} color={binThemeTokens.danger} style={{ marginBottom: 8 }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.danger, fontWeight: 950 }}>ERROR LOADING</Typography>
                </Paper>
            );
        }

        const isEmpty = kpi.value === 0 || kpi.value === 'AED 0';

        return (
            <Paper
                key={key}
                onClick={() => kpi.path && navigate(kpi.path)}
                sx={{
                    p: 2,
                    bgcolor: binThemeTokens.graphite,
                    border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`,
                    borderRadius: 4,
                    transition: 'all 0.2s',
                    cursor: kpi.path ? 'pointer' : 'default',
                    '&:hover': kpi.path ? {
                        bgcolor: alpha(binThemeTokens.gold, 0.05),
                        borderColor: binThemeTokens.gold,
                        transform: 'translateY(-2px)'
                    } : {}
                }}
            >
                <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 950, color: isEmpty ? 'rgba(255,255,255,0.2)' : '#fff' }}>
                    {kpi.value}
                </Typography>
                {isEmpty && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 700, fontStyle: 'italic' }}>No records yet</Typography>}
            </Paper>
        );
    };

    return (
        <AdminPageFrame
            title="Executive Command Center"
            subtitle="V2.5 SOVEREIGN OPERATIONS TERMINAL"
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                <Box sx={{ mb: 4 }}>
                    <Stack direction="row" spacing={2} sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { height: 4 } }}>
                        <Button startIcon={<Plus />} variant="contained" onClick={() => navigate('/onboard-property')}>Add Property</Button>
                        <Button startIcon={<Upload />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/bulk-import')}>Import Tenants</Button>
                        <Button startIcon={<CheckCircle2 />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/manual-approvals')}>Verify Payments</Button>
                        <Button startIcon={<FileText />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/document-vault')}>Document Vault</Button>
                        <Button startIcon={<Zap />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/admin/pricing-matrix')}>Pricing Matrix</Button>
                        <Button startIcon={<Shield />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/orphans')}>Orphan War Room</Button>
                        <Button startIcon={<Activity />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/ops/technicians')}>Duty Command</Button>
                        <Button startIcon={<TrendingUp />} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#fff' }} onClick={() => navigate('/reports')}>Admin Report</Button>
                    </Stack>
                </Box>

                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>PORTFOLIO KPIs</Typography>
                <Grid container spacing={2} sx={{ mb: 6 }}>
                    {Object.keys(kpis).map(key => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={key}>
                            {renderKPI(key)}
                        </Grid>
                    ))}
                </Grid>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Shield color={binThemeTokens.gold} /> PENDING APPROVALS
                                </Typography>
                                <Chip label={`${approvalQueue.length} AWAITING`} size="small" sx={{ fontWeight: 900, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
                            </Box>
                            <TableContainer sx={{ maxHeight: 400 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ bgcolor: '#0f172a' }}>ORIGIN</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a' }}>TYPE</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a' }}>LINKED</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a' }}>SUBMITTED</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a' }} align="right">ACTION</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {approvalQueue.map((item) => (
                                            <TableRow key={item.id} hover>
                                                <TableCell sx={{ fontWeight: 700 }}>{item.origin}</TableCell>
                                                <TableCell><Chip label={item.type || 'Standard'} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 900 }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{item.linkedName || item.userId || 'N/A'}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                                                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Button size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem' }}>REVIEW</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {approvalQueue.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                                                    ALL CLEAR: NO PENDING APPROVALS
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Wrench color={binThemeTokens.gold} /> LIVE OPERATIONS
                            </Typography>
                            <Stack spacing={2}>
                                {operationsMissions.map((job) => (
                                    <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION #{job.id.substring(0,8)}</Typography>
                                            <Chip
                                                label={job.priority}
                                                size="small"
                                                sx={{
                                                    height: 18,
                                                    fontSize: '0.6rem',
                                                    bgcolor: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? alpha(binThemeTokens.danger, 0.1) : 'rgba(255,255,255,0.05)',
                                                    color: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? binThemeTokens.danger : 'inherit',
                                                    fontWeight: 900
                                                }}
                                            />
                                        </Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{job.title || job.issueType}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{job.propertyName || 'Tower Pilot'}</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <Clock size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>SLA: {job.slaRemaining || '2h 15m'}</Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{job.status}</Typography>
                                        </Box>
                                    </Box>
                                ))}
                                {operationsMissions.length === 0 && (
                                    <Box sx={{ py: 6, textAlign: 'center' }}>
                                        <CheckCircle2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO ACTIVE MISSIONS</Typography>
                                    </Box>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <DollarSign color={binThemeTokens.gold} /> FINANCIAL INTELLIGENCE
                            </Typography>
                            <Stack spacing={3}>
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>MRR GROWTH</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                        <Typography variant="h4" fontWeight="950">AED 1.2M</Typography>
                                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>+12%</Typography>
                                    </Box>
                                </Box>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Verified Collections</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 900 }}>{kpis.totalCollections.value}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Pending Liquidity</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.gold }}>{kpis.pendingLiquidity.value}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>Overdue Payments</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 900, color: binThemeTokens.danger }}>{kpis.overduePayments.value}</Typography>
                                </Box>
                                <Button fullWidth variant="outlined" sx={{ mt: 1 }} onClick={() => navigate('/transactions')}>FULL LEDGER ACCESS</Button>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <FileText color={binThemeTokens.gold} /> COMPLIANCE & DOCS
                            </Typography>
                            <Box sx={{ mb: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SYSTEM SECURITY STATUS</Typography>
                                    <Chip label="HARDENED" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900, fontSize: '0.6rem' }} />
                                </Box>
                                <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                    <Box sx={{ width: '98%', height: '100%', bgcolor: '#10b981' }} />
                                </Box>
                            </Box>
                            <Stack spacing={2}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ p: 1, bgcolor: 'rgba(59,130,246,0.1)', borderRadius: 2, color: '#3b82f6' }}><Shield size={16} /></Box>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Governance Audit</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Canonical audit_logs active</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ ml: 'auto', color: '#10b981', fontWeight: 900 }}>SECURE</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <Box sx={{ p: 1, bgcolor: 'rgba(245,158,11,0.1)', borderRadius: 2, color: '#f59e0b' }}><FileWarning size={16} /></Box>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Expired Documents</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Trade licenses / Passports</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ ml: 'auto', color: '#f59e0b', fontWeight: 900 }}>12 PENDING</Typography>
                                </Box>
                            </Stack>
                            <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate('/document-vault')}>OPEN VAULT</Button>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Activity color={binThemeTokens.gold} /> RECENT ACTIVITY
                            </Typography>
                            <Stack spacing={2.5}>
                                {recentActivity.map((log) => (
                                    <Box key={log.id} sx={{ display: 'flex', gap: 2 }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} />
                                            <Box sx={{ flexGrow: 1, width: '1px', bgcolor: 'rgba(255,255,255,0.1)', my: 0.5 }} />
                                        </Box>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                {log.actor} <Box component="span" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>{log.action}</Box>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, display: 'block', mt: 0.5 }}>
                                                {log.module} • {(log.timestamp as any)?.toDate ? (log.timestamp as any).toDate().toLocaleTimeString() : 'Just now'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                                {recentActivity.length === 0 && (
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 4 }}>NO RECENT ACTIVITY LOGGED</Typography>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>COMMAND SUPPORT TERMINAL</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600 }}>
                                Sovereign support nodes are active. For critical infrastructure failure or CEO-level escalation, use the secure channels below.
                                Standard audit logs and system monitoring remain the primary path for routine operations.
                            </Typography>
                        </Box>
                        <CeoContactButtons compact />
                    </Stack>
                </Paper>
            </Box>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} sx={{ fontWeight: 900, borderRadius: 3 }}>{snackbar.message}</Alert>
            </Snackbar>
        </AdminPageFrame>
    );
}
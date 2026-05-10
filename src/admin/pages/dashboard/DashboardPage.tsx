// src/admin/pages/dashboard/DashboardPage.tsx

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
    Lock, UserPlus, FileCheck, ClipboardList, Database,
    FileSpreadsheet, MessageSquare, ExternalLink, ChevronRight, Cpu
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../../context/LanguageContext';
import { useAI } from '../../../context/AIContext';
import { db } from '@/lib/firebase';
import { 
    collection, query, where, onSnapshot, 
    orderBy, doc, limit, 
    Timestamp 
} from 'firebase/firestore';
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

export default function DashboardPage() {
    const { t, isRTL, language } = useLanguage();
    const { setPageContext } = useAI();
    const navigate = useNavigate();
    
    // UI State
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    
    // KPIs State
    const [kpis, setKpis] = useState<Record<string, KPIState>>({
        totalProperties: { label: t('admin.kpi.properties') || 'Total Properties', value: null, status: 'loading', icon: <Home size={18} />, color: '#3b82f6', path: '/admin/properties' },
        totalUnits: { label: t('admin.kpi.units') || 'Total Units', value: null, status: 'loading', icon: <Building2 size={18} />, color: '#8b5cf6' },
        activeTenants: { label: t('admin.kpi.tenants') || 'Active Tenants', value: null, status: 'loading', icon: <Users size={18} />, color: '#10b981', path: '/admin/tenants' },
        pendingTenantInvites: { label: t('admin.kpi.invites') || 'Pending Invites', value: null, status: 'loading', icon: <Users size={18} />, color: '#f59e0b' },
        openMissions: { label: t('admin.kpi.missions') || 'Open Missions', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#f59e0b', path: '/admin/tickets' },
        emergencyRequests: { label: t('admin.kpi.emergency') || 'Emergency (SOS)', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: '#ef4444', path: '/admin/sos' },
        activeTechnicians: { label: t('admin.kpi.technicians') || 'Active Technicians', value: null, status: 'loading', icon: <Wrench size={18} />, color: '#10b981', path: '/admin/technicians' },
        activeBrokers: { label: t('admin.kpi.brokers') || 'Active Brokers', value: null, status: 'loading', icon: <Briefcase size={18} />, color: '#8b5cf6', path: '/admin/broker' },
        pendingOwnerApprovals: { label: t('admin.kpi.owner_appr') || 'Owner Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b' },
        pendingTechnicianApprovals: { label: t('admin.kpi.tech_appr') || 'Tech Approvals', value: null, status: 'loading', icon: <Shield size={18} />, color: '#f59e0b' },
        pendingPaymentVerifications: { label: t('admin.kpi.payment_appr') || 'Payment Verifications', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b', path: '/admin/manual-approvals' },
        activeContracts: { label: t('admin.kpi.contracts') || 'Active Contracts', value: null, status: 'loading', icon: <FileText size={18} />, color: '#10b981' },
        propertyPassports: { label: t('admin.kpi.passports') || 'Property Passports', value: null, status: 'loading', icon: <FileText size={18} />, color: '#3b82f6', path: '/admin/properties/passport' },
        documentsUploaded: { label: t('admin.kpi.documents') || 'Documents', value: null, status: 'loading', icon: <FileText size={18} />, color: '#8b5cf6', path: '/admin/document-vault' },
        auditEventsToday: { label: t('admin.kpi.audit') || 'Audit Events Today', value: null, status: 'loading', icon: <Activity size={18} />, color: '#3b82f6', path: '/admin/audit' },
        orphanRecords: { label: t('admin.kpi.orphans') || 'Orphan Records', value: null, status: 'loading', icon: <FileWarning size={18} />, color: '#ef4444', path: '/admin/orphans' },
        totalCollections: { label: t('admin.kpi.collections') || 'Total Collections', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#10b981', path: '/admin/transactions' },
        pendingLiquidity: { label: t('admin.kpi.liquidity') || 'Pending Liquidity', value: null, status: 'loading', icon: <DollarSign size={18} />, color: '#f59e0b' },
        overduePayments: { label: t('admin.kpi.overdue') || 'Overdue Payments', value: null, status: 'loading', icon: <AlertTriangle size={18} />, color: '#ef4444' },
        payrollPending: { label: t('admin.kpi.payroll') || 'Payroll Pending', value: null, status: 'loading', icon: <Gavel size={18} />, color: '#f59e0b', path: '/admin/financials/payroll' }
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
                snap.docs.forEach(doc => totalUnits += (doc.data().units || 0));
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
        unsubscribers.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"])), 
            (snap) => {
                updateKPI('openMissions', snap.size);
                setOperationsMissions(snap.docs.slice(0, 10).map(doc => ({ id: doc.id, ...doc.data() })));
            },
            (err) => handleKPIError('openMissions', err)
        ));
        unsubscribers.push(onSnapshot(query(collection(db, "maintenanceTickets"), where("priority", "==", "EMERGENCY"), where("status", "!=", "COMPLETED")), 
            (snap) => updateKPI('emergencyRequests', snap.size),
            (err) => handleKPIError('emergencyRequests', err)
        ));

        // 4. Technicians & Brokers
        unsubscribers.push(onSnapshot(query(collection(db, "technicians"), where("status", "==", "ACTIVE")), 
            (snap) => updateKPI('activeTechnicians', snap.size),
            (err) => handleKPIError('activeTechnicians', err)
        ));
        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "broker")), 
            (snap) => updateKPI('activeBrokers', snap.size),
            (err) => handleKPIError('activeBrokers', err)
        ));

        // 5. Approvals Queues
        unsubscribers.push(onSnapshot(query(collection(db, "approvals"), where("status", "==", "PENDING")), 
            (snap) => {
                updateKPI('pendingOwnerApprovals', snap.size); 
                const items = snap.docs.map(doc => ({ id: doc.id, origin: 'Approvals', ...doc.data() }));
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.origin !== 'Approvals');
                    return [...filtered, ...items].sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                });
            },
            (err) => handleKPIError('pendingOwnerApprovals', err)
        ));
        
        unsubscribers.push(onSnapshot(query(collection(db, "pending_technicians"), where("status", "==", "PENDING")), 
            (snap) => {
                updateKPI('pendingTechnicianApprovals', snap.size);
                const items = snap.docs.map(doc => ({ id: doc.id, origin: 'Technician onboarding', type: 'TECH_ONBOARD', ...doc.data() }));
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.type !== 'TECH_ONBOARD');
                    return [...filtered, ...items];
                });
            },
            (err) => handleKPIError('pendingTechnicianApprovals', err)
        ));

        unsubscribers.push(onSnapshot(query(collection(db, "paymentSubmissions"), where("status", "==", "PENDING")), 
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
            const activities = snap.docs.map(doc => ({
                id: doc.id,
                timestamp: doc.data().createdAt,
                ...doc.data()
            } as ActivityItem));
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
                <Tooltip key={key} title={t('common.access_denied') || 'Permission Denied'}>
                    <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.danger, 0.05), border: `1px solid ${alpha(binThemeTokens.danger, 0.2)}`, borderRadius: 4, cursor: 'help' }}>
                        <Lock size={18} color={binThemeTokens.danger} style={{ marginBottom: 8 }} />
                        <Typography variant="caption" sx={{ color: binThemeTokens.danger, fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                        <Typography variant="body2" sx={{ color: binThemeTokens.danger, fontWeight: 950 }}>{t('common.denied') || 'ACCESS DENIED'}</Typography>
                    </Paper>
                </Tooltip>
            );
        }

        if (kpi.status === 'error') {
            return (
                <Paper key={key} sx={{ p: 2, bgcolor: alpha(binThemeTokens.danger, 0.05), border: `1px solid ${alpha(binThemeTokens.danger, 0.1)}`, borderRadius: 4 }}>
                    <AlertTriangle size={18} color={binThemeTokens.danger} style={{ marginBottom: 8 }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                    <Typography variant="body2" sx={{ color: binThemeTokens.danger, fontWeight: 950 }}>{t('common.error_loading') || 'ERROR LOADING'}</Typography>
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
                    textAlign: isRTL ? 'right' : 'left',
                    '&:hover': kpi.path ? {
                        bgcolor: alpha(binThemeTokens.gold, 0.05),
                        borderColor: binThemeTokens.gold,
                        transform: 'translateY(-2px)'
                    } : {}
                }}
            >
                <Box sx={{ color: kpi.color, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>{kpi.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{kpi.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 950, color: isEmpty ? 'rgba(255,255,255,0.2)' : '#fff' }}>
                    {typeof kpi.value === 'object' ? '...' : kpi.value}
                </Typography>
                {isEmpty && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 700, fontStyle: 'italic' }}>{t('common.no_records') || 'No records yet'}</Typography>}
            </Paper>
        );
    };

    return (
        <AdminPageFrame 
            title={t('admin.terminal.title') || "Executive Command Center"} 
            subtitle={t('admin.terminal.subtitle') || "V2.5 SOVEREIGN OPERATIONS TERMINAL"}
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
                {/* 1. Operations Command Center (Phase 2B Requirement) */}
                <Box sx={{ mb: 6 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block', letterSpacing: 2, textAlign: isRTL ? 'right' : 'left' }}>
                        {t('admin.panels.operations') || 'OPERATIONS COMMAND CENTER'}
                    </Typography>
                    <Grid container spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        {[
                            { label: t('admin.actions.add_property') || 'Add Property', icon: <Building2 size={18} />, path: '/admin/add-property', color: binThemeTokens.gold },
                            { label: t('admin.actions.add_owner') || 'Add Property Owner', icon: <UserPlus size={18} />, path: '/admin/owners', color: '#3b82f6' },
                            { label: t('admin.actions.add_tenant') || 'Add Tenant', icon: <UserPlus size={18} />, path: '/admin/tenants', color: '#10b981' },
                            { label: t('admin.actions.bulk_import') || 'Bulk Import Tenants', icon: <Upload size={18} />, path: '/admin/bulk-import', color: '#8b5cf6' },
                            { label: t('admin.actions.add_tech') || 'Add Technician', icon: <Wrench size={18} />, path: '/admin/technicians', color: '#f97316' },
                            { label: t('admin.actions.create_contract') || 'Create Contract', icon: <FileText size={18} />, path: '/admin/contracts', color: binThemeTokens.gold },
                            { label: t('admin.actions.verify_payment') || 'Verify Payment', icon: <CheckCircle2 size={18} />, path: '/admin/payments', color: '#10b981' },
                            { label: t('admin.actions.property_passport') || 'Open Property Passport', icon: <ClipboardList size={18} />, path: '/admin/property-passports', color: '#3b82f6' },
                            { label: t('admin.actions.pricing_matrix') || 'Open Pricing Matrix', icon: <Zap size={18} />, path: '/admin/pricing', color: '#f59e0b' },
                            { label: t('admin.actions.duty_command') || 'Open Duty Command', icon: <Activity size={18} />, path: '/admin/duty-command', color: '#ef4444' },
                            { label: 'IoT Smart Monitor', icon: <Cpu size={18} />, path: '/admin/smart-building', color: binThemeTokens.gold },
                            { label: t('admin.actions.owner_registry') || 'Open Owner Registry', icon: <Users size={18} />, path: '/admin/owners-registry', color: '#8b5cf6' },
                            { label: t('admin.actions.export_report') || 'Export Admin Report', icon: <TrendingUp size={18} />, path: '/admin/reports', color: binThemeTokens.gold },
                            { label: t('admin.actions.company_profile') || 'Company Profile', icon: <Building2 size={18} />, path: '/admin/company-profile', color: '#3b82f6' },
                            { label: t('admin.actions.permissions') || 'Permissions', icon: <Lock size={18} />, path: '/admin/permissions', color: '#ef4444' },
                        ].map((btn) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={btn.label}>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => navigate(btn.path)}
                                    startIcon={btn.icon}
                                    sx={{
                                        height: '100%',
                                        flexDirection: 'column',
                                        gap: 1.5,
                                        py: 3,
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        borderColor: 'rgba(255,255,255,0.05)',
                                        color: 'rgba(255,255,255,0.7)',
                                        borderRadius: 4,
                                        '& .MuiButton-startIcon': { m: 0, color: btn.color },
                                        '&:hover': {
                                            bgcolor: alpha(btn.color, 0.05),
                                            borderColor: alpha(btn.color, 0.3),
                                            color: '#FFF',
                                            transform: 'translateY(-2px)'
                                        },
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        fontSize: '0.65rem',
                                        fontWeight: 950,
                                        textAlign: 'center',
                                        lineHeight: 1.2
                                    }}
                                >
                                    {btn.label.toUpperCase()}
                                </Button>
                            </Grid>
                        ))}
                    </Grid>
                </Box>

                {/* 2. Executive KPI Grid */}
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block', textAlign: isRTL ? 'right' : 'left' }}>
                    {t('admin.panels.kpis') || 'PORTFOLIO KPIs'}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 6, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    {Object.keys(kpis).map(key => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={key}>
                            {renderKPI(key)}
                        </Grid>
                    ))}
                </Grid>

                <Grid container spacing={4} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                    {/* 3. Pending Approvals Panel */}
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 8, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', textAlign: isRTL ? 'right' : 'left' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Shield color={binThemeTokens.gold} /> {t('admin.panels.approvals') || 'PENDING APPROVALS'}
                                </Typography>
                                <Chip label={`${approvalQueue.length} ${t('common.awaiting') || 'AWAITING'}`} size="small" sx={{ fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }} />
                            </Box>
                            <TableContainer sx={{ maxHeight: 400 }}>
                                <Table stickyHeader size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ bgcolor: '#0f172a', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.table.origin') || 'ORIGIN'}</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.table.type') || 'TYPE'}</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.table.linked') || 'LINKED'}</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.table.submitted') || 'SUBMITTED'}</TableCell>
                                            <TableCell sx={{ bgcolor: '#0f172a', textAlign: isRTL ? 'right' : 'left' }} align={isRTL ? "left" : "right"}>{t('admin.table.action') || 'ACTION'}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {approvalQueue.map((item) => (
                                            <TableRow key={item.id} hover>
                                                <TableCell sx={{ fontWeight: 800, textAlign: isRTL ? 'right' : 'left' }}>{item.origin}</TableCell>
                                                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Chip label={item.type || 'Standard'} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 950 }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)', textAlign: isRTL ? 'right' : 'left' }}>{item.linkedName || item.userId || 'N/A'}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', textAlign: isRTL ? 'right' : 'left' }}>
                                                    {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : 'Recent'}
                                                </TableCell>
                                                <TableCell align={isRTL ? "left" : "right"}>
                                                    <Button size="small" variant="outlined" sx={{ fontWeight: 950, fontSize: '0.65rem', borderRadius: 2 }}>{t('common.review') || 'REVIEW'}</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {approvalQueue.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                                                    {t('admin.status.all_clear') || 'ALL CLEAR: NO PENDING APPROVALS'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    {/* 4. Operations Command Panel */}
                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%', textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Wrench color={binThemeTokens.gold} /> {t('admin.panels.live_ops') || 'LIVE OPERATIONS'}
                            </Typography>
                            <Stack spacing={2}>
                                {operationsMissions.map((job) => (
                                    <Box key={job.id} sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{t('common.mission') || 'MISSION'} #{job.id.substring(0,8).toUpperCase()}</Typography>
                                            <Chip 
                                                label={t(`priority.${job.priority?.toLowerCase()}`) || job.priority} 
                                                size="small" 
                                                sx={{ 
                                                    height: 18, 
                                                    fontSize: '0.6rem', 
                                                    bgcolor: job.priority === 'EMERGENCY' ? alpha(binThemeTokens.danger, 0.1) : 'rgba(255,255,255,0.05)',
                                                    color: job.priority === 'EMERGENCY' ? binThemeTokens.danger : 'inherit',
                                                    fontWeight: 950
                                                }} 
                                            />
                                        </Box>
                                        <Typography variant="body2" sx={{ fontWeight: 800, mb: 0.5 }}>{job.title || job.issueType}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', fontWeight: 700 }}>{job.propertyName || 'Tower Pilot'}</Typography>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                                <Clock size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>SLA: {job.slaRemaining || '2h 15m'}</Typography>
                                            </Box>
                                            <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950 }}>{t(`status.ticket.${job.status?.toLowerCase()}`) || job.status}</Typography>
                                        </Box>
                                    </Box>
                                ))}
                                {operationsMissions.length === 0 && (
                                    <Box sx={{ py: 6, textAlign: 'center' }}>
                                        <CheckCircle2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('admin.status.no_missions') || 'NO ACTIVE MISSIONS'}</Typography>
                                    </Box>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* 5. Financial Command Panel */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <DollarSign color={binThemeTokens.gold} /> {t('admin.panels.financials') || 'FINANCIAL INTELLIGENCE'}
                            </Typography>
                            <Stack spacing={3}>
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{t('admin.metrics.mrr') || 'MRR GROWTH'}</Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Typography variant="h4" fontWeight="950">AED 1.2M</Typography>
                                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950 }}>+12%</Typography>
                                    </Box>
                                </Box>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{t('admin.kpi.collections') || 'Verified Collections'}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 950 }}>{kpis.totalCollections.value}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{t('admin.kpi.liquidity') || 'Pending Liquidity'}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{kpis.pendingLiquidity.value}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800 }}>{t('admin.kpi.overdue') || 'Overdue Payments'}</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 950, color: binThemeTokens.danger }}>{kpis.overduePayments.value}</Typography>
                                </Box>
                                <Button fullWidth variant="outlined" sx={{ mt: 2, fontWeight: 950, borderRadius: 3 }} onClick={() => navigate('/admin/transactions')}>
                                    {t('admin.actions.ledger') || 'FULL LEDGER ACCESS'}
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* 6. Document & Compliance Panel */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <FileText color={binThemeTokens.gold} /> {t('admin.panels.compliance') || 'COMPLIANCE & DOCS'}
                            </Typography>
                            <Box sx={{ mb: 4 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{t('admin.status.security') || 'SYSTEM SECURITY STATUS'}</Typography>
                                    <Chip label={t('status.hardened') || 'HARDENED'} size="small" sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950, fontSize: '0.6rem' }} />
                                </Box>
                                <Box sx={{ height: 6, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                                    <Box sx={{ width: '98%', height: '100%', bgcolor: '#10b981' }} />
                                </Box>
                            </Box>
                            <Stack spacing={2.5}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Box sx={{ p: 1.5, bgcolor: alpha('#3b82f6', 0.1), borderRadius: 3, color: '#3b82f6' }}><Shield size={18} /></Box>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{t('admin.actions.audit_scan') || 'Governance Audit'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Last scan: 42m ago</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ ml: isRTL ? 0 : 'auto', mr: isRTL ? 'auto' : 0, color: '#10b981', fontWeight: 950 }}>{t('status.secure') || 'SECURE'}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    <Box sx={{ p: 1.5, bgcolor: alpha('#f59e0b', 0.1), borderRadius: 3, color: '#f59e0b' }}><FileWarning size={18} /></Box>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 800 }}>{t('admin.kpi.expired_docs') || 'Expired Documents'}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>Trade licenses / Passports</Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ ml: isRTL ? 0 : 'auto', mr: isRTL ? 'auto' : 0, color: '#f59e0b', fontWeight: 950 }}>12 {t('common.pending') || 'PENDING'}</Typography>
                                </Box>
                            </Stack>
                            <Button fullWidth variant="outlined" sx={{ mt: 4, fontWeight: 950, borderRadius: 3 }} onClick={() => navigate('/admin/document-vault')}>
                                {t('admin.actions.vault') || 'OPEN VAULT'}
                            </Button>
                        </Paper>
                    </Grid>

                    {/* 7. Activity Feed */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 8, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%', textAlign: isRTL ? 'right' : 'left' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Activity color={binThemeTokens.gold} /> {t('admin.panels.activity') || 'RECENT ACTIVITY'}
                            </Typography>
                            <Stack spacing={3}>
                                {recentActivity.map((log) => (
                                    <Box key={log.id} sx={{ display: 'flex', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: binThemeTokens.gold, mt: 1 }} />
                                            <Box sx={{ flexGrow: 1, width: '1px', bgcolor: 'rgba(255,255,255,0.1)', my: 0.5 }} />
                                        </Box>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                                                {String(log.actor || 'SYSTEM')} <Box component="span" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>{String(log.action || 'ACTIVITY')}</Box>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800, display: 'block', mt: 0.5 }}>
                                                {log.module} • {(log.timestamp as any)?.toDate ? (log.timestamp as any).toDate().toLocaleTimeString() : 'Just now'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                                {recentActivity.length === 0 && (
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 6, fontWeight: 800, display: 'block' }}>
                                        {t('admin.status.no_activity') || 'NO RECENT ACTIVITY LOGGED'}
                                    </Typography>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>

                {/* 8. Admin Support Row */}
                <Paper sx={{ p: 4, mt: 8, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 8, textAlign: isRTL ? 'right' : 'left' }}>
                    <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('admin.support.title') || 'COMMAND SUPPORT TERMINAL'}</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 700, mt: 1, fontWeight: 700, lineHeight: 1.6 }}>
                                {t('admin.support.desc') || 'Sovereign support nodes are active. For critical infrastructure failure or CEO-level escalation, use the secure channels below.'}
                            </Typography>
                        </Box>
                        <CeoContactButtons compact />
                    </Stack>
                </Paper>
            </Box>
            
            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} sx={{ fontWeight: 950, borderRadius: 4, bgcolor: '#1e293b', color: '#FFF', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)' }}>{snackbar.message}</Alert>
            </Snackbar>
        </AdminPageFrame>
    );
}

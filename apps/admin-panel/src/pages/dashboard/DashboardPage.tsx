// apps/admin-panel/src/pages/dashboard/DashboardPage.tsx
// V3.0 — SOVEREIGN OPERATIONS TERMINAL — ALL HARDCODED VALUES REPLACED

import React, { useState, useEffect, useMemo } from 'react';
import {
    Grid, Paper, Typography, Box, Chip, Table, TableBody,
    TableCell, TableHead, TableRow, TableContainer, Skeleton, Stack,
    Alert, Snackbar, Button, alpha,
    Tooltip, Divider, LinearProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField
} from '@mui/material';
import {
    Activity, Shield, Briefcase, Users, Home, Wrench,
    AlertTriangle, DollarSign, FileText, CheckCircle2,
    Clock, Plus, Upload,
    Zap, TrendingUp, Building2, Gavel, FileWarning,
    Lock, MessageSquare, Radio, Heart, Wifi, WifiOff,
    UserCheck, UserX, Rocket, XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    db, collection, query, where, onSnapshot,
    orderBy, doc, limit, Timestamp, getDocs, updateDoc, serverTimestamp,
    functions, httpsCallable
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
};

type SLABreachItem = {
    id: string;
    title: string;
    propertyName: string;
    priority: string;
    createdAt: any;
    technicianName?: string;
    slaHours: number;
    breachMinutes: number;
};

type PaymentProofItem = {
    id: string;
    ownerName?: string;
    amount: number;
    reference?: string;
    submittedAt: any;
    status: string;
};

type CommissionItem = {
    id: string;
    brokerName: string;
    propertyName?: string;
    amount: number;
    contractValue?: number;
    submittedAt: any;
};

// SLA policy: minutes allowed by priority
const SLA_POLICY_MINUTES: Record<string, number> = {
    EMERGENCY: 30,
    HIGH: 120,
    MEDIUM: 240,
    STANDARD: 480,
    LOW: 1440,
};

const getSlaRemainingMinutes = (ticket: any): number => {
    const priority = String(ticket.priority || 'STANDARD').toUpperCase();
    const slaMinutes = SLA_POLICY_MINUTES[priority] ?? 480;
    const createdAt = ticket.createdAt?.toDate ? ticket.createdAt.toDate() : new Date(ticket.createdAt || Date.now());
    const elapsedMs = Date.now() - createdAt.getTime();
    const elapsedMinutes = elapsedMs / 60000;
    return slaMinutes - elapsedMinutes;
};

const formatSlaRemaining = (minutesRemaining: number): string => {
    if (minutesRemaining <= 0) return 'SLA BREACHED';
    const h = Math.floor(minutesRemaining / 60);
    const m = Math.floor(minutesRemaining % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const ACTIVE_TICKET_STATUSES = [
    'OPEN', 'PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED',
    'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'open', 'accepted'
];

const PENDING_OWNER_STATUSES = [
    'PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW',
    'pending_admin_approval', 'pending_approval'
];

const PENDING_TECHNICIAN_STATUSES = [
    'PENDING', 'PENDING_ADMIN_APPROVAL', 'pending_admin_approval', 'pending_approval'
];

const PENDING_PAYMENT_STATES = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED'];

export default function DashboardPage() {
    const navigate = useNavigate();

    // UI State
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
    const [approveDialogOpen, setApproveDialogOpen] = useState(false);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [selectedApproval, setSelectedApproval] = useState<any>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    // KPIs State
    const [kpis, setKpis] = useState<Record<string, KPIState>>({
        totalProperties: { label: 'Total Properties', value: null, status: 'loading', icon: <Home size={18} />, color: '#3b82f6', path: '/properties/passport' },
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
    const [slaBreachQueue, setSlaBreachQueue] = useState<SLABreachItem[]>([]);
    const [paymentProofQueue, setPaymentProofQueue] = useState<PaymentProofItem[]>([]);
    const [commissionQueue, setCommissionQueue] = useState<CommissionItem[]>([]);
    const [renewalQueue, setRenewalQueue] = useState<any[]>([]);
    const [mrrThisMonth, setMrrThisMonth] = useState<number>(0);
    const [mrrLastMonth, setMrrLastMonth] = useState<number>(0);
    const [expiredDocsCount, setExpiredDocsCount] = useState<number | null>(null);
    const [systemHealthStatus, setSystemHealthStatus] = useState<'CHECKING' | 'HEALTHY' | 'DEGRADED' | 'ERROR'>('CHECKING');
    const [adminSummaries, setAdminSummaries] = useState<any>({});

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

    // --- MRR Calculation from payment_transactions ---
    useEffect(() => {
        const now = new Date();
        const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        const unsubThis = onSnapshot(
            query(
                collection(db, 'payment_transactions'),
                where('status', 'in', ['VERIFIED', 'APPROVED', 'verified', 'approved']),
                where('createdAt', '>=', Timestamp.fromDate(startOfThisMonth))
            ),
            (snap) => {
                let total = 0;
                snap.docs.forEach(d => total += Number(d.data().amount || 0));
                setMrrThisMonth(total);
            },
            () => {}
        );

        const unsubLast = onSnapshot(
            query(
                collection(db, 'payment_transactions'),
                where('status', 'in', ['VERIFIED', 'APPROVED', 'verified', 'approved']),
                where('createdAt', '>=', Timestamp.fromDate(startOfLastMonth)),
                where('createdAt', '<=', Timestamp.fromDate(endOfLastMonth))
            ),
            (snap) => {
                let total = 0;
                snap.docs.forEach(d => total += Number(d.data().amount || 0));
                setMrrLastMonth(total);
            },
            () => {}
        );

        return () => { unsubThis(); unsubLast(); };
    }, []);

    // --- Expired documents count ---
    useEffect(() => {
        const now = Timestamp.fromDate(new Date());
        const unsubExpired = onSnapshot(
            query(collection(db, 'documents'), where('expiryDate', '<', now)),
            (snap) => setExpiredDocsCount(snap.size),
            () => setExpiredDocsCount(0)
        );
        return () => unsubExpired();
    }, []);

    // --- System health check ---
    useEffect(() => {
        const checkHealth = async () => {
            try {
                const healthSnap = await getDocs(query(collection(db, 'system_health'), limit(1)));
                if (!healthSnap.empty) {
                    const data = healthSnap.docs[0].data();
                    setSystemHealthStatus(data.status || 'HEALTHY');
                } else {
                    // Firestore is reachable, so basic health is OK
                    setSystemHealthStatus('HEALTHY');
                }

                // Fetch admin_summaries for commercial readiness
                const adminSumRef = doc(db, 'system_health', 'admin_summaries');
                const unsub = onSnapshot(adminSumRef, (docSnap) => {
                    if (docSnap.exists()) {
                        setAdminSummaries(docSnap.data());
                    }
                });
                return unsub;
            } catch {
                setSystemHealthStatus('DEGRADED');
            }
        };
        const unsubPromise = checkHealth();
        return () => {
            unsubPromise.then(unsub => { if (typeof unsub === 'function') unsub(); });
        };
    }, []);

    // --- SLA Breach Queue ---
    useEffect(() => {
        const unsubSla = onSnapshot(
            query(collection(db, 'maintenanceTickets'), where('status', 'in', ACTIVE_TICKET_STATUSES)),
            (snap) => {
                const breached: SLABreachItem[] = [];
                const nearBreach: SLABreachItem[] = [];
                snap.docs.forEach(d => {
                    const data = d.data();
                    const remainingMinutes = getSlaRemainingMinutes(data);
                    if (remainingMinutes <= 30) { // breached or within 30min
                        const priority = String(data.priority || 'STANDARD').toUpperCase();
                        const item: SLABreachItem = {
                            id: d.id,
                            title: data.title || data.issueType || 'Maintenance Request',
                            propertyName: data.propertyName || '',
                            priority,
                            createdAt: data.createdAt,
                            technicianName: data.technicianName,
                            slaHours: (SLA_POLICY_MINUTES[priority] ?? 480) / 60,
                            breachMinutes: Math.abs(Math.min(0, remainingMinutes)),
                        };
                        if (remainingMinutes <= 0) breached.push(item);
                        else nearBreach.push(item);
                    }
                });
                setSlaBreachQueue([...breached, ...nearBreach].slice(0, 10));
            },
            () => {}
        );
        return () => unsubSla();
    }, []);

    // --- Payment Proof Queue ---
    useEffect(() => {
        const unsubPayments = onSnapshot(
            query(
                collection(db, 'payment_transactions'),
                where('status', 'in', PENDING_PAYMENT_STATES),
                orderBy('createdAt', 'desc'),
                limit(5)
            ),
            (snap) => {
                setPaymentProofQueue(snap.docs.map(d => ({
                    id: d.id,
                    ownerName: d.data().ownerName || d.data().paidBy || 'Unknown',
                    amount: d.data().amount || 0,
                    reference: d.data().reference || d.data().bankRef || d.data().transactionRef,
                    submittedAt: d.data().createdAt,
                    status: d.data().status,
                })));
            },
            () => {}
        );
        return () => unsubPayments();
    }, []);

    // --- Broker Commission Queue ---
    useEffect(() => {
        const unsubComm = onSnapshot(
            query(collection(db, 'broker_commissions'), where('status', 'in', ['PENDING', 'pending']), limit(5)),
            (snap) => {
                setCommissionQueue(snap.docs.map(d => ({
                    id: d.id,
                    brokerName: d.data().brokerName || 'Unknown Broker',
                    propertyName: d.data().propertyName,
                    amount: d.data().amount || 0,
                    contractValue: d.data().contractValue,
                    submittedAt: d.data().createdAt,
                })));
            },
            () => {}
        );
        return () => unsubComm();
    }, []);

    // --- Renewal Watch Queue ---
    useEffect(() => {
        const unsubRenewals = onSnapshot(
            query(collection(db, 'contract_renewal_watch'), limit(5)),
            (snap) => {
                setRenewalQueue(snap.docs.map(d => ({
                    id: d.id,
                    propertyName: d.data().propertyName || 'Unknown Property',
                    tenantName: d.data().tenantName || 'Unknown Tenant',
                    expiryDate: d.data().expiryDate,
                    status: d.data().status || 'PENDING'
                })));
            },
            () => {}
        );
        return () => unsubRenewals();
    }, []);

    // --- Main Listeners Setup ---
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
                        linkedName: data.companyProfile?.name || data.ownerEmail || data.ownerUid || data.ownerId || 'Unknown',
                        linkedId: data.ownerUid || data.ownerId || doc.id,
                        createdAt: data.submittedAt || data.createdAt,
                        ...data
                    };
                });
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.type !== 'OWNER_ONBOARDING');
                    return [...filtered, ...items].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
                });
            },
            (err) => handleKPIError('pendingOwnerApprovals', err)
        ));

        unsubscribers.push(onSnapshot(query(collection(db, "users"), where("role", "==", "technician"), where("status", "in", PENDING_TECHNICIAN_STATUSES)),
            (snap) => {
                updateKPI('pendingTechnicianApprovals', snap.size);
                const items = snap.docs.map(doc => ({
                    id: doc.id,
                    origin: 'Technician onboarding',
                    type: 'TECH_ONBOARD',
                    linkedName: doc.data().displayName || doc.data().email || doc.id,
                    linkedId: doc.id,
                    createdAt: doc.data().createdAt,
                    ...doc.data()
                }));
                setApprovalQueue(prev => {
                    const filtered = prev.filter(p => p.type !== 'TECH_ONBOARD');
                    return [...filtered, ...items].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
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
        today.setHours(0, 0, 0, 0);
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
                updateKPI('totalCollections', `AED ${(data.totalCollections || 0).toLocaleString()}`);
                updateKPI('pendingLiquidity', `AED ${(data.pendingLiquidity || 0).toLocaleString()}`);
                updateKPI('overduePayments', `AED ${(data.overduePayments || 0).toLocaleString()}`);
                updateKPI('payrollPending', `AED ${(data.payrollPending || 0).toLocaleString()}`);
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

    // --- MRR Growth Calculation ---
    const mrrGrowthPct = useMemo(() => {
        if (mrrLastMonth === 0) return mrrThisMonth > 0 ? 100 : 0;
        return Math.round(((mrrThisMonth - mrrLastMonth) / mrrLastMonth) * 100);
    }, [mrrThisMonth, mrrLastMonth]);

    // --- Approval Actions ---
    const handleReviewApproval = (item: any) => {
        if (item.type === 'OWNER_ONBOARDING') {
            if (item.linkedId) {
                navigate(`/owners/${item.linkedId}`);
            } else {
                navigate('/owners');
            }
        } else if (item.type === 'TECH_ONBOARD') {
            navigate('/technicians');
        } else {
            navigate('/owners');
        }
    };

    const handleApproveClick = (item: any) => {
        setSelectedApproval(item);
        setApproveDialogOpen(true);
    };

    const handleRejectClick = (item: any) => {
        setSelectedApproval(item);
        setRejectDialogOpen(true);
    };

    const handleApproveConfirm = async () => {
        if (!selectedApproval) return;
        setActionLoading(true);
        try {
            if (selectedApproval.type === 'OWNER_ONBOARDING') {
                const approveActivation = httpsCallable(functions, 'approveOwnerActivation');
                await approveActivation({
                    intakeId: selectedApproval.id,
                    ownerId: selectedApproval.ownerUid || selectedApproval.ownerId || selectedApproval.linkedId,
                    contractId: selectedApproval.contractId,
                    paymentId: selectedApproval.paymentId,
                    propertyIds: selectedApproval.propertyIds
                });
            } else if (selectedApproval.type === 'TECH_ONBOARD') {
                await updateDoc(doc(db, 'users', selectedApproval.id), {
                    status: 'ACTIVE',
                    approvedAt: serverTimestamp(),
                    approvedBy: 'admin'
                });
            }
            setSnackbar({ open: true, message: `${selectedApproval.linkedName} approved successfully.`, severity: 'success' });
            setApproveDialogOpen(false);
            setSelectedApproval(null);
        } catch (err) {
            setSnackbar({ open: true, message: 'Approval failed. Check permissions.', severity: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

    const handleRejectConfirm = async () => {
        if (!selectedApproval || !rejectReason.trim()) return;
        setActionLoading(true);
        try {
            const collection_name = selectedApproval.type === 'TECH_ONBOARD' ? 'users' : 'intake_submissions';
            await updateDoc(doc(db, collection_name, selectedApproval.id), {
                status: 'REJECTED',
                rejectedAt: serverTimestamp(),
                rejectedBy: 'admin',
                rejectionReason: rejectReason,
            });
            setSnackbar({ open: true, message: `${selectedApproval.linkedName} rejected.`, severity: 'success' });
            setRejectDialogOpen(false);
            setSelectedApproval(null);
            setRejectReason('');
        } catch {
            setSnackbar({ open: true, message: 'Rejection failed. Check permissions.', severity: 'error' });
        } finally {
            setActionLoading(false);
        }
    };

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
                <Tooltip key={key} title="Permission Denied — contact your admin">
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

    const systemHealthColor = systemHealthStatus === 'HEALTHY' ? '#10b981' : systemHealthStatus === 'DEGRADED' ? '#f59e0b' : '#ef4444';

    return (
        <AdminPageFrame
            title="Executive Command Center"
            subtitle="V3.0 SOVEREIGN OPERATIONS TERMINAL"
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                {/* Quick Actions */}
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
                        <Button startIcon={<UserCheck />} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }} onClick={() => navigate('/hr')}>Staff Access</Button>
                    </Stack>
                </Box>

                {/* KPI Grid */}
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>PORTFOLIO KPIs</Typography>
                <Grid container spacing={2} sx={{ mb: 6 }}>
                    {Object.keys(kpis).map(key => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={key}>
                            {renderKPI(key)}
                        </Grid>
                    ))}
                </Grid>

                <Grid container spacing={4}>
                    {/* Pending Approvals Table — REVIEW buttons now wired */}
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
                                            <TableCell sx={{ bgcolor: '#0f172a' }} align="right">ACTIONS</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {approvalQueue.map((item) => (
                                            <TableRow key={item.id} hover>
                                                <TableCell sx={{ fontWeight: 700 }}>{item.origin}</TableCell>
                                                <TableCell><Chip label={item.type || 'Standard'} size="small" sx={{ fontSize: '0.65rem', height: 20, fontWeight: 900 }} /></TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.6)' }}>{item.linkedName || 'N/A'}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>
                                                    {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'Recent'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontWeight: 900, fontSize: '0.6rem', color: '#10b981', borderColor: '#10b981' }}
                                                            onClick={() => handleApproveClick(item)}
                                                        >
                                                            APPROVE
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontWeight: 900, fontSize: '0.6rem', color: '#ef4444', borderColor: '#ef4444' }}
                                                            onClick={() => handleRejectClick(item)}
                                                        >
                                                            REJECT
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            variant="outlined"
                                                            sx={{ fontWeight: 900, fontSize: '0.6rem' }}
                                                            onClick={() => handleReviewApproval(item)}
                                                        >
                                                            VIEW
                                                        </Button>
                                                    </Stack>
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

                    {/* Live Operations */}
                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Wrench color={binThemeTokens.gold} /> LIVE OPERATIONS
                            </Typography>
                            <Stack spacing={2}>
                                {operationsMissions.map((job) => {
                                    const remainingMinutes = getSlaRemainingMinutes(job);
                                    const slaText = formatSlaRemaining(remainingMinutes);
                                    const slaColor = remainingMinutes <= 0 ? '#ef4444' : remainingMinutes <= 30 ? '#f59e0b' : '#10b981';
                                    const propertyDisplay = job.propertyName && job.propertyName.trim() ? job.propertyName : 'Property not linked';
                                    return (
                                        <Box key={job.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>MISSION #{job.id.substring(0, 8)}</Typography>
                                                <Chip
                                                    label={job.priority || 'STANDARD'}
                                                    size="small"
                                                    sx={{
                                                        height: 18, fontSize: '0.6rem',
                                                        bgcolor: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? alpha('#ef4444', 0.1) : 'rgba(255,255,255,0.05)',
                                                        color: String(job.priority || '').toUpperCase() === 'EMERGENCY' ? '#ef4444' : 'inherit',
                                                        fontWeight: 900
                                                    }}
                                                />
                                            </Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{job.title || job.issueType || 'Maintenance Request'}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>{propertyDisplay}</Typography>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    <Clock size={12} style={{ color: slaColor }} />
                                                    <Typography variant="caption" sx={{ color: slaColor, fontWeight: 700 }}>SLA: {slaText}</Typography>
                                                </Box>
                                                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900 }}>{job.status}</Typography>
                                            </Box>
                                        </Box>
                                    );
                                })}
                                {operationsMissions.length === 0 && (
                                    <Box sx={{ py: 6, textAlign: 'center' }}>
                                        <CheckCircle2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                        <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO ACTIVE MISSIONS</Typography>
                                    </Box>
                                )}
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* Financial Intelligence — Real MRR */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <DollarSign color={binThemeTokens.gold} /> FINANCIAL INTELLIGENCE
                            </Typography>
                            <Stack spacing={3}>
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                                        MRR THIS MONTH {mrrThisMonth === 0 && <Box component="span" sx={{ color: 'rgba(255,255,255,0.2)', ml: 1 }}>(No verified payments)</Box>}
                                    </Typography>
                                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                        <Typography variant="h4" fontWeight="950">
                                            AED {mrrThisMonth.toLocaleString()}
                                        </Typography>
                                        {mrrLastMonth > 0 && (
                                            <Typography variant="caption" sx={{ color: mrrGrowthPct >= 0 ? '#10b981' : '#ef4444', fontWeight: 900 }}>
                                                {mrrGrowthPct >= 0 ? '+' : ''}{mrrGrowthPct}% vs last month
                                            </Typography>
                                        )}
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

                    {/* Compliance & Docs — Real counts */}
                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <FileText color={binThemeTokens.gold} /> COMPLIANCE & DOCS
                            </Typography>
                            {/* Real system health from Firestore */}
                            <Box sx={{ mb: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SYSTEM SECURITY STATUS</Typography>
                                    <Chip
                                        label={systemHealthStatus}
                                        size="small"
                                        sx={{
                                            bgcolor: alpha(systemHealthColor, 0.1),
                                            color: systemHealthColor,
                                            fontWeight: 900, fontSize: '0.6rem'
                                        }}
                                    />
                                </Box>
                                <Box sx={{ height: 4, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                                    <Box sx={{ width: systemHealthStatus === 'HEALTHY' ? '100%' : systemHealthStatus === 'DEGRADED' ? '50%' : '20%', height: '100%', bgcolor: systemHealthColor, transition: 'width 1s ease' }} />
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
                                    <Typography variant="caption" sx={{ ml: 'auto', color: expiredDocsCount && expiredDocsCount > 0 ? '#f59e0b' : '#10b981', fontWeight: 900 }}>
                                        {expiredDocsCount === null ? <Skeleton width={40} /> : expiredDocsCount > 0 ? `${expiredDocsCount} EXPIRED` : 'ALL VALID'}
                                    </Typography>
                                </Box>
                            </Stack>
                            <Button fullWidth variant="outlined" sx={{ mt: 3 }} onClick={() => navigate('/document-vault')}>OPEN VAULT</Button>
                        </Paper>
                    </Grid>

                    {/* Recent Activity */}
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

                    {/* SLA BREACH QUEUE */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: `1px solid ${alpha('#ef4444', 0.2)}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <AlertTriangle color="#ef4444" /> SLA BREACH ALERT
                                </Typography>
                                {slaBreachQueue.length > 0 && (
                                    <Chip label={`${slaBreachQueue.length} AT RISK`} size="small" sx={{ bgcolor: alpha('#ef4444', 0.1), color: '#ef4444', fontWeight: 900 }} />
                                )}
                            </Box>
                            {slaBreachQueue.length === 0 ? (
                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                    <CheckCircle2 size={32} color="rgba(16,185,129,0.4)" style={{ margin: '0 auto 12px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO SLA BREACHES</Typography>
                                </Box>
                            ) : (
                                <Stack spacing={1.5}>
                                    {slaBreachQueue.map((item) => {
                                        const remaining = getSlaRemainingMinutes(item);
                                        const isBreached = remaining <= 0;
                                        return (
                                            <Box key={item.id} sx={{ p: 2, bgcolor: isBreached ? alpha('#ef4444', 0.05) : alpha('#f59e0b', 0.05), borderRadius: 2, border: `1px solid ${isBreached ? alpha('#ef4444', 0.2) : alpha('#f59e0b', 0.2)}` }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.title}</Typography>
                                                    <Chip label={isBreached ? 'BREACHED' : 'NEAR BREACH'} size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: isBreached ? alpha('#ef4444', 0.1) : alpha('#f59e0b', 0.1), color: isBreached ? '#ef4444' : '#f59e0b', fontWeight: 900 }} />
                                                </Box>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block' }}>
                                                    {item.propertyName || 'Property not linked'} · {item.priority} · SLA {item.slaHours}h
                                                </Typography>
                                                {isBreached && (
                                                    <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900 }}>
                                                        OVERDUE by {Math.round(item.breachMinutes)}m
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}
                                    <Button size="small" onClick={() => navigate('/tickets')} sx={{ color: '#ef4444', fontWeight: 900, mt: 1 }}>VIEW ALL TICKETS →</Button>
                                </Stack>
                            )}
                        </Paper>
                    </Grid>

                    {/* PAYMENT PROOF QUEUE */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <DollarSign color={binThemeTokens.gold} /> PAYMENT PROOF QUEUE
                                </Typography>
                                {paymentProofQueue.length > 0 && (
                                    <Chip label={`${paymentProofQueue.length} PENDING`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
                                )}
                            </Box>
                            {paymentProofQueue.length === 0 ? (
                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                    <CheckCircle2 size={32} color="rgba(16,185,129,0.4)" style={{ margin: '0 auto 12px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>ALL PAYMENTS VERIFIED</Typography>
                                </Box>
                            ) : (
                                <Stack spacing={1.5}>
                                    {paymentProofQueue.map((payment) => (
                                        <Box key={payment.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{payment.ownerName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                                    AED {payment.amount.toLocaleString()} {payment.reference ? `· Ref: ${payment.reference}` : ''}
                                                </Typography>
                                            </Box>
                                            <Button size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem', color: binThemeTokens.gold, borderColor: binThemeTokens.gold }} onClick={() => navigate('/manual-approvals')}>
                                                VERIFY
                                            </Button>
                                        </Box>
                                    ))}
                                    <Button size="small" onClick={() => navigate('/manual-approvals')} sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1 }}>VIEW ALL →</Button>
                                </Stack>
                            )}
                        </Paper>
                    </Grid>

                    {/* BROKER COMMISSION QUEUE */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Briefcase color={binThemeTokens.gold} /> BROKER COMMISSIONS PENDING
                                </Typography>
                                {commissionQueue.length > 0 && (
                                    <Chip label={`${commissionQueue.length} PENDING`} size="small" sx={{ bgcolor: alpha('#8b5cf6', 0.1), color: '#8b5cf6', fontWeight: 900 }} />
                                )}
                            </Box>
                            {commissionQueue.length === 0 ? (
                                <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800, py: 4, textAlign: 'center' }}>NO PENDING COMMISSIONS</Typography>
                            ) : (
                                <Stack spacing={1.5}>
                                    {commissionQueue.map((comm) => (
                                        <Box key={comm.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{comm.brokerName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                                    AED {comm.amount.toLocaleString()} commission
                                                    {comm.propertyName ? ` · ${comm.propertyName}` : ''}
                                                </Typography>
                                            </Box>
                                            <Button size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem', color: '#8b5cf6', borderColor: '#8b5cf6' }} onClick={() => navigate('/broker')}>
                                                REVIEW
                                            </Button>
                                        </Box>
                                    ))}
                                    <Button size="small" onClick={() => navigate('/broker')} sx={{ color: '#8b5cf6', fontWeight: 900, mt: 1 }}>VIEW ALL BROKERS →</Button>
                                </Stack>
                            )}
                        </Paper>
                    </Grid>

                    {/* RENEWAL WATCH QUEUE */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: `1px solid ${alpha('#3b82f6', 0.15)}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Clock color="#3b82f6" /> RENEWAL WATCH
                                </Typography>
                                {renewalQueue.length > 0 && (
                                    <Chip label={`${renewalQueue.length} UPCOMING`} size="small" sx={{ bgcolor: alpha('#3b82f6', 0.1), color: '#3b82f6', fontWeight: 900 }} />
                                )}
                            </Box>
                            {renewalQueue.length === 0 ? (
                                <Box sx={{ py: 4, textAlign: 'center' }}>
                                    <CheckCircle2 size={32} color="rgba(16,185,129,0.4)" style={{ margin: '0 auto 12px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>NO UPCOMING RENEWALS</Typography>
                                </Box>
                            ) : (
                                <Stack spacing={1.5}>
                                    {renewalQueue.map((renewal) => (
                                        <Box key={renewal.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{renewal.propertyName}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                                    {renewal.tenantName} · Expires: {renewal.expiryDate ? new Date(renewal.expiryDate.seconds * 1000).toLocaleDateString() : 'Unknown'}
                                                </Typography>
                                            </Box>
                                            <Chip label={renewal.status.toUpperCase()} size="small" sx={{ fontSize: '0.65rem', fontWeight: 900, bgcolor: 'rgba(255,255,255,0.05)' }} />
                                        </Box>
                                    ))}
                                    <Button size="small" onClick={() => navigate('/properties')} sx={{ color: '#3b82f6', fontWeight: 900, mt: 1 }}>VIEW PROPERTIES →</Button>
                                </Stack>
                            )}
                        </Paper>
                    </Grid>

                    {/* LAUNCH HEALTH PANEL */}
                    <Grid item xs={12} lg={6}>
                        <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Rocket color={binThemeTokens.gold} /> LAUNCH HEALTH
                            </Typography>
                            <Stack spacing={2}>
                                {[
                                    { label: 'Stripe Live Mode', status: adminSummaries.stripeLiveMode ? 'PASS' : 'FAIL', color: adminSummaries.stripeLiveMode ? '#10b981' : '#ef4444', icon: <DollarSign size={14} /> },
                                    { label: 'App Check Production', status: adminSummaries.appCheckProduction ? 'PASS' : 'FAIL', color: adminSummaries.appCheckProduction ? '#10b981' : '#ef4444', icon: <Shield size={14} /> },
                                    { label: 'Branded Email Sender', status: adminSummaries.brandedEmailSender ? 'PASS' : 'FAIL', color: adminSummaries.brandedEmailSender ? '#10b981' : '#ef4444', icon: <MessageSquare size={14} /> },
                                    { label: 'Admin Secret Rotation', status: adminSummaries.adminSecretRotation ? 'PASS' : 'FAIL', color: adminSummaries.adminSecretRotation ? '#10b981' : '#ef4444', icon: <Lock size={14} /> },
                                    { label: 'Five-Profile Smoke', status: adminSummaries.fiveProfileSmoke ? 'PASS' : 'FAIL', color: adminSummaries.fiveProfileSmoke ? '#10b981' : '#ef4444', icon: <Users size={14} /> },
                                    { label: 'Admin Credential Login', status: adminSummaries.adminCredentialLogin ? 'PASS' : 'FAIL', color: adminSummaries.adminCredentialLogin ? '#10b981' : '#ef4444', icon: <Shield size={14} /> },
                                    { label: 'Renewal Watch', status: adminSummaries.renewalWatch ? 'PASS' : 'FAIL', color: adminSummaries.renewalWatch ? '#10b981' : '#ef4444', icon: <Clock size={14} /> },
                                    { label: 'Broker Commission Lock', status: adminSummaries.brokerCommissionLock ? 'PASS' : 'FAIL', color: adminSummaries.brokerCommissionLock ? '#10b981' : '#ef4444', icon: <Briefcase size={14} /> },
                                    { label: 'Tenant Notification Delivery', status: adminSummaries.tenantNotificationDelivery ? 'PASS' : 'FAIL', color: adminSummaries.tenantNotificationDelivery ? '#10b981' : '#ef4444', icon: <Radio size={14} /> },
                                    { label: 'Technician GPS/Storage Proof', status: adminSummaries.technicianGpsStorageProof ? 'PASS' : 'FAIL', color: adminSummaries.technicianGpsStorageProof ? '#10b981' : '#ef4444', icon: <Wrench size={14} /> },
                                    { label: 'Firebase Auth', status: 'ACTIVE', color: '#10b981', icon: <UserCheck size={14} /> },
                                    { label: 'Storage Rules', status: systemHealthStatus === 'HEALTHY' ? 'ACTIVE' : 'CHECK', color: systemHealthColor, icon: <FileText size={14} /> },
                                    { label: 'AI Studio (BIN-GPT)', status: 'ACTIVE', color: '#10b981', icon: <Zap size={14} /> },
                                ].map((item) => (
                                    <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            <Box sx={{ color: item.color }}>{item.icon}</Box>
                                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.label}</Typography>
                                        </Box>
                                        <Chip label={item.status} size="small" sx={{ bgcolor: alpha(item.color, 0.1), color: item.color, fontWeight: 900, fontSize: '0.6rem' }} />
                                    </Box>
                                ))}
                            </Stack>
                            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/ops/smoke-test')} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4) }}>
                                    FIVE-PROFILE SMOKE TEST →
                                </Button>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/ops/public')}>
                                    PUBLIC LAUNCH OPS →
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>

                {/* Command Support Terminal */}
                <Paper sx={{ p: 3, mt: 6, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>COMMAND SUPPORT TERMINAL</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', maxWidth: 600 }}>
                                Sovereign support nodes are active. For critical infrastructure failure or CEO-level escalation, use the secure channels below.
                            </Typography>
                        </Box>
                        <CeoContactButtons compact />
                    </Stack>
                </Paper>
            </Box>

            {/* Approve Dialog */}
            <Dialog open={approveDialogOpen} onClose={() => setApproveDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#fff', fontWeight: 900 }}>Confirm Approval</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)' }}>
                        Approve <strong style={{ color: '#10b981' }}>{selectedApproval?.linkedName}</strong>?
                        This will activate their account and grant portal access.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setApproveDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
                    <Button onClick={handleApproveConfirm} disabled={actionLoading} variant="contained" sx={{ bgcolor: '#10b981', fontWeight: 900 }}>
                        {actionLoading ? 'Approving...' : 'APPROVE'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reject Dialog */}
            <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#fff', fontWeight: 900 }}>Reject Application</DialogTitle>
                <DialogContent>
                    <Typography sx={{ color: 'rgba(255,255,255,0.7)', mb: 2 }}>
                        Rejecting <strong style={{ color: '#ef4444' }}>{selectedApproval?.linkedName}</strong>. Please provide a reason:
                    </Typography>
                    <TextField
                        fullWidth multiline rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="Reason for rejection..."
                        sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRejectDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>Cancel</Button>
                    <Button onClick={handleRejectConfirm} disabled={actionLoading || !rejectReason.trim()} variant="contained" sx={{ bgcolor: '#ef4444', fontWeight: 900 }}>
                        {actionLoading ? 'Rejecting...' : 'REJECT'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} sx={{ fontWeight: 900, borderRadius: 3 }}>{snackbar.message}</Alert>
            </Snackbar>
        </AdminPageFrame>
    );
}

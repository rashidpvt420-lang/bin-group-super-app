// src/admin/pages/dashboard/DashboardPage.tsx

import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    alpha,
    Box,
    Button,
    Chip,
    Grid,
    IconButton,
    Paper,
    Skeleton,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography
} from '@mui/material';
import {
    Activity,
    Building2,
    CheckCircle2,
    ClipboardList,
    CreditCard,
    Eye,
    FileText,
    Lock,
    MapPin,
    Shield,
    Upload,
    UserCheck,
    UserPlus,
    Users,
    Wrench,
    XCircle,
    Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '../../../context/LanguageContext';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import CeoContactButtons from '../../components/CeoContactButtons';

type OwnerSubmission = {
    id: string;
    ownerName: string;
    ownerEmail: string;
    ownerMobile: string;
    status: string;
    paymentStatus: string;
    adminReviewState: string;
    submittedAt: any;
    propertyCount: number;
    planName: string;
    paymentMethod: string;
    mobilizationAmount: number;
    annualValue: number;
    firstProperty: string;
    gpsLabel: string;
};

type DashboardKpi = {
    label: string;
    value: number | string;
    icon: React.ReactNode;
    color: string;
    path?: string;
};

const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;

const getMillis = (value: any) => {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const safeDate = (value: any) => {
    if (!value) return 'Recent';
    if (typeof value.toDate === 'function') return value.toDate().toLocaleString();
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Recent';
};

const normalized = (value: any) => String(value || '').trim().toUpperCase();

const isArchived = (item: OwnerSubmission) => {
    const status = normalized(item.status);
    const adminState = normalized(item.adminReviewState);
    return status === 'REJECTED' || status === 'ARCHIVED' || status === 'CANCELLED' || adminState.includes('ARCHIVED');
};

const isRejected = (item: OwnerSubmission) => {
    const status = normalized(item.status);
    const adminState = normalized(item.adminReviewState);
    return status === 'REJECTED' || adminState.includes('REJECT');
};

const isApprovedOrConverted = (item: OwnerSubmission) => {
    const status = normalized(item.status);
    const adminState = normalized(item.adminReviewState);
    return [
        'APPROVED',
        'ACTIVE',
        'CONVERTED_TO_OWNER',
        'APPROVED_PENDING_OWNER_SIGNATURE',
        'APPROVED_AWAITING_OWNER_SIGNATURE',
        'PENDING_OWNER_SIGNATURE'
    ].includes(status) || adminState.includes('APPROVED') || adminState.includes('SIGNATURE');
};

const isPendingAction = (item: OwnerSubmission) => !isArchived(item) && !isRejected(item) && !isApprovedOrConverted(item);

const normalizePendingOwner = (id: string, data: any): OwnerSubmission => {
    const pending = data?.pendingPaymentSubmission || data?.latestPaymentSubmission || {};
    const ownerAccount = data?.ownerAccount || pending?.ownerAccount || {};
    const companyProfile = data?.companyProfile || pending?.companyProfile || {};
    const payment = data?.payment || pending?.payment || {};
    const pricing = data?.pricing || pending?.pricing || {};
    const portfolio = data?.portfolioSummary || pending?.portfolioSummary || {};
    const properties = Array.isArray(data?.properties) && data.properties.length ? data.properties : (Array.isArray(pending?.properties) ? pending.properties : []);
    const firstProperty = properties[0] || {};
    const geo = firstProperty.geo || firstProperty.location || firstProperty.coordinates || {};
    const lat = geo.lat ?? geo.latitude;
    const lng = geo.lng ?? geo.longitude;
    const annualValue = Number(data?.annualContractValue || pricing.annualContractValue || portfolio.estimatedACV || 0);
    const mobilization = Number(data?.paymentAmount || data?.activationDeposit || payment.amount || pricing.mobilizationAmount || (annualValue ? Math.round(annualValue * 0.15) : 0));
    const submittedStatus = data?.paymentSubmitted || mobilization > 0 ? 'PENDING' : 'NOT_SUBMITTED';
    const storedPaymentStatus = normalized(data?.paymentStatus || pending?.paymentStatus || payment.status);
    const paymentStatus = storedPaymentStatus === 'NOT_SUBMITTED' && (data?.paymentSubmitted || mobilization > 0) ? 'PENDING' : (storedPaymentStatus || submittedStatus);

    return {
        id,
        ownerName: data?.ownerName || data?.contactInfo?.name || ownerAccount.fullName || companyProfile.name || companyProfile.contactPerson || 'Pending Owner',
        ownerEmail: data?.ownerEmail || data?.contactInfo?.email || ownerAccount.email || companyProfile.email || '',
        ownerMobile: data?.ownerMobile || data?.contactInfo?.phone || ownerAccount.mobile || companyProfile.phone || '',
        status: data?.status || pending?.status || 'AWAITING_VERIFICATION',
        paymentStatus,
        adminReviewState: data?.adminReviewState || pending?.adminReviewState || 'AWAITING_VERIFICATION',
        submittedAt: data?.createdAt || data?.updatedAt || pending?.submittedAt || data?.approvedAt,
        propertyCount: properties.length || Number(data?.propertyCount || data?.activePropertyIds?.length || 0),
        planName: data?.selectedPlan?.name || pending?.selectedPlan?.name || data?.selectedPlan?.packageName || portfolio.recommendedTier || 'Pending Package',
        paymentMethod: data?.paymentMethod || payment.method || 'Manual Verification',
        mobilizationAmount: Number.isFinite(mobilization) ? mobilization : 0,
        annualValue: Number.isFinite(annualValue) ? annualValue : 0,
        firstProperty: firstProperty.propertyName || firstProperty.addressLine || firstProperty.address || data?.latestPropertyName || 'Property under review',
        gpsLabel: lat && lng ? `${lat}, ${lng}` : 'GPS pending review'
    };
};

export default function DashboardPage() {
    const { isRTL, tx } = useLanguage();
    const navigate = useNavigate();
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [ownerSubmissions, setOwnerSubmissions] = useState<OwnerSubmission[]>([]);
    const [activeProperties, setActiveProperties] = useState(0);
    const [activeContracts, setActiveContracts] = useState(0);
    const [activeTenants, setActiveTenants] = useState(0);
    const [openTickets, setOpenTickets] = useState(0);

    useEffect(() => {
        const unsubscribers: Array<() => void> = [];

        unsubscribers.push(onSnapshot(collection(db, 'intake_submissions'), (snapshot) => {
            const items = snapshot.docs
                .map((docSnap) => normalizePendingOwner(docSnap.id, docSnap.data()))
                .filter((item) => !isArchived(item))
                .sort((a, b) => getMillis(b.submittedAt) - getMillis(a.submittedAt));
            setOwnerSubmissions(items);
            setLoading(false);
            setLastSync(new Date());
        }, (error) => {
            console.error('Admin dashboard intake listener failed:', error);
            setLoadError(error?.message || 'Unable to load owner submissions.');
            setLoading(false);
        }));

        unsubscribers.push(onSnapshot(collection(db, 'properties'), (snapshot) => setActiveProperties(snapshot.size), () => setActiveProperties(0)));
        unsubscribers.push(onSnapshot(collection(db, 'contracts'), (snapshot) => setActiveContracts(snapshot.size), () => setActiveContracts(0)));
        unsubscribers.push(onSnapshot(collection(db, 'users'), (snapshot) => {
            setActiveTenants(snapshot.docs.filter((docSnap) => String(docSnap.data()?.role || '').toLowerCase() === 'tenant').length);
        }, () => setActiveTenants(0)));
        unsubscribers.push(onSnapshot(collection(db, 'maintenanceTickets'), (snapshot) => {
            setOpenTickets(snapshot.docs.filter((docSnap) => ['OPEN', 'PENDING', 'IN_PROGRESS'].includes(normalized(docSnap.data()?.status))).length);
        }, () => setOpenTickets(0)));

        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, []);

    const pendingOwners = useMemo(() => ownerSubmissions.filter(isPendingAction), [ownerSubmissions]);
    const approvedOwners = useMemo(() => ownerSubmissions.filter((item) => !isArchived(item) && isApprovedOrConverted(item)).slice(0, 6), [ownerSubmissions]);
    const rejectedOwners = useMemo(() => ownerSubmissions.filter(isRejected).slice(0, 6), [ownerSubmissions]);
    const pendingPaymentCount = useMemo(() => pendingOwners.filter((item) => !['VERIFIED', 'RECONCILED'].includes(normalized(item.paymentStatus))).length, [pendingOwners]);
    const pendingDocumentCount = useMemo(() => pendingOwners.filter((item) => normalized(item.adminReviewState).includes('DOCUMENT') || normalized(item.paymentStatus) === 'VERIFIED').length, [pendingOwners]);

    const kpis: DashboardKpi[] = [
        { label: tx('admin.dash.pending_verification', 'Pending Owner Verification'), value: pendingOwners.length, icon: <Shield size={18} />, color: binThemeTokens.gold, path: '/admin/vault' },
        { label: tx('admin.dash.approved_awaiting', 'Approved / Awaiting Signature'), value: approvedOwners.length, icon: <UserCheck size={18} />, color: '#10b981', path: '/admin/owners' },
        { label: tx('admin.dash.rejected', 'Rejected / Clarification'), value: rejectedOwners.length, icon: <XCircle size={18} />, color: '#ef4444', path: '/admin/vault' },
        { label: tx('admin.dash.payment_verifications', 'Payment Verifications'), value: pendingPaymentCount, icon: <CreditCard size={18} />, color: '#10b981', path: '/admin/vault' },
        { label: tx('admin.dash.doc_reviews', 'Document Reviews'), value: pendingDocumentCount, icon: <FileText size={18} />, color: '#3b82f6', path: '/admin/vault' },
        { label: tx('admin.dash.active_properties', 'Active Properties'), value: activeProperties, icon: <Building2 size={18} />, color: '#8b5cf6', path: '/admin/properties/passport' },
        { label: tx('admin.dash.contracts', 'Contracts'), value: activeContracts, icon: <ClipboardList size={18} />, color: '#10b981', path: '/admin/contracts' },
        { label: tx('admin.dash.open_missions', 'Open Missions'), value: openTickets, icon: <Wrench size={18} />, color: '#f59e0b', path: '/admin/tickets' },
        { label: tx('admin.dash.tenants', 'Tenants'), value: activeTenants, icon: <Users size={18} />, color: '#10b981', path: '/admin/tenants' },
        { label: tx('admin.dash.admin_status', 'Admin Status'), value: 'ONLINE', icon: <CheckCircle2 size={18} />, color: '#10b981' }
    ];

    const operations = [
        { label: tx('admin.dash.add_property', 'Add Property'), icon: <Building2 size={18} />, path: '/admin/onboard-property', color: binThemeTokens.gold },
        { label: tx('admin.dash.add_owner', 'Add Owner'), icon: <UserPlus size={18} />, path: '/admin/owners', color: '#3b82f6' },
        { label: tx('admin.dash.add_tenant', 'Add Tenant'), icon: <UserPlus size={18} />, path: '/admin/tenants', color: '#10b981' },
        { label: tx('admin.dash.bulk_import', 'Bulk Import'), icon: <Upload size={18} />, path: '/admin/bulk-import', color: '#8b5cf6' },
        { label: tx('admin.dash.add_tech', 'Add Tech'), icon: <Wrench size={18} />, path: '/admin/technicians', color: '#f97316' },
        { label: tx('admin.dash.create_contract', 'Create Contract'), icon: <FileText size={18} />, path: '/admin/contracts', color: binThemeTokens.gold },
        { label: tx('admin.dash.verify_payment', 'Verify Payment'), icon: <CreditCard size={18} />, path: '/admin/vault', color: '#10b981' },
        { label: tx('admin.dash.owner_verification', 'Owner Verification'), icon: <Shield size={18} />, path: '/admin/vault', color: binThemeTokens.gold },
        { label: tx('admin.dash.property_passport', 'Property Passport'), icon: <ClipboardList size={18} />, path: '/admin/properties/passport', color: '#3b82f6' },
        { label: tx('admin.dash.pricing_matrix', 'Pricing Matrix'), icon: <Zap size={18} />, path: '/admin/pricing', color: '#f59e0b' },
        { label: tx('admin.dash.owner_registry', 'Owner Registry'), icon: <Users size={18} />, path: '/admin/owners', color: '#8b5cf6' },
        { label: tx('admin.dash.permissions', 'Permissions'), icon: <Lock size={18} />, path: '/admin/permissions', color: '#ef4444' }
    ];

    const renderKpi = (kpi: DashboardKpi) => (
        <Paper
            key={kpi.label}
            onClick={() => kpi.path && navigate(kpi.path)}
            sx={{
                p: 2,
                bgcolor: '#FFFFFF',
                border: '1px solid #E5E7EB',
                borderRadius: 4,
                cursor: kpi.path ? 'pointer' : 'default',
                minHeight: 128,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(17,24,39,0.03)',
                '&:hover': kpi.path ? { transform: 'translateY(-2px)', borderColor: kpi.color, boxShadow: '0 10px 20px rgba(17,24,39,0.06)' } : {}
            }}
        >
            <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
            <Typography variant="caption" sx={{ color: '#667085', fontWeight: 900, textTransform: 'uppercase' }}>{kpi.label}</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, color: '#111827', fontWeight: 950 }}>{kpi.value}</Typography>
        </Paper>
    );

    const renderSubmissionRows = (items: OwnerSubmission[], empty: string) => (
        <TableContainer>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ bgcolor: '#F8F9FB', color: '#475467', fontWeight: 900, fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB' }}>{tx('admin.dash.owner_col', 'OWNER')}</TableCell>
                        <TableCell sx={{ bgcolor: '#F8F9FB', color: '#475467', fontWeight: 900, fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB' }}>{tx('admin.dash.property_col', 'PROPERTY')}</TableCell>
                        <TableCell sx={{ bgcolor: '#F8F9FB', color: '#475467', fontWeight: 900, fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB' }}>{tx('admin.dash.payment_col', 'PAYMENT')}</TableCell>
                        <TableCell sx={{ bgcolor: '#F8F9FB', color: '#475467', fontWeight: 900, fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB' }}>{tx('admin.dash.state_col', 'STATE')}</TableCell>
                        <TableCell align="right" sx={{ bgcolor: '#F8F9FB', color: '#475467', fontWeight: 900, fontSize: '0.7rem', borderBottom: '1px solid #E5E7EB' }}>{tx('admin.dash.action_col', 'ACTION')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {items.map((owner) => (
                        <TableRow key={owner.id} hover>
                            <TableCell sx={{ borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>{owner.ownerName}</Typography>
                                <Typography variant="caption" sx={{ color: '#667085' }}>{owner.ownerEmail || owner.ownerMobile || owner.id}</Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: '#98A2B3' }}>{safeDate(owner.submittedAt)}</Typography>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>{owner.firstProperty}</Typography>
                                <Typography variant="caption" sx={{ color: '#667085', display: 'flex', alignItems: 'center', gap: 0.5 }}><MapPin size={12} /> {owner.gpsLabel}</Typography>
                                <Typography variant="caption" sx={{ color: '#B8932F' }}>{owner.propertyCount} asset(s) • {owner.planName}</Typography>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>{owner.paymentMethod}</Typography>
                                <Typography variant="caption" sx={{ color: '#B8932F' }}>{money(owner.mobilizationAmount)}</Typography>
                            </TableCell>
                            <TableCell sx={{ borderBottom: '1px solid #E5E7EB' }}>
                                <Chip label={owner.adminReviewState || owner.paymentStatus || owner.status} size="small" sx={{ fontSize: '0.6rem', fontWeight: 900, color: '#B8932F', borderColor: '#B8932F', bgcolor: '#FFF9E8' }} variant="outlined" />
                            </TableCell>
                            <TableCell align="right" sx={{ borderBottom: '1px solid #E5E7EB' }}>
                                <IconButton onClick={() => navigate('/admin/vault')}><Eye size={18} color="#B8932F" /></IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                    {!items.length && !loading && (
                        <TableRow>
                            <TableCell colSpan={5} align="center" sx={{ py: 6, color: '#98A2B3', fontWeight: 900 }}>
                                {empty}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
    );

    return (
        <AdminPageFrame
            title={tx('admin.dash.command_center', 'BIN GROUP ADMIN COMMAND CENTER')}
            subtitle={tx('admin.dash.subtitle', 'Owner approvals, property passports, contracts, payments, tenants, technicians and live operations.')}
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
                <Box sx={{ mb: 6 }}>
                    <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 900, mb: 2, display: 'block', letterSpacing: 2 }}>
                        {tx('admin.dash.ops_command', 'OPERATIONS COMMAND CENTER')}
                    </Typography>
                    <Grid container spacing={2}>
                        {operations.map((btn) => (
                            <Grid item xs={6} sm={4} md={3} lg={2} key={btn.label}>
                                <Button
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => navigate(btn.path)}
                                    startIcon={btn.icon}
                                    sx={{
                                        height: '100%',
                                        minHeight: 118,
                                        flexDirection: 'column',
                                        gap: 1.5,
                                        py: 3,
                                        bgcolor: '#FFFFFF',
                                        borderColor: '#E5E7EB',
                                        color: '#111827',
                                        borderRadius: 4,
                                        boxShadow: '0 4px 12px rgba(17,24,39,0.02)',
                                        '& .MuiButton-startIcon': { m: 0, color: btn.color },
                                        '&:hover': { bgcolor: alpha(btn.color, 0.05), borderColor: alpha(btn.color, 0.35), color: '#111827', transform: 'translateY(-2px)', boxShadow: '0 8px 18px rgba(17,24,39,0.05)' },
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

                {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}

                <Paper sx={{ mb: 4, p: 3, borderRadius: 5, bgcolor: '#FFF9E8', border: '1px solid rgba(184,147,47,0.22)' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                        <Box>
                            <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 2 }}>{tx('admin.dash.owner_pipeline', 'OWNER PIPELINE LIVE')}</Typography>
                            <Typography variant="h5" sx={{ color: '#111827', fontWeight: 950, mt: 0.5 }}>
                                {pendingOwners.length} {tx('status.pending', 'pending')} • {approvedOwners.length} {tx('admin.dash.approved_awaiting', 'approved/signature')} • {rejectedOwners.length} {tx('admin.dash.rejected', 'rejected/clarification')}
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#667085', mt: 0.5 }}>
                                {tx('admin.dash.support_desc', 'Dashboard is now split into pending, approved, and rejected lanes. Use the quick links to inspect owner, passport, contract and payment records.')}
                            </Typography>
                        </Box>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <Button variant="contained" onClick={() => navigate('/admin/vault')} sx={{ bgcolor: '#B8932F', color: '#FFFFFF', '&:hover': { bgcolor: '#A08027' }, fontWeight: 950, px: 4 }}>
                                {tx('admin.dash.open_verification', 'OPEN VERIFICATION INBOX')}
                            </Button>
                            <Button variant="outlined" onClick={() => navigate('/admin/owners')} sx={{ borderColor: '#B8932F', color: '#B8932F', '&:hover': { borderColor: '#A08027', color: '#A08027' }, fontWeight: 950, px: 4 }}>
                                {tx('admin.dash.owner_registry', 'OWNER REGISTRY')}
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>

                <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 900, mb: 2, display: 'block' }}>
                    {tx('admin.dash.portfolio_kpis', 'PORTFOLIO KPIs')}
                </Typography>
                <Grid container spacing={2} sx={{ mb: 5 }}>
                    {loading && !ownerSubmissions.length ? Array.from({ length: 10 }).map((_, index) => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={index}>
                            <Paper sx={{ p: 2, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 4, minHeight: 128 }}>
                                <Skeleton variant="circular" width={24} height={24} sx={{ mb: 1 }} />
                                <Skeleton variant="text" width="70%" />
                                <Skeleton variant="text" width="45%" height={36} />
                            </Paper>
                        </Grid>
                    )) : kpis.map((kpi) => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={kpi.label}>{renderKpi(kpi)}</Grid>
                    ))}
                </Grid>

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', mb: 4 }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#111827' }}>
                                    <Shield color="#B8932F" /> {tx('admin.dash.pending_verification', 'PENDING OWNER VERIFICATION')}
                                </Typography>
                                <Chip label={`${pendingOwners.length} AWAITING`} sx={{ fontWeight: 950, bgcolor: '#FFF9E8', color: '#8A6A10' }} />
                            </Box>
                            {renderSubmissionRows(pendingOwners, tx('admin.dash.no_pending', 'No pending owner submissions. Approved/rejected records are shown below and in Owner Registry.'))}
                        </Paper>

                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', mb: 4 }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#111827' }}>
                                    <UserCheck color="#10b981" /> {tx('admin.dash.approved_awaiting', 'APPROVED / AWAITING SIGNATURE')}
                                </Typography>
                                <Chip label={`${approvedOwners.length} APPROVED`} sx={{ fontWeight: 950, bgcolor: 'rgba(16,185,129,0.08)', color: '#10b981' }} />
                            </Box>
                            {renderSubmissionRows(approvedOwners, tx('admin.dash.no_approved', 'No approved owner records currently visible.'))}
                        </Paper>

                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#111827' }}>
                                    <XCircle color="#ef4444" /> {tx('admin.dash.rejected', 'REJECTED / CLARIFICATION')}
                                </Typography>
                                <Chip label={`${rejectedOwners.length} REJECTED`} sx={{ fontWeight: 950, bgcolor: 'rgba(239,68,68,0.08)', color: '#ef4444' }} />
                            </Box>
                            {renderSubmissionRows(rejectedOwners, tx('admin.dash.no_rejected', 'No rejected or clarification records currently visible.'))}
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#FFFFFF', border: '1px solid #E5E7EB', mb: 4 }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, color: '#111827' }}>
                                <Activity color="#B8932F" /> {tx('admin.dash.admin_action_flow', 'ADMIN ACTION FLOW')}
                            </Typography>
                            <Stack spacing={2}>
                                {[
                                    tx('admin.dash.step1', 'Open owner verification record'),
                                    tx('admin.dash.step2', 'Confirm 15% payment / cheque evidence'),
                                    tx('admin.dash.step3', 'Verify documents and property GPS'),
                                    tx('admin.dash.step4', 'Approve owner and email contract'),
                                    tx('admin.dash.step5', 'Track approved owner in Owner Registry + Property Passport')
                                ].map((step, index) => (
                                    <Box key={step} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                        <Chip label={index + 1} size="small" sx={{ bgcolor: '#FFF9E8', color: '#8A6A10', fontWeight: 950 }} />
                                        <Typography variant="body2" sx={{ color: '#667085', fontWeight: 800 }}>{step}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                            <Stack spacing={1.5} sx={{ mt: 4 }}>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/admin/vault')} sx={{ borderColor: '#B8932F', color: '#B8932F', '&:hover': { borderColor: '#A08027', color: '#A08027' }, fontWeight: 950 }}>{tx('admin.dash.review_inbox', 'REVIEW VERIFICATION INBOX')}</Button>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/admin/owners')} sx={{ borderColor: '#10b981', color: '#10b981', '&:hover': { borderColor: '#059669', color: '#059669' }, fontWeight: 950 }}>{tx('admin.dash.open_owner_registry', 'OPEN OWNER REGISTRY')}</Button>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/admin/properties/passport')} sx={{ borderColor: '#3b82f6', color: '#3b82f6', '&:hover': { borderColor: '#2563eb', color: '#2563eb' }, fontWeight: 950 }}>{tx('admin.dash.open_passports', 'OPEN PROPERTY PASSPORTS')}</Button>
                                <Button fullWidth variant="outlined" onClick={() => navigate('/admin/contracts')} sx={{ borderColor: '#8b5cf6', color: '#8b5cf6', '&:hover': { borderColor: '#7c3aed', color: '#7c3aed' }, fontWeight: 950 }}>{tx('admin.dash.open_contracts', 'OPEN CONTRACTS')}</Button>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 4, mt: 8, bgcolor: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="overline" sx={{ color: '#B8932F', fontWeight: 950, letterSpacing: 4 }}>{tx('admin.dash.command_support', 'COMMAND SUPPORT TERMINAL')}</Typography>
                            <Typography variant="body2" sx={{ color: '#667085', mt: 1, fontWeight: 700, lineHeight: 1.6 }}>
                                {tx('admin.dash.support_desc', 'Dashboard is now split into pending, approved, and rejected lanes. Use the quick links to inspect owner, passport, contract and payment records.')}
                            </Typography>
                        </Box>
                        <CeoContactButtons compact />
                    </Stack>
                </Paper>
            </Box>
        </AdminPageFrame>
    );
}

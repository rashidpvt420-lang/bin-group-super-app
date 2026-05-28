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
    DollarSign,
    Eye,
    FileText,
    Lock,
    MapPin,
    Shield,
    Upload,
    UserPlus,
    Users,
    Wrench,
    Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '../../../context/LanguageContext';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import CeoContactButtons from '../../components/CeoContactButtons';

type PendingOwnerSubmission = {
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

const normalizePendingOwner = (id: string, data: any): PendingOwnerSubmission => {
    const pending = data?.pendingPaymentSubmission || {};
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

    return {
        id,
        ownerName: data?.ownerName || data?.contactInfo?.name || ownerAccount.fullName || companyProfile.name || companyProfile.contactPerson || 'Pending Owner',
        ownerEmail: data?.ownerEmail || data?.contactInfo?.email || ownerAccount.email || companyProfile.email || '',
        ownerMobile: data?.ownerMobile || data?.contactInfo?.phone || ownerAccount.mobile || companyProfile.phone || '',
        status: data?.status || pending?.status || 'AWAITING_VERIFICATION',
        paymentStatus: data?.paymentStatus || pending?.paymentStatus || payment.status || 'PENDING',
        adminReviewState: data?.adminReviewState || pending?.adminReviewState || 'AWAITING_VERIFICATION',
        submittedAt: data?.createdAt || data?.updatedAt || pending?.submittedAt,
        propertyCount: properties.length,
        planName: data?.selectedPlan?.name || pending?.selectedPlan?.name || portfolio.recommendedTier || 'Pending Package',
        paymentMethod: payment.method || 'Manual Verification',
        mobilizationAmount: Number(payment.amount || pricing.mobilizationAmount || 0),
        annualValue: Number(pricing.annualContractValue || portfolio.estimatedACV || 0),
        firstProperty: firstProperty.propertyName || firstProperty.addressLine || firstProperty.address || 'Property under review',
        gpsLabel: lat && lng ? `${lat}, ${lng}` : 'GPS pending review'
    };
};

export default function DashboardPage() {
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [lastSync, setLastSync] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [pendingOwners, setPendingOwners] = useState<PendingOwnerSubmission[]>([]);
    const [activeProperties, setActiveProperties] = useState(0);
    const [activeContracts, setActiveContracts] = useState(0);
    const [activeTenants, setActiveTenants] = useState(0);
    const [openTickets, setOpenTickets] = useState(0);

    useEffect(() => {
        const unsubscribers: Array<() => void> = [];

        unsubscribers.push(onSnapshot(collection(db, 'intake_submissions'), (snapshot) => {
            const items = snapshot.docs
                .map((docSnap) => normalizePendingOwner(docSnap.id, docSnap.data()))
                .filter((item) => !['CONVERTED_TO_OWNER', 'APPROVED', 'ACTIVE', 'REJECTED'].includes(String(item.status || '').toUpperCase()))
                .sort((a, b) => getMillis(b.submittedAt) - getMillis(a.submittedAt));
            setPendingOwners(items);
            setLoading(false);
            setLastSync(new Date());
        }, (error) => {
            console.error('Admin dashboard intake listener failed:', error);
            setLoadError(error?.message || 'Unable to load pending owner submissions.');
            setLoading(false);
        }));

        unsubscribers.push(onSnapshot(collection(db, 'properties'), (snapshot) => setActiveProperties(snapshot.size), () => setActiveProperties(0)));
        unsubscribers.push(onSnapshot(collection(db, 'contracts'), (snapshot) => setActiveContracts(snapshot.size), () => setActiveContracts(0)));
        unsubscribers.push(onSnapshot(collection(db, 'users'), (snapshot) => {
            setActiveTenants(snapshot.docs.filter((docSnap) => docSnap.data()?.role === 'tenant').length);
        }, () => setActiveTenants(0)));
        unsubscribers.push(onSnapshot(collection(db, 'maintenanceTickets'), (snapshot) => {
            setOpenTickets(snapshot.docs.filter((docSnap) => ['OPEN', 'PENDING', 'IN_PROGRESS'].includes(String(docSnap.data()?.status || '').toUpperCase())).length);
        }, () => setOpenTickets(0)));

        return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    }, []);

    const pendingPaymentCount = useMemo(() => pendingOwners.filter((item) => String(item.paymentStatus || '').toUpperCase() !== 'VERIFIED').length, [pendingOwners]);
    const pendingDocumentCount = useMemo(() => pendingOwners.filter((item) => String(item.adminReviewState || '').toUpperCase().includes('DOCUMENT') || String(item.paymentStatus || '').toUpperCase() === 'VERIFIED').length, [pendingOwners]);

    const kpis: DashboardKpi[] = [
        { label: 'Pending Owner Verification', value: pendingOwners.length, icon: <Shield size={18} />, color: binThemeTokens.gold, path: '/admin/vault' },
        { label: 'Payment Verifications', value: pendingPaymentCount, icon: <CreditCard size={18} />, color: '#10b981', path: '/admin/vault' },
        { label: 'Document Reviews', value: pendingDocumentCount, icon: <FileText size={18} />, color: '#3b82f6', path: '/admin/vault' },
        { label: 'Active Properties', value: activeProperties, icon: <Building2 size={18} />, color: '#8b5cf6', path: '/admin/properties/passport' },
        { label: 'Contracts', value: activeContracts, icon: <ClipboardList size={18} />, color: '#10b981', path: '/admin/document-vault' },
        { label: 'Open Missions', value: openTickets, icon: <Wrench size={18} />, color: '#f59e0b', path: '/admin/tickets' },
        { label: 'Tenants', value: activeTenants, icon: <Users size={18} />, color: '#10b981', path: '/admin/tenants' },
        { label: 'Admin Status', value: 'ONLINE', icon: <CheckCircle2 size={18} />, color: '#10b981' }
    ];

    const operations = [
        { label: 'Add Property', icon: <Building2 size={18} />, path: '/admin/add-property', color: binThemeTokens.gold },
        { label: 'Add Owner', icon: <UserPlus size={18} />, path: '/admin/owners', color: '#3b82f6' },
        { label: 'Add Tenant', icon: <UserPlus size={18} />, path: '/admin/tenants', color: '#10b981' },
        { label: 'Bulk Import', icon: <Upload size={18} />, path: '/admin/bulk-import', color: '#8b5cf6' },
        { label: 'Add Tech', icon: <Wrench size={18} />, path: '/admin/technicians', color: '#f97316' },
        { label: 'Create Contract', icon: <FileText size={18} />, path: '/admin/document-vault', color: binThemeTokens.gold },
        { label: 'Verify Payment', icon: <CreditCard size={18} />, path: '/admin/vault', color: '#10b981' },
        { label: 'Owner Verification', icon: <Shield size={18} />, path: '/admin/vault', color: binThemeTokens.gold },
        { label: 'Property Passport', icon: <ClipboardList size={18} />, path: '/admin/properties/passport', color: '#3b82f6' },
        { label: 'Pricing Matrix', icon: <Zap size={18} />, path: '/admin/pricing', color: '#f59e0b' },
        { label: 'Owner Registry', icon: <Users size={18} />, path: '/admin/owners', color: '#8b5cf6' },
        { label: 'Permissions', icon: <Lock size={18} />, path: '/admin/permissions', color: '#ef4444' }
    ];

    const renderKpi = (kpi: DashboardKpi) => (
        <Paper
            key={kpi.label}
            onClick={() => kpi.path && navigate(kpi.path)}
            sx={{
                p: 2,
                bgcolor: 'rgba(15,23,42,0.72)',
                border: `1px solid ${alpha(kpi.color, 0.22)}`,
                borderRadius: 4,
                cursor: kpi.path ? 'pointer' : 'default',
                minHeight: 128,
                transition: 'all 0.2s ease',
                '&:hover': kpi.path ? { transform: 'translateY(-2px)', borderColor: kpi.color, bgcolor: alpha(kpi.color, 0.06) } : {}
            }}
        >
            <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, textTransform: 'uppercase' }}>{kpi.label}</Typography>
            <Typography variant="h5" sx={{ mt: 0.5, color: '#fff', fontWeight: 950 }}>{kpi.value}</Typography>
        </Paper>
    );

    return (
        <AdminPageFrame
            title={t('admin.terminal.title') || 'Executive Command Center'}
            subtitle={t('admin.terminal.subtitle') || 'SOVEREIGN OPERATIONS TERMINAL'}
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
                <Box sx={{ mb: 6 }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block', letterSpacing: 2 }}>
                        OPERATIONS COMMAND CENTER
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
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        borderColor: 'rgba(255,255,255,0.06)',
                                        color: 'rgba(255,255,255,0.72)',
                                        borderRadius: 4,
                                        '& .MuiButton-startIcon': { m: 0, color: btn.color },
                                        '&:hover': { bgcolor: alpha(btn.color, 0.06), borderColor: alpha(btn.color, 0.35), color: '#FFF', transform: 'translateY(-2px)' },
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

                <Paper sx={{ mb: 4, p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.28)}` }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>OWNER VERIFICATION LIVE</Typography>
                            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>
                                {pendingOwners.length} pending owner submission{pendingOwners.length === 1 ? '' : 's'} awaiting admin action
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 0.5 }}>
                                Review owner details, property GPS, payment method, mobilization amount and document metadata from this dashboard or open the full inbox.
                            </Typography>
                        </Box>
                        <Button variant="contained" onClick={() => navigate('/admin/vault')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4 }}>
                            OPEN VERIFICATION INBOX
                        </Button>
                    </Stack>
                </Paper>

                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>
                    PORTFOLIO KPIs
                </Typography>
                <Grid container spacing={2} sx={{ mb: 5 }}>
                    {loading && !pendingOwners.length ? Array.from({ length: 8 }).map((_, index) => (
                        <Grid item xs={12} sm={6} md={3} lg={2.4} key={index}>
                            <Paper sx={{ p: 2, bgcolor: 'rgba(15,23,42,0.72)', borderRadius: 4, minHeight: 128 }}>
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
                        <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 6, bgcolor: 'rgba(15,23,42,0.5)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Shield color={binThemeTokens.gold} /> OWNER VERIFICATION QUEUE
                                </Typography>
                                <Chip label={`${pendingOwners.length} AWAITING`} sx={{ fontWeight: 950, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }} />
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>OWNER</TableCell>
                                            <TableCell>PROPERTY</TableCell>
                                            <TableCell>PAYMENT</TableCell>
                                            <TableCell>STATE</TableCell>
                                            <TableCell align="right">ACTION</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {pendingOwners.map((owner) => (
                                            <TableRow key={owner.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 900 }}>{owner.ownerName}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)' }}>{owner.ownerEmail || owner.ownerMobile || owner.id}</Typography>
                                                    <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.32)' }}>{safeDate(owner.submittedAt)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{owner.firstProperty}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', display: 'flex', alignItems: 'center', gap: 0.5 }}><MapPin size={12} /> {owner.gpsLabel}</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{owner.propertyCount} asset(s) • {owner.planName}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 800 }}>{owner.paymentMethod}</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{money(owner.mobilizationAmount)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={owner.adminReviewState || owner.paymentStatus} size="small" sx={{ fontSize: '0.6rem', fontWeight: 900, color: binThemeTokens.gold, borderColor: binThemeTokens.gold }} variant="outlined" />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <IconButton onClick={() => navigate('/admin/vault')}><Eye size={18} color={binThemeTokens.gold} /></IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {!pendingOwners.length && !loading && (
                                            <TableRow>
                                                <TableCell colSpan={5} align="center" sx={{ py: 8, color: 'rgba(255,255,255,0.28)', fontWeight: 900 }}>
                                                    No pending owner submissions currently visible. Submit a new owner onboarding or open /admin/vault to inspect all intake records.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Activity color={binThemeTokens.gold} /> ADMIN ACTION FLOW
                            </Typography>
                            <Stack spacing={2}>
                                {['Open the owner verification record', 'Confirm property address and GPS', 'Verify payment evidence offline', 'Verify owner documents', 'Approve owner submission and unlock activation'].map((step, index) => (
                                    <Box key={step} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                        <Chip label={index + 1} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{step}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                            <Button fullWidth variant="outlined" onClick={() => navigate('/admin/vault')} sx={{ mt: 4, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
                                REVIEW PENDING OWNERS
                            </Button>
                        </Paper>
                    </Grid>
                </Grid>

                <Paper sx={{ p: 4, mt: 8, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 8 }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>COMMAND SUPPORT TERMINAL</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', maxWidth: 700, mt: 1, fontWeight: 700, lineHeight: 1.6 }}>
                                Sovereign support nodes are active. Use this dashboard to verify pending owners, then open the full verification inbox for approval actions.
                            </Typography>
                        </Box>
                        <CeoContactButtons compact />
                    </Stack>
                </Paper>
            </Box>
        </AdminPageFrame>
    );
}

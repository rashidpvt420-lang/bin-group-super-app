import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Stack, Chip, Grid,
    Alert, Skeleton, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, alpha
} from '@mui/material';
import {
    CheckCircle2, AlertTriangle, Shield,
    User, Home, Wrench, Briefcase, Rocket
} from 'lucide-react';
import { db, doc, onSnapshot } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';
import { useNavigate } from 'react-router-dom';

const SMOKE_TEST_DOC_PATH = 'system_health/five_profile_smoke';

export default function SmokeTestPage() {
    const navigate = useNavigate();
    const [lastSync, setLastSync] = useState(new Date());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [testData, setTestData] = useState<any>(null);

    useEffect(() => {
        const docRef = doc(db, SMOKE_TEST_DOC_PATH);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setTestData(snap.data());
            } else {
                setTestData({});
            }
            setLoading(false);
            setLastSync(new Date());
            setError(null);
        }, (err) => {
            console.error('Error loading smoke test data:', err);
            setError(err.message);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const profiles = [
        {
            key: 'admin',
            title: 'Admin Verification',
            icon: <Shield size={18} />,
            color: '#10b981',
            items: [
                { id: 'adminLogin', label: 'Admin login with real credential', status: testData?.admin?.login || 'PENDING' },
                { id: 'adminDashboard', label: 'Check dashboard', status: testData?.admin?.dashboard || 'PENDING' },
                { id: 'adminLaunchHealth', label: 'Check Launch Health', status: testData?.admin?.launchHealth || 'PENDING' },
                { id: 'adminRows', label: 'Check Stripe/App Check/Email/Admin Secret/Five-Profile Smoke rows', status: testData?.admin?.healthRows || 'PENDING' },
                { id: 'adminRenewal', label: 'Check renewal watch', status: testData?.admin?.renewalWatch || 'PENDING' },
                { id: 'adminEntities', label: 'Check tickets, users, documents, payments', status: testData?.admin?.entities || 'PENDING' },
            ]
        },
        {
            key: 'owner',
            title: 'Owner Verification',
            icon: <Home size={18} />,
            color: '#3b82f6',
            items: [
                { id: 'ownerLogin', label: 'Owner login', status: testData?.owner?.login || 'PENDING' },
                { id: 'ownerDashboard', label: 'Check dashboard', status: testData?.owner?.dashboard || 'PENDING' },
                { id: 'ownerFeatures', label: 'Check property / contract / payment proof / document vault / renewal card', status: testData?.owner?.features || 'PENDING' },
                { id: 'ownerTicketUpdate', label: 'See ticket update', status: testData?.owner?.ticketUpdate || 'PENDING' },
                { id: 'ownerTicketReview', label: 'Review approval / payment / maintenance record', status: testData?.owner?.ticketReview || 'PENDING' },
            ]
        },
        {
            key: 'tenant',
            title: 'Tenant Verification',
            icon: <User size={18} />,
            color: '#8b5cf6',
            items: [
                { id: 'tenantLogin', label: 'Tenant login', status: testData?.tenant?.login || 'PENDING' },
                { id: 'tenantReportIssue', label: 'Open Report Issue', status: testData?.tenant?.reportIssue || 'PENDING' },
                { id: 'tenantCreateTicket', label: 'Create maintenance request with photo', status: testData?.tenant?.createTicket || 'PENDING' },
                { id: 'tenantMyTickets', label: 'Check My Tickets', status: testData?.tenant?.myTickets || 'PENDING' },
                { id: 'tenantMoreServices', label: 'Check More Services (Notices, Keys, Parcels, Visitor Parking, Marketplace, Staff Directory, Messages, Community)', status: testData?.tenant?.moreServices || 'PENDING' },
            ]
        },
        {
            key: 'technician',
            title: 'Technician Verification',
            icon: <Wrench size={18} />,
            color: '#f59e0b',
            items: [
                { id: 'techLogin', label: 'Technician login', status: testData?.technician?.login || 'PENDING' },
                { id: 'techAcceptTicket', label: 'Accept ticket', status: testData?.technician?.acceptTicket || 'PENDING' },
                { id: 'techArrive', label: 'Arrive / on-site', status: testData?.technician?.arrive || 'PENDING' },
                { id: 'techProof', label: 'Upload before/after proof', status: testData?.technician?.proof || 'PENDING' },
                { id: 'techComplete', label: 'Complete job', status: testData?.technician?.complete || 'PENDING' },
                { id: 'techSnackbar', label: 'Confirm Snackbar/error handling works if job already taken', status: testData?.technician?.snackbar || 'PENDING' },
            ]
        },
        {
            key: 'broker',
            title: 'Broker Verification',
            icon: <Briefcase size={18} />,
            color: '#ec4899',
            items: [
                { id: 'brokerAddLead', label: 'Add lead', status: testData?.broker?.addLead || 'PENDING' },
                { id: 'brokerNewLeadForm', label: 'Check /broker/leads/new opens lead form', status: testData?.broker?.newLeadForm || 'PENDING' },
                { id: 'brokerReferral', label: 'Check referral/commission attribution proof', status: testData?.broker?.referral || 'PENDING' },
            ]
        }
    ];

    const getStatusColor = (status: string) => {
        if (status === 'PASS' || status === 'PASSED' || status === 'SUCCESS' || status === 'READY') return '#10b981';
        if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR') return '#ef4444';
        return '#f59e0b'; // PENDING / IN_PROGRESS
    };

    const getStatusLabel = (status: string) => {
        if (!status) return 'PENDING';
        return String(status).toUpperCase();
    };

    return (
        <AdminPageFrame
            title="Five-Profile Smoke Test"
            subtitle="LIVE PRODUCTION VALIDATION"
            lastUpdated={lastSync}
            onRefresh={() => window.location.reload()}
        >
            <Box sx={{ pb: 8 }}>
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', maxWidth: 800 }}>
                        This dashboard monitors the final 5-profile live smoke test before public launch.
                        All components must report as <strong style={{ color: '#10b981' }}>PASS</strong> prior to
                        clearing the Launch Health validation.
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={<Rocket size={16} />}
                        onClick={() => navigate('/dashboard')}
                        sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4) }}
                    >
                        BACK TO DASHBOARD
                    </Button>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 4, borderRadius: 3, fontWeight: 900 }}>
                        {error}
                    </Alert>
                )}

                <Grid container spacing={4}>
                    {profiles.map(profile => (
                        <Grid item xs={12} lg={6} key={profile.key}>
                            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, color: profile.color }}>
                                    {profile.icon} {profile.title}
                                </Typography>
                                
                                {loading ? (
                                    <Stack spacing={2}>
                                        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 2 }} />
                                        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 2 }} />
                                        <Skeleton variant="rectangular" height={40} sx={{ borderRadius: 2 }} />
                                    </Stack>
                                ) : (
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>CHECK ITEM</TableCell>
                                                    <TableCell sx={{ bgcolor: 'rgba(255,255,255,0.02)', width: 120 }} align="right">STATUS</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {profile.items.map(item => {
                                                    const statusColor = getStatusColor(item.status);
                                                    const statusLabel = getStatusLabel(item.status);
                                                    return (
                                                        <TableRow key={item.id} hover>
                                                            <TableCell sx={{ py: 1.5 }}>
                                                                <Typography variant="body2" sx={{ fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
                                                                    {item.label}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ py: 1.5 }}>
                                                                <Chip
                                                                    label={statusLabel}
                                                                    size="small"
                                                                    icon={statusLabel === 'PASS' ? <CheckCircle2 size={12} /> : statusLabel === 'FAIL' ? <AlertTriangle size={12} /> : undefined}
                                                                    sx={{
                                                                        bgcolor: alpha(statusColor, 0.1),
                                                                        color: statusColor,
                                                                        fontWeight: 900,
                                                                        fontSize: '0.65rem',
                                                                        borderRadius: 2
                                                                    }}
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
            </Box>
        </AdminPageFrame>
    );
}

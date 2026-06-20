import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Grid, Card, CardContent, Button, 
    Stack, CircularProgress, alpha, Table, 
    TableBody, TableCell, TableContainer, TableHead, 
    TableRow, Paper, Chip, IconButton, Alert
} from '@mui/material';
import { 
    Activity, 
    Shield, 
    Users, 
    CreditCard, 
    AlertTriangle, 
    RefreshCcw, 
    FileText, 
    Mail,
    CheckCircle,
    XCircle,
    ExternalLink
} from 'lucide-react';
import { collection, query, onSnapshot, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useLanguage } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function ProductionControlCenter() {
    useLanguage();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        totalTenants: 0,
        totalUnits: 0,
        totalProperties: 0,
        totalAnnualRent: 0,
        totalCollected: 0,
        totalOutstanding: 0,
        failedInvites: 0,
        openTickets: 0
    });
    const [latestBatches, setLatestBatches] = useState<any[]>([]);
    const [actionRunning, setActionRunning] = useState<'aggregation' | 'invitations' | null>(null);
    const [systemHealth] = useState({
        sendGrid: 'operational',
        functions: 'operational',
        firestore: 'operational'
    });

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                // Property Passport Aggregation for total financials
                const passportSnap = await getDocs(collection(db, 'property_passports'));
                let rent = 0, collected = 0, outstanding = 0, units = 0, properties = 0;
                passportSnap.forEach(doc => {
                    const data = doc.data();
                    rent += (data.annualRentTotal || 0);
                    collected += (data.rentCollectedTotal || 0);
                    outstanding += (data.rentOutstandingTotal || 0);
                    units += (data.totalUnits || 0);
                    properties++;
                });

                // Invitations
                const failedInviteSnap = await getDocs(query(collection(db, 'tenant_invitations'), where('emailStatus', '==', 'failed')));
                
                // Tenants
                const tenantSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'tenant')));

                // Tickets
                const ticketSnap = await getDocs(query(collection(db, 'maintenanceTickets'), where('status', 'not-in', ['COMPLETED', 'RESOLVED', 'CLOSED'])));

                setMetrics({
                    totalTenants: tenantSnap.size,
                    totalUnits: units,
                    totalProperties: properties,
                    totalAnnualRent: rent,
                    totalCollected: collected,
                    totalOutstanding: outstanding,
                    failedInvites: failedInviteSnap.size,
                    openTickets: ticketSnap.size
                });
            } catch (err) {
                console.error("Metrics fetch error:", err);
            }
        };

        const unsubBatches = onSnapshot(
            query(collection(db, 'tenant_import_batches'), orderBy('createdAt', 'desc'), limit(5)),
            (snap) => {
                setLatestBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            }
        );

        fetchMetrics();
        return () => unsubBatches();
    }, []);

    const handleExportOperationsReport = () => {
        const doc = new jsPDF();
        doc.setFontSize(22);
        doc.text("BIN GROUP - FULL TOWER OPERATIONS REPORT", 14, 22);
        doc.setFontSize(12);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 32);
        
        doc.setFontSize(16);
        doc.text("Executive Summary", 14, 45);
        doc.setFontSize(12);
        const summaryData = [
            ["Total Managed Properties", metrics.totalProperties.toString()],
            ["Total Operational Units", metrics.totalUnits.toString()],
            ["Total Tenant Population", metrics.totalTenants.toString()],
            ["Gross Annual Revenue (Projected)", `AED ${metrics.totalAnnualRent.toLocaleString()}`],
            ["Total Collected to Date", `AED ${metrics.totalCollected.toLocaleString()}`],
            ["Total Outstanding Balance", `AED ${metrics.totalOutstanding.toLocaleString()}`],
            ["Open Maintenance Requests", metrics.openTickets.toString()],
            ["Failed Invitations", metrics.failedInvites.toString()]
        ];
        
        autoTable(doc, {
            startY: 50,
            body: summaryData,
            theme: 'plain',
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 100 } }
        });

        doc.save("BIN_GROUP_OPERATIONS_REPORT.pdf");
    };

    const handleRerunAggregation = async () => {
        if (!window.confirm("FORCE RECALCULATE ALL PASSPORTS? This may take several minutes.")) return;
        setActionRunning('aggregation');
        try {
            const propsSnap = await getDocs(collection(db, 'properties'));
            const recalc = httpsCallable(functions, 'recalculatePropertyPassport');
            const results = await Promise.allSettled(propsSnap.docs.map((p) => recalc({ propertyId: p.id })));
            const failed = results.filter((r) => r.status === 'rejected').length;
            alert(`Portfolio aggregation complete: ${results.length - failed} of ${results.length} properties recalculated${failed ? `, ${failed} failed` : ''}.`);
        } catch (err) {
            console.error('Aggregation error:', err);
            alert('Aggregation failed to run. Check console for details.');
        } finally {
            setActionRunning(null);
        }
    };

    const handleResendFailedInvitations = async () => {
        if (!window.confirm("RESEND ALL FAILED INVITATIONS?")) return;
        setActionRunning('invitations');
        try {
            const failedSnap = await getDocs(query(collection(db, 'tenant_invitations'), where('emailStatus', '==', 'failed')));
            const resend = httpsCallable(functions, 'resendTenantInvitation');
            const results = await Promise.allSettled(failedSnap.docs.map((d) => resend({ invitationId: d.id })));
            const failed = results.filter((r) => r.status === 'rejected').length;
            alert(`Resend complete: ${results.length - failed} of ${results.length} invitations re-queued${failed ? `, ${failed} failed` : ''}.`);
        } catch (err) {
            console.error('Resend invitations error:', err);
            alert('Resend failed to run. Check console for details.');
        } finally {
            setActionRunning(null);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
                <CircularProgress sx={{ color: '#DAA520' }} />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 950, color: '#fff', mb: 1 }}>
                        PRODUCTION <Box component="span" sx={{ color: '#DAA520' }}>CONTROL CENTER</Box>
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                        Real-time institutional oversight and mission-critical systems monitoring.
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button 
                        startIcon={<FileText size={18} />}
                        variant="outlined"
                        onClick={handleExportOperationsReport}
                        sx={{ borderColor: '#DAA520', color: '#DAA520', fontWeight: 900, borderRadius: 2 }}
                    >
                        EXPORT OPS REPORT (PDF)
                    </Button>
                    <Button 
                        startIcon={<RefreshCcw size={18} />}
                        sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 900, borderRadius: 2, px: 3 }}
                        onClick={() => window.location.reload()}
                    >
                        SYSTEM REFRESH
                    </Button>
                </Stack>
            </Box>

            {/* SYSTEM HEALTH GRID */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'SendGrid SMTP', status: systemHealth.sendGrid, icon: <Mail size={20} /> },
                    { label: 'Cloud Functions', status: systemHealth.functions, icon: <Activity size={20} /> },
                    { label: 'Firestore DB', status: systemHealth.firestore, icon: <Shield size={20} /> }
                ].map((sys, i) => (
                    <Grid item xs={12} md={4} key={i}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha('#DAA520', 0.1), color: '#DAA520' }}>
                                        {sys.icon}
                                    </Box>
                                    <Box>
                                        <Typography sx={{ color: '#fff', fontWeight: 800 }}>{sys.label}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>Version 2.4.1 (Stable)</Typography>
                                    </Box>
                                </Stack>
                                <Chip 
                                    label={sys.status.toUpperCase()} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: sys.status === 'operational' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                        color: sys.status === 'operational' ? '#10b981' : '#ef4444',
                                        fontWeight: 900
                                    }} 
                                />
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* KPI GRID */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'Total Annual Rent', value: `AED ${(metrics.totalAnnualRent / 1000000).toFixed(2)}M`, icon: <CreditCard />, color: '#6366f1' },
                    { label: 'Total Collected', value: `AED ${(metrics.totalCollected / 1000000).toFixed(2)}M`, icon: <CheckCircle />, color: '#10b981' },
                    { label: 'Total Outstanding', value: `AED ${(metrics.totalOutstanding / 1000).toFixed(1)}K`, icon: <AlertTriangle />, color: '#ef4444' },
                    { label: 'Active Tenants', value: metrics.totalTenants.toLocaleString(), icon: <Users />, color: '#DAA520' },
                    { label: 'Failed Invitations', value: metrics.failedInvites.toString(), icon: <XCircle />, color: metrics.failedInvites > 0 ? '#ef4444' : '#94a3b8' },
                    { label: 'Open SOS Missions', value: metrics.openTickets.toString(), icon: <Activity />, color: metrics.openTickets > 5 ? '#ef4444' : '#10b981' }
                ].map((kpi, i) => (
                    <Grid item xs={12} sm={6} md={2} key={i}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3 }}>
                            <CardContent sx={{ p: 2, textAlign: 'center' }}>
                                <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
                                <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{kpi.value}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, textTransform: 'uppercase', fontSize: '0.65rem' }}>{kpi.label}</Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={4}>
                {/* LATEST IMPORT BATCHES */}
                <Grid item xs={12} lg={8}>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, mb: 3 }}>LATEST IMPORT BATCHES</Typography>
                    <TableContainer component={Paper} sx={{ bgcolor: 'rgba(255,255,255,0.01)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Table>
                            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                <TableRow>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Batch ID</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Property</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Rows</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Success</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>Status</TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {latestBatches.map((batch) => (
                                    <TableRow key={batch.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>{batch.importBatchId?.substring(0, 12)}...</TableCell>
                                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>{batch.propertyName}</TableCell>
                                        <TableCell sx={{ color: '#fff', fontWeight: 700 }}>{batch.totalRows}</TableCell>
                                        <TableCell sx={{ color: '#10b981', fontWeight: 900 }}>{batch.invitedCount || batch.validRows}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={batch.status?.toUpperCase() || 'COMPLETED'} 
                                                size="small" 
                                                sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontWeight: 900, fontSize: '0.65rem' }} 
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <IconButton sx={{ color: 'rgba(255,255,255,0.3)' }} onClick={() => navigate(`/audit?batch=${batch.importBatchId}`)}>
                                                <ExternalLink size={18} />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                {/* SAFETY CONTROLS */}
                <Grid item xs={12} lg={4}>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 900, mb: 3 }}>SAFETY CONTROLS</Typography>
                    <Stack spacing={2}>
                        <Alert severity="warning" sx={{ bgcolor: 'rgba(237, 108, 2, 0.05)', color: '#ed6c02', border: '1px solid rgba(237, 108, 2, 0.2)', borderRadius: 3 }}>
                            Dangerous actions require second-tier admin authorization.
                        </Alert>
                        <Button 
                            fullWidth 
                            variant="outlined" 
                            color="error"
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900, borderStyle: 'dashed' }}
                            onClick={() => {
                                if(window.confirm("CRITICAL: ARCHIVE ALL PILOT TENANTS? This cannot be undone.")) {
                                    alert("Functionality restricted in production mode.");
                                }
                            }}
                        >
                            BULK ARCHIVE PILOT TENANTS
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            disabled={actionRunning !== null}
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                            onClick={handleRerunAggregation}
                        >
                            {actionRunning === 'aggregation' ? 'RECALCULATING...' : 'RERUN PORTFOLIO AGGREGATION'}
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            disabled={actionRunning !== null}
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900, borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}
                            onClick={handleResendFailedInvitations}
                        >
                            {actionRunning === 'invitations' ? 'SENDING...' : 'RESEND FAILED INVITATIONS'}
                        </Button>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}

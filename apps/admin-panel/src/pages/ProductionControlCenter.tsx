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
import { collection, query, onSnapshot, orderBy, limit, doc } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../lib/firebase';
import { formatAedLedgerMoney } from '../lib/canonicalPaymentLedger.mjs';
import { useLanguage } from '@bin/shared';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Metrics and health come from one server-written document (functions/controlCenterSummary.ts).
export const CONTROL_CENTER_SUMMARY_DOC = 'system_health/control_center_summary';
export const CONTROL_CENTER_STALE_MS = 45 * 60 * 1000;
type HealthCheck = { status: string; latencyMs: number | null; detail: string; checkedAt?: string };
const UNKNOWN_HEALTH: HealthCheck = { status: 'unknown', latencyMs: null, detail: 'No summary yet' };

export default function ProductionControlCenter() {
    const { lang } = useLanguage();
    const isAr = lang === 'ar';
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState({
        totalTenants: 0,
        totalUnits: 0,
        totalProperties: 0,
        totalAnnualRent: null as number | null,
        totalCollected: null as number | null,
        totalOutstanding: null as number | null,
        failedInvites: 0,
        openTickets: 0
    });
    const [latestBatches, setLatestBatches] = useState<any[]>([]);
    const [health, setHealth] = useState<Record<string, HealthCheck>>({});
    const [generatedAtIso, setGeneratedAtIso] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState('');
    const [truncated, setTruncated] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        const unsubSummary = onSnapshot(
            doc(db, CONTROL_CENTER_SUMMARY_DOC),
            (snap) => {
                const data: any = snap.data() || {};
                const m = data.metrics || {};
                setMetrics({
                    totalTenants: Number(m.totalTenants || 0),
                    totalUnits: Number(m.totalUnits || 0),
                    totalProperties: Number(m.totalProperties || 0),
                    totalAnnualRent: m.totalAnnualRent ?? null,
                    totalCollected: m.totalCollected ?? null,
                    totalOutstanding: m.totalOutstanding ?? null,
                    failedInvites: Number(m.failedInvites || 0),
                    openTickets: Number(m.openTickets || 0),
                });
                setTruncated(m.paymentsTruncated === true || m.contractsTruncated === true);
                setHealth(data.health || {});
                setGeneratedAtIso(data.generatedAtIso || null);
                setSummaryError(snap.exists() ? '' : (isAr ? 'لم يتم إنشاء الملخص بعد.' : 'The control-centre summary has not been generated yet.'));
            },
            (err) => setSummaryError(err?.message || 'Unable to load control-centre summary.'),
        );

        const unsubBatches = onSnapshot(
            query(collection(db, 'tenant_import_batches'), orderBy('createdAt', 'desc'), limit(5)),
            (snap) => {
                setLatestBatches(snap.docs.map(row => ({ id: row.id, ...row.data() })));
                setLoading(false);
            },
            () => setLoading(false),
        );
        return () => { unsubSummary(); unsubBatches(); };
    }, [isAr]);

    const stale = !generatedAtIso || Date.now() - Date.parse(generatedAtIso) > CONTROL_CENTER_STALE_MS;
    const functionsHealth: HealthCheck = stale
        ? { status: 'degraded', latencyMs: null, detail: generatedAtIso ? `Summary job last ran ${new Date(generatedAtIso).toLocaleString()}` : 'Summary job has not run' }
        : (health.functions || UNKNOWN_HEALTH);

    const refreshSummary = async () => {
        setRefreshing(true);
        setSummaryError('');
        try {
            await httpsCallable(functions, 'adminRefreshControlCenterSummary')({});
        } catch (err: any) {
            setSummaryError(err?.message || 'Refresh failed.');
        } finally {
            setRefreshing(false);
        }
    };

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
            ["Gross Annual Revenue (Projected)", formatAedLedgerMoney(metrics.totalAnnualRent)],
            ["Total Collected to Date", formatAedLedgerMoney(metrics.totalCollected)],
            ["Total Outstanding Balance", formatAedLedgerMoney(metrics.totalOutstanding)],
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
                        onClick={refreshSummary}
                        disabled={refreshing}
                    >
                        {refreshing ? 'REFRESHING…' : 'SYSTEM REFRESH'}
                    </Button>
                </Stack>
            </Box>

            {summaryError && <Alert severity="warning" sx={{ mb: 3 }}>{summaryError}</Alert>}
            {truncated && <Alert severity="info" sx={{ mb: 3 }}>Money totals hit the server scan cap; affected totals show as unavailable.</Alert>}
            <Typography variant="caption" sx={{ display: 'block', mb: 2, color: stale ? '#ef4444' : 'rgba(255,255,255,0.5)' }}>
                {generatedAtIso ? `Summary generated ${new Date(generatedAtIso).toLocaleString()}${stale ? ' (stale)' : ''}` : 'No summary generated yet'}
            </Typography>
            {/* SYSTEM HEALTH GRID */}
            <Grid container spacing={3} sx={{ mb: 6 }}>
                {[
                    { label: 'SendGrid SMTP', check: health.smtp || UNKNOWN_HEALTH, icon: <Mail size={20} /> },
                    { label: 'Mail queue (24h)', check: health.mailQueue || UNKNOWN_HEALTH, icon: <Mail size={20} /> },
                    { label: 'Cloud Functions', check: functionsHealth, icon: <Activity size={20} /> },
                    { label: 'Firestore DB', check: health.firestore || UNKNOWN_HEALTH, icon: <Shield size={20} /> }
                ].map((sys, i) => (
                    <Grid item xs={12} md={3} key={i}>
                        <Card sx={{ bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                            <CardContent sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha('#DAA520', 0.1), color: '#DAA520' }}>
                                        {sys.icon}
                                    </Box>
                                    <Box>
                                        <Typography sx={{ color: '#fff', fontWeight: 800 }}>{sys.label}</Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>{sys.check.detail}{sys.check.latencyMs != null ? ` · ${sys.check.latencyMs} ms` : ''}</Typography>
                                    </Box>
                                </Stack>
                                <Chip 
                                    label={String(sys.check.status).replace(/_/g, ' ').toUpperCase()} 
                                    size="small" 
                                    sx={{ 
                                        bgcolor: sys.check.status === 'operational' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                                        color: sys.check.status === 'operational' ? '#10b981' : '#ef4444',
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
                    { label: 'Total Annual Rent', value: formatAedLedgerMoney(metrics.totalAnnualRent), icon: <CreditCard />, color: '#6366f1' },
                    { label: 'Total Collected', value: formatAedLedgerMoney(metrics.totalCollected), icon: <CheckCircle />, color: '#10b981' },
                    { label: 'Total Outstanding', value: formatAedLedgerMoney(metrics.totalOutstanding), icon: <AlertTriangle />, color: '#ef4444' },
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
                                            <IconButton
                                                aria-label={`Open audit for batch ${batch.importBatchId || batch.id}`}
                                                sx={{ color: 'rgba(255,255,255,0.3)' }}
                                                onClick={() => navigate(`/audit?batch=${batch.importBatchId}`)}
                                            >
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
                        {/* These three controls used to show alert() success text without calling any server
                            function. There is no bulk
                            callable for them, so they are disabled with honest text or routed to the real
                            per-item workflow. Never show success without a server response. */}
                        <Button
                            fullWidth
                            variant="outlined"
                            color="error"
                            disabled
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900, borderStyle: 'dashed' }}
                        >
                            {isAr ? 'أرشفة المستأجرين التجريبيين (غير متاح بعد)' : 'Bulk archive pilot tenants (not available yet)'}
                        </Button>
                        <Button
                            fullWidth
                            variant="outlined"
                            disabled
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900 }}
                        >
                            {isAr ? 'إعادة حساب كل الجوازات (غير متاح بعد)' : 'Recalculate all passports (not available yet)'}
                        </Button>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>
                            {isAr
                                ? 'لا توجد بعد وظيفة خادم جماعية لهذين الإجراءين. أعد حساب عقار واحد من صفحة جواز العقار.'
                                : 'There is no bulk server action for these yet. Recalculate a single property from its property passport page.'}
                        </Typography>
                        <Button
                            fullWidth
                            variant="outlined"
                            onClick={() => navigate('/tenants')}
                            sx={{ py: 2, borderRadius: 3, fontWeight: 900, borderColor: 'rgba(255,255,255,0.3)', color: '#FFFFFF' }}
                        >
                            {isAr ? 'فتح دعوات المستأجرين لإعادة الإرسال' : 'Open tenant invitations to resend'}
                        </Button>
                    </Stack>
                </Grid>
            </Grid>
        </Box>
    );
}

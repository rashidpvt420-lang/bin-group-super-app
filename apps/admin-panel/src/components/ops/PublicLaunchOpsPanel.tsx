// admin-panel/src/components/ops/PublicLaunchOpsPanel.tsx
import React, { useState, useEffect } from 'react';
import {
    Box, Grid, Card, Typography, Stack,
    Chip, Alert,
    AlertTitle, LinearProgress, Divider, IconButton
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import PaymentsIcon from '@mui/icons-material/Payments';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import TrafficIcon from '@mui/icons-material/Traffic';

// Import Firestore from sovereign shared lib
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../../lib/firebase';

export default function PublicLaunchOpsPanel() {
    const [metrics, setMetrics] = useState({
        quotesPerHour: 0,
        abuseAttempts: 0,
        duplicateBlocks: 0,
        paymentFailures: 0,
        activationFailures: 0,
        conversionRate: 0
    });

    const [alerts, setAlerts] = useState<any[]>([]);
    const [streamError, setStreamError] = useState('');

    useEffect(() => {
        // 1. Live Snapshot of Security Registry
        const qSecurity = query(collection(db, 'security_audit_logs'), orderBy('createdAt', 'desc'), limit(5));
        const unsubSecurity = onSnapshot(qSecurity, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAlerts(logs);
            
            // Calculate abuse attempts from logs
            const abuse = logs.filter((l: any) => ['BOT_DETECTION', 'OTP_THROTTLE', 'QUOTE_LIMIT'].includes(String(l.type || ''))).length;
            setMetrics(prev => ({ ...prev, abuseAttempts: abuse }));
        }, (error) => setStreamError(error.message || 'Security telemetry stream unavailable.'));

        // 2. Quote Velocity (Last 1 hour)
        const hourAgo = new Date(Date.now() - 3600000);
        const qQuotes = query(collection(db, 'quotes'), where('createdAt', '>=', hourAgo), limit(500));
        const unsubQuotes = onSnapshot(qQuotes, (snapshot) => {
            setMetrics(prev => ({ ...prev, quotesPerHour: snapshot.size }));
        }, (error) => setStreamError(error.message || 'Quote telemetry stream unavailable.'));

        // 3. Payment Integrity (Failures)
        const qPayments = query(collection(db, 'payment_transactions'), where('status', 'in', ['FAILED', 'REJECTED', 'REVIEW_REQUIRED']), limit(500));
        const unsubPayments = onSnapshot(qPayments, (snapshot) => {
            setMetrics(prev => ({ ...prev, paymentFailures: snapshot.size }));
        }, (error) => setStreamError(error.message || 'Payment integrity stream unavailable.'));

        // 4. Overall Conversion Logic (bounded operational sample).
        let sampledQuoteCount = 0;
        let sampledVerifiedPayments = 0;
        const updateConversion = () => {
            const totalQ = sampledQuoteCount || 1;
            const cv = (sampledVerifiedPayments / totalQ) * 100;
            setMetrics(prev => ({ ...prev, conversionRate: parseFloat(cv.toFixed(2)) }));
        };
        const unsubAllQuotes = onSnapshot(query(collection(db, 'quotes'), limit(1000)), (qSnap) => {
            sampledQuoteCount = qSnap.size;
            updateConversion();
        }, (error) => setStreamError(error.message || 'Quote conversion stream unavailable.'));
        const unsubAllPayments = onSnapshot(query(collection(db, 'payment_transactions'), limit(1000)), (pSnap) => {
            sampledVerifiedPayments = pSnap.docs.filter((row) => {
                const data = row.data();
                const status = String(data.status || data.paymentStatus || '').toUpperCase();
                const isCredit = ['SLA_CREDIT', 'REFUND', 'CREDIT'].includes(String(data.recordType || data.transactionType || '').toUpperCase());
                return !isCredit && (data.paymentVerified === true || data.verified === true || ['PAID', 'APPROVED', 'VERIFIED', 'SUCCEEDED'].includes(status));
            }).length;
            updateConversion();
        }, (error) => setStreamError(error.message || 'Payment conversion stream unavailable.'));

        return () => {
            unsubSecurity();
            unsubQuotes();
            unsubPayments();
            unsubAllQuotes();
            unsubAllPayments();
        };
    }, []);

    return (
        <Box sx={{ p: 4, bgcolor: '#f1f5f9', minHeight: '100vh' }}>
            {streamError && <Alert severity="error" sx={{ mb: 3 }}>{streamError}</Alert>}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h4" fontWeight="black" sx={{ color: '#0f172a', letterSpacing: -1 }}>
                        PUBLIC LAUNCH OPS <Chip label="LIVE" size="small" color="success" sx={{ ml: 1, fontWeight: 'bold' }} />
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Scalability Monitoring & Fraud Prevention (Firestore Live Sync)
                    </Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Card sx={{ px: 3, py: 1, bgcolor: '#0f172a', color: 'white' }}>
                        <Typography variant="caption" sx={{ opacity: 0.7 }}>Quoting Velocity</Typography>
                        <Typography variant="h6" fontWeight="bold">{metrics.quotesPerHour} / hr</Typography>
                    </Card>
                </Stack>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <Stack spacing={2}>
                        {alerts.map(alert => (
                            <Alert key={alert.id} severity={alert.severity || 'info'} variant="filled" action={
                                <IconButton disabled title="Reconciliation actions run from the audited payment approval queue." size="small" color="inherit">Reconcile</IconButton>
                            }>
                                <AlertTitle fontWeight="bold">{alert.title || 'Security Signal'}</AlertTitle>
                                {alert.message || alert.details || 'Operational status update received.'}
                            </Alert>
                        ))}
                        {alerts.length === 0 && (
                            <Alert severity="success" variant="outlined">
                                <AlertTitle fontWeight="bold">SECURITY STATUS: NOMINAL</AlertTitle>
                                No immediate alerts detected in the last 5 audit cycles.
                            </Alert>
                        )}
                    </Stack>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                            <ShieldIcon color="primary" />
                            <Typography variant="h6" fontWeight="bold">Security Shield</Typography>
                        </Stack>
                        <Stack spacing={3}>
                            <Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                    <Typography variant="body2">Abuse Attempts (Logs)</Typography>
                                    <Typography variant="body2" fontWeight="bold">{metrics.abuseAttempts}</Typography>
                                </Box>
                                <LinearProgress variant="determinate" value={Math.min(metrics.abuseAttempts * 10, 100)} color="warning" />
                            </Box>
                            <Divider />
                            <Typography variant="caption" color="text.secondary">
                                Rate Limit: 5 per hour / device<br />
                                Target: Anonymous Public Onboarding
                            </Typography>
                        </Stack>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                            <TrafficIcon color="secondary" />
                            <Typography variant="h6" fontWeight="bold">Onboarding Funnel</Typography>
                        </Stack>
                        <Stack spacing={2}>
                            <Box sx={{ p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ display: 'block', mb: 1 }}>Public CV Analysis (Live)</Typography>
                                <Stack direction="row" spacing={1} justifyContent="space-between" textAlign="center">
                                    <Box><Typography variant="h6">{metrics.conversionRate > 0 ? '100%' : '0%'}</Typography><Typography variant="caption">Quoted</Typography></Box>
                                    <Box><Typography variant="h6">{metrics.conversionRate}%</Typography><Typography variant="caption">Payment</Typography></Box>
                                </Stack>
                            </Box>
                            <Box sx={{ textAlign: 'center', py: 2 }}>
                                <Typography variant="h3" fontWeight="bold" color="primary">{metrics.conversionRate}%</Typography>
                                <Typography variant="body2" color="text.secondary">Net Conversion Flow</Typography>
                            </Box>
                        </Stack>
                    </Card>
                </Grid>

                <Grid item xs={12} md={4}>
                    <Card sx={{ p: 3, height: '100%', border: metrics.paymentFailures > 0 ? '2px solid #ef4444' : 'none' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 3 }}>
                            <PaymentsIcon color="success" />
                            <Typography variant="h6" fontWeight="bold">Payment Integrity</Typography>
                        </Stack>
                        <Stack spacing={3}>
                            <Card variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                                <Typography variant="h6" color={metrics.paymentFailures > 0 ? "error.main" : "success.main"} fontWeight="bold">
                                    {metrics.paymentFailures}
                                </Typography>
                                <Typography variant="caption">Payment Reconciliation Gaps</Typography>
                            </Card>
                            <Alert severity={metrics.paymentFailures === 0 ? "success" : "error"} icon={<VerifiedUserIcon />}>
                                {metrics.paymentFailures === 0 ? "All activation hashes verified." : "Mismatched transactions detected."}
                            </Alert>
                        </Stack>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}

/**
 * BIN-CFO™ Alpha Dashboard — /admin/profitability
 * Layer 4: Executive Financial Intelligence
 */
import React, { useState, useEffect } from 'react';
import {
    Container, Typography, Box, Grid, Card, CardContent,
    Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    LinearProgress, Skeleton, Button, Divider, Paper, Alert
} from '@mui/material';
import {
    AccountBalance,
    Payments,
    Scale,
    PieChart,
    NorthEast,
    ReceiptLong,
    Security
} from '@mui/icons-material';
import { collection, onSnapshot, QuerySnapshot, DocumentData, query, limit } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion } from 'framer-motion';

interface CFOStats {
    mrr: number | null;
    arr: number | null;
    totalRevenue: number;
    totalCosts: number | null;
    grossProfit: number | null;
    profitMargin: number | null;
    outstandingInvoices: number;
    overdueInvoices: number;
    churnRate: number | null;
    portfolioCount: number;
    activeContracts: number;
}

export default function CFODashboard() {
    const [stats, setStats] = useState<CFOStats | null>(null);
    const [snapshotData, setSnapshotData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        // Canonical financial truth is the server-authored payment_transactions ledger.
        const paymentQuery = query(collection(db, 'payment_transactions'), limit(1000));
        const unsubPayments = onSnapshot(paymentQuery, (snapshot: QuerySnapshot<DocumentData>) => {
            const rows = snapshot.docs.map((row) => row.data());
            const statusOf = (row: any) => String(row.status || row.paymentStatus || '').toUpperCase();
            const isCredit = (row: any) => ['SLA_CREDIT', 'REFUND', 'CREDIT'].includes(String(row.recordType || row.transactionType || '').toUpperCase());
            const successful = rows.filter((row: any) =>
                !isCredit(row) && (
                    row.paymentVerified === true ||
                    row.verified === true ||
                    ['SUCCEEDED', 'PAID', 'APPROVED', 'VERIFIED'].includes(statusOf(row))
                )
            );
            const revenue = successful.reduce((acc: number, row: any) => acc + Number(row.amount || row.paidAmount || 0), 0);
            const overdue = rows.filter((row: any) => statusOf(row) === 'OVERDUE').reduce((acc: number, row: any) => acc + Number(row.amount || 0), 0);
            const pending = rows
                .filter((row: any) => statusOf(row).startsWith('PENDING') || ['PAYMENT_REQUESTED', 'REVIEW_REQUIRED'].includes(statusOf(row)))
                .reduce((acc: number, row: any) => acc + Number(row.amount || 0), 0);

            setStats(prev => ({
                ...(prev || {} as CFOStats),
                totalRevenue: revenue,
                arr: null,
                mrr: null,
                outstandingInvoices: pending,
                overdueInvoices: overdue,
                totalCosts: null,
                grossProfit: null,
                profitMargin: null,
                churnRate: null,
                portfolioCount: prev?.portfolioCount || 0,
                activeContracts: prev?.activeContracts || 0
            }));
            setLoading(false);
        }, (error) => {
            setLoadError(error.message || 'Canonical payment ledger could not be loaded.');
            setLoading(false);
        });

        // 🏢 2. Portfolio Intelligence (From Properties & Contracts)
        const unsubProps = onSnapshot(query(collection(db, 'properties'), limit(1000)), (snapshot: QuerySnapshot<DocumentData>) => {
            const props = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSnapshotData(props);
            setStats(prev => ({
                ...(prev || {} as CFOStats),
                portfolioCount: snapshot.size
            }));
        });

        const unsubContracts = onSnapshot(query(collection(db, 'contracts'), limit(1000)), (snapshot: QuerySnapshot<DocumentData>) => {
            setStats((prev: any) => ({
                ...(prev || {} as CFOStats),
                activeContracts: snapshot.docs.filter((d: any) => d.data().status === 'ACTIVE').length
            }));
        });

        return () => {
            unsubPayments();
            unsubProps();
            unsubContracts();
        };
    }, []);

    if (loading) return <Skeleton variant="rectangular" height="80vh" />;

    return (
        <Container maxWidth={false} sx={{ py: 6, bgcolor: '#f8fafc', minHeight: '100vh' }}>
            {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}
            <Alert severity="info" sx={{ mb: 3 }}>
                Revenue includes verified server-authored payment transactions only. ARR, MRR, cost, margin and churn remain unavailable until authoritative accounting inputs are connected.
            </Alert>
            {/* ── 1. DASHBOARD HEADER ── */}
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" color="primary" sx={{ fontWeight: 900, letterSpacing: 4 }}>
                        Institutional Treasury
                    </Typography>
                    <Typography variant="h3" fontWeight={900} sx={{ letterSpacing: -2, color: '#0f172a', mt: 1 }}>
                        BIN-CFO<Typography component="span" sx={{ color: '#1976d2', fontWeight: 'inherit', letterSpacing: 'inherit' }}>™</Typography> Alpha
                    </Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 600 }}>
                        Real-time Revenue & Portfolio Margin Orchestration · FY 2026
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button disabled title="An audited export backend is not connected." variant="outlined" startIcon={<ReceiptLong />} sx={{ borderRadius: 3, fontWeight: 900, px: 3 }}>
                        Export Audit
                    </Button>
                    <Button disabled title="Forecasting is disabled until authoritative cost history exists." variant="contained" startIcon={<NorthEast />} sx={{ borderRadius: 3, fontWeight: 900, px: 3, boxShadow: '0 10px 30px rgba(25,118,210,0.3)' }}>
                        Revenue Forecast
                    </Button>
                </Box>
            </Box>

            <Grid container spacing={4}>
                {/* ── 2. TREASURY METRICS ── */}
                <Grid item xs={12} lg={8}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={4}>
                            <MetricCard 
                                label="Annual Recurring Revenue" 
                                value={stats?.arr === null ? 'Not available' : `AED ${(stats?.arr || 0).toLocaleString()}`}
                                icon={<AccountBalance />} 
                                color="#1e293b" 
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <MetricCard 
                                label="Net Profit Margin" 
                                value={stats?.profitMargin === null ? 'Not available' : `${stats?.profitMargin || 0}%`}
                                icon={<PieChart />} 
                                color="#16a34a" 
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <MetricCard 
                                label="Mrr (Active Coverage)" 
                                value={stats?.mrr === null ? 'Not available' : `AED ${(stats?.mrr || 0).toLocaleString()}`}
                                icon={<Payments />} 
                                color="#1976d2" 
                            />
                        </Grid>
                    </Grid>

                    {/* ── 3. REVENUE HORIZON ── */}
                    <Card sx={{ mt: 4, borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: 'none', overflow: 'hidden' }}>
                        <CardContent sx={{ p: 4 }}>
                            <Typography variant="h6" fontWeight={900} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Scale color="primary" /> Revenue Risk Horizon
                            </Typography>
                            <Divider sx={{ my: 2 }} />
                            <Grid container spacing={4} sx={{ mt: 1 }}>
                                <Grid item xs={12} md={6}>
                                    <Box sx={{ p: 3, bgcolor: '#fff', border: '1px solid #f1f5f9', borderRadius: 4 }}>
                                        <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                                            Outstanding Invoices
                                        </Typography>
                                        <Typography variant="h4" fontWeight={900} color="#fbbf24">
                                            AED {stats?.outstandingInvoices.toLocaleString()}
                                        </Typography>
                                        <LinearProgress variant="determinate" value={70} sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: '#fef3c7', '& .MuiLinearProgress-bar': { bgcolor: '#fbbf24' } }} />
                                        <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Expected settlement within 14 days</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Box sx={{ p: 3, bgcolor: '#fff', border: '1px solid #fee2e2', borderRadius: 4 }}>
                                        <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 800, textTransform: 'uppercase' }}>
                                            Overdue Recovery
                                        </Typography>
                                        <Typography variant="h4" fontWeight={900} color="#ef4444">
                                            AED {stats?.overdueInvoices.toLocaleString()}
                                        </Typography>
                                        <LinearProgress variant="determinate" value={28} sx={{ mt: 2, height: 6, borderRadius: 3, bgcolor: '#fee2e2', '& .MuiLinearProgress-bar': { bgcolor: '#ef4444' } }} />
                                        <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#ef4444' }}>⚠️ Enforcement actions required</Typography>
                                    </Box>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>

                {/* ── 4. ANALYTICS SIDEBAR ── */}
                <Grid item xs={12} lg={4}>
                    <Card sx={{ borderRadius: 6, bgcolor: '#0f172a', color: 'white', height: '100%', p: 2 }}>
                        <CardContent>
                            <Typography variant="h6" fontWeight={900} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Security sx={{ color: '#fbbf24' }} /> Alpha Insights
                            </Typography>
                            <Box sx={{ mt: 4, spaceY: 4 }}>
                                <InsightRow label="Client Churn Rate" value="Not available" status="NO SOURCE" />
                                <InsightRow label="Portfolio ARR Density" value="Not available" status="NO SOURCE" />
                                <InsightRow label="Service Margin" value="Not available" status="NO SOURCE" />
                                <InsightRow label="Asset Health Correlation" value="Not available" status="NO SOURCE" />
                            </Box>
                            
                            <Box sx={{ mt: 8, p: 3, bgcolor: '#1e293b', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 900, textTransform: 'uppercase' }}>Forecast Alpha</Typography>
                                <Typography variant="body2" sx={{ mt: 1, color: '#e2e8f0', lineHeight: 1.6 }}>
                                    Forecasting is disabled until verified revenue, cost, renewal and churn histories are available from authoritative ledgers.
                                </Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* ── 5. PORTFOLIO PERFORMANCE ── */}
                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 6, boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                        <Box sx={{ p: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" fontWeight={900}>Portfolio Profitability Audit</Typography>
                            <Chip label={`${stats?.portfolioCount} Active Assets`} sx={{ fontWeight: 900, bgcolor: '#f1f5f9' }} />
                        </Box>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Property Asset</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Contract Value</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Op Costs</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Net Proft</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Margin %</TableCell>
                                    <TableCell sx={{ fontWeight: 900, textTransform: 'uppercase', fontSize: 10 }}>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {stats?.portfolioCount ? snapshotData.map((row: any) => (
                                    <TableRow key={row.id} hover>
                                        <TableCell sx={{ fontWeight: 800 }}>{row.propertyName || row.address || 'Unnamed Asset'}</TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>AED {Number(row.annualContractValue || row.annualAMC || 0).toLocaleString()}</TableCell>
                                        <TableCell sx={{ color: '#ef4444', fontWeight: 700 }}>{Number.isFinite(Number(row.actualOperatingCost)) ? `AED ${Number(row.actualOperatingCost).toLocaleString()}` : 'Not available'}</TableCell>
                                        <TableCell sx={{ color: '#16a34a', fontWeight: 900 }}>{Number.isFinite(Number(row.actualOperatingCost)) ? `AED ${(Number(row.annualContractValue || row.annualAMC || 0) - Number(row.actualOperatingCost)).toLocaleString()}` : 'Not available'}</TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography variant="body2" fontWeight={800}>{Number.isFinite(Number(row.actualOperatingCost)) && Number(row.annualContractValue || row.annualAMC) > 0 ? `${Math.round(((Number(row.annualContractValue || row.annualAMC) - Number(row.actualOperatingCost)) / Number(row.annualContractValue || row.annualAMC)) * 100)}%` : 'Not available'}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={String(row.status || 'UNKNOWN').toUpperCase()}
                                                size="small" 
                                                sx={{ 
                                                    fontWeight: 900, 
                                                    fontSize: 9, 
                                                    bgcolor: '#dcfce7',
                                                    color: '#166534'
                                                }} 
                                            />
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">
                                            <Typography variant="body2" sx={{ py: 4, color: 'textSecondary' }}>No active portfolio data available.</Typography>
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>
        </Container>
    );
}

function MetricCard({ label, value, delta, icon, color }: any) {
    return (
        <motion.div whileHover={{ y: -5 }} transition={{ type: 'spring', stiffness: 300 }}>
            <Card sx={{ borderRadius: 6, border: '1px solid #e2e8f0', boxShadow: 'none', position: 'relative', overflow: 'hidden' }}>
                <CardContent sx={{ p: 4 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ p: 1.5, borderRadius: 3, bgcolor: `${color}10`, color: color }}>{icon}</Box>
                        {delta && (
                            <Typography variant="caption" sx={{ fontWeight: 900, color: '#16a34a', bgcolor: '#dcfce7', px: 1.5, py: 0.5, borderRadius: 2 }}>
                                {delta}
                            </Typography>
                        )}
                    </Box>
                    <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {label}
                    </Typography>
                    <Typography variant="h4" fontWeight={950} sx={{ color: '#0f172a', letterSpacing: -1, mt: 0.5 }}>
                        {value}
                    </Typography>
                </CardContent>
            </Card>
        </motion.div>
    );
}

function InsightRow({ label, value, status }: any) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
                <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600 }}>{label}</Typography>
                <Typography variant="h6" fontWeight={800} sx={{ color: 'white' }}>{value}</Typography>
            </Box>
            <Chip label={status} size="small" sx={{ fontWeight: 900, fontSize: 8, bgcolor: 'rgba(255,255,255,0.05)', color: '#fbbf24', border: '1px solid rgba(251,158,11,0.2)' }} />
        </Box>
    );
}

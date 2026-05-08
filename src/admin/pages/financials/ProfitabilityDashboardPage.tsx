// src/admin/pages/financials/ProfitabilityDashboardPage.tsx

import React, { useState, useEffect } from 'react';
import { 
    Grid, Typography, Box, Paper, Stack, alpha, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
    Button, Chip, LinearProgress
} from '@mui/material';
import { 
    Download, DollarSign, Clock, FileText, 
    TrendingUp, Wallet, AlertCircle,
    ArrowRight, CheckCircle2
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, limit, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

// --- Extreme Safety Helper ---
const safe = (val: any): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string' || typeof val === 'number') return String(val);
    if (val && val.toDate && typeof val.toDate === 'function') return val.toDate().toLocaleDateString();
    if (val && typeof val.seconds === 'number') return new Date(val.seconds * 1000).toLocaleDateString();
    if (typeof val === 'object') {
        try {
            return val.displayName || val.name || val.label || val.title || JSON.stringify(val);
        } catch(e) {
            return "[Object]";
        }
    }
    return String(val);
};

const safeCurrency = (val: any, lang: string): string => {
    const num = Number(val || 0);
    return isNaN(num) ? "AED 0" : num.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE', { 
        style: 'currency', 
        currency: 'AED',
        maximumFractionDigits: 0
    });
};

export default function ProfitabilityDashboardPage() {
    const { lang } = useLanguage();
    
    // Data State
    const [summary, setSummary] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastSync, setLastSync] = useState<any>(null);

    useEffect(() => {
        const unsubs: (() => void)[] = [];

        // 1. Global Summary
        unsubs.push(onSnapshot(doc(db, "admin_summaries", "global"), (snap) => {
            if (snap.exists()) setSummary(snap.data());
        }));

        // 2. Recent Transactions
        unsubs.push(onSnapshot(query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(10)), (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }));

        // 3. Payment Submissions (Pending)
        unsubs.push(onSnapshot(query(collection(db, "paymentSubmissions"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }));

        // 4. Contracts Pipeline
        unsubs.push(onSnapshot(query(collection(db, "contracts"), orderBy("createdAt", "desc"), limit(5)), (snap) => {
            setContracts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }));

        setLoading(false);
        setLastSync(new Date());

        return () => unsubs.forEach(u => u());
    }, []);

    const kpis = [
        { label: 'Total Collection', val: summary?.totalCollections || 0, icon: <Wallet size={20} />, color: '#10b981' },
        { label: 'Pending Liquidity', val: summary?.pendingLiquidity || 0, icon: <Clock size={20} />, color: binThemeTokens.gold },
        { label: 'Overdue Payments', val: summary?.overduePayments || 0, icon: <AlertCircle size={20} />, color: binThemeTokens.danger },
        { label: 'Payroll Pending', val: summary?.payrollPending || 0, icon: <DollarSign size={20} />, color: '#6366f1' },
    ];

    return (
        <AdminPageFrame
            title="Financial Command"
            subtitle="V2.5 SOVEREIGN TREASURY GATEWAY"
            loading={loading}
            lastUpdated={lastSync}
            breadcrumbs={[{ label: 'Financials' }]}
        >
            <Box sx={{ pb: 8 }}>
                {/* KPI ROW */}
                <Grid container spacing={3} sx={{ mb: 6 }}>
                    {kpis.map((kpi, i) => (
                        <Grid item xs={12} sm={6} md={3} key={i}>
                            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Box sx={{ color: kpi.color, mb: 2 }}>{kpi.icon}</Box>
                                <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block' }}>{safe(kpi.label)}</Typography>
                                <Typography variant="h4" sx={{ fontWeight: 950, color: '#FFF', my: 1 }}>{safeCurrency(kpi.val, lang)}</Typography>
                                <LinearProgress variant="determinate" value={100} sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: kpi.color } }} />
                            </Paper>
                        </Grid>
                    ))}
                </Grid>

                <Grid container spacing={4}>
                    {/* TRANSACTIONS LEDGER */}
                    <Grid item xs={12} lg={8}>
                        <Paper sx={{ p: 0, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                            <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <TrendingUp color={binThemeTokens.gold} /> INSTITUTIONAL LEDGER
                                </Typography>
                                <Button startIcon={<Download size={16} />} sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>EXPORT REPORT</Button>
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>DATE</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>DESCRIPTION</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>AMOUNT</TableCell>
                                            <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.map((tx) => (
                                            <TableRow key={tx.id} hover>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>{safe(tx.createdAt)}</TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFF' }}>{safe(tx.description)}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>{safe(tx.category).toUpperCase()}</Typography>
                                                </TableCell>
                                                <TableCell sx={{ fontWeight: 950, color: tx.type === 'credit' ? '#10b981' : binThemeTokens.danger }}>
                                                    {tx.type === 'credit' ? '+' : '-'} {safeCurrency(tx.amount, lang)}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip label={safe(tx.status).toUpperCase()} size="small" sx={{ fontWeight: 900, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {transactions.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} align="center" sx={{ py: 10, color: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>NO TRANSACTIONS LOGGED</TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>

                    {/* SUBMISSIONS & PIPELINE */}
                    <Grid item xs={12} lg={4}>
                        <Stack spacing={4}>
                            {/* PAYMENT SUBMISSIONS */}
                            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="subtitle2" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CheckCircle2 size={18} color={binThemeTokens.gold} /> PAYMENT SUBMISSIONS
                                </Typography>
                                <Stack spacing={2}>
                                    {submissions.map((sub) => (
                                        <Box key={sub.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REF: {safe(sub.id).substring(0,8)}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{safe(sub.createdAt)}</Typography>
                                            </Box>
                                            <Typography variant="body2" sx={{ fontWeight: 800 }}>{safe(sub.method || 'Transfer')}</Typography>
                                            <Typography variant="h6" sx={{ fontWeight: 950, my: 0.5 }}>{safeCurrency(sub.amount, lang)}</Typography>
                                            <Button fullWidth size="small" variant="outlined" sx={{ mt: 1, fontWeight: 900, fontSize: '0.65rem' }}>VERIFY</Button>
                                        </Box>
                                    ))}
                                    {submissions.length === 0 && (
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 2 }}>NO PENDING SUBMISSIONS</Typography>
                                    )}
                                </Stack>
                            </Paper>

                            {/* CONTRACT PIPELINE */}
                            <Paper sx={{ p: 3, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="subtitle2" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <FileText size={18} color="#6366f1" /> CONTRACT PIPELINE
                                </Typography>
                                <Stack spacing={2}>
                                    {contracts.map((con) => (
                                        <Box key={con.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 800 }}>{safe(con.propertyName || 'New Contract')}</Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>{safe(con.type || 'Standard')}</Typography>
                                            </Box>
                                            <Typography variant="body2" sx={{ fontWeight: 900, color: '#10b981' }}>{safeCurrency(con.annualAMC, lang)}</Typography>
                                        </Box>
                                    ))}
                                    {contracts.length === 0 && (
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', textAlign: 'center', py: 2 }}>NO ACTIVE CONTRACTS</Typography>
                                    )}
                                </Stack>
                                <Button fullWidth endIcon={<ArrowRight size={16} />} sx={{ mt: 3, fontWeight: 900, color: binThemeTokens.gold }}>VIEW ALL CONTRACTS</Button>
                            </Paper>
                        </Stack>
                    </Grid>
                </Grid>
            </Box>
        </AdminPageFrame>
    );
}


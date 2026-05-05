import React, { useState, useEffect } from 'react';
import { Grid, Typography, Box, Paper, Stack, alpha, LinearProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button } from '@mui/material';
import { Download } from 'lucide-react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';
import { safeText, safeCurrency, safeDate, safeNumber } from '../../utils/safeFormatters';

interface Transaction {
    id: string;
    amount: number;
    type: 'credit' | 'debit';
    category: string;
    description: string;
    status: string;
    createdAt: any;
}

export default function ProfitabilityDashboardPage() {
    const { t, lang, isRTL } = useLanguage();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<any>(null);

    useEffect(() => {
        const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Transaction[];
            setTransactions(txs);
            setLoading(false);
            setLastUpdated(new Date());
        }, (error) => {
            console.error("Financial Data Fetch Error:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const totalCollection = transactions
        .filter(tx => tx.type === 'credit' && tx.status === 'settled')
        .reduce((sum, tx) => sum + tx.amount, 0);

    const totalDeductions = transactions
        .filter(tx => tx.type === 'debit')
        .reduce((sum, tx) => sum + tx.amount, 0);

    const netPosition = totalCollection - totalDeductions;
    const margin = totalCollection > 0 ? (netPosition / totalCollection) * 100 : 0;

    const formatCurrency = (val: number) => {
        return val.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE', { 
            style: 'currency', 
            currency: 'AED',
            maximumFractionDigits: 0
        });
    };

    return (
        <AdminPageFrame
            title={t('fin.title')}
            subtitle={t('fin.subtitle')}
            loading={loading}
            lastUpdated={lastUpdated}
            isEmpty={transactions.length === 0}
            emptyMessage={t('dash.empty_title')}
            breadcrumbs={[{ label: t('nav.financials') }]}
        >
            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05) }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1 }}>{t('fin.kpi.total_collection').toUpperCase()}</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 950, color: '#FFF', mt: 1 }}>{safeCurrency(totalCollection, lang)}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>SOVEREIGN LEDGER</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' }}>
                        <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 800 }}>{t('fin.sovereign_payout').toUpperCase()}</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.gold, mt: 1 }}>{safeCurrency(totalDeductions, lang)}</Typography>
                        <Typography variant="caption" color="textSecondary">LIQUIDITY DISPATCHED</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' }}>
                        <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 800 }}>{t('fin.net_position').toUpperCase()}</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 950, color: '#10b981', mt: 1 }}>{safeCurrency(netPosition, lang)}</Typography>
                        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 700 }}>MARGIN: {margin.toFixed(1)}%</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha(binThemeTokens.danger, 0.05), border: `1px solid ${alpha(binThemeTokens.danger, 0.1)}` }}>
                        <Typography variant="caption" sx={{ color: binThemeTokens.danger, fontWeight: 900 }}>{t('fin.overdue_deficit').toUpperCase()}</Typography>
                        <Typography variant="h4" sx={{ fontWeight: 950, color: binThemeTokens.danger, mt: 1 }}>{safeCurrency(0, lang)}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.danger, opacity: 0.7 }}>CRITICAL LEAKAGE</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{t('fin.ledger')}</Typography>
                <Button 
                    startIcon={<Download size={18} />} 
                    variant="outlined" 
                    sx={{ borderRadius: 2, borderColor: 'rgba(255,255,255,0.1)', color: '#FFF' }}
                >
                    {t('fin.export_btn')}
                </Button>
            </Box>

            <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)', bgcolor: 'rgba(255,255,255,0.01)' }}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('fin.table.date').toUpperCase()}</TableCell>
                            <TableCell>{t('fin.table.description').toUpperCase()}</TableCell>
                            <TableCell>{t('fin.table.category').toUpperCase()}</TableCell>
                            <TableCell>{t('fin.table.amount').toUpperCase()}</TableCell>
                            <TableCell align="right">{t('fin.table.type').toUpperCase()}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {transactions.slice(0, 10).map((tx) => (
                            <TableRow key={tx.id} hover>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
                                    {safeDate(tx.createdAt, lang)}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700, color: '#FFF' }}>{String(tx.description || '')}</TableCell>
                                <TableCell>
                                    <Typography variant="caption" sx={{ bgcolor: 'rgba(255,255,255,0.05)', px: 1, py: 0.5, borderRadius: 1, color: binThemeTokens.gold, fontWeight: 800 }}>
                                        {String(tx.category || '').toUpperCase()}
                                    </Typography>
                                </TableCell>
                                <TableCell sx={{ fontWeight: 900, color: tx.type === 'credit' ? '#10b981' : binThemeTokens.danger }}>
                                    {tx.type === 'credit' ? '+' : '-'} {safeNumber(tx.amount)}
                                </TableCell>
                                <TableCell align="right">
                                    <Typography variant="caption" sx={{ fontWeight: 900, color: tx.status === 'settled' ? '#10b981' : binThemeTokens.gold }}>
                                        {safeText(tx.status).toUpperCase()}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </AdminPageFrame>
    );
}


import React, { useState, useEffect } from 'react';
import { 
    Box, Typography, Paper, Stack, Chip, CircularProgress, 
    Grid, alpha, Button, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { 
    DollarSign, CreditCard, Download, 
    Clock, CheckCircle2,
    Shield, TrendingUp, AlertCircle
} from 'lucide-react';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const MANAGEMENT_FEE_RATE = 0.05;

export default function OwnerFinancialsPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        totalRevenue: 0,
        netPayout: 0,
        pendingVerification: 0,
        managementFees: 0,
        maintenanceDeductions: 0
    });
    const [transactions, setTransactions] = useState<any[]>([]);

    useEffect(() => {
        if (!user?.email) return;

        const email = user.email.toLowerCase();
        
        const passportQ = query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email));
        const unsubscribePassports = onSnapshot(passportQ, (snap) => {
            let rev = 0, maint = 0, pending = 0;
            snap.docs.forEach(d => {
                const data = d.data();
                rev += Number(data.rentCollectedTotal || data.grossRentCollected || data.grossRent || 0);
                maint += Number(data.maintenanceCostTotal || data.outstandingMaintenanceInvoices || data.maintenanceDeductions || 0);
                pending += Number(data.pendingRentVerification || data.pendingVerification || 0);
            });
            
            const fees = rev * MANAGEMENT_FEE_RATE;
            setSummary({
                totalRevenue: rev,
                netPayout: Math.max(rev - fees - maint, 0),
                pendingVerification: pending,
                managementFees: fees,
                maintenanceDeductions: maint
            });
        });

        const transQ = query(collection(db, 'payouts'), where('ownerEmail', '==', email), orderBy('createdAt', 'desc'), limit(10));
        const unsubscribeTrans = onSnapshot(transQ, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });

        return () => {
            unsubscribePassports();
            unsubscribeTrans();
        };
    }, [user?.email]);

    const FINANCIAL_KPIs = [
        { label: tx('owner.fin.gross_revenue', 'Gross Revenue'), value: summary.totalRevenue, color: '#10b981', icon: <TrendingUp size={20} /> },
        { label: tx('owner.fin.net_payout', 'Net Payout'), value: summary.netPayout, color: binThemeTokens.gold, icon: <CreditCard size={20} /> },
        { label: tx('owner.fin.pending_verification', 'Pending Verification'), value: summary.pendingVerification, color: '#f59e0b', icon: <Clock size={20} /> },
        { label: tx('owner.fin.management_fees', 'Management Fees'), value: summary.managementFees, color: '#3b82f6', icon: <Shield size={20} /> },
    ];

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{tx('owner.fin.securing', 'Securing Financial Stream...')}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{tx('owner.fin.ledger_title', 'INSTITUTIONAL REVENUE LEDGER')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{tx('owner.fin.financial_sovereign', 'Financial Sovereign')}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }}>{tx('owner.fin.export_txn', 'Export TXN')}</Button>
                    <Button variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}>{tx('owner.fin.withdraw', 'Withdraw Funds')}</Button>
                </Stack>
            </Box>

            <Grid container spacing={3} sx={{ mb: 6 }}>
                {FINANCIAL_KPIs.map((kpi, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>{kpi.icon}</Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{tx('owner.fin.monthly', 'MONTHLY')}</Typography>
                            </Box>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>AED {kpi.value.toLocaleString()}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mt: 0.5 }}>{kpi.label.toUpperCase()}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden' }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Clock size={18} color={binThemeTokens.gold} /> {tx('owner.fin.transaction_history', 'TRANSACTION HISTORY')}
                            </Typography>
                        </Box>
                        {transactions.length === 0 ? (
                            <Box sx={{ py: 10, textAlign: 'center' }}>
                                <AlertCircle size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{tx('owner.fin.no_transactions', 'NO TRANSACTION RECORDS FOUND')}</Typography>
                            </Box>
                        ) : (
                            <TableContainer>
                                <Table>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.date', 'DATE / ID')}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.description', 'DESCRIPTION')}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.table.amount', 'AMOUNT')}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem' }}>{tx('fin.log.status', 'STATUS')}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.map(txn => (
                                            <TableRow key={txn.id} hover>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>{txn.date || 'Today'}</Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>#{txn.id.slice(0,8)}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>{txn.description || 'Monthly Rental Payout'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>AED {txn.amount?.toLocaleString()}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={txn.status?.toUpperCase() || 'COMPLETED'} 
                                                        size="small" 
                                                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 950, bgcolor: alpha('#10b981', 0.1), color: '#10b981' }} 
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3 }}>{tx('owner.fin.fee_architecture', 'FEE ARCHITECTURE')}</Typography>
                        <Stack spacing={2.5}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.bin_management', 'BIN GROUP Management')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>5%</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.maintenance_deductions', 'Maintenance Deductions')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>AED {summary.maintenanceDeductions.toLocaleString()}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.bank_processing', 'Bank Processing')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>0%</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 1 }}>{tx('owner.fin.next_payout', 'NEXT PROJECTED PAYOUT')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>AED {summary.netPayout.toLocaleString()}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'block' }}>{tx('owner.fin.payout_desc', 'Gross rent minus 5% management fee and maintenance deductions')}</Typography>
                            </Box>
                        </Stack>
                    </Paper>

                    <Paper sx={{ p: 3, bgcolor: alpha('#10b981', 0.03), border: `1px solid ${alpha('#10b981', 0.15)}`, borderRadius: 6 }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#10b981', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckCircle2 size={16} /> {tx('owner.fin.escrow_compliance', 'ESCROW COMPLIANCE')}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            {tx('owner.fin.escrow_desc', 'Rental collections are calculated through the owner ledger waterfall: gross rent, 5% BIN GROUP management fee, approved maintenance deductions, then net owner payout.')}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
}

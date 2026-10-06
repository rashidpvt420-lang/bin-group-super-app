import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Alert, Box, Typography, Paper, Stack, Chip, CircularProgress,
    Grid, alpha, Button, Divider,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import {
    CreditCard, Download,
    Clock, CheckCircle2,
    Shield, TrendingUp, AlertCircle, FileText, ExternalLink
} from 'lucide-react';
import { db, collection, query, where, onSnapshot } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useOwnerFinancialTruthData } from '../hooks/useOwnerFinancialTruthData';

const formatRecordedAed = (value: number) => Number(value || 0).toLocaleString('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const timestampMs = (value: any) => {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const formatInvoiceDate = (value: any) => {
    const ms = timestampMs(value);
    return ms > 0
        ? new Date(ms).toLocaleDateString('en-AE', { year: 'numeric', month: 'short', day: '2-digit' })
        : 'Pending';
};

export default function OwnerFinancialsPage() {
    const { user } = useRole();
    const { tx, isRTL } = useLanguage();
    const navigate = useNavigate();
    const [payoutsLoading, setPayoutsLoading] = useState(true);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [payoutError, setPayoutError] = useState('');
    const {
        invoices,
        summary,
        loading: truthLoading,
        error: truthError,
    } = useOwnerFinancialTruthData(user);

    useEffect(() => {
        if (!user?.email || !user?.uid) {
            setPayoutsLoading(false);
            setPayoutError('Authenticated Owner identity is unavailable. Reload the portal and try again.');
            return undefined;
        }

        setPayoutsLoading(true);
        setPayoutError('');
        const email = user.email.toLowerCase();

        // Sort the Owner-scoped result on the client. Combining where +
        // orderBy previously required a production composite index and left
        // the page on an infinite loader when that stream failed.
        const transQ = query(collection(db, 'payouts'), where('ownerEmail', '==', email));
        const unsubscribeTrans = onSnapshot(transQ, (snap) => {
            const rows = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a: any, b: any) => timestampMs(b.createdAt || b.date) - timestampMs(a.createdAt || a.date))
                .slice(0, 10);
            setTransactions(rows);
            setPayoutsLoading(false);
        }, (error) => {
            console.error('Owner payout stream failed:', error);
            setTransactions([]);
            setPayoutError('Payout history is temporarily unavailable. Onboarding invoices can still be reviewed.');
            setPayoutsLoading(false);
        });

        return () => {
            unsubscribeTrans();
        };
    }, [user?.email, user?.uid]);

    const loading = truthLoading || payoutsLoading;
    const visibleError = truthError || payoutError;
    const sortedInvoices = [...invoices].sort(
        (a, b) => timestampMs(b.issuedAt || b.createdAt) - timestampMs(a.issuedAt || a.createdAt),
    );

    const FINANCIAL_KPIs = [
        { label: tx('owner.fin.gross_revenue', 'Gross Revenue'), value: summary.totalRevenue, color: '#10b981', icon: <TrendingUp size={20} /> },
        { label: tx('owner.fin.verified_noi', 'Verified NOI'), value: summary.verifiedNoi ?? 0, color: '#38bdf8', icon: <Shield size={20} />, missing: summary.verifiedNoi === null },
        { label: tx('owner.fin.paid_invoices', 'Paid Invoices'), value: summary.paidInvoiceTotal, color: '#f59e0b', icon: <FileText size={20} /> },
        { label: tx('owner.fin.net_payout', 'Net Payout'), value: summary.netPayout, color: binThemeTokens.gold, icon: <CreditCard size={20} /> },
    ];

    if (loading) return (
        <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <CircularProgress sx={{ color: binThemeTokens.gold }} />
            <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{tx('owner.fin.securing', 'Securing Financial Stream...')}</Typography>
        </Box>
    );

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            {visibleError && (
                <Alert severity="warning" sx={{ mb: 3 }}>{visibleError}</Alert>
            )}

            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{tx('owner.fin.ledger_title', 'INSTITUTIONAL REVENUE LEDGER')}</Typography>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{tx('owner.fin.financial_sovereign', 'Financial Sovereign')}</Typography>
                </Box>
                <Stack direction="row" spacing={2}>
                    <Button variant="outlined" startIcon={<Download size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontWeight: 900, borderRadius: 3 }}>{tx('owner.fin.export_txn', 'Export TXN')}</Button>
                </Stack>
            </Box>

            <Grid container spacing={3} sx={{ mb: 6 }}>
                {FINANCIAL_KPIs.map((kpi, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <Paper sx={{ p: 3, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>{kpi.icon}</Box>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>{tx('owner.fin.recorded', 'RECORDED')}</Typography>
                            </Box>
                            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{(kpi as any).missing ? '—' : `AED ${formatRecordedAed(kpi.value)}`}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mt: 0.5 }}>{kpi.label.toUpperCase()}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            <Paper sx={{ mb: 4, bgcolor: 'rgba(15, 23, 42, 0.4)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6, overflow: 'hidden' }}>
                <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="subtitle1" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <FileText size={18} color={binThemeTokens.gold} /> {tx('owner.fin.invoices', 'ONBOARDING & SERVICE INVOICES')}
                    </Typography>
                    <Chip label={`${sortedInvoices.length} RECORD${sortedInvoices.length === 1 ? '' : 'S'}`} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
                </Box>
                {sortedInvoices.length === 0 ? (
                    <Box sx={{ py: 7, textAlign: 'center' }}>
                        <AlertCircle size={42} color="rgba(255,255,255,0.07)" style={{ margin: '0 auto 14px' }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>{tx('owner.fin.no_invoices', 'NO INVOICE RECORDS FOUND')}</Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>INVOICE</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>TYPE</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>AMOUNT</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900 }}>DOCUMENTS</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {sortedInvoices.map(invoice => (
                                    <TableRow key={invoice.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{invoice.invoiceId || invoice.id}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{formatInvoiceDate(invoice.issuedAt || invoice.createdAt)}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{String(invoice.feeType || invoice.type || 'SERVICE_INVOICE').replace(/_/g, ' ')}</TableCell>
                                        <TableCell sx={{ color: '#FFF', fontWeight: 900 }}>{invoice.currency || 'AED'} {Number(invoice.amount || invoice.amountPaid || 0).toLocaleString()}</TableCell>
                                        <TableCell><Chip label={String(invoice.status || 'PENDING').toUpperCase()} size="small" sx={{ bgcolor: alpha(invoice.status === 'PAID' ? '#10b981' : '#f59e0b', 0.12), color: invoice.status === 'PAID' ? '#10b981' : '#f59e0b', fontWeight: 950 }} /></TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Button
                                                    size="small"
                                                    startIcon={<ExternalLink size={14} />}
                                                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                                                    sx={{ color: binThemeTokens.gold, fontWeight: 900 }}
                                                >
                                                    Open
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<Download size={14} />}
                                                    disabled={!invoice.pdfUrl}
                                                    onClick={() => invoice.pdfUrl && window.open(invoice.pdfUrl, '_blank', 'noopener,noreferrer')}
                                                    sx={{ color: '#FFF', fontWeight: 800 }}
                                                >
                                                    Invoice
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<Shield size={14} />}
                                                    disabled={!invoice.receiptPdfUrl}
                                                    onClick={() => invoice.receiptPdfUrl && window.open(invoice.receiptPdfUrl, '_blank', 'noopener,noreferrer')}
                                                    sx={{ color: invoice.receiptPdfUrl ? '#10b981' : 'rgba(255,255,255,0.25)', fontWeight: 800 }}
                                                >
                                                    Receipt
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

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
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.management_fees', 'Management Fees')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>AED {formatRecordedAed(summary.managementFees)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.pending_verification', 'Pending Verification')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>AED {formatRecordedAed(summary.pendingVerification)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.maintenance_deductions', 'Maintenance Deductions')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>AED {formatRecordedAed(summary.maintenanceDeductions)}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>{tx('owner.fin.bank_processing', 'Bank Processing')}</Typography>
                                <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>0%</Typography>
                            </Box>
                            <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                            <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 3, border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}` }}>
                                <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900, display: 'block', mb: 1 }}>{tx('owner.fin.next_payout', 'NEXT PROJECTED PAYOUT')}</Typography>
                                <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>AED {summary.netPayout.toLocaleString()}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', mt: 1, display: 'block' }}>{tx('owner.fin.payout_desc', 'Gross rent minus 5% management fee and maintenance deductions, then net owner payout.')}</Typography>
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

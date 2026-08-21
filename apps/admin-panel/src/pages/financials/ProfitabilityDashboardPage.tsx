import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, CircularProgress, Container, Grid, LinearProgress,
    Paper, Stack, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, alpha
} from '@mui/material';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

type LedgerTransaction = {
    id: string;
    amount?: number;
    type?: string;
    category?: string;
    description?: string;
    status?: string;
    propertyId?: string;
    propertyName?: string;
    assetId?: string;
    assetName?: string;
    createdAt?: any;
};

type ContractRecord = {
    id: string;
    status?: string;
    activationStatus?: string;
    annualContractValue?: number;
    annualFee?: number;
    quote?: any;
    quoteSnapshot?: any;
    billingSummary?: any;
    paymentSchedule?: any;
};

const normalize = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
const money = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const annualContractValue = (contract: ContractRecord) => money(
    contract.quoteSnapshot?.annualContractValue ??
    contract.paymentSchedule?.annualContractValue ??
    contract.billingSummary?.annualContractValue ??
    contract.quote?.annualTotal ??
    contract.annualContractValue ??
    contract.annualFee
);

const isActiveContract = (contract: ContractRecord) => [
    'ACTIVE', 'ACTIVATED', 'APPROVED', 'SIGNED'
].includes(normalize(contract.status || contract.activationStatus));

export default function ProfitabilityDashboardPage() {
    const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
    const [contracts, setContracts] = useState<ContractRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [errors, setErrors] = useState<string[]>([]);

    useEffect(() => {
        let transactionReady = false;
        let contractReady = false;
        const finishLoading = () => {
            if (transactionReady && contractReady) setLoading(false);
        };
        const setSourceError = (source: string, message: string) => {
            setErrors((current) => [...current.filter((item) => !item.startsWith(`${source}:`)), `${source}: ${message}`]);
        };
        const clearSourceError = (source: string) => {
            setErrors((current) => current.filter((item) => !item.startsWith(`${source}:`)));
        };

        const unsubTransactions = onSnapshot(
            query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500)),
            (snapshot) => {
                setTransactions(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as LedgerTransaction)));
                clearSourceError('Ledger');
                transactionReady = true;
                finishLoading();
            },
            (error) => {
                console.error('[ProfitabilityDashboard] transaction feed failed:', error);
                setTransactions([]);
                setSourceError('Ledger', 'Live transaction records could not be loaded. Financial KPIs are unavailable.');
                transactionReady = true;
                finishLoading();
            },
        );

        const unsubContracts = onSnapshot(
            query(collection(db, 'contracts'), limit(500)),
            (snapshot) => {
                setContracts(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as ContractRecord)));
                clearSourceError('Contracts');
                contractReady = true;
                finishLoading();
            },
            (error) => {
                console.error('[ProfitabilityDashboard] contract feed failed:', error);
                setContracts([]);
                setSourceError('Contracts', 'Live contract records could not be loaded. ARR and MRR are unavailable.');
                contractReady = true;
                finishLoading();
            },
        );

        return () => {
            unsubTransactions();
            unsubContracts();
        };
    }, []);

    const financials = useMemo(() => {
        const credits = transactions.filter((tx) => normalize(tx.type) === 'CREDIT');
        const debits = transactions.filter((tx) => normalize(tx.type) === 'DEBIT');
        const totalRevenue = credits.reduce((sum, tx) => sum + money(tx.amount), 0);
        const expenses = debits.reduce((sum, tx) => sum + money(tx.amount), 0);
        const netProfit = totalRevenue - expenses;
        const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null;

        const activeContracts = contracts.filter(isActiveContract);
        const arr = activeContracts.reduce((sum, contract) => sum + annualContractValue(contract), 0);
        const mrr = arr > 0 ? arr / 12 : 0;

        const assets = new Map<string, { name: string; revenue: number; opex: number }>();
        transactions.forEach((tx) => {
            const key = String(tx.propertyId || tx.assetId || tx.propertyName || tx.assetName || '').trim();
            if (!key) return;
            const name = String(tx.propertyName || tx.assetName || tx.propertyId || tx.assetId || 'Property not recorded');
            const row = assets.get(key) || { name, revenue: 0, opex: 0 };
            if (normalize(tx.type) === 'CREDIT') row.revenue += money(tx.amount);
            if (normalize(tx.type) === 'DEBIT') row.opex += money(tx.amount);
            assets.set(key, row);
        });

        const propertyRows = [...assets.values()]
            .sort((a, b) => (b.revenue - b.opex) - (a.revenue - a.opex))
            .slice(0, 20);

        const categories = new Map<string, number>();
        debits.forEach((tx) => {
            const category = String(tx.category || 'Uncategorized').trim() || 'Uncategorized';
            categories.set(category, (categories.get(category) || 0) + money(tx.amount));
        });
        const expenseBreakdown = [...categories.entries()]
            .map(([label, amount]) => ({ label, amount }))
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 10);

        return {
            totalRevenue,
            expenses,
            netProfit,
            margin,
            arr,
            mrr,
            activeContracts: activeContracts.length,
            propertyRows,
            expenseBreakdown,
        };
    }, [contracts, transactions]);

    if (loading) {
        return (
            <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress sx={{ color: binThemeTokens.gold }} />
            </Box>
        );
    }

    const ledgerUnavailable = errors.some((item) => item.startsWith('Ledger:'));
    const contractsUnavailable = errors.some((item) => item.startsWith('Contracts:'));

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>ADMIN FINANCIALS</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">Revenue <Box component="span" sx={{ color: binThemeTokens.gold }}>Command Center</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    Live ledger and contract analysis. No profitability value is estimated when its source record is unavailable.
                </Typography>
            </Box>

            {errors.length > 0 && (
                <Stack spacing={1} sx={{ mb: 4 }}>
                    {errors.map((error) => <Alert severity="error" key={error}>{error}</Alert>)}
                </Stack>
            )}

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">LEDGER REVENUE</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">
                            {ledgerUnavailable ? 'N/A' : `AED ${financials.totalRevenue.toLocaleString()}`}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">From {transactions.filter((tx) => normalize(tx.type) === 'CREDIT').length} credit entries</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">ACTIVE CONTRACT MRR / ARR</Typography>
                        <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>
                            {contractsUnavailable ? 'N/A' : `AED ${financials.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                            {contractsUnavailable ? 'ARR unavailable' : `ARR: AED ${financials.arr.toLocaleString()} · ${financials.activeContracts} contracts`}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">LEDGER NET POSITION</Typography>
                        <Typography variant="h4" fontWeight="950" color={financials.netProfit >= 0 ? '#10b981' : '#ef4444'}>
                            {ledgerUnavailable ? 'N/A' : `AED ${financials.netProfit.toLocaleString()}`}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                            {ledgerUnavailable || financials.margin === null ? 'Margin: N/A' : `Margin: ${financials.margin.toFixed(1)}%`}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid rgba(239,68,68,0.2)' }}>
                        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900 }}>LEDGER EXPENSES</Typography>
                        <Typography variant="h4" fontWeight="950" color="#ef4444">
                            {ledgerUnavailable ? 'N/A' : `AED ${financials.expenses.toLocaleString()}`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#ef4444' }}>From {transactions.filter((tx) => normalize(tx.type) === 'DEBIT').length} debit entries</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>Profit by Recorded Asset Node</Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PROPERTY</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>REVENUE</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>OPEX</TableCell>
                                        <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="right">NET</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {ledgerUnavailable || financials.propertyRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ color: 'rgba(255,255,255,0.5)', py: 5, borderBottom: 'none' }}>
                                                {ledgerUnavailable ? 'Asset profitability is unavailable because the ledger could not be read.' : 'No ledger entries contain a property or asset identifier yet.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : financials.propertyRows.map((row) => {
                                        const profit = row.revenue - row.opex;
                                        return (
                                            <TableRow key={row.name}>
                                                <TableCell sx={{ color: '#FFF', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{row.name}</TableCell>
                                                <TableCell sx={{ color: '#FFF', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>AED {row.revenue.toLocaleString()}</TableCell>
                                                <TableCell sx={{ color: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>AED {row.opex.toLocaleString()}</TableCell>
                                                <TableCell sx={{ color: profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="right">AED {profit.toLocaleString()}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 4 }}>Expense Breakdown</Typography>
                        {ledgerUnavailable || financials.expenseBreakdown.length === 0 ? (
                            <Typography variant="body2" color="textSecondary">
                                {ledgerUnavailable ? 'Expense categories are unavailable because the ledger could not be read.' : 'No debit expense entries are recorded yet.'}
                            </Typography>
                        ) : (
                            <Stack spacing={3}>
                                {financials.expenseBreakdown.map((expense) => (
                                    <Box key={expense.label}>
                                        <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ mb: 1 }}>
                                            <Typography variant="caption" color="textSecondary">{expense.label.toUpperCase()}</Typography>
                                            <Typography variant="caption" fontWeight="900" color="#FFF">AED {expense.amount.toLocaleString()}</Typography>
                                        </Stack>
                                        <LinearProgress
                                            variant="determinate"
                                            value={financials.expenses > 0 ? Math.min(100, (expense.amount / financials.expenses) * 100) : 0}
                                            sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }}
                                        />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    );
}

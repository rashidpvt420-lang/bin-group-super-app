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
const finiteMoney = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const annualContractValue = (contract: ContractRecord): number | null => finiteMoney(
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

function moneyLabel(value: number | null) {
    return value === null ? 'N/A' : `AED ${value.toLocaleString()}`;
}

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
        const relevantLedgerRows = [...credits, ...debits];
        const ledgerComplete = relevantLedgerRows.every((tx) => finiteMoney(tx.amount) !== null);

        const totalRevenue = ledgerComplete
            ? credits.reduce((sum, tx) => sum + (finiteMoney(tx.amount) as number), 0)
            : null;
        const expenses = ledgerComplete
            ? debits.reduce((sum, tx) => sum + (finiteMoney(tx.amount) as number), 0)
            : null;
        const netProfit = totalRevenue !== null && expenses !== null ? totalRevenue - expenses : null;
        const margin = totalRevenue !== null && netProfit !== null && totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : null;

        const activeContracts = contracts.filter(isActiveContract);
        const contractValues = activeContracts.map(annualContractValue).filter((value): value is number => value !== null);
        const contractValuesComplete = contractValues.length === activeContracts.length;
        const arr = contractValuesComplete ? contractValues.reduce((sum, value) => sum + value, 0) : null;
        const mrr = arr === null ? null : arr / 12;

        const assets = new Map<string, { name: string; revenue: number; opex: number }>();
        if (ledgerComplete) {
            transactions.forEach((tx) => {
                const value = finiteMoney(tx.amount);
                if (value === null) return;
                const key = String(tx.propertyId || tx.assetId || tx.propertyName || tx.assetName || '').trim();
                if (!key) return;
                const name = String(tx.propertyName || tx.assetName || tx.propertyId || tx.assetId || 'Property not recorded');
                const row = assets.get(key) || { name, revenue: 0, opex: 0 };
                if (normalize(tx.type) === 'CREDIT') row.revenue += value;
                if (normalize(tx.type) === 'DEBIT') row.opex += value;
                assets.set(key, row);
            });
        }

        const propertyRows = [...assets.values()]
            .sort((a, b) => (b.revenue - b.opex) - (a.revenue - a.opex))
            .slice(0, 20);

        const categories = new Map<string, number>();
        if (ledgerComplete) {
            debits.forEach((tx) => {
                const value = finiteMoney(tx.amount);
                if (value === null) return;
                const category = String(tx.category || 'Uncategorized').trim() || 'Uncategorized';
                categories.set(category, (categories.get(category) || 0) + value);
            });
        }
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
            recordedContractValues: contractValues.length,
            ledgerComplete,
            propertyRows,
            expenseBreakdown,
            creditCount: credits.length,
            debitCount: debits.length,
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
    const ledgerIncomplete = !ledgerUnavailable && !financials.ledgerComplete;
    const contractValuesIncomplete = !contractsUnavailable && financials.arr === null;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>ADMIN FINANCIALS</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">Revenue <Box component="span" sx={{ color: binThemeTokens.gold }}>Command Center</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">
                    Live ledger and contract analysis. Missing amounts invalidate dependent aggregates instead of becoming zero.
                </Typography>
            </Box>

            {(errors.length > 0 || ledgerIncomplete || contractValuesIncomplete) && (
                <Stack spacing={1} sx={{ mb: 4 }}>
                    {errors.map((error) => <Alert severity="error" key={error}>{error}</Alert>)}
                    {ledgerIncomplete && <Alert severity="warning">One or more credit/debit ledger records have no valid amount. Revenue, expenses, net position and property profitability remain N/A.</Alert>}
                    {contractValuesIncomplete && <Alert severity="warning">Only {financials.recordedContractValues} of {financials.activeContracts} active contracts have a recorded annual value. ARR and MRR remain N/A.</Alert>}
                </Stack>
            )}

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">LEDGER REVENUE</Typography>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{ledgerUnavailable ? 'N/A' : moneyLabel(financials.totalRevenue)}</Typography>
                        <Typography variant="caption" color="textSecondary">From {financials.creditCount} credit entries</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">ACTIVE CONTRACT MRR / ARR</Typography>
                        <Typography variant="h4" fontWeight="950" color={binThemeTokens.gold}>
                            {contractsUnavailable ? 'N/A' : financials.mrr === null ? 'N/A' : `AED ${financials.mrr.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                            {contractsUnavailable || financials.arr === null ? 'ARR: N/A' : `ARR: AED ${financials.arr.toLocaleString()} · ${financials.activeContracts} contracts`}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="caption" color="textSecondary">LEDGER NET POSITION</Typography>
                        <Typography variant="h4" fontWeight="950" color={financials.netProfit !== null && financials.netProfit < 0 ? '#ef4444' : '#10b981'}>
                            {ledgerUnavailable ? 'N/A' : moneyLabel(financials.netProfit)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                            {ledgerUnavailable || financials.margin === null ? 'Margin: N/A' : `Margin: ${financials.margin.toFixed(1)}%`}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha('#ef4444', 0.05), border: '1px solid rgba(239,68,68,0.2)' }}>
                        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900 }}>LEDGER EXPENSES</Typography>
                        <Typography variant="h4" fontWeight="950" color="#ef4444">{ledgerUnavailable ? 'N/A' : moneyLabel(financials.expenses)}</Typography>
                        <Typography variant="caption" sx={{ color: '#ef4444' }}>From {financials.debitCount} debit entries</Typography>
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
                                    {ledgerUnavailable || ledgerIncomplete || financials.propertyRows.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ color: 'rgba(255,255,255,0.5)', py: 5, borderBottom: 'none' }}>
                                                {ledgerUnavailable ? 'Asset profitability is unavailable because the ledger could not be read.' : ledgerIncomplete ? 'Asset profitability is unavailable because one or more ledger amounts are missing.' : 'No ledger entries contain a property or asset identifier yet.'}
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
                        {ledgerUnavailable || ledgerIncomplete || financials.expenseBreakdown.length === 0 ? (
                            <Typography variant="body2" color="textSecondary">
                                {ledgerUnavailable ? 'Expense categories are unavailable because the ledger could not be read.' : ledgerIncomplete ? 'Expense categories are unavailable because one or more ledger amounts are missing.' : 'No debit expense entries are recorded yet.'}
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
                                            value={financials.expenses !== null && financials.expenses > 0 ? Math.min(100, (expense.amount / financials.expenses) * 100) : 0}
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
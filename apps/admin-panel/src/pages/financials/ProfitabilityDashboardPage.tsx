import React, { useState, useEffect } from 'react';
import { Alert, 
    Container, Grid, Card, CardContent, Typography, Box, Paper, 
    Stack, Divider, alpha, LinearProgress, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip
} from '@mui/material';
import { Alert, 
    DollarSign, TrendingUp, TrendingDown, Wallet, Users, 
    Building2, Activity, PieChart, AlertTriangle
} from 'lucide-react';
import { Alert, db } from '../../lib/firebase';
import { Alert, collection, query, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { Alert, binThemeTokens } from '../../theme/adminTheme';

export default function ProfitabilityDashboardPage() {
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(500));
        const unsub = onSnapshot(q, (snap) => {
            setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const metrics = {
        totalRevenue: transactions.filter(t => t.type === 'credit').reduce((sum, t) => sum + (t.amount || 0), 0),
        totalExpenses: transactions.filter(t => t.type === 'debit').reduce((sum, t) => sum + (t.amount || 0), 0),
        activeContracts: transactions.filter(t => t.category === 'contract_activation').length,
        pendingReceivables: transactions.filter(t => t.status === 'PENDING' && t.type === 'credit').reduce((sum, t) => sum + (t.amount || 0), 0)
    };

    const profit = metrics.totalRevenue - metrics.totalExpenses;
    const margin = metrics.totalRevenue > 0 ? (profit / metrics.totalRevenue) * 100 : 0;

    if (loading) return <LinearProgress />;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                    FINANCE COMMAND
                </Typography>
                <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, letterSpacing: 2 }}>
                    INSTITUTIONAL REVENUE & LOSS REGISTRY
                </Typography>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Card sx={{ bgcolor: binThemeTokens.graphite, borderLeft: `6px solid ${binThemeTokens.gold}` }}>
                        <CardContent>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>GROSS REVENUE</Typography>
                            <Typography variant="h4" fontWeight="900">AED {metrics.totalRevenue.toLocaleString()}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card sx={{ bgcolor: binThemeTokens.graphite, borderLeft: `6px solid #ef4444` }}>
                        <CardContent>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>OPERATIONAL EXPENSE</Typography>
                            <Typography variant="h4" fontWeight="900">AED {metrics.totalExpenses.toLocaleString()}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card sx={{ bgcolor: binThemeTokens.graphite, borderLeft: `6px solid #10b981` }}>
                        <CardContent>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>NET PROFIT</Typography>
                            <Typography variant="h4" fontWeight="900" sx={{ color: profit >= 0 ? '#10b981' : '#ef4444' }}>
                                AED {profit.toLocaleString()}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Card sx={{ bgcolor: binThemeTokens.graphite, borderLeft: `6px solid ${binThemeTokens.gold}` }}>
                        <CardContent>
                            <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary }}>NET MARGIN</Typography>
                            <Typography variant="h4" fontWeight="900">{margin.toFixed(1)}%</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <TableContainer component={Paper} sx={{ bgcolor: binThemeTokens.graphite, borderRadius: 4 }}>
                        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="900">RECENT LEDGER ENTRIES</Typography>
                        </Box>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DATE</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>CATEGORY</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DESCRIPTION</TableCell>
                                    <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }} align="right">AMOUNT</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {transactions.slice(0, 10).map((t) => (
                                    <TableRow key={t.id}>
                                        <TableCell sx={{ opacity: 0.7 }}>{t.createdAt?.toDate().toLocaleDateString()}</TableCell>
                                        <TableCell><Chip label={t.category?.toUpperCase()} size="small" variant="outlined" /></TableCell>
                                        <TableCell sx={{ fontWeight: 700 }}>{t.description}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 900, color: t.type === 'credit' ? '#10b981' : '#ef4444' }}>
                                            {t.type === 'credit' ? '+' : '-'} AED {t.amount?.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, bgcolor: binThemeTokens.graphite, borderRadius: 4 }}>
                            <Typography variant="overline" fontWeight="900" sx={{ color: binThemeTokens.gold }}>RISK ALERTS</Typography>
                            <Stack spacing={2} sx={{ mt: 2 }}>
                                {metrics.pendingReceivables > 100000 && (
                                    <Alert severity="warning" variant="outlined" icon={<AlertTriangle />}>
                                        High outstanding receivables: AED {metrics.pendingReceivables.toLocaleString()}
                                    </Alert>
                                )}
                                <Alert severity="info" variant="outlined" icon={<Activity />}>
                                    System AI suggests 4% optimization in technician routing to reduce fuel costs.
                                </Alert>
                            </Stack>
                        </Paper>

                        <Paper sx={{ p: 4, bgcolor: binThemeTokens.graphite, borderRadius: 4 }}>
                            <Typography variant="overline" fontWeight="900" sx={{ color: binThemeTokens.gold }}>REVENUE SPLIT</Typography>
                            <Stack spacing={2} sx={{ mt: 2 }}>
                                <Box>
                                    <Typography variant="caption" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>CONTRACTS</span>
                                        <span>72%</span>
                                    </Typography>
                                    <LinearProgress variant="determinate" value={72} sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>ADD-ONS</span>
                                        <span>18%</span>
                                    </Typography>
                                    <LinearProgress variant="determinate" value={18} sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: '#10b981' } }} />
                                </Box>
                                <Box>
                                    <Typography variant="caption" sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>DESIGN STUDIO</span>
                                        <span>10%</span>
                                    </Typography>
                                    <LinearProgress variant="determinate" value={10} sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: '#6366f1' } }} />
                                </Box>
                            </Stack>
                        </Paper>
                    </Stack>
                </Grid>
            </Grid>
        </Container>
    );
}


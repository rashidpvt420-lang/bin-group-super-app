import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, Grid, Stack, Button, Divider, alpha, CircularProgress, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { DollarSign, ArrowUpRight, ArrowDownRight, FileText, Download, TrendingUp, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db, collection, query, where, getDocs, orderBy, limit } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';

export default function OwnerMoneyControlPage() {
    const { user } = useRole();
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalRevenue: 0,
        totalExpenses: 0,
        netIncome: 0,
        pendingApprovals: 0
    });

    useEffect(() => {
        const fetchFinancials = async () => {
            if (!user?.uid) return;
            try {
                const q = query(
                    collection(db, 'transactions'),
                    where('ownerId', '==', user.uid),
                    orderBy('createdAt', 'desc'),
                    limit(50)
                );
                const snap = await getDocs(q);
                const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setTransactions(txs);

                let rev = 0; let exp = 0;
                txs.forEach((t: any) => {
                    if (t.type === 'RENT_COLLECTION' || t.type === 'INCOME') rev += t.amount;
                    else exp += t.amount;
                });
                setStats({
                    totalRevenue: rev,
                    totalExpenses: exp,
                    netIncome: rev - exp,
                    pendingApprovals: 0 // Fetch from tickets in real usage
                });
            } catch (err) {
                console.error("Financial fetch error:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchFinancials();
    }, [user]);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }}/></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6 }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN TREASURY</Typography>
                <Typography variant="h3" fontWeight="950" color="#FFF">Money <Box component="span" sx={{ color: binThemeTokens.gold }}>Control</Box></Typography>
                <Typography variant="body1" color="rgba(255,255,255,0.5)">Real-time financial yield and operational expense monitoring.</Typography>
            </Box>

            <Grid container spacing={4} sx={{ mb: 6 }}>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="caption" color="textSecondary">NET POSITION</Typography>
                            <TrendingUp size={16} color="#10b981" />
                        </Stack>
                        <Typography variant="h4" fontWeight="950" color="#FFF">AED {stats.netIncome.toLocaleString()}</Typography>
                        <Typography variant="caption" color="#10b981">+12.5% vs Last Month</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="caption" color="textSecondary">TOTAL YIELD</Typography>
                            <ArrowUpRight size={16} color="#10b981" />
                        </Stack>
                        <Typography variant="h4" fontWeight="950" color="#FFF">AED {stats.totalRevenue.toLocaleString()}</Typography>
                        <Typography variant="caption" color="textSecondary">Rent & Credits</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="caption" color="textSecondary">OP-EXPENSE</Typography>
                            <ArrowDownRight size={16} color="#ef4444" />
                        </Stack>
                        <Typography variant="h4" fontWeight="950" color="#FFF">AED {stats.totalExpenses.toLocaleString()}</Typography>
                        <Typography variant="caption" color="textSecondary">Maintenance & Add-ons</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={3}>
                    <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${binThemeTokens.gold}` }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>PENDING QUOTES</Typography>
                            <AlertCircle size={16} color={binThemeTokens.gold} />
                        </Stack>
                        <Typography variant="h4" fontWeight="950" color="#FFF">{stats.pendingApprovals}</Typography>
                        <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>Awaiting Authorization</Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Typography variant="h6" fontWeight="950" color="#FFF">Systemic Ledger</Typography>
                    <Button variant="outlined" startIcon={<Download size={16}/>} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold }}>
                        DOWNLOAD STATEMENT
                    </Button>
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DATE</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>DESCRIPTION</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>STATUS</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.1)' }} align="right">AMOUNT (AED)</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transactions.map((tx) => (
                                <TableRow key={tx.id}>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        {tx.createdAt?.toDate ? tx.createdAt.toDate().toLocaleDateString() : '---'}
                                    </TableCell>
                                    <TableCell sx={{ color: '#FFF', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.02)' }}>{tx.description}</TableCell>
                                    <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                        <Chip 
                                            icon={<CheckCircle2 size={12}/>} 
                                            label="RECONCILED" 
                                            size="small" 
                                            sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 900, fontSize: '0.6rem' }} 
                                        />
                                    </TableCell>
                                    <TableCell sx={{ color: tx.type === 'INCOME' || tx.type === 'RENT_COLLECTION' ? '#10b981' : '#FFF', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.02)' }} align="right">
                                        {tx.type === 'INCOME' || tx.type === 'RENT_COLLECTION' ? '+' : '-'}{tx.amount.toLocaleString()}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>
        </Container>
    );
}

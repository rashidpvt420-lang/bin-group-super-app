// owner-app/src/pages/FinancialDashboardPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Card, CardContent, Typography, Box, Button,
  Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, Divider, Stack, CircularProgress,
    useTheme,
    useMediaQuery,
    Snackbar,
    Alert
} from '@mui/material';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { binThemeTokens } from '../theme/binGroupTheme';
import {
    Download,
    ArrowUpCircle,
    TrendingUp,
    ShieldCheck,
    Landmark,
    TrendingDown,
    ArrowRight,
    Wallet
} from 'lucide-react';
import { db, collection, query, where, orderBy, limit, getDocs } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { fetchPortfolioAggregation } from '../utils/portfolioAggregationEngine';
import { calculateAnnualYieldMetrics } from '../utils/annualYieldEngine';

interface Transaction {
    id: string;
    type: 'credit' | 'debit';
    amount: number;
    date?: string;
    status?: string;
}

interface PortfolioContract {
    annualContractValue: number;
    // add other fields if needed
}

export default function FinancialDashboardPage() {
  const { user, godMode } = useRole();
  const [financials, setFinancials] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'info' }>({ open: false, message: '', severity: 'info' });

  const handleCloseSnackbar = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbar({ ...snackbar, open: false });
  };

  useEffect(() => {
    if (!user) return;

    const fetchFinancialData = async () => {
        try {
            // Fetch Portfolio via Aggregation Engine
            const portfolio = await fetchPortfolioAggregation(user.uid, godMode);
            const yieldMetrics = calculateAnnualYieldMetrics(portfolio);
            
            setTransactions(portfolio.transactions as Transaction[]);

            // Group daily transactions for the trend chart
            const last7Days = [...Array(7)].map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                return d.toISOString().split('T')[0];
            });

            const dailyTrend = last7Days.map(date => {
                const dayTxs = portfolio.transactions.filter(t => t.date === date);
                const collected = dayTxs.filter(t => t.type === 'credit').reduce((s, t) => s + (t.amount || 0), 0);
                const deducted = dayTxs.filter(t => t.type === 'debit').reduce((s, t) => s + (t.amount || 0), 0);
                return {
                    date: date.split('-').slice(1).join('/'),
                    collected,
                    deducted,
                    netPayout: collected - deducted
                };
            });

            // Aggregation for Dashboard UI
            setFinancials({
                totalRentCollected: yieldMetrics.totalCollected,
                breakdown: {
                    binGroupFee: yieldMetrics.grossContractValue * 0.05,
                    maintenanceInvoices: yieldMetrics.totalMaintenanceCosts,
                    turnoverCosts: portfolio.transactions
                        .filter(t => t.category === 'turnover')
                        .reduce((sum, t) => sum + (t.amount || 0), 0)
                },
                netPayout: yieldMetrics.netIncome,
                pendingPayments: yieldMetrics.grossContractValue - yieldMetrics.totalCollected,
                overdueAmount: 0,
                dailyTrend
            });

        } catch (err) {
            console.error("Financial sync error:", err);
        } finally {
            setLoading(false);
        }
    };

    fetchFinancialData();
  }, [user]);

  const handleExportCSV = () => {
    if (!financials) return;
    const csv = [
      ['Financial Summary'],
      ['Total Rent Collected', financials.totalRentCollected],
      ['BIN Group Fee', financials.breakdown.binGroupFee],
      ['Maintenance Invoices', financials.breakdown.maintenanceInvoices],
      ['Net Payout', financials.netPayout],
    ].map((row) => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bin-audit-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    setSnackbar({ open: true, message: 'Institutional Audit Ledger exported to CSV.', severity: 'success' });
  };

  const handleBridgeActivation = () => {
    setSnackbar({ open: true, message: 'Institutional Bridge Status: Connection pending final banking partner authorization.', severity: 'info' });
  };

  if (loading) {
    return (
        <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#000' }}>
            <CircularProgress color="inherit" sx={{ color: binThemeTokens.gold }} />
        </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Box sx={{ 
        display: 'flex', 
        flexDirection: { xs: 'column', md: 'row' }, 
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', md: 'center' }, 
        mb: 8, gap: 4 
      }}>
        <Box>
            <Typography variant="h3" fontWeight="900" sx={{ color: binThemeTokens.gold, letterSpacing: -1, fontSize: { xs: '2.4rem', md: '3rem' } }}>Financial Ledger</Typography>
            <Typography variant="body1" sx={{ color: binThemeTokens.textSecondary, fontWeight: 600 }}>Institutional yield auditing and sovereign liquidity gateways.</Typography>
        </Box>
        <Button 
            variant="outlined" 
            fullWidth={!!(typeof window !== 'undefined' && window.innerWidth < 600)}
            onClick={handleExportCSV}
            startIcon={<Download size={20} />}
            sx={{ 
                color: binThemeTokens.gold, 
                borderColor: binThemeTokens.gold, 
                px: 4, py: 2, 
                fontWeight: 900, 
                borderRadius: 3,
                minWidth: { xs: '100%', md: 'auto' },
                '&:hover': { bgcolor: 'rgba(198,167,94,0.05)', borderColor: binThemeTokens.goldLight }
            }}
        >
          EXPORT AUDIT
        </Button>
      </Box>

      {/* KPI Cards */}
      <Grid container spacing={4} sx={{ mb: 8 }}>
        {[
            { label: 'TOTAL ASSET COLLECTION', val: financials.totalRentCollected, color: binThemeTokens.textPrimary, icon: <Wallet size={20} /> },
            { label: 'SOVEREIGN PAYOUT', val: financials.netPayout, color: binThemeTokens.gold, icon: <ShieldCheck size={20} /> },
            { label: 'PENDING LIQUIDITY', val: financials.pendingPayments, color: binThemeTokens.goldLight, icon: <Landmark size={20} /> },
            { label: 'OVERDUE DEFICIT', val: financials.overdueAmount, color: '#ff4d4d', icon: <TrendingUp size={20} /> },
        ].map((kpi, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
                <Card sx={{ 
                    bgcolor: 'rgba(22, 22, 24, 0.7)', 
                    p: 1.5, 
                    borderRadius: 6, 
                    border: '1px solid rgba(198, 167, 94, 0.15)',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                }}>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                            <Box sx={{ color: kpi.color }}>{kpi.icon}</Box>
                        </Box>
                        <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, display: 'block', mb: 1, letterSpacing: 1.5 }}>{kpi.label}</Typography>
                        <Typography variant="h4" fontWeight="900" sx={{ color: kpi.color }}>AED {kpi.val.toLocaleString()}</Typography>
                    </CardContent>
                </Card>
            </Grid>
        ))}
      </Grid>

      <Grid container spacing={6}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ 
              p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', 
              border: '1px solid rgba(255,255,255,0.05)', mb: 4
          }}>
            <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.gold, letterSpacing: 1 }}>DEDUCTIONS BREAKDOWN</Typography>
            <Stack spacing={4} divider={<Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}>
                {[
                    { label: 'BIN-GROUP MANAGEMENT FEE (5%)', desc: 'Institutional oversight and service guarantee.', val: financials.breakdown.binGroupFee },
                    { label: 'MAINTENANCE INVOICES (OFFSET)', desc: 'Non-contractual mission repairs and parts.', val: financials.breakdown.maintenanceInvoices },
                    { label: 'TURNOVER ENGINE COSTS', desc: 'Deep-clean and asset restoration cycles.', val: financials.breakdown.turnoverCosts }
                ].map((row, i) => (
                    <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>{row.label}</Typography>
                            <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{row.desc}</Typography>
                        </Box>
                        <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.textPrimary }}>
                        AED {Math.abs(row.val).toLocaleString()}
                        </Typography>
                    </Box>
                ))}
            </Stack>

            <Box sx={{ mt: 6, p: 3, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.05)', border: '1px solid rgba(198,167,94,0.1)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" fontWeight="900" sx={{ color: binThemeTokens.gold }}>TOTAL INSTITUTIONAL DEDUCTIONS</Typography>
                <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.goldLight }}>
                  AED {(Object.values(financials.breakdown) as number[]).reduce((a, b) => a + b, 0).toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </Paper>

          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)' }}>
            <Typography variant="h6" fontWeight="900" sx={{ mb: 4, color: binThemeTokens.gold, letterSpacing: 1 }}>COLLECTION TRENDS</Typography>
            <Box sx={{ height: { xs: 250, md: 350 }, width: '100%' }}>
                <ResponsiveContainer>
                    <BarChart data={financials.dailyTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="date" stroke={binThemeTokens.textSecondary} fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke={binThemeTokens.textSecondary} fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `AED ${value/1000}k`} />
                        <Tooltip contentStyle={{ backgroundColor: '#161618', border: '1px solid rgba(198,167,94,0.2)', borderRadius: 12, color: '#fff' }} />
                        <Bar dataKey="collected" fill="url(#goldGradient)" radius={[4, 4, 0, 0]} />
                        <defs>
                            <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#E6C77A" stopOpacity={1}/><stop offset="100%" stopColor="#C6A75E" stopOpacity={0.8}/>
                            </linearGradient>
                        </defs>
                    </BarChart>
                </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ 
              p: { xs: 4, md: 6 }, borderRadius: 8, bgcolor: '#0B0B0C', 
              border: `2px solid ${binThemeTokens.gold}`, 
              background: 'radial-gradient(circle at top right, #161618 0%, #0B0B0C 100%)',
              position: { xs: 'static', md: 'sticky' }, top: 120, textAlign: 'center',
              mt: { xs: 4, md: 0 }
          }}>
            <Box sx={{ width: 60, height: 60, borderRadius: '50%', bgcolor: 'rgba(198,167,94,0.1)', mx: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <Landmark color={binThemeTokens.gold} size={28} />
            </Box>
            <Typography variant="h4" fontWeight="900" sx={{ color: binThemeTokens.gold, mb: 2 }}>ANNUAL ADVANCE</Typography>
            <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary, mb: 4, lineHeight: 1.8 }}>
              Unlock your **Full Year's Portfolio Liquidity** instantly. Zero-wait interface to institutional banking bridges.
            </Typography>
            <Button
              variant="contained" fullWidth
              sx={{ background: 'linear-gradient(135deg, #C6A75E, #E6C77A)', color: '#0B0B0C', py: 2.5, fontWeight: 900 }}
              onClick={handleBridgeActivation} 
            >ACTIVATE LIQUIDITY BRIDGE</Button>
          </Paper>
        </Grid>
      </Grid>

      <Box sx={{ mt: 10 }}>
        <Typography variant="h5" sx={{ mb: 4, fontWeight: 900, color: binThemeTokens.textPrimary }}>SETTLEMENT LOGS</Typography>
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(22, 22, 24, 0.6)', borderRadius: 6 }}>
            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>DATE</TableCell>
                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>TRANSACTION HASH</TableCell>
                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>AMOUNT</TableCell>
                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>STATUS</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {transactions.map((tx, idx) => (
                        <TableRow key={idx} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                            <TableCell sx={{ color: binThemeTokens.textSecondary }}>{tx.date || 'UNSPECIFIED'}</TableCell>
                            <TableCell sx={{ color: binThemeTokens.textPrimary, fontFamily: 'monospace' }}>{tx.id.substring(0, 12)}...</TableCell>
                            <TableCell sx={{ color: tx.type === 'debit' ? '#ff4d4d' : '#4ADE80', fontWeight: 900 }}>
                                {tx.type === 'debit' ? '-' : '+'} AED {tx.amount?.toLocaleString()}
                            </TableCell>
                            <TableCell>
                                <Chip label="SETTLED" size="small" sx={{ bgcolor: 'rgba(198, 167, 94, 0.1)', color: binThemeTokens.gold, border: '1px solid rgba(198, 167, 94, 0.4)' }} />
                            </TableCell>
                        </TableRow>
                    ))}
                    {transactions.length === 0 && (
                        <TableRow><TableCell colSpan={4} align="center" sx={{ py: 10, color: binThemeTokens.textSecondary }}>No transactions found in this protocol. Portfolio ledger is empty.</TableCell></TableRow>
                    )}
                </TableBody>
            </Table>
        </TableContainer>
      </Box>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3, fontWeight: 700 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

// admin-panel/src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Container, Grid, Paper, Typography, Box, Chip, Table, TableBody, 
  TableCell, TableHead, TableRow, Skeleton,
  Alert, Snackbar, Button, alpha
} from '@mui/material';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import SecurityIcon from '@mui/icons-material/Security';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import BusinessIcon from '@mui/icons-material/Business';
import PeopleIcon from '@mui/icons-material/People';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SpeedIcon from '@mui/icons-material/Speed';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import AssignmentIcon from '@mui/icons-material/Assignment';

import { useLanguage } from '@bin/shared';

// Import Firestore and Functions from sovereign shared lib
import { db, collection, query, where, onSnapshot, orderBy, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export default function DashboardPage() {
  const { t, tx, lang, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  
  const [stats, setStats] = useState({
    revenue: 0,
    expenses: 0,
    netProfit: 0,
    properties: 0,
    owners: 0,
    brokers: 0,
    openTickets: 0,
    availableFloat: 0
  });

  const [sovereignStats, setSovereignStats] = useState<any>(null);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [pendingOnboardings, setPendingOnboardings] = useState<any[]>([]);

  const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE') : "0";
  };

  const binThemeTokens = {
    gold: '#C6A75E',
    goldLight: '#E6C77A',
    danger: '#ef4444'
  };

  useEffect(() => {
    setLoading(true);
    
    const safetyTimeout = setTimeout(() => {
        setLoading(prev => {
            if (prev) console.warn("[DASHBOARD] Snapshot timeout.");
            return false;
        });
    }, 8000);

    const unsubProperties = onSnapshot(collection(db, "properties"), (snapshot) => {
      setStats(prev => ({ ...prev, properties: snapshot.size }));
    });

    const qOwners = query(collection(db, "users"), where("role", "in", ["owner", "OWNER"]));
    const unsubOwners = onSnapshot(qOwners, (snapshot) => {
      setStats(prev => ({ ...prev, owners: snapshot.size }));
    });

    const qBrokers = query(collection(db, "users"), where("role", "in", ["broker", "BROKER"]));
    const unsubBrokers = onSnapshot(qBrokers, (snapshot) => {
      setStats(prev => ({ ...prev, brokers: snapshot.size }));
    });

    const qTickets = query(collection(db, "maintenanceTickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"]));
    const unsubTickets = onSnapshot(qTickets, (snapshot) => {
      setStats(prev => ({ ...prev, openTickets: snapshot.size }));
    });

    const qLedger = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const unsubLedger = onSnapshot(qLedger, (snapshot) => {
      let totalIn = 0;
      let totalOut = 0;
      const txns: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const amount = data.amount || 0;
        if (data.type === 'credit') totalIn += amount;
        else if (data.type === 'debit') totalOut += amount;
        
        txns.push({
          id: doc.id,
          displayId: doc.id.substring(0, 8),
          total: amount,
          date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE') : 'Recent',
          type: data.type,
          description: data.description
        });
      });

      setStats(prev => ({ 
        ...prev, 
        revenue: totalIn,
        expenses: totalOut,
        netProfit: totalIn - totalOut,
        availableFloat: totalIn - totalOut
      }));
      setRecentTransactions(txns.slice(0, 10));
      
      setChartData([
        { name: 'Jan', revenue: totalIn * 0.4, expenses: totalOut * 0.3 },
        { name: 'Feb', revenue: totalIn * 0.5, expenses: totalOut * 0.4 },
        { name: 'Mar', revenue: totalIn * 0.7, expenses: totalOut * 0.6 },
        { name: 'Apr', revenue: totalIn * 0.8, expenses: totalOut * 0.7 },
        { name: 'May', revenue: totalIn * 0.9, expenses: totalOut * 0.8 },
        { name: 'Jun', revenue: totalIn, expenses: totalOut },
      ]);
      
      setLoading(false);
      clearTimeout(safetyTimeout);
    }, () => {
      setLoading(false);
      clearTimeout(safetyTimeout);
    });

    const unsubOnboarding = onSnapshot(collection(db, 'intake_submissions'), (snap) => {
        setPendingOnboardings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const fetchSovereignStats = async () => {
      try {
        const getStats = httpsCallable(functions, 'getSovereignSystemStats');
        const result = await getStats();
        setSovereignStats(result.data);
      } catch (err) {
        console.error("Failed to fetch Sovereign intelligence:", err);
      }
    };

    fetchSovereignStats();
    const intelInterval = setInterval(fetchSovereignStats, 60000);

    return () => {
      unsubProperties();
      unsubOwners();
      unsubBrokers();
      unsubTickets();
      unsubLedger();
      unsubOnboarding();
      clearTimeout(safetyTimeout);
      clearInterval(intelInterval);
    };
  }, [lang]);

  if (loading && stats.revenue === 0) {
    return (
      <Box sx={{ bgcolor: '#020617', minHeight: '100vh', py: 4, px: 4 }}>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2, bgcolor: '#0f172a' }} />
        <Skeleton variant="rectangular" height={400} sx={{ bgcolor: '#0f172a' }} />
      </Box>
    );
  }

  const profitMargin = stats.revenue > 0 ? Math.round((stats.netProfit / stats.revenue) * 100) : 0;

  return (
    <Box sx={{ bgcolor: '#020617', minHeight: '100vh', py: 4, color: 'white' }}>
      <Container maxWidth="xl">
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 36, color: '#3b82f6' }} /> {tx('admin.dashboard', 'ADMIN DASHBOARD')}
            </Typography>
            <Typography variant="body1" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>
              {tx('dash.command_subtitle', 'Institutional Grade Auditing & National Zone Interface')}
            </Typography>
          </Box>
          <Chip 
            icon={<TrendingUpIcon style={{ color: '#10b981' }} />} 
            label={tx('tech.trend.live', 'LIVE')} 
            sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 'bold', border: '1px solid #10b981' }} 
          />
        </Box>

        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <AccountBalanceWalletIcon fontSize="small" /> {tx('admin.total_revenue', 'TOTAL REVENUE')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {tx('common.currency_aed', 'AED')} {formatAED(stats.revenue)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TrendingUpIcon fontSize="small" /> {tx('dash.kpi.net_roi', 'NET ROI')}
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {tx('common.currency_aed', 'AED')} {formatAED(stats.netProfit)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', textAlign: isRTL ? 'right' : 'left' }}>{profitMargin}% {tx('analysis.efficiency', 'OPERATIONAL EFFICIENCY')}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TrendingDownIcon fontSize="small" /> {tx('fin.total_deductions', 'TOTAL DEDUCTIONS')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {tx('common.currency_aed', 'AED')} {formatAED(stats.expenses)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#8b5cf6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <BusinessIcon fontSize="small" /> {tx('onboarding.property_details', 'PROPERTIES')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {stats.properties}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* NEW: ONBOARDING & PAYMENT WAR ROOM */}
        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Grid item xs={12} lg={6}>
                <Paper sx={{ p: 3, bgcolor: '#0f172a', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 4 }}>
                    <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AssignmentIcon /> NEW ONBOARDING QUEUE
                    </Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>SUBMISSION ID</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>ASSETS</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>STATUS</TableCell>
                                <TableCell align="right"></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pendingOnboardings.map((onb) => (
                                <TableRow key={onb.id}>
                                    <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{onb.id.substring(0,8)}</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.7)' }}>{onb.properties?.length || 1} Nodes</TableCell>
                                    <TableCell>
                                        <Chip label={onb.status} size="small" sx={{ bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', fontWeight: 900, fontSize: '0.65rem' }} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button size="small" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>REVIEW</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {pendingOnboardings.length === 0 && (
                                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'rgba(255,255,255,0.2)' }}>No pending onboards</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Paper>
            </Grid>

            <Grid item xs={12} lg={6}>
                <Paper sx={{ p: 3, bgcolor: '#0f172a', border: `1px solid ${alpha('#10b981', 0.2)}`, borderRadius: 4 }}>
                    <Typography variant="h6" sx={{ color: '#10b981', fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalanceWalletIcon /> PENDING PAYMENT VERIFICATION
                    </Typography>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>OWNER</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>AMOUNT</TableCell>
                                <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>METHOD</TableCell>
                                <TableCell align="right"></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pendingOnboardings.filter(o => o.paymentStatus === 'PENDING').map((onb) => (
                                <TableRow key={onb.id}>
                                    <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{onb.companyProfile?.companyName || 'Private Asset'}</TableCell>
                                    <TableCell sx={{ color: '#10b981', fontWeight: 900 }}>AED {onb.mobilizationDue?.toLocaleString()}</TableCell>
                                    <TableCell>
                                        <Chip label={onb.paymentMethod || 'BANK'} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF' }} />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Button size="small" variant="outlined" color="success" sx={{ fontWeight: 900 }}>VERIFY</Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {pendingOnboardings.filter(o => o.paymentStatus === 'PENDING').length === 0 && (
                                <TableRow><TableCell colSpan={4} align="center" sx={{ py: 4, color: 'rgba(255,255,255,0.2)' }}>No pending payments</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </Paper>
            </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <PsychologyIcon sx={{ color: '#eab308' }} /> {tx('tech.ai_proposal', 'AI PROTOCOL PROPOSALS')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ width: '50%', height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: tx('dash.sanctioned', 'SANCTIONED'), value: sovereignStats?.protocolStats?.sanctioned || 0 },
                          { name: tx('dash.proposed', 'PROPOSED'), value: sovereignStats?.protocolStats?.proposed || 0 },
                          { name: tx('dash.declined', 'DECLINED'), value: sovereignStats?.protocolStats?.declined || 0 }
                        ]}
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        <Cell fill="#10b981" />
                        <Cell fill="#eab308" />
                        <Cell fill="#ef4444" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
                <Box sx={{ width: '45%', textAlign: isRTL ? 'right' : 'left' }}>
                   <Typography variant="h4" sx={{ color: 'white', fontWeight: '900' }}>
                     {sovereignStats?.protocolStats?.adoptionRate || 0}%
                   </Typography>
                   <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 1 }}>
                     {tx('dash.kpi.compliance', 'COMPLIANCE SCORE')}
                   </Typography>
                   <Chip label={tx('dash.sovereign_ai', 'SOVEREIGN AI')} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.1)', color: '#eab308', fontWeight: 'bold', fontSize: '10px' }} />
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <SpeedIcon sx={{ color: '#3b82f6' }} /> {tx('dash.kpi.integrity', 'ASSET INTEGRITY')}
              </Typography>
              <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                   <Typography variant="caption" sx={{ color: '#94a3b8' }}>{tx('dash.kpi.gross_val', 'GROSS CONTRACT VALUE')}</Typography>
                   <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>{tx('common.currency_aed', 'AED')} {formatAED(stats.availableFloat)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: '#1e293b', borderRadius: 4, overflow: 'hidden', mb: 3 }}>
                   <Box sx={{ 
                     height: '100%', 
                     width: `${Math.min(100, (stats.availableFloat / 50000) * 100)}%`, 
                     bgcolor: stats.availableFloat < 10000 ? '#ef4444' : '#3b82f6',
                     float: isRTL ? 'right' : 'left'
                   }} />
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <PeopleIcon sx={{ color: '#ec4899' }} /> {tx('nav.technicians', 'TECHNICIAN CORPS')}
              </Typography>
              <Box sx={{ textAlign: 'center', py: 2 }}>
                 <Typography variant="h2" sx={{ color: 'white', fontWeight: '900', mb: 0 }}>
                   {stats.owners + stats.brokers}
                 </Typography>
                 <Typography variant="h6" sx={{ color: '#ec4899', fontWeight: 'bold' }}>{tx('tech.active_tickets', 'ASSIGNED SPECIALISTS')}</Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* MIDDLE ROW: GROWTH & RISK */}
        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} lg={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <ShowChartIcon sx={{ color: '#3b82f6' }} /> {tx('landing.transparency_title', 'GROWTH & RISK TRANSPARENCY')}
              </Typography>
              <Box sx={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorIn" x1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorOut" x1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: 'white' }} />
                    <Area type="monotone" dataKey="revenue" name={tx('fin.income', 'INCOME')} stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIn)" />
                    <Area type="monotone" dataKey="expenses" name={tx('fin.burn', 'BURN')} stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <ReceiptLongIcon sx={{ color: '#10b981' }} /> {tx('fin.logs_title', 'SYSTEMIC LEDGER LOGS')}
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" dir={isRTL ? 'rtl' : 'ltr'}>
                  <TableHead>
                    <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tx('admin.contract_ref', 'CONTRACT REF')}</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tx('fin.log.date', 'DATE')}</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{tx('sos.mission_description', 'MISSION DESCRIPTION')}</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>{tx('admin.amount', 'AMOUNT')} ({tx('common.currency_aed', 'AED')})</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>{tx('fin.log.status', 'STATUS')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentTransactions.map((row, index) => (
                      <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 }, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                        <TableCell sx={{ color: '#cbd5e1', borderBottom: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>
                          {row.displayId}...
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #1e293b', textAlign: isRTL ? 'right' : 'left' }}>
                          {row.date}
                        </TableCell>
                        <TableCell sx={{ color: '#fff', borderBottom: '1px solid #1e293b', textAlign: isRTL ? 'right' : 'left' }}>
                          {row.description}
                        </TableCell>
                        <TableCell align="right" sx={{ color: row.type === 'credit' ? '#10b981' : '#ef4444', borderBottom: '1px solid #1e293b', fontWeight: '900' }}>
                          {row.type === 'credit' ? '+' : '-'} {formatAED(row.total)}
                        </TableCell>
                        <TableCell align="right" sx={{ borderBottom: '1px solid #1e293b' }}>
                          <Chip 
                            label={row.type === 'credit' ? tx('status.settled', 'SETTLED') : tx('status.pending', 'PENDING')} 
                            size="small" 
                            sx={{ 
                              bgcolor: row.type === 'credit' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', 
                              color: row.type === 'credit' ? '#10b981' : '#ef4444', 
                              fontWeight: 'bold'
                            }} 
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <SecurityIcon sx={{ color: '#f59e0b' }} />
          <Typography variant="caption" sx={{ color: '#94a3b8', textAlign: isRTL ? 'right' : 'left' }}>
            {tx('landing.transparency_desc', 'All financial dispatches are secured via Sovereign Hash Anchor.')}
          </Typography>
        </Box>
      </Container>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} sx={{ width: '100%', fontWeight: 'bold' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

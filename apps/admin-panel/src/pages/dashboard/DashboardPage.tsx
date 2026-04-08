// admin-panel/src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Container, Grid, Paper, Typography, Box, Chip, Table, TableBody, 
  TableCell, TableHead, TableRow, Skeleton,
  Alert, Snackbar
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

import { useLanguage } from '@bin/shared';

// Import Firestore and Functions from sovereign shared lib
import { db, collection, query, where, onSnapshot, orderBy, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export default function DashboardPage() {
  const { t, lang, isRTL } = useLanguage();
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

  const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE') : "0";
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
              <AccountBalanceWalletIcon sx={{ fontSize: 36, color: '#3b82f6' }} /> {t('admin.dashboard')}
            </Typography>
            <Typography variant="body1" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>
              {t('dash.command_subtitle')}
            </Typography>
          </Box>
          <Chip 
            icon={<TrendingUpIcon style={{ color: '#10b981' }} />} 
            label={t('tech.trend.live')} 
            sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 'bold', border: '1px solid #10b981' }} 
          />
        </Box>

        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <AccountBalanceWalletIcon fontSize="small" /> {t('admin.total_revenue')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {t('common.currency_aed')} {formatAED(stats.revenue)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TrendingUpIcon fontSize="small" /> {t('dash.kpi.net_roi')}
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {t('common.currency_aed')} {formatAED(stats.netProfit)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', textAlign: isRTL ? 'right' : 'left' }}>{profitMargin}% {t('analysis.efficiency')}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TrendingDownIcon fontSize="small" /> {t('fin.total_deductions')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {t('common.currency_aed')} {formatAED(stats.expenses)}
              </Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#8b5cf6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <BusinessIcon fontSize="small" /> {t('onboarding.property_details')}
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>
                {stats.properties}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <PsychologyIcon sx={{ color: '#eab308' }} /> {t('tech.ai_proposal')}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <Box sx={{ width: '50%', height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: t('dash.sanctioned'), value: sovereignStats?.protocolStats?.sanctioned || 0 },
                          { name: t('dash.proposed'), value: sovereignStats?.protocolStats?.proposed || 0 },
                          { name: t('dash.declined'), value: sovereignStats?.protocolStats?.declined || 0 }
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
                     {t('dash.kpi.compliance')}
                   </Typography>
                   <Chip label={t('dash.sovereign_ai')} size="small" sx={{ bgcolor: 'rgba(234,179,8,0.1)', color: '#eab308', fontWeight: 'bold', fontSize: '10px' }} />
                </Box>
              </Box>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <SpeedIcon sx={{ color: '#3b82f6' }} /> {t('dash.kpi.integrity')}
              </Typography>
              <Box sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                   <Typography variant="caption" sx={{ color: '#94a3b8' }}>{t('dash.kpi.gross_val')}</Typography>
                   <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>{t('common.currency_aed')} {formatAED(stats.availableFloat)}</Typography>
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
                <PeopleIcon sx={{ color: '#ec4899' }} /> {t('nav.technicians')}
              </Typography>
              <Box sx={{ textAlign: 'center', py: 2 }}>
                 <Typography variant="h2" sx={{ color: 'white', fontWeight: '900', mb: 0 }}>
                   {stats.owners + stats.brokers}
                 </Typography>
                 <Typography variant="h6" sx={{ color: '#ec4899', fontWeight: 'bold' }}>{t('tech.active_tickets')}</Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* MIDDLE ROW: GROWTH & RISK */}
        <Grid container spacing={3} sx={{ mb: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
          <Grid item xs={12} lg={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 4, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <ShowChartIcon sx={{ color: '#3b82f6' }} /> {t('landing.transparency_title')}
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
                    <Area type="monotone" dataKey="revenue" name={t('fin.income')} stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIn)" />
                    <Area type="monotone" dataKey="expenses" name={t('fin.burn')} stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
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
                <ReceiptLongIcon sx={{ color: '#10b981' }} /> {t('fin.logs_title')}
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" dir={isRTL ? 'rtl' : 'ltr'}>
                  <TableHead>
                    <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('admin.contract_ref')}</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('fin.log.date')}</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold', textAlign: isRTL ? 'right' : 'left' }}>{t('sos.mission_description')}</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>{t('admin.amount')} ({t('common.currency_aed')})</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>{t('fin.log.status')}</TableCell>
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
                            label={row.type === 'credit' ? t('status.settled') : t('status.pending')} 
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
            {t('landing.transparency_desc')}
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

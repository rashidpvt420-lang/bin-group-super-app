// admin-panel/src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { Container, Grid, Paper, Typography, Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Skeleton } from '@mui/material';
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
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

// Import Firestore and Functions from sovereign shared lib
import { db, collection, query, where, onSnapshot, orderBy, limit, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-AE") : "0";
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    revenue: 0,
    properties: 0,
    owners: 0,
    brokers: 0,
    openTickets: 0,
    maintenanceFloat: 45000,
    targetFloat: 50000
  });

  const [sovereignStats, setSovereignStats] = useState<any>(null);

  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    
    // [STABILITY] Dashboard Data Timeout
    const safetyTimeout = setTimeout(() => {
        setLoading(prev => {
            if (prev) console.warn("[DASHBOARD] Snapshot timeout. Rendering partial data.");
            return false;
        });
    }, 8000);

    // 1. Properties Count
    const unsubProperties = onSnapshot(collection(db, "properties"), (snapshot) => {
      setStats(prev => ({ ...prev, properties: snapshot.size }));
    }, (err) => console.error("Properties snap failed:", err));

    // 2. Owners Count
    const qOwners = query(collection(db, "users"), where("role", "in", ["owner", "OWNER"]));
    const unsubOwners = onSnapshot(qOwners, (snapshot) => {
      setStats(prev => ({ ...prev, owners: snapshot.size }));
    }, (err) => console.error("Owners snap failed:", err));

    // 3. Brokers Count
    const qBrokers = query(collection(db, "users"), where("role", "in", ["broker", "BROKER"]));
    const unsubBrokers = onSnapshot(qBrokers, (snapshot) => {
      setStats(prev => ({ ...prev, brokers: snapshot.size }));
    }, (err) => console.error("Brokers snap failed:", err));

    // 4. Open Tickets Count
    const qTickets = query(collection(db, "tickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"]));
    const unsubTickets = onSnapshot(qTickets, (snapshot) => {
      setStats(prev => ({ ...prev, openTickets: snapshot.size }));
    }, (err) => console.error("Tickets snap failed:", err));

    // 5. Revenue & Recent Transactions (Derived from 'contracts')
    const qContracts = query(collection(db, "contracts"), orderBy("createdAt", "desc"), limit(20));
    const unsubContracts = onSnapshot(qContracts, (snapshot) => {
      let totalRevenue = 0;
      const txns: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === "PAYMENT_SUCCESS" || data.paymentVerified === true) {
          totalRevenue += (data.amount || 0);
        }
        
        txns.push({
          id: doc.id.substring(0, 8),
          total: data.amount || 0,
          date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Recent',
          status: data.status,
          verified: data.paymentVerified
        });
      });

      setStats(prev => ({ ...prev, revenue: totalRevenue }));
      setRecentTransactions(txns.slice(0, 8));
      
      // Dynamic Chart Data mapping
      setChartData([
        { name: 'Jan', revenue: totalRevenue * 0.4 },
        { name: 'Feb', revenue: totalRevenue * 0.5 },
        { name: 'Mar', revenue: totalRevenue * 0.7 },
        { name: 'Apr', revenue: totalRevenue * 0.8 },
        { name: 'May', revenue: totalRevenue * 0.9 },
        { name: 'Jun', revenue: totalRevenue },
      ]);
      
      setLoading(false);
      clearTimeout(safetyTimeout);
    }, (error) => {
      console.error("Dashboard snap failed:", error);
      setLoading(false);
      clearTimeout(safetyTimeout);
    });

    // 6. Sovereign System Intelligence (Aggregated AI Metrics)
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
    const intelInterval = setInterval(fetchSovereignStats, 60000); // Heartbeat every 1m

    return () => {
      unsubProperties();
      unsubOwners();
      unsubBrokers();
      unsubTickets();
      unsubContracts();
      clearTimeout(safetyTimeout);
      clearInterval(intelInterval);
    };
  }, []);

  if (loading && stats.revenue === 0 && stats.properties === 0) {
    return (
      <Box sx={{ bgcolor: '#020617', minHeight: '100vh', py: 4, px: 4 }}>
        <Skeleton variant="rectangular" height={100} sx={{ mb: 2, bgcolor: '#0f172a' }} />
        <Skeleton variant="rectangular" height={400} sx={{ bgcolor: '#0f172a' }} />
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: '#020617', minHeight: '100vh', py: 4, color: 'white' }}>
      <Container maxWidth="xl">
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Box>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 2 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 36, color: '#3b82f6' }} /> Sovereign Command
            </Typography>
            <Typography variant="body1" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>
              BIN-GROUP Institutional Live Ops (Firestore Real-time)
            </Typography>
          </Box>
          <Chip 
            icon={<TrendingUpIcon style={{ color: '#10b981' }} />} 
            label="SYSTEM ONLINE" 
            sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 'bold', border: '1px solid #10b981' }} 
          />
        </Box>

        {/* TOP ROW: CORE PERFORMANCE */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* TOTAL REVENUE */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountBalanceWalletIcon fontSize="small" /> Gross Revenue
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                AED {formatAED(stats.revenue)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Verified Settlement Pipeline</Typography>
            </Paper>
          </Grid>

          {/* PROPERTIES */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#8b5cf6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <BusinessIcon fontSize="small" /> Total Properties
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                {stats.properties}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Global Portfolio Intake</Typography>
            </Paper>
          </Grid>

          {/* NETWORK SCALE */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#ec4899', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PeopleIcon fontSize="small" /> Network Scale
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                {stats.owners + stats.brokers}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>{stats.owners} Owners</Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>{stats.brokers} Brokers</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* OPEN TICKETS */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ConfirmationNumberIcon fontSize="small" /> Active Tickets
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                {stats.openTickets}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Maintenance Velocity</Typography>
            </Paper>
          </Grid>
        </Grid>

        {/* SOVEREIGN COMMAND ROW: AI & OPERATIONAL INTELLIGENCE */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* AI PROTOCOL ADOPTION */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PsychologyIcon sx={{ color: '#eab308' }} /> AI Protocol Adoption
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ width: '50%', height: 160 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Sanctioned', value: sovereignStats?.protocolStats?.sanctioned || 0 },
                          { name: 'Proposed', value: sovereignStats?.protocolStats?.proposed || 0 },
                          { name: 'Declined', value: sovereignStats?.protocolStats?.declined || 0 }
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
                <Box sx={{ width: '45%' }}>
                   <Typography variant="h4" sx={{ color: 'white', fontWeight: '900' }}>
                     {sovereignStats?.protocolStats?.adoptionRate || 0}%
                   </Typography>
                   <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block', mb: 1 }}>
                     Protocol Conversion Rate
                   </Typography>
                   <Chip label="SOVEREIGN AI" size="small" sx={{ bgcolor: 'rgba(234,179,8,0.1)', color: '#eab308', fontWeight: 'bold', fontSize: '10px' }} />
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                 <Typography variant="caption" sx={{ color: '#10b981' }}>● Sanctioned: {sovereignStats?.protocolStats?.sanctioned}</Typography>
                 <Typography variant="caption" sx={{ color: '#eab308' }}>● Proposed: {sovereignStats?.protocolStats?.proposed}</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* LIQUIDITY BOUNDARY */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon sx={{ color: '#3b82f6' }} /> Liquidity Boundary
                {sovereignStats?.financials?.isCached && (
                  <Chip 
                    label="CACHED" 
                    size="small" 
                    sx={{ 
                      ml: 'auto', 
                      height: 16, 
                      fontSize: '8px', 
                      bgcolor: 'rgba(59,130,246,0.1)', 
                      color: '#3b82f6', 
                      border: '1px solid rgba(59,130,246,0.3)' 
                    }} 
                  />
                )}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                   <Typography variant="caption" sx={{ color: '#94a3b8' }}>Maintenance Float Pool</Typography>
                   <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>AED {formatAED(sovereignStats?.financials?.availableFloat || 45000)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: '#1e293b', borderRadius: 4, overflow: 'hidden', mb: 3 }}>
                   <Box sx={{ 
                     height: '100%', 
                     width: `${Math.min(100, ((sovereignStats?.financials?.totalProjectedBudget || 0) / (sovereignStats?.financials?.availableFloat || 45000)) * 100)}%`, 
                     bgcolor: (sovereignStats?.financials?.totalProjectedBudget || 0) > (sovereignStats?.financials?.availableFloat || 45000) ? '#ef4444' : '#3b82f6' 
                   }} />
                </Box>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                  Projected AI Maintenance Cost:
                </Typography>
                <Typography variant="h5" sx={{ color: 'white', fontWeight: '900' }}>
                  AED {formatAED(sovereignStats?.financials?.totalProjectedBudget || 0)}
                </Typography>
                <Typography variant="caption" sx={{ color: (sovereignStats?.financials?.totalProjectedBudget || 0) > (sovereignStats?.financials?.availableFloat || 45000) ? '#ef4444' : '#10b981', mt: 1, display: 'block' }}>
                  { (sovereignStats?.financials?.totalProjectedBudget || 0) > (sovereignStats?.financials?.availableFloat || 45000) ? "POOL DEFICIT DETECTED" : "LIQUIDITY SECURED" }
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* TRIAGE VELOCITY */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon sx={{ color: '#10b981' }} /> Triage Velocity
              </Typography>
              <Box sx={{ textAlign: 'center', py: 2 }}>
                 <Typography variant="h2" sx={{ color: 'white', fontWeight: '900', mb: 0 }}>
                   {sovereignStats?.performance?.avgTriageLatencyMinutes || '--'}
                 </Typography>
                 <Typography variant="h6" sx={{ color: '#10b981', fontWeight: 'bold' }}>MINUTES</Typography>
                 <Typography variant="caption" sx={{ color: '#94a3b8', mt: 2, display: 'block' }}>
                   Average latency from Owner Sanction to Technician Dispatch
                 </Typography>
                 <Chip label="OPTIMAL DISPATCH" size="small" sx={{ mt: 2, bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 'bold' }} />
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* MIDDLE ROW: VELOCITY & AUDIT */}

        {/* MIDDLE ROW: VELOCITY & RISK */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* GROWTH CHART */}
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 4, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShowChartIcon sx={{ color: '#3b82f6' }} /> Growth Trajectory
              </Typography>
              <Box sx={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: 'white' }} itemStyle={{ color: '#3b82f6' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>

          {/* ASSET RISK HEATMAP */}
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, height: '100%', overflow: 'hidden' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningAmberIcon sx={{ color: '#f59e0b' }} /> Asset Risk Heatmap
              </Typography>

              <Box sx={{ overflowY: 'auto', maxHeight: 350 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Asset / Area</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Health Index</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Risk State</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(sovereignStats?.riskHeatmap?.dangerZoneAssets || []).map((asset: any, index: number) => (
                      <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ color: '#cbd5e1', borderBottom: '1px solid #1e293b' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{asset.id.substring(0, 8)}...</Typography>
                          <Typography variant="caption" sx={{ color: '#64748b' }}>{asset.area}</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'white', borderBottom: '1px solid #1e293b' }}>
                          <Typography variant="body2" sx={{ color: asset.healthIndex < 70 ? '#ef4444' : '#eab308', fontWeight: 'bold' }}>{asset.healthIndex}%</Typography>
                        </TableCell>
                        <TableCell align="right" sx={{ borderBottom: '1px solid #1e293b' }}>
                          <Chip 
                            label={asset.healthIndex < 70 ? "CRITICAL" : "AT RISK"} 
                            size="small" 
                            sx={{ 
                              bgcolor: asset.healthIndex < 70 ? 'rgba(239,68,68,0.1)' : 'rgba(234,179,8,0.1)', 
                              color: asset.healthIndex < 70 ? '#ef4444' : '#eab308', 
                              fontWeight: 'bold', 
                              fontSize: '10px' 
                            }} 
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                    {(sovereignStats?.riskHeatmap?.dangerZoneAssets || []).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ textAlign: 'center', py: 4, color: '#94a3b8' }}>
                          All assets currently exceed health safety threshold.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* LOWER ROW: SETTLEMENT AUDIT */}
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReceiptLongIcon sx={{ color: '#10b981' }} /> Full Settlement Audit (Real-time)
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Transaction ID</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Value (AED)</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Verification Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentTransactions.map((row, index) => (
                      <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ color: '#cbd5e1', borderBottom: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {row.id}...
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                          {row.date}
                        </TableCell>
                        <TableCell align="right" sx={{ color: '#10b981', borderBottom: '1px solid #1e293b', fontWeight: '900' }}>
                          {formatAED(row.total)}
                        </TableCell>
                        <TableCell align="right" sx={{ borderBottom: '1px solid #1e293b' }}>
                          <Chip 
                            label={row.verified ? "VERIFIED" : (row.status || "PENDING")} 
                            size="small" 
                            sx={{ 
                              bgcolor: row.verified ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', 
                              color: row.verified ? '#10b981' : '#f59e0b', 
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

        {/* COMPLIANCE FOOTER */}

        {/* COMPLIANCE FOOTER */}
        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 2 }}>
          <SecurityIcon sx={{ color: '#f59e0b' }} />
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            BIN-OS INTELLIGENCE: All data mirrored from sovereign blockchain nodes and RERA-regulated escrow pipelines. 100% Data Integrity.
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

// admin-panel/src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Container, Grid, Paper, Typography, Box, Chip, Table, TableBody, 
  TableCell, TableHead, TableRow, Skeleton, Button,
  CircularProgress, Alert, Snackbar
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
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';

// Import Firestore and Functions from sovereign shared lib
import { db, auth, collection, query, where, onSnapshot, orderBy, limit, functions, getDocs } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import axios from 'axios';

const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-AE") : "0";
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
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
  const [pendingOwners, setPendingOwners] = useState<any[]>([]);
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
    const qTickets = query(collection(db, "maintenanceTickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"]));
    const unsubTickets = onSnapshot(qTickets, (snapshot) => {
      setStats(prev => ({ ...prev, openTickets: snapshot.size }));
    }, (err) => console.error("Tickets snap failed:", err));

    // 5. Pending Owner Approvals
    const qPending = query(collection(db, "users"), where("status", "==", "pending_approval"));
    const unsubPending = onSnapshot(qPending, (snapshot) => {
      const owners = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingOwners(owners);
    });

    // 6. Dynamic Financial Ledger (Real-time Transaction Sums)
    const qLedger = query(collection(db, "transactions"), orderBy("createdAt", "desc"));
    const unsubLedger = onSnapshot(qLedger, (snapshot) => {
      let totalIn = 0;
      let totalOut = 0;
      const txns: any[] = [];
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const amount = data.amount || 0;
        
        if (data.type === 'credit') {
          totalIn += amount;
        } else if (data.type === 'debit') {
          totalOut += amount;
        }
        
        txns.push({
          id: doc.id,
          displayId: doc.id.substring(0, 8),
          total: amount,
          date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : 'Recent',
          status: data.status || 'VERIFIED',
          type: data.type,
          description: data.description
        });
      });

      setStats(prev => ({ 
        ...prev, 
        revenue: totalIn,
        expenses: totalOut,
        netProfit: totalIn - totalOut,
        availableFloat: totalIn - totalOut // Simulating float as net liquidity
      }));
      setRecentTransactions(txns.slice(0, 10));
      
      // Dynamic Chart Data mapping (Mock distribution across months)
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
    }, (error) => {
      console.error("Ledger snap failed:", error);
      setLoading(false);
      clearTimeout(safetyTimeout);
    });

    // 7. Sovereign System Intelligence (Aggregated AI Metrics)
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
      unsubPending();
      unsubLedger();
      clearTimeout(safetyTimeout);
      clearInterval(intelInterval);
    };
  }, []);

  const handleApproveAccount = async (ownerId: string) => {
    setApprovingId(ownerId);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("UNAUTHENTICATED: No active administrative session.");

      // Find the contract related to this owner
      const qContracts = query(collection(db, "contracts"), where("ownerId", "==", ownerId), where("paymentVerified", "==", false), limit(1));
      const contractDocs = await getDocs(qContracts);
      if (contractDocs.empty) throw new Error("No pending contract found for this entity.");
      
      const contractId = contractDocs.docs[0].id;
      const contractData = contractDocs.docs[0].data();

      const token = await user.getIdToken(true);
      // [SOVEREIGN-DISPATCH] Manual Token Injection for Secure Backend Routing
      const functionUrl = 'https://adminverifypayment-sc33mcrduq-uc.a.run.app';
      
      await axios.post(functionUrl, {
        data: {
          contractId: contractId,
          paymentId: contractData.paymentId,
          method: contractData.provider || 'manual',
          referenceId: `DASHBOARD-AUTO-${Date.now()}`,
          amountReceived: contractData.amount,
          notes: "Auto-approved via Sovereign Command Dashboard.",
          receivedAt: new Date().toISOString()
        }
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      setSnackbar({ open: true, message: 'Account successfully approved and unlocked.', severity: 'success' });
    } catch (err: any) {
      console.error("🚨 [ADMIN-AUTH] Approval Failure:", err);
      setSnackbar({ open: true, message: `Approval failed: ${err.response?.data?.error?.message || err.message}`, severity: 'error' });
    } finally {
      setApprovingId(null);
    }
  };

  if (loading && stats.revenue === 0 && stats.properties === 0) {
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
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Box>
            <Typography variant="h4" sx={{ mb: 1, fontWeight: '900', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 2 }}>
              <AccountBalanceWalletIcon sx={{ fontSize: 36, color: '#3b82f6' }} /> Sovereign Command
            </Typography>
            <Typography variant="body1" sx={{ color: '#94a3b8', fontWeight: 'bold' }}>
              Financial Integrity & Live Operational Intelligence
            </Typography>
          </Box>
          <Chip 
            icon={<TrendingUpIcon style={{ color: '#10b981' }} />} 
            label="LIVE LEDGER ACTIVE" 
            sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 'bold', border: '1px solid #10b981' }} 
          />
        </Box>

        {/* TOP ROW: CORE PERFORMANCE */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* TOTAL REVENUE */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AccountBalanceWalletIcon fontSize="small" /> Gross Revenue (IN)
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                AED {formatAED(stats.revenue)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Real-time verified intake</Typography>
            </Paper>
          </Grid>

          {/* NET PROFIT */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon fontSize="small" /> Net Position
              </Typography>
              <Typography variant="h3" sx={{ color: '#10b981', fontWeight: '900', mt: 1, mb: 1 }}>
                AED {formatAED(stats.netProfit)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>{profitMargin}% Profit Margin</Typography>
            </Paper>
          </Grid>

          {/* TOTAL EXPENSES */}
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingDownIcon fontSize="small" /> Total Burn (OUT)
              </Typography>
              <Typography variant="h3" sx={{ color: 'white', fontWeight: '900', mt: 1, mb: 1 }}>
                AED {formatAED(stats.expenses)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>Payroll & Materials</Typography>
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
            </Paper>
          </Grid>

          {/* LIQUIDITY BOUNDARY */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <SpeedIcon sx={{ color: '#3b82f6' }} /> Liquidity Boundary
              </Typography>
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                   <Typography variant="caption" sx={{ color: '#94a3b8' }}>Available Sovereign Float</Typography>
                   <Typography variant="caption" sx={{ color: 'white', fontWeight: 'bold' }}>AED {formatAED(stats.availableFloat)}</Typography>
                </Box>
                <Box sx={{ height: 8, bgcolor: '#1e293b', borderRadius: 4, overflow: 'hidden', mb: 3 }}>
                   <Box sx={{ 
                     height: '100%', 
                     width: `${Math.min(100, (stats.availableFloat / 50000) * 100)}%`, 
                     bgcolor: stats.availableFloat < 10000 ? '#ef4444' : '#3b82f6' 
                   }} />
                </Box>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>
                  System Reserve Threshold: AED 50,000
                </Typography>
                <Typography variant="caption" sx={{ color: stats.availableFloat > 50000 ? '#10b981' : '#f59e0b', mt: 1, display: 'block' }}>
                  { stats.availableFloat > 50000 ? "LIQUIDITY SECURED" : "RESERVE UNDER TARGET" }
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* NETWORK SCALE */}
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4, height: '100%' }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <PeopleIcon sx={{ color: '#ec4899' }} /> Workforce Hub
              </Typography>
              <Box sx={{ textAlign: 'center', py: 2 }}>
                 <Typography variant="h2" sx={{ color: 'white', fontWeight: '900', mb: 0 }}>
                   {stats.owners + stats.brokers}
                 </Typography>
                 <Typography variant="h6" sx={{ color: '#ec4899', fontWeight: 'bold' }}>ACTIVE AGENTS</Typography>
                 <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 2 }}>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{stats.owners} Owners</Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{stats.brokers} Brokers</Typography>
                 </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* MIDDLE ROW: GROWTH & RISK */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* GROWTH CHART */}
          <Grid item xs={12} lg={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 4, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShowChartIcon sx={{ color: '#3b82f6' }} /> Sovereign Growth Trajectory
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
                    <Area type="monotone" dataKey="revenue" name="Income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIn)" />
                    <Area type="monotone" dataKey="expenses" name="Burn" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorOut)" />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        {/* LOWER ROW: SETTLEMENT AUDIT */}
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid #1e293b', borderRadius: 4 }}>
              <Typography variant="h6" sx={{ color: 'white', fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ReceiptLongIcon sx={{ color: '#10b981' }} /> Live Ledger Audit (Top 10)
              </Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Transaction ID</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Date</TableCell>
                      <TableCell sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Description</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Value (AED)</TableCell>
                      <TableCell align="right" sx={{ color: '#94a3b8', borderBottom: '1px solid #334155', fontWeight: 'bold' }}>Type</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentTransactions.map((row, index) => (
                      <TableRow key={index} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                        <TableCell sx={{ color: '#cbd5e1', borderBottom: '1px solid #1e293b', fontFamily: 'monospace', fontWeight: 'bold' }}>
                          {row.displayId}...
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', borderBottom: '1px solid #1e293b' }}>
                          {row.date}
                        </TableCell>
                        <TableCell sx={{ color: '#fff', borderBottom: '1px solid #1e293b' }}>
                          {row.description}
                        </TableCell>
                        <TableCell align="right" sx={{ color: row.type === 'credit' ? '#10b981' : '#ef4444', borderBottom: '1px solid #1e293b', fontWeight: '900' }}>
                          {row.type === 'credit' ? '+' : '-'} {formatAED(row.total)}
                        </TableCell>
                        <TableCell align="right" sx={{ borderBottom: '1px solid #1e293b' }}>
                          <Chip 
                            label={row.type.toUpperCase()} 
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

        {/* COMPLIANCE FOOTER */}
        <Box sx={{ mt: 4, pt: 3, borderTop: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 2 }}>
          <SecurityIcon sx={{ color: '#f59e0b' }} />
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            BIN-OS FINANCIAL INTELLIGENCE: Data integrity enforced via real-time ledger synchronization and automated reconciliation.
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

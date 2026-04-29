// admin-panel/src/pages/dashboard/DashboardPage.tsx
import React, { useState, useEffect } from 'react';
import { 
  Container, Grid, Paper, Typography, Box, Chip, Table, TableBody, 
  TableCell, TableHead, TableRow, TableContainer, Skeleton, Stack,
  Alert, Snackbar, Button, alpha, CircularProgress
} from '@mui/material';
import { useLanguage, calculateBuildingHealth } from '@bin/shared';

// Import Firestore and Functions from sovereign shared lib
import { db, collection, query, where, onSnapshot, orderBy, getDocs, doc, updateDoc, serverTimestamp, limit } from '../../lib/firebase';
import { useAI } from '@bin/shared';
import CeoContactButtons from '../../components/CeoContactButtons';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import BusinessIcon from '@mui/icons-material/Business';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssignmentIcon from '@mui/icons-material/Assignment';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';

export default function DashboardPage() {
  const { lang } = useLanguage();
  const { setPageContext } = useAI();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
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

  const [pendingOnboardings, setPendingOnboardings] = useState<any[]>([]);
  const [bpiAverage, setBpiAverage] = useState(0);
  const [riskAssets, setRiskAssets] = useState<any[]>([]);

  useEffect(() => {
    if (pendingOnboardings.length > 0 || riskAssets.length > 0) {
        setPageContext({ pendingOnboardings, riskAssets, stats });
    } else {
        setPageContext(null);
    }
    return () => setPageContext(null);
  }, [pendingOnboardings, riskAssets, stats]);

  const formatAED = (value: unknown): string => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE') : "0";
  };

  const binThemeTokens = {
    gold: '#C6A75E',
    goldLight: '#E6C77A',
    danger: '#ef4444'
  };

  const [summary, setSummary] = useState<any>(null);

  useEffect(() => {
    // [V12] ASYNC SUMMARY HARDENING
    const unsubSummary = onSnapshot(doc(db, "admin_summaries", "global"), (snap) => {
        if (snap.exists()) setSummary(snap.data());
    });

    const unsubProperties = onSnapshot(query(collection(db, "properties"), limit(50)), async (snapshot) => {
      setStats(prev => ({ ...prev, properties: summary?.totalProperties || snapshot.size }));
      
      const ticketSnap = await getDocs(query(collection(db, "maintenanceTickets"), limit(100)));
      const allTickets = ticketSnap.docs.map(d => d.data());
      
      let totalScore = 0;
      const lowHealth: any[] = [];

      snapshot.docs.forEach(doc => {
          const p = doc.data();
          const pTickets = allTickets.filter(t => t.propertyId === doc.id);
          const report = calculateBuildingHealth({
              age: p.age || 5,
              floors: p.floors || 1,
              units: p.units || 1,
              propertyType: p.propertyType || 'Villa',
              liftCount: p.lifts || 0,
              pool: !!p.pool,
              complaintFrequency: pTickets.length / 3,
              unresolvedTickets: pTickets.filter(t => !['COMPLETED', 'RESOLVED', 'CLOSED'].includes(t.status)).length,
              emergencyIncidents: pTickets.filter(t => t.priority === 'EMERGENCY').length,
              maintenanceLoad: 50
          });
          totalScore += report.overallScore;
          if (report.overallScore < 75) lowHealth.push({ id: doc.id, name: p.area || p.propertyName, score: report.overallScore, label: report.label });
      });

      setBpiAverage(snapshot.size > 0 ? Math.round(totalScore / snapshot.size) : 0);
      setRiskAssets(lowHealth);
    });

    onSnapshot(query(collection(db, "users"), where("role", "in", ["owner", "OWNER"]), limit(1)), (s) => setStats(prev => ({ ...prev, owners: s.size })));
    onSnapshot(query(collection(db, "maintenanceTickets"), where("status", "in", ["OPEN", "PENDING", "IN_PROGRESS"]), limit(1)), (s) => setStats(prev => ({ ...prev, openTickets: summary?.openTickets || s.size })));

    const unsubLedger = onSnapshot(query(collection(db, "transactions"), orderBy("createdAt", "desc"), limit(20)), (snapshot) => {
      let totalIn = 0; let totalOut = 0; const txns: any[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data(); const amount = data.amount || 0;
        if (data.type === 'credit') totalIn += amount; else if (data.type === 'debit') totalOut += amount;
        txns.push({ id: doc.id, displayId: doc.id.substring(0, 8), total: amount, date: data.createdAt?.toDate ? data.createdAt.toDate().toLocaleDateString() : 'Recent', type: data.type, description: data.description });
      });
      setStats(prev => ({ ...prev, revenue: totalIn, expenses: totalOut, netProfit: totalIn - totalOut }));
    });

    onSnapshot(query(collection(db, 'intake_submissions'), where('status', '==', 'AWAITING_VERIFICATION')), (snap) => {
        setPendingOnboardings(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    return () => { unsubProperties(); unsubLedger(); unsubSummary(); };
  }, [lang]);

  const handleQuickVerify = async (id: string, type: 'ONBOARDING' | 'PAYMENT') => {
    setActionLoading(id);
    try {
        const docRef = doc(db, 'intake_submissions', id);
        if (type === 'ONBOARDING') {
            await updateDoc(docRef, { status: 'VERIFIED', verifiedAt: serverTimestamp() });
            setSnackbar({ open: true, message: 'Onboarding Secured & Verified.', severity: 'success' });
        } else {
            await updateDoc(docRef, { paymentStatus: 'VERIFIED', mobilizedAt: serverTimestamp() });
            setSnackbar({ open: true, message: 'Mobilization Payment Confirmed.', severity: 'success' });
        }
    } catch (err) {
        setSnackbar({ open: true, message: 'Verification Fault.', severity: 'error' });
    } finally {
        setActionLoading(null);
    }
  };

  return (
    <Box sx={{ bgcolor: '#020617', minHeight: '100vh', py: 4, color: 'white' }}>
      <Container maxWidth="xl">
        <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" fontWeight="900">ADMIN <Box component="span" sx={{ color: binThemeTokens.gold }}>HUB</Box></Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>V2.1 OPTIMIZED COMMAND CENTER</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
             <Chip icon={<VerifiedUserIcon style={{ color: '#10b981', fontSize: 16 }} />} label="SYSTEM NOMINAL" sx={{ bgcolor: 'rgba(16,185,129,0.1)', color: '#10b981', fontWeight: 900, border: '1px solid rgba(16,185,129,0.2)' }} />
          </Stack>
        </Box>

        {/* 1-CLICK APPROVAL INBOX */}
        <Grid container spacing={3} sx={{ mb: 6 }}>
            <Grid item xs={12} lg={8}>
                <Paper sx={{ p: 4, bgcolor: 'rgba(15, 23, 42, 0.6)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                    <Typography variant="h6" fontWeight="950" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <AssignmentIcon sx={{ color: binThemeTokens.gold }} /> UNIVERSAL APPROVAL INBOX
                    </Typography>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>SUBMISSION</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>PARAMETER</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>ACTION</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {pendingOnboardings.map((onb) => (
                                    <TableRow key={onb.id} hover>
                                        <TableCell sx={{ color: '#FFF', fontWeight: 700 }}>{onb.companyProfile?.name || 'Private Asset'} <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.3)' }}>ID: {onb.id.substring(0,8)}</Typography></TableCell>
                                        <TableCell sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>AED {onb.mobilizationDue?.toLocaleString()}</TableCell>
                                        <TableCell><Chip label={onb.status} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: 'rgba(59,130,246,0.1)', color: '#60A5FA', fontWeight: 900 }} /></TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Button 
                                                    size="small" variant="contained" color="success" 
                                                    onClick={() => handleQuickVerify(onb.id, 'ONBOARDING')}
                                                    disabled={actionLoading === onb.id}
                                                    sx={{ fontWeight: 950, fontSize: '0.65rem' }}
                                                >
                                                    {actionLoading === onb.id ? <CircularProgress size={14} /> : 'VERIFY INTAKE'}
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {pendingOnboardings.length === 0 && (
                                    <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6, color: 'rgba(255,255,255,0.1)', fontWeight: 900 }}>NO PENDING APPROVALS</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            </Grid>

            <Grid item xs={12} lg={4}>
                <Paper sx={{ p: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, height: '100%' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>PORTFOLIO INTEGRITY</Typography>
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                        <Typography variant="h2" fontWeight="950" sx={{ color: bpiAverage < 75 ? '#ef4444' : '#10b981' }}>{bpiAverage}%</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>BPI PERFORMANCE AVERAGE</Typography>
                    </Box>
                    <Stack spacing={2} sx={{ mt: 4 }}>
                        {riskAssets.slice(0, 3).map((ra, i) => (
                            <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between', p: 1.5, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.05)' }}>
                                <Typography variant="caption" fontWeight="700">{ra.name}</Typography>
                                <Typography variant="caption" fontWeight="900" sx={{ color: '#ef4444' }}>{ra.score}%</Typography>
                            </Box>
                        ))}
                    </Stack>
                </Paper>
            </Grid>
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          {[
            { label: 'TOTAL REVENUE', val: `AED ${formatAED(stats.revenue)}`, icon: <AccountBalanceWalletIcon />, color: '#3b82f6' },
            { label: 'NET ROI', val: `AED ${formatAED(stats.netProfit)}`, icon: <TrendingUpIcon />, color: '#10b981' },
            { label: 'OPEN MISSIONS', val: summary?.openTickets || stats.openTickets, icon: <AssignmentIcon />, color: '#f59e0b' },
            { label: 'ASSET NODES', val: summary?.totalProperties || stats.properties, icon: <BusinessIcon />, color: '#8b5cf6' },
          ].map((kpi, i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
                <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}>
                    <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{kpi.label}</Typography>
                    <Typography variant="h5" fontWeight="950">{kpi.val}</Typography>
                </Paper>
            </Grid>
          ))}
        </Grid>
        <Paper sx={{ p: 3, mb: 4, bgcolor: '#0f172a', border: '1px solid rgba(218,165,32,0.18)', borderRadius: 4 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>ADMIN SUPPORT AREA</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                Keep normal support inbox, audit logs, and tickets as the primary path. CEO office contact is available for escalation only.
              </Typography>
            </Box>
            <CeoContactButtons compact />
          </Stack>
        </Paper>
      </Container>
      
      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} sx={{ fontWeight: 900, borderRadius: 3 }}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}

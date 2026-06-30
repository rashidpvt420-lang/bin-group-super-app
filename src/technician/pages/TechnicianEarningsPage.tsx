import React, { useEffect, useState } from 'react';
import {
  Box, Chip, CircularProgress, Divider, Grid, Paper,
  Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, alpha,
} from '@mui/material';
import { CheckCircle2, Clock, DollarSign, Star, TrendingUp, Wallet } from 'lucide-react';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const RATE_AED = 150;

const fmt = (n: number) =>
  `AED ${Number(n || 0).toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtDate = (value: any) => {
  if (!value) return '—';
  try {
    const d = value?.toDate ? value.toDate() : new Date(value?.seconds ? value.seconds * 1000 : value);
    return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
};

const payStatusColor = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('paid') || s.includes('approved')) return '#10b981';
  if (s.includes('pending')) return '#f59e0b';
  if (s.includes('hold') || s.includes('disputed')) return '#ef4444';
  return 'rgba(255,255,255,0.4)';
};

export default function TechnicianEarningsPage() {
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<any[]>([]);
  const [payouts, setPayouts] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }

    const jobQ = query(
      collection(db, 'maintenanceTickets'),
      where('assignedTechnicianId', '==', user.uid),
      where('status', 'in', ['completed', 'CLOSED']),
      orderBy('updatedAt', 'desc'),
      limit(100)
    );

    const unsubJobs = onSnapshot(jobQ, (snap) => {
      setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('[Earnings] jobs listener:', err);
      setLoading(false);
    });

    const payoutQ = query(
      collection(db, 'technicianPayouts'),
      where('technicianId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubPayouts = onSnapshot(payoutQ, (snap) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('[Earnings] payouts listener:', err);
    });

    return () => { unsubJobs(); unsubPayouts(); };
  }, [user?.uid]);

  const now = new Date();
  const thisMonth = jobs.filter((j) => {
    const d = j.updatedAt?.toDate ? j.updatedAt.toDate() : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  const ratings = jobs
    .map((j) => Number(j.qualityScore || j.rating || j.technicianScore || 0))
    .filter((r) => r > 0);
  const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '—';

  const grossTotal = Number(jobs.length) * RATE_AED;
  const grossMonth = Number(thisMonth.length) * RATE_AED;
  const paidTotal = payouts.filter((p) => String(p.status || '').toLowerCase().includes('paid')).reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingTotal = payouts.filter((p) => String(p.status || '').toLowerCase().includes('pending')).reduce((s, p) => s + Number(p.amount || 0), 0);

  const kpis = [
    { label: 'This Month', value: fmt(grossMonth), sub: `${thisMonth.length} jobs`, icon: <TrendingUp size={20} />, color: '#10b981' },
    { label: 'Lifetime Gross', value: fmt(grossTotal), sub: `${jobs.length} total jobs`, icon: <DollarSign size={20} />, color: binThemeTokens.gold },
    { label: 'Total Paid', value: fmt(paidTotal), sub: 'Approved payouts', icon: <Wallet size={20} />, color: '#3b82f6' },
    { label: 'Pending', value: fmt(pendingTotal), sub: 'Awaiting approval', icon: <Clock size={20} />, color: '#f59e0b' },
  ];

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} size={36} />
        <Typography variant="overline" sx={{ color: 'rgba(0,0,0,0.3)', fontWeight: 900, letterSpacing: 3 }}>
          LOADING EARNINGS...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Box sx={{ mb: 5 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
          FIELD COMPENSATION
        </Typography>
        <Typography variant="h4" fontWeight="950" sx={{ color: '#111827' }}>Earnings & Payouts</Typography>
        <Typography variant="body2" sx={{ color: '#667085', mt: 0.5 }}>
          Your payout history, job earnings, and performance breakdown.
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 5 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Paper
              elevation={0}
              sx={{ p: 3, border: `1px solid ${alpha(kpi.color, 0.2)}`, borderRadius: 4, bgcolor: alpha(kpi.color, 0.03) }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>{kpi.icon}</Box>
              </Box>
              <Typography variant="h5" fontWeight="950" sx={{ color: '#111827' }}>{kpi.value}</Typography>
              <Typography variant="caption" sx={{ color: '#374151', fontWeight: 900, textTransform: 'uppercase', display: 'block' }}>
                {kpi.label}
              </Typography>
              <Typography variant="caption" sx={{ color: '#9ca3af' }}>{kpi.sub}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {avgRating !== '—' && (
        <Paper elevation={0} sx={{ p: 3, mb: 5, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.02), display: 'flex', alignItems: 'center', gap: 2 }}>
          <Star size={24} color={binThemeTokens.gold} fill={binThemeTokens.gold} />
          <Box>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#111827' }}>{avgRating} / 5.0</Typography>
            <Typography variant="caption" sx={{ color: '#667085', fontWeight: 700 }}>
              Average quality score across {ratings.length} rated job{ratings.length !== 1 ? 's' : ''}
            </Typography>
          </Box>
        </Paper>
      )}

      {payouts.length > 0 && (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 4, mb: 5, overflow: 'hidden' }}>
          <Box sx={{ p: 3, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Wallet size={18} color={binThemeTokens.gold} />
            <Typography variant="h6" fontWeight="950" sx={{ color: '#111827' }}>Payout Records</Typography>
            <Chip label={`${payouts.length}`} size="small" sx={{ ml: 'auto', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  {['Date', 'Amount', 'Jobs Covered', 'Method', 'Status'].map((col) => (
                    <TableCell key={col} sx={{ color: '#9ca3af', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {payouts.map((payout) => {
                  const color = payStatusColor(payout.status);
                  return (
                    <TableRow key={payout.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
                          {fmtDate(payout.createdAt || payout.paidAt)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontFamily: 'monospace' }}>
                          #{payout.id.slice(0, 8).toUpperCase()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="900" sx={{ color: '#10b981' }}>
                          {fmt(payout.amount || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {payout.jobCount || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {payout.method || 'Bank Transfer'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={String(payout.status || 'pending').toUpperCase()}
                          size="small"
                          sx={{ bgcolor: alpha(color, 0.1), color, fontWeight: 950, fontSize: '0.62rem' }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <CheckCircle2 size={18} color={binThemeTokens.gold} />
          <Typography variant="h6" fontWeight="950" sx={{ color: '#111827' }}>Completed Jobs</Typography>
          <Chip label={`${jobs.length}`} size="small" sx={{ ml: 'auto', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
        </Box>

        {jobs.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Wallet size={40} color="#e5e7eb" style={{ margin: '0 auto 12px' }} />
            <Typography sx={{ color: '#9ca3af', fontWeight: 800 }}>NO COMPLETED JOBS YET</Typography>
            <Typography variant="caption" sx={{ color: '#d1d5db', display: 'block', mt: 1 }}>
              Earnings will appear here as you complete assigned jobs.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#f9fafb' }}>
                  {['Job / Property', 'Category', 'Completed', 'Est. Earning', 'Rating'].map((col) => (
                    <TableCell key={col} sx={{ color: '#9ca3af', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}>
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {jobs.map((job) => {
                  const r = Number(job.qualityScore || job.rating || job.technicianScore || 0);
                  const earn = Number(job.technicianEarning || job.payoutAmount || RATE_AED);
                  return (
                    <TableRow key={job.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
                          {job.propertyName || 'Property'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontFamily: 'monospace' }}>
                          #{job.id.slice(0, 8).toUpperCase()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {job.category || job.complaintCategory || 'Maintenance'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#374151' }}>
                          {fmtDate(job.updatedAt || job.completedAt)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="900" sx={{ color: binThemeTokens.gold }}>
                          {fmt(earn)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {r > 0 ? (
                          <Stack direction="row" alignItems="center" spacing={0.5}>
                            <Star size={13} color={binThemeTokens.gold} fill={binThemeTokens.gold} />
                            <Typography variant="body2" fontWeight="900" sx={{ color: '#111827' }}>{r.toFixed(1)}</Typography>
                          </Stack>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#d1d5db' }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Box sx={{ mt: 4, p: 3, bgcolor: '#f9fafb', borderRadius: 4, border: '1px solid #e5e7eb' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Clock size={14} color="#9ca3af" />
          <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700 }}>
            Estimated rate of AED {RATE_AED}/job is indicative. Actual payouts are approved by BIN GROUP HR and may vary by job complexity or bonuses.
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

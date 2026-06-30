import React, { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid,
  Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, alpha,
} from '@mui/material';
import { Calendar, CheckCircle2, Clock, Download, DollarSign, FileText, TrendingUp, Shield } from 'lucide-react';
import { db, collection, query, where, onSnapshot, orderBy, limit } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const MANAGEMENT_FEE_RATE = 0.05;

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

const statusColor = (status: string) => {
  const s = String(status || '').toLowerCase();
  if (s.includes('paid') || s.includes('complete')) return '#10b981';
  if (s.includes('pending') || s.includes('processing')) return '#f59e0b';
  if (s.includes('failed') || s.includes('reject')) return '#ef4444';
  return binThemeTokens.gold;
};

export default function OwnerStatementsPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<any[]>([]);
  const [passport, setPassport] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.email) { setLoading(false); return; }
    const email = user.email.toLowerCase();

    const unsubPassport = onSnapshot(
      query(collection(db, 'propertyPassports'), where('ownerEmail', '==', email)),
      (snap) => { if (!snap.empty) setPassport(snap.docs[0].data()); },
      (err) => { console.warn('[Statements] passport listener:', err); }
    );

    const unsubPayouts = onSnapshot(
      query(collection(db, 'payouts'), where('ownerEmail', '==', email), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => { setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); setLoading(false); },
      (err) => {
        console.warn('[Statements] payouts listener:', err);
        setError('Could not load payout statements. Check your network or Firestore rules.');
        setLoading(false);
      }
    );

    return () => { unsubPassport(); unsubPayouts(); };
  }, [user?.email]);

  const grossRent = Number(passport?.rentCollectedTotal || passport?.grossRentCollected || passport?.grossRent || 0);
  const maintenanceDed = Number(passport?.maintenanceCostTotal || passport?.maintenanceDeductions || 0);
  const mgmtFee = grossRent * MANAGEMENT_FEE_RATE;
  const netPayout = Math.max(grossRent - mgmtFee - maintenanceDed, 0);

  const kpis = [
    { label: tx('owner.stmt.gross', 'Gross Collected'), value: fmt(grossRent), icon: <TrendingUp size={20} />, color: '#10b981' },
    { label: tx('owner.stmt.mgmt_fee', 'Mgmt Fee (5%)'), value: fmt(mgmtFee), icon: <Shield size={20} />, color: '#3b82f6' },
    { label: tx('owner.stmt.maintenance', 'Maintenance Deducted'), value: fmt(maintenanceDed), icon: <DollarSign size={20} />, color: '#f59e0b' },
    { label: tx('owner.stmt.net_payout', 'Net Owner Payout'), value: fmt(netPayout), icon: <CheckCircle2 size={20} />, color: binThemeTokens.gold },
  ];

  if (loading) {
    return (
      <Box sx={{ height: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
        <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
          {tx('owner.stmt.loading', 'Loading Statements...')}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'flex-end' }}
        spacing={2}
        sx={{ mb: 5 }}
      >
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
            {tx('owner.stmt.eyebrow', 'OWNER FINANCIAL STATEMENTS')}
          </Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 0.5 }}>
            {tx('owner.stmt.title', 'Statements Center')}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)', mt: 0.5 }}>
            {tx('owner.stmt.subtitle', 'Monthly payout history, waterfall breakdown, and downloadable financial records.')}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Download size={16} />}
          sx={{ borderColor: alpha(binThemeTokens.gold, 0.4), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3, whiteSpace: 'nowrap' }}
          onClick={() => window.print()}
        >
          {tx('owner.stmt.export', 'Export / Print')}
        </Button>
      </Stack>

      {error && <Alert severity="warning" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3} sx={{ mb: 5 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.45)', border: `1px solid ${alpha(kpi.color, 0.22)}`, borderRadius: 5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ p: 1, bgcolor: alpha(kpi.color, 0.1), borderRadius: 2, color: kpi.color }}>{kpi.icon}</Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900 }}>
                  {tx('owner.stmt.lifetime', 'LIFETIME')}
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>{kpi.value}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, display: 'block', mt: 0.5 }}>
                {kpi.label.toUpperCase()}
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper sx={{ bgcolor: 'rgba(15,23,42,0.45)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, mb: 5, overflow: 'hidden' }}>
        <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FileText size={18} color={binThemeTokens.gold} />
          <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>
            {tx('owner.stmt.payout_history', 'Payout History')}
          </Typography>
          <Chip
            label={`${payouts.length} records`}
            size="small"
            sx={{ ml: 'auto', bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }}
          />
        </Box>

        {payouts.length === 0 ? (
          <Box sx={{ py: 10, textAlign: 'center' }}>
            <Calendar size={48} color="rgba(255,255,255,0.06)" style={{ margin: '0 auto 16px' }} />
            <Typography sx={{ color: 'rgba(255,255,255,0.25)', fontWeight: 800 }}>
              {tx('owner.stmt.no_payouts', 'NO PAYOUT RECORDS FOUND')}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.15)', display: 'block', mt: 1 }}>
              {tx('owner.stmt.no_payouts_hint', 'Payouts will appear here once BIN GROUP processes your first rental disbursement.')}
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                  {[
                    tx('owner.stmt.col_date', 'Date / Reference'),
                    tx('owner.stmt.col_property', 'Property'),
                    tx('owner.stmt.col_gross', 'Gross Rent'),
                    tx('owner.stmt.col_deductions', 'Deductions'),
                    tx('owner.stmt.col_net', 'Net Payout'),
                    tx('owner.stmt.col_status', 'Status'),
                  ].map((col) => (
                    <TableCell
                      key={col}
                      sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, fontSize: '0.7rem', textTransform: 'uppercase' }}
                    >
                      {col}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {payouts.map((payout) => {
                  const gross = Number(payout.grossAmount || payout.amount || 0);
                  const deductions = Number(payout.deductions || payout.managementFee || 0) + Number(payout.maintenanceDed || 0);
                  const net = Number(payout.netAmount || payout.netPayout || gross - deductions);
                  const color = statusColor(payout.status);
                  return (
                    <TableRow key={payout.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 700 }}>
                          {fmtDate(payout.createdAt || payout.paidAt)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>
                          #{payout.id.slice(0, 8).toUpperCase()}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 650 }}>
                          {payout.propertyName || payout.property || 'Portfolio Asset'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>{fmt(gross)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: '#f59e0b', fontWeight: 900 }}>
                          {deductions ? fmt(deductions) : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{fmt(net)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={String(payout.status || 'processed').toUpperCase()}
                          size="small"
                          sx={{
                            bgcolor: alpha(color, 0.12),
                            color,
                            fontWeight: 950,
                            fontSize: '0.62rem',
                            border: `1px solid ${alpha(color, 0.25)}`,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper sx={{ p: 4, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2, display: 'block', mb: 2 }}>
          {tx('owner.stmt.waterfall', 'REVENUE WATERFALL')}
        </Typography>
        <Stack spacing={2}>
          {[
            { label: tx('owner.stmt.gross_rent', 'Gross Rent Collected'), value: fmt(grossRent), color: '#10b981' },
            { label: tx('owner.stmt.less_mgmt', '— BIN GROUP Management Fee (5%)'), value: `(${fmt(mgmtFee)})`, color: '#f59e0b' },
            { label: tx('owner.stmt.less_maint', '— Approved Maintenance Deductions'), value: `(${fmt(maintenanceDed)})`, color: '#f59e0b' },
          ].map((row) => (
            <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 650 }}>{row.label}</Typography>
              <Typography variant="body2" sx={{ color: row.color, fontWeight: 900 }}>{row.value}</Typography>
            </Box>
          ))}
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              p: 2,
              bgcolor: alpha(binThemeTokens.gold, 0.05),
              borderRadius: 3,
              border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`,
            }}
          >
            <Typography fontWeight="950" sx={{ color: '#FFF' }}>{tx('owner.stmt.net_owner', 'Net Owner Payout')}</Typography>
            <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold }}>{fmt(netPayout)}</Typography>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 3 }}>
          <Clock size={14} color="rgba(255,255,255,0.3)" />
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
            {tx('owner.stmt.escrow_note', 'Payouts are processed after full rent verification and maintenance reconciliation by BIN GROUP.')}
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}

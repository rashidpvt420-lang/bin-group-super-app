import React, { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Grid, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Tooltip, Typography, alpha,
} from '@mui/material';
import { Clock, Download, ExternalLink, Info, Send, ShieldCheck, TrendingUp, Wallet } from 'lucide-react';
import { collection, db, functions, getDocs, httpsCallable, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';

type Notice = { type: 'success' | 'error' | 'warning' | 'info'; text: string };

type OtpState = {
  open: boolean;
  challengeId: string;
  code: string;
  expiresAt: number;
  amount: number;
  commissionCount: number;
};

const emptyOtp: OtpState = { open: false, challengeId: '', code: '', expiresAt: 0, amount: 0, commissionCount: 0 };

export default function BrokerCommissionsPage() {
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const [commissions, setCommissions] = useState<any[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [otp, setOtp] = useState<OtpState>(emptyOtp);

  const payableCommissions = useMemo(() => commissions.filter((commission) => {
    const status = String(commission.status || '').toLowerCase();
    const payoutStatus = String(commission.payoutStatus || '').toLowerCase();
    return status === 'approved' && !['requested', 'approved', 'paid'].includes(payoutStatus);
  }), [commissions]);

  const payableIds = useMemo(() => payableCommissions.map((commission) => commission.id).sort(), [payableCommissions]);

  const stats = useMemo(() => ({
    pending: commissions.filter((item) => String(item.status || '').toLowerCase() === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0),
    approved: commissions.filter((item) => String(item.status || '').toLowerCase() === 'approved').reduce((sum, item) => sum + Number(item.amount || 0), 0),
    totalPaid: commissions.filter((item) => String(item.status || '').toLowerCase() === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }), [commissions]);

  const fetchCommissions = async () => {
    if (!user?.uid) { setLoading(false); return; }
    try {
      const snapshot = await getDocs(query(collection(db, 'broker_commissions'), where('brokerId', '==', user.uid), orderBy('createdAt', 'desc')));
      setCommissions(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })));
    } catch (error) {
      console.error('[BrokerCommissions] commission query failed:', error);
      setNotice({ type: 'error', text: 'Unable to load commission records.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCommissions();
    if (!user?.uid) return () => undefined;
    const unsubscribe = onSnapshot(query(collection(db, 'broker_payout_requests'), where('brokerId', '==', user.uid)), (snapshot) => {
      const rows = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
      rows.sort((a: any, b: any) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setPayoutRequests(rows);
    }, (error) => console.warn('[BrokerCommissions] payout listener failed:', error));
    return () => unsubscribe();
  }, [user?.uid]);

  const requestPayoutOtp = async () => {
    if (!payableIds.length) { setNotice({ type: 'warning', text: 'No approved unpaid commissions are available for payout.' }); return; }
    setPayoutBusy(true);
    setNotice(null);
    try {
      const requestOtp = httpsCallable(functions, 'requestBrokerPayoutOtp');
      const result = await requestOtp({ commissionIds: payableIds });
      const data = result.data as any;
      setOtp({ open: true, challengeId: String(data?.challengeId || ''), code: '', expiresAt: Number(data?.expiresAt || 0), amount: Number(data?.amount || 0), commissionCount: Number(data?.commissionCount || payableIds.length) });
      setNotice({ type: 'info', text: 'A six-digit payout verification code was sent to your verified Broker email.' });
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Unable to send payout verification code.' });
    } finally {
      setPayoutBusy(false);
    }
  };

  const verifyAndSubmitPayout = async () => {
    if (!/^\d{6}$/.test(otp.code)) { setNotice({ type: 'warning', text: 'Enter the six-digit verification code.' }); return; }
    setPayoutBusy(true);
    setNotice(null);
    try {
      const verifyOtp = httpsCallable(functions, 'verifyBrokerPayoutOtp');
      await verifyOtp({ challengeId: otp.challengeId, otp: otp.code });
      const submitPayout = httpsCallable(functions, 'submitBrokerPayoutRequest');
      const result = await submitPayout({ challengeId: otp.challengeId, commissionIds: payableIds });
      const data = result.data as any;
      setOtp(emptyOtp);
      setNotice({ type: 'success', text: `Payout request submitted for AED ${Number(data?.amount || 0).toLocaleString()} across ${Number(data?.commissionCount || payableIds.length)} commission(s).` });
      await fetchCommissions();
    } catch (error: any) {
      setNotice({ type: 'error', text: error?.message || 'Payout verification or submission failed.' });
    } finally {
      setPayoutBusy(false);
    }
  };

  const exportReport = () => {
    const pdf = new jsPDF();
    pdf.text('BROKER COMMISSION STATEMENT', 14, 20);
    pdf.text(`Broker: ${user?.displayName || user?.email || 'N/A'}`, 14, 30);
    commissions.forEach((commission, index) => pdf.text(`${index + 1}. ${commission.id.slice(0, 8).toUpperCase()} - AED ${Number(commission.amount || 0).toLocaleString()} - ${String(commission.status || '').toUpperCase()}`, 14, 42 + (index * 7)));
    pdf.save(`commission-statement-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const latestPayout = payoutRequests[0];
  const statusColor = (status: string) => {
    switch (String(status || '').toLowerCase()) {
      case 'paid': return '#10b981';
      case 'approved': return '#3b82f6';
      case 'rejected': return '#ef4444';
      default: return binThemeTokens.gold;
    }
  };

  return (
    <BrokerPageFrame
      title="Finance & Payouts"
      subtitle="Verified commission settlement and payout tracking"
      loading={loading}
      actions={<Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
        <Button variant="contained" startIcon={<Send size={18} />} disabled={payoutBusy || payableIds.length === 0} onClick={requestPayoutOtp} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}>
          {payoutBusy ? 'PROCESSING...' : `REQUEST PAYOUT (${payableIds.length})`}
        </Button>
        <Button variant="outlined" startIcon={<Download size={18} />} onClick={exportReport}>EXPORT REPORT</Button>
      </Stack>}
    >
      {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {[
          { label: 'PENDING SETTLEMENT', value: stats.pending, icon: <Clock size={22} />, color: binThemeTokens.gold },
          { label: 'APPROVED FOR PAYOUT', value: stats.approved, icon: <ShieldCheck size={22} />, color: '#3b82f6' },
          { label: 'LIFETIME EARNED', value: stats.totalPaid, icon: <TrendingUp size={22} />, color: '#10b981' },
        ].map((item) => <Grid item xs={12} md={4} key={item.label}><Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(item.color, 0.05), border: `1px solid ${alpha(item.color, 0.15)}` }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="caption" fontWeight={900}>{item.label}</Typography><Typography variant="h4" fontWeight={950}>AED {item.value.toLocaleString()}</Typography></Box>{item.icon}</Stack></Paper></Grid>)}
      </Grid>

      <Paper sx={{ p: 3, mb: 4, borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>SECURE PAYOUT WORKFLOW</Typography>
        <Typography variant="h6" fontWeight={950}>{payableIds.length ? `${payableIds.length} approved commission(s) ready` : 'No approved commission is payable'}</Typography>
        <Typography variant="body2" color="text.secondary">Every request requires a short-lived, single-use code sent to the verified Broker email. The code is bound to the exact commissions and amount.</Typography>
        {latestPayout && <Chip sx={{ mt: 2 }} label={String(latestPayout.status || 'PENDING_ADMIN_REVIEW').replaceAll('_', ' ').toUpperCase()} />}
      </Paper>

      <TableContainer component={Paper} sx={{ borderRadius: 4, border: '1px solid #E5E7EB' }}>
        <Table>
          <TableHead><TableRow><TableCell>MISSION REF</TableCell><TableCell>SOURCE / PROPERTY</TableCell><TableCell>ALLOCATION</TableCell><TableCell>STATUS</TableCell><TableCell>SETTLEMENT</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead>
          <TableBody>
            {commissions.length === 0 ? <TableRow><TableCell colSpan={6} align="center" sx={{ py: 8 }}><Wallet size={42} /><Typography>No financial records detected.</Typography></TableCell></TableRow> : commissions.map((commission) => <TableRow key={commission.id}>
              <TableCell>#{commission.id.slice(0, 8).toUpperCase()}</TableCell>
              <TableCell>{commission.linkedLeadName || commission.linkedReferralName || commission.brokerName || 'Direct Mission'}<Typography variant="caption" display="block">{commission.linkedProperty || commission.propertyName || 'Portfolio Wide'}</Typography></TableCell>
              <TableCell>AED {Number(commission.amount || 0).toLocaleString()}</TableCell>
              <TableCell><Chip size="small" label={String(commission.status || '').toUpperCase()} sx={{ color: statusColor(commission.status), bgcolor: alpha(statusColor(commission.status), 0.1) }} /></TableCell>
              <TableCell>{commission.payoutStatus ? String(commission.payoutStatus).replaceAll('_', ' ').toUpperCase() : 'NOT REQUESTED'}</TableCell>
              <TableCell align="right"><Tooltip title="Commission record"><IconButton><ExternalLink size={18} /></IconButton></Tooltip></TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </TableContainer>

      <Paper sx={{ mt: 4, p: 3, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.03) }}><Stack direction="row" spacing={2}><Info size={20} /><Typography variant="body2">Payments remain pending until Admin Finance approves and records the bank transfer.</Typography></Stack></Paper>

      <Dialog open={otp.open} onClose={() => !payoutBusy && setOtp(emptyOtp)} fullWidth maxWidth="xs" dir={isRTL ? 'rtl' : 'ltr'}>
        <DialogTitle>Verify payout request</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>Code sent for AED {otp.amount.toLocaleString()} across {otp.commissionCount} commission(s). It expires in 10 minutes.</Alert>
          <TextField autoFocus fullWidth label="Six-digit verification code" value={otp.code} inputProps={{ inputMode: 'numeric', maxLength: 6 }} onChange={(event) => setOtp((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6) }))} />
        </DialogContent>
        <DialogActions>
          <Button disabled={payoutBusy} onClick={() => setOtp(emptyOtp)}>Cancel</Button>
          <Button disabled={payoutBusy || otp.code.length !== 6 || Date.now() > otp.expiresAt} variant="contained" onClick={verifyAndSubmitPayout}>Verify and submit</Button>
        </DialogActions>
      </Dialog>
    </BrokerPageFrame>
  );
}

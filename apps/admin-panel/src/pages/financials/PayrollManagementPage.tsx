// admin-panel/src/pages/financials/PayrollManagementPage.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Chip,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import { db, functions } from '../../lib/firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Wallet, Clock, FileText, Send } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { useAuth } from '../../context/AuthContext';

// Payroll separation of duties (Rashid, 4 Nov 2026): HR prepares, Finance Admin settles.
// UI only; adminGeneratePayrollBatch / adminSettlePayrollRecord stay the authority server-side.
export type PayrollScreenMode = 'prepare' | 'settle';
const SETTLE_ROLES = new Set(['admin', 'super_admin', 'ceo', 'finance_admin']);
const PREPARE_ROLES = new Set(['admin', 'super_admin', 'ceo', 'hr_admin', 'hr_manager']);
export const canSettlePayroll = (user: any, mfaVerified: boolean): boolean => {
  const claims = user?.claims || {};
  const role = String(user?.role || claims.role || '').trim().toLowerCase();
  if (claims.suspended === true || mfaVerified !== true) return false;
  return Boolean(claims.admin === true || claims.isAdmin === true || claims.superAdmin === true || claims.super_admin === true || claims.ceo === true || SETTLE_ROLES.has(role));
};
export const canPreparePayroll = (user: any, mfaVerified: boolean): boolean => {
  const claims = user?.claims || {};
  const role = String(user?.role || claims.role || '').trim().toLowerCase();
  if (claims.suspended === true || mfaVerified !== true) return false;
  return Boolean(claims.admin === true || claims.isAdmin === true || claims.superAdmin === true || claims.super_admin === true || claims.ceo === true || PREPARE_ROLES.has(role));
};

interface PayrollRecord {
  id: string;
  techId: string;
  techName: string;
  amount: number;
  month: string;
  status: 'pending' | 'paid';
  processedAt: any;
}

export default function PayrollManagementPage({ mode = 'settle' }: { mode?: PayrollScreenMode }) {
  const { t, lang, isRTL } = useLanguage();
  const { user, mfaVerified } = useAuth();
  const showPrepare = mode === 'prepare' && canPreparePayroll(user, mfaVerified);
  const showSettle = mode === 'settle' && canSettlePayroll(user, mfaVerified);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [openProcess, setOpenAdd] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [actionError, setActionError] = useState('');

  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const qPayroll = query(collection(db, 'payroll'));
    const unsubscribePayroll = onSnapshot(
      qPayroll,
      (snap) => setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord))),
      (error) => setActionError(error.message || 'Payroll records could not be loaded.'),
    );

    return () => {
      unsubscribePayroll();
    };
  }, []);

  // P1-2: the preview comes from the server (private HR salary, all staff roles), never from users docs.
  const [serverPreview, setServerPreview] = useState<{ count: number; total: number; skipped: string[] } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  useEffect(() => {
    if (!openProcess) return;
    let cancelled = false;
    setPreviewLoading(true);
    setServerPreview(null);
    (async () => {
      try {
        const previewPayroll = httpsCallable<
          { month: string; afterId?: string; preview: true },
          { processed: number; previewTotal?: number; skipped: string[]; nextAfterId: string | null }
        >(functions, 'adminGeneratePayrollBatch');
        let afterId = '';
        let count = 0;
        let total = 0;
        const skipped: string[] = [];
        do {
          const result = await previewPayroll({ month: currentMonth, preview: true, ...(afterId ? { afterId } : {}) });
          count += Number(result.data.processed || 0);
          total += Number(result.data.previewTotal || 0);
          skipped.push(...(Array.isArray(result.data.skipped) ? result.data.skipped : []));
          afterId = String(result.data.nextAfterId || '');
        } while (afterId && !cancelled);
        if (!cancelled) setServerPreview({ count, total: Math.round(total * 100) / 100, skipped });
      } catch (err: any) {
        if (!cancelled) setActionError(err?.message || 'Payroll preview could not be prepared on the server.');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openProcess, currentMonth]);

  const handleProcessPayroll = async () => {
    setProcessing(true);
    setActionError('');
    try {
      const generatePayroll = httpsCallable<
        { month: string; afterId?: string },
        { status: string; processed: number; skipped: string[]; nextAfterId: string | null }
      >(functions, 'adminGeneratePayrollBatch');
      let afterId = '';
      const skippedNames: string[] = [];
      let processedCount = 0;
      do {
        const result = await generatePayroll({ month: currentMonth, ...(afterId ? { afterId } : {}) });
        processedCount += Number(result.data.processed || 0);
        skippedNames.push(...(Array.isArray(result.data.skipped) ? result.data.skipped : []));
        afterId = String(result.data.nextAfterId || '');
      } while (afterId);

      const successMsg = t('fin.payroll_gen_success', { month: currentMonth });
      const skippedMsg = skippedNames.length > 0
        ? t('fin.gen_payroll_skipped', { count: skippedNames.length, names: skippedNames.join(', ') })
        : '';
      alert(processedCount === 0 && skippedMsg ? skippedMsg : (skippedMsg ? `${successMsg}\n\n${skippedMsg}` : successMsg));
      setOpenAdd(false);
    } catch (err: any) {
      console.error('Payroll failure:', err);
      setActionError(err?.message || 'Payroll generation failed before the server ledger was committed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleSettlePayment = async (record: PayrollRecord) => {
    const paymentReference = window.prompt('Enter the bank or payment reference for this payroll settlement:')?.trim() || '';
    if (paymentReference.length < 4) {
      setActionError('A payment reference of at least four characters is required.');
      return;
    }
    setProcessing(true);
    setActionError('');
    try {
      const settlePayroll = httpsCallable(functions, 'adminSettlePayrollRecord');
      const result: any = await settlePayroll({ payrollId: record.id, paymentReference });
      const payload = result?.data || {};
      if (payload.status === 'SUCCESS' || payload.success !== false) {
        alert(`Sovereign Pay Advice Secured: ${payload.pdfUrl || payload.url || 'generated'}`);
      } else {
        throw new Error(payload.message || 'Payslip generation failed');
      }
    } catch (err: any) {
      console.error('Payslip Node Fault:', err);
      setActionError(err?.message || 'Payroll settlement failed. The record remains unpaid.');
    } finally {
      setProcessing(false);
    }
  };

  const totalPayroll = payroll
    .filter(p => p.month === currentMonth)
    .reduce((sum, p) => sum + p.amount, 0);

  const previewCount = serverPreview?.count ?? 0;
  const previewTotal = serverPreview?.total ?? 0;
  const previewSkipped = serverPreview?.skipped ?? [];

  const formatAED = (val: number) => {
    return val.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      {actionError && <Alert severity="error" onClose={() => setActionError('')} sx={{ mb: 3 }}>{actionError}</Alert>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Typography variant="h4" sx={{ color: 'text.primary', fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {t('nav.technicians')} <Box component="span" sx={{ color: '#6366f1' }}>{t('fin.payroll')}</Box>
        </Typography>
        {showPrepare && (
        <Button data-testid="payroll-prepare" variant="contained" startIcon={<Wallet />} onClick={() => setOpenAdd(true)} sx={{ borderRadius: 100, px: 3, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
          {t('fin.gen_payroll_btn')}
        </Button>
        )}
      </Box>

      <Grid container spacing={3} sx={{ mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ borderRadius: 4, bgcolor: '#6366f1', color: '#fff' }}>
            <CardContent sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="overline" sx={{ fontWeight: 'bold', opacity: 0.8 }}>{t('fin.active_liabilities', { month: currentMonth })}</Typography>
              <Typography variant="h3" sx={{ fontWeight: 900 }}>{t('common.currency_aed')} {formatAED(totalPayroll)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, height: '100%', display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}><Clock size={24} /></Box>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="overline" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>{t('fin.pending_disbursement')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{t('fin.tech_count', { count: payroll.filter(p => p.status === 'pending').length })}</Typography>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, borderRadius: 4, height: '100%', display: 'flex', alignItems: 'center', gap: 2, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}><FileText size={24} /></Box>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography variant="overline" sx={{ fontWeight: 'bold', color: 'text.secondary' }}>{t('fin.paid_records')}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 900 }}>{payroll.filter(p => p.status === 'paid').length}</Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ borderRadius: 4, overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.05)' }}>
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>{t('fin.staff')}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>{t('fin.month')}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>{t('common.amount')}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>{t('dt.table.status')}</TableCell>
                <TableCell sx={{ textAlign: isRTL ? 'right' : 'left', fontWeight: 900 }}>{t('common.action')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payroll.map((record) => (
                <TableRow key={record.id} hover>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography fontWeight={800}>{record.techName}</Typography></TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{record.month}</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>{t('common.currency_aed')} {formatAED(record.amount)}</TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}><Chip label={record.status} color={record.status === 'paid' ? 'success' : 'warning'} size="small" /></TableCell>
                  <TableCell sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    {showSettle ? <Button data-testid="payroll-settle" size="small" variant="contained" disabled={processing || record.status === 'paid'} onClick={() => handleSettlePayment(record)} startIcon={processing ? <CircularProgress size={14} color="inherit" /> : <Send size={14} />} sx={{ bgcolor: '#10b981', fontWeight: 900 }}>
                      {t('fin.pay_advise') || 'PAY & ADVISE'}
                    </Button> : <Typography variant="caption" data-testid="payroll-settle-hidden">{mode === 'prepare' ? 'Prepared by HR · settled by Finance Admin' : 'Finance Admin + MFA required to settle'}</Typography>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openProcess} onClose={() => setOpenAdd(false)}>
        <DialogTitle>{t('fin.generate_payroll')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2, textAlign: isRTL ? 'right' : 'left' }}>
            {t('fin.gen_payroll_desc')}
          </Typography>
          <Alert severity="info" sx={{ textAlign: isRTL ? 'right' : 'left', direction: isRTL ? 'rtl' : 'ltr' }}>
            {previewLoading ? t('fin.gen_payroll_preview_loading') : t('fin.gen_payroll_info', { count: previewCount, currency: t('common.currency_aed'), amount: formatAED(previewTotal) })}
          </Alert>
          {previewSkipped.length > 0 && (
            <Alert severity="warning" sx={{ mt: 2, textAlign: isRTL ? 'right' : 'left', direction: isRTL ? 'rtl' : 'ltr' }}>
              {t('fin.gen_payroll_skipped', { count: previewSkipped.length, names: previewSkipped.join(', ') })}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAdd(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleProcessPayroll} disabled={processing}>{processing ? <CircularProgress size={18} /> : t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

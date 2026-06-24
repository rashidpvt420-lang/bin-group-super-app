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
import { collection, onSnapshot, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Wallet, Clock, FileText, Send } from 'lucide-react';
import { useLanguage } from '@bin/shared';

interface Technician {
  uid: string;
  displayName: string;
  email: string;
  specialization: string;
  baseSalary?: number;
}

interface PayrollRecord {
  id: string;
  techId: string;
  techName: string;
  amount: number;
  month: string;
  status: 'pending' | 'paid';
  processedAt: any;
}

export default function PayrollManagementPage() {
  const { t, lang, isRTL } = useLanguage();
  const [techs, setTechs] = useState<Technician[]>([]);
  const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
  const [openProcess, setOpenAdd] = useState(false);
  const [processing, setProcessing] = useState(false);

  const currentMonth = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
    const unsubscribeTechs = onSnapshot(qTechs, (snap) => {
      setTechs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Technician)));
    });

    const qPayroll = query(collection(db, 'payroll'));
    const unsubscribePayroll = onSnapshot(qPayroll, (snap) => {
      setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
    });

    return () => {
      unsubscribeTechs();
      unsubscribePayroll();
    };
  }, []);

  const handleProcessPayroll = async () => {
    setProcessing(true);
    try {
      const batch = writeBatch(db);
      for (const tech of techs) {
        const existing = payroll.find(p => p.techId === tech.uid && p.month === currentMonth);
        if (existing) continue;

        const amount = tech.baseSalary || 3500;
        const payrollRef = doc(collection(db, 'payroll'));
        batch.set(payrollRef, {
          techId: tech.uid,
          techName: tech.displayName || tech.email,
          amount,
          month: currentMonth,
          status: 'pending',
          createdAt: serverTimestamp(),
        });

        const txRef = doc(collection(db, 'transactions'));
        batch.set(txRef, {
          techId: tech.uid,
          amount,
          type: 'debit',
          category: 'payroll',
          description: `Salary for ${tech.displayName} - ${currentMonth}`,
          status: 'PENDING',
          createdAt: serverTimestamp(),
        });
      }

      await batch.commit();
      alert(t('fin.payroll_gen_success', { month: currentMonth }));
      setOpenAdd(false);
    } catch (err) {
      console.error('Payroll failure:', err);
    } finally {
      setProcessing(false);
    }
  };

  const handleSettlePayment = async (record: PayrollRecord) => {
    setProcessing(true);
    try {
      const payslipNode = httpsCallable(functions, 'generateAndEmailPayslip');
      const result: any = await payslipNode({ payrollId: record.id });
      const payload = result?.data || {};
      if (payload.status === 'SUCCESS' || payload.success !== false) {
        alert(`Sovereign Pay Advice Secured: ${payload.pdfUrl || payload.url || 'generated'}`);
      } else {
        throw new Error(payload.message || 'Payslip generation failed');
      }
    } catch (err: any) {
      console.error('Payslip Node Fault:', err);
      alert(err?.message || 'Institutional Payroll node failed. Check ledger permissions.');
    } finally {
      setProcessing(false);
    }
  };

  const totalPayroll = payroll.filter(p => p.month === currentMonth).reduce((sum, p) => sum + p.amount, 0);
  const formatAED = (val: number) => val.toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE');

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Typography variant="h4" sx={{ fontWeight: 900, textAlign: isRTL ? 'right' : 'left' }}>
          {t('nav.technicians')} <Box component="span" sx={{ color: '#6366f1' }}>{t('fin.payroll')}</Box>
        </Typography>
        <Button variant="contained" startIcon={<Wallet />} onClick={() => setOpenAdd(true)} sx={{ borderRadius: 100, px: 3, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}>
          {t('fin.gen_payroll_btn')}
        </Button>
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
                    <Button size="small" variant="contained" disabled={processing || record.status === 'paid'} onClick={() => handleSettlePayment(record)} startIcon={processing ? <CircularProgress size={14} color="inherit" /> : <Send size={14} />} sx={{ bgcolor: '#10b981', fontWeight: 900 }}>
                      {t('fin.pay_advise') || 'PAY & ADVISE'}
                    </Button>
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
          <Alert severity="info" sx={{ mt: 1 }}>{t('fin.generate_payroll_confirm', { month: currentMonth })}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenAdd(false)}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={handleProcessPayroll} disabled={processing}>{processing ? <CircularProgress size={18} /> : t('common.confirm')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

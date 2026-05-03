import React, { useState, useEffect } from 'react';
import {
    Grid, Typography, Box, Paper, Button, Chip, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, Alert, 
    CircularProgress, alpha, Stack, IconButton
} from '@mui/material';
import { 
    Wallet, Clock, FileText, Send, CheckCircle, AlertCircle
} from 'lucide-react';
import { collection, onSnapshot, query, where, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

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
    const { t, lang } = useLanguage();
    const [techs, setTechs] = useState<Technician[]>([]);
    const [payroll, setPayroll] = useState<PayrollRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [openProcess, setOpenAdd] = useState(false);

    const currentMonth = new Date().toISOString().slice(0, 7);

    useEffect(() => {
        const qTechs = query(collection(db, 'users'), where('role', '==', 'technician'));
        const unsubscribeTechs = onSnapshot(qTechs, (snap) => {
            setTechs(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Technician)));
        });

        const qPayroll = query(collection(db, 'payroll'));
        const unsubscribePayroll = onSnapshot(qPayroll, (snap) => {
            setPayroll(snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRecord)));
            setLoading(false);
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
                    description: `Salary for ${tech.displayName || tech.email} - ${currentMonth}`,
                    status: 'PENDING',
                    createdAt: serverTimestamp(),
                });
            }
            await batch.commit();
            setOpenAdd(false);
        } catch (err) {
            console.error("Payroll failure:", err);
        } finally {
            setProcessing(false);
        }
    };

    const handleSettlePayment = async (record: PayrollRecord) => {
        setProcessing(true);
        try {
            const payslipNode = httpsCallable(functions, 'processStaffPayslip');
            await payslipNode({ payrollId: record.id });
        } catch (err) {
            console.error("Payslip Node Fault:", err);
        } finally {
            setProcessing(false);
        }
    };

    const totalPayroll = payroll
        .filter(p => p.month === currentMonth)
        .reduce((sum, p) => sum + p.amount, 0);

    return (
        <AdminPageFrame
            title={t('fin.payroll_title') || 'Payroll Management'}
            subtitle={t('fin.payroll_subtitle') || 'Institutional disbursement & staff compensation'}
            loading={loading}
            isEmpty={payroll.length === 0}
            emptyMessage={t('fin.payroll_empty') || 'No payroll records found.'}
            breadcrumbs={[{ label: t('fin.payroll') }]}
            actions={
                <Button 
                    variant="contained" 
                    startIcon={<Wallet size={18} />}
                    onClick={() => setOpenAdd(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                >
                    {t('fin.gen_payroll_btn')}
                </Button>
            }
        >
            <Grid container spacing={4}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                        <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>{t('fin.active_liabilities')}</Typography>
                        <Typography variant="h3" fontWeight="950" sx={{ color: binThemeTokens.gold }}>
                            AED {totalPayroll.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">{currentMonth}</Typography>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Box sx={{ p: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3 }}>
                            <Clock size={32} color={binThemeTokens.gold} />
                        </Box>
                        <Box>
                            <Typography variant="overline" color="textSecondary" sx={{ fontWeight: 900 }}>{t('fin.pending_disbursement')}</Typography>
                            <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>
                                {payroll.filter(p => p.status === 'pending').length} {t('common.staff')}
                            </Typography>
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('fin.table.technician').toUpperCase()}</TableCell>
                                    <TableCell>{t('fin.table.month').toUpperCase()}</TableCell>
                                    <TableCell>{t('fin.table.amount').toUpperCase()}</TableCell>
                                    <TableCell>{t('design.table.status').toUpperCase()}</TableCell>
                                    <TableCell align="right">{t('common.actions').toUpperCase()}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payroll.sort((a,b) => b.month.localeCompare(a.month)).map((record) => (
                                    <TableRow key={record.id} hover>
                                        <TableCell sx={{ fontWeight: 800, color: '#FFF' }}>{record.techName}</TableCell>
                                        <TableCell>{record.month}</TableCell>
                                        <TableCell sx={{ fontWeight: 900, color: binThemeTokens.gold }}>
                                            AED {record.amount.toLocaleString()}
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={record.status?.toUpperCase()} 
                                                size="small"
                                                color={record.status === 'paid' ? 'success' : 'warning'}
                                                sx={{ fontWeight: 900, fontSize: '0.65rem' }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            {record.status === 'pending' ? (
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    color="success" 
                                                    onClick={() => handleSettlePayment(record)}
                                                    disabled={processing}
                                                    startIcon={processing ? <CircularProgress size={14} color="inherit" /> : <Send size={14} />}
                                                    sx={{ borderRadius: 2, fontWeight: 900 }}
                                                >
                                                    {t('fin.settle_payment') || 'PAY'}
                                                </Button>
                                            ) : (
                                                <IconButton size="small">
                                                    <FileText size={18} color={binThemeTokens.gold} />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            <Dialog open={openProcess} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } }}>
                <DialogTitle sx={{ fontWeight: 950, color: binThemeTokens.gold }}>{t('fin.gen_payroll_title')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2, color: 'rgba(255,255,255,0.6)' }}>
                        {t('fin.gen_payroll_desc')}
                    </Typography>
                    <Alert severity="info" icon={<AlertCircle />}>
                        {t('fin.gen_payroll_info', { count: techs.length })}
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.cancel')}</Button>
                    <Button variant="contained" onClick={handleProcessPayroll} disabled={processing} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                        {t('fin.confirm_execute')}
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}


// src/tenant/pages/TenantPaymentsPage.tsx
// Tenant can view payment history, upcoming payments, receipts, upload proof

import React, { useEffect, useState } from 'react';
import {
    Box, Paper, Typography, Stack, Chip, Grid, Button,
    CircularProgress, Alert, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, alpha, Divider, TextField, Dialog,
    DialogTitle, DialogContent, DialogActions, InputAdornment
} from '@mui/material';
import { DollarSign, Upload, FileText, CheckCircle2, Clock, AlertTriangle, CreditCard } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type Payment = {
    id: string;
    amount: number;
    status: string;
    reference?: string;
    period?: string;
    createdAt: any;
    verifiedAt?: any;
    receiptUrl?: string;
    notes?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
    VERIFIED: { label: 'VERIFIED', color: '#10b981' },
    APPROVED: { label: 'APPROVED', color: '#10b981' },
    PENDING: { label: 'PENDING VERIFICATION', color: '#f59e0b' },
    ADMIN_VERIFICATION_REQUIRED: { label: 'AWAITING ADMIN', color: '#f59e0b' },
    REJECTED: { label: 'REJECTED', color: '#ef4444' },
    OVERDUE: { label: 'OVERDUE', color: '#ef4444' },
};

export default function TenantPaymentsPage() {
    const { user } = useRole();
    const navigate = useNavigate();
    const { tx, isRTL } = useLanguage();

    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', error: false });

    // Upload proof form
    const [proofForm, setProofForm] = useState({
        amount: '',
        reference: '',
        bankName: '',
        period: '',
        notes: '',
    });

    useEffect(() => {
        if (!user?.uid) return;
        const listeners: (() => void)[] = [];

        // Listen by uid
        listeners.push(onSnapshot(
            query(collection(db, 'payment_transactions'), where('tenantId', '==', user.uid), orderBy('createdAt', 'desc')),
            (snap) => {
                setPayments(snap.docs.map(d => ({
                    id: d.id,
                    amount: d.data().amount || 0,
                    status: d.data().status || 'PENDING',
                    reference: d.data().reference || d.data().bankRef || d.data().transactionRef,
                    period: d.data().period || d.data().rentPeriod,
                    createdAt: d.data().createdAt,
                    verifiedAt: d.data().verifiedAt,
                    receiptUrl: d.data().receiptUrl,
                    notes: d.data().notes,
                })));
                setLoading(false);
            },
            () => setLoading(false)
        ));

        // Also listen by email
        if (user.email) {
            listeners.push(onSnapshot(
                query(collection(db, 'payment_transactions'), where('tenantEmail', '==', user.email.toLowerCase()), orderBy('createdAt', 'desc')),
                (snap) => {
                    setPayments(prev => {
                        const map = new Map(prev.map(p => [p.id, p]));
                        snap.docs.forEach(d => {
                            if (!map.has(d.id)) {
                                map.set(d.id, {
                                    id: d.id,
                                    amount: d.data().amount || 0,
                                    status: d.data().status || 'PENDING',
                                    reference: d.data().reference,
                                    period: d.data().period,
                                    createdAt: d.data().createdAt,
                                    verifiedAt: d.data().verifiedAt,
                                    receiptUrl: d.data().receiptUrl,
                                    notes: d.data().notes,
                                });
                            }
                        });
                        return Array.from(map.values()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
                    });
                    setLoading(false);
                },
                () => {}
            ));
        }

        return () => listeners.forEach(u => u());
    }, [user?.uid, user?.email]);

    const handleSubmitProof = async () => {
        if (!proofForm.amount.trim() || !user?.uid) return;
        setUploading(true);
        try {
            await addDoc(collection(db, 'payment_transactions'), {
                tenantId: user.uid,
                tenantEmail: user.email || '',
                tenantName: user.displayName || '',
                amount: parseFloat(proofForm.amount),
                reference: proofForm.reference.trim(),
                bankName: proofForm.bankName.trim(),
                period: proofForm.period.trim(),
                notes: proofForm.notes.trim(),
                status: 'ADMIN_VERIFICATION_REQUIRED',
                paymentVerified: false,
                submittedByTenant: true,
                createdAt: serverTimestamp(),
            });
            setSnackbar({ open: true, message: 'Payment proof submitted. Admin will verify within 24 hours.', error: false });
            setUploadDialogOpen(false);
            setProofForm({ amount: '', reference: '', bankName: '', period: '', notes: '' });
        } catch {
            setSnackbar({ open: true, message: 'Failed to submit payment proof.', error: true });
        } finally {
            setUploading(false);
        }
    };

    const formatDate = (ts: any) => {
        if (!ts) return '—';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const totalPaid = payments.filter(p => ['VERIFIED', 'APPROVED'].includes(p.status)).reduce((sum, p) => sum + p.amount, 0);
    const totalPending = payments.filter(p => ['PENDING', 'ADMIN_VERIFICATION_REQUIRED'].includes(p.status)).reduce((sum, p) => sum + p.amount, 0);

    return (
        <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 8 }}>
            {/* Header */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 3 }}>
                        PAYMENTS & RECEIPTS
                    </Typography>
                    <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mt: 0.5 }}>
                        Your Payment History
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 0.5 }}>
                        View all payments, submit proof, and track verification status.
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Upload size={18} />}
                    onClick={() => setUploadDialogOpen(true)}
                    sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3 }}
                >
                    SUBMIT PAYMENT PROOF
                </Button>
            </Box>

            {/* KPI Summary */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {[
                    { label: 'Total Verified', value: `AED ${totalPaid.toLocaleString()}`, color: '#10b981', icon: <CheckCircle2 size={20} /> },
                    { label: 'Pending Verification', value: `AED ${totalPending.toLocaleString()}`, color: '#f59e0b', icon: <Clock size={20} /> },
                    { label: 'Total Transactions', value: payments.length, color: '#3b82f6', icon: <DollarSign size={20} /> },
                    { label: 'Documents', value: payments.filter(p => p.receiptUrl).length, color: '#8b5cf6', icon: <FileText size={20} /> },
                ].map(kpi => (
                    <Grid item xs={6} md={3} key={kpi.label}>
                        <Paper sx={{ p: 2.5, bgcolor: 'rgba(15,23,42,0.6)', border: `1px solid ${alpha(kpi.color, 0.25)}`, borderRadius: 4 }}>
                            <Box sx={{ color: kpi.color, mb: 1 }}>{kpi.icon}</Box>
                            <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>{kpi.value}</Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>{kpi.label}</Typography>
                        </Paper>
                    </Grid>
                ))}
            </Grid>

            {/* How to Pay Banner */}
            <Paper sx={{ p: 3, mb: 4, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 4 }}>
                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 1 }}>HOW TO SUBMIT PAYMENT</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>
                    <Typography variant="body2">1. Transfer rent to the BIN Group bank account (see your contract for details)</Typography>
                    <Typography variant="body2">2. Click "SUBMIT PAYMENT PROOF" and enter the transfer reference</Typography>
                    <Typography variant="body2">3. Admin will verify within 24 hours and update your status</Typography>
                </Stack>
            </Paper>

            {/* Payments Table */}
            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.55)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5, overflow: 'hidden' }}>
                <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CreditCard size={20} color={binThemeTokens.gold} /> Payment Transactions
                    </Typography>
                </Box>
                {loading ? (
                    <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>
                ) : payments.length === 0 ? (
                    <Box sx={{ p: 8, textAlign: 'center' }}>
                        <DollarSign size={48} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 16px' }} />
                        <Typography sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800 }}>NO PAYMENT RECORDS YET</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>
                            Submit your first payment proof to get started.
                        </Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>DATE</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>AMOUNT</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>REFERENCE</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>PERIOD</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>STATUS</TableCell>
                                    <TableCell sx={{ bgcolor: '#0a0f1e', color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} align="right">RECEIPT</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payments.map((payment) => {
                                    const config = STATUS_CONFIG[payment.status] || { label: payment.status, color: 'rgba(255,255,255,0.4)' };
                                    return (
                                        <TableRow key={payment.id} hover>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' }}>{formatDate(payment.createdAt)}</TableCell>
                                            <TableCell sx={{ color: '#fff', fontWeight: 700 }}>AED {payment.amount.toLocaleString()}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{payment.reference || '—'}</TableCell>
                                            <TableCell sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>{payment.period || '—'}</TableCell>
                                            <TableCell>
                                                <Chip label={config.label} size="small" sx={{ bgcolor: alpha(config.color, 0.1), color: config.color, fontWeight: 900, fontSize: '0.6rem' }} />
                                            </TableCell>
                                            <TableCell align="right">
                                                {payment.receiptUrl ? (
                                                    <Button size="small" variant="outlined" sx={{ fontWeight: 900, fontSize: '0.65rem', color: binThemeTokens.gold, borderColor: binThemeTokens.gold }} onClick={() => window.open(payment.receiptUrl, '_blank')}>
                                                        VIEW
                                                    </Button>
                                                ) : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)' }}>—</Typography>}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Upload Proof Dialog */}
            <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="sm" fullWidth
                PaperProps={{ sx: { bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4 } }}
            >
                <DialogTitle sx={{ color: '#fff', fontWeight: 900, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    Submit Payment Proof
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={2.5}>
                        <TextField
                            fullWidth label="Amount (AED)" type="number" value={proofForm.amount}
                            onChange={e => setProofForm(p => ({ ...p, amount: e.target.value }))}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                        <TextField
                            fullWidth label="Bank Transfer Reference / Transaction ID" value={proofForm.reference}
                            onChange={e => setProofForm(p => ({ ...p, reference: e.target.value }))}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                        <TextField
                            fullWidth label="Bank Name (optional)" value={proofForm.bankName}
                            onChange={e => setProofForm(p => ({ ...p, bankName: e.target.value }))}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                        <TextField
                            fullWidth label="Payment Period (e.g. July 2026)" value={proofForm.period}
                            onChange={e => setProofForm(p => ({ ...p, period: e.target.value }))}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                        <TextField
                            fullWidth label="Notes (optional)" multiline rows={2} value={proofForm.notes}
                            onChange={e => setProofForm(p => ({ ...p, notes: e.target.value }))}
                            sx={{ '& .MuiInputBase-root': { color: '#fff' }, '& label': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.2)' } }}
                        />
                        <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.05), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 3 }}>
                            Admin will verify your payment within 24 hours. You will be notified once confirmed.
                        </Alert>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setUploadDialogOpen(false)} sx={{ color: 'rgba(255,255,255,0.5)' }}>CANCEL</Button>
                    <Button variant="contained" onClick={handleSubmitProof} disabled={uploading || !proofForm.amount.trim()}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }}
                    >
                        {uploading ? 'SUBMITTING...' : 'SUBMIT PROOF'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Snackbar */}
            {snackbar.open && (
                <Alert severity={snackbar.error ? 'error' : 'success'} onClose={() => setSnackbar(p => ({ ...p, open: false }))}
                    sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, fontWeight: 900, borderRadius: 3 }}>
                    {snackbar.message}
                </Alert>
            )}
        </Box>
    );
}

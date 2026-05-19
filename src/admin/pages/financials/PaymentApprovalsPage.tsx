import React, { useState, useEffect } from 'react';
import { 
    Paper, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Button, Chip, CircularProgress,
    TextField, Stack, Dialog, DialogTitle, DialogContent, 
    DialogActions, alpha, Grid, Typography, Box, IconButton,
    Tooltip, Badge
} from '@mui/material';
import { 
    ShieldCheck, Wallet, Receipt, Clock, 
    CheckCircle, XCircle, Search, FileText, 
    ExternalLink, Building2, User, Mail,
    CreditCard, Calendar, AlertCircle
} from 'lucide-react';
import { db, auth, functions, collection, query, where, onSnapshot, httpsCallable } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

interface PaymentTransaction {
    id: string;
    paymentId: string;
    ownerId: string;
    ownerEmail: string;
    ownerName: string;
    onboardingSessionId: string;
    intakeId: string;
    companyProfile: any;
    properties: any[];
    selectedPlan: any;
    selectedAddOns: any[];
    annualContractValue: number;
    mobilizationAmount: number;
    paymentMethod: string;
    currency: string;
    status: string;
    createdAt: any;
    updatedAt: any;
}

export default function PaymentApprovalsPage() {
    const { t, isRTL } = useLanguage();
    const [payments, setPayments] = useState<PaymentTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [selectedPayment, setSelectedPayment] = useState<PaymentTransaction | null>(null);
    
    // Approval Dialog State
    const [approveDialogOpen, setApproveDialogOpen] = useState(false);
    const [approveNotes, setApproveNotes] = useState('');
    
    // Rejection Dialog State
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');

    useEffect(() => {
        const q = query(
            collection(db, 'payment_transactions'),
            where('status', 'in', ['PENDING', 'pending_admin_verification', 'payment_pending_approval', 'pending_approval'])
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as PaymentTransaction));
            setPayments(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Payment load fault:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async () => {
        if (!selectedPayment) return;

        setProcessingId(selectedPayment.id);
        setApproveDialogOpen(false);
        
        try {
            const adminApprovePayment = httpsCallable(functions, 'adminApprovePayment');
            await adminApprovePayment({
                paymentId: selectedPayment.id,
                notes: approveNotes || "Verified via Admin Hub."
            });
            // Success alert or snackbar
        } catch (error: any) {
            console.error("Approval Failed:", error);
            alert("Approval Failed: " + (error.message || "Unknown error"));
        } finally {
            setProcessingId(null);
            setSelectedPayment(null);
            setApproveNotes('');
        }
    };

    const handleReject = async () => {
        if (!selectedPayment || !rejectionReason) {
            alert("Please provide a reason for rejection.");
            return;
        }

        setProcessingId(selectedPayment.id);
        setRejectDialogOpen(false);
        
        try {
            const adminRejectPayment = httpsCallable(functions, 'adminRejectPayment');
            await adminRejectPayment({
                paymentId: selectedPayment.id,
                reason: rejectionReason
            });
        } catch (error: any) {
            console.error("Rejection Failed:", error);
            alert("Rejection Failed: " + (error.message || "Unknown error"));
        } finally {
            setProcessingId(null);
            setSelectedPayment(null);
            setRejectionReason('');
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-AE', { style: 'currency', currency: 'AED' }).format(val);
    };

    const formatDate = (timestamp: any) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString();
    };

    return (
        <AdminPageFrame
            title="PAYMENT APPROVALS"
            subtitle="Verify owner mobilization deposits and activate institutional accounts"
            loading={loading}
            isEmpty={payments.length === 0}
            emptyMessage="ALL PAYMENT QUEUES CLEARED"
            breadcrumbs={[{ label: 'Financials' }, { label: 'Approvals' }]}
        >
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 6, bgcolor: 'rgba(2, 6, 23, 0.4)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                        <Table sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
                            <TableHead>
                                <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', py: 2 }}>Owner / Entity</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', py: 2 }}>Contract Details</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', py: 2 }}>Financials</TableCell>
                                    <TableCell sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', py: 2 }}>Method & Date</TableCell>
                                    <TableCell align="right" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.7rem', py: 2 }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payments.map((payment) => (
                                    <TableRow key={payment.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)', py: 3 }}>
                                            <Stack spacing={1}>
                                                <Stack direction="row" spacing={1.5} alignItems="center">
                                                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold }}>
                                                        <User size={18} />
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight="950" sx={{ color: '#FFF' }}>{payment.ownerName}</Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Mail size={12} /> {payment.ownerEmail}
                                                        </Typography>
                                                    </Box>
                                                </Stack>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Building2 size={14} color={binThemeTokens.gold} />
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 700 }}>
                                                        {payment.companyProfile?.name || 'Private Entity'}
                                                    </Typography>
                                                </Stack>
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)', py: 3 }}>
                                            <Stack spacing={1}>
                                                <Typography variant="body2" fontWeight="800" sx={{ color: '#FFF' }}>
                                                    {payment.selectedPlan?.name || 'Institutional Package'}
                                                </Typography>
                                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                                    <Chip 
                                                        label={`${payment.properties?.length || 0} Assets`}
                                                        size="small"
                                                        sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.6)', fontWeight: 900, fontSize: '0.6rem' }}
                                                    />
                                                    {payment.selectedAddOns?.length > 0 && (
                                                        <Chip 
                                                            label={`${payment.selectedAddOns.length} Add-ons`}
                                                            size="small"
                                                            sx={{ bgcolor: 'rgba(198,167,94,0.1)', color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }}
                                                        />
                                                    )}
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)', py: 3 }}>
                                            <Stack spacing={0.5}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>ACV: {formatCurrency(payment.annualContractValue)}</Typography>
                                                <Typography variant="h6" fontWeight="950" sx={{ color: '#10b981' }}>
                                                    {formatCurrency(payment.mobilizationAmount)}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900, textTransform: 'uppercase', fontSize: '0.6rem' }}>15% Mobilization</Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)', py: 3 }}>
                                            <Stack spacing={1}>
                                                <Chip 
                                                    icon={<CreditCard size={14} />}
                                                    label={payment.paymentMethod?.replace('_', ' ') || 'MANUAL'} 
                                                    size="small" 
                                                    sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.65rem' }} 
                                                />
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Calendar size={12} /> {formatDate(payment.createdAt)}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell align="right" sx={{ borderBottom: '1px solid rgba(255,255,255,0.03)', py: 3 }}>
                                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                <Tooltip title="Reject Payment">
                                                    <IconButton 
                                                        onClick={() => {
                                                            setSelectedPayment(payment);
                                                            setRejectDialogOpen(true);
                                                        }}
                                                        disabled={processingId === payment.id}
                                                        sx={{ color: '#ef4444', bgcolor: 'rgba(239, 68, 68, 0.1)', '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.2)' } }}
                                                    >
                                                        <XCircle size={20} />
                                                    </IconButton>
                                                </Tooltip>
                                                <Button
                                                    variant="contained"
                                                    onClick={() => {
                                                        setSelectedPayment(payment);
                                                        setApproveDialogOpen(true);
                                                    }}
                                                    disabled={processingId === payment.id}
                                                    startIcon={processingId === payment.id ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={18} />}
                                                    sx={{ 
                                                        bgcolor: binThemeTokens.gold, 
                                                        color: '#000', 
                                                        fontWeight: 950, 
                                                        px: 3,
                                                        borderRadius: 100,
                                                        '&:hover': { bgcolor: alpha(binThemeTokens.gold, 0.8) }
                                                    }}
                                                >
                                                    APPROVE
                                                </Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            {/* Approval Dialog */}
            <Dialog 
                open={approveDialogOpen} 
                onClose={() => setApproveDialogOpen(false)} 
                PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 500, width: '100%' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                    CONFIRM SETTLEMENT
                </DialogTitle>
                <DialogContent sx={{ pt: 4 }}>
                    <Stack spacing={3}>
                        <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase' }}>Activation Target</Typography>
                            <Typography variant="h6" fontWeight="950" sx={{ mt: 1 }}>{selectedPayment?.ownerName}</Typography>
                            <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 700, mt: 0.5 }}>
                                Amount: {selectedPayment ? formatCurrency(selectedPayment.mobilizationAmount) : ''}
                            </Typography>
                        </Box>
                        
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                            Approving this payment will immediately unlock the owner dashboard, activate all associated property passports, and finalize the management contract.
                        </Typography>

                        <TextField 
                            label="INTERNAL AUDIT NOTES" 
                            multiline rows={3}
                            fullWidth 
                            value={approveNotes}
                            onChange={e => setApproveNotes(e.target.value)}
                            sx={{ 
                                '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' },
                                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }
                            }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setApproveDialogOpen(false)} sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleApprove}
                        sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, borderRadius: 100, px: 4, '&:hover': { bgcolor: '#059669' } }}
                    >
                        CONFIRM & ACTIVATE
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Rejection Dialog */}
            <Dialog 
                open={rejectDialogOpen} 
                onClose={() => setRejectDialogOpen(false)} 
                PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 500, width: '100%' } }}
            >
                <DialogTitle sx={{ fontWeight: 950, color: '#ef4444', borderBottom: '1px solid rgba(255,255,255,0.05)', py: 3 }}>
                    REJECT PAYMENT
                </DialogTitle>
                <DialogContent sx={{ pt: 4 }}>
                    <Stack spacing={3}>
                        <Box sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, textTransform: 'uppercase' }}>Target Entity</Typography>
                            <Typography variant="h6" fontWeight="950" sx={{ mt: 1, color: '#ef4444' }}>{selectedPayment?.ownerName}</Typography>
                        </Box>
                        
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                            Please provide a clear reason for rejection. This will be logged and the owner will be notified to correct the payment submission.
                        </Typography>

                        <TextField 
                            label="REJECTION REASON" 
                            multiline rows={3}
                            fullWidth 
                            required
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                            sx={{ 
                                '& .MuiOutlinedInput-root': { borderRadius: 4, bgcolor: 'rgba(255,255,255,0.02)' },
                                '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.4)' }
                            }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setRejectDialogOpen(false)} sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleReject}
                        sx={{ bgcolor: '#ef4444', color: '#FFF', fontWeight: 950, borderRadius: 100, px: 4, '&:hover': { bgcolor: '#dc2626' } }}
                    >
                        CONFIRM REJECTION
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}

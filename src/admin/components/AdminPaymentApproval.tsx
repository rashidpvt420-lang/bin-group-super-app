import React, { useState, useEffect } from 'react';
import { 
    Paper, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Button, Chip, CircularProgress,
    TextField, Stack, Dialog, DialogTitle, DialogContent, 
    DialogActions, alpha, Grid, Typography, Box, IconButton
} from '@mui/material';
import { 
    ShieldCheck, Wallet, Receipt, Clock, 
    CheckCircle, XCircle, Search, FileText, ExternalLink
} from 'lucide-react';
import axios from 'axios';
import { db, auth, collection, query, where, onSnapshot } from '@/lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../theme/adminTheme';
import AdminPageFrame from './AdminPageFrame';

interface Contract {
    id: string;
    paymentId: string;
    amount: number;
    currency: string;
    ownerId: string;
    propertyId: string;
    provider: string;
    status: string;
    paymentVerified: boolean;
    createdAt: any;
    propertyName?: string;
    ownerEmail?: string;
}

export default function AdminPaymentApproval() {
    const { t, lang } = useLanguage();
    const [pendingContracts, setPendingContracts] = useState<Contract[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
    const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
    
    const [referenceId, setReferenceId] = useState('');
    const [notes, setNotes] = useState('');
    const [amountReceived, setAmountReceived] = useState<number | ''>('');

    useEffect(() => {
        const q = query(
            collection(db, 'contracts'),
            where('status', '==', 'pending_approval'),
            where('paymentVerified', '==', false)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            } as Contract));
            setPendingContracts(fetched);
            setLoading(false);
        }, (err) => {
            console.error("Payment load fault:", err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleVerify = async () => {
        if (!selectedContract || !referenceId) return;

        setProcessingId(selectedContract.id);
        setVerifyDialogOpen(false);
        
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("UNAUTHENTICATED");

            const token = await user.getIdToken(true);
            const functionUrl = 'https://adminverifypayment-sc33mcrduq-uc.a.run.app';
            
            await axios.post(functionUrl, {
                data: {
                    contractId: selectedContract.id,
                    paymentId: selectedContract.paymentId,
                    method: selectedContract.provider,
                    referenceId,
                    amountReceived: amountReceived || selectedContract.amount,
                    notes: notes || "Verified via Admin Hub.",
                    receivedAt: new Date().toISOString()
                }
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            alert("Payment Verified Successfully.");
        } catch (error: any) {
            alert("Verification Failed: " + (error.response?.data?.error?.message || error.message));
        } finally {
            setProcessingId(null);
            setSelectedContract(null);
        }
    };

    return (
        <AdminPageFrame
            title={t('onboarding.payment.verify_btn') || 'VERIFY PAYMENTS'}
            subtitle="Secure settlement vault and financial reconciliation"
            loading={loading}
            isEmpty={pendingContracts.length === 0}
            emptyMessage="ALL PAYMENT QUEUES CLEARED"
            breadcrumbs={[{ label: 'Verify Payment' }]}
        >
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.01)' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>TRANSACTION</TableCell>
                                    <TableCell>OWNER/PROPERTY</TableCell>
                                    <TableCell>AMOUNT</TableCell>
                                    <TableCell>METHOD</TableCell>
                                    <TableCell align="right">ACTION</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {pendingContracts.map((contract) => (
                                    <TableRow key={contract.id} hover>
                                        <TableCell>
                                            <Stack spacing={0.5}>
                                                <Typography variant="body2" fontWeight="900" sx={{ fontFamily: 'monospace' }}>
                                                    {contract.paymentId || contract.id.substring(0, 12)}
                                                </Typography>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                                    INITIATED: {contract.createdAt?.toDate ? contract.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                                </Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Stack spacing={0.5}>
                                                <Typography variant="body2" fontWeight="700">{contract.propertyName || 'ASSET NODE'}</Typography>
                                                <Typography variant="caption" sx={{ color: binThemeTokens.gold }}>{contract.ownerEmail || 'OWNER'}</Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body1" fontWeight="950" sx={{ color: '#10b981' }}>
                                                AED {contract.amount.toLocaleString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={contract.provider?.toUpperCase() || 'MANUAL'} 
                                                size="small" 
                                                sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.6rem' }} 
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                variant="contained"
                                                onClick={() => {
                                                    setSelectedContract(contract);
                                                    setAmountReceived(contract.amount);
                                                    setVerifyDialogOpen(true);
                                                }}
                                                disabled={processingId === contract.id}
                                                startIcon={processingId === contract.id ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={16} />}
                                                sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, fontSize: '0.65rem' }}
                                            >
                                                VERIFY SETTLEMENT
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Grid>
            </Grid>

            <Dialog open={verifyDialogOpen} onClose={() => setVerifyDialogOpen(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' } }}>
                <DialogTitle sx={{ fontWeight: 950, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    SECURE SETTLEMENT BINDING
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={3} sx={{ mt: 1 }}>
                        <TextField 
                            label="BANK REFERENCE / TX ID" 
                            fullWidth 
                            value={referenceId}
                            onChange={e => setReferenceId(e.target.value)}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                        />
                        <TextField 
                            label="CONFIRMED AMOUNT (AED)" 
                            type="number"
                            fullWidth 
                            value={amountReceived}
                            onChange={e => setAmountReceived(Number(e.target.value))}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                        />
                        <TextField 
                            label="INTERNAL AUDIT NOTES" 
                            multiline rows={3}
                            fullWidth 
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setVerifyDialogOpen(false)} sx={{ fontWeight: 900, color: 'rgba(255,255,255,0.4)' }}>CANCEL</Button>
                    <Button 
                        variant="contained" 
                        onClick={handleVerify}
                        sx={{ bgcolor: '#10b981', color: '#FFF', fontWeight: 950, borderRadius: 100, px: 4 }}
                    >
                        CONFIRM & ACTIVATE
                    </Button>
                </DialogActions>
            </Dialog>
        </AdminPageFrame>
    );
}


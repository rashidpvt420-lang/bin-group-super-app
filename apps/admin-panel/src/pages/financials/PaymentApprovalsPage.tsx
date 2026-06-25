import React from 'react';
import { Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';

type PaymentRecord = {
    id: string;
    ownerName?: string;
    companyName?: string;
    ownerEmail?: string;
    ownerId?: string;
    ownerUid?: string;
    contractId?: string;
    intakeId?: string;
    recordType?: string;
    transactionType?: string;
    paymentType?: string;
    status?: string;
    verificationState?: string;
    paymentStatus?: string;
    paymentMethod?: string;
    paymentReference?: string;
    paymentReferenceId?: string;
    referenceId?: string;
    receiptUrl?: string;
    proofUrl?: string;
    attachmentUrl?: string;
    proofFileName?: string;
    notes?: string;
    adminNotes?: string;
    tenantName?: string;
    propertyName?: string;
    propertyId?: string;
    unitNumber?: string;
    annualValue?: number;
    totalAnnualValue?: number;
    amount?: number;
    amountPaid?: number;
    rentPaid?: number;
    amountReceived?: number;
    mobilizationAmount?: number;
    rentDue?: number;
    balance?: number;
    currency?: string;
    createdAt?: any;
    activationRequestedAt?: any;
};

const PENDING_PAYMENT_STATUSES = ['pending', 'pending_admin_approval', 'submitted', 'PENDING', 'PENDING_VERIFICATION', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION'];
const formatMoney = (value?: number, currency = 'AED') => `${currency || 'AED'} ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const toNumber = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const isRentPayment = (row: PaymentRecord) => upper(row.recordType) === 'OWNER_RENT_PAYMENT' || upper(row.transactionType) === 'RENT_COLLECTION' || upper(row.paymentType) === 'RENT_COLLECTION';
const proofText = (row: PaymentRecord) => row.paymentReference || row.paymentReferenceId || row.referenceId || row.receiptUrl || row.proofUrl || row.attachmentUrl || row.proofFileName || 'No proof reference recorded';
const submittedAmount = (row: PaymentRecord) => row.amountReceived || row.mobilizationAmount || row.amountPaid || row.rentPaid || row.amount || 0;

export default function PaymentApprovalsPage() {
    const [rows, setRows] = React.useState<PaymentRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [approvalTarget, setApprovalTarget] = React.useState<PaymentRecord | null>(null);
    const [paymentReferenceId, setPaymentReferenceId] = React.useState('');
    const [amountReceived, setAmountReceived] = React.useState('');
    const [internalNotes, setInternalNotes] = React.useState('');

    React.useEffect(() => {
        const q = query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATUSES), orderBy('createdAt', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRows(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
            setLoading(false);
            setError(null);
        }, (err) => {
            console.error('[ADMIN_PAYMENTS] stream failed', err);
            setLoading(false);
            setError(err?.message || 'Payment approvals stream failed.');
        });
        return () => unsubscribe();
    }, []);

    const openApproveDialog = (row: PaymentRecord) => {
        setApprovalTarget(row);
        setPaymentReferenceId(String(row.paymentReferenceId || row.paymentReference || row.referenceId || ''));
        setAmountReceived(String(submittedAmount(row) || ''));
        setInternalNotes(row.notes || '');
    };

    const approvePayment = async () => {
        if (!approvalTarget) return;
        setBusyId(approvalTarget.id);
        setError(null);
        try {
            const callable = httpsCallable(functions, 'adminApprovePayment');
            await callable({ paymentId: approvalTarget.id, paymentReferenceId: paymentReferenceId.trim(), amountReceived: toNumber(amountReceived), internalNotes: internalNotes.trim() });
            setApprovalTarget(null);
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] approval failed', err);
            setError(err?.message || 'Approval failed.');
        } finally {
            setBusyId(null);
        }
    };

    const rejectPayment = async (paymentId: string) => {
        setBusyId(paymentId);
        setError(null);
        try {
            const callable = httpsCallable(functions, 'adminRejectPayment');
            await callable({ paymentId, reason: 'Rejected from admin payment approval console.' });
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] rejection failed', err);
            setError(err?.message || 'Rejection failed.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Box sx={{ p: 4, color: '#fff' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>FINANCE COMMAND</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>Payment Approvals</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>Review owner activation payments and rent-collection submissions before verification.</Typography>
                </Box>
                <Button startIcon={<RefreshCw size={16} />} onClick={() => window.location.reload()} sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.35)' }} variant="outlined">Refresh</Button>
            </Stack>

            {error && <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca' }}>{error}</Paper>}

            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                {loading ? <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box> : rows.length === 0 ? (
                    <Box sx={{ p: 8, textAlign: 'center' }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>No pending payment submissions</Typography><Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>New owner payments and rent collection records will appear here in real time.</Typography></Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead><TableRow><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Type</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Owner / Tenant</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Property / Contract</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Method</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Proof / Reference</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Amount</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Status</TableCell><TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>Action</TableCell></TableRow></TableHead>
                            <TableBody>
                                {rows.map((row) => {
                                    const rent = isRentPayment(row);
                                    return (
                                        <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                            <TableCell><Chip label={rent ? 'Rent Collection' : 'Activation'} size="small" sx={{ bgcolor: rent ? 'rgba(16,185,129,0.16)' : 'rgba(218,165,32,0.16)', color: rent ? '#10b981' : '#DAA520', fontWeight: 900 }} /></TableCell>
                                            <TableCell><Typography sx={{ fontWeight: 900 }}>{rent ? (row.tenantName || 'Tenant') : (row.companyName || row.ownerName || 'Owner Submission')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.ownerEmail || row.ownerId || row.ownerUid || row.id}</Typography></TableCell>
                                            <TableCell>{rent ? `${row.propertyName || row.propertyId || 'Property'}${row.unitNumber ? ` · Unit ${row.unitNumber}` : ''}` : (row.contractId || row.intakeId || '—')}</TableCell>
                                            <TableCell>{row.paymentMethod || 'Manual'}</TableCell>
                                            <TableCell><Typography variant="body2" sx={{ maxWidth: 240, overflowWrap: 'anywhere' }}>{proofText(row)}</Typography>{row.notes && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)' }}>{row.notes}</Typography>}</TableCell>
                                            <TableCell>{formatMoney(submittedAmount(row), row.currency)}</TableCell>
                                            <TableCell><Chip label={row.status || row.paymentStatus || row.verificationState || 'pending'} size="small" sx={{ bgcolor: 'rgba(218,165,32,0.16)', color: '#DAA520', fontWeight: 900 }} /></TableCell>
                                            <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}><Button size="small" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{rent ? 'Verify Rent' : 'Verify & Unlock'}</Button><Button size="small" startIcon={<XCircle size={14} />} disabled={busyId === row.id} onClick={() => rejectPayment(row.id)} sx={{ color: '#f87171', fontWeight: 900 }}>Reject</Button></Stack></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Confirm Payment & Unlock Owner'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{approvalTarget && isRentPayment(approvalTarget) ? 'This will verify the rent-collection payment only. It will not activate contracts or unlock dashboards.' : 'This will approve the mobilization payment, activate the contract, and unlock the owner dashboard.'}</Typography>
                        {approvalTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>SUBMITTED PROOF</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{proofText(approvalTarget)}</Typography>{approvalTarget.notes && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 1 }}>{approvalTarget.notes}</Typography>}</Paper>}
                        <TextField label="Bank reference / transaction ID" value={paymentReferenceId} onChange={(e) => setPaymentReferenceId(e.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label="Amount received" value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label="Internal notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} fullWidth multiline minRows={3} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setApprovalTarget(null)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>Cancel</Button><Button onClick={approvePayment} disabled={!approvalTarget || busyId === approvalTarget?.id} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Confirm & Unlock Owner'}</Button></DialogActions>
            </Dialog>
        </Box>
    );
}

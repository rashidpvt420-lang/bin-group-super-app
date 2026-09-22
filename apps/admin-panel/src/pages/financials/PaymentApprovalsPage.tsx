import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { CheckCircle, FileCheck2, RefreshCw, Upload, XCircle } from 'lucide-react';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';

type PaymentRecord = {
    id: string;
    workflowVersion?: string;
    type?: string;
    designRequestId?: string;
    payerId?: string;
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
    adminApprovalRequired?: boolean;
    unlocksDashboard?: boolean;
    inspectionVerified?: boolean;
    inspectionStatus?: string;
    paymentMethod?: string;
    method?: string;
    paymentReference?: string;
    paymentReferenceId?: string;
    referenceId?: string;
    receiptUrl?: string;
    receiptPath?: string;
    receiptHash?: string;
    receiptGeneration?: string;
    paymentProofUrl?: string;
    paymentProofPath?: string;
    paymentProofHash?: string;
    paymentProofGeneration?: string;
    proofUrl?: string;
    attachmentUrl?: string;
    proofFileName?: string;
    referenceFileUrl?: string;
    referenceFilePath?: string;
    referenceFileName?: string;
    referenceFileType?: string;
    referenceFileSize?: number;
    referenceUploadError?: string;
    notes?: string;
    adminNotes?: string;
    tenantName?: string;
    propertyName?: string;
    propertyId?: string;
    unitNumber?: string;
    annualValue?: number;
    annualContractValue?: number;
    totalAnnualValue?: number;
    activationDeposit?: number;
    amount?: number;
    amountPaid?: number;
    rentPaid?: number;
    amountReceived?: number;
    mobilizationAmount?: number;
    rentDue?: number;
    balance?: number;
    currency?: string;
    createdAt?: any;
    updatedAt?: any;
    activationRequestedAt?: any;
};

const FIVE_PAGE_WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const PENDING_PAYMENT_STATUSES = ['pending', 'pending_admin_approval', 'submitted', 'PENDING', 'PENDING_ADMIN_APPROVAL', 'PENDING_VERIFICATION', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION'];
const MANUAL_METHODS = ['CASH', 'CHEQUE'];
const formatMoney = (value?: number, currency = 'AED') => `${currency || 'AED'} ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toNumber = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const isRentPayment = (row: PaymentRecord) =>
    ['OWNER_RENT_PAYMENT', 'TENANT_RENT_PAYMENT_PROOF'].includes(upper(row.recordType)) ||
    ['RENT_COLLECTION', 'RENT_PAYMENT_PROOF'].includes(upper(row.transactionType)) ||
    upper(row.paymentType) === 'RENT_COLLECTION';
const isDesignPayment = (row: PaymentRecord) => row.type === 'DESIGN_STUDIO_EXECUTION' && Boolean(row.designRequestId);
const proofText = (row: PaymentRecord) => row.paymentReference || row.paymentReferenceId || row.referenceId || row.referenceFileName || row.receiptUrl || row.paymentProofUrl || row.proofUrl || row.attachmentUrl || row.proofFileName || 'No reference recorded';
const referenceUrl = (row: PaymentRecord) => row.paymentProofUrl || row.referenceFileUrl || row.receiptUrl || row.proofUrl || row.attachmentUrl || '';
const submittedAmount = (row: PaymentRecord) => row.amountReceived || row.activationDeposit || row.mobilizationAmount || row.amountPaid || row.rentPaid || row.amount || 0;
const hasImmutableReceipt = (row: PaymentRecord) => Boolean(
    (row.paymentProofPath || row.receiptPath || row.referenceFilePath) &&
    /^[a-f0-9]{64}$/i.test(String(row.paymentProofHash || row.receiptHash || '')) &&
    (row.paymentProofGeneration || row.receiptGeneration || isRentPayment(row)),
);
const timestampMillis = (row: PaymentRecord) => {
    const value = row.createdAt || row.updatedAt || row.activationRequestedAt;
    if (value && typeof value.toMillis === 'function') return value.toMillis();
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : 0;
};
const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = String(reader.result || '');
        resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read payment evidence.'));
    reader.readAsDataURL(file);
});

export default function PaymentApprovalsPage() {
    const [rows, setRows] = React.useState<PaymentRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [notice, setNotice] = React.useState<string | null>(null);
    const [approvalTarget, setApprovalTarget] = React.useState<PaymentRecord | null>(null);
    const [rejectTarget, setRejectTarget] = React.useState<PaymentRecord | null>(null);
    const [paymentReferenceId, setPaymentReferenceId] = React.useState('');
    const [paymentMethod, setPaymentMethod] = React.useState('');
    const [amountReceived, setAmountReceived] = React.useState('');
    const [internalNotes, setInternalNotes] = React.useState('');
    const [receiptFile, setReceiptFile] = React.useState<File | null>(null);
    const [rejectReason, setRejectReason] = React.useState('');

    React.useEffect(() => {
        let pendingRows: PaymentRecord[] = [];
        let paidAwaitingApprovalRows: PaymentRecord[] = [];
        let pendingReady = false;
        let paidReady = false;

        const publish = () => {
            if (!pendingReady || !paidReady) return;
            const merged = new Map<string, PaymentRecord>();
            [...pendingRows, ...paidAwaitingApprovalRows].forEach((row) => merged.set(row.id, row));
            setRows([...merged.values()].sort((a, b) => timestampMillis(b) - timestampMillis(a)));
            setLoading(false);
            setError(null);
        };
        const handleError = (err: any) => {
            console.error('[ADMIN_PAYMENTS] stream failed', err);
            setLoading(false);
            setError(err?.message || 'Payment approvals stream failed.');
        };

        const pendingQuery = query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATUSES), orderBy('createdAt', 'desc'), limit(50));
        const paidAwaitingApprovalQuery = query(collection(db, 'payment_transactions'), where('status', '==', 'PAID'), where('adminApprovalRequired', '==', true), limit(50));
        const unsubscribePending = onSnapshot(pendingQuery, (snapshot) => {
            pendingRows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
            pendingReady = true;
            publish();
        }, handleError);
        const unsubscribePaidAwaitingApproval = onSnapshot(paidAwaitingApprovalQuery, (snapshot) => {
            paidAwaitingApprovalRows = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })).filter((row) => row.unlocksDashboard !== true);
            paidReady = true;
            publish();
        }, handleError);

        return () => { unsubscribePending(); unsubscribePaidAwaitingApproval(); };
    }, []);

    const openApproveDialog = React.useCallback((row: PaymentRecord) => {
        setApprovalTarget(row);
        setPaymentReferenceId(String(row.paymentReferenceId || row.paymentReference || row.referenceId || ''));
        setPaymentMethod(upper(row.paymentMethod || row.method || ''));
        setAmountReceived(String(submittedAmount(row) || ''));
        setInternalNotes(row.notes || '');
        setReceiptFile(null);
        setError(null);
        setNotice(null);
    }, []);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const paymentId = params.get('paymentId');
        if (!paymentId || !rows.length || approvalTarget) return;
        const target = rows.find((row) => row.id === paymentId);
        if (target) openApproveDialog(target);
    }, [approvalTarget, openApproveDialog, rows]);

    const openRejectDialog = (row: PaymentRecord) => {
        setRejectTarget(row);
        setRejectReason(row.adminNotes || '');
        setError(null);
        setNotice(null);
    };

    const approvePayment = async () => {
        if (!approvalTarget) return;
        const rent = isRentPayment(approvalTarget);
        const design = isDesignPayment(approvalTarget);
        const reference = paymentReferenceId.trim();
        const received = toNumber(amountReceived);
        const selectedMethod = upper(paymentMethod);
        if (!rent && approvalTarget.workflowVersion === FIVE_PAGE_WORKFLOW && approvalTarget.inspectionVerified !== true) {
            setError('All linked property visits must be completed before recording or approving the 15% mobilisation payment.');
            return;
        }
        if (!rent && !MANUAL_METHODS.includes(selectedMethod)) {
            setError('Select Cash or Cheque for the received 15% mobilisation payment.');
            return;
        }
        if (!reference || received <= 0) {
            setError('Enter the exact payment reference and amount received.');
            return;
        }
        if (!rent && (design || !hasImmutableReceipt(approvalTarget)) && !receiptFile) {
            setError(design ? 'Upload the official design deposit receipt before verification.' : 'Upload the official 15% payment receipt before final Owner approval.');
            return;
        }
        if (receiptFile && receiptFile.size > 10 * 1024 * 1024) {
            setError('Payment receipt exceeds the secure 10 MB limit.');
            return;
        }

        setBusyId(approvalTarget.id);
        setError(null);
        setNotice(null);
        try {
            if (design) {
                const review = httpsCallable(functions, 'adminReviewDesignPayment');
                await review({ designRequestId: approvalTarget.designRequestId, decision: 'APPROVE',
                    paymentReferenceId: reference, amountReceived: received, method: selectedMethod,
                    internalNotes: internalNotes.trim(), contentType: receiptFile?.type,
                    encodedDocument: receiptFile ? await fileToBase64(receiptFile) : '' });
                setNotice('Design Cash/Cheque deposit verified. Engineer handoff remains a separate protected action; no Owner account was activated.');
                setApprovalTarget(null);
                setReceiptFile(null);
                return;
            }
            if (!rent && !hasImmutableReceipt(approvalTarget)) {
                const recordEvidence = httpsCallable(functions, 'adminRecordOwnerMobilizationPaymentEvidence');
                await recordEvidence({
                    paymentId: approvalTarget.id,
                    paymentReferenceId: reference,
                    amountReceived: received,
                    paymentMethod: selectedMethod,
                    filename: receiptFile?.name.replace(/[^A-Za-z0-9._-]/g, '_'),
                    contentType: receiptFile?.type || 'application/pdf',
                    encodedDocument: receiptFile ? await fileToBase64(receiptFile) : '',
                });
            }
            const callable = httpsCallable(functions, 'adminApprovePayment');
            await callable({
                paymentId: approvalTarget.id,
                paymentReferenceId: reference,
                amountReceived: received,
                method: rent ? upper(approvalTarget.paymentMethod || approvalTarget.method) : selectedMethod,
                internalNotes: internalNotes.trim(),
            });
            setNotice(rent ? 'Rent payment verified.' : '15% mobilisation verified. Contract and properties activated; Owner dashboard unlocked.');
            setApprovalTarget(null);
            setReceiptFile(null);
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] approval failed', err);
            setError(err?.details || err?.message || 'Approval failed.');
        } finally {
            setBusyId(null);
        }
    };

    const rejectPayment = async () => {
        if (!rejectTarget) return;
        const reason = rejectReason.trim();
        if (reason.length < 8) { setError('Enter a clear return reason before rejecting this payment.'); return; }
        setBusyId(rejectTarget.id);
        setError(null);
        setNotice(null);
        try {
            if (isDesignPayment(rejectTarget)) {
                const review = httpsCallable(functions, 'adminReviewDesignPayment');
                await review({ designRequestId: rejectTarget.designRequestId, decision: 'RETURN', internalNotes: reason });
            } else {
                const callable = httpsCallable(functions, 'adminRejectPayment');
                await callable({ paymentId: rejectTarget.id, reason, returnReason: reason, reviewNote: reason, internalNotes: reason });
            }
            setNotice('Payment evidence returned to the Owner with the Admin reason.');
            setRejectTarget(null);
            setRejectReason('');
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] rejection failed', err);
            setError(err?.details || err?.message || 'Rejection failed.');
        } finally { setBusyId(null); }
    };

    const openReference = (row: PaymentRecord) => {
        const url = referenceUrl(row);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>FINANCE COMMAND</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>15% Payment Verification & Final Approval</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>Owner activation follows completed property visits. Design deposits use their own quote-bound Cash/Cheque verification and do not unlock an Owner account.</Typography>
                </Box>
                <Button startIcon={<RefreshCw size={16} />} onClick={() => window.location.reload()} sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.35)' }} variant="outlined">Refresh</Button>
            </Stack>

            <Alert severity="warning" sx={{ mb: 3 }}>For five-page Owner applications, final approval is blocked until all property inspections are complete and the exact locked 15% mobilisation amount has immutable receipt evidence.</Alert>
            {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice}</Alert>}

            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                {loading ? <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box> : rows.length === 0 ? (
                    <Box sx={{ p: 8, textAlign: 'center' }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>No pending payment submissions</Typography><Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>Owner 15% payments appear here only after Admin completes the site visits.</Typography></Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead><TableRow><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Type</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Owner / Tenant</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Contract</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Method</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Evidence</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Amount</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>Status</TableCell><TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>Action</TableCell></TableRow></TableHead>
                            <TableBody>
                                {rows.map((row) => {
                                    const rent = isRentPayment(row);
                                    const design = isDesignPayment(row);
                                    const hasReferenceFile = Boolean(referenceUrl(row));
                                    const inspectionReady = row.workflowVersion !== FIVE_PAGE_WORKFLOW || row.inspectionVerified === true;
                                    return <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                        <TableCell><Chip label={design ? 'Design Deposit' : rent ? 'Rent Collection' : 'Owner 15%'} size="small" sx={{ bgcolor: rent ? 'rgba(16,185,129,0.16)' : 'rgba(218,165,32,0.16)', color: rent ? '#10b981' : '#DAA520', fontWeight: 900 }} /></TableCell>
                                        <TableCell><Typography sx={{ fontWeight: 900 }}>{design ? 'Design payer' : rent ? (row.tenantName || 'Tenant') : (row.companyName || row.ownerName || 'Owner')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{design ? row.payerId : row.ownerEmail || row.ownerId || row.ownerUid || row.id}</Typography></TableCell>
                                        <TableCell>{row.designRequestId || row.contractId || row.intakeId || '—'}</TableCell>
                                        <TableCell>{row.paymentMethod || row.method || 'Not recorded'}</TableCell>
                                        <TableCell><Typography variant="body2" sx={{ maxWidth: 220, overflowWrap: 'anywhere' }}>{proofText(row)}</Typography><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}><FileCheck2 size={13} color={hasImmutableReceipt(row) ? '#4ADE80' : '#F59E0B'} /><Typography variant="caption" color={hasImmutableReceipt(row) ? '#4ADE80' : '#F59E0B'}>{hasImmutableReceipt(row) ? 'Immutable receipt recorded' : 'Receipt required'}</Typography></Stack>{hasReferenceFile && <Button size="small" onClick={() => openReference(row)} sx={{ color: '#DAA520', fontWeight: 900, mt: 0.5 }}>Open evidence</Button>}</TableCell>
                                        <TableCell>{formatMoney(submittedAmount(row), row.currency)}</TableCell>
                                        <TableCell><Chip label={!inspectionReady ? 'INSPECTION INCOMPLETE' : (row.status || row.paymentStatus || row.verificationState || 'pending')} size="small" sx={{ bgcolor: !inspectionReady ? 'rgba(239,68,68,0.16)' : 'rgba(218,165,32,0.16)', color: !inspectionReady ? '#F87171' : '#DAA520', fontWeight: 900 }} /></TableCell>
                                        <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}><Button data-testid="admin-payment-approve" size="small" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id || !inspectionReady} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{design ? 'Verify Design Deposit' : rent ? 'Verify Rent' : 'Record 15% & Approve'}</Button><Button size="small" startIcon={<XCircle size={14} />} disabled={busyId === row.id} onClick={() => openRejectDialog(row)} sx={{ color: '#f87171', fontWeight: 900 }}>Return</Button></Stack></TableCell>
                                    </TableRow>;
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog data-testid="admin-payment-approval-dialog" open={Boolean(approvalTarget)} onClose={() => !busyId && setApprovalTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Verify Design Cash/Cheque Deposit' : approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Record 15% Payment & Give Final Approval'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Confirm actual receipt of Cash or cleared Cheque against this design quote. Upload the official receipt. Approval does not start work or activate an Owner account.' : approvalTarget && isRentPayment(approvalTarget) ? 'This verifies the rent payment only.' : 'This records immutable receipt evidence, verifies the exact 15%, activates the contract and properties, and unlocks the Owner dashboard.'}</Typography>
                        {approvalTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>LOCKED PAYMENT</Typography><Typography fontWeight={900}>{formatMoney(submittedAmount(approvalTarget), approvalTarget.currency)}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere', mt: 1 }}>{proofText(approvalTarget)}</Typography>{referenceUrl(approvalTarget) && <Button size="small" onClick={() => openReference(approvalTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>Open recorded evidence</Button>}</Paper>}
                        {approvalTarget && !isRentPayment(approvalTarget) && <TextField select label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }}>{MANUAL_METHODS.map((method) => <MenuItem key={method} value={method}>{method.replace('_', ' ')}</MenuItem>)}</TextField>}
                        <TextField label="Official payment / receipt reference" value={paymentReferenceId} onChange={(event) => setPaymentReferenceId(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label="Exact amount received" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        {approvalTarget && !isRentPayment(approvalTarget) && (isDesignPayment(approvalTarget) || !hasImmutableReceipt(approvalTarget)) && <Button component="label" variant="outlined" startIcon={<Upload size={17} />} sx={{ color: receiptFile ? '#4ADE80' : '#DAA520', borderColor: receiptFile ? '#4ADE80' : 'rgba(218,165,32,0.45)', justifyContent: 'flex-start' }}>{receiptFile ? `${receiptFile.name} · ${(receiptFile.size / 1024 / 1024).toFixed(2)} MB` : 'Upload official receipt (PDF or image)'}<input hidden type="file" accept={isDesignPayment(approvalTarget) ? 'application/pdf,image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp,image/heic'} onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} /></Button>}
                        <TextField label="Internal verification notes" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} fullWidth multiline minRows={3} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setApprovalTarget(null)} disabled={Boolean(busyId)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>Cancel</Button><Button data-testid="admin-payment-confirm-approval" onClick={() => void approvePayment()} disabled={!approvalTarget || busyId === approvalTarget?.id} startIcon={busyId === approvalTarget?.id ? <CircularProgress size={16} /> : <CheckCircle size={16} />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Verify Design Deposit' : approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : 'Verify 15% & Approve Owner'}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(rejectTarget)} onClose={() => !busyId && setRejectTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#f87171', fontWeight: 950 }}>Return / Reject Payment Evidence</DialogTitle>
                <DialogContent><Stack spacing={2.5} sx={{ mt: 1 }}><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>Record the exact reason the payment or receipt evidence is being returned.</Typography>{rejectTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>REFERENCE</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{proofText(rejectTarget)}</Typography>{referenceUrl(rejectTarget) && <Button size="small" onClick={() => openReference(rejectTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>Open evidence</Button>}</Paper>}<TextField label="Return reason / Admin review note" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} fullWidth multiline minRows={4} required InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} /></Stack></DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setRejectTarget(null)} disabled={Boolean(busyId)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>Cancel</Button><Button onClick={() => void rejectPayment()} disabled={!rejectTarget || busyId === rejectTarget?.id || rejectReason.trim().length < 8} sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 950 }}>Return / Reject</Button></DialogActions>
            </Dialog>
        </Box>
    );
}

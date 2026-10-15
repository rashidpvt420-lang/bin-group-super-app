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
    chequeDetails?: { chequeNumber?: string; chequeBank?: string; chequeDate?: string } | null;
    chequeClearanceState?: string | null;
    cheque?: { chequeNumber?: string; chequeBank?: string; chequeDate?: string } | null;
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

type ReceiptRepairRecord = {
    id: string;
    paymentId?: string;
    ownerEmail?: string;
    ownerId?: string;
    ownerUid?: string;
    contractId?: string;
    documentState?: string;
    receiptPdfError?: string;
    amount?: number;
    currency?: string;
};

export default function PaymentApprovalsPage() {
    const [rows, setRows] = React.useState<PaymentRecord[]>([]);
    const [receiptRepairs, setReceiptRepairs] = React.useState<ReceiptRepairRecord[]>([]);
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
    const [chequeNumber, setChequeNumber] = React.useState('');
    const [chequeBank, setChequeBank] = React.useState('');
    const [chequeDate, setChequeDate] = React.useState('');

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
        const receiptRepairQuery = query(
            collection(db, 'invoices'),
            where('documentState', 'in', ['PAID_RECEIPT_FAILED', 'PAID_RECEIPT_PENDING']),
            limit(30),
        );
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
        const unsubscribeReceiptRepairs = onSnapshot(receiptRepairQuery, (snapshot) => {
            setReceiptRepairs(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
        }, (err) => {
            console.error('[ADMIN_PAYMENTS] receipt repair stream failed', err);
        });

        return () => {
            unsubscribePending();
            unsubscribePaidAwaitingApproval();
            unsubscribeReceiptRepairs();
        };
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
        const recordingOwnerCheque = !rent && !design && !hasImmutableReceipt(approvalTarget) && selectedMethod === 'CHEQUE';
        if (recordingOwnerCheque && (!/^[0-9]{4,12}$/.test(chequeNumber.replace(/\s+/g, '')) || chequeBank.trim().length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(chequeDate))) {
            setError('Enter the cheque number (4-12 digits), drawee bank and cheque date.');
            return;
        }
        if (!rent && !design && hasImmutableReceipt(approvalTarget) && selectedMethod === 'CHEQUE' && upper(approvalTarget.chequeClearanceState) !== 'CLEARED') {
            setError('Mark the cheque as cleared by the bank before approving this payment.');
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
                    ...(selectedMethod === 'CHEQUE' ? { chequeNumber: chequeNumber.replace(/\s+/g, ''), chequeBank: chequeBank.trim(), chequeDate } : {}),
                    filename: receiptFile?.name.replace(/[^A-Za-z0-9._-]/g, '_'),
                    contentType: receiptFile?.type || 'application/pdf',
                    encodedDocument: receiptFile ? await fileToBase64(receiptFile) : '',
                });
                // D-5 dual control: the Admin who records the 15% evidence cannot also approve it.
                // Stop here; a second Finance Admin verifies the recorded receipt and approves.
                setNotice('15% payment evidence recorded. A second Finance Admin must now verify the receipt and approve this payment (dual control).');
                setApprovalTarget(null);
                setReceiptFile(null);
                return;
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
            setError((typeof err?.details === 'string' && err.details) || err?.message || 'Approval failed.');
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
            setError((typeof err?.details === 'string' && err.details) || err?.message || 'Rejection failed.');
        } finally { setBusyId(null); }
    };

    const setChequeClearance = async (row: PaymentRecord, clearance: 'CLEARED' | 'BOUNCED') => {
        const note = clearance === 'BOUNCED' ? (window.prompt('Bank return reason for this cheque') || '').trim() : '';
        if (clearance === 'BOUNCED' && note.length < 4) { setError('Enter the bank return reason to mark a cheque as bounced.'); return; }
        setBusyId(row.id);
        setError(null);
        setNotice(null);
        try {
            const callable = httpsCallable(functions, 'adminSetOwnerChequeClearance');
            await callable({ paymentId: row.id, clearance, note });
            setNotice(clearance === 'CLEARED' ? 'Cheque marked as cleared. A second Finance Admin can now verify and approve.' : 'Cheque marked as bounced. A pending AED 500 returned-cheque fee was added to the payer ledger. Return the evidence and request a replacement payment.');
        } catch (err: any) {
            setError((typeof err?.details === 'string' && err.details) || err?.message || 'Cheque clearance update failed.');
        } finally { setBusyId(null); }
    };

    const openReference = (row: PaymentRecord) => {
        const url = referenceUrl(row);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const repairPaidReceipt = async (invoice: ReceiptRepairRecord) => {
        const paymentId = String(invoice.paymentId || '').trim();
        if (!paymentId) {
            setError('This invoice is missing its paymentId binding and cannot be repaired.');
            return;
        }
        setBusyId(invoice.id);
        setError(null);
        setNotice(null);
        try {
            // Idempotent approve replay regenerates PAID_RECEIPT_FAILED / PENDING receipts.
            const callable = httpsCallable(functions, 'adminApprovePayment');
            await callable({ paymentId });
            setNotice(`Paid receipt repaired for invoice ${invoice.id}.`);
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] receipt repair failed', err);
            setError((typeof err?.details === 'string' && err.details) || err?.message || 'Receipt repair failed.');
        } finally {
            setBusyId(null);
        }
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

            {receiptRepairs.length > 0 && (
                <Paper sx={{ mb: 3, p: 3, bgcolor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 4 }}>
                    <Typography variant="h6" sx={{ fontWeight: 900, mb: 1 }}>Paid receipt repair queue</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.65)', mb: 2 }}>
                        These invoices were approved but the paid receipt PDF is still pending or failed. Finance Admin MFA can replay generation.
                    </Typography>
                    <Stack spacing={1.5}>
                        {receiptRepairs.map((invoice) => (
                            <Stack
                                key={invoice.id}
                                direction={{ xs: 'column', md: 'row' }}
                                justifyContent="space-between"
                                alignItems={{ xs: 'stretch', md: 'center' }}
                                gap={1}
                                sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(0,0,0,0.25)' }}
                            >
                                <Box>
                                    <Typography sx={{ fontWeight: 900 }}>{invoice.id}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                                        {invoice.documentState} · payment {invoice.paymentId || '—'} · {invoice.ownerEmail || invoice.ownerUid || invoice.ownerId || 'Owner'}
                                    </Typography>
                                    {invoice.receiptPdfError && (
                                        <Typography variant="caption" sx={{ display: 'block', color: '#f87171', mt: 0.5 }}>
                                            {invoice.receiptPdfError}
                                        </Typography>
                                    )}
                                </Box>
                                <Button
                                    size="small"
                                    disabled={busyId === invoice.id || !invoice.paymentId}
                                    onClick={() => void repairPaidReceipt(invoice)}
                                    sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}
                                >
                                    {busyId === invoice.id ? 'Repairing…' : 'Repair receipt'}
                                </Button>
                            </Stack>
                        ))}
                    </Stack>
                </Paper>
            )}

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
                                        <TableCell>{row.paymentMethod || row.method || 'Not recorded'}{upper(row.paymentMethod || row.method) === 'CHEQUE' && (row.chequeDetails || row.cheque) && <Typography variant="caption" display="block" sx={{ color: 'rgba(255,255,255,0.55)' }}>#{(row.chequeDetails || row.cheque)?.chequeNumber} · {(row.chequeDetails || row.cheque)?.chequeBank} · {(row.chequeDetails || row.cheque)?.chequeDate}</Typography>}{upper(row.paymentMethod || row.method) === 'CHEQUE' && !design && (rent || hasImmutableReceipt(row)) && <Chip data-testid="admin-cheque-clearance" label={upper(row.chequeClearanceState) || 'PENDING_CLEARANCE'} size="small" sx={{ mt: 0.5, fontWeight: 900, bgcolor: upper(row.chequeClearanceState) === 'CLEARED' ? 'rgba(16,185,129,0.16)' : upper(row.chequeClearanceState) === 'BOUNCED' ? 'rgba(239,68,68,0.16)' : 'rgba(245,158,11,0.16)', color: upper(row.chequeClearanceState) === 'CLEARED' ? '#10b981' : upper(row.chequeClearanceState) === 'BOUNCED' ? '#F87171' : '#F59E0B' }} />}{upper(row.paymentMethod || row.method) === 'CHEQUE' && !design && (rent || hasImmutableReceipt(row)) && !['CLEARED', 'BOUNCED'].includes(upper(row.chequeClearanceState)) && <Stack direction="row" gap={0.5} sx={{ mt: 0.5 }}><Button size="small" disabled={busyId === row.id} onClick={() => void setChequeClearance(row, 'CLEARED')} sx={{ color: '#10b981', fontWeight: 900, minWidth: 0 }}>Cleared</Button><Button size="small" disabled={busyId === row.id} onClick={() => void setChequeClearance(row, 'BOUNCED')} sx={{ color: '#F87171', fontWeight: 900, minWidth: 0 }}>Bounced</Button></Stack>}</TableCell>
                                        <TableCell><Typography variant="body2" sx={{ maxWidth: 220, overflowWrap: 'anywhere' }}>{proofText(row)}</Typography><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}><FileCheck2 size={13} color={hasImmutableReceipt(row) ? '#4ADE80' : '#F59E0B'} /><Typography variant="caption" color={hasImmutableReceipt(row) ? '#4ADE80' : '#F59E0B'}>{hasImmutableReceipt(row) ? 'Immutable receipt recorded' : 'Receipt required'}</Typography></Stack>{hasReferenceFile && <Button size="small" onClick={() => openReference(row)} sx={{ color: '#DAA520', fontWeight: 900, mt: 0.5 }}>Open evidence</Button>}</TableCell>
                                        <TableCell>{formatMoney(submittedAmount(row), row.currency)}</TableCell>
                                        <TableCell><Chip label={!inspectionReady ? 'INSPECTION INCOMPLETE' : (row.status || row.paymentStatus || row.verificationState || 'pending')} size="small" sx={{ bgcolor: !inspectionReady ? 'rgba(239,68,68,0.16)' : 'rgba(218,165,32,0.16)', color: !inspectionReady ? '#F87171' : '#DAA520', fontWeight: 900 }} /></TableCell>
                                        <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}><Button data-testid="admin-payment-approve" size="small" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id || !inspectionReady} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{design ? 'Verify Design Deposit' : rent ? 'Verify Rent' : hasImmutableReceipt(row) ? 'Review 15% Payment' : 'Record 15% Receipt'}</Button><Button size="small" startIcon={<XCircle size={14} />} disabled={busyId === row.id} onClick={() => openRejectDialog(row)} sx={{ color: '#f87171', fontWeight: 900 }}>Return</Button></Stack></TableCell>
                                    </TableRow>;
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog data-testid="admin-payment-approval-dialog" open={Boolean(approvalTarget)} onClose={() => !busyId && setApprovalTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Verify Design Cash/Cheque Deposit' : approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : approvalTarget && hasImmutableReceipt(approvalTarget) ? 'Review 15% Payment for Final Approval' : 'Record 15% Payment Evidence'}</DialogTitle>
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Confirm actual receipt of Cash or cleared Cheque against this design quote. Upload the official receipt. Approval does not start work or activate an Owner account.' : approvalTarget && isRentPayment(approvalTarget) ? 'This verifies the rent payment only.' : approvalTarget && hasImmutableReceipt(approvalTarget) ? 'A Finance Admin who did not record this receipt must verify the exact 15% payment. Successful approval activates the contract and properties and unlocks the Owner dashboard.' : 'Record the exact 15% receipt evidence. A different Finance Admin must verify and approve it before activation.'}</Typography>
                        {approvalTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>LOCKED PAYMENT</Typography><Typography fontWeight={900}>{formatMoney(submittedAmount(approvalTarget), approvalTarget.currency)}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere', mt: 1 }}>{proofText(approvalTarget)}</Typography>{referenceUrl(approvalTarget) && <Button size="small" onClick={() => openReference(approvalTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>Open recorded evidence</Button>}</Paper>}
                        {approvalTarget && !isRentPayment(approvalTarget) && <TextField select label="Payment method" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }}>{MANUAL_METHODS.map((method) => <MenuItem key={method} value={method}>{method.replace('_', ' ')}</MenuItem>)}</TextField>}
                        {approvalTarget && !isRentPayment(approvalTarget) && !isDesignPayment(approvalTarget) && !hasImmutableReceipt(approvalTarget) && upper(paymentMethod) === 'CHEQUE' && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}><TextField label="Cheque number" value={chequeNumber} onChange={(event) => setChequeNumber(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} /><TextField label="Drawee bank" value={chequeBank} onChange={(event) => setChequeBank(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} /><TextField label="Cheque date" type="date" value={chequeDate} onChange={(event) => setChequeDate(event.target.value)} fullWidth InputLabelProps={{ shrink: true, sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} /></Stack>}
                        <TextField label="Official payment / receipt reference" value={paymentReferenceId} onChange={(event) => setPaymentReferenceId(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label="Exact amount received" value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        {approvalTarget && !isRentPayment(approvalTarget) && (isDesignPayment(approvalTarget) || !hasImmutableReceipt(approvalTarget)) && <Button component="label" variant="outlined" startIcon={<Upload size={17} />} sx={{ color: receiptFile ? '#4ADE80' : '#DAA520', borderColor: receiptFile ? '#4ADE80' : 'rgba(218,165,32,0.45)', justifyContent: 'flex-start' }}>{receiptFile ? `${receiptFile.name} · ${(receiptFile.size / 1024 / 1024).toFixed(2)} MB` : 'Upload official receipt (PDF or image)'}<input hidden type="file" accept={isDesignPayment(approvalTarget) ? 'application/pdf,image/jpeg,image/png,image/webp' : 'application/pdf,image/jpeg,image/png,image/webp,image/heic'} onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} /></Button>}
                        <TextField label="Internal verification notes" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} fullWidth multiline minRows={3} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setApprovalTarget(null)} disabled={Boolean(busyId)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>Cancel</Button><Button data-testid="admin-payment-confirm-approval" onClick={() => void approvePayment()} disabled={!approvalTarget || busyId === approvalTarget?.id} startIcon={busyId === approvalTarget?.id ? <CircularProgress size={16} /> : <CheckCircle size={16} />} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isDesignPayment(approvalTarget) ? 'Verify Design Deposit' : approvalTarget && isRentPayment(approvalTarget) ? 'Confirm Rent Payment' : approvalTarget && hasImmutableReceipt(approvalTarget) ? 'Verify 15% & Approve Owner' : 'Record 15% Receipt'}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(rejectTarget)} onClose={() => !busyId && setRejectTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#f87171', fontWeight: 950 }}>Return / Reject Payment Evidence</DialogTitle>
                <DialogContent>{error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}<Stack spacing={2.5} sx={{ mt: 1 }}><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>Record the exact reason the payment or receipt evidence is being returned.</Typography>{rejectTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>REFERENCE</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{proofText(rejectTarget)}</Typography>{referenceUrl(rejectTarget) && <Button size="small" onClick={() => openReference(rejectTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>Open evidence</Button>}</Paper>}<TextField label="Return reason / Admin review note" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} fullWidth multiline minRows={4} required InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} /></Stack></DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setRejectTarget(null)} disabled={Boolean(busyId)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>Cancel</Button><Button onClick={() => void rejectPayment()} disabled={!rejectTarget || busyId === rejectTarget?.id || rejectReason.trim().length < 8} sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 950 }}>Return / Reject</Button></DialogActions>
            </Dialog>
        </Box>
    );
}

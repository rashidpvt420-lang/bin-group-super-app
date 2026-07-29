import React from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { CheckCircle, Eye, FileCheck2, RefreshCw, Upload, XCircle } from 'lucide-react';
import { collection, db, functions, httpsCallable, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';

type PaymentRecord = {
    id: string;
    workflowVersion?: string;
    ownerName?: string;
    companyName?: string;
    ownerEmail?: string;
    recordType?: string;
    transactionType?: string;
    paymentType?: string;
    status?: string;
    verificationState?: string;
    paymentStatus?: string;
    adminApprovalRequired?: boolean;
    unlocksDashboard?: boolean;
    inspectionVerified?: boolean;
    paymentMethod?: string;
    method?: string;
    paymentReference?: string;
    paymentReferenceId?: string;
    referenceId?: string;
    receiptPath?: string;
    receiptHash?: string;
    receiptGeneration?: string;
    paymentProofPath?: string;
    paymentProofHash?: string;
    paymentProofGeneration?: string;
    notes?: string;
    adminNotes?: string;
    annualContractValue?: number;
    activationDeposit?: number;
    amount?: number;
    amountReceived?: number;
    amountPaid?: number;
    rentPaid?: number;
    currency?: string;
    createdAt?: any;
    updatedAt?: any;
};

const FIVE_PAGE_WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const PENDING_STATUSES = ['pending', 'pending_admin_approval', 'submitted', 'PENDING', 'PENDING_ADMIN_APPROVAL', 'PENDING_VERIFICATION', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION'];
const PHASE1_METHODS = ['CASH', 'CHEQUE'];
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const amountDue = (row: PaymentRecord) => Number(row.activationDeposit || row.amount || row.amountReceived || row.amountPaid || row.rentPaid || 0);
const formatMoney = (value: number, currency = 'AED') => `${currency} ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const isRentPayment = (row: PaymentRecord) => ['OWNER_RENT_PAYMENT', 'TENANT_RENT_PAYMENT_PROOF'].includes(upper(row.recordType)) || ['RENT_COLLECTION', 'RENT_PAYMENT_PROOF'].includes(upper(row.transactionType)) || upper(row.paymentType) === 'RENT_COLLECTION';
const hasImmutableReceipt = (row: PaymentRecord) => Boolean((row.paymentProofPath || row.receiptPath) && /^[a-f0-9]{64}$/i.test(String(row.paymentProofHash || row.receiptHash || '')) && (row.paymentProofGeneration || row.receiptGeneration));
const timestampMillis = (row: PaymentRecord) => row.updatedAt?.toMillis?.() || row.createdAt?.toMillis?.() || Date.parse(String(row.updatedAt || row.createdAt || '')) || 0;
const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const value = String(reader.result || ''); resolve(value.includes(',') ? value.split(',').pop() || '' : value); };
    reader.onerror = () => reject(reader.error || new Error('Unable to read payment receipt.'));
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
    const [reference, setReference] = React.useState('');
    const [method, setMethod] = React.useState('');
    const [notes, setNotes] = React.useState('Verified after all evidence-backed BIN GROUP property visits.');
    const [receipt, setReceipt] = React.useState<File | null>(null);
    const [rejectReason, setRejectReason] = React.useState('');

    React.useEffect(() => {
        let pending: PaymentRecord[] = [];
        let paid: PaymentRecord[] = [];
        let pendingReady = false;
        let paidReady = false;
        const publish = () => {
            if (!pendingReady || !paidReady) return;
            const merged = new Map<string, PaymentRecord>();
            [...pending, ...paid].forEach((row) => merged.set(row.id, row));
            setRows([...merged.values()].sort((a, b) => timestampMillis(b) - timestampMillis(a)));
            setLoading(false);
        };
        const handleError = (value: any) => { setLoading(false); setError(value?.message || 'Payment approvals stream failed.'); };
        const pendingQuery = query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_STATUSES), orderBy('createdAt', 'desc'), limit(50));
        const paidQuery = query(collection(db, 'payment_transactions'), where('status', '==', 'PAID'), where('adminApprovalRequired', '==', true), limit(50));
        const stopPending = onSnapshot(pendingQuery, (snapshot) => { pending = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })); pendingReady = true; publish(); }, handleError);
        const stopPaid = onSnapshot(paidQuery, (snapshot) => { paid = snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) })).filter((row) => row.unlocksDashboard !== true); paidReady = true; publish(); }, handleError);
        return () => { stopPending(); stopPaid(); };
    }, []);

    React.useEffect(() => {
        const paymentId = new URLSearchParams(window.location.search).get('paymentId');
        if (!paymentId || approvalTarget || !rows.length) return;
        const row = rows.find((item) => item.id === paymentId);
        if (row) openApproval(row);
    }, [rows, approvalTarget]);

    const openApproval = (row: PaymentRecord) => {
        setApprovalTarget(row);
        setReference(String(row.paymentReferenceId || row.paymentReference || row.referenceId || ''));
        setMethod(upper(row.paymentMethod || row.method || (isRentPayment(row) ? '' : 'CASH')));
        setNotes(row.notes || 'Verified after all evidence-backed BIN GROUP property visits.');
        setReceipt(null);
        setError(null);
        setNotice(null);
    };

    const approve = async () => {
        if (!approvalTarget) return;
        const rent = isRentPayment(approvalTarget);
        const expected = amountDue(approvalTarget);
        const selectedMethod = upper(method);
        if (!rent && approvalTarget.workflowVersion === FIVE_PAGE_WORKFLOW && approvalTarget.inspectionVerified !== true) { setError('Verified visit evidence is incomplete. Return to Owner Applications and finish every property visit first.'); return; }
        if (!rent && !PHASE1_METHODS.includes(selectedMethod)) { setError('Phase 1 accepts only Cash or Cheque.'); return; }
        if (!reference.trim()) { setError('Enter the official receipt or cheque reference.'); return; }
        if (!rent && !hasImmutableReceipt(approvalTarget) && !receipt) { setError('Attach the official 15% Cash/Cheque receipt.'); return; }
        if (receipt && receipt.size > 10 * 1024 * 1024) { setError('Receipt exceeds the secure 10 MB limit.'); return; }

        setBusyId(approvalTarget.id);
        setError(null);
        try {
            if (!rent && !hasImmutableReceipt(approvalTarget)) {
                await httpsCallable(functions, 'adminRecordOwnerMobilizationPaymentEvidence')({
                    paymentId: approvalTarget.id,
                    paymentReferenceId: reference.trim(),
                    amountReceived: expected,
                    paymentMethod: selectedMethod,
                    filename: receipt?.name.replace(/[^A-Za-z0-9._-]/g, '_'),
                    contentType: receipt?.type || 'application/pdf',
                    encodedDocument: receipt ? await fileToBase64(receipt) : '',
                });
            }
            await httpsCallable(functions, 'adminApprovePayment')({
                paymentId: approvalTarget.id,
                paymentReferenceId: reference.trim(),
                amountReceived: expected,
                method: rent ? upper(approvalTarget.paymentMethod || approvalTarget.method) : selectedMethod,
                internalNotes: notes.trim(),
            });
            setNotice(rent ? 'Rent payment verified.' : 'Exact 15% payment verified. Contract and properties activated; Owner dashboard unlocked.');
            setApprovalTarget(null);
            setReceipt(null);
        } catch (value: any) {
            setError(value?.details || value?.message || 'Approval failed. A fresh Admin MFA login may be required.');
        } finally { setBusyId(null); }
    };

    const reject = async () => {
        if (!rejectTarget) return;
        if (rejectReason.trim().length < 8) { setError('Enter a clear return reason.'); return; }
        setBusyId(rejectTarget.id);
        try {
            await httpsCallable(functions, 'adminRejectPayment')({ paymentId: rejectTarget.id, reason: rejectReason.trim(), returnReason: rejectReason.trim(), internalNotes: rejectReason.trim() });
            setNotice('Payment evidence returned with the Admin reason.');
            setRejectTarget(null);
            setRejectReason('');
        } catch (value: any) { setError(value?.details || value?.message || 'Rejection failed.'); }
        finally { setBusyId(null); }
    };

    const openReceipt = async (row: PaymentRecord) => {
        setError(null);
        try {
            const result = await httpsCallable(functions, 'adminCreateOwnerPaymentEvidenceAccessUrl')({ paymentId: row.id });
            const url = String((result.data as any)?.url || '');
            if (!url) throw new Error('Short-lived receipt URL was not returned.');
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (value: any) { setError(value?.details || value?.message || 'Unable to open protected receipt.'); }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
            <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" gap={2} sx={{ mb: 4 }}>
                <Box><Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>FINANCE COMMAND</Typography><Typography variant="h3" sx={{ fontWeight: 900 }}>Phase 1 Cash / Cheque Approval</Typography><Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>The amount is locked. Admin selects Cash or Cheque, enters the reference, uploads the receipt, then completes one MFA-backed approval.</Typography></Box>
                <Button startIcon={<RefreshCw size={16} />} onClick={() => window.location.reload()} variant="outlined">Refresh</Button>
            </Stack>
            <Alert severity="warning" sx={{ mb: 3 }}>Bank Transfer and Stripe are disabled for Phase 1 Owner activation. Final approval is blocked until all verified visit evidence, the exact 15% amount, active payment-configuration binding and immutable receipt evidence are present.</Alert>
            {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>{error}</Alert>}
            {notice && <Alert severity="success" onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice}</Alert>}
            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15,23,42,0.72)' }}><Table><TableHead><TableRow><TableCell>OWNER</TableCell><TableCell>TYPE</TableCell><TableCell>LOCKED AMOUNT</TableCell><TableCell>STATE</TableCell><TableCell align="right">ACTION</TableCell></TableRow></TableHead><TableBody>
                {loading ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8 }}><CircularProgress /></TableCell></TableRow> : rows.length === 0 ? <TableRow><TableCell colSpan={5} align="center" sx={{ py: 8 }}>No pending payment approvals.</TableCell></TableRow> : rows.map((row) => <TableRow key={row.id}><TableCell><Typography fontWeight={900}>{row.ownerName || row.companyName || row.ownerEmail || 'Owner'}</Typography><Typography variant="caption">{row.id}</Typography></TableCell><TableCell>{isRentPayment(row) ? 'RENT' : 'OWNER 15%'}</TableCell><TableCell>{formatMoney(amountDue(row), row.currency || 'AED')}</TableCell><TableCell><Chip size="small" label={row.verificationState || row.status || 'PENDING'} color={row.inspectionVerified || isRentPayment(row) ? 'warning' : 'default'} /></TableCell><TableCell align="right"><Stack direction="row" spacing={1} justifyContent="flex-end">{hasImmutableReceipt(row) && <IconButton onClick={() => void openReceipt(row)}><Eye size={17} /></IconButton>}<Button size="small" variant="contained" startIcon={<CheckCircle size={15} />} onClick={() => openApproval(row)}>Verify & approve</Button><Button size="small" color="error" startIcon={<XCircle size={15} />} onClick={() => { setRejectTarget(row); setRejectReason(''); }}>Return</Button></Stack></TableCell></TableRow>)}
            </TableBody></Table></TableContainer>

            <Dialog open={Boolean(approvalTarget)} onClose={() => !busyId && setApprovalTarget(null)} fullWidth maxWidth="sm"><DialogTitle>{isRentPayment(approvalTarget || {}) ? 'Verify rent payment' : 'Verify exact 15% and activate Owner'}</DialogTitle><DialogContent><Stack spacing={2.2} sx={{ pt: 1 }}>
                <Alert severity="info">Locked amount: <b>{formatMoney(amountDue(approvalTarget || {}), approvalTarget?.currency || 'AED')}</b>. It cannot be edited.</Alert>
                {!isRentPayment(approvalTarget || {}) && <TextField select fullWidth label="Phase 1 payment method" value={method} onChange={(event) => setMethod(event.target.value)}>{PHASE1_METHODS.map((item) => <MenuItem key={item} value={item}>{item === 'CASH' ? 'Cash received at HQ' : 'Cheque received at HQ'}</MenuItem>)}</TextField>}
                <TextField fullWidth label="Receipt / cheque reference" value={reference} onChange={(event) => setReference(event.target.value)} />
                {!isRentPayment(approvalTarget || {}) && !hasImmutableReceipt(approvalTarget || {}) && <Button component="label" variant="outlined" startIcon={<Upload size={17} />}>{receipt ? receipt.name : 'Attach official receipt'}<input hidden type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setReceipt(event.target.files?.[0] || null)} /></Button>}
                <TextField fullWidth multiline minRows={3} label="Internal verification notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
                <Alert severity="warning">A fresh Admin MFA session is mandatory. Approval activates the contract, properties and Owner dashboard immediately.</Alert>
            </Stack></DialogContent><DialogActions><Button onClick={() => setApprovalTarget(null)}>Cancel</Button><Button variant="contained" onClick={() => void approve()} disabled={Boolean(busyId)} startIcon={busyId ? <CircularProgress size={18} /> : <FileCheck2 size={17} />}>Verify exact payment & approve</Button></DialogActions></Dialog>

            <Dialog open={Boolean(rejectTarget)} onClose={() => !busyId && setRejectTarget(null)} fullWidth maxWidth="sm"><DialogTitle>Return payment evidence</DialogTitle><DialogContent><TextField autoFocus fullWidth multiline minRows={4} label="Clear return reason" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} sx={{ mt: 1 }} /></DialogContent><DialogActions><Button onClick={() => setRejectTarget(null)}>Cancel</Button><Button color="error" variant="contained" onClick={() => void reject()} disabled={Boolean(busyId)}>Return evidence</Button></DialogActions></Dialog>
        </Box>
    );
}

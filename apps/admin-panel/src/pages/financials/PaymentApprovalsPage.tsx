import React from 'react';
import { useLanguage } from '@bin/shared';
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { CheckCircle, XCircle, RefreshCw, RotateCcw } from 'lucide-react';
import {
    collection,
    db,
    doc,
    functions,
    httpsCallable,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from '../../lib/firebase';

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
    invoiceId?: string;
    tenantId?: string;
    gateway?: string;
    stripePaymentIntentId?: string;
};

type PayoutRequestRecord = {
    id: string;
    ownerId?: string;
    ownerUid?: string;
    ownerEmail?: string;
    ownerName?: string;
    amountRequested?: number;
    note?: string;
    status?: string;
    createdAt?: any;
};

const PENDING_PAYMENT_STATUSES = ['pending', 'pending_admin_approval', 'submitted', 'PENDING', 'PENDING_VERIFICATION', 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'ADMIN_VERIFICATION_REQUIRED', 'AWAITING_VERIFICATION'];
const formatMoney = (value?: number, currency = 'AED') => `${currency || 'AED'} ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const toNumber = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const isRentPayment = (row: PaymentRecord) => upper(row.recordType) === 'OWNER_RENT_PAYMENT' || upper(row.transactionType) === 'RENT_COLLECTION' || upper(row.paymentType) === 'RENT_COLLECTION';
const proofText = (row: PaymentRecord) => row.paymentReference || row.paymentReferenceId || row.referenceId || row.referenceFileName || row.receiptUrl || row.proofUrl || row.attachmentUrl || row.proofFileName || '';
const referenceUrl = (row: PaymentRecord) => row.referenceFileUrl || row.receiptUrl || row.proofUrl || row.attachmentUrl || '';
const submittedAmount = (row: PaymentRecord) => row.amountReceived || row.mobilizationAmount || row.amountPaid || row.rentPaid || row.amount || 0;

export default function PaymentApprovalsPage() {
    const { t, isRTL } = useLanguage();
    const [rows, setRows] = React.useState<PaymentRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [busyId, setBusyId] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [approvalTarget, setApprovalTarget] = React.useState<PaymentRecord | null>(null);
    const [paymentReferenceId, setPaymentReferenceId] = React.useState('');
    const [amountReceived, setAmountReceived] = React.useState('');
    const [internalNotes, setInternalNotes] = React.useState('');
    const [cardRows, setCardRows] = React.useState<PaymentRecord[]>([]);
    const [cardLoading, setCardLoading] = React.useState(true);
    const [refundTarget, setRefundTarget] = React.useState<PaymentRecord | null>(null);
    const [refundReason, setRefundReason] = React.useState('');
    const [refundBusyId, setRefundBusyId] = React.useState<string | null>(null);
    const [payoutRows, setPayoutRows] = React.useState<PayoutRequestRecord[]>([]);
    const [payoutLoading, setPayoutLoading] = React.useState(true);
    const [payoutBusyId, setPayoutBusyId] = React.useState<string | null>(null);
    const [payoutRejectTarget, setPayoutRejectTarget] = React.useState<PayoutRequestRecord | null>(null);
    const [payoutRejectReason, setPayoutRejectReason] = React.useState('');

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

    React.useEffect(() => {
        const q = query(
            collection(db, 'payment_transactions'),
            where('paymentType', '==', 'TENANT_RENT'),
            where('status', '==', 'PAID'),
            orderBy('createdAt', 'desc'),
            limit(50)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setCardRows(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
                setCardLoading(false);
            },
            (err) => {
                console.error('[ADMIN_PAYMENTS] card payments stream failed', err);
                setCardLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    React.useEffect(() => {
        const q = query(collection(db, 'payoutRequests'), where('status', '==', 'requested'), orderBy('createdAt', 'desc'), limit(50));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPayoutRows(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) })));
            setPayoutLoading(false);
        }, (err) => {
            console.error('[ADMIN_PAYMENTS] payout requests stream failed', err);
            setPayoutLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const markPayoutPaid = async (row: PayoutRequestRecord) => {
        setPayoutBusyId(row.id);
        setError(null);
        try {
            await updateDoc(doc(db, 'payoutRequests', row.id), { status: 'paid', paidAt: serverTimestamp(), updatedAt: serverTimestamp() });
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] payout mark-paid failed', err);
            setError(err?.message || 'Could not mark payout as paid.');
        } finally {
            setPayoutBusyId(null);
        }
    };

    const openPayoutRejectDialog = (row: PayoutRequestRecord) => {
        setPayoutRejectTarget(row);
        setPayoutRejectReason('');
    };

    const submitPayoutReject = async () => {
        if (!payoutRejectTarget) return;
        setPayoutBusyId(payoutRejectTarget.id);
        setError(null);
        try {
            await updateDoc(doc(db, 'payoutRequests', payoutRejectTarget.id), { status: 'rejected', rejectionReason: payoutRejectReason.trim() || 'Rejected by finance.', updatedAt: serverTimestamp() });
            setPayoutRejectTarget(null);
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] payout reject failed', err);
            setError(err?.message || 'Could not reject payout request.');
        } finally {
            setPayoutBusyId(null);
        }
    };

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

    const openRefundDialog = (row: PaymentRecord) => {
        setRefundTarget(row);
        setRefundReason('');
    };

    const submitRefund = async () => {
        if (!refundTarget?.invoiceId) return;
        setRefundBusyId(refundTarget.id);
        setError(null);
        try {
            const callable = httpsCallable(functions, 'adminRefundInvoicePayment');
            await callable({
                invoiceId: refundTarget.invoiceId,
                reason: refundReason.trim() || 'Refunded by admin.',
            });
            setRefundTarget(null);
        } catch (err: any) {
            console.error('[ADMIN_PAYMENTS] refund failed', err);
            setError(err?.message || 'Refund failed.');
        } finally {
            setRefundBusyId(null);
        }
    };

    const openReference = (row: PaymentRecord) => {
        const url = referenceUrl(row);
        if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <Box sx={{ p: 4, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 4 }}>
                <Box>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>{t('admin.payment_approvals.page_overline')}</Typography>
                    <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>{t('admin.payment_approvals.page_title')}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>{t('admin.payment_approvals.page_subtitle')}</Typography>
                </Box>
                <Button startIcon={<RefreshCw size={16} />} onClick={() => window.location.reload()} sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.35)' }} variant="outlined">{t('admin.payment_approvals.refresh_btn')}</Button>
            </Stack>

            {error && <Paper sx={{ p: 2, mb: 3, bgcolor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fecaca' }}>{error}</Paper>}

            <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                {loading ? <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box> : rows.length === 0 ? (
                    <Box sx={{ p: 8, textAlign: 'center' }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>{t('admin.payment_approvals.no_pending_title')}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>{t('admin.payment_approvals.no_pending_desc')}</Typography></Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead><TableRow><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_type')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_owner_tenant')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_property_contract')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_method')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_reference')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_amount')}</TableCell><TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_status')}</TableCell><TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_action')}</TableCell></TableRow></TableHead>
                            <TableBody>
                                {rows.map((row) => {
                                    const rent = isRentPayment(row);
                                    const hasReferenceFile = Boolean(referenceUrl(row));
                                    return (
                                        <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                            <TableCell><Chip label={rent ? t('admin.payment_approvals.chip_rent_collection') : t('admin.payment_approvals.chip_activation')} size="small" sx={{ bgcolor: rent ? 'rgba(16,185,129,0.16)' : 'rgba(218,165,32,0.16)', color: rent ? '#10b981' : '#DAA520', fontWeight: 900 }} /></TableCell>
                                            <TableCell><Typography sx={{ fontWeight: 900 }}>{rent ? (row.tenantName || t('admin.payment_approvals.tenant_fallback')) : (row.companyName || row.ownerName || t('admin.payment_approvals.owner_submission_fallback'))}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.ownerEmail || row.ownerId || row.ownerUid || row.id}</Typography></TableCell>
                                            <TableCell>{rent ? `${row.propertyName || row.propertyId || t('admin.payment_approvals.property_fallback')}${row.unitNumber ? ` ${t('admin.payment_approvals.unit_suffix').replace('{number}', row.unitNumber)}` : ''}` : (row.contractId || row.intakeId || '—')}</TableCell>
                                            <TableCell>{row.paymentMethod || t('admin.payment_approvals.method_fallback')}</TableCell>
                                            <TableCell><Typography variant="body2" sx={{ maxWidth: 240, overflowWrap: 'anywhere' }}>{proofText(row) || t('admin.payment_approvals.no_reference')}</Typography>{row.notes && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)' }}>{row.notes}</Typography>}{row.referenceUploadError && <Typography variant="caption" sx={{ color: '#f87171', display: 'block' }}>{row.referenceUploadError}</Typography>}{hasReferenceFile && <Button size="small" onClick={() => openReference(row)} sx={{ color: '#DAA520', fontWeight: 900, mt: 0.5 }}>{t('admin.payment_approvals.open_file_btn')}</Button>}</TableCell>
                                            <TableCell>{formatMoney(submittedAmount(row), row.currency)}</TableCell>
                                            <TableCell><Chip label={row.status || row.paymentStatus || row.verificationState || 'pending'} size="small" sx={{ bgcolor: 'rgba(218,165,32,0.16)', color: '#DAA520', fontWeight: 900 }} /></TableCell>
                                            <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}><Button size="small" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{rent ? t('admin.payment_approvals.verify_rent_btn') : t('admin.payment_approvals.verify_unlock_btn')}</Button><Button size="small" startIcon={<XCircle size={14} />} disabled={busyId === row.id} onClick={() => rejectPayment(row.id)} sx={{ color: '#f87171', fontWeight: 900 }}>{t('admin.payment_approvals.reject_btn')}</Button></Stack></TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Paper sx={{ mt: 4, bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <Box sx={{ p: 3, pb: 2 }}>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>
                        {t('admin.payment_approvals.card_payments_overline')}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: '#fff' }}>
                        {t('admin.payment_approvals.card_payments_title')}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
                        {t('admin.payment_approvals.card_payments_desc')}
                    </Typography>
                </Box>
                {cardLoading ? (
                    <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress sx={{ color: '#DAA520' }} />
                    </Box>
                ) : cardRows.length === 0 ? (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.55)' }}>{t('admin.payment_approvals.no_card_payments')}</Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_tenant')}</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_invoice')}</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_amount')}</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_status')}</TableCell>
                                    <TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_action')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {cardRows.map((row) => (
                                    <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>{row.tenantId || '—'}</Typography>
                                        </TableCell>
                                        <TableCell>{row.invoiceId || '—'}</TableCell>
                                        <TableCell>{formatMoney(row.amount, row.currency)}</TableCell>
                                        <TableCell>
                                            <Chip label={row.status || 'PAID'} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.16)', color: '#34d399', fontWeight: 900 }} />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Button
                                                size="small"
                                                startIcon={<RotateCcw size={14} />}
                                                disabled={refundBusyId === row.id || !row.invoiceId}
                                                onClick={() => openRefundDialog(row)}
                                                sx={{ color: '#f87171', fontWeight: 900 }}
                                            >
                                                {t('admin.payment_approvals.refund_btn')}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Paper sx={{ mt: 4, bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <Box sx={{ p: 3, pb: 2 }}>
                    <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>
                        {t('admin.payment_approvals.owner_payouts_overline')}
                    </Typography>
                    <Typography variant="h5" sx={{ fontWeight: 900, color: '#fff' }}>
                        {t('admin.payment_approvals.owner_payouts_title')}
                    </Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>
                        {t('admin.payment_approvals.owner_payouts_desc')}
                    </Typography>
                </Box>
                {payoutLoading ? (
                    <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}>
                        <CircularProgress sx={{ color: '#DAA520' }} />
                    </Box>
                ) : payoutRows.length === 0 ? (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.55)' }}>{t('admin.payment_approvals.no_payout_requests')}</Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_owner')}</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_amount')}</TableCell>
                                    <TableCell sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_note')}</TableCell>
                                    <TableCell align="right" sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.col_action')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {payoutRows.map((row) => (
                                    <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 900 }}>{row.ownerName || t('admin.payment_approvals.owner_name_fallback')}</Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.ownerEmail || row.ownerId || row.ownerUid || row.id}</Typography>
                                        </TableCell>
                                        <TableCell>{formatMoney(row.amountRequested)}</TableCell>
                                        <TableCell><Typography variant="body2" sx={{ maxWidth: 280, overflowWrap: 'anywhere', color: 'rgba(255,255,255,0.7)' }}>{row.note || '—'}</Typography></TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" justifyContent="flex-end" gap={1}>
                                                <Button size="small" startIcon={<CheckCircle size={14} />} disabled={payoutBusyId === row.id} onClick={() => markPayoutPaid(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900, '&:hover': { bgcolor: '#15803d' } }}>{t('admin.payment_approvals.mark_paid_btn')}</Button>
                                                <Button size="small" startIcon={<XCircle size={14} />} disabled={payoutBusyId === row.id} onClick={() => openPayoutRejectDialog(row)} sx={{ color: '#f87171', fontWeight: 900 }}>{t('admin.payment_approvals.reject_btn')}</Button>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? t('admin.payment_approvals.dialog_confirm_rent_title') : t('admin.payment_approvals.dialog_confirm_activation_title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{approvalTarget && isRentPayment(approvalTarget) ? t('admin.payment_approvals.dialog_confirm_rent_desc') : t('admin.payment_approvals.dialog_confirm_activation_desc')}</Typography>
                        {approvalTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>{t('admin.payment_approvals.submitted_reference_label')}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{proofText(approvalTarget) || t('admin.payment_approvals.no_reference')}</Typography>{approvalTarget.referenceUploadError && <Typography variant="body2" sx={{ color: '#f87171', mt: 1 }}>{approvalTarget.referenceUploadError}</Typography>}{referenceUrl(approvalTarget) && <Button size="small" onClick={() => openReference(approvalTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>{t('admin.payment_approvals.open_uploaded_file_btn')}</Button>}{approvalTarget.notes && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 1 }}>{approvalTarget.notes}</Typography>}</Paper>}
                        <TextField label={t('admin.payment_approvals.field_bank_reference')} value={paymentReferenceId} onChange={(e) => setPaymentReferenceId(e.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label={t('admin.payment_approvals.field_amount_received')} value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} fullWidth InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                        <TextField label={t('admin.payment_approvals.field_internal_notes')} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} fullWidth multiline minRows={3} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}><Button onClick={() => setApprovalTarget(null)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('admin.payment_approvals.cancel_btn')}</Button><Button onClick={approvePayment} disabled={!approvalTarget || busyId === approvalTarget?.id} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? t('admin.payment_approvals.confirm_rent_btn') : t('admin.payment_approvals.confirm_unlock_btn')}</Button></DialogActions>
            </Dialog>

            <Dialog open={Boolean(refundTarget)} onClose={() => setRefundTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.payment_approvals.dialog_refund_title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>
                            {t('admin.payment_approvals.dialog_refund_desc').replace('{amount}', formatMoney(refundTarget?.amount, refundTarget?.currency)).replace('{id}', refundTarget?.invoiceId || '')}
                        </Typography>
                        <TextField label={t('admin.payment_approvals.field_refund_reason')} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} fullWidth multiline minRows={2} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setRefundTarget(null)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('admin.payment_approvals.cancel_btn')}</Button>
                    <Button onClick={submitRefund} disabled={!refundTarget || refundBusyId === refundTarget?.id} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>
                        {t('admin.payment_approvals.confirm_refund_btn')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={Boolean(payoutRejectTarget)} onClose={() => setPayoutRejectTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 } }}>
                <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{t('admin.payment_approvals.dialog_reject_payout_title')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2.5} sx={{ mt: 1 }}>
                        <Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>
                            {t('admin.payment_approvals.dialog_reject_payout_desc').replace('{amount}', formatMoney(payoutRejectTarget?.amountRequested)).replace('{owner}', payoutRejectTarget?.ownerName || t('admin.payment_approvals.this_owner'))}
                        </Typography>
                        <TextField label={t('admin.payment_approvals.field_rejection_reason')} value={payoutRejectReason} onChange={(e) => setPayoutRejectReason(e.target.value)} fullWidth multiline minRows={2} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.45)' } }} InputProps={{ sx: { color: '#fff' } }} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setPayoutRejectTarget(null)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{t('admin.payment_approvals.cancel_btn')}</Button>
                    <Button onClick={submitPayoutReject} disabled={!payoutRejectTarget || payoutBusyId === payoutRejectTarget?.id} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>
                        {t('admin.payment_approvals.confirm_rejection_btn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

import React from 'react';
import {
  Alert,
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
import { CheckCircle, RefreshCw, XCircle } from 'lucide-react';
import { useLanguage } from '@bin/shared';
import { collection, db, functions, httpsCallable, limit, onSnapshot, query, where } from '../../lib/firebase';

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
  referenceFileName?: string;
  referenceUploadError?: string;
  notes?: string;
  adminNotes?: string;
  tenantName?: string;
  propertyName?: string;
  propertyId?: string;
  unitNumber?: string;
  amount?: number;
  amountPaid?: number;
  rentPaid?: number;
  amountReceived?: number;
  mobilizationAmount?: number;
  currency?: string;
  adminApprovalRequired?: boolean;
  dashboardUnlockApproved?: boolean;
  adminApproved?: boolean;
  unlocksDashboard?: boolean;
  activationState?: string;
  createdAt?: any;
  submittedAt?: any;
  activationRequestedAt?: any;
};

const PENDING_PAYMENT_STATUSES = [
  'pending',
  'pending_admin_approval',
  'submitted',
  'PENDING',
  'PENDING_VERIFICATION',
  'PENDING_ADMIN_PAYMENT_VERIFICATION',
  'ADMIN_VERIFICATION_REQUIRED',
  'AWAITING_VERIFICATION',
  'REVIEW_REQUIRED',
];
const upper = (value: unknown) => String(value || '').trim().toUpperCase();
const toNumber = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const formatMoney = (value?: number, currency = 'AED') => `${currency || 'AED'} ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const submittedAmount = (row: PaymentRecord) => row.amountReceived || row.mobilizationAmount || row.amountPaid || row.rentPaid || row.amount || 0;
const referenceUrl = (row: PaymentRecord) => row.referenceFileUrl || row.receiptUrl || row.proofUrl || row.attachmentUrl || '';
const proofText = (row: PaymentRecord) => row.paymentReference || row.paymentReferenceId || row.referenceId || row.referenceFileName || row.receiptUrl || row.proofUrl || row.attachmentUrl || row.proofFileName || 'No reference recorded';
const isRentPayment = (row: PaymentRecord) => upper(row.recordType) === 'OWNER_RENT_PAYMENT' || upper(row.transactionType) === 'RENT_COLLECTION' || upper(row.paymentType) === 'RENT_COLLECTION';
const timeOf = (row: PaymentRecord) => row.createdAt?.toDate?.()?.getTime?.() || row.submittedAt?.toDate?.()?.getTime?.() || row.activationRequestedAt?.toDate?.()?.getTime?.() || row.createdAt?.seconds * 1000 || 0;
const isActionable = (row: PaymentRecord) => {
  const status = upper(row.status || row.paymentStatus);
  if (['APPROVED', 'REJECTED', 'CANCELLED', 'REFUNDED'].includes(status)) return false;
  if (row.dashboardUnlockApproved === true || row.adminApproved === true) return false;
  return row.adminApprovalRequired === true || PENDING_PAYMENT_STATUSES.map(upper).includes(status) || upper(row.verificationState) === 'AUTO_VERIFIED';
};

export default function PaymentApprovalsPage() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const copy = (en: string, arText: string) => ar ? arText : en;
  const [rows, setRows] = React.useState<PaymentRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approvalTarget, setApprovalTarget] = React.useState<PaymentRecord | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<PaymentRecord | null>(null);
  const [paymentReferenceId, setPaymentReferenceId] = React.useState('');
  const [amountReceived, setAmountReceived] = React.useState('');
  const [internalNotes, setInternalNotes] = React.useState('');
  const [rejectReason, setRejectReason] = React.useState('');

  React.useEffect(() => {
    const buckets = new Map<string, PaymentRecord[]>();
    const ready = new Set<string>();
    const publish = () => {
      const merged = new Map<string, PaymentRecord>();
      for (const bucket of buckets.values()) for (const row of bucket) merged.set(row.id, row);
      setRows([...merged.values()].filter(isActionable).sort((a, b) => timeOf(b) - timeOf(a)));
      if (ready.size === 2) setLoading(false);
    };

    const pendingQuery = query(collection(db, 'payment_transactions'), where('status', 'in', PENDING_PAYMENT_STATUSES), limit(100));
    const approvalQuery = query(collection(db, 'payment_transactions'), where('adminApprovalRequired', '==', true), limit(100));

    const subscribe = (key: string, request: ReturnType<typeof query>) => onSnapshot(request, (snapshot) => {
      buckets.set(key, snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<PaymentRecord, 'id'>) })));
      ready.add(key);
      setError(null);
      publish();
    }, (streamError) => {
      console.error(`[ADMIN_PAYMENTS] ${key} stream failed`, streamError);
      buckets.set(key, []);
      ready.add(key);
      setError(streamError?.message || copy('Payment approvals stream failed.', 'فشل تحميل قائمة موافقات الدفع.'));
      publish();
    });

    const unsubscribePending = subscribe('pending', pendingQuery);
    const unsubscribeApproval = subscribe('admin-required', approvalQuery);
    return () => { unsubscribePending(); unsubscribeApproval(); };
  }, [ar]);

  const openApproveDialog = (row: PaymentRecord) => {
    setApprovalTarget(row);
    setPaymentReferenceId(String(row.paymentReferenceId || row.paymentReference || row.referenceId || ''));
    setAmountReceived(String(submittedAmount(row) || ''));
    setInternalNotes(row.notes || '');
  };

  const openRejectDialog = (row: PaymentRecord) => {
    setRejectTarget(row);
    setRejectReason(row.adminNotes || '');
    setError(null);
  };

  const approvePayment = async () => {
    if (!approvalTarget) return;
    setBusyId(approvalTarget.id);
    setError(null);
    try {
      const callable = httpsCallable(functions, 'adminApprovePayment');
      await callable({ paymentId: approvalTarget.id, paymentReferenceId: paymentReferenceId.trim(), amountReceived: toNumber(amountReceived), internalNotes: internalNotes.trim() });
      setApprovalTarget(null);
    } catch (approvalError: any) {
      console.error('[ADMIN_PAYMENTS] approval failed', approvalError);
      setError(approvalError?.message || copy('Approval failed.', 'فشلت الموافقة.'));
    } finally {
      setBusyId(null);
    }
  };

  const rejectPayment = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 8) {
      setError(copy('Enter a clear return reason before rejecting this payment.', 'أدخل سبباً واضحاً قبل رفض هذه الدفعة.'));
      return;
    }
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      const callable = httpsCallable(functions, 'adminRejectPayment');
      await callable({ paymentId: rejectTarget.id, reason, returnReason: reason, reviewNote: reason, internalNotes: reason });
      setRejectTarget(null);
      setRejectReason('');
    } catch (rejectionError: any) {
      console.error('[ADMIN_PAYMENTS] rejection failed', rejectionError);
      setError(rejectionError?.message || copy('Rejection failed.', 'فشل الرفض.'));
    } finally {
      setBusyId(null);
    }
  };

  const openReference = (row: PaymentRecord) => {
    const url = referenceUrl(row);
    if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box sx={{ p: 4, color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 900, letterSpacing: 3 }}>{copy('FINANCE COMMAND', 'مركز القيادة المالية')}</Typography>
          <Typography variant="h3" sx={{ fontWeight: 900, letterSpacing: -1 }}>{copy('Payment Approvals', 'موافقات الدفع')}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', mt: 1 }}>{copy('Manual proofs and Stripe-paid owner activations awaiting final Admin approval appear here in real time.', 'تظهر هنا إثباتات الدفع اليدوية ودفعات Stripe التي تنتظر الموافقة النهائية من الإدارة.')}</Typography>
        </Box>
        <Button startIcon={<RefreshCw size={16} />} onClick={() => window.location.reload()} sx={{ color: '#DAA520', borderColor: 'rgba(218,165,32,0.35)' }} variant="outlined">{copy('Refresh', 'تحديث')}</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Paper sx={{ bgcolor: 'rgba(15,23,42,0.92)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
        {loading ? <Box sx={{ p: 8, display: 'flex', justifyContent: 'center' }}><CircularProgress sx={{ color: '#DAA520' }} /></Box> : rows.length === 0 ? (
          <Box sx={{ p: 8, textAlign: 'center' }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 900 }}>{copy('No pending payment submissions', 'لا توجد دفعات بانتظار الموافقة')}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>{copy('New manual proofs and Stripe verifications will appear here.', 'ستظهر هنا إثباتات الدفع الجديدة وتحققات Stripe.')}</Typography></Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead><TableRow>{[copy('Type', 'النوع'), copy('Owner / Tenant', 'المالك / المستأجر'), copy('Property / Contract', 'العقار / العقد'), copy('Method', 'الطريقة'), copy('Reference', 'المرجع'), copy('Amount', 'المبلغ'), copy('State', 'الحالة'), copy('Action', 'الإجراء')].map((label, index) => <TableCell key={label} align={index === 7 ? 'right' : 'left'} sx={{ color: '#DAA520', fontWeight: 900 }}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((row) => {
                  const rent = isRentPayment(row);
                  const hasReferenceFile = Boolean(referenceUrl(row));
                  const stripeVerified = upper(row.verificationState) === 'AUTO_VERIFIED';
                  return <TableRow key={row.id} sx={{ '& td': { borderColor: 'rgba(255,255,255,0.07)', color: '#fff' } }}>
                    <TableCell><Chip label={rent ? copy('Rent Collection', 'تحصيل إيجار') : copy('Activation', 'تفعيل')} size="small" sx={{ bgcolor: rent ? 'rgba(16,185,129,0.16)' : 'rgba(218,165,32,0.16)', color: rent ? '#10b981' : '#DAA520', fontWeight: 900 }} /></TableCell>
                    <TableCell><Typography sx={{ fontWeight: 900 }}>{rent ? (row.tenantName || copy('Tenant', 'مستأجر')) : (row.companyName || row.ownerName || copy('Owner Submission', 'طلب مالك'))}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.ownerEmail || row.ownerId || row.ownerUid || row.id}</Typography></TableCell>
                    <TableCell>{rent ? `${row.propertyName || row.propertyId || copy('Property', 'عقار')}${row.unitNumber ? ` · ${copy('Unit', 'الوحدة')} ${row.unitNumber}` : ''}` : (row.contractId || row.intakeId || '—')}</TableCell>
                    <TableCell>{row.paymentMethod || copy('Manual', 'يدوي')}</TableCell>
                    <TableCell><Typography variant="body2" sx={{ maxWidth: 240, overflowWrap: 'anywhere' }}>{proofText(row)}</Typography>{row.referenceUploadError && <Typography variant="caption" sx={{ color: '#f87171', display: 'block' }}>{row.referenceUploadError}</Typography>}{hasReferenceFile && <Button size="small" onClick={() => openReference(row)} sx={{ color: '#DAA520', fontWeight: 900, mt: 0.5 }}>{copy('Open file', 'فتح الملف')}</Button>}</TableCell>
                    <TableCell>{formatMoney(submittedAmount(row), row.currency)}</TableCell>
                    <TableCell><Stack spacing={0.5}><Chip label={stripeVerified ? copy('STRIPE VERIFIED', 'تم التحقق عبر STRIPE') : (row.status || row.paymentStatus || row.verificationState || 'pending')} size="small" color={stripeVerified ? 'success' : 'warning'} sx={{ fontWeight: 900 }} />{row.adminApprovalRequired === true && <Typography variant="caption" sx={{ color: '#fcd34d' }}>{copy('Admin unlock required', 'مطلوب فتح الإدارة')}</Typography>}</Stack></TableCell>
                    <TableCell align="right"><Stack direction="row" justifyContent="flex-end" gap={1}><Button size="small" startIcon={<CheckCircle size={14} />} disabled={busyId === row.id} onClick={() => openApproveDialog(row)} sx={{ bgcolor: '#16a34a', color: '#fff', fontWeight: 900 }}>{rent ? copy('Verify Rent', 'تحقق من الإيجار') : copy('Approve & Unlock', 'موافقة وفتح')}</Button><Button size="small" startIcon={<XCircle size={14} />} disabled={busyId === row.id} onClick={() => openRejectDialog(row)} sx={{ color: '#f87171', fontWeight: 900 }}>{copy('Reject', 'رفض')}</Button></Stack></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={Boolean(approvalTarget)} onClose={() => setApprovalTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, direction: isRTL ? 'rtl' : 'ltr' } }}>
        <DialogTitle sx={{ color: '#DAA520', fontWeight: 950 }}>{approvalTarget && isRentPayment(approvalTarget) ? copy('Confirm Rent Payment', 'تأكيد دفعة الإيجار') : copy('Confirm Payment & Unlock Owner', 'تأكيد الدفع وفتح حساب المالك')}</DialogTitle>
        <DialogContent><Stack spacing={2.5} sx={{ mt: 1 }}><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{approvalTarget && isRentPayment(approvalTarget) ? copy('This verifies the rent payment only.', 'هذا يؤكد دفعة الإيجار فقط.') : copy('This activates the contract and unlocks the owner dashboard.', 'سيؤدي هذا إلى تفعيل العقد وفتح لوحة المالك.')}</Typography>{approvalTarget && <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}><Typography variant="caption" sx={{ color: '#DAA520', fontWeight: 900 }}>{copy('SUBMITTED REFERENCE', 'المرجع المقدم')}</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{proofText(approvalTarget)}</Typography>{referenceUrl(approvalTarget) && <Button size="small" onClick={() => openReference(approvalTarget)} sx={{ color: '#DAA520', fontWeight: 900, mt: 1 }}>{copy('Open uploaded file', 'فتح الملف المرفوع')}</Button>}</Paper>}<TextField label={copy('Bank reference / transaction ID', 'مرجع البنك / رقم العملية')} value={paymentReferenceId} onChange={(event) => setPaymentReferenceId(event.target.value)} fullWidth InputProps={{ sx: { color: '#fff' } }} /><TextField label={copy('Amount received', 'المبلغ المستلم')} value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} fullWidth InputProps={{ sx: { color: '#fff' } }} /><TextField label={copy('Internal notes', 'ملاحظات داخلية')} value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} fullWidth multiline minRows={3} InputProps={{ sx: { color: '#fff' } }} /></Stack></DialogContent>
        <DialogActions sx={{ p: 3 }}><Button onClick={() => setApprovalTarget(null)}>{copy('Cancel', 'إلغاء')}</Button><Button onClick={approvePayment} disabled={!approvalTarget || busyId === approvalTarget?.id} sx={{ bgcolor: '#DAA520', color: '#000', fontWeight: 950 }}>{copy('Confirm & Unlock', 'تأكيد وفتح')}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(rejectTarget)} onClose={() => setRejectTarget(null)} fullWidth maxWidth="sm" PaperProps={{ sx: { bgcolor: '#020617', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, direction: isRTL ? 'rtl' : 'ltr' } }}>
        <DialogTitle sx={{ color: '#f87171', fontWeight: 950 }}>{copy('Return / Reject Payment Proof', 'إرجاع / رفض إثبات الدفع')}</DialogTitle>
        <DialogContent><Stack spacing={2.5} sx={{ mt: 1 }}><Typography sx={{ color: 'rgba(255,255,255,0.65)' }}>{copy('Enter the exact reason. It will be stored in the audit history.', 'أدخل السبب الدقيق وسيتم حفظه في سجل التدقيق.')}</Typography><TextField label={copy('Return reason / Admin review note', 'سبب الإرجاع / ملاحظة الإدارة')} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} fullWidth multiline minRows={4} required InputProps={{ sx: { color: '#fff' } }} /></Stack></DialogContent>
        <DialogActions sx={{ p: 3 }}><Button onClick={() => setRejectTarget(null)}>{copy('Cancel', 'إلغاء')}</Button><Button onClick={rejectPayment} disabled={!rejectTarget || busyId === rejectTarget?.id || rejectReason.trim().length < 8} sx={{ bgcolor: '#ef4444', color: '#fff', fontWeight: 950 }}>{copy('Return / Reject', 'إرجاع / رفض')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

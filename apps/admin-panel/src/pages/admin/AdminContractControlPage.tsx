import React from 'react';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const terminalStates = ['CLOSED', 'CANCELLED', 'EXPIRED', 'TERMINATED'];
const isOpen = (row: any) => !terminalStates.some((state) => normalize(row.contractStatus || row.status).includes(state));
const money = (value: unknown) => `AED ${Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Notice = { severity: 'success' | 'error' | 'info' | 'warning'; text: string };

export default function AdminContractControlPage() {
  const { isRTL } = useLanguage();
  const label = React.useCallback((en: string, ar: string) => (isRTL ? ar : en), [isRTL]);
  const [contracts, setContracts] = React.useState<any[]>([]);
  const [renewals, setRenewals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState('OWNER_REQUEST');
  const [note, setNote] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [rebuilding, setRebuilding] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [refundDecision, setRefundDecision] = React.useState<'FULL_REFUND' | 'NO_REFUND'>('FULL_REFUND');
  const [refundReference, setRefundReference] = React.useState('');
  const [refundNote, setRefundNote] = React.useState('');
  const [refundBusyId, setRefundBusyId] = React.useState('');

  React.useEffect(() => {
    const stopContracts = onSnapshot(collection(db, 'contracts'), (snapshot) => {
      const rows: any[] = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
      rows.sort((a, b) => String(a.contractNumber || a.id).localeCompare(String(b.contractNumber || b.id)));
      setContracts(rows);
      setLoading(false);
    }, () => {
      setLoading(false);
      setNotice({ severity: 'error', text: label('Could not load contracts.', 'تعذر تحميل العقود.') });
    });
    const stopRenewals = onSnapshot(collection(db, 'contract_renewal_watch'), (snapshot) => {
      const rows: any[] = snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
      rows.sort((a, b) => Number(a.daysRemaining || 0) - Number(b.daysRemaining || 0));
      setRenewals(rows);
    });
    return () => { stopContracts(); stopRenewals(); };
  }, [isRTL, label]);

  const openContracts = contracts.filter(isOpen);
  const refundReviewContracts = contracts.filter((row) => row.refundReviewRequired === true && String(row.linkedPaymentId || '').trim());

  const rebuildRenewals = async () => {
    setRebuilding(true);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'rebuildContractRenewalWatch');
      const response = await callable({});
      const processed = Number((response.data as any)?.processed || 0);
      setNotice({ severity: 'success', text: label(`Renewal engine rebuilt: ${processed} processed.`, `تمت إعادة بناء محرك التجديد: ${processed} سجل.`) });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || label('Renewal rebuild failed.', 'فشلت إعادة بناء التجديدات.') });
    } finally {
      setRebuilding(false);
    }
  };

  const closeContract = async (contractId: string) => {
    const adminNote = note.trim();
    if (adminNote.length < 8) {
      setNotice({ severity: 'warning', text: label('Enter an Admin note of at least 8 characters.', 'أدخل ملاحظة مسؤول لا تقل عن 8 أحرف.') });
      return;
    }
    setBusyId(contractId);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'adminCloseContract');
      const response = await callable({ contractId, reason, note: adminNote });
      const result = response.data as any;
      setNote('');
      setNotice({
        severity: 'success',
        text: result?.idempotent
          ? label('Contract was already closed.', 'كان العقد مغلقاً بالفعل.')
          : label(`Contract closed; ${Number(result?.propertiesDisabled || 0)} properties disabled and ${Number(result?.renewalRecordsClosed || 0)} renewal records closed.`, `تم إغلاق العقد؛ تم تعطيل ${Number(result?.propertiesDisabled || 0)} عقار وإغلاق ${Number(result?.renewalRecordsClosed || 0)} سجل تجديد.`),
      });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || label('Contract action failed.', 'فشل إجراء العقد.') });
    } finally {
      setBusyId('');
    }
  };

  const resolveRefundDisposition = async (row: any) => {
    const paymentId = String(row.linkedPaymentId || '').trim();
    const auditNote = refundNote.trim();
    const reference = refundReference.trim();
    if (!paymentId) {
      setNotice({ severity: 'error', text: label('The closed contract is missing its linked payment ID.', 'العقد المغلق لا يحتوي على معرف الدفعة المرتبطة.') });
      return;
    }
    if (auditNote.length < 8) {
      setNotice({ severity: 'warning', text: label('Enter a refund decision note of at least 8 characters.', 'أدخل ملاحظة قرار الاسترداد من 8 أحرف على الأقل.') });
      return;
    }
    if (refundDecision === 'FULL_REFUND' && reference.length < 4) {
      setNotice({ severity: 'warning', text: label('Enter the Cash/Cheque refund reference.', 'أدخل مرجع استرداد النقد/الشيك.') });
      return;
    }
    setRefundBusyId(row.id);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'adminRecordOwnerPaymentRefund');
      const response = await callable({
        paymentId,
        decision: refundDecision,
        refundReferenceId: refundDecision === 'FULL_REFUND' ? reference : '',
        note: auditNote,
      });
      const result = response.data as any;
      setRefundReference('');
      setRefundNote('');
      setNotice({
        severity: 'success',
        text: result?.idempotent
          ? label('This financial disposition was already recorded.', 'تم تسجيل هذا القرار المالي مسبقاً.')
          : refundDecision === 'FULL_REFUND'
            ? label(`Full refund recorded from the authoritative payment: AED ${Number(result?.refundAmount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`, `تم تسجيل الاسترداد الكامل من الدفعة المعتمدة: ${Number(result?.refundAmount || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} درهم.`)
            : label('No-refund disposition recorded with audit evidence.', 'تم تسجيل قرار عدم الاسترداد مع دليل التدقيق.'),
      });
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || label('Refund disposition failed.', 'فشل قرار الاسترداد.') });
    } finally {
      setRefundBusyId('');
    }
  };


  return (
    <Box data-testid="admin-contract-control" sx={{ p: { xs: 2, md: 4 }, bgcolor: '#020617', minHeight: '100%', color: '#fff', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'flex-start' }}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="h4" fontWeight="950">{label('Contract Control & Renewals', 'التحكم بالعقود والتجديدات')}</Typography>
            <Typography color="rgba(255,255,255,0.6)">{label('MFA-protected closure, dispatch suspension and renewal evidence.', 'إغلاق محمي بالمصادقة متعددة العوامل وتعليق الإرسال وأدلة التجديد.')}</Typography>
          </Box>
          <Button data-testid="admin-contract-rebuild-renewals" variant="contained" color="secondary" onClick={rebuildRenewals} disabled={rebuilding}>
            {rebuilding ? label('Rebuilding...', 'جارٍ إعادة البناء...') : label('Force Renewal Rebuild', 'إعادة بناء التجديدات')}
          </Button>
        </Stack>

        {notice && <Alert data-testid="admin-contract-notice" severity={notice.severity} onClose={() => setNotice(null)}>{notice.text}</Alert>}

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box><Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>{label('Open contracts', 'العقود المفتوحة')}</Typography><Typography variant="h5" color="#fff" fontWeight="950">{openContracts.length}</Typography></Box>
            <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
              <TextField data-testid="admin-contract-reason" size="small" select label={label('Reason', 'السبب')} value={reason} onChange={(event) => setReason(event.target.value)} sx={{ minWidth: 220 }}>
                <MenuItem value="OWNER_REQUEST">{label('Owner request', 'طلب المالك')}</MenuItem>
                <MenuItem value="NON_PAYMENT">{label('Non-payment', 'عدم السداد')}</MenuItem>
                <MenuItem value="BREACH_OF_TERMS">{label('Breach of terms', 'مخالفة الشروط')}</MenuItem>
                <MenuItem value="ADMIN_CORRECTION">{label('Admin correction', 'تصحيح إداري')}</MenuItem>
                <MenuItem value="OTHER">{label('Other', 'أخرى')}</MenuItem>
              </TextField>
              <TextField data-testid="admin-contract-note" size="small" label={label('Admin note', 'ملاحظة المسؤول')} value={note} onChange={(event) => setNote(event.target.value)} inputProps={{ maxLength: 1200 }} sx={{ minWidth: { xs: 220, md: 360 } }} />
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>{label('Contract', 'العقد')}</TableCell><TableCell>{label('Owner', 'المالك')}</TableCell><TableCell>{label('Property', 'العقار')}</TableCell><TableCell>{label('Value', 'القيمة')}</TableCell><TableCell>{label('Status', 'الحالة')}</TableCell><TableCell align="right">{label('Action', 'الإجراء')}</TableCell></TableRow></TableHead>
            <TableBody>
              {openContracts.map((row) => <TableRow data-testid={`admin-contract-row-${row.id}`} key={row.id} hover>
                <TableCell>{row.contractNumber || row.id}</TableCell><TableCell>{row.ownerName || row.ownerEmail || label('Not linked', 'غير مرتبط')}</TableCell><TableCell>{row.propertyName || row.propertyId || label('Not linked', 'غير مرتبط')}</TableCell><TableCell>{money(row.totalValue || row.contractValue || row.annualValue)}</TableCell><TableCell><Chip size="small" label={normalize(row.contractStatus || row.status || 'ACTIVE')} /></TableCell><TableCell align="right"><Button data-testid={`admin-contract-close-${row.id}`} size="small" color="warning" variant="outlined" disabled={busyId === row.id} onClick={() => closeContract(row.id)}>{busyId === row.id ? label('Closing...', 'جارٍ الإغلاق...') : label('Close', 'إغلاق')}</Button></TableCell>
              </TableRow>)}
              {!loading && openContracts.length === 0 && <TableRow><TableCell colSpan={6} align="center">{label('No open contracts found.', 'لا توجد عقود مفتوحة.')}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>

        <Paper data-testid="admin-contract-refund-review" sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>{label('Financial disposition queue', 'قائمة القرارات المالية')}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>{label('Paid contract closures remain here until Finance records FULL REFUND or NO REFUND. Refund amount is server-derived; the browser cannot enter or change it.', 'تبقى إغلاقات العقود المدفوعة هنا حتى تسجل المالية استرداداً كاملاً أو عدم استرداد. مبلغ الاسترداد يحدده الخادم ولا يمكن للمتصفح إدخاله أو تغييره.')}</Typography>
            </Box>
            <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2}>
              <TextField data-testid="admin-refund-decision" select size="small" label={label('Decision', 'القرار')} value={refundDecision} onChange={(event) => setRefundDecision(event.target.value as 'FULL_REFUND' | 'NO_REFUND')} sx={{ minWidth: 220 }}>
                <MenuItem value="FULL_REFUND">{label('Full refund', 'استرداد كامل')}</MenuItem>
                <MenuItem value="NO_REFUND">{label('No refund', 'بدون استرداد')}</MenuItem>
              </TextField>
              <TextField data-testid="admin-refund-reference" size="small" label={label('Cash/Cheque refund reference', 'مرجع استرداد النقد/الشيك')} value={refundReference} onChange={(event) => setRefundReference(event.target.value)} disabled={refundDecision !== 'FULL_REFUND'} inputProps={{ maxLength: 180 }} sx={{ minWidth: 280 }} />
              <TextField data-testid="admin-refund-note" size="small" label={label('Decision note', 'ملاحظة القرار')} value={refundNote} onChange={(event) => setRefundNote(event.target.value)} inputProps={{ maxLength: 1200 }} sx={{ minWidth: 320 }} />
            </Stack>
            {refundReviewContracts.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{label('No paid closures are awaiting financial disposition.', 'لا توجد إغلاقات مدفوعة بانتظار قرار مالي.')}</Typography>
            ) : (
              <Stack spacing={1.2}>
                {refundReviewContracts.map((row) => (
                  <Stack key={row.id} direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ p: 1.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <Box>
                      <Typography fontWeight={900}>{row.contractNumber || row.id}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{label('Linked payment', 'الدفعة المرتبطة')}: {row.linkedPaymentId}</Typography>
                    </Box>
                    <Button data-testid={`admin-refund-resolve-${row.id}`} variant="contained" color="warning" disabled={refundBusyId === row.id} onClick={() => resolveRefundDisposition(row)}>
                      {refundBusyId === row.id ? label('Recording...', 'جارٍ التسجيل...') : label('Record disposition', 'تسجيل القرار')}
                    </Button>
                  </Stack>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, mb: 2, display: 'block' }}>{label(`Renewal Watch Queue (${renewals.length})`, `قائمة مراقبة التجديد (${renewals.length})`)}</Typography>
          <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>{label('Entity ID', 'معرف السجل')}</TableCell><TableCell>{label('Property', 'العقار')}</TableCell><TableCell>{label('Days', 'الأيام')}</TableCell><TableCell>{label('Milestone', 'المرحلة')}</TableCell><TableCell>{label('Status', 'الحالة')}</TableCell></TableRow></TableHead><TableBody>{renewals.map((row) => <TableRow key={row.id} hover><TableCell>{row.sourceCollection}: {row.sourceId}</TableCell><TableCell>{row.propertyName}</TableCell><TableCell>{row.daysRemaining} {label('days', 'يوم')}</TableCell><TableCell>{row.milestoneDays} {label('days', 'يوم')}</TableCell><TableCell><Chip size="small" label={normalize(row.renewalStatus || 'ACTIVE')} /></TableCell></TableRow>)}{renewals.length === 0 && <TableRow><TableCell colSpan={5} align="center">{label('No active renewals watched.', 'لا توجد تجديدات نشطة قيد المراقبة.')}</TableCell></TableRow>}</TableBody></Table></Box>
        </Paper>
      </Stack>
    </Box>
  );
}

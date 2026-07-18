import React from 'react';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';

const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const terminalStates = ['CLOSED', 'CANCELLED', 'EXPIRED', 'TERMINATED'];
const isOpen = (row: any) => !terminalStates.some((state) => normalize(row.contractStatus || row.status).includes(state));
const money = (value: unknown) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
type Notice = { severity: 'success' | 'error' | 'info' | 'warning'; text: string };

export default function AdminContractControlPage() {
  const { isRTL } = useLanguage();
  const label = (en: string, ar: string) => (isRTL ? ar : en);
  const [contracts, setContracts] = React.useState<any[]>([]);
  const [renewals, setRenewals] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [reason, setReason] = React.useState('OWNER_REQUEST');
  const [note, setNote] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [rebuilding, setRebuilding] = React.useState(false);
  const [notice, setNotice] = React.useState<Notice | null>(null);

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
  }, [isRTL]);

  const openContracts = contracts.filter(isOpen);

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

        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950, mb: 2, display: 'block' }}>{label(`Renewal Watch Queue (${renewals.length})`, `قائمة مراقبة التجديد (${renewals.length})`)}</Typography>
          <Box sx={{ overflowX: 'auto' }}><Table size="small"><TableHead><TableRow><TableCell>{label('Entity ID', 'معرف السجل')}</TableCell><TableCell>{label('Property', 'العقار')}</TableCell><TableCell>{label('Days', 'الأيام')}</TableCell><TableCell>{label('Milestone', 'المرحلة')}</TableCell><TableCell>{label('Status', 'الحالة')}</TableCell></TableRow></TableHead><TableBody>{renewals.map((row) => <TableRow key={row.id} hover><TableCell>{row.sourceCollection}: {row.sourceId}</TableCell><TableCell>{row.propertyName}</TableCell><TableCell>{row.daysRemaining} {label('days', 'يوم')}</TableCell><TableCell>{row.milestoneDays} {label('days', 'يوم')}</TableCell><TableCell><Chip size="small" label={normalize(row.renewalStatus || 'ACTIVE')} /></TableCell></TableRow>)}{renewals.length === 0 && <TableRow><TableCell colSpan={5} align="center">{label('No active renewals watched.', 'لا توجد تجديدات نشطة قيد المراقبة.')}</TableCell></TableRow>}</TableBody></Table></Box>
        </Paper>
      </Stack>
    </Box>
  );
}

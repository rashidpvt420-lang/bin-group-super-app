import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, Paper, Stack, TextField, Typography } from '@mui/material';
import { CheckCircle2, ClipboardCheck, RefreshCw, XCircle } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';

type EventRecord = { id: string; eventType: string; reason?: string | null; createdAtMs: number };
type CorrectionRecord = {
    id: string; tenantName: string; tenantEmail: string; field: string; unitNumber?: string | null;
    currentValue: string; requestedValue: string; reason: string; status: string;
    reviewReason?: string | null; resolvedByEmail?: string | null; createdAtMs: number; events: EventRecord[];
};

const fieldLabels: Record<string, [string, string]> = {
    displayName: ['Full name', 'الاسم الكامل'],
    phoneNumber: ['Phone number', 'رقم الهاتف'],
    emergencyContactName: ['Emergency contact name', 'اسم جهة اتصال الطوارئ'],
    emergencyContactPhone: ['Emergency contact phone', 'هاتف جهة اتصال الطوارئ'],
    floorNumber: ['Residence floor', 'طابق السكن'],
    leaseStart: ['Lease start date', 'تاريخ بداية عقد الإيجار'],
    leaseEnd: ['Lease end date', 'تاريخ نهاية عقد الإيجار'],
};

export default function TenantCorrectionQueuePanel() {
    const { isRTL } = useLanguage();
    const copy = (en: string, ar: string) => isRTL ? ar : en;
    const [requests, setRequests] = useState<CorrectionRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState('');
    const [notice, setNotice] = useState('');
    const [reviewing, setReviewing] = useState<{ request: CorrectionRecord; decision: 'APPROVE' | 'REJECT' } | null>(null);
    const [reason, setReason] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const callable = httpsCallable(functions, 'listAdminTenantCorrectionRequests');
            const result = await callable({ status: 'ALL' });
            const data = result.data as { requests?: CorrectionRecord[] };
            setRequests(Array.isArray(data.requests) ? data.requests : []);
        } catch (error) {
            console.error('Tenant correction queue failed:', error);
            setNotice(copy('Failed to load Tenant correction requests.', 'تعذر تحميل طلبات تصحيح المستأجرين.'));
        } finally {
            setLoading(false);
        }
    }, [isRTL]);

    useEffect(() => { void refresh(); }, [refresh]);

    const resolveRequest = async () => {
        if (!reviewing) return;
        if (reviewing.decision === 'REJECT' && reason.trim().length < 8) {
            setNotice(copy('A rejection reason of at least 8 characters is required.', 'يلزم سبب رفض لا يقل عن 8 أحرف.'));
            return;
        }
        setBusyId(reviewing.request.id);
        setNotice('');
        try {
            const callable = httpsCallable(functions, 'adminResolveTenantCorrectionRequest');
            await callable({ requestId: reviewing.request.id, decision: reviewing.decision, reason: reason.trim() || null });
            setNotice(reviewing.decision === 'APPROVE'
                ? copy('Tenant correction approved and applied.', 'تمت الموافقة على تصحيح المستأجر وتطبيقه.')
                : copy('Tenant correction rejected with a recorded reason.', 'تم رفض تصحيح المستأجر مع تسجيل السبب.'));
            setReviewing(null);
            setReason('');
            await refresh();
        } catch (error: any) {
            console.error('Tenant correction resolution failed:', error);
            setNotice(error?.message || copy('Failed to resolve Tenant correction.', 'تعذر حسم تصحيح المستأجر.'));
        } finally {
            setBusyId('');
        }
    };

    const formatDate = (value: number) => value
        ? new Intl.DateTimeFormat(isRTL ? 'ar-AE' : 'en-AE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
        : '—';

    return <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ mt: 6 }}>
        <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center"><ClipboardCheck color={binThemeTokens.gold} /><Typography variant="h5" color="#FFF" fontWeight={950}>{copy('Tenant Correction Queue', 'قائمة تصحيحات المستأجرين')}</Typography><Chip size="small" label={requests.length} /></Stack>
            <Button startIcon={<RefreshCw size={17} />} onClick={() => void refresh()} disabled={loading}>{copy('Refresh', 'تحديث')}</Button>
        </Stack>
        {notice && <Alert severity="info" sx={{ mb: 3 }}>{notice}</Alert>}
        {loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box> : <Grid container spacing={3}>
            {requests.map((item) => {
                const pending = item.status === 'PENDING_ADMIN_REVIEW';
                const labels = fieldLabels[item.field] || [item.field, item.field];
                return <Grid item xs={12} md={6} key={item.id}><Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,.72)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 4 }}>
                    <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" gap={2}>
                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography color="#FFF" fontWeight={900}>{item.tenantName || item.tenantEmail || copy('Tenant', 'مستأجر')}</Typography><Typography variant="body2" color="text.secondary">{copy(labels[0], labels[1])}{item.unitNumber ? ` · ${copy('Unit', 'الوحدة')} ${item.unitNumber}` : ''}</Typography></Box>
                        <Chip size="small" label={item.status.replaceAll('_', ' ')} color={item.status === 'APPROVED' ? 'success' : item.status === 'REJECTED' ? 'error' : 'warning'} />
                    </Stack>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,.07)' }} />
                    <Grid container spacing={2}><Grid item xs={6}><Typography variant="caption" color="text.secondary">{copy('Current', 'الحالي')}</Typography><Typography color="#FFF">{item.currentValue || '—'}</Typography></Grid><Grid item xs={6}><Typography variant="caption" color="text.secondary">{copy('Requested', 'المطلوب')}</Typography><Typography color="#FFF" fontWeight={900}>{item.requestedValue}</Typography></Grid></Grid>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{item.reason}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{formatDate(item.createdAtMs)}</Typography>
                    {item.reviewReason && <Alert severity={item.status === 'REJECTED' ? 'error' : 'info'} sx={{ mt: 2 }}>{item.reviewReason}</Alert>}
                    {pending ? <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="flex-end" spacing={2} sx={{ mt: 2 }}><Button color="error" startIcon={<XCircle size={17} />} disabled={busyId === item.id} onClick={() => { setReviewing({ request: item, decision: 'REJECT' }); setReason(''); }}>{copy('Reject', 'رفض')}</Button><Button sx={{ color: '#10b981' }} startIcon={<CheckCircle2 size={17} />} disabled={busyId === item.id} onClick={() => { setReviewing({ request: item, decision: 'APPROVE' }); setReason(''); }}>{copy('Approve & apply', 'موافقة وتطبيق')}</Button></Stack> : null}
                </Paper></Grid>;
            })}
            {!requests.length && <Grid item xs={12}><Typography color="text.secondary" sx={{ textAlign: 'center', py: 5 }}>{copy('No Tenant correction requests.', 'لا توجد طلبات تصحيح للمستأجرين.')}</Typography></Grid>}
        </Grid>}
        <Dialog open={Boolean(reviewing)} onClose={() => setReviewing(null)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
            <DialogTitle>{reviewing?.decision === 'APPROVE' ? copy('Approve Tenant correction', 'الموافقة على تصحيح المستأجر') : copy('Reject Tenant correction', 'رفض تصحيح المستأجر')}</DialogTitle>
            <DialogContent><TextField autoFocus fullWidth multiline minRows={3} sx={{ mt: 1 }} label={copy(reviewing?.decision === 'APPROVE' ? 'Review note (optional)' : 'Rejection reason', reviewing?.decision === 'APPROVE' ? 'ملاحظة المراجعة (اختيارية)' : 'سبب الرفض')} value={reason} onChange={(event) => setReason(event.target.value)} /></DialogContent>
            <DialogActions><Button onClick={() => setReviewing(null)}>{copy('Cancel', 'إلغاء')}</Button><Button color={reviewing?.decision === 'REJECT' ? 'error' : 'success'} disabled={!reviewing || busyId === reviewing.request.id || (reviewing.decision === 'REJECT' && reason.trim().length < 8)} onClick={() => void resolveRequest()}>{copy('Confirm', 'تأكيد')}</Button></DialogActions>
        </Dialog>
    </Box>;
}

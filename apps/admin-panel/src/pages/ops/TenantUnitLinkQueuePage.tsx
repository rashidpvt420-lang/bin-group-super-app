import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
    DialogTitle, Divider, Grid, Paper, Stack, TextField, Typography, alpha,
} from '@mui/material';
import { CheckCircle2, Home, Link, XCircle } from 'lucide-react';
import { collection, db, functions, httpsCallable, onSnapshot, orderBy, query } from '../../lib/firebase';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/adminTheme';
import AdminPageFrame from '../../components/AdminPageFrame';

export default function TenantUnitLinkQueuePage() {
    const { isRTL } = useLanguage();
    const copy = (en: string, ar: string) => (isRTL ? ar : en);
    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<any[]>([]);
    const [notice, setNotice] = useState('');
    const [rejecting, setRejecting] = useState<any | null>(null);
    const [reason, setReason] = useState('');
    const [busyId, setBusyId] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'tenant_unit_link_requests'), orderBy('createdAt', 'desc'));
        return onSnapshot(q, (snap) => {
            setRequests(snap.docs.map((document) => ({ id: document.id, ...document.data() })));
            setLoading(false);
        }, (error) => {
            console.error('Failed to load unit requests:', error);
            setNotice(copy('Failed to load Tenant unit-link requests.', 'تعذر تحميل طلبات ربط وحدات المستأجرين.'));
            setLoading(false);
        });
    }, [isRTL]);

    const handleAction = async (requestRecord: any, decision: 'APPROVE' | 'REJECT', rejectionReason = '') => {
        if (decision === 'REJECT' && rejectionReason.trim().length < 8) {
            setNotice(copy('A rejection reason of at least 8 characters is required.', 'يلزم إدخال سبب رفض لا يقل عن 8 أحرف.'));
            return;
        }
        try {
            setBusyId(requestRecord.id);
            setNotice('');
            const resolveUnitLink = httpsCallable(functions, 'adminResolveTenantUnitLink');
            await resolveUnitLink({
                requestId: requestRecord.id,
                decision,
                unitId: requestRecord.candidateUnitId || null,
                reason: rejectionReason.trim() || null,
            });
            setNotice(decision === 'APPROVE'
                ? copy('Tenant unit link approved and attached to the existing unit.', 'تمت الموافقة على ربط المستأجر وإرفاقه بالوحدة الحالية.')
                : copy('Tenant unit-link request rejected with a recorded reason.', 'تم رفض طلب ربط الوحدة مع تسجيل السبب.'));
            setRejecting(null);
            setReason('');
        } catch (error) {
            console.error('Failed to update request:', error);
            setNotice(copy('Failed to update Tenant unit-link request.', 'تعذر تحديث طلب ربط وحدة المستأجر.'));
        } finally {
            setBusyId('');
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <AdminPageFrame title={copy('Tenant Unit-Link Requests', 'طلبات ربط وحدات المستأجرين')}>
            <Box dir={isRTL ? 'rtl' : 'ltr'}>
                <Typography variant="h5" color="#FFF" fontWeight="950" sx={{ mb: 3 }}>{copy('Unit Linking Queue', 'قائمة مراجعة ربط الوحدات')}</Typography>
                {notice && <Alert severity="info" sx={{ mb: 3 }}>{notice}</Alert>}
                <Grid container spacing={3}>
                    {requests.map((requestRecord) => {
                        const pending = ['PENDING_ADMIN_REVIEW', 'pending', ''].includes(String(requestRecord.status || ''));
                        return <Grid item xs={12} md={6} key={requestRecord.id}>
                            <Paper sx={{ p: 3, bgcolor: 'rgba(22,22,24,.7)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 4 }}>
                                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between" alignItems="flex-start" sx={{ mb: 2 }}>
                                    <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                                        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: alpha(binThemeTokens.gold, .1), color: binThemeTokens.gold }}><Home size={24} /></Box>
                                        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                            <Typography color="#FFF" fontWeight="bold">{requestRecord.tenantName || requestRecord.tenantEmail || copy('Unknown Tenant', 'مستأجر غير معروف')}</Typography>
                                            <Typography variant="body2" color="text.secondary">{copy('Requested unit', 'الوحدة المطلوبة')}: {requestRecord.unitNumber || '—'}</Typography>
                                        </Box>
                                    </Stack>
                                    <Chip label={requestRecord.status || 'PENDING'} size="small" sx={{ fontWeight: 900 }} />
                                </Stack>
                                <Divider sx={{ borderColor: 'rgba(255,255,255,.05)', mb: 2 }} />
                                {(requestRecord.reviewReason || requestRecord.rejectionReason) && <Alert severity={String(requestRecord.status).toLowerCase().includes('reject') ? 'error' : 'info'} sx={{ mb: 2 }}>{requestRecord.reviewReason || requestRecord.rejectionReason}</Alert>}
                                {(requestRecord.reviewedByEmail || requestRecord.reviewedBy) && <Typography variant="caption" color="text.secondary">{copy('Reviewed by', 'تمت المراجعة بواسطة')}: {requestRecord.reviewedByEmail || requestRecord.reviewedBy}</Typography>}
                                {pending ? <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} justifyContent="flex-end" sx={{ mt: 2 }}>
                                    <Button disabled={busyId === requestRecord.id} onClick={() => { setRejecting(requestRecord); setReason(''); }} color="error" startIcon={<XCircle size={18} />}>{copy('Reject', 'رفض')}</Button>
                                    <Button disabled={busyId === requestRecord.id} onClick={() => void handleAction(requestRecord, 'APPROVE')} sx={{ color: '#10b981' }} startIcon={<CheckCircle2 size={18} />}>{copy('Approve & link', 'موافقة وربط')}</Button>
                                </Stack> : <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2, textAlign: isRTL ? 'left' : 'right' }}>{copy('Processed', 'تمت المعالجة')}</Typography>}
                            </Paper>
                        </Grid>;
                    })}
                    {!requests.length && <Grid item xs={12}><Box sx={{ p: 5, textAlign: 'center' }}><Link size={48} color={binThemeTokens.gold} /><Typography color="text.secondary">{copy('No unit-link requests.', 'لا توجد طلبات ربط وحدات.')}</Typography></Box></Grid>}
                </Grid>
                <Dialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} fullWidth maxWidth="sm" dir={isRTL ? 'rtl' : 'ltr'}>
                    <DialogTitle>{copy('Reject Tenant unit-link request', 'رفض طلب ربط وحدة المستأجر')}</DialogTitle>
                    <DialogContent><TextField autoFocus fullWidth multiline minRows={3} value={reason} onChange={(event) => setReason(event.target.value)} label={copy('Rejection reason', 'سبب الرفض')} helperText={copy('Required and retained in review history.', 'مطلوب ويتم الاحتفاظ به في سجل المراجعة.')} sx={{ mt: 1 }} /></DialogContent>
                    <DialogActions><Button onClick={() => setRejecting(null)}>{copy('Cancel', 'إلغاء')}</Button><Button color="error" disabled={reason.trim().length < 8 || busyId === rejecting?.id} onClick={() => void handleAction(rejecting, 'REJECT', reason)}>{copy('Confirm rejection', 'تأكيد الرفض')}</Button></DialogActions>
                </Dialog>
            </Box>
        </AdminPageFrame>
    );
}

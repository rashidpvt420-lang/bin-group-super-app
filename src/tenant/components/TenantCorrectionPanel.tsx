import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Grid, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { ClipboardEdit, History, Send } from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Residence = Record<string, any> & { id: string };
type EventRecord = { id: string; eventType: string; reason?: string | null; createdAtMs: number };
type RequestRecord = {
    id: string; field: string; unitNumber?: string | null; currentValue: string; requestedValue: string;
    reason: string; status: string; reviewReason?: string | null; createdAtMs: number; events: EventRecord[];
};

type Option = { value: string; en: string; ar: string; residence?: boolean; type?: string };
const options: Option[] = [
    { value: 'displayName', en: 'Full name', ar: 'الاسم الكامل' },
    { value: 'phoneNumber', en: 'Phone number', ar: 'رقم الهاتف', type: 'tel' },
    { value: 'emergencyContactName', en: 'Emergency contact name', ar: 'اسم جهة اتصال الطوارئ' },
    { value: 'emergencyContactPhone', en: 'Emergency contact phone', ar: 'هاتف جهة اتصال الطوارئ', type: 'tel' },
    { value: 'floorNumber', en: 'Residence floor', ar: 'طابق السكن', residence: true },
    { value: 'leaseStart', en: 'Lease start date', ar: 'تاريخ بداية عقد الإيجار', residence: true, type: 'date' },
    { value: 'leaseEnd', en: 'Lease end date', ar: 'تاريخ نهاية عقد الإيجار', residence: true, type: 'date' },
];

const chipColor = (status: string): 'success' | 'error' | 'warning' | 'default' =>
    status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'error' : status === 'PENDING_ADMIN_REVIEW' ? 'warning' : 'default';

export default function TenantCorrectionPanel({ residences }: { residences: Residence[] }) {
    const { lang, isRTL } = useLanguage();
    const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
    const [field, setField] = useState('displayName');
    const [residenceId, setResidenceId] = useState('');
    const [requestedValue, setRequestedValue] = useState('');
    const [reason, setReason] = useState('');
    const [requests, setRequests] = useState<RequestRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const selected = useMemo(() => options.find((item) => item.value === field) || options[0], [field]);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const callable = httpsCallable(functions, 'listTenantCorrectionRequests');
            const result = await callable({});
            const data = result.data as { requests?: RequestRecord[] };
            setRequests(Array.isArray(data.requests) ? data.requests : []);
        } catch (error) {
            console.error('Tenant correction history failed:', error);
            setNotice({ type: 'error', text: copy('Correction history could not be loaded.', 'تعذر تحميل سجل التصحيحات.') });
        } finally {
            setLoading(false);
        }
    }, [lang]);

    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => {
        if (!selected.residence) setResidenceId('');
        else if (!residenceId && residences[0]?.id) setResidenceId(residences[0].id);
        setRequestedValue('');
    }, [field, residences, selected.residence]);

    const submit = async () => {
        if (selected.residence && !residenceId) return setNotice({ type: 'error', text: copy('Select a residence.', 'اختر السكن.') });
        if (!requestedValue.trim()) return setNotice({ type: 'error', text: copy('Enter the corrected value.', 'أدخل القيمة المصححة.') });
        if (reason.trim().length < 8) return setNotice({ type: 'error', text: copy('Provide at least 8 characters of explanation.', 'أدخل شرحًا لا يقل عن 8 أحرف.') });
        setSubmitting(true);
        setNotice(null);
        try {
            const callable = httpsCallable(functions, 'submitTenantCorrectionRequest');
            await callable({ field, residenceId: selected.residence ? residenceId : null, requestedValue: requestedValue.trim(), reason: reason.trim() });
            setRequestedValue('');
            setReason('');
            setNotice({ type: 'success', text: copy('Correction submitted for Admin review.', 'تم إرسال التصحيح لمراجعة الإدارة.') });
            await refresh();
        } catch (error: any) {
            setNotice({ type: 'error', text: error?.message || copy('Correction could not be submitted.', 'تعذر إرسال التصحيح.') });
        } finally {
            setSubmitting(false);
        }
    };

    const formatDate = (value: number) => value ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

    return <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ mt: 4 }}>
        <Paper sx={{ p: { xs: 2.5, md: 4 }, mb: 4, borderRadius: 5, bgcolor: 'rgba(22,22,24,.74)', border: '1px solid rgba(255,255,255,.07)' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <ClipboardEdit color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950} color="#FFF">{copy('Request a record correction', 'طلب تصحيح سجل')}</Typography>
            </Stack>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 3 }}>{copy('Verified changes require Admin review and remain in the history below.', 'تتطلب التغييرات الموثقة مراجعة الإدارة وتبقى محفوظة في السجل أدناه.')}</Typography>
            {notice && <Alert severity={notice.type} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField select fullWidth label={copy('Record field', 'حقل السجل')} value={field} onChange={(event) => setField(event.target.value)}>{options.map((item) => <MenuItem key={item.value} value={item.value}>{copy(item.en, item.ar)}</MenuItem>)}</TextField></Grid>
                {selected.residence && <Grid item xs={12} md={6}><TextField select fullWidth label={copy('Residence', 'السكن')} value={residenceId} onChange={(event) => setResidenceId(event.target.value)}>{residences.map((item) => <MenuItem key={item.id} value={item.id}>{copy('Unit', 'الوحدة')} {item.unitNumber || item.unit || item.id}</MenuItem>)}</TextField></Grid>}
                <Grid item xs={12} md={selected.residence ? 6 : 12}><TextField fullWidth type={selected.type || 'text'} label={copy('Correct value', 'القيمة الصحيحة')} value={requestedValue} onChange={(event) => setRequestedValue(event.target.value)} InputLabelProps={selected.type === 'date' ? { shrink: true } : undefined} /></Grid>
                <Grid item xs={12}><TextField fullWidth multiline minRows={3} label={copy('Why is this correction needed?', 'لماذا يلزم هذا التصحيح؟')} value={reason} onChange={(event) => setReason(event.target.value)} inputProps={{ maxLength: 1000 }} /></Grid>
            </Grid>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="flex-end" sx={{ mt: 3 }}><Button variant="contained" disabled={submitting} startIcon={submitting ? <CircularProgress size={17} color="inherit" /> : <Send size={17} />} onClick={() => void submit()} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{copy('Submit correction', 'إرسال التصحيح')}</Button></Stack>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 5, bgcolor: 'rgba(22,22,24,.74)', border: '1px solid rgba(255,255,255,.07)' }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center" sx={{ mb: 3 }}><History color={binThemeTokens.gold} /><Typography variant="h6" fontWeight={950} color="#FFF">{copy('Correction history', 'سجل التصحيحات')}</Typography><Chip size="small" label={requests.length} /></Stack>
            {loading ? <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box> : requests.length ? <Stack spacing={2}>{requests.map((item) => <Paper key={item.id} sx={{ p: 2.5, bgcolor: 'rgba(0,0,0,.25)', borderRadius: 3 }}>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} justifyContent="space-between"><Typography color="#FFF" fontWeight={900}>{copy(options.find((option) => option.value === item.field)?.en || item.field, options.find((option) => option.value === item.field)?.ar || item.field)}</Typography><Chip size="small" color={chipColor(item.status)} label={item.status.replaceAll('_', ' ')} /></Stack>
                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,.07)' }} />
                <Grid container spacing={2}><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">{copy('Current value', 'القيمة الحالية')}</Typography><Typography color="#FFF">{item.currentValue || '—'}</Typography></Grid><Grid item xs={12} md={6}><Typography variant="caption" color="text.secondary">{copy('Requested value', 'القيمة المطلوبة')}</Typography><Typography color="#FFF" fontWeight={800}>{item.requestedValue}</Typography></Grid></Grid>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>{item.reason}</Typography>
                {item.reviewReason && <Alert severity={item.status === 'REJECTED' ? 'error' : 'info'} sx={{ mt: 2 }}>{item.reviewReason}</Alert>}
                <Stack sx={{ mt: 2 }}>{item.events.map((event) => <Typography key={event.id} variant="caption" color="text.secondary">{formatDate(event.createdAtMs)} · {event.eventType.replaceAll('_', ' ')}{event.reason ? ` · ${event.reason}` : ''}</Typography>)}</Stack>
            </Paper>)}</Stack> : <Typography color="text.secondary">{copy('No correction requests submitted.', 'لم يتم إرسال طلبات تصحيح.')}</Typography>}
        </Paper>
    </Box>;
}

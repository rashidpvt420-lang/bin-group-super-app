import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';

type JobView = { ticketId: string; status: string; title: string | null; scheduledAt: string | null; canConfirm: boolean; reportsLeft: number; expiresAt: string };

/** Secure per-job link: works only for the signed-in tenant of the job; report is audited, confirm uses the normal review flow. */
export default function TenantJobLinkPage() {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('t') || '';
  const [job, setJob] = useState<JobView | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'resolveTenantJobLink')({ token })
      .then((res: any) => { if (alive) setJob(res.data as JobView); })
      .catch((e: any) => { if (alive) setError(e?.message || t('This link could not be opened.', 'تعذر فتح هذا الرابط.')); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const report = async () => {
    if (note.trim().length < 8) { setError(t('Describe the problem (at least 8 characters).', 'صف المشكلة (8 أحرف على الأقل).')); return; }
    setBusy(true); setError('');
    try {
      const res: any = await httpsCallable(functions, 'reportViaTenantJobLink')({ token, note: note.trim() });
      setJob((j) => (j ? { ...j, reportsLeft: Number(res?.data?.reportsLeft) || 0 } : j));
      setNote('');
      setDone(t('Report sent. The team will follow up.', 'تم إرسال البلاغ. سيتابع الفريق.'));
    } catch (e: any) {
      setError(e?.message || t('Could not send the report.', 'تعذر إرسال البلاغ.'));
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 640, mx: 'auto' }} dir={ar ? 'rtl' : 'ltr'}>
      <Typography variant="h5" fontWeight={900} gutterBottom>{t('Your job', 'طلبك')}</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {done && <Alert severity="success" sx={{ mb: 2 }}>{done}</Alert>}
      {!job && !error && <CircularProgress size={28} />}
      {job && (
        <Paper sx={{ p: 3 }}>
          <Typography fontWeight={800}>{job.title || job.ticketId}</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>{t('Status', 'الحالة')}: {job.status}</Typography>
          {job.scheduledAt && <Typography variant="body2">{t('Scheduled', 'الموعد')}: {new Date(job.scheduledAt).toLocaleString(ar ? 'ar-AE' : 'en-AE')}</Typography>}
          <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.7 }}>
            {t('This secure link expires on', 'ينتهي هذا الرابط الآمن في')} {new Date(job.expiresAt).toLocaleDateString(ar ? 'ar-AE' : 'en-AE')}
          </Typography>
          {job.canConfirm && (
            <Button variant="contained" sx={{ mt: 2, fontWeight: 800 }} onClick={() => navigate(`/tenant/ticket/${job.ticketId}`)}>
              {t('Confirm or dispute the work', 'تأكيد العمل أو الاعتراض عليه')}
            </Button>
          )}
          {job.reportsLeft > 0 ? (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" fontWeight={800}>{t('Report a problem with this job', 'الإبلاغ عن مشكلة في هذا الطلب')}</Typography>
              <TextField fullWidth multiline minRows={3} value={note} onChange={(e) => setNote(e.target.value)} sx={{ mt: 1 }}
                placeholder={t('What is wrong?', 'ما المشكلة؟')} inputProps={{ maxLength: 1000 }} />
              <Button variant="outlined" disabled={busy} onClick={() => void report()} sx={{ mt: 1, fontWeight: 800 }}>
                {t(`Send report (${job.reportsLeft} left)`, `إرسال البلاغ (متبقٍ ${job.reportsLeft})`)}
              </Button>
            </Box>
          ) : (
            <Alert severity="info" sx={{ mt: 2 }}>{t('Report limit reached for this link. Please use the app chat.', 'تم بلوغ حد البلاغات لهذا الرابط. يرجى استخدام المحادثة في التطبيق.')}</Alert>
          )}
        </Paper>
      )}
    </Box>
  );
}

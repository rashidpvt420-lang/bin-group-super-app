import { useState } from 'react';
import { Alert, Box, Button, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';

export const MAX_TENANT_REOPENS = 2;
const REOPENABLE = new Set(['COMPLETED', 'COMPLETED_PENDING_APPROVAL', 'DISPUTED']);

/** Limited reopen (reopenMaintenanceTicket): reason required, capped per ticket, audited on the server. */
export default function TicketReopenPanel({ ticketId, status, reopenCount, onReopened }: { ticketId: string; status: string; reopenCount: number; onReopened: (count: number) => void }) {
  const { lang } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const normalized = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!REOPENABLE.has(normalized)) return null;
  const used = Math.max(0, Number(reopenCount) || 0);
  if (used >= MAX_TENANT_REOPENS) {
    return <Alert severity="info" sx={{ mb: 3 }} dir={ar ? 'rtl' : 'ltr'}>{t(`This job has been reopened ${used} times, the limit. Please raise a new request.`, `أعيد فتح هذا الطلب ${used} مرات وهو الحد الأقصى. يرجى تقديم طلب جديد.`)}</Alert>;
  }
  const submit = async () => {
    if (reason.trim().length < 8) { setError(t('Explain what is still wrong (at least 8 characters).', 'اشرح ما زال غير صحيح (8 أحرف على الأقل).')); return; }
    setBusy(true); setError('');
    try {
      const res: any = await httpsCallable(functions, 'reopenMaintenanceTicket')({ ticketId, reason: reason.trim() });
      onReopened(Number(res?.data?.reopenCount) || used + 1);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message || t('Could not reopen the job. Please try again.', 'تعذر إعادة فتح الطلب. حاول مرة أخرى.'));
    } finally { setBusy(false); }
  };
  return (
    <Box sx={{ mb: 3 }} dir={ar ? 'rtl' : 'ltr'}>
      {!open ? (
        <Button variant="outlined" onClick={() => setOpen(true)} sx={{ fontWeight: 800 }}>
          {t(`Reopen job (${MAX_TENANT_REOPENS - used} left)`, `إعادة فتح الطلب (متبقٍ ${MAX_TENANT_REOPENS - used})`)}
        </Button>
      ) : (
        <>
          <Typography variant="body2" sx={{ mb: 1, color: 'rgba(255,255,255,0.7)' }}>{t('Tell us what is still wrong. Every reopen is recorded.', 'أخبرنا بما زال غير صحيح. تُسجَّل كل إعادة فتح.')}</Typography>
          <TextField fullWidth multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 1000 }} sx={{ mb: 1 }} />
          {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
          <Button variant="contained" disabled={busy} onClick={submit}>{busy ? '…' : t('Reopen', 'إعادة فتح')}</Button>
        </>
      )}
    </Box>
  );
}

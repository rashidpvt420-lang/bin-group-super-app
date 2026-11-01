import { useEffect, useState } from 'react';
import { Alert, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { auth, db, doc, functions, getDoc, httpsCallable } from '../lib/firebase';
import { UiCard } from './ui';

/** Opt in or out of WhatsApp job status updates (submitted, assigned, arrival, completed, approval needed). Off by default. */
export default function WhatsAppJobUpdatesCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'whatsapp_optins', uid)).then((s) => setOn(s.data()?.optIn === true)).catch(() => undefined);
  }, []);
  const toggle = async (next: boolean) => {
    setBusy(true); setErr('');
    try { await httpsCallable(functions, 'setWhatsAppJobUpdatesOptIn')({ optIn: next, language: lang }); setOn(next); } catch (e: any) { setErr(e?.message || t('Could not update.', 'تعذر التحديث.')); }
    setBusy(false);
  };
  return (
    <UiCard isRTL={isRTL} testId="whatsapp-job-updates" label={t('WhatsApp job updates', 'تحديثات الأعمال عبر واتساب')}>
      <Stack spacing={1}>
        <FormControlLabel control={<Switch checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />} label={on ? t('On', 'مفعّل') : t('Off', 'متوقف')} />
        <Typography variant="caption" color="text.secondary">{t('Status messages only: submitted, technician assigned, arrival, completed and approval needed. Sent to the mobile number in your profile. You can turn this off at any time.', 'رسائل الحالة فقط: تم الإرسال، تعيين الفني، الوصول، الإنجاز، والحاجة إلى موافقة. ترسل إلى رقم الجوال في ملفك. يمكنك الإيقاف في أي وقت.')}</Typography>
        {err && <Alert severity="error">{err}</Alert>}
      </Stack>
    </UiCard>
  );
}

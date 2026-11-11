import { useEffect, useState } from 'react';
import { Alert, Chip, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { auth, db, doc, functions, getDoc, httpsCallable } from '../lib/firebase';
import { UiCard } from './ui';

/** Pre-opt-in for WhatsApp job status updates. Off by default. Says "coming soon" until approved templates exist. */
export default function WhatsAppJobUpdatesCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [on, setOn] = useState(false);
  const [comingSoon, setComingSoon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await httpsCallable(functions, 'getWhatsAppJobUpdatesStatus')({});
        const data = (status.data || {}) as { optIn?: boolean; comingSoon?: boolean };
        if (!cancelled) {
          setOn(data.optIn === true);
          setComingSoon(data.comingSoon !== false);
        }
      } catch {
        try {
          const snap = await getDoc(doc(db, 'whatsapp_optins', uid));
          if (!cancelled) setOn(snap.data()?.optIn === true);
        } catch {
          /* keep defaults */
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const toggle = async (next: boolean) => {
    setBusy(true); setErr('');
    try {
      const result = await httpsCallable(functions, 'setWhatsAppJobUpdatesOptIn')({ optIn: next, language: lang });
      const data = (result.data || {}) as { optIn?: boolean; comingSoon?: boolean };
      setOn(data.optIn === true);
      if (typeof data.comingSoon === 'boolean') setComingSoon(data.comingSoon);
    } catch (e: any) {
      setErr(e?.message || t('Could not update.', 'تعذر التحديث.'));
    }
    setBusy(false);
  };
  return (
    <UiCard isRTL={isRTL} testId="whatsapp-job-updates" label={t('WhatsApp job updates', 'تحديثات الأعمال عبر واتساب')}>
      <Stack spacing={1}>
        {comingSoon && (
          <Chip size="small" color="default" data-testid="whatsapp-coming-soon" label={t('Coming soon', 'قريبًا')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start' }} />
        )}
        <FormControlLabel control={<Switch checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} inputProps={{ 'aria-label': t('WhatsApp job updates opt-in', 'تفعيل تحديثات واتساب') }} />} label={on ? t('On', 'مفعّل') : t('Off', 'متوقف')} />
        <Typography variant="caption" color="text.secondary" data-testid="whatsapp-job-updates-copy">
          {comingSoon
            ? t('WhatsApp updates are coming soon. You can pre-register this preference with the mobile number in your profile. The app stays the official record, and you can switch this off at any time. No WhatsApp messages are being sent yet.', 'تحديثات واتساب قريبًا. يمكنك تسجيل رغبتك مسبقًا برقم الجوال في ملفك. التطبيق يبقى السجل الرسمي، ويمكنك إيقاف هذا في أي وقت. لا تُرسل رسائل واتساب حتى الآن.')
            : t('When this is on, status alerts can also be sent to the mobile number in your profile (submitted, technician assigned, arrival, completed, and approval needed). The app stays the official record. You can switch this off at any time.', 'عند التفعيل، يمكن إرسال تنبيهات الحالة أيضًا إلى رقم الجوال في ملفك (تم الإرسال، تعيين الفني، الوصول، الإنجاز، والحاجة إلى موافقة). التطبيق يبقى السجل الرسمي. يمكنك الإيقاف في أي وقت.')}
        </Typography>
        {err && <Alert severity="error">{err}</Alert>}
      </Stack>
    </UiCard>
  );
}

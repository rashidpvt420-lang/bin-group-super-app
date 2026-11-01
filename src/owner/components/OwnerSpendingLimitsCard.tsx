import { useEffect, useState } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { auth, db, doc, functions, getDoc, httpsCallable } from '../../lib/firebase';
import { UiButton, UiCard } from '../../components/ui';

/** Owner-set spending limit and tolerance. No defaults: nothing is pre-filled until the owner saves a value. */
export default function OwnerSpendingLimitsCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [limit, setLimit] = useState('');
  const [tol, setTol] = useState('');
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'owner_spending_limits', uid)).then((s) => {
      const d = s.data();
      if (d) { setLimit(String(d.perJobLimitAed)); setTol(String(d.tolerancePct)); setSaved(true); }
    }).catch(() => undefined);
  }, []);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await httpsCallable(functions, 'ownerSetSpendingLimits')({ perJobLimitAed: Number(limit), tolerancePct: Number(tol) });
      setSaved(true); setMsg({ ok: true, text: t('Saved.', 'تم الحفظ.') });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || t('Could not save.', 'تعذر الحفظ.') }); }
    setBusy(false);
  };
  return (
    <UiCard isRTL={isRTL} testId="owner-spending-limits" label={t('Spending limits', 'حدود الإنفاق')}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          {saved
            ? t('Approving above your limit needs a second confirmation. If a quote rises above your tolerance after approval, it comes back to you. Emergency approvals need a written reason and are reviewed later.', 'الموافقة فوق حدك تتطلب تأكيداً ثانياً. إذا ارتفع عرض السعر فوق الهامش بعد الموافقة يعود إليك. الموافقات الطارئة تتطلب سبباً مكتوباً وتتم مراجعتها لاحقاً.')
            : t('No limit set. Every job still needs your approval. Set your own limit below.', 'لم يتم تحديد حد. كل عمل لا يزال يحتاج موافقتك. حدد حدك أدناه.')}
        </Typography>
        <TextField size="small" type="number" label={t('Per-job limit (AED)', 'الحد لكل عمل (درهم)')} value={limit} onChange={(e) => setLimit(e.target.value)} inputProps={{ min: 1, 'data-testid': 'spend-limit-aed' }} />
        <TextField size="small" type="number" label={t('Price-rise tolerance (%)', 'هامش ارتفاع السعر (%)')} value={tol} onChange={(e) => setTol(e.target.value)} inputProps={{ min: 0, max: 50, 'data-testid': 'spend-tolerance-pct' }} />
        <UiButton tone="primary" disabled={busy || !limit || tol === ''} onClick={save}>{t('Save limits', 'حفظ الحدود')}</UiButton>
        {msg && <Alert severity={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      </Stack>
    </UiCard>
  );
}

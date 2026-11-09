import { useEffect, useState } from 'react';
import { Alert, Stack, TextField, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { auth, db, doc, functions, getDoc, httpsCallable } from '../../lib/firebase';
import { UiButton, UiCard } from '../../components/ui';

/** Fixed per-job approval limit set by the owner agreement (not owner-editable). */
const FIXED_OWNER_APPROVAL_LIMIT_AED = 1000;
const EMERGENCY_SPEND_LIMIT_AED = 2500;

/** Fixed AED 1,000 per-job limit (agreement term) plus the owner's own price-rise tolerance. */
export default function OwnerSpendingLimitsCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [tol, setTol] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    getDoc(doc(db, 'owner_spending_limits', uid)).then((s) => {
      const d = s.data();
      if (d && Number.isFinite(d.tolerancePct)) setTol(String(d.tolerancePct));
    }).catch(() => undefined);
  }, []);
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      await httpsCallable(functions, 'ownerSetSpendingLimits')({ tolerancePct: Number(tol) });
      setMsg({ ok: true, text: t('Saved.', 'تم الحفظ.') });
    } catch (e: any) { setMsg({ ok: false, text: e?.message || t('Could not save.', 'تعذر الحفظ.') }); }
    setBusy(false);
  };
  return (
    <UiCard isRTL={isRTL} testId="owner-spending-limits" label={t('Spending limits', 'حدود الإنفاق')}>
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary" data-testid="spend-limit-fixed">
          {t(
            `Per-job approval limit: AED ${FIXED_OWNER_APPROVAL_LIMIT_AED.toLocaleString('en-US')} (fixed by your agreement). Any job above it needs your written approval. In a genuine emergency BIN-GROUPS may spend up to AED ${EMERGENCY_SPEND_LIMIT_AED.toLocaleString('en-US')} without prior approval and tells you within 24 hours.`,
            `حد الموافقة لكل عمل: ${FIXED_OWNER_APPROVAL_LIMIT_AED.toLocaleString('en-US')} درهم (ثابت وفق اتفاقيتك). أي عمل يتجاوزه يتطلب موافقتك الكتابية. وفي حالات الطوارئ الحقيقية يجوز لشركة BIN-GROUPS إنفاق ما يصل إلى ${EMERGENCY_SPEND_LIMIT_AED.toLocaleString('en-US')} درهم دون موافقة مسبقة مع إبلاغك خلال 24 ساعة.`,
          )}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {t('If a quote rises above your tolerance after approval, it comes back to you.', 'إذا ارتفع عرض السعر فوق الهامش بعد الموافقة يعود إليك.')}
        </Typography>
        <TextField size="small" type="number" label={t('Price-rise tolerance (%)', 'هامش ارتفاع السعر (%)')} value={tol} onChange={(e) => setTol(e.target.value)} inputProps={{ min: 0, max: 50, 'data-testid': 'spend-tolerance-pct' }} />
        <UiButton tone="primary" disabled={busy || tol === ''} onClick={save}>{t('Save tolerance', 'حفظ الهامش')}</UiButton>
        {msg && <Alert severity={msg.ok ? 'success' : 'error'}>{msg.text}</Alert>}
      </Stack>
    </UiCard>
  );
}

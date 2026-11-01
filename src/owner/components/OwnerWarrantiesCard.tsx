import { useEffect, useState } from 'react';
import { Alert, Stack } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiCard } from '../../components/ui';

type W = { ticketId: string; status: 'ACTIVE' | 'EXPIRED' | 'NO_WARRANTY_RECORDED'; durationDays: number | null; coverage: string | null; expiresAtMs: number | null };

/** Warranty protection: per-job warranty and repeat-fault reviews (no charge before review). */
export default function OwnerWarrantiesCard() {
  const { lang, isRTL } = useLanguage();
  const t = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const [data, setData] = useState<{ warranties: W[]; reviews: { ticketId: string; priorTicketId: string; status: string }[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerWarranties')({}).then((r: any) => { if (alive) setData(r?.data ?? null); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const pending = data?.reviews.filter((r) => r.status === 'PENDING_REVIEW') ?? [];
  return (
    <UiCard isRTL={isRTL} testId="owner-warranties" label={t('Warranties', 'الضمانات')}>
      <Stack spacing={1}>
        {failed && <ErrorState isRTL={isRTL} title={t('Warranties could not load.', 'تعذر تحميل الضمانات.')} />}
        {pending.length > 0 && <Alert severity="warning">{t(`${pending.length} repeat fault(s) under warranty are being reviewed. You will not be charged before review.`, `${pending.length} عطل متكرر ضمن الضمان قيد المراجعة. لن يتم التحصيل منك قبل المراجعة.`)}</Alert>}
        {data && data.warranties.length === 0 && <EmptyState isRTL={isRTL} title={t('No completed jobs yet', 'لا توجد أعمال مكتملة بعد')} />}
        {data?.warranties.map((w) => (
          <ListRow key={w.ticketId} isRTL={isRTL} title={`${t('Job', 'عمل')} ${w.ticketId.slice(0, 8)}`}
            subtitle={w.status === 'NO_WARRANTY_RECORDED' ? t('No warranty recorded for this job', 'لم يسجل ضمان لهذا العمل') : `${w.durationDays} ${t('days', 'يوم')}${w.coverage ? ` · ${w.coverage}` : ''}${w.expiresAtMs ? ` · ${t('until', 'حتى')} ${new Date(w.expiresAtMs).toLocaleDateString(lang === 'ar' ? 'ar-AE' : 'en-AE')}` : ''}`}
            trailing={<StatusChip tone={w.status === 'ACTIVE' ? 'ok' : w.status === 'EXPIRED' ? 'neutral' : 'warn'} label={w.status === 'ACTIVE' ? t('Active', 'ساري') : w.status === 'EXPIRED' ? t('Expired', 'منتهي') : t('Not recorded', 'غير مسجل')} />} />
        ))}
      </Stack>
    </UiCard>
  );
}

import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiCard } from '../../components/ui';

type Item = { id: string; type: string; dueDate: string; daysLeft: number; titleEn: string; titleAr: string };

/** Compliance calendar: dated items from the owner's own lease records; suggested dates, not legal advice. */
export default function OwnerComplianceCalendarCard() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerComplianceCalendar')({})
      .then((res: any) => { if (alive) setItems(Array.isArray(res?.data?.items) ? res.data.items : []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const tone = (d: number) => (d <= 7 ? 'bad' as const : d <= 30 ? 'warn' as const : 'neutral' as const);
  return (
    <UiCard isRTL={isRTL} testId="owner-compliance-calendar" label={t('Compliance calendar', 'تقويم الالتزامات')}>
      {failed && <ErrorState isRTL={isRTL} title={t('The calendar could not load. Refresh to retry.', 'تعذر تحميل التقويم. حدّث الصفحة للمحاولة.')} />}
      {!failed && !items && <Typography variant="body2">…</Typography>}
      {items && items.length === 0 && <EmptyState isRTL={isRTL} title={t('No dated items from your lease records yet', 'لا توجد مواعيد من سجلات عقودك بعد')} />}
      {items && items.slice(0, 8).map((i) => (
        <ListRow key={i.id} isRTL={isRTL} title={ar ? i.titleAr : i.titleEn} subtitle={i.dueDate}
          trailing={<StatusChip tone={tone(i.daysLeft)} label={i.daysLeft === 0 ? t('Today', 'اليوم') : t(`${i.daysLeft} days`, `${i.daysLeft} يوماً`)} />} />
      ))}
      {items && items.length > 0 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.75 }}>
          {t('Suggested dates from your lease records. Confirm the rules for your emirate and contract; this is not legal advice.', 'تواريخ مقترحة من سجلات عقودك. تأكد من القواعد الخاصة بإمارتك وعقدك؛ هذه ليست استشارة قانونية.')}
        </Typography>
      )}
    </UiCard>
  );
}

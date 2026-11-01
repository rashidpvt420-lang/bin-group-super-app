import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiCard } from '../../components/ui';

type Cred = { state: 'VALID' | 'EXPIRING' | 'EXPIRED' | 'UNKNOWN'; expiry: string | null };
type Vendor = {
  vendorId: string; name: string; trade: string; state: 'OK' | 'INSUFFICIENT_DATA'; jobs: number; minJobs: number;
  reworkRatePct: number | null; avgQuoteAed: number | null; medianResponseHours: number | null; badges: string[];
  licence: Cred; insurance: Cred; commission: { recorded: boolean; pct: number | null; note: string | null };
};

/** BIN's own vendors that quoted on this owner's jobs. Not a marketplace. */
export default function OwnerVendorScorecardsCard() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerVendorScorecards')({})
      .then((res: any) => { if (alive) setVendors(Array.isArray(res?.data?.vendors) ? res.data.vendors : []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const credLabel = (c: Cred, en: string, arName: string) => {
    const s = { VALID: t('valid', 'سارية'), EXPIRING: t('expiring soon', 'تنتهي قريباً'), EXPIRED: t('expired', 'منتهية'), UNKNOWN: t('not recorded', 'غير مسجلة') }[c.state];
    return `${t(en, arName)}: ${s}${c.expiry ? ` (${c.expiry})` : ''}`;
  };
  const badge = (b: string) => (b === 'LOW_REWORK' ? t('Low rework', 'إعادة عمل منخفضة') : b === 'FAST_RESPONSE' ? t('Fast response', 'استجابة سريعة') : b);
  return (
    <UiCard isRTL={isRTL} testId="owner-vendor-scorecards" label={t('Contractor verification', 'التحقق من المقاولين')}>
      {failed && <ErrorState isRTL={isRTL} title={t('Contractor details could not load. Refresh to retry.', 'تعذر تحميل بيانات المقاولين. حدّث الصفحة للمحاولة.')} />}
      {!failed && !vendors && <Typography variant="body2">…</Typography>}
      {vendors && vendors.length === 0 && <EmptyState isRTL={isRTL} title={t('No BIN contractors have quoted on your jobs yet', 'لم يقدّم أي مقاول من BIN عرض سعر على أعمالك بعد')} />}
      {vendors && vendors.map((v) => {
        const bad = v.licence.state === 'EXPIRED' || v.insurance.state === 'EXPIRED';
        const numbers = v.state === 'OK'
          ? [
              v.reworkRatePct !== null ? t(`Rework ${v.reworkRatePct}%`, `إعادة العمل ${v.reworkRatePct}%`) : null,
              v.avgQuoteAed !== null ? t(`Avg quote AED ${v.avgQuoteAed}`, `متوسط العرض ${v.avgQuoteAed} درهم`) : null,
              v.medianResponseHours !== null ? t(`Response ${v.medianResponseHours}h`, `الاستجابة ${v.medianResponseHours} ساعة`) : null,
            ].filter(Boolean).join(' · ')
          : t(`Not enough data yet (${v.jobs} of ${v.minJobs} jobs)`, `لا توجد بيانات كافية بعد (${v.jobs} من ${v.minJobs})`);
        const commission = v.commission.recorded
          ? t(`BIN commission: ${v.commission.pct ?? '—'}%${v.commission.note ? ` — ${v.commission.note}` : ''}`, `عمولة BIN: ${v.commission.pct ?? '—'}%${v.commission.note ? ` — ${v.commission.note}` : ''}`)
          : t('BIN commission: not recorded', 'عمولة BIN: غير مسجلة');
        return (
          <ListRow key={v.vendorId} isRTL={isRTL} title={`${v.name} · ${v.trade}`}
            subtitle={[credLabel(v.licence, 'Licence', 'الرخصة'), credLabel(v.insurance, 'Insurance', 'التأمين'), numbers, commission].join(' | ')}
            trailing={bad ? <StatusChip tone="bad" label={t('Expired document', 'وثيقة منتهية')} /> : v.badges.length ? <StatusChip tone="ok" label={v.badges.map(badge).join(', ')} /> : undefined} />
        );
      })}
    </UiCard>
  );
}

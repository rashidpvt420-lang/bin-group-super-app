import { useEffect, useState } from 'react';
import { Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, StatusChip, UiCard } from '../../components/ui';

type Chain = {
  approvalRequestId: string; trade: string; links: Record<string, 'PRESENT' | 'MISSING'>;
  lowestQuoteAed: number | null; invoiceAed: number | null;
  check: { state: 'OVER_QUOTE' | 'WITHIN_QUOTE' | 'NOT_COMPARABLE'; varianceAed: number | null; variancePct: number | null };
  split: { state: 'ITEMISED' | 'NOT_ITEMISED'; labourAed: number | null; materialsAed: number | null } | null;
};
const STEPS: [string, string, string][] = [['APPROVAL', 'Approval', 'الموافقة'], ['QUOTES', 'Quotes', 'العروض'], ['WORK_EVIDENCE', 'Work photos', 'صور العمل'], ['INVOICE', 'Invoice', 'الفاتورة'], ['PAYMENT', 'Payment', 'الدفع']];

/** Proof of Spend: one linked chain per expense, invoice-vs-quote check and labour/materials split. */
export default function OwnerProofOfSpendCard() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [data, setData] = useState<{ chains: Chain[]; complete: boolean; pageSize: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerProofOfSpend')({}).then((r: any) => { if (alive) setData(r?.data ?? null); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  return (
    <UiCard isRTL={isRTL} testId="owner-proof-of-spend" label={t('Proof of Spend', 'إثبات الإنفاق')}>
      {failed && <ErrorState isRTL={isRTL} title={t('Proof of Spend could not load. Refresh to retry.', 'تعذر تحميل إثبات الإنفاق. حدّث الصفحة للمحاولة.')} />}
      {data && data.chains.length === 0 && <EmptyState isRTL={isRTL} title={t('No approved expenses recorded yet', 'لا توجد مصروفات معتمدة مسجلة بعد')} />}
      {data?.chains.map((c) => {
        const chain = STEPS.map(([k, en, a]) => `${c.links[k] === 'PRESENT' ? '✓' : '✗'} ${t(en, a)}`).join(' → ');
        const check = c.check.state === 'OVER_QUOTE'
          ? t(`Invoice AED ${c.invoiceAed} is AED ${c.check.varianceAed} (${c.check.variancePct}%) over the quote`, `الفاتورة ${c.invoiceAed} درهم تزيد ${c.check.varianceAed} درهم (${c.check.variancePct}%) عن العرض`)
          : c.check.state === 'WITHIN_QUOTE' ? t(`Invoice AED ${c.invoiceAed} within quote AED ${c.lowestQuoteAed}`, `الفاتورة ${c.invoiceAed} درهم ضمن العرض ${c.lowestQuoteAed} درهم`)
          : t('Invoice vs quote: not comparable yet', 'الفاتورة مقابل العرض: غير قابلة للمقارنة بعد');
        const split = c.split?.state === 'ITEMISED'
          ? t(`Labour AED ${c.split.labourAed} · Materials AED ${c.split.materialsAed}`, `العمالة ${c.split.labourAed} درهم · المواد ${c.split.materialsAed} درهم`)
          : t('Labour/materials not itemised', 'العمالة/المواد غير مفصلة');
        return <ListRow key={c.approvalRequestId} isRTL={isRTL} title={c.trade || c.approvalRequestId} subtitle={`${chain} | ${check} | ${split}`}
          trailing={c.check.state === 'OVER_QUOTE' ? <StatusChip tone="warn" label={t('Over quote', 'أعلى من العرض')} /> : undefined} />;
      })}
      {data && !data.complete && (
        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
          {t(`Showing the first ${data.pageSize} expenses only. This is not your full ledger.`, `يعرض أول ${data.pageSize} مصروفاً فقط. هذا ليس سجلك الكامل.`)}
        </Typography>
      )}
    </UiCard>
  );
}

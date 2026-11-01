import { useEffect, useState } from 'react';
import { Alert, Link, Stack } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { EmptyState, ErrorState, ListRow, UiCard } from '../../components/ui';

type Rec = { id: string; kind: string; title: string; buildingName: string; period: string; amountAedAsStated: number | null; documentUrl: string };
const KIND: Record<string, [string, string]> = {
  BUDGET: ['Budget', 'ميزانية'], SERVICE_CHARGE_STATEMENT: ['Service-charge statement', 'كشف رسوم الخدمة'],
  RESERVE_FUND_REPORT: ['Reserve-fund report', 'تقرير الصندوق الاحتياطي'], MEETING_MINUTES: ['Meeting minutes', 'محضر اجتماع'],
};

/** Owners' committee records: documents filed for reference only. No funds are held or pooled. */
export default function OwnerCommitteeRecordsCard() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [data, setData] = useState<{ records: Rec[]; notice: { en: string; ar: string } } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerCommitteeRecords')({}).then((r: any) => { if (alive) setData(r?.data ?? null); }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  return (
    <UiCard isRTL={isRTL} testId="owner-committee-records" label={t("Owners' committee records", 'سجلات لجنة الملاك')}>
      <Stack spacing={1}>
        <Alert severity="info" data-testid="committee-records-only-notice">{t('Records only. BIN does not hold, collect or pool committee funds. This feature needs legal review.', 'سجلات فقط. لا تحتفظ BIN بأموال اللجنة ولا تجمعها. هذه الميزة تحتاج إلى مراجعة قانونية.')}</Alert>
        {failed && <ErrorState isRTL={isRTL} title={t('Records could not load.', 'تعذر تحميل السجلات.')} />}
        {data && data.records.length === 0 && <EmptyState isRTL={isRTL} title={t('No committee records filed', 'لا توجد سجلات مودعة')} />}
        {data?.records.map((r) => (
          <ListRow key={r.id} isRTL={isRTL} title={r.title}
            subtitle={`${t(...(KIND[r.kind] || [r.kind, r.kind]))} · ${r.buildingName}${r.period ? ` · ${r.period}` : ''}${r.amountAedAsStated !== null ? ` · ${t('AED (as stated)', 'درهم (كما ورد)')} ${r.amountAedAsStated.toLocaleString()}` : ''}`}
            trailing={<Link href={r.documentUrl} target="_blank" rel="noopener noreferrer">{t('Open', 'فتح')}</Link>} />
        ))}
      </Stack>
    </UiCard>
  );
}

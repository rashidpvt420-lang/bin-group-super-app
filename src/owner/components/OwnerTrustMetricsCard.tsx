import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { ErrorState, ListRow, StatusChip, UiCard } from '../../components/ui';

type Metric = { key: string; state: 'OK' | 'INSUFFICIENT_DATA' | 'UNAVAILABLE'; numerator: number | null; denominator: number | null; percent: number | null; minRecords: number };

const LABELS: Record<string, [string, string, string, string]> = {
  authorityCoverage: ['Properties with verified ownership', 'عقارات بملكية موثّقة', 'Verified by an admin, not by document scan alone', 'وثّقها مسؤول، وليس بمسح المستند فقط'],
  approvalDiscipline: ['Approvals decided normally (not emergency)', 'موافقات بقرار عادي (غير طارئ)', 'Share of your decided approvals', 'نسبة موافقاتك التي تم البت فيها'],
  maintenanceEvidence: ['Completed jobs with after-work photos', 'أعمال منجزة مع صور بعد العمل', 'From the technician completion evidence', 'من أدلة إنجاز الفني'],
  financialTraceability: ['Costed jobs linked to approval and payment', 'أعمال بتكلفة مرتبطة بموافقة ودفع', 'Approval plus invoice or payment record', 'موافقة مع فاتورة أو سجل دفع'],
};

/** Owner Trust Centre metrics: read-only ratios over the owner's own records; never a made-up score. */
export default function OwnerTrustMetricsCard() {
  const { lang, isRTL } = useLanguage();
  const ar = lang === 'ar';
  const t = (en: string, arText: string) => (ar ? arText : en);
  const [metrics, setMetrics] = useState<Metric[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    httpsCallable(functions, 'getOwnerTrustMetrics')({})
      .then((res: any) => { if (alive) setMetrics(Array.isArray(res?.data?.metrics) ? res.data.metrics : []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);
  const value = (m: Metric) => {
    if (m.state === 'OK' && m.percent !== null) return { tone: 'ok' as const, label: `${m.percent}% (${m.numerator}/${m.denominator})` };
    if (m.state === 'INSUFFICIENT_DATA') return { tone: 'warn' as const, label: t(`Not enough data (${m.denominator ?? 0}/${m.minRecords})`, `بيانات غير كافية (${m.denominator ?? 0}/${m.minRecords})`) };
    return { tone: 'bad' as const, label: t('Could not load', 'تعذر التحميل') };
  };
  return (
    <UiCard isRTL={isRTL} testId="owner-trust-metrics" label={t('Trust metrics from your records', 'مؤشرات الثقة من سجلاتك')}>
      {failed && <ErrorState isRTL={isRTL} title={t('Trust metrics could not load. Refresh to retry.', 'تعذر تحميل مؤشرات الثقة. حدّث الصفحة للمحاولة.')} />}
      {!failed && !metrics && <Typography variant="body2">…</Typography>}
      {metrics && (
        <Box>
          {metrics.map((m) => {
            const l = LABELS[m.key] || [m.key, m.key, '', ''];
            const v = value(m);
            return <ListRow key={m.key} isRTL={isRTL} title={ar ? l[1] : l[0]} subtitle={ar ? l[3] : l[2]} trailing={<StatusChip tone={v.tone} label={v.label} />} />;
          })}
          <Typography variant="caption" sx={{ display: 'block', mt: 1, opacity: 0.75 }}>
            {t('Calculated only from records in BIN GROUP. Not an official rating.', 'محسوبة فقط من السجلات في BIN GROUP. ليست تقييماً رسمياً.')}
          </Typography>
        </Box>
      )}
    </UiCard>
  );
}

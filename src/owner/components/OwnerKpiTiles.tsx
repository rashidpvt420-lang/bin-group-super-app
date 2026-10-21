import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@bin/shared';
import { functions, httpsCallable } from '../../lib/firebase';
import { ErrorState, StatGrid, StatTile } from '../../components/ui';

type Kpi<T> = { value: T | null; error: string | null };
export type OwnerKpis = {
  month: string;
  rent: Kpi<{ due: number; collected: number; overdueInstallments: number }>;
  occupancy: Kpi<{ occupied: number; total: number }>;
  jobs: Kpi<{ open: number; urgent: number }>;
  leasesExpiring90d: Kpi<number>;
  approvalsWaiting: Kpi<number>;
};

/** A tile's value only when the server returned it without error; otherwise null (never a silent 0). */
export function kpiValue<T>(kpi: Kpi<T> | undefined | null): T | null {
  return kpi && !kpi.error && kpi.value !== null && kpi.value !== undefined ? kpi.value : null;
}

/**
 * Feature 9 on the redesigned owner home (R4): the four stat tiles read server aggregates
 * (getOwnerKpis: rent collected vs due, occupancy, leases ending in 90 days). "Repairs in progress" stays on
 * the live owner ticket listener (useOwnerCommandCounts.openTickets) so it matches the full dashboard's
 * Open Maintenance count.
 * While loading a tile shows "…"; a tile whose source failed says "Could not load" instead of 0.
 */
export default function OwnerKpiTiles({ onNavigate, isRTL, openRepairs, repairsLoading }: { onNavigate: (path: string) => void; isRTL?: boolean; openRepairs: number | null; repairsLoading?: boolean }) {
  const { lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const [data, setData] = useState<OwnerKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setLoading(true); setFailed(false);
    httpsCallable(functions, 'getOwnerKpis')({})
      .then((res: any) => setData(res?.data || null))
      .catch(() => { setFailed(true); setData(null); })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const num = (n: number) => Math.round(n).toLocaleString(lang === 'ar' ? 'ar-AE' : 'en-AE');
  const ph = loading ? '…' : t('owner.home.couldNotLoad', 'Could not load', 'تعذر التحميل');
  const rent = kpiValue(data?.rent);
  const occ = kpiValue(data?.occupancy);
  const leases = kpiValue(data?.leasesExpiring90d);

  return (
    <>
      <StatGrid>
        <StatTile isRTL={isRTL} label={t('owner.home.rent', 'Rent collected this month', 'الإيجار المحصّل هذا الشهر')} value={rent ? `${num(rent.collected)} / ${num(rent.due)}` : null} placeholder={ph} onClick={() => onNavigate('/owner/units')} />
        <StatTile isRTL={isRTL} label={t('owner.home.occupancy', 'Units occupied', 'الوحدات المؤجرة')} value={occ ? `${occ.occupied} / ${occ.total}` : null} placeholder={ph} onClick={() => onNavigate('/owner/units')} />
        <StatTile isRTL={isRTL} label={t('owner.home.leases', 'Leases ending in 90 days', 'عقود تنتهي خلال 90 يوماً')} value={leases} placeholder={ph} onClick={() => onNavigate('/owner/units')} />
        <StatTile isRTL={isRTL} label={t('owner.home.repairs', 'Repairs in progress', 'إصلاحات جارية')} value={openRepairs} placeholder={repairsLoading ? '…' : t('owner.home.couldNotLoad', 'Could not load', 'تعذر التحميل')} onClick={() => onNavigate('/owner/tickets')} />
      </StatGrid>
      {failed && <ErrorState isRTL={isRTL} title={t('owner.home.kpiError', 'Your portfolio numbers could not load. Nothing is shown as zero until they do.', 'تعذر تحميل أرقام محفظتك. لن يظهر أي رقم كصفر حتى يتم التحميل.')} onRetry={load} retryLabel={t('owner.home.retry', 'Try again', 'حاول مرة أخرى')} />}
      {!loading && rent && rent.overdueInstallments > 0 && (
        <ErrorState isRTL={isRTL} title={`${rent.overdueInstallments} ${t('owner.home.overdue', 'rent instalment(s) overdue', 'دفعة إيجار متأخرة')}`} onRetry={() => onNavigate('/owner/units')} retryLabel={t('owner.home.view', 'View', 'عرض')} />
      )}
    </>
  );
}

import React from 'react';
import { Skeleton } from '@mui/material';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { EmptyState, ErrorState, ListRow } from '../../components/ui';

type Alert = { id: string; title?: string; body?: string; link?: string; read?: boolean; createdAt?: { toMillis?: () => number } };

/**
 * Feature 6 on the redesigned broker home: the broker's own BROKER_VACANCY_ALERT notifications.
 * Equality-only query (userId + type), sorted on the client, so no new composite index is needed.
 * Alerts are only created when system_config/vacancy.brokerAlertsEnabled is true (default off).
 */
export default function BrokerVacancyAlertsCard({ isRTL, t, onOpen }: { isRTL: boolean; t: (key: string, en: string, ar: string) => string; onOpen: (path: string) => void }) {
  const { user } = useRole();
  const [state, setState] = React.useState<{ loading: boolean; error: boolean; rows: Alert[] }>({ loading: true, error: false, rows: [] });

  React.useEffect(() => {
    if (!user?.uid) { setState({ loading: false, error: false, rows: [] }); return undefined; }
    const q = query(collection(db, 'notifications'), where('userId', '==', user.uid), where('type', '==', 'BROKER_VACANCY_ALERT'), limit(20));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Alert, 'id'>) }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
        .slice(0, 5);
      setState({ loading: false, error: false, rows });
    }, () => setState({ loading: false, error: true, rows: [] }));
  }, [user?.uid]);

  if (state.loading) return <Skeleton height={48} data-testid="broker-vacancy-alerts-loading" />;
  if (state.error) return <ErrorState isRTL={isRTL} title={t('broker.home.vacanciesError', 'Vacancy alerts could not load.', 'تعذر تحميل تنبيهات الوحدات الشاغرة.')} />;
  if (!state.rows.length) return <EmptyState isRTL={isRTL} title={t('broker.home.noVacancies', 'No new vacancies in your area yet', 'لا توجد وحدات شاغرة جديدة في منطقتك بعد')} detail={t('broker.home.noVacanciesDetail', 'You get an alert here when a verified listing goes live near you.', 'ستصلك تنبيهات هنا عند نشر وحدة موثقة قريبة منك.')} />;
  return (
    <>
      {state.rows.map((row) => (
        <ListRow key={row.id} isRTL={isRTL} title={String(row.title || t('broker.home.vacancy', 'New vacancy', 'وحدة شاغرة جديدة'))} subtitle={row.body ? String(row.body).slice(0, 140) : undefined} onClick={() => onOpen(row.link && row.link.startsWith('/broker/') ? row.link : '/broker/listings')} />
      ))}
    </>
  );
}

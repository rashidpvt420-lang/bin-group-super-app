import { Alert, Box, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { AppHeader, EmptyState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';
import { ui } from '../../theme/uiTokens';
import { useOwnerCommandCounts } from '../hooks/useOwnerCommandCounts';
import OwnerFinancialTruthCard from '../components/OwnerFinancialTruthCard';
import OwnerRecentComplaintsCard from '../components/OwnerRecentComplaintsCard';
import OwnerKpiTiles from '../components/OwnerKpiTiles';

/**
 * Redesigned owner home (REDESIGN.md R4): key numbers, one "Needs you today" list, live repairs, money.
 * Rent, occupancy, open jobs and approvals come from the server KPIs (F9, getOwnerKpis); a tile that
 * cannot load says so instead of showing a silent zero.
 */
export default function OwnerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const commandCounts = useOwnerCommandCounts();
  const loading = commandCounts.loading;

  const todo = [
    { key: 'approvals', count: commandCounts.pendingCostApprovals, title: t('owner.home.approvals', 'Approve quotes and finished work', 'اعتماد العروض والأعمال المنجزة'), path: '/owner/approvals', tone: 'warn' as const },
    { key: 'urgent', count: commandCounts.highRiskTickets, title: t('owner.home.urgent', 'Urgent repairs', 'إصلاحات عاجلة'), path: '/owner/tickets', tone: 'bad' as const },
    { key: 'disputes', count: commandCounts.openDisputes, title: t('owner.home.disputes', 'Disputes to review', 'نزاعات للمراجعة'), path: '/owner/tickets', tone: 'bad' as const },
    { key: 'documents', count: commandCounts.expiringDocuments, title: t('owner.home.documents', 'Documents expiring in 30 days', 'مستندات تنتهي خلال 30 يوماً'), path: '/owner/documents', tone: 'warn' as const },
  ].filter((row) => row.count > 0);

  return (
    <Box data-testid="owner-home" sx={{ direction: isRTL ? 'rtl' : 'ltr', mx: { xs: -2, sm: 0 } }}>
      <AppHeader isRTL={isRTL} eyebrow={t('owner.home.eyebrow', 'Owner', 'المالك')} title={t('owner.home.title', 'My properties', 'عقاراتي')} />
      <Stack spacing={1.75} sx={{ p: 2, bgcolor: ui.cream }}>
        <OwnerKpiTiles onNavigate={navigate} />

        {(commandCounts.failedSources || []).length > 0 && (
          <Alert severity="warning" data-testid="owner-command-counts-failed">{t('owner.home.countsFailed', 'Some counts could not be loaded. Numbers may be incomplete — refresh to retry.', 'تعذّر تحميل بعض الأرقام. قد تكون غير مكتملة — حدّث الصفحة للمحاولة مجدداً.')} ({(commandCounts.failedSources || []).join(', ')})</Alert>
        )}

        <UiCard isRTL={isRTL} testId="owner-needs-you-today" label={`${t('owner.home.today', 'Needs you today', 'يحتاجك اليوم')}${loading ? '' : ` · ${todo.length}`}`}>
          <Box sx={{ mt: 0.5 }}>
            {!loading && todo.length === 0 && <EmptyState isRTL={isRTL} title={t('owner.home.allClear', 'Nothing needs you right now', 'لا شيء يحتاجك الآن')} />}
            {todo.map((row) => (
              <ListRow key={row.key} isRTL={isRTL} title={row.title} trailing={<StatusChip tone={row.tone} label={String(row.count)} />} onClick={() => navigate(row.path)} />
            ))}
          </Box>
        </UiCard>

        <OwnerRecentComplaintsCard />

        <OwnerFinancialTruthCard />

        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25}>
          <UiButton tone="outline" onClick={() => navigate('/owner/tenants')}>{t('owner.home.invite', 'Invite tenant', 'دعوة مستأجر')}</UiButton>
          <UiButton tone="primary" onClick={() => navigate('/owner/find-room-rent')}>{t('owner.home.list', 'List empty unit', 'عرض وحدة شاغرة')}</UiButton>
        </Stack>

        <Button onClick={() => navigate('/owner/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: ui.goldText, fontWeight: 700, minHeight: ui.touchTarget }}>{t('owner.home.full', 'Open full dashboard', 'فتح اللوحة الكاملة')}</Button>
      </Stack>
    </Box>
  );
}

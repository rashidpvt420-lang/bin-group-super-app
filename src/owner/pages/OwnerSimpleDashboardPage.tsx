import { Alert, Box, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { AppHeader, ComingSoon, EmptyState, ListRow, StatGrid, StatTile, StatusChip, UiButton, UiCard } from '../../components/ui';
import { ui } from '../../theme/uiTokens';
import { useOwnerCommandCounts } from '../hooks/useOwnerCommandCounts';
import OwnerFinancialTruthCard from '../components/OwnerFinancialTruthCard';
import OwnerRecentComplaintsCard from '../components/OwnerRecentComplaintsCard';

/**
 * Redesigned owner home (REDESIGN.md R4): key numbers, one "Needs you today" list, live repairs, money.
 * Rent collected, occupancy and leases ending stay as labelled placeholders until the rent schedule (F1),
 * lease end dates (F3) and automatic vacancy (F5) land; we never show invented numbers.
 */
export default function OwnerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const commandCounts = useOwnerCommandCounts();
  const loading = commandCounts.loading;
  const openMaintenance = commandCounts.openTickets;

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
        <StatGrid>
          <StatTile isRTL={isRTL} label={t('owner.home.rent', 'Rent collected this month', 'الإيجار المحصّل هذا الشهر')} value={null} placeholder={t('owner.home.soon', 'Soon', 'قريباً')} />
          <StatTile isRTL={isRTL} label={t('owner.home.occupancy', 'Units occupied', 'الوحدات المؤجرة')} value={null} placeholder={t('owner.home.soon', 'Soon', 'قريباً')} />
          <StatTile isRTL={isRTL} label={t('owner.home.leases', 'Leases ending in 90 days', 'عقود تنتهي خلال 90 يوماً')} value={null} placeholder={t('owner.home.soon', 'Soon', 'قريباً')} />
          <StatTile isRTL={isRTL} label={t('owner.home.repairs', 'Repairs in progress', 'إصلاحات جارية')} value={loading ? null : openMaintenance} onClick={() => navigate('/owner/tickets')} />
        </StatGrid>
        <ComingSoon isRTL={isRTL} title={t('owner.home.soonTitle', 'Rent, occupancy and lease numbers are coming', 'أرقام الإيجار والإشغال والعقود قادمة')} detail={t('owner.home.soonDetail', 'They will appear here once rent schedules and lease end dates are recorded.', 'ستظهر هنا بعد تسجيل جداول الإيجار وتواريخ انتهاء العقود.')} />

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

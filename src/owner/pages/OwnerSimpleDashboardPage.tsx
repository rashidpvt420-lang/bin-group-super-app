import HomeQuickLinks, { type HomeQuickLink } from '../../components/HomeQuickLinks';
import SuggestionBoxCard from '../../components/SuggestionBoxCard';
import PaymentCollectionRecordsCard from '../../components/PaymentCollectionRecordsCard';
import OwnerProofOfSpendCard from '../components/OwnerProofOfSpendCard';
import OwnerMaintenancePlansCard from '../components/OwnerMaintenancePlansCard';
import OwnerVendorScorecardsCard from '../components/OwnerVendorScorecardsCard';
import MoneyStatementDownload from '../../components/MoneyStatementDownload';
import OwnerPrivacyCentreCard from '../components/OwnerPrivacyCentreCard';
import OwnerPerformanceReportCard from '../components/OwnerPerformanceReportCard';
import OwnerPropertyPassportCard from '../components/OwnerPropertyPassportCard';
import { Box, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { AppHeader, EmptyState, ErrorState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';
import { ui } from '../../theme/uiTokens';
import { useOwnerCommandCounts } from '../hooks/useOwnerCommandCounts';
import OwnerFinancialTruthCard from '../components/OwnerFinancialTruthCard';
import OwnerRecentComplaintsCard from '../components/OwnerRecentComplaintsCard';
import OwnerComplianceCalendarCard from '../components/OwnerComplianceCalendarCard';
import OwnerKpiTiles from '../components/OwnerKpiTiles';
import OwnerTrustMetricsCard from '../components/OwnerTrustMetricsCard';

/**
 * Redesigned owner home (REDESIGN.md R4): key numbers, one "Needs you today" list, live repairs, money.
 * The stat tiles read server aggregates (feature 9, getOwnerKpis) built on the rent schedule (F1), lease end
 * dates (F3) and vacancy (F5); a failed source says so instead of showing an invented 0.
 */
/** Everything that used to sit only on the owner full dashboard, now on Home. */
export const OWNER_HOME_LINKS: HomeQuickLink[] = [
  { path: '/owner/design-studio', en: 'AI Redesign', ar: 'إعادة التصميم بالذكاء الاصطناعي' },
  { path: '/owner/painting', en: 'Painting (one-time project)', ar: 'الدهان (مشروع لمرة واحدة)' },
  { path: '/owner/contracts', en: 'Contracts', ar: 'العقود' },
  { path: '/owner/documents', en: 'Document vault', ar: 'خزنة المستندات' },
  { path: '/owner/property-passport', en: 'Property passport', ar: 'جواز العقار' },
  { path: '/owner/ai-intelligence', en: 'Property operations intelligence', ar: 'ذكاء عمليات العقارات' },
  { path: '/owner/financials', en: 'Money', ar: 'المالية' },
  { path: '/owner/complaints', en: 'Complaints', ar: 'الشكاوى' },
  { path: '/owner/insights', en: 'Add person (authorized reporters)', ar: 'إضافة شخص (المبلغون المعتمدون)' },
  { path: '/owner/insights', en: 'How this works for you', ar: 'كيف يعمل هذا لك' },
];

export default function OwnerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const commandCounts = useOwnerCommandCounts();
  const loading = commandCounts.loading;
  const openMaintenance = commandCounts.openTickets;
  const failedSources = commandCounts.failedSources || [];

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
        <OwnerKpiTiles onNavigate={navigate} isRTL={isRTL} repairsLoading={loading} openRepairs={loading || failedSources.includes('tickets') ? null : openMaintenance} />
        {failedSources.length > 0 && (
          <Box data-testid="owner-command-counts-failed">
            <ErrorState isRTL={isRTL} title={`${t('owner.home.countsFailed', 'Some to-do counts could not load', 'تعذر تحميل بعض أعداد المهام')} (${failedSources.join(', ')}). ${t('owner.home.countsFailedDetail', 'The list below may be incomplete — refresh to retry.', 'قد تكون القائمة أدناه غير مكتملة — حدّث الصفحة للمحاولة مجدداً.')}`} />
          </Box>
        )}

        <UiCard isRTL={isRTL} testId="owner-needs-you-today" label={`${t('owner.home.today', 'Needs you today', 'يحتاجك اليوم')}${loading ? '' : ` · ${todo.length}`}`}>
          <Box sx={{ mt: 0.5 }}>
            {!loading && todo.length === 0 && failedSources.length === 0 && <EmptyState isRTL={isRTL} title={t('owner.home.allClear', 'Nothing needs you right now', 'لا شيء يحتاجك الآن')} />}
            {todo.map((row) => (
              <ListRow key={row.key} isRTL={isRTL} title={row.title} trailing={<StatusChip tone={row.tone} label={String(row.count)} />} onClick={() => navigate(row.path)} />
            ))}
          </Box>
        </UiCard>

        <OwnerRecentComplaintsCard />
        <OwnerComplianceCalendarCard />

        <OwnerFinancialTruthCard />
        <OwnerTrustMetricsCard />

        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25}>
          <UiButton tone="outline" onClick={() => navigate('/owner/tenants')}>{t('owner.home.invite', 'Invite tenant', 'دعوة مستأجر')}</UiButton>
          <UiButton tone="primary" onClick={() => navigate('/owner/find-room-rent')}>{t('owner.home.list', 'List empty unit', 'عرض وحدة شاغرة')}</UiButton>
        </Stack>

        <OwnerMaintenancePlansCard />
        <OwnerVendorScorecardsCard />

        <SuggestionBoxCard role="owner" />
        <OwnerPrivacyCentreCard />
        <PaymentCollectionRecordsCard />
        <OwnerProofOfSpendCard />
        <MoneyStatementDownload />
        <OwnerPerformanceReportCard />
        <OwnerPropertyPassportCard />

        <HomeQuickLinks testId="owner-home-quick-links" titleEn="Your tools" titleAr="أدواتك" links={OWNER_HOME_LINKS} />
        <UiCard testId="owner-home-insights">
          <ListRow title={t('owner.home.insights', 'Portfolio insights & reports', 'تحليلات وتقارير المحفظة')} subtitle={t('owner.home.insightsSub', 'ROI, rent collection, money risk, contracts, complaints, evidence and authorized reporters', 'العائد، التحصيل، المخاطر المالية، العقود، الشكاوى، الأدلة والمبلغون المعتمدون')} onClick={() => navigate('/owner/insights')} isRTL={isRTL} />
        </UiCard>
      </Stack>
    </Box>
  );
}

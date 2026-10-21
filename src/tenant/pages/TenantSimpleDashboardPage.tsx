import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { AppHeader, ComingSoon, EmptyState, ErrorState, ListRow, StatusChip, UiButton, UiCard } from '../../components/ui';
import { ui, uiType } from '../../theme/uiTokens';
import { CANONICAL_SLA_POLICY } from '../../config/uaeDominationBlueprint';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';
import { leaseEndMs, useTenantHomeData } from '../hooks/useTenantHomeData';

const issueShortcuts = [
  { en: 'AC', ar: 'المكيف', category: 'ac' },
  { en: 'Water', ar: 'المياه', category: 'plumbing' },
  { en: 'Electric', ar: 'الكهرباء', category: 'electrical' },
  { en: 'Other', ar: 'أخرى', category: 'other' },
];

const plannedServices = [
  { en: 'Deep cleaning', ar: 'تنظيف عميق', route: '/tenant/scheduled-service?service=deep-clean' },
  { en: 'Pest control', ar: 'مكافحة الآفات', route: '/tenant/scheduled-service?service=pest-control' },
  { en: 'Home care while away', ar: 'العناية بالمنزل أثناء السفر', route: '/tenant/scheduled-service?service=vacation-care&occupancy=away' },
  { en: 'Moving and packing', ar: 'النقل والتغليف', route: '/tenant/scheduled-service?service=moving' },
];

const DAY = 24 * 60 * 60 * 1000;

/** Redesigned tenant home (REDESIGN.md R5): my home, rent, lease, active request, quick report. */
export default function TenantSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, tx, lang } = useLanguage();
  const ar = lang === 'ar';
  const t = (key: string, en: string, arText: string) => (ar ? arText : tx(key, en));
  const { unitLoading, unit, ticketsLoading, ticketsError, activeTickets } = useTenantHomeData();
  const unitTitle = unit ? [unit.unitNumber ? `${t('tenant.home.unit', 'Unit', 'وحدة')} ${unit.unitNumber}` : '', unit.propertyName || unit.buildingName || ''].filter(Boolean).join(' · ') : '';
  const endMs = leaseEndMs(unit);
  const daysLeft = endMs ? Math.ceil((endMs - Date.now()) / DAY) : null;
  const active = activeTickets[0];
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(ar ? 'ar-AE' : 'en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Box data-testid="tenant-home" sx={{ direction: isRTL ? 'rtl' : 'ltr', minWidth: 0, overflowX: 'hidden', mx: { xs: -2, sm: 0 } }}>
      <AppHeader isRTL={isRTL} eyebrow={t('tenant.home.eyebrow', 'My home', 'منزلي')} title={unitTitle || t('tenant.home.title', 'Welcome home', 'أهلاً بك')} />
      <Stack spacing={1.75} sx={{ p: 2, bgcolor: ui.cream }}>
        {unitLoading && <Skeleton variant="rounded" height={96} sx={{ borderRadius: `${ui.radiusCard}px` }} />}
        {!unitLoading && !unit && <TenantUnitLinkFallback compact />}

        {!unitLoading && unit && (
          <UiCard isRTL={isRTL} testId="tenant-home-rent" label={t('tenant.home.rent', 'Rent', 'الإيجار')}>
            <ComingSoon isRTL={isRTL} title={t('tenant.home.rentSoon', 'Your rent due dates will show here', 'ستظهر مواعيد إيجارك هنا')} detail={t('tenant.home.rentSoonDetail', 'Until then, see payments you have recorded.', 'حتى ذلك الحين، راجع المدفوعات المسجلة.')} />
            <Button onClick={() => navigate('/tenant/payments')} sx={{ mt: 1, minHeight: ui.touchTarget, color: ui.goldText, fontWeight: 700 }}>{t('tenant.home.payments', 'Open payments', 'فتح المدفوعات')}</Button>
          </UiCard>
        )}

        {!unitLoading && unit && (
          <UiCard isRTL={isRTL} testId="tenant-home-lease" label={t('tenant.home.lease', 'Lease', 'عقد الإيجار')}>
            {endMs ? (
              <ListRow isRTL={isRTL} title={`${t('tenant.home.ends', 'Ends', 'ينتهي')} ${fmtDate(endMs)}`} subtitle={daysLeft !== null && daysLeft >= 0 ? `${daysLeft} ${t('tenant.home.daysLeft', 'days left', 'يوماً متبقياً')}` : t('tenant.home.ended', 'Lease has ended', 'انتهى العقد')} trailing={daysLeft !== null && daysLeft <= 120 ? <StatusChip tone="warn" label={t('tenant.home.renew', 'Renew', 'تجديد')} /> : undefined} onClick={() => navigate('/tenant/renewals')} />
            ) : (
              <ComingSoon isRTL={isRTL} title={t('tenant.home.leaseMissing', 'Lease end date not recorded yet', 'لم يُسجل تاريخ انتهاء العقد بعد')} detail={t('tenant.home.leaseMissingDetail', 'BIN will add it so you get renewal reminders.', 'ستضيفه BIN لتصلك تذكيرات التجديد.')} />
            )}
          </UiCard>
        )}

        <UiCard isRTL={isRTL} testId="tenant-home-active-request" label={t('tenant.home.request', 'My request', 'طلبي')}>
          {ticketsLoading && <Skeleton height={48} />}
          {!ticketsLoading && ticketsError && <ErrorState isRTL={isRTL} title={t('tenant.home.ticketsError', 'Requests could not load.', 'تعذر تحميل الطلبات.')} />}
          {!ticketsLoading && !ticketsError && !active && <EmptyState isRTL={isRTL} title={t('tenant.home.noRequest', 'No open requests', 'لا توجد طلبات مفتوحة')} />}
          {!ticketsLoading && !ticketsError && active && (
            <ListRow isRTL={isRTL} title={String(active.category || active.complaintCategory || active.title || t('tenant.home.repair', 'Repair', 'إصلاح'))} subtitle={active.assignedTechnicianName ? `${t('tenant.home.tech', 'Technician', 'الفني')}: ${active.assignedTechnicianName}` : undefined} trailing={<StatusChip tone="info" label={String(active.status || '').replace(/_/g, ' ').toLowerCase()} />} onClick={() => navigate(`/tenant/ticket/${active.id}`)} />
          )}
          {activeTickets.length > 1 && <ListRow isRTL={isRTL} title={`${t('tenant.home.allRequests', 'All requests', 'كل الطلبات')} (${activeTickets.length})`} onClick={() => navigate('/tenant/tickets')} />}
        </UiCard>

        <UiCard isRTL={isRTL} testId="tenant-home-report" label={t('tenant.home.report', 'Report a problem', 'الإبلاغ عن مشكلة')}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mt: 1 }}>
            {issueShortcuts.map((item) => (
              <UiButton key={item.category} tone="outline" aria-label={ar ? item.ar : item.en} onClick={() => navigate(`/tenant/request?category=${item.category}`)} sx={{ fontSize: 14, px: 0.5 }}>{ar ? item.ar : item.en}</UiButton>
            ))}
          </Box>
        </UiCard>

        <UiCard isRTL={isRTL} label={t('tenant.home.services', 'Book a home service', 'احجز خدمة منزلية')}>
          <Box sx={{ mt: 0.5 }}>
            {plannedServices.map((s) => <ListRow key={s.route} isRTL={isRTL} title={ar ? s.ar : s.en} onClick={() => navigate(s.route)} />)}
            <ListRow isRTL={isRTL} title={t('tenant.home.notices', 'Building notices', 'إشعارات المبنى')} onClick={() => navigate('/tenant/notices')} />
          </Box>
        </UiCard>

        <Box component="button" type="button" onClick={() => navigate('/tenant/emergency')} sx={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', minHeight: ui.touchTarget, borderRadius: '14px', bgcolor: ui.badBg, color: ui.badText, px: 2, py: 1.5, textAlign: isRTL ? 'right' : 'left', '&:focus-visible': { outline: `3px solid ${ui.gold}` } }}>
          <Typography sx={{ ...uiType.body, fontWeight: 800, color: ui.badText }}>{t('tenant.home.emergency', 'Emergency? Get help now', 'طوارئ؟ اطلب المساعدة الآن')}</Typography>
          <Typography sx={{ ...uiType.small, color: ui.badText }}>{ar ? `الاستجابة خلال ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} دقيقة` : `Response within ${CANONICAL_SLA_POLICY.EMERGENCY.minutes} minutes`}</Typography>
        </Box>

        <Button onClick={() => navigate('/tenant/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: ui.goldText, fontWeight: 700, minHeight: ui.touchTarget }}>{t('tenant.home.full', 'Open full dashboard', 'فتح اللوحة الكاملة')}</Button>
      </Stack>
    </Box>
  );
}

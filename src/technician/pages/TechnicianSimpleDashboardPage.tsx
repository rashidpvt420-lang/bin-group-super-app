import PaymentCollectionRecordsCard from '../../components/PaymentCollectionRecordsCard';
import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { useRole } from '../../context/RoleContext';
import { AppHeader, ComingSoon, EmptyState, ErrorState, ListRow, StatGrid, StatTile, StatusChip, UiButton, UiCard } from '../../components/ui';
import { ui, uiType } from '../../theme/uiTokens';
import { getTicketJobLocation } from '../../utils/liveTracking';
import TechnicianDutyAvailabilityCard from '../components/TechnicianDutyAvailabilityCard';
import { useTechnicianHomeJobs } from '../hooks/useTechnicianHomeJobs';
import { jobAddress, jobPlace, jobTimeMs, jobTitle, navigateUrl, needsAccept, type HomeJob } from '../utils/technicianHomeJobs';

/** Redesigned technician home (REDESIGN.md R3): next job first, then duty, then today's list. */
export default function TechnicianSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang, tx } = useLanguage();
  const { user } = useRole();
  const { loading, error, active, doneToday } = useTechnicianHomeJobs();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const firstName = String(user?.displayName || '').trim().split(/\s+/)[0] || '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('tech.home.morning', 'Good morning', 'صباح الخير') : t('tech.home.afternoon', 'Hello', 'مرحباً');
  const timeLabel = (job: HomeJob) => { const ms = jobTimeMs(job); return ms ? new Date(ms).toLocaleTimeString(lang === 'ar' ? 'ar-AE' : 'en-AE', { hour: 'numeric', minute: '2-digit' }) : ''; };
  const statusChip = (job: HomeJob) => {
    const s = String(job.status || '').toLowerCase();
    if (needsAccept(job)) return <StatusChip tone="warn" label={t('tech.home.new', 'New', 'جديدة')} />;
    if (s === 'in_progress' || s === 'waiting_parts') return <StatusChip tone="info" label={t('tech.home.working', 'Working', 'قيد العمل')} />;
    if (s === 'arrived') return <StatusChip tone="info" label={t('tech.home.arrived', 'Arrived', 'وصلت')} />;
    if (s === 'en_route' || s === 'on_the_way') return <StatusChip tone="info" label={t('tech.home.onWay', 'On the way', 'في الطريق')} />;
    return <StatusChip tone="ok" label={t('tech.home.accepted', 'Accepted', 'مقبولة')} />;
  };
  const next = active[0];
  const rest = active.slice(1, 4);
  const openJob = (job: HomeJob) => navigate(`/technician/job/${job.id}`);
  const nextNav = next ? navigateUrl(next, getTicketJobLocation(next)) : null;

  return (
    <Box data-testid="technician-home" sx={{ direction: isRTL ? 'rtl' : 'ltr', mx: { xs: -2, sm: 0 }, mt: { xs: -3.5, md: 0 } }}>
      <AppHeader isRTL={isRTL} eyebrow={greeting} title={firstName || t('tech.home.title', 'Your jobs', 'مهامك')} initials={firstName || undefined} />
      <Stack spacing={1.75} sx={{ p: 2, bgcolor: ui.cream }}>
        {loading && <Skeleton variant="rounded" height={190} sx={{ borderRadius: `${ui.radiusCard}px` }} />}
        {!loading && error && <ErrorState isRTL={isRTL} title={t('tech.home.loadError', 'Jobs could not load. Check your connection.', 'تعذر تحميل المهام. تحقق من الاتصال.')} />}
        {!loading && !error && next && (
          <UiCard testId="technician-next-job" highlight isRTL={isRTL} label={`${t('tech.home.nextJob', 'Your next job', 'مهمتك التالية')}${timeLabel(next) ? ` · ${timeLabel(next)}` : ''}`} title={`${jobTitle(next)}${jobPlace(next) ? ` — ${jobPlace(next)}` : ''}`}>
            <Typography sx={{ ...uiType.body, color: ui.muted, mt: 0.5 }}>{jobAddress(next) || t('tech.home.noAddress', 'Address not added yet — call the resident.', 'لا يوجد عنوان بعد — اتصل بالساكن.')}</Typography>
            <Box sx={{ mt: 1 }}>{statusChip(next)}</Box>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.25} sx={{ mt: 2 }}>
              <UiButton tone="dark" disabled={!nextNav} href={nextNav || undefined} target="_blank" rel="noopener noreferrer" data-testid="technician-next-job-navigate">{t('tech.home.navigate', 'Navigate', 'الاتجاهات')}</UiButton>
              <UiButton tone="primary" onClick={() => openJob(next)} data-testid="technician-next-job-open">{needsAccept(next) ? t('tech.home.accept', 'Accept job', 'قبول المهمة') : t('tech.home.start', 'Start job', 'ابدأ المهمة')}</UiButton>
            </Stack>
            <Typography sx={{ ...uiType.small, color: ui.muted, mt: 1.25 }}>{t('tech.home.stepsHint', 'Photos and signature are asked for step by step inside the job.', 'ستُطلب الصور والتوقيع خطوة بخطوة داخل المهمة.')}</Typography>
          </UiCard>
        )}
        {!loading && !error && !next && (
          <UiCard isRTL={isRTL} testId="technician-no-jobs">
            <EmptyState isRTL={isRTL} title={t('tech.home.emptyTitle', 'No jobs right now', 'لا توجد مهام الآن')} detail={t('tech.home.emptyDetail', "Stay on duty and we'll send you the next one.", 'ابقَ متاحاً وسنرسل لك المهمة التالية.')} />
          </UiCard>
        )}

        <TechnicianDutyAvailabilityCard isRTL={isRTL} />

        {!loading && !error && active.length > 0 && (
          <UiCard isRTL={isRTL} label={`${t('tech.home.today', 'Your jobs', 'مهامك')} · ${active.length}`}>
            <Box sx={{ mt: 0.5 }}>
              {[next, ...rest].map((job) => (
                <ListRow key={job.id} isRTL={isRTL} title={`${timeLabel(job) ? `${timeLabel(job)} · ` : ''}${jobTitle(job)}`} subtitle={jobPlace(job) || jobAddress(job) || undefined} trailing={statusChip(job)} onClick={() => openJob(job)} />
              ))}
              {active.length > 4 && <ListRow isRTL={isRTL} title={t('tech.home.seeAll', 'See all jobs', 'كل المهام')} onClick={() => navigate('/technician/jobs')} />}
            </Box>
          </UiCard>
        )}

        <StatGrid>
          <StatTile isRTL={isRTL} label={t('tech.home.doneToday', 'Done today', 'أُنجزت اليوم')} value={loading || error ? null : doneToday} />
          <StatTile isRTL={isRTL} label={t('tech.home.history', 'Job history', 'سجل المهام')} value={t('tech.home.open', 'Open', 'فتح')} onClick={() => navigate('/technician/history')} />
        </StatGrid>
        <PaymentCollectionRecordsCard />

        <ComingSoon isRTL={isRTL} title={t('tech.home.earningsSoon', 'Weekly earnings will show here', 'ستظهر أرباحك الأسبوعية هنا')} detail={t('tech.home.earningsSoonDetail', 'Your payroll records are in Profile → HR.', 'سجلات الرواتب في الملف الشخصي ← الموارد البشرية.')} />
      </Stack>
    </Box>
  );
}

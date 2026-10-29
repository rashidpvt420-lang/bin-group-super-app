import SuggestionBoxCard from '../../components/SuggestionBoxCard';
import PaymentCollectionRecordsCard from '../../components/PaymentCollectionRecordsCard';
import MoneyStatementDownload from '../../components/MoneyStatementDownload';
import { Box, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { AppHeader, ComingSoon, ErrorState, ListRow, StatGrid, StatTile, UiButton, UiCard } from '../../components/ui';
import { ui } from '../../theme/uiTokens';
import BrokerLiveAttributionCard from '../components/BrokerLiveAttributionCard';
import { useBrokerAttributionSignals } from '../hooks/useBrokerAttributionSignals';

/** Redesigned broker home (REDESIGN.md R7): numbers, add lead, pipeline links, vacancies (F6 placeholder). */
export default function BrokerSimpleDashboardPage() {
  const navigate = useNavigate();
  const { isRTL, lang, tx } = useLanguage();
  const t = (key: string, en: string, ar: string) => (lang === 'ar' ? ar : tx(key, en));
  const signals = useBrokerAttributionSignals();
  const ready = !signals.loading && !signals.error;
  const aed = (n: number) => `AED ${n.toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

  return (
    <Box data-testid="broker-home" sx={{ direction: isRTL ? 'rtl' : 'ltr', mx: { xs: -2, sm: 0 } }}>
      <AppHeader isRTL={isRTL} eyebrow={t('broker.home.eyebrow', 'Broker', 'الوسيط')} title={t('broker.home.title', 'Your deals', 'صفقاتك')} />
      <Stack spacing={1.75} sx={{ p: 2, bgcolor: ui.cream }}>
        {signals.error && <ErrorState isRTL={isRTL} title={t('broker.home.error', 'Your numbers could not load.', 'تعذر تحميل أرقامك.')} />}
        <StatGrid>
          <StatTile isRTL={isRTL} label={t('broker.home.leads', 'Active leads', 'عملاء نشطون')} value={ready ? signals.activeLeads : null} onClick={() => navigate('/broker/leads')} />
          <StatTile isRTL={isRTL} label={t('broker.home.contracts', 'Contracts signed', 'عقود موقعة')} value={ready ? signals.attributedContracts : null} onClick={() => navigate('/broker/deals')} />
          <StatTile isRTL={isRTL} label={t('broker.home.commission', 'Commission pending', 'عمولة معلقة')} value={ready ? aed(signals.pendingCommissionAmount) : null} onClick={() => navigate('/broker/commissions')} />
          <StatTile isRTL={isRTL} label={t('broker.home.referrals', 'Referrals', 'الإحالات')} value={t('broker.home.open', 'Open', 'فتح')} onClick={() => navigate('/broker/referrals')} />
        </StatGrid>

        <UiButton tone="primary" onClick={() => navigate('/broker/leads/new')}>{t('broker.home.addLead', 'Add a lead', 'إضافة عميل')}</UiButton>

        <UiCard isRTL={isRTL} label={t('broker.home.vacancies', 'New vacancies near you', 'وحدات شاغرة قريبة منك')}>
          <ComingSoon isRTL={isRTL} title={t('broker.home.vacanciesSoon', 'Vacancy alerts are coming', 'تنبيهات الوحدات الشاغرة قادمة')} detail={t('broker.home.vacanciesSoonDetail', 'You will see empty units in your area here as soon as owners list them.', 'سترى هنا الوحدات الشاغرة في منطقتك فور عرضها من الملاك.')} />
        </UiCard>

        <UiCard isRTL={isRTL} label={t('broker.home.next', 'Your next steps', 'خطواتك التالية')}>
          <Box sx={{ mt: 0.5 }}>
            <ListRow isRTL={isRTL} title={t('broker.home.pipeline', 'Lead pipeline', 'مسار العملاء')} subtitle={t('broker.home.protected', 'Each lead you add is protected under your name.', 'كل عميل تضيفه محمي باسمك.')} onClick={() => navigate('/broker/leads')} />
            <ListRow isRTL={isRTL} title={t('broker.home.payout', 'Payout profile', 'ملف الدفع')} subtitle={t('broker.home.payoutDetail', 'ID, RERA card and bank details for your commission.', 'الهوية وبطاقة ريرا والبيانات البنكية لعمولتك.')} onClick={() => navigate('/broker/profile')} />
            <ListRow isRTL={isRTL} title={t('broker.home.documents', 'Documents', 'المستندات')} onClick={() => navigate('/broker/documents')} />
          </Box>
        </UiCard>

        <BrokerLiveAttributionCard isRTL={isRTL} />

        <SuggestionBoxCard role="broker" />
        <PaymentCollectionRecordsCard />
        <MoneyStatementDownload />

        <Button onClick={() => navigate('/broker/dashboard/full')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', color: ui.goldText, fontWeight: 700, minHeight: ui.touchTarget }}>{t('broker.home.full', 'Open full dashboard', 'فتح اللوحة الكاملة')}</Button>
      </Stack>
    </Box>
  );
}

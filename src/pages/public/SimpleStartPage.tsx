import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, Building2, HelpCircle, Home, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

type StartCard = {
  titleEn: string;
  titleAr: string;
  subtitleEn: string;
  subtitleAr: string;
  pointsEn: string[];
  pointsAr: string[];
  path: string;
  icon: React.ElementType;
  ctaEn: string;
  ctaAr: string;
};

const cards: StartCard[] = [
  {
    titleEn: 'I am a Tenant',
    titleAr: 'أنا مستأجر',
    subtitleEn: 'Report an issue, check payments, documents, emergency help, and move-in/move-out evidence.',
    subtitleAr: 'أبلغ عن مشكلة، راجع المدفوعات والمستندات والطوارئ وتسليم الوحدة.',
    pointsEn: ['Report maintenance', 'Emergency help', 'Payments & documents', 'Move-in / move-out'],
    pointsAr: ['بلاغ صيانة', 'مساعدة طارئة', 'مدفوعات ومستندات', 'تسليم الوحدة'],
    path: '/login?intendedRole=tenant',
    icon: UserRound,
    ctaEn: 'Open Tenant Portal',
    ctaAr: 'فتح بوابة المستأجر',
  },
  {
    titleEn: 'I am a Landlord / Owner',
    titleAr: 'أنا مالك',
    subtitleEn: 'See properties, contracts, rent, payments, maintenance proof, handover, and approvals.',
    subtitleAr: 'راجع العقارات والعقود والإيجار والمدفوعات وإثبات الصيانة والتسليم والموافقات.',
    pointsEn: ['Property passport', 'Payments & contracts', 'Maintenance proof', 'Approvals & handover'],
    pointsAr: ['جواز العقار', 'مدفوعات وعقود', 'إثبات الصيانة', 'موافقات وتسليم'],
    path: '/login?intendedRole=owner',
    icon: Home,
    ctaEn: 'Open Owner Portal',
    ctaAr: 'فتح بوابة المالك',
  },
  {
    titleEn: 'I am a Real Estate Broker',
    titleAr: 'أنا وسيط عقاري',
    subtitleEn: 'Bring owner leads, tenant contracts, referral proof, documents, and commission tracking.',
    subtitleAr: 'أضف ملاكاً أو مستأجرين مع إثبات الإحالة والمستندات وتتبع العمولة.',
    pointsEn: ['New referrals', 'Lead attribution', 'Documents', 'Commissions'],
    pointsAr: ['إحالات جديدة', 'إثبات مصدر الصفقة', 'مستندات', 'عمولات'],
    path: '/login?intendedRole=broker',
    icon: Building2,
    ctaEn: 'Open Broker Portal',
    ctaAr: 'فتح بوابة الوسيط',
  },
  {
    titleEn: 'I am a Technician',
    titleAr: 'أنا فني',
    subtitleEn: 'See jobs, map, proof readiness, offline queue, support, and job history.',
    subtitleAr: 'راجع المهام والخريطة وجاهزية الإثبات وقائمة دون اتصال والدعم وسجل العمل.',
    pointsEn: ['Jobs', 'Live map', 'Proof photos', 'Offline queue'],
    pointsAr: ['المهام', 'الخريطة', 'صور الإثبات', 'قائمة دون اتصال'],
    path: '/login?intendedRole=technician',
    icon: Wrench,
    ctaEn: 'Open Technician Portal',
    ctaAr: 'فتح بوابة الفني',
  },
];

const helperLinks = [
  { labelEn: 'Company Profile', labelAr: 'ملف الشركة', path: '/company-profile' },
  { labelEn: 'Controlled Pilot', labelAr: 'تجربة محدودة', path: '/share' },
  { labelEn: 'Support', labelAr: 'الدعم', path: '/support' },
  { labelEn: 'Privacy', labelAr: 'الخصوصية', path: '/privacy' },
  { labelEn: 'Terms', labelAr: 'الشروط', path: '/terms' },
  { labelEn: 'Admin / Staff Access', labelAr: 'دخول الإدارة والموظفين', path: '/login?intendedRole=admin' },
];

export default function SimpleStartPage() {
  const navigate = useNavigate();
  const { isRTL, lang } = useLanguage();
  const ar = lang === 'ar';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', direction: isRTL ? 'rtl' : 'ltr', py: { xs: 4, md: 7 } }}>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.11)}, #FFFFFF)`, boxShadow: '0 22px 56px rgba(17,24,39,0.08)' }}>
            <Stack spacing={2} alignItems="flex-start">
              <Chip icon={<ShieldCheck size={16} />} label={ar ? 'BIN GROUP · إدارة العقارات والصيانة' : 'BIN GROUP · Property Management & Maintenance'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.goldHover, fontWeight: 950 }} />
              <Typography variant="h2" sx={{ color: '#111827', fontWeight: 950, letterSpacing: -1.2, lineHeight: 1.08, maxWidth: 860 }}>
                {ar ? 'كيف تريد أن نساعدك اليوم؟' : 'How can we help you today?'}
              </Typography>
              <Typography sx={{ color: '#667085', fontWeight: 750, lineHeight: 1.8, maxWidth: 820 }}>
                {ar
                  ? 'اختر دورك أولاً. سنعرض لك الخيارات المناسبة فقط حتى لا تضيع داخل التطبيق.'
                  : 'Choose your role first. We will show only the options you need, so anyone can use the app without getting lost.'}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label={ar ? 'بدون اتصالات متكررة' : 'No-call workflow'} />
                <Chip label={ar ? 'إثبات بالصور' : 'Photo proof'} />
                <Chip label={ar ? 'تتبع مباشر' : 'Live tracking'} />
                <Chip label={ar ? 'عقود ومدفوعات' : 'Contracts & payments'} />
              </Stack>
            </Stack>
          </Paper>

          <Grid container spacing={2.5}>
            {cards.map((card) => (
              <Grid item xs={12} md={6} key={card.titleEn}>
                <Paper sx={{ p: 3, height: '100%', borderRadius: 5, border: '1px solid #E5E7EB', boxShadow: '0 16px 42px rgba(17,24,39,0.05)' }}>
                  <Stack spacing={2} sx={{ height: '100%' }}>
                    <Box sx={{ width: 52, height: 52, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.goldHover }}>
                      <SafeIcon icon={card.icon} size={25} />
                    </Box>
                    <Typography variant="h5" sx={{ color: '#111827', fontWeight: 950 }}>{ar ? card.titleAr : card.titleEn}</Typography>
                    <Typography sx={{ color: '#667085', fontWeight: 700, lineHeight: 1.7 }}>{ar ? card.subtitleAr : card.subtitleEn}</Typography>
                    <Grid container spacing={1} sx={{ flexGrow: 1 }}>
                      {(ar ? card.pointsAr : card.pointsEn).map((point) => (
                        <Grid item xs={6} key={point}>
                          <Typography variant="caption" sx={{ display: 'block', p: 1, borderRadius: 2, bgcolor: '#F8F9FB', color: '#475467', fontWeight: 850 }}>• {point}</Typography>
                        </Grid>
                      ))}
                    </Grid>
                    <Button fullWidth variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(card.path)} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 3, py: 1.25 }}>
                      {ar ? card.ctaAr : card.ctaEn}
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Paper sx={{ p: 3, borderRadius: 5, border: '1px solid #E5E7EB', bgcolor: '#F8F9FB' }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <HelpCircle size={28} color={binThemeTokens.goldHover} />
              <Typography sx={{ color: '#111827', fontWeight: 950 }}>{ar ? 'لست متأكداً أين تبدأ؟' : 'Not sure where to start?'}</Typography>
              <Typography sx={{ color: '#667085', lineHeight: 1.7, maxWidth: 760 }}>
                {ar
                  ? 'افتح الدعم أو ملف الشركة. الهدف هو أن يعرف المالك والمستأجر والوسيط والفني الخطوة التالية خلال أقل من دقيقة.'
                  : 'Open Support or Company Profile. The goal is for owners, tenants, brokers, and technicians to understand the next step in under one minute.'}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                {helperLinks.map((link) => (
                  <Button key={link.path} onClick={() => navigate(link.path)} sx={{ color: binThemeTokens.goldHover, fontWeight: 950, textTransform: 'none' }}>
                    {ar ? link.labelAr : link.labelEn}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

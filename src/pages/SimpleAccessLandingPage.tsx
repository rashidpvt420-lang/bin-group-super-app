import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@bin/shared';
import { Building2, Home, Landmark, LifeBuoy, LogIn, MessageSquare, Phone, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { binThemeTokens } from '../theme/binGroupTheme';
import BrandWatermark from '../components/BrandWatermark';
import { CeoContactButtons } from '../components/CeoContactButtons';

type Choice = {
  title: string;
  subtitle: string;
  route: string;
  icon: React.ReactNode;
};

const gold = binThemeTokens.gold;
const ink = '#111827';
const muted = '#667085';

export default function SimpleAccessLandingPage() {
  const navigate = useNavigate();
  const { isRTL } = useLanguage();
  const copy = (en: string, ar: string) => (isRTL ? ar : en);

  const choices: Choice[] = [
    {
      title: copy('Tenant', 'مستأجر'),
      subtitle: copy('Report issue, track technician, payments, documents, move-in/out.', 'بلاغ صيانة، تتبع الفني، المدفوعات، المستندات، تسليم الوحدة.'),
      route: '/login?role=tenant&next=/tenant/dashboard',
      icon: <UserRound size={34} />,
    },
    {
      title: copy('Landlord / Owner', 'مالك / مؤجر'),
      subtitle: copy('Add property, choose service, approve work, rent, passport, reports.', 'إضافة عقار، اختيار الخدمة، الموافقات، الإيجار، جواز العقار، التقارير.'),
      route: '/onboarding',
      icon: <Building2 size={34} />,
    },
    {
      title: copy('Real Estate / Broker', 'عقار / وسيط'),
      subtitle: copy('Submit owner leads, tenant placements, contracts and commission proof.', 'إرسال فرص الملاك، تسكين المستأجرين، العقود وإثبات العمولة.'),
      route: '/login?role=broker&next=/broker/dashboard',
      icon: <Landmark size={34} />,
    },
  ];

  const helpItems = [
    { icon: <Phone size={22} />, title: copy('Not comfortable with apps?', 'غير مرتاح للتطبيقات؟'), desc: copy('Tap WhatsApp BIN GROUP and our team can guide you step by step.', 'اضغط واتساب BIN GROUP وسيقوم فريقنا بإرشادك خطوة بخطوة.') },
    { icon: <LifeBuoy size={22} />, title: copy('Simple path only', 'مسار بسيط فقط'), desc: copy('This page shows only the first decision. Detailed tools stay inside the portal.', 'هذه الصفحة تعرض أول قرار فقط. التفاصيل داخل البوابة.') },
    { icon: <ShieldCheck size={22} />, title: copy('Safe access', 'دخول آمن'), desc: copy('Each person enters their own portal. Owners, tenants, brokers and admins do not share the same access.', 'كل شخص يدخل بوابته الخاصة. المالك والمستأجر والوسيط والأدمن لا يشاركون نفس الدخول.') },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.045} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: '#0B0B0C', color: '#fff', py: 1.2 }}>
          <Container maxWidth="lg">
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} justifyContent="center" alignItems="center">
              <Chip label={copy('BIN GROUP UAE', 'BIN GROUP الإمارات')} sx={{ bgcolor: alpha(gold, 0.14), color: gold, fontWeight: 950 }} />
              <Typography sx={{ color: 'rgba(255,255,255,.72)', fontWeight: 800, textAlign: 'center' }}>{copy('Maintenance and property management, made easier for everyone.', 'الصيانة وإدارة العقارات بطريقة أسهل للجميع.')}</Typography>
            </Stack>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 2, md: 2.5 }, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mr: isRTL ? 0 : 'auto', ml: isRTL ? 'auto' : 0 }}>
            <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 1.2 }} />
            <Typography sx={{ fontWeight: 950, letterSpacing: 1 }}>BIN GROUP</Typography>
          </Stack>
          <Button onClick={() => navigate('/company-profile')} sx={{ color: gold, fontWeight: 950 }}>{copy('Company Profile', 'ملف الشركة')}</Button>
          <Button startIcon={<LogIn size={17} />} onClick={() => navigate('/gateway')} sx={{ color: gold, fontWeight: 950 }}>{copy('Portal Login', 'دخول البوابة')}</Button>
        </Container>

        <Box sx={{ bgcolor: '#F8F9FB', borderTop: '1px solid #E5E7EB', borderBottom: '1px solid #E5E7EB', py: { xs: 5, md: 7 } }}>
          <Container maxWidth="lg">
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={6}>
                <Stack spacing={2.5} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                  <Chip label={copy('START HERE', 'ابدأ من هنا')} sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950 }} />
                  <Typography variant="h2" sx={{ fontWeight: 950, color: ink, letterSpacing: -1.4, lineHeight: 1.06 }}>
                    {copy('Choose one. We show the right options.', 'اختر خياراً واحداً. نعرض لك الخيارات المناسبة.')}
                  </Typography>
                  <Typography variant="h6" sx={{ color: muted, fontWeight: 750, lineHeight: 1.65 }}>
                    {copy('The full app is powerful, but this first screen is simple: Tenant, Landlord / Owner, or Real Estate / Broker.', 'التطبيق قوي ومليء بالميزات، لكن هذه الشاشة بسيطة: مستأجر، مالك، أو وسيط عقاري.')}
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                    <CeoContactButtons />
                    <Button startIcon={<MessageSquare size={18} />} onClick={() => navigate('/company-profile')} sx={{ color: ink, fontWeight: 900 }}>{copy('Explain services', 'شرح الخدمات')}</Button>
                  </Stack>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <Stack spacing={2}>
                  {choices.map((choice) => (
                    <Paper key={choice.title} onClick={() => navigate(choice.route)} sx={{ p: 2.5, borderRadius: 4, cursor: 'pointer', bgcolor: '#fff', border: `1px solid ${alpha(gold, 0.18)}`, boxShadow: '0 12px 30px rgba(17,24,39,0.06)', transition: 'transform .16s ease, border-color .16s ease', '&:hover': { transform: 'translateY(-2px)', borderColor: alpha(gold, 0.5) } }}>
                      <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                        <Box sx={{ width: 62, height: 62, borderRadius: 3, bgcolor: alpha(gold, 0.11), color: gold, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{choice.icon}</Box>
                        <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                          <Typography variant="h5" sx={{ color: ink, fontWeight: 950 }}>{choice.title}</Typography>
                          <Typography sx={{ color: muted, fontWeight: 750, mt: 0.4 }}>{choice.subtitle}</Typography>
                        </Box>
                        <Button variant="contained" sx={{ bgcolor: gold, color: '#000', fontWeight: 950, display: { xs: 'none', sm: 'inline-flex' }, '&:hover': { bgcolor: '#E5C86B' } }}>{copy('Open', 'فتح')}</Button>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 } }}>
          <Grid container spacing={2.5}>
            {helpItems.map((item) => (
              <Grid item xs={12} md={4} key={item.title}>
                <Paper sx={{ p: 3, height: '100%', borderRadius: 4, border: '1px solid #E5E7EB', boxShadow: '0 10px 26px rgba(17,24,39,0.04)' }}>
                  <Box sx={{ color: gold, mb: 1 }}>{item.icon}</Box>
                  <Typography sx={{ color: ink, fontWeight: 950, mb: 1 }}>{item.title}</Typography>
                  <Typography sx={{ color: muted, fontWeight: 700, lineHeight: 1.65 }}>{item.desc}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Container>

        <Box sx={{ bgcolor: '#111827', color: '#fff', py: 4 }}>
          <Container maxWidth="lg">
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }} justifyContent="space-between">
              <Box>
                <Typography sx={{ color: gold, fontWeight: 950 }}>{copy('What BIN GROUP does', 'ماذا تفعل BIN GROUP')}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.72)', fontWeight: 750, mt: 0.6 }}>{copy('We connect owners, tenants, technicians, brokers and admins with proof, approvals, GPS, documents, reports and secure access.', 'نربط الملاك والمستأجرين والفنيين والوسطاء والأدمن بإثباتات وموافقات وخرائط ومستندات وتقارير ودخول آمن.')}</Typography>
              </Box>
              <Button startIcon={<Wrench size={18} />} onClick={() => navigate('/company-profile')} variant="outlined" sx={{ color: gold, borderColor: alpha(gold, 0.45), fontWeight: 950 }}>{copy('See all services', 'عرض كل الخدمات')}</Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}

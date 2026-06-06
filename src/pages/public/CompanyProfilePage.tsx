import React, { useMemo } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import {
  Building2,
  Briefcase,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Home,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  WalletCards,
  Wrench,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'Ceo@bin-groups.com' };
const ink = '#111827';
const muted = '#667085';
const line = '#E8E3D7';
const platinum = '#F8F9FB';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { section: 3, card: 2.25, button: 2 };

const watermarkSx = {
  position: 'fixed',
  top: '50%',
  left: '50%',
  width: { xs: '82vw', md: '44vw' },
  maxWidth: 680,
  transform: 'translate(-50%, -50%)',
  opacity: 0.055,
  filter: 'grayscale(1) sepia(1) saturate(1.25)',
  pointerEvents: 'none',
  zIndex: 0,
};

function getCopy(lang: 'en' | 'ar') {
  const ar = lang === 'ar';
  return {
    ar,
    brand: ar ? 'مجموعة بن' : 'BIN GROUP',
    navHome: ar ? 'الرئيسية' : 'Home',
    navStart: ar ? 'ابدأ تفاصيل العقار' : 'Start Property Details',
    navQuote: ar ? 'عرض سعر فوري' : 'Get Instant Quote',
    navDemo: ar ? 'العرض التوضيحي' : 'Demo Reel',
    title: ar ? 'BIN GROUP - الصيانة العامة وإدارة العقارات' : 'BIN GROUP - General Maintenance & Property Management',
    subtitle: ar
      ? 'صفحة واحدة رسمية تعرض الشركة، نموذج التشغيل، الخدمات، العرض التوضيحي، إثبات العمل، وتواصل الإدارة.'
      : 'One official profile for the company, operating model, services, demo reel, proof workflow, and executive contact.',
    badge1: ar ? 'جذور من العين منذ 2010' : 'Rooted in Al Ain since 2010',
    badge2: ar ? 'شركة مرخصة في الإمارات' : 'Licensed UAE Company',
    badge3: ar ? 'صيانة + إدارة عقارات' : 'Maintenance + Property Management',
    request: ar ? 'طلب عقد أو عرض سعر' : 'Request Contract or Quote',
    whatsapp: ar ? 'تواصل عبر واتساب' : 'WhatsApp BIN GROUP',
    licenceTitle: ar ? 'الرخصة ونموذج التشغيل' : 'Licence & Operating Model',
    licence: ar
      ? 'All Kind Building Projects Contracting - L.L.C - S.P.C | يتم عرض رقم الرخصة التجارية وجهة الإصدار وتاريخ الانتهاء داخل التطبيق عند التفعيل النهائي.'
      : 'All Kind Building Projects Contracting - L.L.C - S.P.C | Trade licence number, issuing authority, and expiry date should be displayed in the app before final public launch.',
    aboutTitle: ar ? 'من نحن' : 'About the Company',
    about: ar
      ? 'بدأت BIN GROUP كعمل محلي صغير في مدينة العين عام 2010، يقدم خدمات عملية في الصيانة ومتابعة احتياجات العقارات اليومية. واليوم تطورت الشركة إلى مرحلة شركة مرخصة ومنظمة، تجمع بين الخبرة الميدانية والخدمة المهنية والسجلات الرقمية الواضحة. نعمل لخدمة الملاك والمستأجرين والعقارات السكنية والتجارية بطريقة أكثر شفافية وتنظيماً.'
      : 'BIN GROUP began as a small local maintenance operation in Al Ain in 2010, supporting practical property-care needs in the local market. Today, the company has moved into a licensed and structured LLC phase, combining field experience, professional service standards, and clear digital records. We support owners, tenants, and residential or commercial properties with a more transparent and organised service model.',
    servicesTitle: ar ? 'خدماتنا' : 'Our Services',
    services: ar
      ? [
          ['عقود الصيانة', 'عقود صيانة مخصصة للفيلات والشقق والمباني والفنادق والمدارس والعيادات والمكاتب والمحافظ العقارية.'],
          ['إدارة العقارات', 'تنسيق الملاك والمستأجرين، متابعة الشكاوى، سجلات الحالة، الإشراف على المقاولين، وتقارير العقار.'],
          ['تشغيل الفنيين', 'بطاقات مهام، موقع، ملاحظات سلامة، إثبات قبل وبعد، وسجل إنجاز واضح داخل التطبيق.'],
          ['جواز العقار الرقمي', 'سجل رقمي لكل عقار يشمل العقود والطلبات والفواتير والتقارير والصيانة والتحديثات.'],
        ]
      : [
          ['Maintenance Contracts', 'Custom maintenance contracts for villas, apartments, buildings, hotels, schools, clinics, offices, and property portfolios.'],
          ['Property Management', 'Owner and tenant coordination, complaint follow-up, condition records, contractor supervision, and property reporting.'],
          ['Technician Operations', 'Job cards, location context, safety notes, before-and-after proof, and clear completion records inside the app.'],
          ['Digital Property Passport', 'A digital record for each property covering contracts, requests, invoices, reports, maintenance activity, and updates.'],
        ],
    demoTitle: ar ? 'عرض BIN GROUP التشغيلي' : 'BIN GROUP Mission Demo Reel',
    demoSubtitle: ar
      ? 'عرض جاد يشرح رحلة المالك والمستأجر والفني من الطلب إلى الإثبات والتقرير.'
      : 'A serious operating demo showing the owner, tenant, technician, GPS route, evidence chain, reports, broker flow, and AI design workflow.',
    demoScenes: ar
      ? [
          ['تطبيق المالك', 'عرض السعر، العقد، خطة الدفع، لوحة التحكم.'],
          ['طلب المستأجر', 'طلب خدمة مع صورة، أولوية، وتتبع الحالة.'],
          ['مسار الفني GPS', 'توجيه أقرب فني موثق إلى العقار.'],
          ['إثبات قبل وبعد', 'صور قبل وبعد قبل إغلاق الخدمة أو تحرير الدفع.'],
          ['العقود والتقارير', 'عقد PDF، فاتورة، تقرير، وسجل العقار.'],
          ['استوديو التصميم AI', 'خيارات داخلية وخارجية قبل موافقة المالك.'],
        ]
      : [
          ['Owner App', 'Quote, contract, payment plan, and active dashboard.'],
          ['Tenant Photo Request', 'Service request with image, priority, and status tracking.'],
          ['GPS Route Map', 'Nearest verified technician routed to the property.'],
          ['Before / After Evidence', 'Visual proof before closeout or payment release.'],
          ['Contracts & Reports', 'PDF contract, invoice, report, and property history.'],
          ['AI Design Studio', 'Interior and exterior concept options before owner approval.'],
        ],
    innovationTitle: ar ? 'الابتكار والعمليات بدون أوراق' : 'Innovation & Paperless Operations',
    innovation: ar
      ? 'تعمل BIN GROUP على تطوير نظام خدمة ذاتية للموظفين مصمم لفرق الصيانة وإدارة العقارات في الإمارات. يساعد النظام الموظفين على طلب الإجازات، رفع المستندات، متابعة الحضور، مراجعة المهام، طلب خطابات الموارد البشرية، تتبع مستندات الامتثال، رفع ملاحظات السلامة، وطلب الأدوات ومعدات الوقاية بدون معاملات ورقية.'
      : 'BIN GROUP is developing a staff self-service system designed for UAE maintenance and property management field teams. The system helps employees request leave, upload documents, review attendance context, track assigned jobs, request HR letters, manage compliance documents, report safety issues, and request tools or PPE without manual paperwork.',
    proofTitle: ar ? 'كيف نبني الثقة' : 'How We Build Trust',
    proof: ar
      ? ['عرض بيانات الشركة والرخصة بوضوح', 'نطاق خدمة واضح بدون مبالغات', 'صور قبل وبعد وتقارير قابلة للمراجعة', 'تواصل مباشر عبر الهاتف والواتساب والبريد الإلكتروني', 'دعم ثنائي اللغة مع واجهة عربية RTL']
      : ['Clear company and licence information', 'Defined service scope without exaggeration', 'Before-and-after proof and reviewable reports', 'Direct phone, WhatsApp, and email contact', 'Bilingual English/Arabic support with RTL Arabic layout'],
    missionTitle: ar ? 'المهمة' : 'Mission',
    mission: ar
      ? 'تقديم خدمات صيانة وإدارة عقارات موثوقة تحمي ممتلكات العملاء، تقلل الضغط التشغيلي، وتوفر متابعة واضحة ومهنية من خلال السجلات الرقمية والمساءلة الميدانية.'
      : 'To deliver dependable maintenance and property management services that protect clients’ properties, reduce operational stress, and improve daily property care through clear communication, digital records, and accountable field execution.',
    contactTitle: ar ? 'تواصل الإدارة' : 'Executive Contact',
    location: ar ? 'العين، الإمارات العربية المتحدة' : 'Al Ain, United Arab Emirates',
    footer: ar ? 'عناية موثوقة بالعقارات، بجذور من مدينة العين.' : 'Trusted maintenance and property care, rooted in Al Ain.',
  };
}

function TrustChip({ label }: { label: string }) {
  return <Chip label={label} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, 0.12), color: '#6F5522', border: `1px solid ${alpha(gold, 0.22)}`, fontWeight: 950 }} />;
}

function NavButton({ children, onClick, contained = false, icon }: { children: React.ReactNode; onClick: () => void; contained?: boolean; icon?: React.ReactNode }) {
  return (
    <Button
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 46,
        px: 2.2,
        borderRadius: radius.button,
        fontWeight: 950,
        color: contained ? '#111827' : gold,
        border: contained ? 'none' : `1px solid ${alpha(gold, 0.38)}`,
        background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#FFFFFF',
        boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : 'none',
      }}
    >
      {children}
    </Button>
  );
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const copy = useMemo(() => getCopy(lang), [lang]);
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const textAlign = isRTL ? 'right' : 'left';
  const icons = [<Wrench key="wrench" />, <Briefcase key="briefcase" />, <Users key="users" />, <FileText key="file" />];
  const demoIcons = [<Building2 key="owner" />, <Camera key="tenant" />, <Navigation key="gps" />, <ClipboardCheck key="evidence" />, <FileText key="docs" />, <Sparkles key="ai" />];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <Box component="img" src="/logo.png" alt="" aria-hidden="true" sx={watermarkSx} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
            <Button onClick={() => navigate('/')} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1, boxShadow: '0 10px 22px rgba(17,24,39,.10)' }} />
                <Typography fontWeight={950}>{copy.brand}</Typography>
              </Stack>
            </Button>
            <NavButton onClick={() => navigate('/')} icon={<Home size={17} />}>{copy.navHome}</NavButton>
            <NavButton onClick={() => navigate('/onboarding')} contained>{copy.navStart}</NavButton>
            <NavButton onClick={() => navigate('/onboarding?intent=quote')} icon={<WalletCards size={17} />}>{copy.navQuote}</NavButton>
            <NavButton onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} icon={<PlayCircle size={17} />}>{copy.navDemo}</NavButton>
          </Container>
        </Box>

        <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${line}`, background: `linear-gradient(135deg, ${platinum} 0%, #FFFFFF 58%, ${alpha(gold, 0.08)} 100%)` }}>
          <Container maxWidth="lg" sx={{ py: { xs: 7, md: 12 } }}>
            <Grid container spacing={5} alignItems="center">
              <Grid item xs={12} md={7}>
                <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                    <TrustChip label={copy.badge1} />
                    <TrustChip label={copy.badge2} />
                    <TrustChip label={copy.badge3} />
                  </Stack>
                  <Typography variant="h1" fontWeight={950} sx={{ fontSize: { xs: '2.35rem', md: '4rem' }, lineHeight: 1, textAlign }}>{copy.title}</Typography>
                  <Typography variant="h5" sx={{ color: muted, fontWeight: 750, lineHeight: 1.6, textAlign, maxWidth: 820 }}>{copy.subtitle}</Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ borderRadius: radius.button, bgcolor: gold, color: '#111827', fontWeight: 950, px: 4, py: 1.5 }}>{copy.request}</Button>
                    <Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderRadius: radius.button, color: ink, borderColor: '#D6C99F', fontWeight: 950, px: 4, py: 1.5 }}>{copy.whatsapp}</Button>
                  </Stack>
                </Stack>
              </Grid>
              <Grid item xs={12} md={5}>
                <Paper sx={{ p: 4, borderRadius: radius.section, bgcolor: 'rgba(255,255,255,.88)', border: `1px solid ${line}`, boxShadow: '0 24px 70px rgba(17,24,39,.08)' }}>
                  <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                    <ShieldCheck color={gold} size={42} />
                    <Typography variant="caption" sx={{ color: muted, fontWeight: 950 }}>{copy.licenceTitle}</Typography>
                    <Typography sx={{ fontWeight: 850, lineHeight: 1.8, textAlign }}>{copy.licence}</Typography>
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
              <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, border: `1px solid ${line}`, boxShadow: '0 18px 48px rgba(17,24,39,.06)', bgcolor: 'rgba(255,255,255,.92)' }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Building2 color={gold} size={36} />
                  <Typography variant="h3" fontWeight={950} sx={{ textAlign }}>{copy.aboutTitle}</Typography>
                  <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.95, textAlign }}>{copy.about}</Typography>
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: { xs: 3, md: 5 }, height: '100%', borderRadius: radius.section, border: `1px solid ${line}`, boxShadow: '0 18px 48px rgba(17,24,39,.06)', bgcolor: 'rgba(255,255,255,.92)' }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Sparkles color={gold} size={36} />
                  <Typography variant="h4" fontWeight={950} sx={{ textAlign }}>{copy.missionTitle}</Typography>
                  <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.9, textAlign }}>{copy.mission}</Typography>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        <Box sx={{ py: 8, bgcolor: platinum, borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Typography variant="h2" fontWeight={950} sx={{ textAlign: 'center', mb: 5 }}>{copy.servicesTitle}</Typography>
            <Grid container spacing={3}>
              {copy.services.map((service, index) => (
                <Grid item xs={12} md={3} key={service[0]}>
                  <Card sx={{ height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, boxShadow: '0 16px 40px rgba(17,24,39,.05)' }}>
                    <CardContent sx={{ p: 3, textAlign }}>
                      <Box sx={{ color: gold, mb: 2 }}>{icons[index]}</Box>
                      <Typography variant="h6" fontWeight={950}>{service[0]}</Typography>
                      <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, mt: 1 }}>{service[1]}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        <Box id="demo" sx={{ scrollMarginTop: 96, py: 8 }}>
          <Container maxWidth="lg">
            <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, border: `1px solid ${line}`, bgcolor: '#FFFFFF', boxShadow: '0 22px 60px rgba(17,24,39,.07)' }}>
              <Grid container spacing={4} alignItems="center">
                <Grid item xs={12} md={5}>
                  <Chip label={copy.navDemo} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
                  <Typography variant="h2" fontWeight={950} sx={{ color: ink, letterSpacing: '-0.04em', mb: 2, textAlign }}>{copy.demoTitle}</Typography>
                  <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 750, textAlign }}>{copy.demoSubtitle}</Typography>
                  <Button onClick={() => navigate('/request-demo')} startIcon={<PlayCircle size={19} />} sx={{ mt: 3, borderRadius: radius.button, bgcolor: gold, color: '#111827', fontWeight: 950, px: 3, py: 1.3 }}>
                    {copy.navDemo}
                  </Button>
                </Grid>
                <Grid item xs={12} md={7}>
                  <Grid container spacing={2}>
                    {copy.demoScenes.map((scene, idx) => (
                      <Grid item xs={12} sm={6} key={scene[0]}>
                        <Paper sx={{ p: 2.4, height: '100%', minHeight: 148, borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: idx % 2 ? '#FFFFFF' : platinum }}>
                          <Stack direction="row" spacing={1.5} alignItems="flex-start">
                            <Box sx={{ color: gold, mt: .35 }}>{demoIcons[idx]}</Box>
                            <Box>
                              <Typography fontWeight={950} sx={{ color: ink }}>{scene[0]}</Typography>
                              <Typography variant="body2" sx={{ color: muted, fontWeight: 700, lineHeight: 1.65, mt: .8 }}>{scene[1]}</Typography>
                            </Box>
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Grid>
              </Grid>
            </Paper>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ pb: 8 }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={7}>
              <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, border: `1px solid ${line}`, boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Typography variant="h3" fontWeight={950} sx={{ textAlign }}>{copy.innovationTitle}</Typography>
                  <Typography sx={{ color: '#475467', fontWeight: 650, lineHeight: 1.95, textAlign }}>{copy.innovation}</Typography>
                </Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: { xs: 3, md: 5 }, height: '100%', borderRadius: radius.section, border: `1px solid ${line}`, boxShadow: '0 18px 48px rgba(17,24,39,.06)' }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Typography variant="h4" fontWeight={950} sx={{ textAlign }}>{copy.proofTitle}</Typography>
                  {copy.proof.map((item) => (
                    <Stack key={item} direction={isRTL ? 'row-reverse' : 'row'} spacing={1.3} alignItems="center" sx={{ width: '100%' }}>
                      <CheckCircle2 size={18} color={gold} />
                      <Typography sx={{ color: '#475467', fontWeight: 800, textAlign }}>{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        <Container maxWidth="lg" sx={{ pb: 9 }}>
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: radius.section, bgcolor: '#111827', color: '#fff' }}>
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={6}>
                <Typography variant="h3" fontWeight={950} sx={{ color: gold, textAlign }}>{copy.contactTitle}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.72)', fontWeight: 800, mt: 1, textAlign }}>{copy.footer}</Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Phone size={18} color={gold} /><Typography>{CONTACT.phone}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MessageSquare size={18} color={gold} /><Typography>{CONTACT.whatsapp}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Mail size={18} color={gold} /><Typography>{CONTACT.email}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><MapPin size={18} color={gold} /><Typography>{copy.location}</Typography></Stack>
                  <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center"><Timer size={18} color={gold} /><Typography>Owner request → quote → contract → verified service record</Typography></Stack>
                </Stack>
              </Grid>
            </Grid>
          </Paper>
        </Container>
      </Box>
    </Box>
  );
}

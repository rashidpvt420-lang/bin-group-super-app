import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import {
  Award, Bot, Briefcase, Building2, Camera, CheckCircle2, FileText, Globe, LogIn, Mail,
  MapPin, MessageCircle, Phone, ShieldCheck, Sparkles, Users, WalletCards, Workflow, Wrench, Zap,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrandWatermark from '../../components/BrandWatermark';

type PublicMarketingPageKey =
  | 'home' | 'owners' | 'tenants' | 'technicians' | 'brokers'
  | 'property-management' | 'maintenance' | 'majlis-care' | 'stadiums'
  | 'hotels' | 'malls' | 'hospitals' | 'government-properties' | 'security' | 'contact';

type PublicMarketingPageProps = { page?: PublicMarketingPageKey };
type CopyShape = typeof copy.en;

const WHATSAPP_URL = 'https://wa.me/971552423233';
const WHATSAPP_DIGITS = '971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';
const LOGIN_URL = '/login';
const CONTACT = { phone: '+971 55 7474560', whatsapp: '+971 55 2423233', email: 'ceo@bin-groups.com' };

const ink = '#111827';
const muted = '#5B6270';
const canvas = '#FFFFFF';
const platinum = '#F7F7F4';
const line = '#E8E3D7';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { outer: 3, card: 2.25, button: 2 };

const SERVICE_AREAS = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

const SERVICES_EN = [
  { icon: <Wrench size={20} />, title: 'Annual Maintenance Contracts', desc: 'Custom contracts for villas, apartments, towers, hotels, offices, and large portfolios.' },
  { icon: <Building2 size={20} />, title: 'Property Management', desc: 'Owner & tenant coordination, lease context, vendor supervision, condition records.' },
  { icon: <Users size={20} />, title: 'Total Care Hybrid', desc: 'Full property-care combining maintenance, tenant service, technician execution, digital history.' },
  { icon: <Zap size={20} />, title: 'Technician Dispatch', desc: 'GPS-routed field execution with job cards, SLA expectations, and before-and-after proof.' },
  { icon: <ShieldCheck size={20} />, title: 'Workforce Self-Service', desc: 'Paperless multilingual staff ESS: leave, overtime, payslip support, HR letters.' },
  { icon: <Sparkles size={20} />, title: 'AI Property Intelligence', desc: 'AI-assisted quote logic, property classification, predictive maintenance, portfolio decisions.' },
  { icon: <Briefcase size={20} />, title: 'Digital Compliance Passport', desc: 'Visa, ID, passport, medical card, certifications, and dispatch-readiness in one dossier.' },
  { icon: <Award size={20} />, title: 'Owner Trust & Proof', desc: 'Quote path, contract record, 15% mobilization, GPS evidence, photo proof, and reports.' },
];

const SERVICES_AR = [
  { icon: <Wrench size={20} />, title: 'عقود الصيانة السنوية', desc: 'عقود مخصصة للفلل، الشقق، الأبراج، الفنادق، المكاتب، والمحافظ الكبيرة.' },
  { icon: <Building2 size={20} />, title: 'إدارة العقارات', desc: 'تنسيق بين المالك والمستأجر، سياق الإيجار، الإشراف على الموردين، سجلات الحالة.' },
  { icon: <Users size={20} />, title: 'التعاقد الشامل', desc: 'رعاية عقارية شاملة تجمع الصيانة وخدمة المستأجر وتنفيذ الفني والتاريخ الرقمي.' },
  { icon: <Zap size={20} />, title: 'إرسال الفنيين', desc: 'تنفيذ ميداني عبر GPS مع بطاقات العمل وتوقعات SLA وإثبات قبل وبعد.' },
  { icon: <ShieldCheck size={20} />, title: 'الخدمة الذاتية للموظفين', desc: 'خدمة ذاتية متعددة اللغات: إجازة، أوفر تايم، دعم كشف الراتب، خطابات الموارد البشرية.' },
  { icon: <Sparkles size={20} />, title: 'ذكاء العقارات بالذكاء الاصطناعي', desc: 'منطق عروض الأسعار بالذكاء الاصطناعي، تصنيف العقارات، الصيانة التنبؤية.' },
  { icon: <Briefcase size={20} />, title: 'جواز الامتثال الرقمي', desc: 'التأشيرة، الهوية، جواز السفر، البطاقة الصحية، والشهادات في ملف واحد.' },
  { icon: <Award size={20} />, title: 'ثقة المالك والإثبات', desc: 'مسار عرض الأسعار، سجل العقد، 15% تعبئة، أدلة GPS، صور إثبات، وتقارير.' },
];

const copy = {
  en: {
    brand: 'BIN GROUP',
    chip: 'UAE PROPERTY CARE HOME OS',
    title: 'One Operating System for Property Care, Management, and Proof.',
    desc: 'BIN GROUP gives serious UAE property owners a unified Home OS: property details, instant quote, contract selection, 15% mobilization, tenant registry, rent ledger waterfall, 5% management fee logic, technician dispatch, SLA timers, before-and-after proof, owner reports, and permanent property passport history.',
    primary: 'Start Property Details',
    quote: 'Get Instant Quote',
    login: 'Portal Login',
    whatsapp: 'WhatsApp BIN GROUP',
    flow: 'Owner journey: details → quote → contract → service tracking → verified payout record',
    command: [
      ['Home OS Intake', 'One intelligent prompt instead of scattered calls', 'START'],
      ['Instant Quote', 'Maintenance, management, or hybrid contract scope', 'QUOTE'],
      ['Total Care Hybrid', 'Tenant registry, rent ledger waterfall, 5% fee logic', 'CARE'],
      ['No-Call Operations', 'AI triage, SLA timers, photo proof, owner reports', 'LIVE'],
    ],
    aboutChip: 'COMPANY PROFILE',
    aboutTitle: 'About BIN GROUP',
    aboutDesc: 'BIN GROUP was founded in 2010 in Al Ain, Abu Dhabi Emirate, delivering reliable, documented property maintenance and management services to UAE property owners. We grew from local maintenance projects into a full operating system connecting owners, tenants, technicians, and brokers in one digital platform.',
    aboutLicense: 'All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE · Est. 2010 · Al Ain',
    missionTitle: 'Our Mission',
    mission: 'To deliver dependable maintenance and property management services that protect client properties, reduce operational stress, and provide full visibility through digital records and accountable field execution.',
    visionTitle: 'Our Vision',
    vision: 'To become a trusted UAE property-care company starting from Al Ain, known for reliable maintenance, transparent property management, smart digital operations, and long-term client relationships.',
    servicesTitle: 'Our Services',
    areasTitle: 'Service Areas',
    areasDesc: 'BIN GROUP operates across all UAE emirates, with primary focus on Al Ain and Abu Dhabi.',
    trustTitle: 'How We Build Trust',
    trust: [
      'Clear company and licence information displayed',
      'Defined service scope with no exaggerated promises',
      'Before-and-after proof on every job completed',
      'Direct phone, WhatsApp, and email contact',
      'Full bilingual English/Arabic support',
      'Digital records for every property and every intervention',
    ],
    contactTitle: 'Contact BIN GROUP',
    contactDesc: 'Reach us directly for quotes, maintenance contracts, or any property management enquiry.',
    inquiryTitle: 'Start the correct contract path',
    inquiryDesc: 'Send the property profile and BIN GROUP prepares the right maintenance, property management, or Total Care Hybrid package for your asset.',
  },
  ar: {
    brand: 'مجموعة بن',
    chip: 'نظام تشغيل العناية بالعقار في الإمارات',
    title: 'نظام تشغيل واحد للعناية بالعقار وإدارته وإثبات الخدمة.',
    desc: 'مجموعة بن تمنح ملاك العقارات في الإمارات نظام Home OS موحد: تفاصيل العقار، عرض سعر فوري، اختيار العقد، دفعة تفعيل 15٪، سجل المستأجرين، دفتر الإيجارات، منطق رسوم الإدارة 5٪، إرسال الفنيين، مؤقتات SLA، إثبات قبل وبعد، تقارير المالك، وسجل جواز العقار الدائم.',
    primary: 'ابدأ تفاصيل العقار',
    quote: 'احصل على عرض سعر فوري',
    login: 'دخول البوابة',
    whatsapp: 'تواصل عبر واتساب',
    flow: 'رحلة المالك: تفاصيل ← عرض سعر ← عقد ← تتبع الخدمة ← سجل دفع موثق',
    command: [
      ['إدخال Home OS', 'طلب ذكي واحد بدل الاتصالات المتفرقة', 'ابدأ'],
      ['عرض سعر فوري', 'صيانة أو إدارة أو نطاق هجين', 'سعر'],
      ['Total Care Hybrid', 'سجل المستأجرين ودفتر الإيجارات ومنطق 5٪', 'رعاية'],
      ['تشغيل بدون اتصالات', 'تصنيف ذكي، SLA، إثبات صور، تقارير المالك', 'مباشر'],
    ],
    aboutChip: 'ملف الشركة',
    aboutTitle: 'عن مجموعة BIN GROUP',
    aboutDesc: 'تأسست مجموعة BIN GROUP عام 2010 في مدينة العين، إمارة أبوظبي، بهدف تقديم خدمات صيانة وإدارة عقارات موثوقة وموثقة لأصحاب العقارات في دولة الإمارات. بدأنا بمشاريع صيانة محلية وتطورنا إلى نظام تشغيل متكامل يربط الملاك والمستأجرين والفنيين والوسطاء في منصة رقمية واحدة.',
    aboutLicense: 'All Kind Building Projects Contracting LLC S.P.C · مرخصة في أبوظبي، الإمارات · تأسست 2010 · العين',
    missionTitle: 'مهمتنا',
    mission: 'تقديم خدمات صيانة وإدارة عقارات موثوقة تحمي ممتلكات العملاء، تُقلّل الضغط التشغيلي، وتُوفّر رؤية كاملة من خلال السجلات الرقمية والتنفيذ الميداني المُساءل.',
    visionTitle: 'رؤيتنا',
    vision: 'أن نصبح شركة رعاية عقارية موثوقة في الإمارات انطلاقاً من مدينة العين، معروفة بالصيانة الموثوقة، إدارة العقارات الشفافة، العمليات الرقمية الذكية، والعلاقات طويلة الأمد مع العملاء.',
    servicesTitle: 'خدماتنا',
    areasTitle: 'مناطق الخدمة',
    areasDesc: 'BIN GROUP تعمل في جميع إمارات الدولة، مع تركيز أساسي على العين وأبوظبي.',
    trustTitle: 'كيف نبني الثقة',
    trust: [
      'بيانات الشركة والرخصة معروضة بوضوح',
      'نطاق خدمة محدد بدون وعود مبالغ فيها',
      'إثبات قبل وبعد لكل عمل منجز',
      'تواصل مباشر عبر الهاتف والواتساب والبريد',
      'دعم كامل باللغتين العربية والإنجليزية',
      'سجلات رقمية لكل عقار وكل تدخل',
    ],
    contactTitle: 'تواصل مع BIN GROUP',
    contactDesc: 'تواصل معنا مباشرة لعروض الأسعار، عقود الصيانة، أو أي استفسار عن إدارة العقارات.',
    inquiryTitle: 'ابدأ مسار العقد الصحيح',
    inquiryDesc: 'أرسل ملف العقار لتجهز مجموعة بن مسار الصيانة أو إدارة العقار أو باقة Total Care Hybrid المناسبة للأصل.',
  },
};

export default function PublicMarketingPage({ page = 'home' }: PublicMarketingPageProps) {
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? copy.ar : copy.en;
  const services = lang === 'ar' ? SERVICES_AR : SERVICES_EN;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: canvas, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.07} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Nav c={c} />
        <Hero c={c} />
        <Trust />
        {/* ── COMPANY PROFILE (embedded inline) ── */}
        <AboutSection c={c} />
        <ServicesSection c={c} services={services} />
        <ServiceAreasSection c={c} />
        <TrustSection c={c} />
        <ContactSection c={c} />
        <InquirySection c={c} />
      </Box>
    </Box>
  );
}

function ActionButton({ children, href, icon, contained = false, onClick }: { children: React.ReactNode; href?: string; icon?: React.ReactNode; contained?: boolean; onClick?: () => void }) {
  return (
    <Button
      component={href ? 'a' : 'button'}
      href={href}
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 48, px: 2.5, py: 1.2, borderRadius: radius.button, fontWeight: 950,
        textDecoration: 'none',
        color: contained ? '#111' : gold,
        border: contained ? 'none' : `1px solid ${alpha(gold, 0.42)}`,
        background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#fff',
        boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : `0 8px 20px ${alpha('#000', 0.045)}`,
        '&:hover': { background: contained ? `linear-gradient(135deg, ${gold}, ${goldLight})` : alpha(gold, 0.08), transform: 'translateY(-1px)' },
      }}
    >{children}</Button>
  );
}

function Nav({ c }: { c: CopyShape }) {
  const { lang, setLang } = useLanguage();
  const [logoError, setLogoError] = React.useState(false);
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="xl" sx={{ py: 1.15, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
        <Button component="a" href="#about" sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto', textDecoration: 'none' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            {logoError ? (
              <Box sx={{ width: 44, height: 44, borderRadius: 1.2, bgcolor: alpha(gold, 0.12), border: `1px solid ${alpha(gold, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: gold, fontWeight: 950, fontSize: 15 }}>BG</Box>
            ) : (
              <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 1.2, boxShadow: `0 10px 22px ${alpha('#000', 0.10)}`, bgcolor: '#fff' }} onError={() => setLogoError(true)} />
            )}
            <Typography fontWeight={950} sx={{ color: ink }}>{c.brand}</Typography>
          </Stack>
        </Button>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
          <ActionButton href={LOGIN_URL} icon={<LogIn size={17} />}>{c.login}</ActionButton>
          <ActionButton onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} icon={<Globe size={17} />}>
            {lang === 'ar' ? 'EN' : 'AR'}
          </ActionButton>
        </Stack>
      </Container>
    </Box>
  );
}

function Hero({ c }: { c: CopyShape }) {
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${line}` }}>
      <Box sx={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${platinum} 0%, #FFFFFF 54%, ${alpha(gold, 0.08)} 100%)` }} />
      <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1, py: { xs: 5, md: 10 } }}>
        <Grid container spacing={4} alignItems="center">
          <Grid item xs={12} md={7}>
            <Chip label={c.chip} sx={{ mb: 3, borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#5E4A1F', fontWeight: 950, border: `1px solid ${alpha(gold, 0.20)}` }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 72 }, lineHeight: 1.02, fontWeight: 950, mb: 3, color: ink, letterSpacing: '-0.055em' }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: muted, lineHeight: 1.62, fontWeight: 750, maxWidth: 920 }}>{c.desc}</Typography>
            <Stack direction="row" spacing={1.5} sx={{ mt: 4, flexWrap: 'wrap', gap: 1.5 }}>
              <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
              <ActionButton href={QUOTE_URL}>{c.quote}</ActionButton>
              <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
            </Stack>
            <Typography variant="caption" sx={{ mt: 3, display: 'block', color: muted, fontWeight: 900 }}>{c.flow}</Typography>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2, borderRadius: radius.outer, bgcolor: 'rgba(255,255,255,0.88)', border: `1px solid ${line}`, boxShadow: `0 22px 54px ${alpha('#000', 0.09)}` }}>
              <Stack spacing={1.25}>
                {c.command.map((row) => (
                  <Paper key={row[0]} sx={{ p: 2, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, boxShadow: `0 8px 20px ${alpha('#000', 0.035)}` }}>
                    <Stack direction="row" spacing={2} justifyContent="space-between" alignItems="center">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={950} sx={{ color: ink }}>{row[0]}</Typography>
                        <Typography variant="caption" sx={{ color: muted, fontWeight: 750 }}>{row[1]}</Typography>
                      </Box>
                      <Chip label={row[2]} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .13), color: '#6F5522', fontWeight: 950 }} />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function Trust() {
  const items = [
    ['15%', 'Mobilization gate before activation'],
    ['5%', 'Management fee waterfall logic'],
    ['SLA', 'Timers, proof, escalation'],
    ['UAE', 'Asset-adaptive PropTech operations'],
  ];
  return (
    <Grid container spacing={2.2} sx={{ mt: -3, mb: 4, px: { xs: 2, xl: 6 }, position: 'relative', zIndex: 2 }}>
      {items.map((item) => (
        <Grid item xs={12} sm={6} md={3} key={item[0]}>
          <Paper sx={{ p: 2.4, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, boxShadow: `0 12px 28px ${alpha('#000', 0.055)}` }}>
            <Typography variant="h4" fontWeight={950} sx={{ color: gold }}>{item[0]}</Typography>
            <Typography variant="caption" sx={{ color: muted, fontWeight: 900 }}>{item[1]}</Typography>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}

/* ── ABOUT BIN GROUP ── */
function AboutSection({ c }: { c: CopyShape }) {
  const [logoError, setLogoError] = React.useState(false);
  const stats = [['2010', 'Founded'], ['+500', 'Properties'], ['8', 'Emirates'], ['15+', 'Years']];
  return (
    <Box id="about" sx={{ scrollMarginTop: 80, py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', borderBottom: `1px solid ${alpha(gold, 0.2)}`, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.025)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.025)} 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none' }} />
      <Box sx={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%,-50%)', width: 500, height: 500, background: `radial-gradient(circle, ${alpha(gold, 0.1)} 0%, transparent 65%)`, borderRadius: '50%', pointerEvents: 'none' }} />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 2 }}>
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Chip label={c.aboutChip} sx={{ mb: 2.5, bgcolor: alpha(gold, 0.12), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, 0.28)}`, letterSpacing: 2 }} />
          {/* Logo */}
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <Box sx={{ position: 'absolute', inset: -14, borderRadius: '34px', background: `radial-gradient(circle, ${alpha(gold, 0.28)} 0%, transparent 68%)` }} />
              {logoError ? (
                <Box sx={{ width: 160, height: 160, borderRadius: '24px', bgcolor: alpha(gold, 0.15), border: `2.5px solid ${alpha(gold, 0.65)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
                  <Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.5rem' }}>BG</Typography>
                </Box>
              ) : (
                <Box component="img" src="/logo.png" alt="BIN GROUP" onError={() => setLogoError(true)} sx={{ width: { xs: 140, md: 160 }, height: { xs: 140, md: 160 }, borderRadius: '24px', display: 'block', border: `2.5px solid ${alpha(gold, 0.65)}`, boxShadow: `0 0 0 6px ${alpha(gold, 0.1)}, 0 24px 72px ${alpha(gold, 0.42)}`, position: 'relative', zIndex: 1 }} />
              )}
            </Box>
          </Box>
          <Typography sx={{ color: gold, fontWeight: 950, letterSpacing: 6, fontSize: { xs: '1.6rem', md: '2.2rem' }, textTransform: 'uppercase', textShadow: `0 0 40px ${alpha(gold, 0.6)}`, mb: 0.5 }}>BIN GROUP</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.4)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: 3, mb: 3 }}>PROPERTY MAINTENANCE · MANAGEMENT · UAE</Typography>
          <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 2 }}>{c.aboutTitle}</Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.68)', fontWeight: 700, maxWidth: 760, mx: 'auto', lineHeight: 1.9 }}>{c.aboutDesc}</Typography>
          {/* Legal */}
          <Box sx={{ mt: 3, display: 'inline-block', px: 3, py: 1.2, bgcolor: alpha(gold, 0.07), border: `1px solid ${alpha(gold, 0.22)}`, borderRadius: 2.5 }}>
            <Typography variant="caption" sx={{ color: alpha(gold, 0.8), fontWeight: 800, letterSpacing: 0.5 }}>{c.aboutLicense}</Typography>
          </Box>
        </Box>

        {/* Stats */}
        <Stack direction="row" justifyContent="center" spacing={{ xs: 3, md: 6 }} sx={{ mb: 7, flexWrap: 'wrap', gap: 2 }}>
          {stats.map(([v, l]) => (
            <Box key={v} sx={{ textAlign: 'center' }}>
              <Typography sx={{ color: gold, fontWeight: 950, fontSize: { xs: '2rem', md: '2.6rem' }, lineHeight: 1.1, textShadow: `0 0 24px ${alpha(gold, 0.5)}` }}>{v}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '0.72rem', fontWeight: 800, letterSpacing: 1.5 }}>{l.toUpperCase()}</Typography>
            </Box>
          ))}
        </Stack>

        {/* Mission + Vision */}
        <Grid container spacing={3}>
          {[
            { icon: <Building2 size={22} />, title: c.missionTitle, body: c.mission },
            { icon: <Sparkles size={22} />, title: c.visionTitle, body: c.vision },
          ].map(({ icon, title, body }) => (
            <Grid item xs={12} md={6} key={title}>
              <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: 'rgba(255,255,255,.04)', border: `1px solid ${alpha(gold, 0.18)}` }}>
                <Stack spacing={2}>
                  <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2, display: 'inline-flex', color: gold }}>{icon}</Box>
                  <Typography variant="h6" fontWeight={950} sx={{ color: gold }}>{title}</Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.72)', fontWeight: 700, lineHeight: 1.9 }}>{body}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

/* ── SERVICES ── */
function ServicesSection({ c, services }: { c: CopyShape; services: typeof SERVICES_EN }) {
  const { isRTL } = useLanguage();
  return (
    <Box sx={{ py: 10, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 7 }}>
          <Typography variant="h2" fontWeight={950} sx={{ color: ink }}>{c.servicesTitle}</Typography>
        </Box>
        <Grid container spacing={3}>
          {services.map(({ icon, title, desc }) => (
            <Grid item xs={12} sm={6} md={3} key={title}>
              <Paper sx={{ p: 3.5, height: '100%', borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', transition: 'box-shadow .2s', '&:hover': { boxShadow: `0 16px 40px ${alpha(gold, 0.12)}`, borderColor: alpha(gold, 0.35) } }}>
                <Stack spacing={1.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.1), borderRadius: 2, color: '#6F5522', display: 'inline-flex' }}>{icon}</Box>
                  <Typography fontWeight={950} sx={{ color: ink }}>{title}</Typography>
                  <Typography variant="body2" sx={{ color: muted, lineHeight: 1.75 }}>{desc}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

/* ── SERVICE AREAS ── */
function ServiceAreasSection({ c }: { c: CopyShape }) {
  return (
    <Box sx={{ py: 8, bgcolor: '#111827', borderBottom: `1px solid ${alpha(gold, 0.18)}` }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h2" fontWeight={950} sx={{ color: '#FFF', mb: 1.5 }}>{c.areasTitle}</Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.58)', fontWeight: 700, maxWidth: 560, mx: 'auto' }}>{c.areasDesc}</Typography>
        </Box>
        <Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>
          {SERVICE_AREAS.map((area) => (
            <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: 'rgba(255,255,255,.05)', border: `1.5px solid ${alpha(gold, 0.28)}`, borderRadius: 2.5, transition: 'all .2s', '&:hover': { bgcolor: alpha(gold, 0.1), borderColor: alpha(gold, 0.55) } }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <MapPin size={14} color={gold} />
                <Typography sx={{ color: '#FFF', fontWeight: 850, fontSize: '0.9rem' }}>{area}</Typography>
              </Stack>
            </Box>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

/* ── TRUST ── */
function TrustSection({ c }: { c: CopyShape }) {
  const { isRTL } = useLanguage();
  return (
    <Box sx={{ py: 8, bgcolor: platinum, borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h2" fontWeight={950} sx={{ color: ink }}>{c.trustTitle}</Typography>
        </Box>
        <Grid container spacing={2} justifyContent="center">
          {c.trust.map((item) => (
            <Grid item xs={12} sm={6} md={4} key={item}>
              <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.5} alignItems="center" sx={{ p: 2.5, borderRadius: radius.card, border: `1px solid ${line}`, bgcolor: '#fff', boxShadow: `0 4px 16px ${alpha('#000', 0.045)}` }}>
                <CheckCircle2 size={20} color={gold} style={{ flexShrink: 0 }} />
                <Typography sx={{ color: '#374151', fontWeight: 800 }}>{item}</Typography>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}

/* ── CONTACT ── */
function ContactSection({ c }: { c: CopyShape }) {
  const { isRTL } = useLanguage();
  return (
    <Box sx={{ py: 9, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', borderBottom: `1px solid ${alpha(gold, 0.18)}`, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(${alpha(gold, 0.025)} 1px, transparent 1px), linear-gradient(90deg, ${alpha(gold, 0.025)} 1px, transparent 1px)`, backgroundSize: '48px 48px', pointerEvents: 'none' }} />
      <Container maxWidth="md" sx={{ position: 'relative', zIndex: 2 }}>
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="h2" fontWeight={950} sx={{ color: gold, mb: 1 }}>{c.contactTitle}</Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.6)', fontWeight: 700, maxWidth: 500, mx: 'auto' }}>{c.contactDesc}</Typography>
        </Box>
        <Grid container spacing={2.5} sx={{ mb: 5 }}>
          {[
            { icon: <Phone size={22} />, label: 'Phone', value: CONTACT.phone, href: `tel:${CONTACT.phone}` },
            { icon: <MessageCircle size={22} />, label: 'WhatsApp', value: CONTACT.whatsapp, href: `https://wa.me/${WHATSAPP_DIGITS}` },
            { icon: <Mail size={22} />, label: 'Email', value: CONTACT.email, href: `mailto:${CONTACT.email}` },
            { icon: <MapPin size={22} />, label: 'Location', value: 'Al Ain, United Arab Emirates', href: undefined },
          ].map(({ icon, label, value, href }) => (
            <Grid item xs={12} sm={6} key={label}>
              <Paper
                component={href ? 'a' : 'div'}
                {...(href ? { href, target: href.startsWith('http') ? '_blank' : undefined, rel: 'noopener noreferrer' } : {})}
                sx={{ p: 3, height: '100%', borderRadius: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, 0.22)}`, display: 'block', textDecoration: 'none', transition: 'all .2s', '&:hover': href ? { bgcolor: alpha(gold, 0.1), borderColor: alpha(gold, 0.45), transform: 'translateY(-2px)' } : {} }}
              >
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                  <Box sx={{ p: 1.2, bgcolor: alpha(gold, 0.12), borderRadius: 2, color: gold, flexShrink: 0 }}>{icon}</Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: alpha(gold, 0.7), fontWeight: 900, letterSpacing: 1.5, display: 'block' }}>{label.toUpperCase()}</Typography>
                    <Typography sx={{ color: '#FFF', fontWeight: 850, fontSize: '0.92rem' }}>{value}</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
          <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={18} />} contained>{c.whatsapp}</ActionButton>
          <ActionButton href={`mailto:${CONTACT.email}`} icon={<Mail size={18} />}>Email Us</ActionButton>
        </Stack>
      </Container>
    </Box>
  );
}

/* ── INQUIRY CTA ── */
function InquirySection({ c }: { c: CopyShape }) {
  return (
    <Box sx={{ py: 8, bgcolor: canvas }}>
      <Container maxWidth="lg">
        <Paper sx={{ p: { xs: 2.4, md: 4 }, borderRadius: radius.outer, background: `linear-gradient(135deg, ${goldLight}, ${gold})`, border: `1px solid ${alpha(gold, 0.32)}`, boxShadow: `0 22px 54px ${alpha(gold, 0.18)}` }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={8}>
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
                <Camera color="#111" />
                <Typography variant="h3" fontWeight={950} sx={{ color: '#111', letterSpacing: '-0.04em' }}>{c.inquiryTitle}</Typography>
              </Stack>
              <Typography sx={{ color: alpha('#111', .72), lineHeight: 1.75, fontWeight: 800 }}>{c.inquiryDesc}</Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Stack spacing={1.3}>
                <ActionButton href={ONBOARDING_URL}>{c.primary}</ActionButton>
                <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
              </Stack>
            </Grid>
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}

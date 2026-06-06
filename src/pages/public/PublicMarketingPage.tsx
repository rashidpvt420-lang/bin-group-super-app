import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Bot, Building2, Camera, FileText, Globe, LogIn, MessageCircle, PlayCircle, ShieldCheck, WalletCards, Workflow } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrandWatermark from '../../components/BrandWatermark';

type PublicMarketingPageKey =
  | 'home'
  | 'owners'
  | 'tenants'
  | 'technicians'
  | 'brokers'
  | 'property-management'
  | 'maintenance'
  | 'majlis-care'
  | 'stadiums'
  | 'hotels'
  | 'malls'
  | 'hospitals'
  | 'government-properties'
  | 'security'
  | 'contact';

type PublicMarketingPageProps = { page?: PublicMarketingPageKey };

type CopyShape = typeof copy.en;

const WHATSAPP_URL = 'https://wa.me/971552423233';
const COMPANY_URL = '/company';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';
const DEMO_URL = '/company#demo';
const LOGIN_URL = '/login';

const ink = '#111827';
const muted = '#5B6270';
const canvas = '#FFFFFF';
const platinum = '#F7F7F4';
const line = '#E8E3D7';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const radius = { outer: 3, card: 2.25, button: 2 };



const copy = {
  en: {
    brand: 'BIN GROUP',
    company: 'Company Profile',
    chip: 'UAE PROPERTY CARE HOME OS',
    title: 'One Operating System for Property Care, Management, and Proof.',
    desc: 'BIN GROUP gives serious UAE property owners a unified Home OS: property details, instant quote, contract selection, 15% mobilization, tenant registry, rent ledger waterfall, 5% management fee logic, technician dispatch, SLA timers, before-and-after proof, owner reports, and permanent property passport history.',
    primary: 'Start Property Details',
    quote: 'Get Instant Quote',
    login: 'Portal Login',
    demo: 'Watch Demo',
    whatsapp: 'WhatsApp BIN GROUP',
    flow: 'Owner journey: details → quote → contract → service tracking → verified payout record',
    proofTitle: 'A complete agentic PropTech ecosystem',
    proofDesc: 'BIN GROUP replaces scattered WhatsApp messages, manual invoices, missing evidence, delayed coordination, and unclear owner reporting with one audited workflow across owners, tenants, technicians, brokers, finance, and admin.',
    command: [
      ['Home OS Intake', 'One intelligent prompt instead of scattered calls', 'START'],
      ['Instant Quote', 'Maintenance, management, or hybrid contract scope', 'QUOTE'],
      ['Total Care Hybrid', 'Tenant registry, rent ledger waterfall, 5% fee logic', 'CARE'],
      ['No-Call Operations', 'AI triage, SLA timers, photo proof, owner reports', 'LIVE'],
    ],
    cards: [
      ['Home OS Concept', 'Replace scattered calls, chats, and invoices with one prompt-to-workflow operating layer.'],
      ['Total Care Hybrid', 'Handle tenant registry, rent ledger waterfall, management fee logic, maintenance deductions, and owner payout visibility.'],
      ['Sovereign Property Intelligence', 'Adapt the SOP by asset type: tower, villa, Majlis, residential building, commercial asset, or portfolio.'],
      ['Agentic No-Call Efficiency', 'Classify issues, enforce SLA timers, dispatch technicians, and require before-and-after proof automatically.'],
    ],
    pricingTitle: 'Contracts & financial logic',
    pricing: [['Maintenance', 'Custom Quote'], ['Management', '5% model'], ['Mobilization', '15% upfront'], ['Payment Plans', 'Monthly / Quarterly / Annual']],
    coverageTitle: 'Asset-adaptive operations for UAE property types',
    coverage: ['Villas', 'Apartments', 'Buildings', 'Commercial Towers', 'Hotels', 'Schools', 'Clinics', 'Hospitals', 'Offices', 'Malls', 'Private Majlis', 'Government Majlis', 'Warehouses', 'Staff Accommodation', 'Retail', 'Industrial', 'Mixed-use Assets'],
    inquiryTitle: 'Start the correct contract path',
    inquiryDesc: 'Send the property profile and BIN GROUP prepares the right maintenance, property management, or Total Care Hybrid package for your asset.',
  },
  ar: {
    brand: 'مجموعة بن',
    company: 'نبذة الشركة',
    chip: 'نظام تشغيل العناية بالعقار في الإمارات',
    title: 'نظام تشغيل واحد للعناية بالعقار وإدارته وإثبات الخدمة.',
    desc: 'مجموعة بن تمنح ملاك العقارات في الإمارات نظام Home OS موحد: تفاصيل العقار، عرض سعر فوري، اختيار العقد، دفعة تفعيل 15٪، سجل المستأجرين، دفتر الإيجارات، منطق رسوم الإدارة 5٪، إرسال الفنيين، مؤقتات SLA، إثبات قبل وبعد، تقارير المالك، وسجل جواز العقار الدائم.',
    primary: 'ابدأ تفاصيل العقار',
    quote: 'احصل على عرض سعر فوري',
    login: 'دخول البوابة',
    demo: 'شاهد العرض',
    whatsapp: 'تواصل عبر واتساب',
    flow: 'رحلة المالك: تفاصيل ← عرض سعر ← عقد ← تتبع الخدمة ← سجل دفع موثق',
    proofTitle: 'منظومة PropTech ذكية ومتكاملة',
    proofDesc: 'مجموعة بن تستبدل رسائل واتساب المتفرقة والفواتير اليدوية وغياب الإثباتات وتأخر التنسيق بتدفق عمل موثق يجمع المالك والمستأجر والفني والوسيط والمالية والإدارة.',
    command: [
      ['إدخال Home OS', 'طلب ذكي واحد بدل الاتصالات المتفرقة', 'ابدأ'],
      ['عرض سعر فوري', 'صيانة أو إدارة أو نطاق هجين', 'سعر'],
      ['Total Care Hybrid', 'سجل المستأجرين ودفتر الإيجارات ومنطق 5٪', 'رعاية'],
      ['تشغيل بدون اتصالات', 'تصنيف ذكي، SLA، إثبات صور، تقارير المالك', 'مباشر'],
    ],
    cards: [
      ['Home OS للعقار', 'استبدال الاتصالات والرسائل والفواتير المتفرقة بطبقة تشغيل موحدة.'],
      ['Total Care Hybrid', 'إدارة سجل المستأجرين ودفتر الإيجارات ورسوم الإدارة وخصومات الصيانة ووضوح التحويل للمالك.'],
      ['Sovereign Property Intelligence', 'تكييف التشغيل حسب نوع الأصل: برج، فيلا، مجلس، مبنى سكني، أصل تجاري، أو محفظة.'],
      ['كفاءة No-Call الذكية', 'تصنيف الأعطال، فرض SLA، إرسال الفنيين، وطلب إثبات قبل وبعد تلقائياً.'],
    ],
    pricingTitle: 'العقود والمنطق المالي',
    pricing: [['الصيانة', 'عرض مخصص'], ['الإدارة', 'نموذج 5٪'], ['التفعيل', '15٪ مقدماً'], ['الدفع', 'شهري / ربع سنوي / سنوي']],
    coverageTitle: 'تشغيل يتكيف مع نوع العقار في الإمارات',
    coverage: ['فلل', 'شقق', 'مبانٍ', 'أبراج تجارية', 'فنادق', 'مدارس', 'عيادات', 'مستشفيات', 'مكاتب', 'مراكز تجارية', 'مجالس خاصة', 'مجالس حكومية', 'مستودعات', 'سكن موظفين', 'محلات', 'منشآت صناعية'],
    inquiryTitle: 'ابدأ مسار العقد الصحيح',
    inquiryDesc: 'أرسل ملف العقار لتجهز مجموعة بن مسار الصيانة أو إدارة العقار أو باقة Total Care Hybrid المناسبة للأصل.',
  },
};

export default function PublicMarketingPage({ page = 'home' }: PublicMarketingPageProps) {
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? copy.ar : copy.en;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: canvas, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}>
      <BrandWatermark opacity={0.035} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Nav c={c} />
        <Hero c={c} />
        <Container maxWidth="xl" sx={{ pb: 8 }}>
          <Trust />
          <Proof c={c} />
          <Pricing c={c} />
          <Coverage c={c} />
          <Inquiry c={c} />
        </Container>
      </Box>
    </Box>
  );
}

function ActionButton({ children, href, icon, contained = false, onClick }: { children: React.ReactNode; href?: string; icon?: React.ReactNode; contained?: boolean; onClick?: () => void }) {
  return (
    <Button
      component={href ? "a" : "button"}
      href={href}
      onClick={onClick}
      startIcon={icon}
      sx={{
        minHeight: 48,
        px: 2.5,
        py: 1.2,
        borderRadius: radius.button,
        fontWeight: 950,
        textDecoration: 'none',
        color: contained ? '#111' : gold,
        border: contained ? 'none' : `1px solid ${alpha(gold, 0.42)}`,
        background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#fff',
        boxShadow: contained ? `0 12px 28px ${alpha(gold, 0.22)}` : `0 8px 20px ${alpha('#000', 0.045)}`,
        '&:hover': { background: contained ? `linear-gradient(135deg, ${gold}, ${goldLight})` : alpha(gold, 0.08), transform: 'translateY(-1px)' },
      }}
    >
      {children}
    </Button>
  );
}

function Nav({ c }: { c: CopyShape }) {
  const { lang, setLang, isRTL } = useLanguage();
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="xl" sx={{ py: 1.15, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
        <Button component="a" href="/" sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 1.2, boxShadow: `0 10px 22px ${alpha('#000', 0.10)}`, bgcolor: '#fff' }} />
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

function SectionPaper({ children, tone = 'white', sx = {} }: { children: React.ReactNode; tone?: 'white' | 'platinum' | 'gold'; sx?: object }) {
  const isGold = tone === 'gold';
  return (
    <Paper
      sx={{
        p: { xs: 2.4, md: 4 },
        borderRadius: radius.outer,
        bgcolor: isGold ? `linear-gradient(135deg, ${gold}, ${goldLight})` : tone === 'platinum' ? platinum : '#fff',
        border: `1px solid ${isGold ? alpha(gold, 0.32) : line}`,
        mb: 4,
        boxShadow: isGold ? `0 22px 54px ${alpha(gold, 0.18)}` : `0 14px 36px ${alpha('#000', 0.045)}`,
        ...sx,
      }}
    >
      {children}
    </Paper>
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
              <ActionButton href={COMPANY_URL} contained icon={<Building2 size={17} />}>{c.company}</ActionButton>
              <ActionButton href={ONBOARDING_URL}>{c.primary}</ActionButton>
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
    <Grid container spacing={2.2} sx={{ mt: -3, mb: 4, position: 'relative', zIndex: 2 }}>
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

function Proof({ c }: { c: CopyShape }) {
  const icons = [<Workflow key="workflow" />, <WalletCards key="wallet" />, <Building2 key="building" />, <Bot key="bot" />];
  return (
    <SectionPaper>
      <Grid container spacing={3.5} alignItems="stretch">
        <Grid item xs={12} md={5}>
          <Chip label="THE PITCH" sx={{ borderRadius: 1.25, bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950, mb: 2 }} />
          <Typography variant="h3" fontWeight={950} sx={{ color: ink, letterSpacing: '-0.04em', mb: 2 }}>{c.proofTitle}</Typography>
          <Typography sx={{ color: muted, lineHeight: 1.8, fontWeight: 700 }}>{c.proofDesc}</Typography>
        </Grid>
        <Grid item xs={12} md={7}>
          <Grid container spacing={2}>
            {c.cards.map((card, idx) => (
              <Grid item xs={12} sm={6} key={card[0]}>
                <Paper sx={{ p: 2.4, minHeight: 160, height: '100%', borderRadius: radius.card, bgcolor: platinum, border: `1px solid ${line}` }}>
                  <Box sx={{ color: gold, mb: 1.25 }}>{icons[idx]}</Box>
                  <Typography fontWeight={950} sx={{ color: ink, mb: 1 }}>{card[0]}</Typography>
                  <Typography variant="body2" sx={{ color: muted, lineHeight: 1.65, fontWeight: 700 }}>{card[1]}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Grid>
      </Grid>
    </SectionPaper>
  );
}

function Pricing({ c }: { c: CopyShape }) {
  return (
    <SectionPaper tone="platinum">
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <FileText color={gold} />
        <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.pricingTitle}</Typography>
      </Stack>
      <Grid container spacing={2}>
        {c.pricing.map((price) => (
          <Grid item xs={12} sm={6} md={3} key={price[0]}>
            <Paper sx={{ p: 2.4, borderRadius: radius.card, bgcolor: '#fff', border: `1px solid ${line}`, height: '100%' }}>
              <Typography fontWeight={950} sx={{ color: ink }}>{price[0]}</Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: gold }}>{price[1]}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </SectionPaper>
  );
}

function Coverage({ c }: { c: CopyShape }) {
  return (
    <SectionPaper>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
        <ShieldCheck color={gold} />
        <Typography variant="h4" fontWeight={950} sx={{ color: ink }}>{c.coverageTitle}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {c.coverage.map((asset) => (
          <Chip key={asset} label={asset} sx={{ borderRadius: 1.2, bgcolor: alpha(gold, .08), color: '#59451D', border: `1px solid ${alpha(gold, .16)}`, fontWeight: 850 }} />
        ))}
      </Stack>
    </SectionPaper>
  );
}

function Inquiry({ c }: { c: CopyShape }) {
  return (
    <SectionPaper tone="gold" sx={{ mb: 0 }}>
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
    </SectionPaper>
  );
}

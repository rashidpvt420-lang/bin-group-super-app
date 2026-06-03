import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Bot, Building2, Camera, CheckCircle2, Clock3, FileText, Languages, LogIn, MessageCircle, PlayCircle, ShieldCheck, WalletCards, Workflow } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const WHATSAPP_URL = 'https://wa.me/971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';
const DEMO_URL = '/request-demo';
const LOGIN_URL = '/login';

const ink = '#111827';
const muted = '#5B6270';
const canvas = '#FFFFFF';
const platinum = '#F7F7F4';
const line = '#E8E3D7';
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;

const copy = {
  en: {
    brand: 'BIN GROUP',
    language: 'العربية',
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
    language: 'EN',
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

export default function PublicMarketingPage() {
  const { lang, setLang, isRTL } = useLanguage();
  const c = lang === 'ar' ? copy.ar : copy.en;
  const nextLang = lang === 'en' ? 'ar' : 'en';

  return (
    <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ minHeight: '100vh', bgcolor: canvas, color: ink, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'fixed', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: { xs: '18vw', md: '12vw' }, fontWeight: 950, letterSpacing: '-0.08em', color: ink, opacity: 0.035, zIndex: 0 }}>BIN GROUP</Box>
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Nav c={c} nextLang={nextLang} setLang={setLang} />
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

function ActionButton({ href, children, contained = false, icon }: { href: string; children: React.ReactNode; contained?: boolean; icon?: React.ReactNode }) {
  return (
    <Button component="a" href={href} startIcon={icon} sx={{ minHeight: 52, px: 3, py: 1.4, borderRadius: 999, fontWeight: 950, textDecoration: 'none', color: contained ? '#111' : gold, border: contained ? 'none' : `1px solid ${alpha(gold, 0.42)}`, background: contained ? `linear-gradient(135deg, ${goldLight}, ${gold})` : '#fff', boxShadow: contained ? `0 16px 40px ${alpha(gold, 0.26)}` : `0 10px 26px ${alpha('#000', 0.05)}`, '&:hover': { background: contained ? `linear-gradient(135deg, ${gold}, ${goldLight})` : alpha(gold, 0.08), transform: 'translateY(-1px)' } }}>{children}</Button>
  );
}

function Nav({ c, nextLang, setLang }: { c: any; nextLang: 'en' | 'ar'; setLang: (lang: 'en' | 'ar') => void }) {
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.9)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${line}` }}>
      <Container maxWidth="xl" sx={{ py: 1.15, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
        <Button component="a" href="/" sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}>
          <Stack direction="row" spacing={1.2} alignItems="center">
            <Box component="img" src="/logo.png" sx={{ width: 44, height: 44, borderRadius: 2.2, boxShadow: `0 12px 28px ${alpha('#000', 0.10)}`, bgcolor: '#fff' }} />
            <Typography fontWeight={950} sx={{ color: ink }}>{c.brand}</Typography>
          </Stack>
        </Button>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 1 }}>
          <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
          <ActionButton href={LOGIN_URL} icon={<LogIn size={17} />}>{c.login}</ActionButton>
          <ActionButton href={DEMO_URL} icon={<PlayCircle size={17} />}>{c.demo}</ActionButton>
          <Button onClick={() => setLang(nextLang)} sx={{ minWidth: 76, minHeight: 52, borderRadius: 999, color: '#111', background: `linear-gradient(135deg, ${goldLight}, ${gold})`, fontWeight: 950, boxShadow: `0 14px 34px ${alpha(gold, 0.25)}` }}><Languages size={16} />&nbsp;{c.language}</Button>
        </Stack>
      </Container>
    </Box>
  );
}

function Hero({ c }: { c: any }) {
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${line}` }}>
      <Box sx={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 90% 8%, ${alpha(gold, 0.18)}, transparent 28rem), radial-gradient(circle at 10% 95%, ${alpha('#C0C6CF', 0.26)}, transparent 30rem), ${platinum}` }} />
      <Container maxWidth="xl" sx={{ position: 'relative', zIndex: 1, py: { xs: 7, md: 11 } }}>
        <Grid container spacing={5} alignItems="center">
          <Grid item xs={12} md={7}>
            <Chip label={c.chip} sx={{ mb: 3, bgcolor: alpha(gold, .12), color: '#5E4A1F', fontWeight: 950, border: `1px solid ${alpha(gold, 0.20)}` }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 42, md: 72 }, lineHeight: .96, fontWeight: 950, mb: 3, color: ink, letterSpacing: '-0.06em' }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: muted, lineHeight: 1.65, fontWeight: 750, maxWidth: 950 }}>{c.desc}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4, flexWrap: 'wrap' }}>
              <ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton>
              <ActionButton href={QUOTE_URL}>{c.quote}</ActionButton>
              <ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton>
            </Stack>
            <Typography sx={{ color: '#6F5522', fontWeight: 900, mt: 3 }}>{c.flow}</Typography>
          </Grid>
          <Grid item xs={12} md={5}><Command c={c} /></Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function Command({ c }: { c: any }) {
  const icons = [Workflow, WalletCards, Building2, Bot];
  return <Paper sx={{ p: 2.5, borderRadius: 5, bgcolor: 'rgba(255,255,255,.94)', border: `1px solid ${line}`, boxShadow: `0 28px 70px ${alpha('#000', 0.10)}` }}><Stack spacing={1.5}>{c.command.map((row: string[], index: number) => { const Icon = icons[index]; return <Box key={row[0]} component="a" href={index === 1 ? QUOTE_URL : index === 3 ? DEMO_URL : ONBOARDING_URL} sx={{ display: 'block', p: 2.2, borderRadius: 3, bgcolor: index === 0 ? alpha(gold, 0.12) : '#FFFFFF', color: ink, textDecoration: 'none', border: `1px solid ${index === 0 ? alpha(gold, 0.22) : line}`, boxShadow: `0 12px 30px ${alpha('#000', 0.055)}` }}><Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center"><Stack direction="row" spacing={1.4} alignItems="center"><Box sx={{ color: gold, display: 'flex' }}><Icon size={22} /></Box><Box><Typography fontWeight={950}>{row[0]}</Typography><Typography variant="caption" sx={{ color: muted }}>{row[1]}</Typography></Box></Stack><Typography variant="caption" sx={{ color: '#6F5522', fontWeight: 950 }}>{row[2]}</Typography></Stack></Box>; })}</Stack></Paper>;
}

function Trust() {
  const labels = ['Home OS workflow', 'Rent ledger waterfall', 'SLA timers', 'Before/after proof'];
  const icons = [ShieldCheck, WalletCards, Clock3, Camera];
  return <Grid container spacing={2} sx={{ mt: 5 }}>{labels.map((label, index) => { const Icon = icons[index]; return <Grid item xs={12} md={3} key={label}><Paper sx={{ p: 2.5, bgcolor: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 4, boxShadow: `0 18px 45px ${alpha('#000', 0.06)}` }}><Box sx={{ color: gold }}><Icon /></Box><Typography fontWeight={950} color={ink}>{label}</Typography></Paper></Grid>; })}</Grid>;
}

function Proof({ c }: { c: any }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950} color={ink}>{c.proofTitle}</Typography><Typography sx={{ color: muted, maxWidth: 900, mt: 1.5, lineHeight: 1.8 }}>{c.proofDesc}</Typography><Grid container spacing={2} sx={{ mt: 3 }}>{c.cards.map((p: string[]) => <Grid item xs={12} sm={6} md={3} key={p[0]}><Paper sx={{ p: 2.2, height: '100%', bgcolor: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 4, boxShadow: `0 14px 34px ${alpha('#000', 0.052)}` }}><CheckCircle2 size={18} color={gold} /><Typography fontWeight={950} sx={{ mt: 1, color: ink }}>{p[0]}</Typography><Typography variant="body2" sx={{ color: muted, mt: 1, lineHeight: 1.7 }}>{p[1]}</Typography></Paper></Grid>)}</Grid></Box>;
}

function Pricing({ c }: { c: any }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950} color={ink}>{c.pricingTitle}</Typography><Grid container spacing={2} sx={{ mt: 3 }}>{c.pricing.map((item: string[]) => <Grid item xs={12} sm={6} md={3} key={item[0]}><Paper sx={{ p: 3, height: '100%', bgcolor: alpha(gold, .07), border: `1px solid ${alpha(gold, .20)}`, borderRadius: 4 }}><Typography sx={{ color: muted, fontWeight: 900 }}>{item[0]}</Typography><Typography variant="h5" fontWeight={950} sx={{ color: '#6F5522', mt: 1 }}>{item[1]}</Typography></Paper></Grid>)}</Grid></Box>;
}

function Coverage({ c }: { c: any }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950} color={ink}>{c.coverageTitle}</Typography><Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: 'wrap', gap: 1 }}>{c.coverage.map((item: string) => <Chip key={item} label={item} sx={{ color: ink, bgcolor: '#FFFFFF', border: `1px solid ${line}`, fontWeight: 850 }} />)}</Stack></Box>;
}

function Inquiry({ c }: { c: any }) {
  return <Box sx={{ mt: 7 }}><Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: '#FFFFFF', border: `1px solid ${line}`, borderRadius: 5, boxShadow: `0 24px 70px ${alpha('#000', 0.08)}` }}><Stack spacing={2}><FileText color={gold} /><Typography variant="h3" fontWeight={950} color={ink}>{c.inquiryTitle}</Typography><Typography sx={{ color: muted, lineHeight: 1.8, maxWidth: 850 }}>{c.inquiryDesc}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><ActionButton href={ONBOARDING_URL} contained>{c.primary}</ActionButton><ActionButton href={LOGIN_URL} icon={<LogIn size={17} />}>{c.login}</ActionButton><ActionButton href={WHATSAPP_URL} icon={<MessageCircle size={17} />}>{c.whatsapp}</ActionButton></Stack></Stack></Paper></Box>;
}

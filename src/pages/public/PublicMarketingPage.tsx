import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, CheckCircle2, FileText, Languages, MessageCircle, PlayCircle, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type Sector = { eyebrow: string; title: string; subtitle: string; bullets: string[] };
type MarketingCopy = {
  chip: string;
  title: string;
  desc: string;
  primary: string;
  quote: string;
  login: string;
  demo: string;
  videos: string;
  language: string;
  whatsapp: string;
  ownerFlowTitle: string;
  proofTitle: string;
  proofDesc: string;
  pricingTitle: string;
  coverageTitle: string;
  inquiryTitle: string;
  inquiryDesc: string;
  sectors: Record<string, Sector>;
};

const WHATSAPP_URL = 'https://wa.me/971552423233';

const en: MarketingCopy = {
  chip: 'UAE PROPERTY CARE SYSTEM',
  title: 'Start Property Details. Get Quote. Sign Contract.',
  desc: 'BIN GROUP helps serious UAE property owners move from scattered calls and maintenance confusion to one clear digital system: property details, instant quote, contract selection, 15% mobilization, tenant requests, technician dispatch, before-and-after proof, owner reports, and property passport history.',
  primary: 'Start Property Details',
  quote: 'Get Instant Quote',
  login: 'Portal Login',
  demo: 'Watch Demo',
  videos: 'Videos',
  language: 'العربية',
  whatsapp: 'WhatsApp BIN GROUP',
  ownerFlowTitle: 'Owner journey: details → quote → contract → service tracking',
  proofTitle: 'What BIN GROUP solves',
  proofDesc: 'BIN GROUP removes scattered calls, unclear service history, missing proof, delayed field coordination, weak reporting, and poor owner visibility. Owners, tenants, technicians, and brokers operate from one verified property-care chain.',
  pricingTitle: 'Contracts & pricing model',
  coverageTitle: 'Built for every serious UAE property',
  inquiryTitle: 'Contact BIN GROUP',
  inquiryDesc: 'Talk to BIN GROUP by WhatsApp or phone. We prepare the right maintenance, property management, or full-coverage contract path.',
  sectors: {
    owners: { eyebrow: 'Owner Command', title: 'Turn every property into a controlled digital asset.', subtitle: 'Contracts, 15% mobilization, payment plans, tenant service, evidence, reports, and property passport records.', bullets: ['Start property details', 'Get quote and scope', 'Select maintenance, management, or full coverage', 'Track reports, approvals, PDFs, demos, and service history'] },
    tenants: { eyebrow: 'Tenant Care', title: 'Submit clear maintenance requests with proof.', subtitle: 'Tenants send category, priority, photos, location context, and track the service path.', bullets: ['Photo-based service request', 'Priority and category', 'GPS/location context', 'Completion confirmation'] },
    technicians: { eyebrow: 'Technician Operations', title: 'Field teams receive structured work and accountability.', subtitle: 'Technicians see jobs, route context, proof requirements, safety notes, and completion workflow.', bullets: ['Direct job feed', 'GPS dispatch context', 'Before/after proof', 'SLA performance visibility'] },
    brokers: { eyebrow: 'Broker Growth', title: 'Broker referrals become structured owner opportunities.', subtitle: 'Referral, property, and commission-ready records stay inside the same platform.', bullets: ['Lead registration', 'Owner referral visibility', 'Property pipeline records', 'Commission-ready tracking'] },
    security: { eyebrow: 'Trust & Records', title: 'Every property builds a verified digital passport.', subtitle: 'Contracts, tickets, invoices, photos, and reports become long-term property intelligence.', bullets: ['Role-based access', 'Proof-of-work history', 'PDF traceability', 'UAE-ready reporting'] },
    contact: { eyebrow: 'Contact BIN GROUP', title: 'Talk to BIN GROUP and start the right contract path.', subtitle: 'Use WhatsApp, phone, or onboarding to start property details and request the correct maintenance or management scope.', bullets: ['WhatsApp contact', 'Property onboarding', 'Quote path', 'Contract request'] },
    'ai-design-studio': { eyebrow: 'AI Design Studio', title: 'Visualize upgrades before work begins.', subtitle: 'AI design previews connect property improvement ideas to scope, quote, and owner approval.', bullets: ['Interior ideas', 'Exterior ideas', 'Scope support', 'Owner approvals'] },
  },
};

const ar: MarketingCopy = {
  chip: 'نظام العناية بالعقارات في الإمارات',
  title: 'ابدأ تفاصيل العقار. احصل على عرض سعر. وقّع العقد.',
  desc: 'BIN GROUP يساعد ملاك العقارات الجادين في الإمارات على الانتقال من الاتصالات المتفرقة وفوضى الصيانة إلى نظام رقمي واضح: تفاصيل العقار، عرض سعر فوري، اختيار العقد، دفعة تفعيل 15٪، طلبات المستأجرين، إرسال الفنيين، إثبات قبل وبعد، تقارير المالك، وسجل عقاري دائم.',
  primary: 'ابدأ تفاصيل العقار',
  quote: 'احصل على عرض سعر فوري',
  login: 'دخول البوابة',
  demo: 'شاهد العرض',
  videos: 'الفيديوهات',
  language: 'English',
  whatsapp: 'واتساب BIN GROUP',
  ownerFlowTitle: 'رحلة المالك: تفاصيل → عرض سعر → عقد → تتبع الخدمة',
  proofTitle: 'ما الذي تحله BIN GROUP؟',
  proofDesc: 'BIN GROUP تنهي الاتصالات المتكررة، ضياع تاريخ الخدمة، غياب الإثباتات، تأخير التنسيق الميداني، ضعف التقارير، وعدم وضوح رؤية المالك. كل الأطراف تعمل داخل سلسلة تشغيل موثقة واحدة.',
  pricingTitle: 'نموذج العقود والأسعار',
  coverageTitle: 'مصمم لكل عقار جاد في الإمارات',
  inquiryTitle: 'تواصل مع BIN GROUP',
  inquiryDesc: 'تواصل مع BIN GROUP عبر واتساب أو الهاتف لنجهز مسار الصيانة أو الإدارة أو التغطية الكاملة.',
  sectors: {
    owners: { eyebrow: 'قيادة الملاك', title: 'حوّل كل عقار إلى أصل رقمي منظم.', subtitle: 'عقود، دفعة تفعيل 15٪، خطط دفع، خدمة مستأجرين، إثبات، تقارير، وسجل عقاري.', bullets: ['ابدأ تفاصيل العقار', 'احصل على عرض السعر والنطاق', 'اختر الصيانة أو الإدارة أو التغطية الكاملة', 'تابع التقارير والموافقات وملفات PDF وسجل الخدمة'] },
    tenants: { eyebrow: 'رعاية المستأجر', title: 'طلب صيانة واضح مع إثبات.', subtitle: 'المستأجر يرسل التصنيف والأولوية والصور والموقع ويتابع الخدمة.', bullets: ['طلب خدمة بالصور', 'أولوية وتصنيف', 'سياق GPS', 'تأكيد الإنجاز'] },
    technicians: { eyebrow: 'تشغيل الفنيين', title: 'الفريق الميداني يستلم عمل منظم ومسؤولية واضحة.', subtitle: 'المهام، الموقع، متطلبات الإثبات، السلامة، وإغلاق العمل داخل النظام.', bullets: ['قائمة مهام مباشرة', 'سياق GPS', 'إثبات قبل وبعد', 'وضوح أداء SLA'] },
    brokers: { eyebrow: 'نمو الوسطاء', title: 'إحالات الوسطاء تتحول إلى فرص ملاك منظمة.', subtitle: 'الإحالات والعقارات والعمولات الجاهزة داخل نفس المنصة.', bullets: ['تسجيل الإحالة', 'وضوح إحالة المالك', 'سجل فرص العقارات', 'تتبع العمولة'] },
    security: { eyebrow: 'الثقة والسجلات', title: 'كل عقار يحصل على جواز رقمي موثق.', subtitle: 'العقود والطلبات والفواتير والصور والتقارير تتحول إلى ذكاء عقاري دائم.', bullets: ['صلاحيات حسب الدور', 'تاريخ إثبات العمل', 'تتبع PDF', 'تقارير جاهزة للإمارات'] },
    contact: { eyebrow: 'تواصل مع BIN GROUP', title: 'تواصل وابدأ مسار العقد الصحيح.', subtitle: 'استخدم واتساب أو الهاتف أو التسجيل لبدء تفاصيل العقار وطلب نطاق الصيانة أو الإدارة المناسب.', bullets: ['تواصل واتساب', 'تسجيل العقار', 'مسار عرض السعر', 'طلب العقد'] },
    'ai-design-studio': { eyebrow: 'استوديو التصميم AI', title: 'شاهد التطوير قبل بدء العمل.', subtitle: 'تصاميم AI تربط الأفكار بالنطاق والتكلفة وموافقة المالك.', bullets: ['أفكار داخلية', 'أفكار خارجية', 'دعم النطاق', 'موافقات المالك'] },
  },
};

const pricing = [
  ['Maintenance Contracts', 'Custom Quote'],
  ['Property Management', '5% model'],
  ['Mobilization', '15% upfront'],
  ['Payment Plans', 'Monthly / Quarterly / Annual'],
];

const problems = [
  'No-call owner journey',
  'Direct technician workfeed',
  'GPS dispatch context',
  'Before-and-after proof',
  'PDF contracts and reports',
  'Demo/video walkthroughs',
  'AI property intelligence',
  'Property passport history',
];

const coverage = ['Villas', 'Apartments', 'Buildings', 'Towers', 'Hotels', 'Schools', 'Clinics', 'Hospitals', 'Offices', 'Malls', 'Majlis', 'Warehouses', 'Staff Accommodation', 'Retail', 'Industrial', 'Mixed-use Assets'];

export default function PublicMarketingPage({ page = 'home' }: { page?: string }) {
  const params = useParams();
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? ar : en;
  const key = page === 'dynamic' ? params.page || 'home' : page;
  const sector = key === 'home' ? null : c.sectors[key || ''];

  if (key !== 'home' && !sector) return <PublicMarketingPage page="home" />;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Nav c={c} />
      {sector ? <Sector c={sector} /> : <Hero c={c} />}
      <Container maxWidth="xl" sx={{ pb: 8 }}>
        <Trust />
        <Problems c={c} />
        <Pricing c={c} />
        <Coverage c={c} />
        <Inquiry c={c} />
      </Container>
    </Box>
  );
}

function Nav({ c }: { c: MarketingCopy }) {
  const { lang, setLang, isRTL } = useLanguage();
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(0,0,0,.9)', borderBottom: '1px solid rgba(198,167,94,.18)', backdropFilter: 'blur(14px)' }}>
      <Container maxWidth="xl" sx={{ py: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Stack component={Link} to="/" direction="row" spacing={1.2} alignItems="center" sx={{ color: '#fff', textDecoration: 'none', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Box component="img" src="/logo.png" sx={{ width: 38, height: 38, borderRadius: 1 }} />
          <Typography fontWeight={950}>BIN <Box component="span" sx={{ color: binThemeTokens.gold }}>GROUP</Box></Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: isRTL ? 0 : 'auto', mr: isRTL ? 'auto' : 0, flexWrap: 'wrap', justifyContent: isRTL ? 'flex-start' : 'flex-end' }}>
          <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>{c.primary}</Button>
          <Button component={Link} to="/request-demo" startIcon={<PlayCircle size={17} />} sx={{ color: '#fff', fontWeight: 900 }}>{c.demo}</Button>
          <Button component={Link} to="/videos" sx={{ color: '#fff', fontWeight: 900 }}>{c.videos}</Button>
          <Button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} startIcon={<Languages size={17} />} sx={{ color: binThemeTokens.gold, fontWeight: 950, minWidth: 100 }}>{c.language}</Button>
        </Stack>
      </Container>
    </Box>
  );
}

function Hero({ c }: { c: MarketingCopy }) {
  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(198,167,94,.16)' }}>
      <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,.25), transparent 34rem), #050505' }} />
      <Container maxWidth="xl" sx={{ position: 'relative', py: { xs: 7, md: 11 } }}>
        <Grid container spacing={5} alignItems="center">
          <Grid item xs={12} md={7}>
            <Chip label={c.chip} sx={{ mb: 3, bgcolor: alpha(binThemeTokens.gold, .14), color: binThemeTokens.gold, fontWeight: 950 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 66 }, lineHeight: .98, fontWeight: 950, mb: 3 }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.65, fontWeight: 800 }}>{c.desc}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4, flexWrap: 'wrap' }}>
              <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, px: 3 }}>{c.primary}</Button>
              <Button component={Link} to="/onboarding" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.32)', fontWeight: 950, py: 1.5, px: 3 }}>{c.quote}</Button>
              <Button component={Link} to="/request-demo" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.28)', fontWeight: 950, py: 1.5, px: 3 }}>{c.demo}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, py: 1.5, px: 3 }}>{c.whatsapp}</Button>
            </Stack>
            <Typography sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 3 }}>{c.ownerFlowTitle}</Typography>
          </Grid>
          <Grid item xs={12} md={5}><Command /></Grid>
        </Grid>
      </Container>
    </Box>
  );
}

function Sector({ c }: { c: Sector }) {
  return (
    <Container maxWidth="xl" sx={{ py: 9 }}>
      <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{c.eyebrow}</Typography>
      <Typography variant="h2" sx={{ fontWeight: 950, mt: 1, mb: 2 }}>{c.title}</Typography>
      <Typography variant="h6" sx={{ color: 'rgba(255,255,255,.72)', maxWidth: 850 }}>{c.subtitle}</Typography>
      <Stack spacing={1.2} sx={{ mt: 3 }}>{c.bullets.map((b) => <Stack key={b} direction="row" spacing={1.2} alignItems="center"><CheckCircle2 size={18} color={binThemeTokens.gold} /><Typography>{b}</Typography></Stack>)}</Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
        <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Start Property Details</Button>
        <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>WhatsApp BIN GROUP</Button>
      </Stack>
    </Container>
  );
}

function Command() {
  const rows = [
    ['Property Details', 'Building, villa, units, systems, location', 'START'],
    ['Instant Quote', 'Maintenance or management scope path', 'QUOTE'],
    ['Owner Contract', '15% mobilization + payment plan', 'SIGN'],
    ['Service Tracking', 'Tenant request, GPS, proof, report', 'LIVE'],
  ];
  return <Paper sx={{ p: 2.5, borderRadius: 4, bgcolor: 'rgba(18,18,20,.92)', border: '1px solid rgba(198,167,94,.28)' }}><Stack spacing={1.5}>{rows.map(([a, b, d]) => <Box key={a} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,.035)' }}><Stack direction="row" justifyContent="space-between" spacing={2}><Box><Typography fontWeight={900}>{a}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{b}</Typography></Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{d}</Typography></Stack></Box>)}</Stack></Paper>;
}

function Trust() {
  const items: [string, React.ReactNode][] = [['Verified records', <ShieldCheck key="shield" />], ['GPS dispatch', <Wrench key="wrench" />], ['PDF proof', <FileText key="file" />], ['Property passport', <Building2 key="building" />]];
  return <Grid container spacing={2} sx={{ mt: 5 }}>{items.map(([a, i]) => <Grid item xs={12} md={3} key={a}><Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}><Box sx={{ color: binThemeTokens.gold }}>{i}</Box><Typography fontWeight={950}>{a}</Typography></Paper></Grid>)}</Grid>;
}

function Problems({ c }: { c: MarketingCopy }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950}>{c.proofTitle}</Typography><Typography sx={{ color: 'rgba(255,255,255,.68)', maxWidth: 900, mt: 1.5, lineHeight: 1.8 }}>{c.proofDesc}</Typography><Grid container spacing={2} sx={{ mt: 3 }}>{problems.map((p) => <Grid item xs={12} sm={6} md={3} key={p}><Paper sx={{ p: 2.2, height: '100%', bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}><CheckCircle2 size={18} color={binThemeTokens.gold} /><Typography fontWeight={900} sx={{ mt: 1 }}>{p}</Typography></Paper></Grid>)}</Grid></Box>;
}

function Pricing({ c }: { c: MarketingCopy }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950}>{c.pricingTitle}</Typography><Grid container spacing={2} sx={{ mt: 3 }}>{pricing.map(([label, value]) => <Grid item xs={12} sm={6} md={3} key={label}><Paper sx={{ p: 3, height: '100%', bgcolor: alpha(binThemeTokens.gold, .06), border: `1px solid ${alpha(binThemeTokens.gold, .18)}` }}><Typography sx={{ color: 'rgba(255,255,255,.58)', fontWeight: 900 }}>{label}</Typography><Typography variant="h5" fontWeight={950} sx={{ color: binThemeTokens.gold, mt: 1 }}>{value}</Typography></Paper></Grid>)}</Grid></Box>;
}

function Coverage({ c }: { c: MarketingCopy }) {
  return <Box sx={{ mt: 7 }}><Typography variant="h3" fontWeight={950}>{c.coverageTitle}</Typography><Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: 'wrap', gap: 1 }}>{coverage.map((item) => <Chip key={item} label={item} sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.08)', fontWeight: 800 }} />)}</Stack></Box>;
}

function Inquiry({ c }: { c: MarketingCopy }) {
  return <Box sx={{ mt: 7 }}><Paper sx={{ p: { xs: 3, md: 5 }, bgcolor: 'rgba(255,255,255,.035)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 4 }}><Stack spacing={2}><Sparkles color={binThemeTokens.gold} /><Typography variant="h3" fontWeight={950}>{c.inquiryTitle}</Typography><Typography sx={{ color: 'rgba(255,255,255,.7)', lineHeight: 1.8, maxWidth: 850 }}>{c.inquiryDesc}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{c.primary}</Button><Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{c.whatsapp}</Button></Stack></Stack></Paper></Box>;
}

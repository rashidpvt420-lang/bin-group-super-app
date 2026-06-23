import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Award, Briefcase, Building2, CheckCircle2, Globe, Home, LogIn, Mail, MapPin, MessageSquare, Phone, Sparkles, Users, Wrench, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import BrandWatermark from '../../components/BrandWatermark';

const CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'ceo@bin-groups.com' };
const gold = binThemeTokens.gold;
const goldLight = binThemeTokens.goldLight;
const ink = '#111827';
const line = '#E8E3D7';
const muted = '#667085';

const serviceAreas = ['Al Ain', 'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain'];

type CompanyContent = {
  badge: string;
  title: string;
  headline: string;
  subline: string;
  license: string;
  stats: [string, string][];
  navStart: string;
  navLogin: string;
  navHome: string;
  lang: string;
  oneMinuteTitle: string;
  oneMinuteSubtitle: string;
  roles: [string, string, string][];
  proofTitle: string;
  proofItems: string[];
  flowTitle: string;
  flow: string[];
  sections: { simple: string; trust: string; coverage: string; contact: string; services: string };
  services: [string, string][];
  contactText: string;
  ctaStart: string;
  ctaWhatsApp: string;
  ctaEmail: string;
  location: string;
};

const content: Record<'en' | 'ar', CompanyContent> = {
  en: {
    badge: 'COMPANY PROFILE',
    title: 'BIN GROUP',
    headline: 'No calls. No confusion. Every property job tracked and proven.',
    subline: 'BIN GROUP helps owners, tenants, technicians, and brokers understand property maintenance in under one minute: report, track, prove, approve, and manage from one trusted system.',
    license: 'All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE · Trade licence available on request',
    stats: [['1 min', 'To understand'], ['4', 'Simple user journeys'], ['8', 'UAE emirates'], ['Proof', 'Photos · GPS · Time']],
    navStart: 'Start Property Details', navLogin: 'Portal Login', navHome: 'Home', lang: 'AR',
    oneMinuteTitle: 'Understand BIN GROUP in 60 seconds',
    oneMinuteSubtitle: 'Four public portals. One internal operations layer. Everyone knows what happens next.',
    roles: [
      ['Owner', 'Add property, choose service, approve payment, then track cost, work, reports, and proof.', 'Start with my property'],
      ['Tenant', 'Report the issue, add photo, follow status, then approve or dispute after proof.', 'Report an issue'],
      ['Technician', 'Accept job, go on site, update status, upload before/after proof, and close correctly.', 'View my jobs'],
      ['Broker', 'Submit a lead, keep attribution visible, and follow commission after the deal is verified.', 'Submit a lead'],
    ],
    proofTitle: 'Why people trust it fast',
    proofItems: ['Licensed UAE company', 'Clear service flow', 'Operations verification', 'Photos for proof', 'GPS/location context', 'Time-stamped records', 'Tenant approval or dispute', 'Owner cost visibility', 'Broker attribution', 'English and Arabic support'],
    flowTitle: 'The simple operating flow',
    flow: ['Onboard', 'Verify', 'Report', 'Resolve', 'Approve'],
    sections: { simple: 'Simple Concept', trust: 'Trust Proof', coverage: 'Service Areas', contact: 'Start With BIN GROUP', services: 'What We Do' },
    services: [
      ['Maintenance', 'Service requests become tracked tickets instead of lost phone calls.'],
      ['Property Management', 'Owners see property status, costs, reports, tenant records, and service history clearly.'],
      ['Technician Work', 'Field work is connected to job status, location context, and before/after proof.'],
      ['Broker Growth', 'Property leads, attribution, contracts, and commission progress stay visible and organized.'],
      ['Operations Control', 'Approvals, payment verification, SLA breach control, documents, and audit logs stay controlled behind the scenes.'],
      ['AI Concierge', 'Residents can describe the issue and the app helps classify the request.'],
      ['Property Passport', 'Each property keeps contracts, tickets, evidence, invoices, inspections, and history together.'],
    ],
    contactText: 'Start with one property, one tenant request, one broker lead, or one maintenance contract. BIN GROUP keeps the process clear from the first click.',
    ctaStart: 'Start Now', ctaWhatsApp: 'WhatsApp BIN GROUP', ctaEmail: 'Email Us', location: 'Al Ain, United Arab Emirates',
  },
  ar: {
    badge: 'ملف الشركة',
    title: 'BIN GROUP',
    headline: 'بدون اتصالات كثيرة. بدون ارتباك. كل عمل عقاري موثق ومثبت.',
    subline: 'BIN GROUP تساعد المالك والمستأجر والفني والوسيط على فهم الصيانة خلال أقل من دقيقة: بلّغ، تابع، أثبت، وافق، وأدر من نظام موثوق واحد.',
    license: 'All Kind Building Projects Contracting LLC S.P.C · مرخصة في أبوظبي، الإمارات · رخصة التجارة متاحة عند الطلب',
    stats: [['دقيقة', 'للفهم'], ['4', 'رحلات بسيطة'], ['8', 'إمارات'], ['إثبات', 'صور · موقع · وقت']],
    navStart: 'ابدأ تفاصيل العقار', navLogin: 'دخول البوابة', navHome: 'الرئيسية', lang: 'EN',
    oneMinuteTitle: 'افهم BIN GROUP خلال 60 ثانية',
    oneMinuteSubtitle: 'أربع بوابات عامة. طبقة عمليات داخلية واحدة. كل شخص يعرف الخطوة التالية.',
    roles: [
      ['المالك', 'أضف العقار، اختر الخدمة، وافق على الدفع، ثم تابع التكلفة والعمل والتقارير والإثبات.', 'ابدأ بعقاري'],
      ['المستأجر', 'بلّغ عن المشكلة، أضف صورة، تابع الحالة، ثم وافق أو اعترض بعد الإثبات.', 'بلّغ عن مشكلة'],
      ['الفني', 'اقبل العمل، اذهب للموقع، حدّث الحالة، ارفع صور قبل/بعد، وأغلق العمل بشكل صحيح.', 'عرض أعمالي'],
      ['الوسيط', 'أرسل فرصة عقارية، حافظ على وضوح مصدر الإحالة، وتابع العمولة بعد تأكيد الصفقة.', 'أرسل فرصة'],
    ],
    proofTitle: 'لماذا يثق الناس به بسرعة',
    proofItems: ['شركة مرخصة في الإمارات', 'مسار خدمة واضح', 'تحقق العمليات', 'صور إثبات', 'سياق موقع GPS', 'سجلات بالوقت', 'موافقة أو اعتراض المستأجر', 'وضوح تكلفة المالك', 'تتبع مصدر الوسيط', 'دعم عربي وإنجليزي'],
    flowTitle: 'مسار التشغيل ببساطة',
    flow: ['تسجيل', 'تحقق', 'بلاغ', 'تنفيذ', 'موافقة'],
    sections: { simple: 'الفكرة البسيطة', trust: 'إثبات الثقة', coverage: 'مناطق الخدمة', contact: 'ابدأ مع BIN GROUP', services: 'ماذا نقدم' },
    services: [
      ['الصيانة', 'طلبات الخدمة تصبح تذاكر متتبعة بدل مكالمات ضائعة.'],
      ['إدارة العقار', 'المالك يرى حالة العقار والتكلفة والتقارير وسجل المستأجرين والخدمة بوضوح.'],
      ['عمل الفني', 'العمل الميداني مرتبط بالحالة والموقع وصور قبل/بعد.'],
      ['نمو الوسيط', 'الفرص ومصدر الإحالة والعقود والعمولات تبقى واضحة ومنظمة.'],
      ['تحكم العمليات', 'الموافقات والتحقق من المدفوعات ومخالفات SLA والوثائق وسجلات التدقيق تتم خلف الكواليس.'],
      ['المساعد الذكي', 'المستأجر يشرح المشكلة والتطبيق يساعد في تصنيف الطلب.'],
      ['جواز العقار', 'كل عقار يحتفظ بالعقود والتذاكر والإثبات والفواتير والفحوصات والتاريخ في مكان واحد.'],
    ],
    contactText: 'ابدأ بعقار واحد، طلب مستأجر واحد، فرصة وسيط واحدة، أو عقد صيانة واحد. BIN GROUP تجعل العملية واضحة من أول ضغطة.',
    ctaStart: 'ابدأ الآن', ctaWhatsApp: 'واتساب BIN GROUP', ctaEmail: 'راسلنا', location: 'العين، الإمارات العربية المتحدة',
  },
};

function Card({ title, body, icon, action }: { title: string; body: string; icon: React.ReactNode; action?: string }) {
  return <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: `1px solid ${line}`, boxShadow: '0 14px 36px rgba(17,24,39,.05)' }}><Stack spacing={1.3}><Box sx={{ p: 1.1, borderRadius: 2, bgcolor: alpha(gold, .12), color: gold, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>{icon}</Box><Typography fontWeight={950} color={ink}>{title}</Typography><Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, fontWeight: 650 }}>{body}</Typography>{action && <Chip label={action} sx={{ alignSelf: 'flex-start', bgcolor: alpha(gold, .12), color: '#6F5522', fontWeight: 950 }} />}</Stack></Paper>;
}

function Checklist({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return <Grid container spacing={1.4}>{items.map((item) => <Grid item xs={12} sm={6} md={2.4} key={item}><Stack direction="row" spacing={1.1} alignItems="center" sx={{ p: 2, height: '100%', borderRadius: 2.5, bgcolor: dark ? 'rgba(255,255,255,.045)' : '#fff', border: `1px solid ${dark ? alpha(gold, .16) : line}` }}><CheckCircle2 size={18} color={gold} /><Typography sx={{ color: dark ? 'rgba(255,255,255,.78)' : '#374151', fontWeight: 850, lineHeight: 1.45 }}>{item}</Typography></Stack></Grid>)}</Grid>;
}

function Section({ chip, title, children, dark = false, subtitle }: { chip: string; title: string; children: React.ReactNode; dark?: boolean; subtitle?: string }) {
  return <Box sx={{ py: 8, bgcolor: dark ? '#111827' : '#fff', borderBottom: `1px solid ${dark ? alpha(gold, .18) : line}` }}><Container maxWidth="lg"><Box sx={{ textAlign: 'center', mb: 5 }}><Chip label={chip} sx={{ mb: 2, bgcolor: alpha(gold, dark ? .13 : .1), color: dark ? gold : '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, .25)}` }} /><Typography variant="h2" fontWeight={950} sx={{ color: dark ? '#fff' : ink }}>{title}</Typography>{subtitle && <Typography variant="h6" sx={{ mt: 1.5, color: dark ? 'rgba(255,255,255,.62)' : muted, maxWidth: 830, mx: 'auto', lineHeight: 1.8, fontWeight: 700 }}>{subtitle}</Typography>}</Box>{children}</Container></Box>;
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, setLang, isRTL } = useLanguage();
  const activeLang = lang === 'ar' ? 'ar' : 'en';
  const c = content[activeLang];
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const roleIcons = [<Building2 size={22} />, <Users size={22} />, <Wrench size={22} />, <Briefcase size={22} />];
  const serviceIcons = [<Wrench size={22} />, <Building2 size={22} />, <Zap size={22} />, <Briefcase size={22} />, <CheckCircle2 size={22} />, <Sparkles size={22} />, <Award size={22} />];

  return <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}><BrandWatermark opacity={0.06} /><Box sx={{ position: 'relative', zIndex: 1 }}>
    <Box sx={{ bgcolor: '#111827', py: .8, borderBottom: `1px solid ${alpha(gold, .2)}` }}><Container maxWidth="lg"><Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center" flexWrap="wrap"><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} /><Typography sx={{ color: 'rgba(255,255,255,.78)', fontSize: '.72rem', fontWeight: 800 }}>All Kind Building Projects Contracting LLC S.P.C</Typography><Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '.72rem', fontWeight: 700 }}>Licensed in Abu Dhabi, UAE</Typography></Stack></Container></Box>
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}><Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}><Button onClick={() => navigate('/')} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}><Stack direction="row" spacing={1.2} alignItems="center"><Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1 }} /><Typography fontWeight={950}>BIN GROUP</Typography></Stack></Button><Button startIcon={<Home size={17} />} onClick={() => navigate('/')} sx={{ color: gold, fontWeight: 950 }}>{c.navHome}</Button><Button onClick={() => navigate('/onboarding')} sx={{ bgcolor: goldLight, color: '#111827', fontWeight: 950 }}>{c.navStart}</Button><Button startIcon={<LogIn size={17} />} onClick={() => navigate('/login')} sx={{ color: gold, fontWeight: 950 }}>{c.navLogin}</Button><Button startIcon={<Globe size={17} />} onClick={() => setLang(activeLang === 'en' ? 'ar' : 'en')} sx={{ color: gold, fontWeight: 950 }}>{c.lang}</Button></Container></Box>
    <Box sx={{ background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', py: { xs: 8, md: 12 }, textAlign: 'center', position: 'relative', overflow: 'hidden' }}><Container maxWidth="lg"><Stack spacing={4} alignItems="center"><Chip label={c.badge} sx={{ bgcolor: alpha(gold, .13), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, .3)}` }} /><Box component="img" src="/logo.png" alt="BIN GROUP" sx={{ width: { xs: 132, md: 168 }, height: { xs: 132, md: 168 }, borderRadius: '26px', border: `2.5px solid ${alpha(gold, .65)}`, boxShadow: `0 24px 72px ${alpha(gold, .42)}` }} /><Typography sx={{ color: gold, fontWeight: 950, letterSpacing: 7, fontSize: { xs: '2rem', md: '3rem' }, textTransform: 'uppercase' }}>{c.title}</Typography><Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, maxWidth: 920, lineHeight: 1.45 }}>{c.headline}</Typography><Typography variant="h6" sx={{ color: 'rgba(255,255,255,.68)', maxWidth: 910, lineHeight: 1.75, fontWeight: 750 }}>{c.subline}</Typography><Grid container spacing={2} justifyContent="center" sx={{ maxWidth: 820 }}>{c.stats.map(([v, l]) => <Grid item xs={6} sm={3} key={`${v}-${l}`}><Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .18)}`, borderRadius: 3 }}><Typography sx={{ color: gold, fontWeight: 950, fontSize: '1.7rem' }}>{v}</Typography><Typography sx={{ color: 'rgba(255,255,255,.62)', fontWeight: 850 }}>{l}</Typography></Paper></Grid>)}</Grid><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{c.ctaStart}</Button><Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderColor: alpha(gold, .45), color: gold, fontWeight: 950 }}>{c.ctaWhatsApp}</Button></Stack><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.38)', fontWeight: 700 }}>{c.license}</Typography></Stack></Container></Box>
    <Section chip={c.sections.simple} title={c.oneMinuteTitle} subtitle={c.oneMinuteSubtitle}><Grid container spacing={3}>{c.roles.map(([title, body, action], i) => <Grid item xs={12} md={3} key={title}><Card title={title} body={body} action={action} icon={roleIcons[i]} /></Grid>)}</Grid></Section>
    <Section dark chip={c.flowTitle} title={c.flowTitle}><Grid container spacing={2}>{c.flow.map((step, i) => <Grid item xs={6} md={2.4} key={step}><Paper sx={{ p: 3, textAlign: 'center', borderRadius: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .2)}` }}><Typography sx={{ color: alpha(gold, .8), fontWeight: 950, fontSize: '.85rem' }}>0{i + 1}</Typography><Typography variant="h5" fontWeight={950} sx={{ color: '#fff', mt: 1 }}>{step}</Typography></Paper></Grid>)}</Grid></Section>
    <Section chip={c.sections.services} title={c.sections.services}><Grid container spacing={3}>{c.services.map(([title, body], i) => <Grid item xs={12} sm={6} md={4} key={title}><Card title={title} body={body} icon={serviceIcons[i]} /></Grid>)}</Grid></Section>
    <Section dark chip={c.sections.trust} title={c.proofTitle}><Checklist dark items={c.proofItems} /></Section>
    <Section chip={c.sections.coverage} title={c.sections.coverage}><Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>{serviceAreas.map(area => <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: '#fff', border: `1.5px solid ${alpha(gold, .28)}`, borderRadius: 2.5 }}><Stack direction="row" spacing={1} alignItems="center"><MapPin size={14} color={gold} /><Typography sx={{ color: ink, fontWeight: 850 }}>{area}</Typography></Stack></Box>)}</Stack></Section>
    <Box sx={{ py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)' }}><Container maxWidth="md"><Stack spacing={4} alignItems="center" textAlign="center"><Chip label={c.sections.contact} sx={{ bgcolor: alpha(gold, .12), color: gold, fontWeight: 950 }} /><Typography variant="h2" fontWeight={950} sx={{ color: gold }}>{c.sections.contact}</Typography><Typography variant="h6" sx={{ color: 'rgba(255,255,255,.7)', maxWidth: 650 }}>{c.contactText}</Typography><Grid container spacing={2}>{[[<Phone size={22} />, 'Phone', CONTACT.phone, `tel:${CONTACT.phone}`], [<MessageSquare size={22} />, 'WhatsApp', CONTACT.whatsapp, `https://wa.me/${whatsappDigits}`], [<Mail size={22} />, 'Email', CONTACT.email, `mailto:${CONTACT.email}`], [<MapPin size={22} />, 'Location', c.location, '']].map(([icon, label, value, href]: any) => <Grid item xs={12} sm={6} key={label}><Paper component={href ? 'a' : 'div'} href={href || undefined} target={href?.startsWith('http') ? '_blank' : undefined} sx={{ p: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .22)}`, borderRadius: 3, display: 'block', textDecoration: 'none' }}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ color: gold }}>{icon}</Box><Box textAlign="left"><Typography variant="caption" sx={{ color: alpha(gold, .7), fontWeight: 900 }}>{label}</Typography><Typography sx={{ color: '#fff', fontWeight: 850 }}>{value}</Typography></Box></Stack></Paper></Grid>)}</Grid><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{c.ctaWhatsApp}</Button><Button variant="outlined" onClick={() => window.open(`mailto:${CONTACT.email}`, '_blank')} sx={{ borderColor: alpha(gold, .45), color: gold, fontWeight: 950 }}>{c.ctaEmail}</Button><Button variant="outlined" onClick={() => navigate('/onboarding')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.22)', fontWeight: 950 }}>{c.ctaStart}</Button></Stack></Stack></Container></Box>
  </Box></Box>;
}

import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Award, Briefcase, Building2, CheckCircle2, Globe, Home, LogIn, Mail, MapPin, MessageSquare, Phone, ShieldCheck, Sparkles, Users, Wrench, Zap } from 'lucide-react';
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

const content = {
  en: {
    badge: 'COMPANY PROFILE',
    title: 'BIN GROUP',
    headline: 'A UAE property operations company built for owner trust, tenant comfort, technician accountability, and portfolio ROI.',
    subline: 'Maintenance, property management, tenant service, technician dispatch, broker onboarding, RFQ/vendor control, HR readiness, AI triage, WhatsApp intake, contracts, invoices, and proof-based reporting in one operating system.',
    license: 'All Kind Building Projects Contracting LLC S.P.C · Licensed in Abu Dhabi, UAE · Trade Licence No. CN-5914744',
    stats: [['2010', 'Founded in Al Ain'], ['5', 'Role portals'], ['8', 'UAE emirates'], ['500+', 'Portfolio-ready scale']],
    navStart: 'Start Property Details', navLogin: 'Portal Login', navHome: 'Home', lang: 'AR',
    aboutTitle: 'What BIN GROUP Does',
    about: 'BIN GROUP solves the daily property-care gap between owners, tenants, technicians, brokers, vendors, and staff. We turn maintenance from phone calls and promises into a documented workflow: request, triage, quote, approval, dispatch, evidence, tenant review, ledger, invoice, and report.',
    sections: {
      services: 'What We Do', problems: 'Problems We Solve', owners: 'What Owners Need', tenants: 'What Tenants Need', roi: 'ROI & Asset Value', hr: 'HR & Workforce Readiness', workflow: 'Trust Workflow', trust: 'Why Owners Can Trust Us', coverage: 'Service Areas', contact: 'Start With BIN GROUP'
    },
    services: [
      ['Maintenance Contracts', 'AMC and on-demand maintenance for villas, apartments, towers, hotels, schools, offices, and portfolios.'],
      ['Property Management', 'Owner coordination, tenant service, condition records, vendor supervision, renewals, and portfolio reporting.'],
      ['Tenant Service Desk', 'No-call maintenance requests with photos, emergency flags, live status, proof review, and disputes.'],
      ['Technician Dispatch', 'GPS-aware job cards, SLA expectations, before/after proof, closure notes, and performance visibility.'],
      ['Broker & Owner Growth', 'Referral capture, owner onboarding, commission visibility, property intake, quote flow, and contract activation.'],
      ['AI + WhatsApp Intake', 'AI-assisted triage, trade detection, WhatsApp intake, RFQ trigger, and faster admin review.'],
      ['Trust & Compliance', 'Owner approval, vendor RFQ, maintenance ledger, PDPL governance, evidence vault, and reports.'],
      ['HR Operations', 'Staff self-service, documents, payslip support, HR letters, safety signals, and technician readiness.'],
    ],
    problems: [
      'Too many maintenance calls with no tracking', 'Unclear repair costs and weak owner control', 'Technician work without evidence', 'Vendor work without approval trail', 'Tenant dissatisfaction from slow updates', 'No portfolio health or ROI visibility', 'Manual HR and staff document chaos', 'No audit trail for disputes and payments'
    ],
    owners: ['Clear quote before contract', '15% mobilization and payment-plan visibility', 'Approval before high-cost work', 'Monthly reports and photo proof', 'ROI and cost visibility', 'Property passport and asset health', 'Vendor/RFQ control', 'Direct CEO/admin contact'],
    tenants: ['No-call maintenance request', 'Photo/video issue evidence', 'Emergency flagging', 'Live request status', 'Technician proof review', 'Approve or dispute after repair', 'English/Arabic portal', 'Less delay and pressure'],
    roi: ['Reduce random repairs', 'Prevent payment without proof', 'Improve tenant retention', 'Protect property value', 'Forecast maintenance cost', 'Standardize vendors and technicians', 'Reduce admin time', 'Create owner/institutional reports'],
    hr: ['Digital staff dossier', 'Document upload and renewal', 'Leave, sick leave, and overtime requests', 'Payslip support', 'HR letters', 'Wellbeing and safety signals', 'Technician readiness before dispatch', 'Internal audit logs'],
    workflow: ['WhatsApp / tenant portal', 'AI triage and trade detection', 'Maintenance ticket', 'RFQ/vendor comparison', 'Owner approval', 'Technician dispatch', 'Before/after proof', 'Tenant approval or dispute', 'Ledger, invoice, and report'],
    trust: ['Licensed UAE company identity', 'No exaggerated promises: workflow and proof are shown', 'Owner approval before major cost', 'Photo evidence for every job', 'Reviewable maintenance ledger', 'Arabic/English support', 'Direct WhatsApp, email, and phone', 'Designed for portfolio and institutional scale'],
    contactText: 'Contact BIN GROUP for a maintenance contract, property management, owner onboarding, pilot property, or portfolio operation.',
    ctaStart: 'Start Your Contract', ctaWhatsApp: 'WhatsApp BIN GROUP', ctaEmail: 'Email Us', location: 'Al Ain, United Arab Emirates',
  },
  ar: {
    badge: 'ملف الشركة', title: 'BIN GROUP', headline: 'شركة تشغيل عقاري في الإمارات مبنية على ثقة المالك، راحة المستأجر، محاسبة الفني، وقيمة العائد.',
    subline: 'صيانة، إدارة عقارات، خدمة مستأجر، إرسال فنيين، وسطاء، RFQ وموردين، جاهزية HR، فرز AI، واتساب، عقود، فواتير، وتقارير إثبات في نظام واحد.',
    license: 'All Kind Building Projects Contracting LLC S.P.C · مرخصة في أبوظبي، الإمارات · رخصة تجارية رقم CN-5914744',
    stats: [['2010', 'تأسست في العين'], ['5', 'بوابات تشغيل'], ['8', 'إمارات'], ['500+', 'جاهزية محافظ']],
    navStart: 'ابدأ تفاصيل العقار', navLogin: 'دخول البوابة', navHome: 'الرئيسية', lang: 'EN',
    aboutTitle: 'ماذا تفعل BIN GROUP',
    about: 'BIN GROUP تحل فجوة العناية العقارية بين المالك والمستأجر والفني والوسيط والمورد والموظف. نحول الصيانة من مكالمات ووعود إلى سير موثق: طلب، فرز، عرض، موافقة، إرسال، إثبات، مراجعة مستأجر، سجل، فاتورة، وتقرير.',
    sections: { services: 'ما نقدمه', problems: 'ما الذي نحلّه', owners: 'احتياجات المالك', tenants: 'احتياجات المستأجر', roi: 'العائد وقيمة الأصل', hr: 'جاهزية HR والفريق', workflow: 'سير الثقة', trust: 'لماذا يثق بنا المالك', coverage: 'مناطق الخدمة', contact: 'ابدأ مع BIN GROUP' },
    services: [
      ['عقود الصيانة', 'AMC وصيانة حسب الطلب للفلل، الشقق، الأبراج، الفنادق، المدارس، المكاتب، والمحافظ.'],
      ['إدارة العقارات', 'تنسيق المالك، خدمة المستأجر، سجلات الحالة، الموردين، التجديدات، وتقارير المحفظة.'],
      ['مركز خدمة المستأجر', 'طلبات بدون اتصالات مع صور، طوارئ، حالة مباشرة، مراجعة الإثبات، واعتراضات.'],
      ['إرسال الفنيين', 'بطاقات عمل، SLA، صور قبل/بعد، ملاحظات إغلاق، وقياس أداء.'],
      ['نمو المالك والوسيط', 'إحالات، انضمام المالك، عمولات، إدخال عقار، عرض سعر، وتفعيل عقد.'],
      ['AI وواتساب', 'فرز ذكي، كشف تخصص، واتساب، RFQ، ومراجعة إدارية أسرع.'],
      ['الثقة والامتثال', 'موافقة المالك، RFQ، سجل صيانة، حوكمة PDPL، خزنة إثبات، وتقارير.'],
      ['تشغيل HR', 'خدمة ذاتية، وثائق، كشوف راتب، خطابات، سلامة، وجاهزية الفني.'],
    ],
    problems: ['مكالمات صيانة كثيرة بدون تتبع', 'تكاليف إصلاح غير واضحة', 'عمل فني بدون إثبات', 'موردون بدون موافقة', 'تأخر يزعج المستأجر', 'لا رؤية لصحة المحفظة والعائد', 'فوضى HR والوثائق', 'لا سجل تدقيق للنزاعات والمدفوعات'],
    owners: ['عرض واضح قبل العقد', '15% تعبئة وخطة دفع', 'موافقة قبل الأعمال العالية', 'تقارير وصور إثبات', 'رؤية عائد وتكلفة', 'جواز عقار وصحة أصول', 'تحكم RFQ والمورد', 'تواصل مباشر مع الإدارة'],
    tenants: ['طلب بدون اتصالات', 'رفع صورة أو فيديو', 'حالة طوارئ', 'تتبع مباشر', 'مراجعة إثبات الفني', 'تأكيد أو اعتراض', 'بوابة عربية/إنجليزية', 'تقليل التأخير والضغط'],
    roi: ['تقليل الإصلاح العشوائي', 'منع الدفع بدون إثبات', 'تحسين بقاء المستأجر', 'حماية قيمة العقار', 'توقع تكلفة الصيانة', 'توحيد الموردين والفنيين', 'تقليل وقت الإدارة', 'تقارير للملاك والمؤسسات'],
    hr: ['ملف موظف رقمي', 'رفع وتجديد الوثائق', 'إجازات ومرض وأوفر تايم', 'دعم كشوف الراتب', 'خطابات HR', 'إشارات سلامة ورفاهية', 'جاهزية الفني قبل الإرسال', 'سجلات تدقيق داخلية'],
    workflow: ['واتساب / بوابة المستأجر', 'فرز AI والتخصص', 'تذكرة صيانة', 'RFQ ومقارنة موردين', 'موافقة المالك', 'إرسال الفني', 'إثبات قبل/بعد', 'تأكيد أو اعتراض المستأجر', 'سجل وفاتورة وتقرير'],
    trust: ['هوية شركة مرخصة في الإمارات', 'لا وعود مبالغ فيها: النظام والإثبات ظاهر', 'موافقة المالك قبل التكلفة الكبيرة', 'صور إثبات لكل عمل', 'سجل صيانة قابل للمراجعة', 'دعم عربي/إنجليزي', 'واتساب وبريد وهاتف مباشر', 'مصمم للمحافظ والمؤسسات'],
    contactText: 'تواصل مع BIN GROUP لعقد صيانة، إدارة عقار، انضمام مالك، تجربة عقار، أو تشغيل محفظة.',
    ctaStart: 'ابدأ عقدك الآن', ctaWhatsApp: 'تواصل واتساب', ctaEmail: 'راسلنا', location: 'العين، الإمارات العربية المتحدة',
  },
};

function Card({ title, body, icon }: { title: string; body: string; icon: React.ReactNode }) {
  return <Paper sx={{ p: 3, height: '100%', borderRadius: 3, border: `1px solid ${line}`, boxShadow: '0 14px 36px rgba(17,24,39,.05)' }}><Stack spacing={1.3}><Box sx={{ p: 1.1, borderRadius: 2, bgcolor: alpha(gold, .12), color: gold, width: 44, height: 44, display: 'grid', placeItems: 'center' }}>{icon}</Box><Typography fontWeight={950} color={ink}>{title}</Typography><Typography variant="body2" sx={{ color: muted, lineHeight: 1.75, fontWeight: 650 }}>{body}</Typography></Stack></Paper>;
}

function Checklist({ items, dark = false }: { items: string[]; dark?: boolean }) {
  return <Grid container spacing={1.4}>{items.map((item) => <Grid item xs={12} sm={6} md={3} key={item}><Stack direction="row" spacing={1.1} alignItems="center" sx={{ p: 2, height: '100%', borderRadius: 2.5, bgcolor: dark ? 'rgba(255,255,255,.045)' : '#fff', border: `1px solid ${dark ? alpha(gold, .16) : line}` }}><CheckCircle2 size={18} color={gold} /><Typography sx={{ color: dark ? 'rgba(255,255,255,.78)' : '#374151', fontWeight: 850, lineHeight: 1.45 }}>{item}</Typography></Stack></Grid>)}</Grid>;
}

function Section({ chip, title, children, dark = false, subtitle }: { chip: string; title: string; children: React.ReactNode; dark?: boolean; subtitle?: string }) {
  return <Box sx={{ py: 9, bgcolor: dark ? '#111827' : '#fff', borderBottom: `1px solid ${dark ? alpha(gold, .18) : line}` }}><Container maxWidth="lg"><Box sx={{ textAlign: 'center', mb: 5 }}><Chip label={chip} sx={{ mb: 2, bgcolor: alpha(gold, dark ? .13 : .1), color: dark ? gold : '#6F5522', fontWeight: 950, border: `1px solid ${alpha(gold, .25)}` }} /><Typography variant="h2" fontWeight={950} sx={{ color: dark ? '#fff' : ink }}>{title}</Typography>{subtitle && <Typography variant="h6" sx={{ mt: 1.5, color: dark ? 'rgba(255,255,255,.62)' : muted, maxWidth: 830, mx: 'auto', lineHeight: 1.8, fontWeight: 700 }}>{subtitle}</Typography>}</Box>{children}</Container></Box>;
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, setLang, isRTL } = useLanguage();
  const c = content[lang];
  const whatsappDigits = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  const icons = [<Wrench size={22} />, <Building2 size={22} />, <Users size={22} />, <Zap size={22} />, <Briefcase size={22} />, <Sparkles size={22} />, <ShieldCheck size={22} />, <Award size={22} />];

  return <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: ink, direction: isRTL ? 'rtl' : 'ltr', position: 'relative', overflowX: 'hidden' }}><BrandWatermark opacity={0.06} /><Box sx={{ position: 'relative', zIndex: 1 }}>
    <Box sx={{ bgcolor: '#111827', py: .8, borderBottom: `1px solid ${alpha(gold, .2)}` }}><Container maxWidth="lg"><Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center" flexWrap="wrap"><Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#22C55E', boxShadow: '0 0 6px #22C55E' }} /><Typography sx={{ color: 'rgba(255,255,255,.78)', fontSize: '.72rem', fontWeight: 800 }}>All Kind Building Projects Contracting LLC S.P.C</Typography><Typography sx={{ color: 'rgba(255,255,255,.5)', fontSize: '.72rem', fontWeight: 700 }}>Licensed in Abu Dhabi, UAE</Typography></Stack></Container></Box>
    <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(18px)', borderBottom: `1px solid ${line}` }}><Container maxWidth="lg" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}><Button onClick={() => navigate('/')} sx={{ p: 0, minWidth: 0, color: ink, mr: 'auto' }}><Stack direction="row" spacing={1.2} alignItems="center"><Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.1 }} /><Typography fontWeight={950}>BIN GROUP</Typography></Stack></Button><Button startIcon={<Home size={17} />} onClick={() => navigate('/')} sx={{ color: gold, fontWeight: 950 }}>{c.navHome}</Button><Button onClick={() => navigate('/onboarding')} sx={{ bgcolor: goldLight, color: '#111827', fontWeight: 950 }}>{c.navStart}</Button><Button startIcon={<LogIn size={17} />} onClick={() => navigate('/login')} sx={{ color: gold, fontWeight: 950 }}>{c.navLogin}</Button><Button startIcon={<Globe size={17} />} onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} sx={{ color: gold, fontWeight: 950 }}>{c.lang}</Button></Container></Box>
    <Box sx={{ background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)', py: { xs: 8, md: 12 }, textAlign: 'center', position: 'relative', overflow: 'hidden' }}><Container maxWidth="lg"><Stack spacing={4} alignItems="center"><Chip label={c.badge} sx={{ bgcolor: alpha(gold, .13), color: gold, fontWeight: 950, border: `1px solid ${alpha(gold, .3)}` }} /><Box component="img" src="/logo.png" alt="BIN GROUP" sx={{ width: { xs: 140, md: 178 }, height: { xs: 140, md: 178 }, borderRadius: '26px', border: `2.5px solid ${alpha(gold, .65)}`, boxShadow: `0 24px 72px ${alpha(gold, .42)}` }} /><Typography sx={{ color: gold, fontWeight: 950, letterSpacing: 7, fontSize: { xs: '2rem', md: '3rem' }, textTransform: 'uppercase' }}>{c.title}</Typography><Typography variant="h5" sx={{ color: 'rgba(255,255,255,.82)', fontWeight: 800, maxWidth: 900, lineHeight: 1.75 }}>{c.headline}</Typography><Typography sx={{ color: 'rgba(255,255,255,.58)', maxWidth: 900, lineHeight: 1.8 }}>{c.subline}</Typography><Grid container spacing={2} justifyContent="center" sx={{ maxWidth: 780 }}>{c.stats.map(([v, l]) => <Grid item xs={6} sm={3} key={`${v}-${l}`}><Typography sx={{ color: gold, fontWeight: 950, fontSize: '2rem' }}>{v}</Typography><Typography sx={{ color: 'rgba(255,255,255,.55)', fontWeight: 800 }}>{l}</Typography></Grid>)}</Grid><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{c.ctaStart}</Button><Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ borderColor: alpha(gold, .45), color: gold, fontWeight: 950 }}>{c.ctaWhatsApp}</Button></Stack><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.35)', fontWeight: 700 }}>{c.license}</Typography></Stack></Container></Box>
    <Section chip="WHO WE ARE" title={c.aboutTitle} subtitle={c.about}><Grid container spacing={3}>{c.services.slice(0, 3).map(([title, body], i) => <Grid item xs={12} md={4} key={title}><Card title={title} body={body} icon={icons[i]} /></Grid>)}</Grid></Section>
    <Section dark chip={c.sections.services} title={c.sections.services}><Grid container spacing={3}>{c.services.map(([title, body], i) => <Grid item xs={12} sm={6} md={3} key={title}><Card title={title} body={body} icon={icons[i]} /></Grid>)}</Grid></Section>
    <Section chip={c.sections.problems} title={c.sections.problems}><Checklist items={c.problems} /></Section>
    <Section dark chip={c.sections.owners} title={c.sections.owners}><Checklist dark items={c.owners} /></Section>
    <Section chip={c.sections.tenants} title={c.sections.tenants}><Checklist items={c.tenants} /></Section>
    <Section dark chip={c.sections.roi} title={c.sections.roi}><Checklist dark items={c.roi} /></Section>
    <Section chip={c.sections.workflow} title={c.sections.workflow}><Grid container spacing={2}>{c.workflow.map((step, i) => <Grid item xs={12} sm={6} md={4} key={step}><Paper sx={{ p: 2.4, borderRadius: 3, border: `1px solid ${line}` }}><Stack direction="row" spacing={1.5} alignItems="center"><Box sx={{ width: 34, height: 34, borderRadius: '50%', bgcolor: alpha(gold, .15), color: '#6F5522', display: 'grid', placeItems: 'center', fontWeight: 950 }}>{i + 1}</Box><Typography fontWeight={900}>{step}</Typography></Stack></Paper></Grid>)}</Grid></Section>
    <Section dark chip={c.sections.hr} title={c.sections.hr}><Checklist dark items={c.hr} /></Section>
    <Section chip={c.sections.trust} title={c.sections.trust}><Checklist items={c.trust} /></Section>
    <Section dark chip={c.sections.coverage} title={c.sections.coverage}><Stack direction="row" flexWrap="wrap" justifyContent="center" sx={{ gap: 1.5 }}>{serviceAreas.map(area => <Box key={area} sx={{ px: 3, py: 1.2, bgcolor: 'rgba(255,255,255,.05)', border: `1.5px solid ${alpha(gold, .28)}`, borderRadius: 2.5 }}><Stack direction="row" spacing={1} alignItems="center"><MapPin size={14} color={gold} /><Typography sx={{ color: '#fff', fontWeight: 850 }}>{area}</Typography></Stack></Box>)}</Stack></Section>
    <Box sx={{ py: 10, background: 'linear-gradient(160deg, #0B0B0C 0%, #1a1a2e 55%, #111827 100%)' }}><Container maxWidth="md"><Stack spacing={4} alignItems="center" textAlign="center"><Chip label={c.sections.contact} sx={{ bgcolor: alpha(gold, .12), color: gold, fontWeight: 950 }} /><Typography variant="h2" fontWeight={950} sx={{ color: gold }}>{c.sections.contact}</Typography><Typography variant="h6" sx={{ color: 'rgba(255,255,255,.7)', maxWidth: 650 }}>{c.contactText}</Typography><Grid container spacing={2}>{[[<Phone size={22} />, 'Phone', CONTACT.phone, `tel:${CONTACT.phone}`], [<MessageSquare size={22} />, 'WhatsApp', CONTACT.whatsapp, `https://wa.me/${whatsappDigits}`], [<Mail size={22} />, 'Email', CONTACT.email, `mailto:${CONTACT.email}`], [<MapPin size={22} />, 'Location', c.location, '']].map(([icon, label, value, href]: any) => <Grid item xs={12} sm={6} key={label}><Paper component={href ? 'a' : 'div'} href={href || undefined} target={href?.startsWith('http') ? '_blank' : undefined} sx={{ p: 3, bgcolor: 'rgba(255,255,255,.05)', border: `1px solid ${alpha(gold, .22)}`, borderRadius: 3, display: 'block', textDecoration: 'none' }}><Stack direction="row" spacing={2} alignItems="center"><Box sx={{ color: gold }}>{icon}</Box><Box textAlign="left"><Typography variant="caption" sx={{ color: alpha(gold, .7), fontWeight: 900 }}>{label}</Typography><Typography sx={{ color: '#fff', fontWeight: 850 }}>{value}</Typography></Box></Stack></Paper></Grid>)}</Grid><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>{c.ctaWhatsApp}</Button><Button variant="outlined" onClick={() => window.open(`mailto:${CONTACT.email}`, '_blank')} sx={{ borderColor: alpha(gold, .45), color: gold, fontWeight: 950 }}>{c.ctaEmail}</Button><Button variant="outlined" onClick={() => navigate('/onboarding')} sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.22)', fontWeight: 950 }}>{c.ctaStart}</Button></Stack></Stack></Container></Box>
  </Box></Box>;
}

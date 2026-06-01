import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { Building2, CheckCircle2, FileText, Languages, Mail, MapPin, Phone, ShieldCheck, Sparkles, Wrench } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { CeoContactButtons } from '../../components/CeoContactButtons';
import { useLanguage } from '../../context/LanguageContext';

type Sector = { eyebrow: string; title: string; subtitle: string; bullets: string[] };

const en = {
  chip: 'UAE SOVEREIGN PROPERTY CARE OS',
  title: 'BIN GROUP — Smart Maintenance, Property Management & Direct Technician Operations',
  desc: 'One operating system for serious UAE property owners: annual maintenance contracts from AED 50,000+, property management at the 5% model, 15% mobilization, tenant service requests, technician GPS dispatch, before-and-after proof, broker referrals, PDFs, AI design previews, and property passport records.',
  primary: 'Request Contract', login: 'Portal Login', onboard: 'Onboard Property', language: 'العربية',
  proofTitle: 'What BIN GROUP solves',
  proofDesc: 'BIN GROUP removes scattered calls, unclear service history, missing proof, delayed field coordination, weak reporting, and poor owner visibility. Owners, tenants, technicians, and brokers operate from one verified property-care chain.',
  pricingTitle: 'Contracts & pricing model', coverageTitle: 'Built for every serious UAE property', inquiryTitle: 'Request a property audit', inquiryDesc: 'Tell BIN GROUP what you manage. We prepare the right maintenance, property management, or full-coverage contract path.',
  sectors: {
    owners: { eyebrow: 'Owner Command', title: 'Turn every property into a controlled digital asset.', subtitle: 'Contracts, 15% mobilization, payment plans, tenant service, evidence, reports, and property passport records.', bullets: ['AED 50,000+ annual maintenance contracts', '5% property management model', 'Maintenance + property management full coverage', 'Owner reports, approvals, PDFs, and service history'] },
    tenants: { eyebrow: 'Tenant Care', title: 'Submit clear maintenance requests with proof.', subtitle: 'Tenants send category, priority, photos, location context, and track the service path.', bullets: ['Photo-based service request', 'Priority and category', 'GPS/location context', 'Completion confirmation'] },
    technicians: { eyebrow: 'Technician Operations', title: 'Field teams receive structured work and accountability.', subtitle: 'Technicians see jobs, route context, proof requirements, safety notes, and completion workflow.', bullets: ['Direct job feed', 'GPS dispatch context', 'Before/after proof', 'SLA performance visibility'] },
    brokers: { eyebrow: 'Broker Growth', title: 'Broker referrals become structured owner opportunities.', subtitle: 'Referral, property, and commission-ready records stay inside the same platform.', bullets: ['Lead registration', 'Owner referral visibility', 'Property pipeline records', 'Commission-ready tracking'] },
    security: { eyebrow: 'Sovereign Records', title: 'Every property builds a verified digital passport.', subtitle: 'Contracts, tickets, invoices, photos, and reports become long-term property intelligence.', bullets: ['Role-based access', 'Proof-of-work history', 'PDF traceability', 'UAE-ready reporting'] },
    'ai-design-studio': { eyebrow: 'AI Design Studio', title: 'Visualize upgrades before work begins.', subtitle: 'AI design previews connect property improvement ideas to scope, quote, and owner approval.', bullets: ['Interior ideas', 'Exterior ideas', 'Scope support', 'Owner approvals'] }
  } as Record<string, Sector>
};

const ar = {
  chip: 'نظام سيادي ذكي للعناية بالعقارات في الإمارات',
  title: 'BIN GROUP — صيانة ذكية وإدارة عقارات وتشغيل فني مباشر',
  desc: 'نظام واحد للملاك الجادين في الإمارات: عقود صيانة سنوية من 50,000 درهم، إدارة عقارات بنموذج 5%، دفعة تفعيل 15%، طلبات المستأجرين، تتبع الفنيين عبر GPS، إثبات قبل وبعد، إحالات الوسطاء، ملفات PDF، تصميم AI، وسجل رقمي للعقار.',
  primary: 'طلب عقد', login: 'دخول البوابة', onboard: 'تسجيل العقار', language: 'English',
  proofTitle: 'ما الذي تحله BIN GROUP؟',
  proofDesc: 'BIN GROUP تنهي الاتصالات المتكررة، ضياع الإثباتات، تأخير التنسيق الميداني، ضعف التقارير، وعدم وضوح رؤية المالك. كل الأطراف تعمل داخل سلسلة تشغيل موثقة واحدة.',
  pricingTitle: 'نموذج العقود والأسعار', coverageTitle: 'مصمم لكل عقار جاد في الإمارات', inquiryTitle: 'اطلب تقييم عقارك', inquiryDesc: 'أخبر BIN GROUP بما تديره لنجهز مسار الصيانة أو الإدارة أو التغطية الكاملة.',
  sectors: {
    owners: { eyebrow: 'قيادة الملاك', title: 'حوّل كل عقار إلى أصل رقمي منظم.', subtitle: 'عقود، 15% تفعيل، خطط دفع، خدمة مستأجرين، إثبات، تقارير، وسجل عقاري.', bullets: ['عقود صيانة سنوية من 50,000 درهم+', 'إدارة عقارية بنموذج 5%', 'صيانة + إدارة عقارات بتغطية كاملة', 'تقارير وموافقات وملفات PDF وسجل خدمة'] },
    tenants: { eyebrow: 'رعاية المستأجر', title: 'طلب صيانة واضح مع إثبات.', subtitle: 'المستأجر يرسل التصنيف والأولوية والصور والموقع ويتابع الخدمة.', bullets: ['طلب خدمة بالصور', 'أولوية وتصنيف', 'سياق الموقع', 'تأكيد الإنجاز'] },
    technicians: { eyebrow: 'تشغيل الفنيين', title: 'الفريق الميداني يستلم عمل منظم ومسؤولية واضحة.', subtitle: 'المهام، الموقع، متطلبات الإثبات، السلامة، وإغلاق العمل داخل النظام.', bullets: ['قائمة مهام مباشرة', 'سياق GPS', 'إثبات قبل وبعد', 'وضوح أداء SLA'] },
    brokers: { eyebrow: 'نمو الوسطاء', title: 'إحالات الوسطاء تتحول إلى فرص ملاك منظمة.', subtitle: 'الإحالات والعقارات والعمولات الجاهزة داخل نفس المنصة.', bullets: ['تسجيل الإحالة', 'وضوح إحالة المالك', 'سجل فرص العقارات', 'تتبع العمولة'] },
    security: { eyebrow: 'سجلات سيادية', title: 'كل عقار يحصل على جواز رقمي موثق.', subtitle: 'العقود والطلبات والفواتير والصور والتقارير تتحول إلى ذكاء عقاري دائم.', bullets: ['صلاحيات حسب الدور', 'تاريخ إثبات العمل', 'تتبع PDF', 'تقارير جاهزة للإمارات'] },
    'ai-design-studio': { eyebrow: 'استوديو التصميم AI', title: 'شاهد التطوير قبل بدء العمل.', subtitle: 'تصاميم AI تربط الأفكار بالنطاق والتكلفة وموافقة المالك.', bullets: ['أفكار داخلية', 'أفكار خارجية', 'دعم النطاق', 'موافقات المالك'] }
  } as Record<string, Sector>
};

const pricing = [['Annual Maintenance Contracts', 'AED 50,000+'], ['Property Management', '5% model'], ['Mobilization', '15% upfront'], ['Payment Plans', 'Monthly / Quarterly / Annual']];
const problems = ['No-call owner journey', 'Direct technician workfeed', 'GPS dispatch context', 'Before-and-after proof', 'PDF contracts and reports', 'AI property intelligence', 'Broker referral records', 'Property passport history'];
const coverage = ['Villas', 'Apartments', 'Buildings', 'Towers', 'Hotels', 'Schools', 'Clinics', 'Hospitals', 'Offices', 'Malls', 'Majlis', 'Warehouses', 'Staff Accommodation', 'Retail', 'Industrial', 'Mixed-use Assets'];

export default function PublicMarketingPage({ page = 'home' }: { page?: string }) {
  const params = useParams();
  const { lang, isRTL } = useLanguage();
  const c = lang === 'ar' ? ar : en;
  const key = page === 'dynamic' ? params.page || 'home' : page;
  const sector = key === 'home' ? null : c.sectors[key || ''];
  if (key !== 'home' && !sector) return <PublicMarketingPage page="home" />;
  return <Box sx={{ minHeight: '100vh', bgcolor: '#000', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}><Nav c={c} />{sector ? <Sector c={sector} /> : <Hero c={c} />}<Container maxWidth="xl" sx={{ pb: 8 }}><Trust /><Problems c={c} /><Pricing c={c} /><Coverage c={c} /><Inquiry c={c} /></Container></Box>;
}

function Nav({ c }: any) {
  const { lang, setLang } = useLanguage();
  return <Box sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'rgba(0,0,0,.88)', borderBottom: '1px solid rgba(198,167,94,.18)' }}><Container maxWidth="xl" sx={{ py: 1.1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Stack component={Link} to="/" direction="row" spacing={1.2} alignItems="center" sx={{ color: '#fff', textDecoration: 'none' }}><Box component="img" src="/logo.png" sx={{ width: 38, height: 38, borderRadius: 1 }} /><Typography fontWeight={950}>BIN <Box component="span" sx={{ color: binThemeTokens.gold }}>GROUP</Box></Typography></Stack><Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}><Button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} startIcon={<Languages size={17} />} sx={{ color: binThemeTokens.gold, fontWeight: 900, minWidth: 100 }}>{c.language}</Button><Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>{c.primary}</Button></Stack></Container></Box>;
}

function Hero({ c }: any) {
  return <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(198,167,94,.16)' }}><Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,.25), transparent 34rem), #050505' }} /><Container maxWidth="xl" sx={{ position: 'relative', py: { xs: 7, md: 11 } }}><Grid container spacing={5} alignItems="center"><Grid item xs={12} md={7}><Chip label={c.chip} sx={{ mb: 3, bgcolor: alpha(binThemeTokens.gold,.14), color: binThemeTokens.gold, fontWeight: 950 }} /><Typography variant="h1" sx={{ fontSize: { xs: 38, md: 66 }, lineHeight: .98, fontWeight: 950, mb: 3 }}>{c.title}</Typography><Typography variant="h6" sx={{ color: 'rgba(255,255,255,.76)', lineHeight: 1.65, fontWeight: 800 }}>{c.desc}</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}><Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}>{c.primary}</Button><Button component={Link} to="/login" variant="outlined" sx={{ color: '#fff', borderColor: 'rgba(255,255,255,.28)', fontWeight: 950, py: 1.5 }}>{c.login}</Button><Button component={Link} to="/company-profile" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, py: 1.5 }}>{c.onboard}</Button></Stack></Grid><Grid item xs={12} md={5}><Command /></Grid></Grid></Container></Box>;
}

function Sector({ c }: { c: Sector }) { return <Container maxWidth="xl" sx={{ py: 9 }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{c.eyebrow}</Typography><Typography variant="h2" sx={{ fontWeight: 950, mt: 1, mb: 2 }}>{c.title}</Typography><Typography variant="h6" sx={{ color: 'rgba(255,255,255,.72)', maxWidth: 850 }}>{c.subtitle}</Typography><Stack spacing={1.2} sx={{ mt: 3 }}>{c.bullets.map((b) => <Stack key={b} direction="row" spacing={1.2} alignItems="center"><CheckCircle2 size={18} color={binThemeTokens.gold} /><Typography>{b}</Typography></Stack>)}</Stack></Container>; }
function Command() { return <Paper sx={{ p: 2.5, borderRadius: 4, bgcolor: 'rgba(18,18,20,.92)', border: '1px solid rgba(198,167,94,.28)' }}><Stack spacing={1.5}>{[['Owner Contract', '15% mobilization + payment plan', 'AED 50K+'], ['Tenant Request', 'Photo + priority + GPS', 'LIVE'], ['Technician Job', 'Direct workfeed + proof', 'ASSIGNED'], ['AI Design Studio', 'Upgrade preview', 'READY']].map(([a,b,c]) => <Box key={a} sx={{ p: 2, borderRadius: 2, bgcolor: 'rgba(255,255,255,.035)' }}><Stack direction="row" justifyContent="space-between"><Box><Typography fontWeight={900}>{a}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.58)' }}>{b}</Typography></Box><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{c}</Typography></Stack></Box>)}</Stack></Paper>; }
function Trust() { return <Grid container spacing={2} sx={{ mt: 5 }}>{[['Sovereign records', <ShieldCheck />], ['GPS dispatch', <Wrench />], ['PDF proof', <FileText />], ['Property passport', <Building2 />]].map(([a,i]) => <Grid item xs={12} md={3} key={String(a)}><Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}><Box sx={{ color: binThemeTokens.gold }}>{i}</Box><Typography fontWeight={950}>{a}</Typography></Paper></Grid>)}</Grid>; }
function Problems({ c }: any) { return <Box sx={{ mt: 8 }}><Typography variant="h4" fontWeight={950}>{c.proofTitle}</Typography><Typography sx={{ color: 'rgba(255,255,255,.66)', my: 2, maxWidth: 980 }}>{c.proofDesc}</Typography><Grid container spacing={2}>{problems.map((p) => <Grid item xs={12} sm={6} md={3} key={p}><Paper sx={{ p: 2.2, height: '100%', bgcolor: alpha(binThemeTokens.gold,.07), border: '1px solid rgba(198,167,94,.18)' }}><Sparkles size={20} color={binThemeTokens.gold} /><Typography fontWeight={900} sx={{ mt: 1 }}>{p}</Typography></Paper></Grid>)}</Grid></Box>; }
function Pricing({ c }: any) { return <Box sx={{ mt: 8 }}><Typography variant="h4" fontWeight={950} sx={{ mb: 3 }}>{c.pricingTitle}</Typography><Grid container spacing={2}>{pricing.map(([a,b]) => <Grid item xs={12} md={3} key={a}><Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,.025)', border: '1px solid rgba(255,255,255,.07)' }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)', fontWeight: 950 }}>{a}</Typography><Typography variant="h5" fontWeight={950} sx={{ color: binThemeTokens.gold }}>{b}</Typography></Paper></Grid>)}</Grid></Box>; }
function Coverage({ c }: any) { return <Box sx={{ mt: 8 }}><Typography variant="h4" fontWeight={950} sx={{ mb: 2 }}>{c.coverageTitle}</Typography><Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>{coverage.map((x) => <Chip key={x} label={x} sx={{ color: '#fff', bgcolor: alpha(binThemeTokens.gold,.1), border: '1px solid rgba(198,167,94,.22)', fontWeight: 800 }} />)}</Stack></Box>; }
function Inquiry({ c }: any) { return <Box sx={{ mt: 8 }}><Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(22,22,24,.82)', border: '1px solid rgba(198,167,94,.2)' }}><Grid container spacing={3}><Grid item xs={12} md={5}><Typography variant="h4" fontWeight={950}>{c.inquiryTitle}</Typography><Typography sx={{ color: 'rgba(255,255,255,.66)', mt: 1 }}>{c.inquiryDesc}</Typography><Stack spacing={1} sx={{ my: 3 }}><Stack direction="row" spacing={1}><Mail size={18} color={binThemeTokens.gold}/><Typography>owner@bin-group.com</Typography></Stack><Stack direction="row" spacing={1}><Phone size={18} color={binThemeTokens.gold}/><Typography>+971 50 123 4567</Typography></Stack><Stack direction="row" spacing={1}><MapPin size={18} color={binThemeTokens.gold}/><Typography>United Arab Emirates</Typography></Stack></Stack><CeoContactButtons /></Grid><Grid item xs={12} md={7}><Grid container spacing={2}>{['Name','Phone / Email','Property Type','Emirate'].map((l)=><Grid item xs={12} md={6} key={l}><TextField fullWidth label={l}/></Grid>)}<Grid item xs={12}><TextField fullWidth multiline minRows={4} label="Portfolio Details"/></Grid><Grid item xs={12}><Button disabled fullWidth variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{c.primary}</Button></Grid></Grid></Grid></Grid></Paper></Box>; }

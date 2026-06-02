import React, { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, IconButton, Link as MuiLink, Paper, Stack, Typography, alpha } from '@mui/material';
import { Award, Briefcase, Building2, CheckCircle2, Globe, Mail, MapPin, MessageSquare, Phone, PlayCircle, Rocket, Shield, ShieldCheck, Sparkles, Users, Video, Wrench, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const PUBLIC_CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'owner@bin-group.com' };

type DemoId = 'owner' | 'tenant' | 'technician' | 'broker' | 'gps' | 'documents' | 'ai-design';
type DemoVideo = { id: DemoId; title: string; length: string; route: string; icon: React.ReactNode; summary: string; bullets: string[] };
type Service = { title: string; desc: string; icon: React.ReactNode };

type PageCopy = {
  chips: string[];
  companyName: string;
  headline: string;
  requestContract: string;
  watchDemo: string;
  videos: string;
  licenseTitle: string;
  licenseInfo: string;
  aboutText: string;
  pricingModels: { label: string; value: string; note: string }[];
  solveOverline: string;
  solveTitle: string;
  solveText: string;
  solved: string[];
  uaeFirstTitle: string;
  uaeFirstText: string;
  servicesOverline: string;
  servicesTitle: string;
  services: Service[];
  workflowsOverline: string;
  workflowsTitle: string;
  workflowsText: string;
  publicFlows: { title: string; text: string }[];
  demoOverline: string;
  demoTitle: string;
  demoText: string;
  demoPlayer: string;
  watchThisDemo: string;
  openRelatedPage: string;
  preview: string;
  demoVideos: DemoVideo[];
  missionTitle: string;
  missionText: string;
  visionTitle: string;
  visionText: string;
  contactTitle: string;
  whatsappLabel: string;
  phoneLabel: string;
  emailLabel: string;
  whatsappButton: string;
  coverageTitle: string;
  serviceAreas: string[];
  footerLine: string;
  terms: string;
  privacy: string;
};

function makeCopy(lang: 'en' | 'ar'): PageCopy {
  const ar = lang === 'ar';

  const demoVideos: DemoVideo[] = ar ? [
    { id: 'owner', title: 'عرض عقود الملاك', length: '03:40', route: '/owners', icon: <Building2 size={28} />, summary: 'يرسل المالك بيانات العقار، يحصل على تسعيرة مخصصة، يختار نطاق العقد وخطة الدفع، ثم يبدأ التسجيل.', bullets: ['إدخال العقار', 'تسعيرة مخصصة', 'اختيار العقد', 'خطة الدفع'] },
    { id: 'tenant', title: 'عرض خدمة المستأجر', length: '02:55', route: '/tenants', icon: <Users size={28} />, summary: 'يرسل المستأجر طلب صيانة مع صورة وتصنيف وأولوية وتأكيد موقع ومتابعة حالة الخدمة.', bullets: ['طلب بالصورة', 'تصنيف الأولوية', 'تتبع الحالة', 'تأكيد الإنجاز'] },
    { id: 'technician', title: 'عرض عمل الفني الميداني', length: '03:10', route: '/technicians', icon: <Wrench size={28} />, summary: 'يستلم الفني بطاقة المهمة، يرى مسار الموقع، يرفع الإثبات، يحدّث الحالة، ويغلق سجل الخدمة.', bullets: ['بطاقة العمل', 'مسار GPS', 'رفع الإثبات', 'سجل الإنجاز'] },
    { id: 'broker', title: 'عرض شريك الوساطة', length: '02:20', route: '/brokers', icon: <Briefcase size={28} />, summary: 'يسجل الوسيط إحالات الملاك وفرص العقارات وخط المبيعات وسجلات جاهزة للعمولة.', bullets: ['إحالة مالك', 'سجل عقار', 'حالة الخط', 'أثر العمولة'] },
    { id: 'gps', title: 'عرض إرسال GPS', length: '02:45', route: '/request-demo', icon: <MapPin size={28} />, summary: 'يوضح كيف يعمل موقع العقار وتصنيف الطلب ومسار الفني معاً لتسريع تنفيذ الخدمة.', bullets: ['سياق الموقع', 'رؤية المسار', 'وضوح الإرسال', 'استجابة أسرع'] },
    { id: 'documents', title: 'عرض PDF والتقارير', length: '02:35', route: '/request-demo', icon: <Video size={28} />, summary: 'يوضح العقود وإثبات الخدمة وتاريخ الصيانة وسجلات الدخول والخروج وتقارير المالك.', bullets: ['العقود', 'إثبات الخدمة', 'تاريخ الصيانة', 'تقارير المالك'] },
    { id: 'ai-design', title: 'عرض استوديو التصميم AI', length: '03:25', route: '/ai-design-studio', icon: <Sparkles size={28} />, summary: 'يعرض كيف يستكشف الملاك أفكار التصميم الداخلي والخارجي ونطاق التطوير والمواد ومسار التسعير.', bullets: ['فكرة التصميم', 'حزمة النطاق', 'مسار المواد', 'اتجاه التسعير'] },
  ] : [
    { id: 'owner', title: 'Owner Contract Demo', length: '03:40', route: '/owners', icon: <Building2 size={28} />, summary: 'Owner submits property details, receives a custom quote, selects contract scope, chooses payment plan, and starts onboarding.', bullets: ['Property intake', 'Custom quote', 'Contract selection', 'Payment plan'] },
    { id: 'tenant', title: 'Tenant Service Demo', length: '02:55', route: '/tenants', icon: <Users size={28} />, summary: 'Tenant submits a maintenance request with photo proof, category, priority, location confirmation, and service status tracking.', bullets: ['Photo request', 'Priority category', 'Status tracking', 'Completion confirmation'] },
    { id: 'technician', title: 'Technician Field Demo', length: '03:10', route: '/technicians', icon: <Wrench size={28} />, summary: 'Technician receives the job card, sees route context, uploads proof, updates status, and completes the service record.', bullets: ['Job card', 'GPS route', 'Proof upload', 'Completion record'] },
    { id: 'broker', title: 'Broker Partner Demo', length: '02:20', route: '/brokers', icon: <Briefcase size={28} />, summary: 'Broker registers owner referrals, property leads, pipeline records, and commission-ready activity logs.', bullets: ['Owner lead', 'Property record', 'Pipeline status', 'Commission-ready trail'] },
    { id: 'gps', title: 'GPS Dispatch Demo', length: '02:45', route: '/request-demo', icon: <MapPin size={28} />, summary: 'Shows how property location, request category, and technician route context work together for faster service execution.', bullets: ['Location context', 'Route visibility', 'Dispatch clarity', 'Faster response'] },
    { id: 'documents', title: 'PDF & Report Demo', length: '02:35', route: '/request-demo', icon: <Video size={28} />, summary: 'Explains contracts, service proof, maintenance history, move-in/out records, and owner-ready reports.', bullets: ['Contracts', 'Service proof', 'Maintenance history', 'Owner reports'] },
    { id: 'ai-design', title: 'AI Design Studio Demo', length: '03:25', route: '/ai-design-studio', icon: <Sparkles size={28} />, summary: 'Shows how owners can explore interior/exterior concepts, improvement scopes, material direction, and quote paths.', bullets: ['Design concept', 'Scope package', 'Material path', 'Quote direction'] },
  ];

  return ar ? {
    chips: ['نظام سيادي للعناية بالعقارات في الإمارات', 'العروض والفيديوهات متاحة'],
    companyName: 'BIN GROUP - الإمارات للصيانة العامة وإدارة العقارات',
    headline: 'نظام إماراتي موحد للصيانة وإدارة العقارات: عقود الملاك، طلبات المستأجرين، إرسال الفنيين، إثبات قبل وبعد، فيديوهات تعريفية، وذكاء عقاري في منصة واحدة.',
    requestContract: 'طلب عقد',
    watchDemo: 'مشاهدة العرض',
    videos: 'الفيديوهات',
    licenseTitle: 'الرخصة / نموذج التشغيل',
    licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | نموذج تشغيل موحد للعناية بالعقارات في الإمارات',
    aboutText: 'BIN GROUP تدير سلسلة العناية بالعقار من تسعيرة المالك إلى اختيار العقد، دفعة التفعيل 15%، خطط الدفع الشهرية أو الربع سنوية أو السنوية، طلبات المستأجرين، إرسال الفنيين عبر GPS، إثبات قبل وبعد، إحالات الوسطاء، معاينات التصميم بالذكاء الاصطناعي، والفيديوهات التعليمية وسجلات جواز العقار.',
    pricingModels: [
      { label: 'عقود الصيانة', value: 'تسعيرة مخصصة', note: 'يتم إعدادها حسب حجم العقار، النطاق، الحالة، مستوى الخدمة، تكرار الزيارات، ومتطلبات المحفظة.' },
      { label: 'إدارة العقارات', value: 'نموذج 5%', note: 'يمكن احتساب إدارة العقار بنسبة 5% لكل وحدة مؤجرة أو حسب اتفاق المحفظة.' },
      { label: 'دفعة التفعيل', value: '15% مقدماً', note: 'مبلغ تفعيل أولي قبل اكتمال التسجيل وتحريك فريق الخدمة.' },
      { label: 'خطط الدفع', value: 'شهري / ربع سنوي / سنوي', note: 'خطط مرنة للملاك الجادين وعقود الخدمة طويلة المدى.' },
    ],
    solveOverline: 'ما الذي نحلّه',
    solveTitle: 'نظام تشغيل واحد لسلسلة العناية الكاملة بالعقار',
    solveText: 'BIN GROUP تربط الملاك والمستأجرين والفنيين والوسطاء في مسار تشغيل واضح. النظام يستبدل الاتصالات المتفرقة والمتابعات اليدوية وضياع سجل الخدمة وتأخير الإثبات بتنفيذ رقمي منظم.',
    solved: ['توقف ملاحقة الاتصالات والتحديثات غير الواضحة.', 'المستأجر يرسل طلباً مع صور وسياق موقع.', 'الفني يستلم تعليمات مباشرة ومتطلبات إثبات واضحة.', 'الوسطاء يدعمون النمو من خلال سجلات إحالة منظمة.', 'العروض والفيديوهات تبني الثقة قبل التسجيل.', 'كل عقار يبني جوازاً رقمياً للعقود والتذاكر والإثباتات والتاريخ.'],
    uaeFirstTitle: 'مصمم أولاً لسوق الإمارات',
    uaeFirstText: 'اللغة، اتجاه الصفحة، العقود، أسلوب الخدمة، وتوقعات الملاك مصممة لتجربة إماراتية احترافية وليست ترجمة سطحية.',
    servicesOverline: 'الخدمات ونموذج الإيرادات',
    servicesTitle: 'ماذا تقدم BIN GROUP',
    services: [
      { title: 'عقود صيانة مخصصة', desc: 'صيانة وقائية وطارئة حسب نوع العقار ونطاق العمل ومستوى SLA.', icon: <Wrench size={30} /> },
      { title: 'إدارة العقارات', desc: 'تنسيق المستأجرين، متابعة التشغيل، التقارير، وسجلات العقار بنموذج واضح.', icon: <Briefcase size={30} /> },
      { title: 'تشغيل الفنيين', desc: 'مهام مباشرة، موقع GPS، متطلبات إثبات، وإغلاق موثق لكل خدمة.', icon: <Zap size={30} /> },
      { title: 'رعاية المستأجرين', desc: 'طلبات صيانة بالصور، أولوية، متابعة حالة، وتأكيد الإنجاز.', icon: <Users size={30} /> },
      { title: 'جواز العقار الرقمي', desc: 'تاريخ العقود والتذاكر والفواتير والصور والتقارير في سجل واحد.', icon: <ShieldCheck size={30} /> },
      { title: 'تصميم AI', desc: 'معاينات داخلية وخارجية تربط أفكار التطوير بالنطاق والتكلفة والموافقة.', icon: <Sparkles size={30} /> },
    ],
    workflowsOverline: 'مسارات عامة',
    workflowsTitle: 'قيمة واضحة للملاك والمستأجرين والفنيين والوسطاء',
    workflowsText: 'تبقى الإدارة الداخلية خاصة. الصفحة العامة تعرض فقط القيمة التي يحصل عليها العملاء والشركاء من المنصة.',
    publicFlows: [
      { title: 'مسار المالك', text: 'بيانات العقار، التسعيرة، اختيار العقد، دفعة التفعيل، خطة الدفع، ملفات PDF، الفيديوهات، ولوحة التحكم.' },
      { title: 'مسار المستأجر', text: 'طلب بالصور، التصنيف، الأولوية، تأكيد الموقع، تتبع الخدمة، وتأكيد الإنجاز.' },
      { title: 'مسار الفني', text: 'مهام مباشرة، سياق GPS، رفع الإثبات، إغلاق العمل، ووضوح الأداء.' },
      { title: 'مسار الوسيط', text: 'إحالات الملاك، فرص العقارات، سجلات الخط، وتتبع جاهز للعمولة.' },
    ],
    demoOverline: 'العروض والفيديوهات',
    demoTitle: 'شاهد المنصة قبل التسجيل',
    demoText: 'بطاقات عرض عامة لكل رحلة: عقد المالك، طلب المستأجر، عمل الفني، شريك الوساطة، إرسال GPS، تقارير PDF، واستوديو التصميم AI.',
    demoPlayer: 'مشغل العرض العام',
    watchThisDemo: 'شاهد هذا العرض',
    openRelatedPage: 'افتح الصفحة المرتبطة',
    preview: 'معاينة',
    demoVideos,
    missionTitle: 'المهمة',
    missionText: 'رفع معيار الصيانة العامة وإدارة العقارات في الإمارات من خلال نظام رقمي شفاف، عقود واضحة، إثبات خدمة، وتشغيل فني موثوق.',
    visionTitle: 'الرؤية',
    visionText: 'أن تصبح BIN GROUP منصة إماراتية رائدة للعناية الذكية بالعقارات، تبدأ من الإمارات ثم تتوسع عالمياً.',
    contactTitle: 'تواصل مع BIN GROUP',
    whatsappLabel: 'واتساب',
    phoneLabel: 'الهاتف',
    emailLabel: 'البريد الإلكتروني',
    whatsappButton: 'واتساب BIN GROUP',
    coverageTitle: 'تغطية الخدمة في الإمارات',
    serviceAreas: ['أبوظبي', 'العين', 'دبي', 'الشارقة', 'عجمان', 'رأس الخيمة', 'الفجيرة', 'أم القيوين', 'كل الإمارات'],
    footerLine: 'نظام العناية بالعقارات في الإمارات | صيانة ذكية | إدارة عقارات | إرسال فنيين | فيديوهات تعريفية | صنع في الإمارات',
    terms: 'شروط الخدمة',
    privacy: 'سياسة الخصوصية',
  } : {
    chips: ['UAE SOVEREIGN PROPERTY CARE OS', 'DEMO + VIDEOS AVAILABLE'],
    companyName: 'BIN GROUP - UAE General Maintenance & Property Management',
    headline: 'UAE-first property care OS: maintenance, property management, owner contracts, tenant service, technician dispatch, proof-of-work, demo/video education, and AI property intelligence in one system.',
    requestContract: 'Request Contract',
    watchDemo: 'Watch Demo',
    videos: 'Videos',
    licenseTitle: 'Company License / Operating Model',
    licenseInfo: 'All Kind Building Projects Contracting - L.L.C - S.P.C | UAE first unified property care operating model',
    aboutText: 'BIN GROUP solves the full property-care chain: instant owner quote, contract selection, 15% mobilization, monthly or quarterly or annual payment planning, tenant service requests, technician GPS dispatch, HR-free workfeed, before-and-after proof, broker referrals, AI design previews, demo/video walkthroughs, and property passport records.',
    pricingModels: [
      { label: 'Maintenance Contracts', value: 'Custom Quote', note: 'Prepared by property size, scope, condition, SLA, service frequency, and portfolio requirements.' },
      { label: 'Property Management', value: '5% model', note: 'Property management can be charged at 5% per rented unit or as agreed per portfolio.' },
      { label: 'Mobilization', value: '15% upfront', note: 'Initial activation amount before full onboarding and service mobilization.' },
      { label: 'Payment Plans', value: 'Monthly / Quarterly / Annual', note: 'Flexible plans for serious owners and long-term service contracts.' },
    ],
    solveOverline: 'What We Solve',
    solveTitle: 'One operating system for the full property-care chain',
    solveText: 'BIN GROUP connects owners, tenants, technicians, and brokers into one transparent operating flow. It replaces scattered calls, manual follow-ups, unclear service history, and delayed proof with structured digital execution.',
    solved: ['Owners stop chasing calls and unclear updates.', 'Tenants submit service requests with photos and location context.', 'Technicians receive direct work instructions and proof requirements.', 'Brokers support growth through structured lead records.', 'Demo and video walkthroughs build trust before onboarding.', 'Every property builds a digital passport of contracts, tickets, evidence, and history.'],
    uaeFirstTitle: 'Built UAE-first',
    uaeFirstText: 'Language, page direction, contracts, service model, and owner expectations are designed for a professional UAE experience, not a surface translation.',
    servicesOverline: 'Services & Revenue Model',
    servicesTitle: 'What BIN GROUP offers',
    services: [
      { title: 'Custom Maintenance Contracts', desc: 'Preventive and emergency maintenance by property type, scope, and SLA level.', icon: <Wrench size={30} /> },
      { title: 'Property Management', desc: 'Tenant coordination, operating follow-up, reporting, and property records under a clear model.', icon: <Briefcase size={30} /> },
      { title: 'Technician Operations', desc: 'Direct jobs, GPS context, proof requirements, and verified service closure.', icon: <Zap size={30} /> },
      { title: 'Tenant Care', desc: 'Photo-based service requests, priority, status tracking, and completion confirmation.', icon: <Users size={30} /> },
      { title: 'Digital Property Passport', desc: 'Contracts, tickets, invoices, photos, and reports in one long-term record.', icon: <ShieldCheck size={30} /> },
      { title: 'AI Design Studio', desc: 'Interior and exterior previews that connect upgrade ideas to scope, quote, and approval.', icon: <Sparkles size={30} /> },
    ],
    workflowsOverline: 'Public Workflows',
    workflowsTitle: 'Clear value for owners, tenants, technicians, and brokers',
    workflowsText: 'Internal administration stays private. The public profile focuses on the value customers and partners receive from the platform.',
    publicFlows: [
      { title: 'Owner Journey', text: 'Property details, quote, contract selection, mobilization amount, payment plan, PDFs, videos, and dashboard visibility.' },
      { title: 'Tenant Journey', text: 'Photo request, category, priority, location confirmation, service tracking, and completion confirmation.' },
      { title: 'Technician Journey', text: 'Direct field workfeed, GPS route context, proof upload, job completion, and performance accountability.' },
      { title: 'Broker Journey', text: 'Owner referrals, property leads, pipeline records, and commission-ready tracking.' },
    ],
    demoOverline: 'Demo & Videos',
    demoTitle: 'Watch the platform before onboarding',
    demoText: 'Real public demo tiles for the full customer journey: owner contract, tenant request, technician field work, broker partner flow, GPS dispatch, PDF reports, and AI Design Studio.',
    demoPlayer: 'Public Demo Player',
    watchThisDemo: 'Watch This Demo',
    openRelatedPage: 'Open Related Page',
    preview: 'Preview',
    demoVideos,
    missionTitle: 'Mission',
    missionText: 'Raise the UAE standard for general maintenance and property management through a transparent digital system, clear contracts, service proof, and trusted technician operations.',
    visionTitle: 'Vision',
    visionText: 'Make BIN GROUP a leading UAE platform for smart property care, starting in the UAE and expanding globally.',
    contactTitle: 'Contact BIN GROUP',
    whatsappLabel: 'WhatsApp',
    phoneLabel: 'Phone',
    emailLabel: 'Email',
    whatsappButton: 'WhatsApp BIN GROUP',
    coverageTitle: 'UAE Service Coverage',
    serviceAreas: ['Abu Dhabi', 'Al Ain', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'All Emirates'],
    footerLine: 'UAE PROPERTY CARE OS | SMART MAINTENANCE | PROPERTY MANAGEMENT | TECHNICIAN DISPATCH | DEMO VIDEOS | MADE IN UAE',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
  };
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { lang, isRTL } = useLanguage();
  const copy = useMemo(() => makeCopy(lang), [lang]);
  const [activeDemoId, setActiveDemoId] = useState<DemoId>('owner');
  const whatsappDigits = useMemo(() => PUBLIC_CONTACT.whatsapp.replace(/[^0-9]/g, ''), []);
  const activeDemo = useMemo(() => copy.demoVideos.find((demo) => demo.id === activeDemoId) || copy.demoVideos[0], [copy.demoVideos, activeDemoId]);

  const textAlign = isRTL ? 'right' : 'left';
  const startIconAware = isRTL ? { '& .MuiButton-startIcon': { mr: 0, ml: 1 } } : undefined;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.24), transparent 36%), radial-gradient(circle at bottom left, rgba(59,130,246,0.12), transparent 32%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 10, md: 16 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
                  <Chip label={copy.chips[0]} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1.2 }} />
                  <Chip label={copy.chips[1]} sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 950 }} />
                </Stack>
                <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: isRTL ? 0 : -2.5, fontSize: { xs: '2.55rem', md: '4.4rem' }, lineHeight: 0.95, textAlign }}>{copy.companyName}</Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800, maxWidth: 760, lineHeight: 1.55, textAlign }}>{copy.headline}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' }, pt: 2 }}>
                  <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>{copy.requestContract}</Button>
                  <Button variant="outlined" startIcon={<PlayCircle size={18} />} onClick={() => document.getElementById('demo-videos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3, ...startIconAware }}>{copy.watchDemo}</Button>
                  <Button variant="outlined" startIcon={<Video size={18} />} onClick={() => document.getElementById('demo-videos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderColor: alpha(binThemeTokens.gold, 0.65), color: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.8, borderRadius: 3, ...startIconAware }}>{copy.videos}</Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                <Stack spacing={2.5} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  <Shield color={binThemeTokens.gold} size={38} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950, letterSpacing: isRTL ? 0 : 2, textAlign }}>{copy.licenseTitle}</Typography>
                  <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950, textAlign }}>{copy.licenseInfo}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, fontWeight: 700, textAlign }}>{copy.aboutText}</Typography>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={3}>
          {copy.pricingModels.map((item) => (
            <Grid item xs={12} md={3} key={item.label}>
              <Card sx={{ height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
                <CardContent sx={{ p: 3, textAlign }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950 }}>{isRTL ? item.label : item.label.toUpperCase()}</Typography>
                  <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, mt: 1 }}>{item.value}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', mt: 1.5, lineHeight: 1.7 }}>{item.note}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Box sx={{ py: 10, borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', bgcolor: 'rgba(255,255,255,0.012)' }}>
        <Container maxWidth="lg">
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={7}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 3 }}>{copy.solveOverline}</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 3, letterSpacing: isRTL ? 0 : -1, textAlign }}>{copy.solveTitle}</Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 700, lineHeight: 1.9, mb: 3, textAlign }}>{copy.solveText}</Typography>
              <Grid container spacing={2}>
                {copy.solved.map((item) => (
                  <Grid item xs={12} sm={6} key={item}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} style={{ marginTop: 3 }} />
                      <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, lineHeight: 1.6, textAlign }}>{item}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.7)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, borderRadius: 6, textAlign }}>
                <Award color={binThemeTokens.gold} size={56} />
                <Typography variant="h5" fontWeight="950" sx={{ mt: 2, mb: 1 }}>{copy.uaeFirstTitle}</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, fontWeight: 700 }}>{copy.uaeFirstText}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Box sx={{ mb: 8, textAlign: 'center' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 4 }}>{copy.servicesOverline}</Typography>
          <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: isRTL ? 0 : -2 }}>{copy.servicesTitle}</Typography>
        </Box>
        <Grid container spacing={3}>
          {copy.services.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.title}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, height: '100%', textAlign }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, width: 'fit-content', color: binThemeTokens.gold, mb: 3, ml: isRTL ? 'auto' : 0 }}>{service.icon}</Box>
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 1.5 }}>{service.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 700, lineHeight: 1.75 }}>{service.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Box sx={{ bgcolor: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', py: 12 }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 4 }}>{copy.workflowsOverline}</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: isRTL ? 0 : -2 }}>{copy.workflowsTitle}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1, maxWidth: 760, mx: 'auto' }}>{copy.workflowsText}</Typography>
          </Box>
          <Grid container spacing={3}>
            {copy.publicFlows.map((item) => (
              <Grid item xs={12} md={6} key={item.title}>
                <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, height: '100%' }}>
                  <CardContent sx={{ p: 4, textAlign }}>
                    <Typography variant="h5" fontWeight="950" color="#FFF">{item.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1, lineHeight: 1.7 }}>{item.text}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      <Box id="demo-videos" sx={{ py: 12, background: 'radial-gradient(circle at 20% 20%, rgba(198,167,94,0.12), transparent 34%), rgba(2,6,23,0.96)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Container maxWidth="lg">
          <Box sx={{ textAlign: 'center', mb: 8 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 4 }}>{copy.demoOverline}</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: isRTL ? 0 : -2 }}>{copy.demoTitle}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1.5, maxWidth: 780, mx: 'auto', lineHeight: 1.8 }}>{copy.demoText}</Typography>
          </Box>

          <Grid container spacing={4} alignItems="stretch">
            <Grid item xs={12} md={6}>
              <Paper sx={{ height: '100%', minHeight: 520, p: { xs: 3, md: 5 }, borderRadius: 7, bgcolor: 'rgba(15,23,42,0.82)', border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, position: 'relative', overflow: 'hidden' }}>
                <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.18), transparent 40%)', pointerEvents: 'none' }} />
                <Stack spacing={4} sx={{ position: 'relative', height: '100%' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Chip label={copy.demoPlayer} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: isRTL ? 0 : 1.3 }} />
                    <Chip label={activeDemo.length} sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFF', fontWeight: 900 }} />
                  </Stack>

                  <Box sx={{ p: 4, borderRadius: 6, bgcolor: '#020617', border: '1px solid rgba(255,255,255,0.08)', minHeight: 230, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                    <Box sx={{ width: 86, height: 86, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.14), border: `1px solid ${alpha(binThemeTokens.gold, 0.45)}`, color: binThemeTokens.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                      <PlayCircle size={44} />
                    </Box>
                    <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{activeDemo.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.75, maxWidth: 440 }}>{activeDemo.summary}</Typography>
                  </Box>

                  <Grid container spacing={1.5}>
                    {activeDemo.bullets.map((bullet) => (
                      <Grid item xs={12} sm={6} key={bullet}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                          <CheckCircle2 size={16} color={binThemeTokens.gold} />
                          <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 850, textAlign }}>{bullet}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 'auto' }}>
                    <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={() => navigate(`/request-demo?demo=${activeDemo.id}`)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.6, borderRadius: 3, ...startIconAware }}>{copy.watchThisDemo}</Button>
                    <Button variant="outlined" onClick={() => navigate(activeDemo.route)} sx={{ borderColor: 'rgba(255,255,255,0.18)', color: '#FFF', fontWeight: 950, py: 1.6, borderRadius: 3 }}>{copy.openRelatedPage}</Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                {copy.demoVideos.map((demo) => {
                  const selected = demo.id === activeDemo.id;
                  return (
                    <Grid item xs={12} sm={6} key={demo.id}>
                      <Card onClick={() => setActiveDemoId(demo.id)} sx={{ cursor: 'pointer', height: '100%', bgcolor: selected ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.72)', border: selected ? `1px solid ${alpha(binThemeTokens.gold, 0.68)}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 5, transition: '0.2s ease', '&:hover': { transform: 'translateY(-3px)', borderColor: alpha(binThemeTokens.gold, 0.55) } }}>
                        <CardContent sx={{ p: 3, textAlign }}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                            <Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{demo.icon}</Box>
                            <Chip size="small" label={demo.length} sx={{ bgcolor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', fontWeight: 900 }} />
                          </Stack>
                          <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{demo.title}</Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>{demo.summary}</Typography>
                          <Button size="small" startIcon={<PlayCircle size={15} />} sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 2, px: 0, ...startIconAware }}>{copy.preview}</Button>
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign }}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Rocket color={binThemeTokens.gold} size={32} /><Typography variant="h4" fontWeight="950" color="#FFF">{copy.missionTitle}</Typography></Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700, lineHeight: 1.8 }}>{copy.missionText}</Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, textAlign }}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}><Globe color={binThemeTokens.gold} size={32} /><Typography variant="h4" fontWeight="950" color="#FFF">{copy.visionTitle}</Typography></Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700, lineHeight: 1.8 }}>{copy.visionText}</Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="lg" sx={{ py: 12 }}>
        <Grid container spacing={6}>
          <Grid item xs={12} md={5}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 4, textAlign }}>{copy.contactTitle}</Typography>
            <Stack spacing={4}>
              {[
                { label: copy.whatsappLabel, value: PUBLIC_CONTACT.whatsapp, icon: <MessageSquare />, color: '#25D366' },
                { label: copy.phoneLabel, value: PUBLIC_CONTACT.phone, icon: <Phone />, color: binThemeTokens.gold },
                { label: copy.emailLabel, value: PUBLIC_CONTACT.email, icon: <Mail />, color: '#3b82f6' },
              ].map((item) => (
                <Stack key={item.label} direction="row" spacing={3} alignItems="center" sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                  <Box sx={{ p: 2, bgcolor: alpha(item.color, 0.1), borderRadius: 3, color: item.color, display: 'flex' }}>{item.icon}</Box>
                  <Box sx={{ textAlign }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: isRTL ? 0 : 1 }}>{item.label}</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{item.value}</Typography>
                  </Box>
                </Stack>
              ))}
              <Button variant="contained" size="large" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 3 }}>{copy.whatsappButton}</Button>
            </Stack>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 5, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h5" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row', textAlign }}><MapPin color={binThemeTokens.gold} /> {copy.coverageTitle}</Typography>
              <Grid container spacing={2}>
                {copy.serviceAreas.map((area) => (
                  <Grid item xs={12} sm={6} md={4} key={area}>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                      <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 900 }}>{area}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ py: 10, bgcolor: '#000', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: isRTL ? 0 : 1, mb: 2 }}>BIN GROUP</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 4 }}>{copy.footerLine}</Typography>
          <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
            <MuiLink href="/terms" sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>{copy.terms}</MuiLink>
            <MuiLink href="/privacy" sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>{copy.privacy}</MuiLink>
          </Stack>
          <Stack direction="row" spacing={2} justifyContent="center">
            <IconButton onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><MessageSquare /></IconButton>
            <IconButton onClick={() => window.location.href = `mailto:${PUBLIC_CONTACT.email}`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><Mail /></IconButton>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

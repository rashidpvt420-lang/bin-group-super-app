import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, Users, Wrench, Briefcase, MapPin, FileText, PlayCircle, PauseCircle, RotateCcw, Sparkles, ArrowLeft, CheckCircle2, Languages, ShieldCheck, MessageCircle, Camera, Navigation, ClipboardCheck, Smartphone, Home, Route, FileCheck2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const WHATSAPP_URL = 'https://wa.me/971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';

const visualPalette = {
  gold: '#C9A646',
  goldDark: '#9A7A24',
  ink: '#111827',
  muted: '#667085',
  canvas: '#FFFFFF',
  soft: '#F8F9FB',
  border: '#E5E7EB',
};

const demoDefinitions = {
  en: [
    { id: 'mission', title: 'BIN GROUP Mission Film', duration: '01:30', route: ONBOARDING_URL, icon: <Sparkles size={28} />, metric: 'One OS', screenTitle: 'Property Care Command System', screenSubtitle: 'Owner, tenant, technician, GPS, contracts, proof, and reports in one verified workflow.', summary: 'A serious overview of how BIN GROUP replaces scattered calls with one property-care operating system.', bullets: ['No-call property care', 'Verified service chain', 'Owner confidence', 'UAE-first operating system'] },
    { id: 'owner', title: 'Owner Contract Demo', duration: '03:40', route: ONBOARDING_URL, icon: <Building2 size={28} />, metric: '15% start', screenTitle: 'Owner App: Quote → Contract → Dashboard', screenSubtitle: 'Property intake, quote, payment plan, signed scope, and activation visibility.', summary: 'Show owners how they move from property intake to quotation, contract selection, 15% mobilization, payment plan, and dashboard preview.', bullets: ['Property intake', 'Custom quote', 'Contract scope', 'Payment plan'] },
    { id: 'tenant', title: 'Tenant Service Demo', duration: '02:55', route: '/tenants', icon: <Users size={28} />, metric: 'SOS ready', screenTitle: 'Tenant App: Request With Photo Proof', screenSubtitle: 'Tenant selects category, adds photo, confirms unit, and tracks status.', summary: 'Show tenant maintenance request with category, priority, photo, location confirmation, and status tracking.', bullets: ['Photo request', 'Priority', 'Location', 'Tracking'] },
    { id: 'technician', title: 'Technician Field Demo', duration: '03:10', route: '/technicians', icon: <Wrench size={28} />, metric: 'Field proof', screenTitle: 'Technician App: Job Card + Completion', screenSubtitle: 'Technician receives job, route context, materials, before/after proof, and closeout.', summary: 'Show job card, route context, work proof upload, and completion workflow.', bullets: ['Job card', 'Route context', 'Proof upload', 'Completion'] },
    { id: 'broker', title: 'Broker Partner Demo', duration: '02:20', route: '/brokers', icon: <Briefcase size={28} />, metric: '5–8%', screenTitle: 'Broker Portal: Lead Pipeline + Commission', screenSubtitle: 'Owner lead, property record, contract status, and commission-ready tracking.', summary: 'Show owner leads, property opportunities, pipeline records, and commission-ready tracking.', bullets: ['Owner lead', 'Property record', 'Pipeline', 'Commission'] },
    { id: 'gps', title: 'GPS Operations Demo', duration: '02:45', route: '/technicians', icon: <MapPin size={28} />, metric: 'Live route', screenTitle: 'GPS Dispatch: Nearest Verified Technician', screenSubtitle: 'Map context, SLA timer, route line, technician ETA, and dispatch status.', summary: 'Show property coordinates and technician route context for faster service coordination.', bullets: ['Property map', 'Route context', 'Status view', 'Response clarity'] },
    { id: 'pdf', title: 'PDF & Report Demo', duration: '02:35', route: '/owners', icon: <FileText size={28} />, metric: 'Audit ready', screenTitle: 'Documents: Contracts + Reports + History', screenSubtitle: 'PDF contract, service report, invoice hash, property passport, and long-term record.', summary: 'Show contracts, service reports, property records, and owner-ready PDF history.', bullets: ['Contract PDF', 'Service report', 'History', 'Property record'] },
    { id: 'ai-design', title: 'AI Design Studio Demo', duration: '03:25', route: '/request-demo?demo=ai-design', icon: <Sparkles size={28} />, metric: 'AI preview', screenTitle: 'AI Design Studio: Interior + Exterior Options', screenSubtitle: 'Design concepts, material scope, owner approval, and transformation pathway.', summary: 'Show interior and exterior design preview, scope ideas, materials, and owner approval path.', bullets: ['Interior', 'Exterior', 'Scope', 'Approval'] },
  ],
  ar: [
    { id: 'mission', title: 'فيلم رسالة BIN GROUP', duration: '01:30', route: ONBOARDING_URL, icon: <Sparkles size={28} />, metric: 'نظام واحد', screenTitle: 'نظام قيادة للعناية بالعقارات', screenSubtitle: 'المالك والمستأجر والفني والموقع والعقود والإثبات والتقارير في مسار موثق واحد.', summary: 'عرض جاد يوضح كيف تستبدل BIN GROUP الاتصالات المتفرقة بنظام تشغيل عقاري واحد.', bullets: ['عناية بدون اتصالات متكررة', 'سلسلة خدمة موثقة', 'ثقة المالك', 'نظام إماراتي أولاً'] },
    { id: 'owner', title: 'عرض عقود الملاك', duration: '03:40', route: ONBOARDING_URL, icon: <Building2 size={28} />, metric: '15٪ بداية', screenTitle: 'تطبيق المالك: عرض سعر → عقد → لوحة متابعة', screenSubtitle: 'تفاصيل العقار، العرض، خطة الدفع، نطاق العقد، ومتابعة التفعيل.', summary: 'عرض انتقال المالك من تفاصيل العقار إلى عرض السعر والعقد ودفعة التفعيل ولوحة التحكم.', bullets: ['تفاصيل العقار', 'عرض سعر مخصص', 'نطاق العقد', 'خطة الدفع'] },
    { id: 'tenant', title: 'عرض خدمة المستأجر', duration: '02:55', route: '/tenants', icon: <Users size={28} />, metric: 'طلب جاهز', screenTitle: 'تطبيق المستأجر: طلب خدمة مع صورة', screenSubtitle: 'يختار المستأجر التصنيف ويضيف صورة ويؤكد الوحدة ويتابع الحالة.', summary: 'عرض طلب خدمة مع التصنيف والأولوية والصورة وتأكيد الموقع وتتبع الحالة.', bullets: ['طلب بالصور', 'الأولوية', 'الموقع', 'التتبع'] },
    { id: 'technician', title: 'عرض عمل الفني', duration: '03:10', route: '/technicians', icon: <Wrench size={28} />, metric: 'إثبات ميداني', screenTitle: 'تطبيق الفني: بطاقة عمل وإغلاق المهمة', screenSubtitle: 'استلام المهمة، سياق الموقع، المواد، إثبات قبل وبعد، والإغلاق.', summary: 'عرض بطاقة العمل وسياق الموقع ورفع إثبات العمل وإغلاق المهمة.', bullets: ['بطاقة العمل', 'سياق الموقع', 'إثبات العمل', 'الإغلاق'] },
    { id: 'broker', title: 'عرض شراكة الوسطاء', duration: '02:20', route: '/brokers', icon: <Briefcase size={28} />, metric: '5–8٪', screenTitle: 'بوابة الوسيط: فرص وعمولة', screenSubtitle: 'إحالة مالك، سجل عقار، حالة العقد، وتتبع العمولة.', summary: 'عرض إحالات الملاك وفرص العقارات وسجلات المتابعة وتتبع العمولة.', bullets: ['إحالة المالك', 'سجل العقار', 'المتابعة', 'العمولة'] },
    { id: 'gps', title: 'عرض عمليات الموقع', duration: '02:45', route: '/technicians', icon: <MapPin size={28} />, metric: 'مسار مباشر', screenTitle: 'إرسال GPS: أقرب فني موثق', screenSubtitle: 'الخريطة، مؤقت SLA، خط المسار، وقت الوصول، وحالة الإرسال.', summary: 'عرض إحداثيات العقار وسياق مسار الفني لتنسيق خدمة أسرع وأوضح.', bullets: ['خريطة العقار', 'مسار الفني', 'عرض الحالة', 'وضوح الاستجابة'] },
    { id: 'pdf', title: 'عرض الملفات والتقارير', duration: '02:35', route: '/owners', icon: <FileText size={28} />, metric: 'جاهز للتدقيق', screenTitle: 'المستندات: عقود وتقارير وسجل', screenSubtitle: 'عقد PDF، تقرير خدمة، تحقق فاتورة، جواز عقار، وسجل طويل المدى.', summary: 'عرض العقود وتقارير الخدمة وسجلات العقار وتاريخ موثق جاهز للمالك.', bullets: ['ملف العقد', 'تقرير الخدمة', 'السجل', 'بيانات العقار'] },
    { id: 'ai-design', title: 'عرض استوديو التصميم الذكي', duration: '03:25', route: '/request-demo?demo=ai-design', icon: <Sparkles size={28} />, metric: 'معاينة ذكية', screenTitle: 'استوديو التصميم: خيارات داخلية وخارجية', screenSubtitle: 'أفكار التصميم، نطاق المواد، موافقة المالك، ومسار التحول.', summary: 'عرض التصميم الداخلي والخارجي وأفكار النطاق والمواد ومسار الموافقة.', bullets: ['داخلي', 'خارجي', 'النطاق', 'الموافقة'] },
  ],
};

const copy = {
  en: {
    brand: 'BIN GROUP', company: 'Company', request: 'Request Contract', quote: 'Get Quote', chip: 'PUBLIC DEMO & MISSION VIDEO',
    title: 'See the Property OS in action — not just a brochure.',
    subtitle: 'A serious visual demo of how BIN GROUP handles owner contracts, tenant requests, technician dispatch, GPS tracking, proof-of-work, documents, and reports.',
    play: 'Play Serious Demo', pause: 'Pause', replay: 'Replay', playing: 'Playing now', openFlow: 'Open Related Flow', livePreview: 'LIVE OPERATIONS PREVIEW',
    missionTitle: 'What owners should see immediately',
    missionText: 'This page must prove the product, not just describe it. The demo now shows realistic operational screens for each role and the evidence chain BIN GROUP provides.',
    visualGallery: 'Operational proof gallery',
    videoStoryboard: 'Demo video storyboard',
    whatsapp: 'WhatsApp BIN GROUP',
    offerTitle: 'What the demo proves',
    offerItems: ['Owner quote and contract flow', 'Tenant service request with photo', 'Technician GPS dispatch', 'Before/after proof', 'Invoice and contract records', 'Portfolio reporting', 'Broker pipeline', 'AI design preview'],
    whyTitle: 'Why this looks serious',
    whyItems: ['Shows actual workflows instead of empty claims', 'Makes every role visible', 'Connects GPS, evidence, contracts, and reports', 'Gives owners confidence before requesting a contract'],
    frames: [
      { kicker: 'Owner', title: 'The owner sees price, contract scope, activation, and portfolio confidence.', body: 'Every property starts with intake, quote, payment plan, signed scope, and a controlled dashboard.' },
      { kicker: 'Tenant', title: 'The tenant submits the issue with photo evidence and unit context.', body: 'The system captures category, priority, photos, location, and status so the owner is not chasing updates.' },
      { kicker: 'Technician', title: 'The technician receives a job card, route, SLA timer, and proof checklist.', body: 'Field execution is documented with before/after photos, notes, materials, and completion proof.' },
      { kicker: 'Audit', title: 'The owner receives contract, report, invoice, and property-history evidence.', body: 'BIN GROUP becomes an operating record for the asset, not only a maintenance contact number.' },
    ],
  },
  ar: {
    brand: 'BIN GROUP', company: 'الشركة', request: 'اطلب عقداً', quote: 'احصل على عرض سعر', chip: 'العرض العام ورسالة الشركة',
    title: 'شاهد نظام التشغيل العقاري عملياً — ليس مجرد كلام.',
    subtitle: 'عرض بصري جاد يوضح عقود الملاك وطلبات المستأجرين وإرسال الفنيين وتتبع GPS وإثبات العمل والمستندات والتقارير.',
    play: 'تشغيل العرض الجاد', pause: 'إيقاف مؤقت', replay: 'إعادة العرض', playing: 'يعمل الآن', openFlow: 'افتح المسار المرتبط', livePreview: 'معاينة العمليات المباشرة',
    missionTitle: 'ما يجب أن يراه المالك فوراً',
    missionText: 'هذه الصفحة يجب أن تثبت المنتج ولا تكتفي بشرحه. العرض الآن يوضح شاشات تشغيل واقعية لكل دور وسلسلة الإثبات التي تقدمها BIN GROUP.',
    visualGallery: 'معرض إثبات العمليات',
    videoStoryboard: 'سيناريو فيديو العرض',
    whatsapp: 'تواصل عبر واتساب',
    offerTitle: 'ماذا يثبت العرض؟',
    offerItems: ['مسار عرض السعر والعقد للمالك', 'طلب مستأجر مع صورة', 'إرسال فني عبر GPS', 'إثبات قبل وبعد', 'سجلات العقود والفواتير', 'تقارير المحافظ', 'مسار الوسيط', 'معاينة التصميم الذكي'],
    whyTitle: 'لماذا يبدو هذا العرض جاداً؟',
    whyItems: ['يعرض مسارات عمل حقيقية بدلاً من ادعاءات عامة', 'يجعل كل دور واضحاً', 'يربط الموقع والإثبات والعقود والتقارير', 'يعطي المالك ثقة قبل طلب العقد'],
    frames: [
      { kicker: 'المالك', title: 'المالك يرى السعر ونطاق العقد والتفعيل وثقة المحفظة.', body: 'كل عقار يبدأ بتفاصيل، عرض سعر، خطة دفع، نطاق موقع، ولوحة متابعة منظمة.' },
      { kicker: 'المستأجر', title: 'المستأجر يرسل المشكلة مع صورة وسياق الوحدة.', body: 'النظام يحفظ التصنيف والأولوية والصور والموقع والحالة حتى لا يلاحق المالك التحديثات.' },
      { kicker: 'الفني', title: 'الفني يستلم بطاقة عمل ومساراً ومؤقت SLA وقائمة إثبات.', body: 'التنفيذ الميداني يوثق بالصور والملاحظات والمواد وإثبات الإغلاق.' },
      { kicker: 'التدقيق', title: 'المالك يستلم عقداً وتقريراً وفاتورة وسجل تاريخ العقار.', body: 'BIN GROUP يصبح سجل تشغيل للأصل وليس رقم صيانة فقط.' },
    ],
  },
};

function MiniScreen({ active, index }: { active: any; index: number }) {
  const rows = [
    ['Property intake', 'Quote AED', 'Contract scope'],
    ['Tenant SOS', 'Photo proof', 'Priority high'],
    ['Technician route', 'SLA timer', 'Before / after'],
    ['Invoice hash', 'PDF report', 'Asset history'],
  ][index % 4];

  return (
    <Box sx={{ borderRadius: 5, overflow: 'hidden', border: `1px solid ${alpha(visualPalette.gold, 0.32)}`, bgcolor: '#FFFFFF', boxShadow: '0 24px 70px rgba(17,24,39,0.14)' }}>
      <Box sx={{ px: 2, py: 1.2, bgcolor: '#111827', color: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={0.8} alignItems="center"><Smartphone size={15} color={visualPalette.gold} /><Typography fontWeight={950} fontSize={12}>{active.screenTitle}</Typography></Stack>
        <Chip size="small" label={active.metric} sx={{ bgcolor: alpha(visualPalette.gold, 0.18), color: visualPalette.gold, fontWeight: 950 }} />
      </Box>
      <Box sx={{ p: 2.4, minHeight: 285, background: 'linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }}>
        <Stack direction="row" spacing={1.4} alignItems="center" sx={{ mb: 2 }}>
          <Box sx={{ width: 46, height: 46, borderRadius: 3, bgcolor: alpha(visualPalette.gold, 0.14), display: 'grid', placeItems: 'center', color: visualPalette.goldDark }}>{active.icon}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={950} color={visualPalette.ink} noWrap>{active.title}</Typography>
            <Typography fontSize={12} color={visualPalette.muted} noWrap>{active.screenSubtitle}</Typography>
          </Box>
        </Stack>

        <Grid container spacing={1.2} sx={{ mb: 2 }}>
          {rows.map((row) => <Grid item xs={4} key={row}><Box sx={{ p: 1.2, borderRadius: 3, bgcolor: '#FFFFFF', border: `1px solid ${visualPalette.border}` }}><Typography fontSize={11} color={visualPalette.muted} fontWeight={850}>{row}</Typography><Box sx={{ mt: 1, height: 5, borderRadius: 99, bgcolor: alpha(visualPalette.gold, 0.2) }}><Box sx={{ width: `${52 + index * 10}%`, height: '100%', borderRadius: 99, bgcolor: visualPalette.gold }} /></Box></Box></Grid>)}
        </Grid>

        <Box sx={{ height: 104, borderRadius: 4, bgcolor: '#F3F4F6', border: `1px solid ${visualPalette.border}`, position: 'relative', overflow: 'hidden', mb: 2 }}>
          <Box sx={{ position: 'absolute', inset: 0, background: index % 2 === 0 ? 'radial-gradient(circle at 25% 35%, rgba(201,166,70,0.34), transparent 18%), radial-gradient(circle at 76% 62%, rgba(17,24,39,0.16), transparent 22%)' : 'linear-gradient(135deg, rgba(201,166,70,0.22), transparent 36%), repeating-linear-gradient(90deg, rgba(17,24,39,0.06) 0 1px, transparent 1px 22px)' }} />
          {active.id === 'gps' && <><Box sx={{ position: 'absolute', left: '16%', top: '50%', width: '68%', height: 3, bgcolor: visualPalette.gold, transform: 'rotate(-8deg)', borderRadius: 99 }} /><MapPin size={24} color="#EF4444" style={{ position: 'absolute', left: '12%', top: '34%' }} /><Navigation size={24} color={visualPalette.goldDark} style={{ position: 'absolute', right: '14%', top: '46%' }} /></>}
          {active.id === 'tenant' && <Camera size={38} color={visualPalette.goldDark} style={{ position: 'absolute', left: '44%', top: '32%' }} />}
          {active.id === 'pdf' && <FileCheck2 size={42} color={visualPalette.goldDark} style={{ position: 'absolute', left: '44%', top: '28%' }} />}
          {active.id === 'owner' && <Home size={42} color={visualPalette.goldDark} style={{ position: 'absolute', left: '44%', top: '28%' }} />}
          {active.id === 'technician' && <Route size={42} color={visualPalette.goldDark} style={{ position: 'absolute', left: '44%', top: '28%' }} />}
        </Box>

        <Stack spacing={1.1}>{active.bullets.slice(0, 3).map((bullet: string) => <Stack direction="row" spacing={1} alignItems="center" key={bullet}><CheckCircle2 size={15} color={visualPalette.goldDark} /><Typography fontSize={13} fontWeight={850} color={visualPalette.ink}>{bullet}</Typography></Stack>)}</Stack>
      </Box>
    </Box>
  );
}

export default function DemoVideosPage() {
  const [params] = useSearchParams();
  const { lang, setLang, isRTL } = useLanguage();
  const language = lang === 'ar' ? 'ar' : 'en';
  const c = copy[language];
  const demos = demoDefinitions[language];
  const selected = params.get('demo') || 'mission';
  const [activeId, setActiveId] = useState(demos.some((demo) => demo.id === selected) ? selected : 'mission');
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const active = useMemo(() => demos.find((demo) => demo.id === activeId) || demos[0], [activeId, demos]);
  const frame = c.frames[frameIndex % c.frames.length];
  const progress = ((frameIndex + 1) / c.frames.length) * 100;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % c.frames.length), 1900);
    return () => window.clearInterval(timer);
  }, [playing, c.frames.length]);

  const changeLanguage = () => setLang(language === 'en' ? 'ar' : 'en');
  const playDemo = () => {
    setPlaying(true);
    document.getElementById('demo-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  const replayDemo = () => {
    setFrameIndex(0);
    setPlaying(true);
    document.getElementById('demo-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', direction: isRTL ? 'rtl' : 'ltr', background: 'radial-gradient(circle at 90% 5%, rgba(201,166,70,0.16), transparent 28rem), linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: 'rgba(255,255,255,0.94)', borderBottom: '1px solid #E5E7EB', backdropFilter: 'blur(14px)' }}>
        <Container maxWidth="xl" sx={{ py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button component="a" href="/" sx={{ color: '#111827', textDecoration: 'none', p: 0, minWidth: 0, mr: isRTL ? 0 : 'auto', ml: isRTL ? 'auto' : 0 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center">
              <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.5 }} />
              <Typography fontWeight={950}>{c.brand}</Typography>
            </Stack>
          </Button>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
            <Button component="a" href="/" startIcon={<ArrowLeft size={17} />} sx={{ color: '#111827', fontWeight: 900 }}>{c.company}</Button>
            <Button type="button" onClick={changeLanguage} startIcon={<Languages size={17} />} sx={{ color: visualPalette.goldDark, fontWeight: 950 }}>{language === 'en' ? 'العربية' : 'EN'}</Button>
            <Button component="a" href={QUOTE_URL} variant="outlined" sx={{ color: visualPalette.goldDark, borderColor: visualPalette.gold, fontWeight: 950, borderRadius: 999 }}>{c.quote}</Button>
            <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: visualPalette.gold, color: '#111827', fontWeight: 950, borderRadius: 999 }}>{c.request}</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 5, md: 8 } }}>
        <Grid container spacing={5} alignItems="stretch">
          <Grid item xs={12} md={5}>
            <Chip label={c.chip} sx={{ bgcolor: alpha(visualPalette.gold, 0.14), color: visualPalette.goldDark, fontWeight: 950, letterSpacing: 1.4, mb: 3 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 66 }, lineHeight: 0.96, fontWeight: 950, letterSpacing: -2, mb: 3, color: '#111827' }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: '#667085', lineHeight: 1.7, fontWeight: 750, mb: 4 }}>{c.subtitle}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={playDemo} sx={{ bgcolor: visualPalette.gold, color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.play}</Button>
              <Button component="a" href={ONBOARDING_URL} variant="outlined" sx={{ borderColor: '#D0D5DD', color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.request}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ borderColor: visualPalette.gold, color: visualPalette.goldDark, fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.whatsapp}</Button>
            </Stack>
            <Paper sx={{ mt: 4, p: 3, borderRadius: 5, bgcolor: '#FFFFFF', border: `1px solid ${alpha(visualPalette.gold, 0.24)}`, boxShadow: '0 18px 45px rgba(17,24,39,0.08)' }}>
              <Typography variant="h5" fontWeight={950} sx={{ color: visualPalette.goldDark, mb: 1.5 }}>{c.missionTitle}</Typography>
              <Typography sx={{ color: '#667085', lineHeight: 1.75 }}>{c.missionText}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper id="demo-player" sx={{ p: { xs: 2.2, md: 4 }, borderRadius: 7, bgcolor: '#FFFFFF', border: `1px solid ${alpha(visualPalette.gold, 0.28)}`, boxShadow: '0 24px 70px rgba(17,24,39,0.10)', minHeight: 560 }}>
              <Stack spacing={3}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip label={c.livePreview} sx={{ bgcolor: alpha(visualPalette.gold, 0.14), color: visualPalette.goldDark, fontWeight: 950 }} />
                  <Chip label={playing ? c.playing : active.duration} sx={{ bgcolor: playing ? alpha('#10b981', 0.12) : '#F3F4F6', color: playing ? '#047857' : '#111827', fontWeight: 900 }} />
                </Stack>

                <Grid container spacing={2.2} alignItems="stretch">
                  <Grid item xs={12} md={7}>
                    <MiniScreen active={active} index={frameIndex} />
                  </Grid>
                  <Grid item xs={12} md={5}>
                    <Box sx={{ height: '100%', p: 2.4, borderRadius: 5, bgcolor: '#111827', color: '#FFFFFF', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 285 }}>
                      <Box>
                        <PlayCircle size={52} color={visualPalette.gold} />
                        <Typography variant="overline" sx={{ display: 'block', color: visualPalette.gold, fontWeight: 950, mt: 2, letterSpacing: 2 }}>{frame.kicker}</Typography>
                        <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', mt: 1, mb: 1.5 }}>{activeId === 'mission' ? frame.title : active.screenTitle}</Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.74)', lineHeight: 1.75 }}>{activeId === 'mission' ? frame.body : active.summary}</Typography>
                      </Box>
                      <Stack spacing={1.1} sx={{ mt: 3 }}>{active.bullets.map((bullet) => <Stack direction="row" spacing={1} alignItems="center" key={bullet}><CheckCircle2 size={15} color={visualPalette.gold} /><Typography fontSize={13} fontWeight={850}>{bullet}</Typography></Stack>)}</Stack>
                    </Box>
                  </Grid>
                </Grid>

                <LinearProgress variant="determinate" value={playing ? progress : 0} sx={{ height: 7, borderRadius: 99, bgcolor: '#EEF2F6', '& .MuiLinearProgress-bar': { bgcolor: visualPalette.gold } }} />

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" startIcon={playing ? <PauseCircle size={18} /> : <PlayCircle size={18} />} onClick={() => setPlaying(!playing)} sx={{ bgcolor: visualPalette.gold, color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 999 }}>{playing ? c.pause : c.play}</Button>
                  <Button variant="outlined" startIcon={<RotateCcw size={18} />} onClick={replayDemo} sx={{ borderColor: '#D0D5DD', color: '#111827', fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.replay}</Button>
                  <Button component="a" href={active.route} variant="outlined" sx={{ borderColor: visualPalette.gold, color: visualPalette.goldDark, fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.openFlow}</Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 7 }}>
          <Typography variant="h3" fontWeight={950} sx={{ color: '#111827', mb: 1 }}>{c.visualGallery}</Typography>
          <Typography sx={{ color: '#667085', fontWeight: 750, mb: 3 }}>{c.videoStoryboard}</Typography>
          <Grid container spacing={2.5}>
            {demos.map((demo, index) => <Grid item xs={12} sm={6} md={4} lg={3} key={demo.id}>
              <Card onClick={() => { setActiveId(demo.id); setFrameIndex(index); setPlaying(true); document.getElementById('demo-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} sx={{ cursor: 'pointer', height: '100%', bgcolor: demo.id === active.id ? alpha(visualPalette.gold, 0.12) : '#FFFFFF', border: demo.id === active.id ? `1px solid ${alpha(visualPalette.gold, 0.68)}` : `1px solid ${visualPalette.border}`, borderRadius: 5, transition: '0.2s ease', boxShadow: '0 12px 32px rgba(17,24,39,0.07)', '&:hover': { transform: 'translateY(-3px)', borderColor: alpha(visualPalette.gold, 0.62) } }}>
                <CardContent sx={{ p: 2.4 }}>
                  <Box sx={{ height: 132, borderRadius: 4, bgcolor: '#F8F9FB', border: `1px solid ${visualPalette.border}`, mb: 2, p: 1.4, overflow: 'hidden' }}>
                    <MiniScreen active={demo} index={index} />
                  </Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}><Box sx={{ color: visualPalette.goldDark, display: 'flex' }}>{demo.icon}</Box><Chip size="small" label={demo.duration} sx={{ bgcolor: '#F3F4F6', color: '#111827', fontWeight: 900 }} /></Stack>
                  <Typography variant="h6" fontWeight="950" sx={{ color: '#111827', mb: 1 }}>{demo.title}</Typography>
                  <Typography variant="body2" sx={{ color: '#667085', lineHeight: 1.65 }}>{demo.summary}</Typography>
                  <Button size="small" startIcon={<PlayCircle size={15} />} sx={{ color: visualPalette.goldDark, fontWeight: 950, mt: 2, px: 0 }}>{c.play}</Button>
                </CardContent>
              </Card>
            </Grid>)}
          </Grid>
        </Box>

        <Grid container spacing={3} sx={{ mt: 6 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: '#FFFFFF', border: `1px solid ${visualPalette.border}`, boxShadow: '0 14px 38px rgba(17,24,39,0.07)', height: '100%' }}>
              <Typography variant="h4" fontWeight={950} sx={{ color: '#111827', mb: 3 }}><ShieldCheck color={visualPalette.goldDark} /> {c.offerTitle}</Typography>
              <Grid container spacing={1.5}>{c.offerItems.map((item) => <Grid item xs={12} sm={6} key={item}><Stack direction="row" spacing={1.2} alignItems="center"><CheckCircle2 size={17} color={visualPalette.goldDark} /><Typography color="#111827" fontWeight={850}>{item}</Typography></Stack></Grid>)}</Grid>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: alpha(visualPalette.gold, 0.08), border: `1px solid ${alpha(visualPalette.gold, 0.22)}`, height: '100%' }}>
              <Typography variant="h4" fontWeight={950} sx={{ color: visualPalette.goldDark, mb: 3 }}>{c.whyTitle}</Typography>
              <Stack spacing={1.5}>{c.whyItems.map((item) => <Stack direction="row" spacing={1.2} alignItems="center" key={item}><CheckCircle2 size={17} color={visualPalette.goldDark} /><Typography color="#111827" fontWeight={850}>{item}</Typography></Stack>)}</Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
                <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: visualPalette.gold, color: '#111827', fontWeight: 950 }}>{c.request}</Button>
                <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ color: visualPalette.goldDark, borderColor: visualPalette.gold, fontWeight: 950 }}>{c.whatsapp}</Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

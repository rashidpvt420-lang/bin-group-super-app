import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, Users, Wrench, Briefcase, MapPin, FileText, PlayCircle, PauseCircle, RotateCcw, Sparkles, ArrowLeft, CheckCircle2, Languages, ShieldCheck, MessageCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const WHATSAPP_URL = 'https://wa.me/971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';

const demoDefinitions = {
  en: [
    { id: 'mission', title: 'BIN GROUP Mission Film', duration: '01:30', route: ONBOARDING_URL, icon: <Sparkles size={28} />, summary: 'A cinematic overview of our mission: turn UAE property care into a clear digital operating system.', bullets: ['No-call property care', 'Verified service chain', 'Owner confidence', 'UAE-first operating system'] },
    { id: 'owner', title: 'Owner Contract Demo', duration: '03:40', route: ONBOARDING_URL, icon: <Building2 size={28} />, summary: 'Property intake, custom quote, contract scope, 15% mobilization, payment plan, and owner dashboard preview.', bullets: ['Property intake', 'Custom quote', 'Contract scope', 'Payment plan'] },
    { id: 'tenant', title: 'Tenant Service Demo', duration: '02:55', route: '/tenants', icon: <Users size={28} />, summary: 'Service request with category, priority, photo, location confirmation, and status tracking.', bullets: ['Photo request', 'Priority', 'Location', 'Tracking'] },
    { id: 'technician', title: 'Technician Field Demo', duration: '03:10', route: '/technicians', icon: <Wrench size={28} />, summary: 'Job card, route context, work proof upload, and completion workflow.', bullets: ['Job card', 'Route context', 'Proof upload', 'Completion'] },
    { id: 'broker', title: 'Broker Partner Demo', duration: '02:20', route: '/brokers', icon: <Briefcase size={28} />, summary: 'Owner leads, property opportunities, pipeline records, and commission-ready tracking.', bullets: ['Owner lead', 'Property record', 'Pipeline', 'Commission'] },
    { id: 'gps', title: 'GPS Operations Demo', duration: '02:45', route: '/technicians', icon: <MapPin size={28} />, summary: 'Property coordinates and technician route context for faster service coordination.', bullets: ['Property map', 'Route context', 'Status view', 'Response clarity'] },
    { id: 'pdf', title: 'PDF & Report Demo', duration: '02:35', route: '/owners', icon: <FileText size={28} />, summary: 'Contracts, service reports, property records, and owner-ready PDF history.', bullets: ['Contract PDF', 'Service report', 'History', 'Property record'] },
    { id: 'ai-design', title: 'AI Design Studio Demo', duration: '03:25', route: '/request-demo?demo=ai-design', icon: <Sparkles size={28} />, summary: 'Interior and exterior design preview, scope ideas, materials, and owner approval path.', bullets: ['Interior', 'Exterior', 'Scope', 'Approval'] },
  ],
  ar: [
    { id: 'mission', title: 'فيلم رسالة BIN GROUP', duration: '01:30', route: ONBOARDING_URL, icon: <Sparkles size={28} />, summary: 'عرض تعريفي يوضح رسالتنا: تحويل العناية بالعقارات في الإمارات إلى نظام تشغيل رقمي واضح وموثق.', bullets: ['عناية بدون اتصالات متكررة', 'سلسلة خدمة موثقة', 'ثقة المالك', 'نظام إماراتي أولاً'] },
    { id: 'owner', title: 'عرض عقود الملاك', duration: '03:40', route: ONBOARDING_URL, icon: <Building2 size={28} />, summary: 'تفاصيل العقار، عرض سعر مخصص، نطاق العقد، دفعة تفعيل 15٪، خطة دفع، ومعاينة لوحة المالك.', bullets: ['تفاصيل العقار', 'عرض سعر مخصص', 'نطاق العقد', 'خطة الدفع'] },
    { id: 'tenant', title: 'عرض خدمة المستأجر', duration: '02:55', route: '/tenants', icon: <Users size={28} />, summary: 'طلب خدمة مع التصنيف والأولوية والصورة وتأكيد الموقع وتتبع الحالة.', bullets: ['طلب بالصور', 'الأولوية', 'الموقع', 'التتبع'] },
    { id: 'technician', title: 'عرض عمل الفني', duration: '03:10', route: '/technicians', icon: <Wrench size={28} />, summary: 'بطاقة العمل، سياق الموقع، رفع إثبات العمل، وإغلاق المهمة.', bullets: ['بطاقة العمل', 'سياق الموقع', 'إثبات العمل', 'الإغلاق'] },
    { id: 'broker', title: 'عرض شراكة الوسطاء', duration: '02:20', route: '/brokers', icon: <Briefcase size={28} />, summary: 'إحالات الملاك، فرص العقارات، سجلات المتابعة، وتتبع العمولة.', bullets: ['إحالة المالك', 'سجل العقار', 'المتابعة', 'العمولة'] },
    { id: 'gps', title: 'عرض عمليات الموقع', duration: '02:45', route: '/technicians', icon: <MapPin size={28} />, summary: 'إحداثيات العقار وسياق مسار الفني لتنسيق خدمة أسرع وأوضح.', bullets: ['خريطة العقار', 'مسار الفني', 'عرض الحالة', 'وضوح الاستجابة'] },
    { id: 'pdf', title: 'عرض الملفات والتقارير', duration: '02:35', route: '/owners', icon: <FileText size={28} />, summary: 'العقود، تقارير الخدمة، سجلات العقار، وتاريخ موثق جاهز للمالك.', bullets: ['ملف العقد', 'تقرير الخدمة', 'السجل', 'بيانات العقار'] },
    { id: 'ai-design', title: 'عرض استوديو التصميم الذكي', duration: '03:25', route: '/request-demo?demo=ai-design', icon: <Sparkles size={28} />, summary: 'معاينة التصميم الداخلي والخارجي، أفكار النطاق، المواد، ومسار موافقة المالك.', bullets: ['داخلي', 'خارجي', 'النطاق', 'الموافقة'] },
  ],
};

const copy = {
  en: {
    brand: 'BIN GROUP',
    company: 'Company',
    request: 'Request Contract',
    quote: 'Get Quote',
    chip: 'PUBLIC DEMO & MISSION VIDEO',
    title: 'Watch the Property OS built to make owners confident.',
    subtitle: 'BIN GROUP connects owners, tenants, technicians, brokers, documents, contracts, payments, proof-of-work, reports, GPS context, and AI design into one verified property-care command system.',
    play: 'Play Mission Demo',
    pause: 'Pause',
    replay: 'Replay',
    playing: 'Playing now',
    openFlow: 'Open Related Flow',
    livePreview: 'LIVE CINEMATIC PREVIEW',
    missionTitle: 'Our mission',
    missionText: 'Remove property maintenance confusion and give every serious owner a clear system for contracts, service, evidence, reporting, and long-term asset history.',
    offerTitle: 'What we offer',
    offerItems: ['Maintenance contracts', 'Property management', 'Tenant service requests', 'Technician dispatch', 'Before/after proof', 'PDF contracts and reports', 'Property passport history', 'AI design previews'],
    whyTitle: 'Why owners should care',
    whyItems: ['Less calling and guessing', 'More trust and proof', 'Clear quote and contract path', 'Better visibility across every property'],
    whatsapp: 'WhatsApp BIN GROUP',
    frames: [
      { kicker: 'Problem', title: 'Owners lose time in scattered calls.', body: 'Maintenance requests, tenant messages, technician updates, invoices, and reports are usually disconnected.' },
      { kicker: 'Solution', title: 'BIN GROUP turns property care into one command system.', body: 'Every request moves through a controlled chain: details, quote, contract, service, proof, report, and history.' },
      { kicker: 'Trust', title: 'Before-and-after proof protects the owner.', body: 'Photos, status updates, service records, and PDF reports create long-term property confidence.' },
      { kicker: 'Growth', title: 'Built for villas, towers, hotels, schools, hospitals, malls, offices, and portfolios.', body: 'One system can support multiple asset types and serious property owners across the UAE.' },
    ],
  },
  ar: {
    brand: 'BIN GROUP',
    company: 'الشركة',
    request: 'اطلب عقداً',
    quote: 'احصل على عرض سعر',
    chip: 'العرض العام ورسالة الشركة',
    title: 'شاهد نظام تشغيل عقاري مصمم ليمنح المالك ثقة كاملة.',
    subtitle: 'BIN GROUP يربط الملاك والمستأجرين والفنيين والوسطاء والمستندات والعقود والمدفوعات وإثبات العمل والتقارير وسياق الموقع والتصميم الذكي داخل نظام واحد موثق للعناية بالعقارات.',
    play: 'تشغيل عرض الرسالة',
    pause: 'إيقاف مؤقت',
    replay: 'إعادة العرض',
    playing: 'يعمل الآن',
    openFlow: 'افتح المسار المرتبط',
    livePreview: 'معاينة سينمائية مباشرة',
    missionTitle: 'رسالتنا',
    missionText: 'إنهاء فوضى صيانة العقارات ومنح كل مالك جاد نظاماً واضحاً للعقود والخدمة والإثبات والتقارير وتاريخ الأصل العقاري.',
    offerTitle: 'ماذا نقدم',
    offerItems: ['عقود صيانة', 'إدارة عقارات', 'طلبات خدمة المستأجرين', 'إرسال الفنيين', 'إثبات قبل وبعد', 'عقود وتقارير PDF', 'سجل جواز العقار', 'معاينات تصميم ذكية'],
    whyTitle: 'لماذا يهم ذلك الملاك؟',
    whyItems: ['اتصالات وتخمين أقل', 'ثقة وإثبات أكثر', 'مسار واضح للسعر والعقد', 'رؤية أفضل لكل عقار'],
    whatsapp: 'تواصل عبر واتساب',
    frames: [
      { kicker: 'المشكلة', title: 'المالك يضيع وقته بين اتصالات متفرقة.', body: 'طلبات الصيانة ورسائل المستأجرين وتحديثات الفنيين والفواتير والتقارير غالباً تكون غير مترابطة.' },
      { kicker: 'الحل', title: 'BIN GROUP يحول العناية بالعقار إلى نظام قيادة واحد.', body: 'كل طلب يتحرك عبر سلسلة منظمة: تفاصيل، عرض سعر، عقد، خدمة، إثبات، تقرير، وسجل.' },
      { kicker: 'الثقة', title: 'إثبات قبل وبعد يحمي المالك.', body: 'الصور وتحديثات الحالة وسجلات الخدمة والتقارير تعطي ثقة طويلة المدى للعقار.' },
      { kicker: 'النمو', title: 'مصمم للفلل والأبراج والفنادق والمدارس والمستشفيات والمراكز التجارية والمكاتب والمحافظ العقارية.', body: 'نظام واحد يدعم أنواع أصول متعددة وملاك عقارات جادين في الإمارات.' },
    ],
  },
};

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
    const timer = window.setInterval(() => setFrameIndex((current) => (current + 1) % c.frames.length), 1800);
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
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: 'rgba(2,6,23,0.94)', borderBottom: '1px solid rgba(198,167,94,0.18)', backdropFilter: 'blur(14px)' }}>
        <Container maxWidth="xl" sx={{ py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button component="a" href="/" sx={{ color: '#FFF', textDecoration: 'none', p: 0, minWidth: 0, mr: isRTL ? 0 : 'auto', ml: isRTL ? 'auto' : 0 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center">
              <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.5 }} />
              <Typography fontWeight={950}>{c.brand}</Typography>
            </Stack>
          </Button>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
            <Button component="a" href="/" startIcon={<ArrowLeft size={17} />} sx={{ color: '#FFF', fontWeight: 900 }}>{c.company}</Button>
            <Button type="button" onClick={changeLanguage} startIcon={<Languages size={17} />} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{language === 'en' ? 'العربية' : 'EN'}</Button>
            <Button component="a" href={QUOTE_URL} variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>{c.quote}</Button>
            <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>{c.request}</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 6, md: 9 } }}>
        <Grid container spacing={5} alignItems="stretch">
          <Grid item xs={12} md={5}>
            <Chip label={c.chip} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1.4, mb: 3 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 40, md: 70 }, lineHeight: 0.95, fontWeight: 950, letterSpacing: -2, mb: 3 }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.7, fontWeight: 750, mb: 4 }}>{c.subtitle}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={playDemo} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}>{c.play}</Button>
              <Button component="a" href={ONBOARDING_URL} variant="outlined" sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, py: 1.5, borderRadius: 3 }}>{c.request}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, py: 1.5, borderRadius: 3 }}>{c.whatsapp}</Button>
            </Stack>

            <Paper sx={{ mt: 4, p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
              <Typography variant="h5" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 1.5 }}>{c.missionTitle}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.72)', lineHeight: 1.75 }}>{c.missionText}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper id="demo-player" sx={{ p: { xs: 3, md: 5 }, borderRadius: 7, bgcolor: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.98))', background: 'radial-gradient(circle at top right, rgba(198,167,94,0.18), transparent 24rem), rgba(15,23,42,0.92)', border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, minHeight: 540 }}>
              <Stack spacing={4}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip label={c.livePreview} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950 }} />
                  <Chip label={playing ? c.playing : active.duration} sx={{ bgcolor: playing ? alpha('#10b981', 0.14) : 'rgba(255,255,255,0.08)', color: playing ? '#10b981' : '#FFF', fontWeight: 900 }} />
                </Stack>

                <Box sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: '#020617', border: '1px solid rgba(255,255,255,0.08)', minHeight: 280, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                  <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at center, rgba(198,167,94,0.14), transparent 55%)' }} />
                  <Box sx={{ position: 'relative', zIndex: 1 }}>
                    <PlayCircle size={70} color={binThemeTokens.gold} />
                    <Typography variant="overline" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 950, mt: 2, letterSpacing: 2 }}>{frame.kicker}</Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, mb: 1.5 }}>{activeId === 'mission' ? frame.title : active.title}</Typography>
                    <Typography sx={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.8, maxWidth: 680 }}>{activeId === 'mission' ? frame.body : active.summary}</Typography>
                  </Box>
                </Box>

                <LinearProgress variant="determinate" value={playing ? progress : 0} sx={{ height: 7, borderRadius: 99, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />

                <Grid container spacing={1.5}>{active.bullets.map((bullet) => <Grid item xs={12} sm={6} md={3} key={bullet}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)' }}><CheckCircle2 size={16} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 850 }}>{bullet}</Typography></Box></Grid>)}</Grid>

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" startIcon={playing ? <PauseCircle size={18} /> : <PlayCircle size={18} />} onClick={() => setPlaying(!playing)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}>{playing ? c.pause : c.play}</Button>
                  <Button variant="outlined" startIcon={<RotateCcw size={18} />} onClick={replayDemo} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, py: 1.5, borderRadius: 3 }}>{c.replay}</Button>
                  <Button component="a" href={active.route} variant="outlined" sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, py: 1.5, borderRadius: 3 }}>{c.openFlow}</Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2.5} sx={{ mt: 6 }}>
          {demos.map((demo) => <Grid item xs={12} sm={6} md={4} lg={3} key={demo.id}>
            <Card onClick={() => { setActiveId(demo.id); setFrameIndex(0); setPlaying(true); document.getElementById('demo-player')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} sx={{ cursor: 'pointer', height: '100%', bgcolor: demo.id === active.id ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.72)', border: demo.id === active.id ? `1px solid ${alpha(binThemeTokens.gold, 0.68)}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 5, transition: '0.2s ease', '&:hover': { transform: 'translateY(-3px)', borderColor: alpha(binThemeTokens.gold, 0.62) } }}>
              <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}><Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{demo.icon}</Box><Chip size="small" label={demo.duration} sx={{ bgcolor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', fontWeight: 900 }} /></Stack>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{demo.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.58)', lineHeight: 1.65 }}>{demo.summary}</Typography>
                <Button size="small" startIcon={<PlayCircle size={15} />} sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 2, px: 0 }}>{c.play}</Button>
              </CardContent>
            </Card>
          </Grid>)}
        </Grid>

        <Grid container spacing={3} sx={{ mt: 6 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)', height: '100%' }}>
              <Typography variant="h4" fontWeight={950} sx={{ color: '#FFF', mb: 3 }}><ShieldCheck color={binThemeTokens.gold} /> {c.offerTitle}</Typography>
              <Grid container spacing={1.5}>{c.offerItems.map((item) => <Grid item xs={12} sm={6} key={item}><Stack direction="row" spacing={1.2} alignItems="center"><CheckCircle2 size={17} color={binThemeTokens.gold} /><Typography fontWeight={850}>{item}</Typography></Stack></Grid>)}</Grid>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.06), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, height: '100%' }}>
              <Typography variant="h4" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 3 }}>{c.whyTitle}</Typography>
              <Stack spacing={1.5}>{c.whyItems.map((item) => <Stack direction="row" spacing={1.2} alignItems="center" key={item}><CheckCircle2 size={17} color={binThemeTokens.gold} /><Typography fontWeight={850}>{item}</Typography></Stack>)}</Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 4 }}>
                <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{c.request}</Button>
                <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{c.whatsapp}</Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

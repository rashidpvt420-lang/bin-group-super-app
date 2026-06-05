import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowLeft, Building2, Camera, CheckCircle2, FileCheck2, Languages, MapPin, MessageCircle, Navigation, PauseCircle, PlayCircle, RotateCcw, ShieldCheck, Sparkles, Smartphone, Users, Wrench, Briefcase, Route, Home, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';

const WHATSAPP_URL = 'https://wa.me/971552423233';
const ONBOARDING_URL = '/onboarding';
const QUOTE_URL = '/onboarding?intent=quote';

const palette = {
  ink: '#111827',
  muted: '#667085',
  soft: '#F8F9FB',
  border: '#E5E7EB',
  gold: '#C9A646',
  goldDark: '#9A7A24',
  green: '#10B981',
  red: '#EF4444',
};

const scenes = {
  en: [
    { id: 'owner', title: 'Owner App', subtitle: 'Quote, contract, payment plan, active dashboard', metric: '15% mobilization', icon: <Building2 size={24} />, bullets: ['Property intake', 'Annual contract scope', 'Owner dashboard'], route: ONBOARDING_URL },
    { id: 'tenant', title: 'Tenant Request', subtitle: 'Photo issue report with unit and priority', metric: 'SOS ready', icon: <Users size={24} />, bullets: ['Leak photo', 'Priority', 'Status tracking'], route: '/tenants' },
    { id: 'technician', title: 'Technician Dispatch', subtitle: 'Job card, SLA timer, checklist, completion proof', metric: 'Field proof', icon: <Wrench size={24} />, bullets: ['Job card', 'Route', 'Before / after'], route: '/technicians' },
    { id: 'gps', title: 'GPS Route Map', subtitle: 'Nearest technician and live route context', metric: 'Live route', icon: <MapPin size={24} />, bullets: ['ETA', 'Route line', 'Dispatch status'], route: '/technicians' },
    { id: 'evidence', title: 'Before / After Evidence', subtitle: 'Visual proof before payment release or closeout', metric: 'Proof chain', icon: <Camera size={24} />, bullets: ['Before', 'After', 'Tenant approval'], route: '/owners' },
    { id: 'documents', title: 'Contracts & Reports', subtitle: 'PDF contract, invoice, report, property passport', metric: 'Audit ready', icon: <FileCheck2 size={24} />, bullets: ['Contract PDF', 'Invoice hash', 'Service report'], route: '/owners' },
    { id: 'broker', title: 'Broker Pipeline', subtitle: 'Owner lead, property record, commission tracking', metric: '5–8%', icon: <Briefcase size={24} />, bullets: ['Lead', 'Pipeline', 'Commission'], route: '/brokers' },
    { id: 'design', title: 'AI Design Studio', subtitle: 'Interior and exterior concept before approval', metric: 'AI preview', icon: <Sparkles size={24} />, bullets: ['Interior', 'Exterior', 'Approval'], route: '/request-demo?demo=design' },
  ],
  ar: [
    { id: 'owner', title: 'تطبيق المالك', subtitle: 'عرض سعر، عقد، خطة دفع، ولوحة متابعة', metric: '15٪ تفعيل', icon: <Building2 size={24} />, bullets: ['تفاصيل العقار', 'نطاق العقد', 'لوحة المالك'], route: ONBOARDING_URL },
    { id: 'tenant', title: 'طلب المستأجر', subtitle: 'بلاغ بالصورة مع الوحدة والأولوية', metric: 'طلب جاهز', icon: <Users size={24} />, bullets: ['صورة العطل', 'الأولوية', 'تتبع الحالة'], route: '/tenants' },
    { id: 'technician', title: 'إرسال الفني', subtitle: 'بطاقة عمل، مؤقت SLA، قائمة إثبات', metric: 'إثبات ميداني', icon: <Wrench size={24} />, bullets: ['بطاقة عمل', 'مسار', 'قبل / بعد'], route: '/technicians' },
    { id: 'gps', title: 'خريطة GPS', subtitle: 'أقرب فني وسياق المسار المباشر', metric: 'مسار مباشر', icon: <MapPin size={24} />, bullets: ['وقت الوصول', 'خط المسار', 'حالة الإرسال'], route: '/technicians' },
    { id: 'evidence', title: 'إثبات قبل وبعد', subtitle: 'إثبات بصري قبل إغلاق المهمة', metric: 'سلسلة إثبات', icon: <Camera size={24} />, bullets: ['قبل', 'بعد', 'موافقة المستأجر'], route: '/owners' },
    { id: 'documents', title: 'العقود والتقارير', subtitle: 'عقد PDF، فاتورة، تقرير، وجواز عقار', metric: 'جاهز للتدقيق', icon: <FileCheck2 size={24} />, bullets: ['عقد PDF', 'تجزئة فاتورة', 'تقرير خدمة'], route: '/owners' },
    { id: 'broker', title: 'مسار الوسيط', subtitle: 'إحالة مالك، سجل عقار، وتتبع عمولة', metric: '5–8٪', icon: <Briefcase size={24} />, bullets: ['إحالة', 'مسار', 'عمولة'], route: '/brokers' },
    { id: 'design', title: 'استوديو التصميم الذكي', subtitle: 'تصور داخلي وخارجي قبل الموافقة', metric: 'معاينة ذكية', icon: <Sparkles size={24} />, bullets: ['داخلي', 'خارجي', 'موافقة'], route: '/request-demo?demo=design' },
  ],
};

const copy = {
  en: {
    brand: 'BIN GROUP', company: 'Company', quote: 'Get Quote', request: 'Request Contract', chip: 'MISSION DEMO REEL',
    title: 'Show owners the system, not a placeholder video.',
    subtitle: 'A serious visual walkthrough of owner contracts, tenant service, technician dispatch, GPS tracking, before/after proof, documents, broker pipeline, and AI design.',
    play: 'Play Visual Demo', pause: 'Pause', replay: 'Replay', openFlow: 'Open This Flow', playing: 'Playing now',
    reel: 'Visual proof scenes', proof: 'What BIN GROUP provides',
    proofItems: ['Owner quote-to-contract path', 'Tenant photo requests', 'Technician GPS dispatch', 'Before/after evidence', 'PDF contracts and reports', 'Broker and AI design workflows'],
    whatsapp: 'WhatsApp BIN GROUP',
  },
  ar: {
    brand: 'BIN GROUP', company: 'الشركة', quote: 'احصل على عرض سعر', request: 'اطلب عقداً', chip: 'عرض مرئي للنظام',
    title: 'اعرض للمالك النظام نفسه، وليس فيديو فارغاً.',
    subtitle: 'مسار بصري جاد يوضح عقود الملاك وطلبات المستأجرين وإرسال الفنيين وGPS وإثبات قبل وبعد والمستندات والوسطاء والتصميم الذكي.',
    play: 'تشغيل العرض المرئي', pause: 'إيقاف مؤقت', replay: 'إعادة العرض', openFlow: 'افتح هذا المسار', playing: 'يعمل الآن',
    reel: 'مشاهد إثبات مرئية', proof: 'ماذا تقدم BIN GROUP',
    proofItems: ['مسار عرض السعر والعقد', 'طلبات مستأجرين بالصور', 'إرسال فني عبر GPS', 'إثبات قبل وبعد', 'عقود وتقارير PDF', 'مسارات الوسيط والتصميم الذكي'],
    whatsapp: 'تواصل عبر واتساب',
  },
};

function SceneArtwork({ id }: { id: string }) {
  if (id === 'gps') {
    return (
      <Box sx={{ height: 230, borderRadius: 5, bgcolor: '#EEF2F6', border: `1px solid ${palette.border}`, position: 'relative', overflow: 'hidden' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, rgba(17,24,39,0.06) 0 1px, transparent 1px 42px), repeating-linear-gradient(0deg, rgba(17,24,39,0.05) 0 1px, transparent 1px 42px)' }} />
        <Box sx={{ position: 'absolute', left: '14%', top: '62%', width: '72%', height: 8, bgcolor: palette.gold, transform: 'rotate(-11deg)', borderRadius: 99, boxShadow: `0 0 0 8px ${alpha(palette.gold, 0.14)}` }} />
        <MapPin size={48} color={palette.red} style={{ position: 'absolute', left: '10%', top: '48%' }} />
        <Navigation size={50} color={palette.goldDark} style={{ position: 'absolute', right: '12%', top: '28%' }} />
        <Chip label="ETA 18 MIN" sx={{ position: 'absolute', left: 26, top: 24, bgcolor: '#fff', color: palette.ink, fontWeight: 950 }} />
        <Chip label="SLA ACTIVE" sx={{ position: 'absolute', right: 26, bottom: 24, bgcolor: alpha(palette.green, 0.13), color: '#047857', fontWeight: 950 }} />
      </Box>
    );
  }

  if (id === 'evidence') {
    return (
      <Grid container spacing={1.5} sx={{ height: 230 }}>
        {['BEFORE', 'AFTER'].map((label, index) => <Grid item xs={6} key={label}>
          <Box sx={{ height: '100%', borderRadius: 5, border: `1px solid ${palette.border}`, bgcolor: index === 0 ? '#E5E7EB' : '#ECFDF5', position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: index === 0 ? 'radial-gradient(circle at 42% 48%, rgba(17,24,39,0.30), transparent 26%), linear-gradient(135deg, transparent, rgba(17,24,39,0.10))' : 'radial-gradient(circle at 42% 48%, rgba(16,185,129,0.30), transparent 26%), linear-gradient(135deg, transparent, rgba(201,166,70,0.14))' }} />
            <Camera size={44} color={index === 0 ? '#475467' : '#047857'} style={{ position: 'absolute', left: '50%', top: '45%', transform: 'translate(-50%,-50%)' }} />
            <Chip label={label} sx={{ position: 'absolute', left: 16, bottom: 16, bgcolor: '#fff', color: index === 0 ? '#475467' : '#047857', fontWeight: 950 }} />
          </Box>
        </Grid>)}
      </Grid>
    );
  }

  if (id === 'documents') {
    return (
      <Stack spacing={1.4} sx={{ height: 230 }}>
        {['SIGNED CONTRACT.pdf', 'SERVICE REPORT.pdf', 'INVOICE HASH VERIFIED'].map((row, index) => <Box key={row} sx={{ flex: 1, borderRadius: 4, bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', gap: 2, px: 2.2, boxShadow: '0 10px 22px rgba(17,24,39,0.06)' }}>
          <Box sx={{ width: 46, height: 46, borderRadius: 3, bgcolor: alpha(index === 2 ? palette.green : palette.gold, 0.14), display: 'grid', placeItems: 'center' }}><FileText size={24} color={index === 2 ? '#047857' : palette.goldDark} /></Box>
          <Box sx={{ minWidth: 0, flex: 1 }}><Typography noWrap fontWeight={950} color={palette.ink}>{row}</Typography><Typography noWrap fontSize={12} color={palette.muted}>Owner-ready audit record</Typography></Box>
          <CheckCircle2 size={22} color={index === 2 ? '#047857' : palette.goldDark} />
        </Box>)}
      </Stack>
    );
  }

  if (id === 'design') {
    return (
      <Grid container spacing={1.5} sx={{ height: 230 }}>
        {['INTERIOR', 'EXTERIOR'].map((label, index) => <Grid item xs={6} key={label}>
          <Box sx={{ height: '100%', borderRadius: 5, border: `1px solid ${palette.border}`, position: 'relative', overflow: 'hidden', bgcolor: index === 0 ? '#FAF7EF' : '#EEF6FF' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: index === 0 ? 'linear-gradient(135deg, rgba(201,166,70,0.32), transparent 42%), radial-gradient(circle at 72% 28%, rgba(17,24,39,0.14), transparent 22%)' : 'linear-gradient(135deg, rgba(14,165,233,0.18), transparent 45%), radial-gradient(circle at 35% 65%, rgba(201,166,70,0.22), transparent 24%)' }} />
            <Sparkles size={46} color={palette.goldDark} style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }} />
            <Chip label={label} sx={{ position: 'absolute', left: 16, bottom: 16, bgcolor: '#fff', color: palette.goldDark, fontWeight: 950 }} />
          </Box>
        </Grid>)}
      </Grid>
    );
  }

  return (
    <Box sx={{ height: 230, borderRadius: 5, bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, position: 'relative', overflow: 'hidden' }}>
      <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 18% 26%, rgba(201,166,70,0.28), transparent 20%), radial-gradient(circle at 78% 68%, rgba(17,24,39,0.10), transparent 23%), linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }} />
      <Box sx={{ position: 'absolute', left: 26, top: 24, right: 26 }}>
        <Stack spacing={1.4}>
          {['Property', 'Contract', 'Dashboard'].map((row, index) => <Box key={row} sx={{ height: 48, borderRadius: 3, bgcolor: '#fff', border: `1px solid ${palette.border}`, display: 'flex', alignItems: 'center', gap: 1.3, px: 1.8, boxShadow: '0 8px 18px rgba(17,24,39,0.05)' }}>
            {index === 0 ? <Home size={20} color={palette.goldDark} /> : index === 1 ? <FileCheck2 size={20} color={palette.goldDark} /> : <CheckCircle2 size={20} color={palette.green} />}
            <Typography fontWeight={950} color={palette.ink}>{row}</Typography>
            <Box sx={{ ml: 'auto', width: 74, height: 7, borderRadius: 99, bgcolor: alpha(index === 2 ? palette.green : palette.gold, 0.2) }}><Box sx={{ width: `${58 + index * 18}%`, height: '100%', borderRadius: 99, bgcolor: index === 2 ? palette.green : palette.gold }} /></Box>
          </Box>)}
        </Stack>
      </Box>
    </Box>
  );
}

function SceneCard({ scene, active, onClick }: { scene: any; active: boolean; onClick: () => void }) {
  return (
    <Card onClick={onClick} sx={{ cursor: 'pointer', height: '100%', borderRadius: 5, bgcolor: '#FFFFFF', border: active ? `2px solid ${palette.gold}` : `1px solid ${palette.border}`, boxShadow: active ? '0 20px 46px rgba(201,166,70,0.18)' : '0 12px 32px rgba(17,24,39,0.07)', transition: '0.2s ease', '&:hover': { transform: 'translateY(-3px)' } }}>
      <CardContent sx={{ p: 2.1 }}>
        <Box sx={{ color: palette.goldDark, mb: 1 }}>{scene.icon}</Box>
        <Typography fontWeight={950} color={palette.ink} sx={{ mb: 0.4 }}>{scene.title}</Typography>
        <Typography fontSize={13} color={palette.muted} sx={{ lineHeight: 1.5, minHeight: 39 }}>{scene.subtitle}</Typography>
        <Chip size="small" label={scene.metric} sx={{ mt: 1.5, bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, fontWeight: 950 }} />
      </CardContent>
    </Card>
  );
}

export default function DemoVideosPage() {
  const [params] = useSearchParams();
  const { lang, setLang, isRTL } = useLanguage();
  const language = lang === 'ar' ? 'ar' : 'en';
  const c = copy[language];
  const list = scenes[language];
  const selected = params.get('demo') || 'owner';
  const [activeId, setActiveId] = useState(list.some((item) => item.id === selected) ? selected : 'owner');
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const active = useMemo(() => list.find((item) => item.id === activeId) || list[0], [activeId, list]);
  const progress = ((frameIndex + 1) / list.length) * 100;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      setFrameIndex((current) => {
        const next = (current + 1) % list.length;
        setActiveId(list[next].id);
        return next;
      });
    }, 2400);
    return () => window.clearInterval(timer);
  }, [playing, list]);

  const changeLanguage = () => setLang(language === 'en' ? 'ar' : 'en');
  const selectScene = (id: string, index: number) => {
    setActiveId(id);
    setFrameIndex(index);
    setPlaying(true);
    document.getElementById('demo-reel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: palette.ink, direction: isRTL ? 'rtl' : 'ltr', background: 'radial-gradient(circle at 90% 4%, rgba(201,166,70,0.16), transparent 28rem), linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: 'rgba(255,255,255,0.94)', borderBottom: `1px solid ${palette.border}`, backdropFilter: 'blur(14px)' }}>
        <Container maxWidth="xl" sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button component="a" href="/" sx={{ color: palette.ink, p: 0, minWidth: 0, mr: isRTL ? 0 : 'auto', ml: isRTL ? 'auto' : 0 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.2} alignItems="center"><Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.5 }} /><Typography fontWeight={950}>{c.brand}</Typography></Stack>
          </Button>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
            <Button component="a" href="/" startIcon={<ArrowLeft size={17} />} sx={{ color: palette.ink, fontWeight: 900 }}>{c.company}</Button>
            <Button type="button" onClick={changeLanguage} startIcon={<Languages size={17} />} sx={{ color: palette.goldDark, fontWeight: 950 }}>{language === 'en' ? 'العربية' : 'EN'}</Button>
            <Button component="a" href={QUOTE_URL} variant="outlined" sx={{ color: palette.goldDark, borderColor: palette.gold, fontWeight: 950, borderRadius: 999 }}>{c.quote}</Button>
            <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{c.request}</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 4, md: 7 } }}>
        <Grid container spacing={4.5} alignItems="center">
          <Grid item xs={12} md={5}>
            <Chip label={c.chip} sx={{ bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, fontWeight: 950, letterSpacing: 1.4, mb: 3 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 38, md: 68 }, lineHeight: 0.96, fontWeight: 950, letterSpacing: -2, mb: 3, color: palette.ink }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: palette.muted, lineHeight: 1.72, fontWeight: 750, mb: 4 }}>{c.subtitle}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={() => setPlaying(true)} sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.play}</Button>
              <Button component="a" href={ONBOARDING_URL} variant="outlined" sx={{ borderColor: '#D0D5DD', color: palette.ink, fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.request}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ borderColor: palette.gold, color: palette.goldDark, fontWeight: 950, py: 1.5, borderRadius: 999 }}>{c.whatsapp}</Button>
            </Stack>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper id="demo-reel" sx={{ p: { xs: 2.2, md: 3.2 }, borderRadius: 7, bgcolor: '#FFFFFF', border: `1px solid ${alpha(palette.gold, 0.28)}`, boxShadow: '0 24px 70px rgba(17,24,39,0.10)' }}>
              <Stack spacing={2.2}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  <Chip label={c.reel} sx={{ bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, fontWeight: 950 }} />
                  <Chip label={playing ? c.playing : active.metric} sx={{ bgcolor: playing ? alpha(palette.green, 0.12) : '#F3F4F6', color: playing ? '#047857' : palette.ink, fontWeight: 950 }} />
                </Stack>

                <Box sx={{ borderRadius: 6, overflow: 'hidden', bgcolor: palette.soft, border: `1px solid ${palette.border}` }}>
                  <Box sx={{ p: { xs: 1.4, md: 2.2 } }}><SceneArtwork id={active.id} /></Box>
                  <Box sx={{ px: { xs: 2, md: 3 }, pb: 2.4 }}>
                    <Stack direction="row" spacing={1.3} alignItems="center" sx={{ mb: 1 }}><Box sx={{ width: 46, height: 46, borderRadius: 3, bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, display: 'grid', placeItems: 'center' }}>{active.icon}</Box><Box sx={{ minWidth: 0 }}><Typography variant="h5" fontWeight={950} color={palette.ink}>{active.title}</Typography><Typography color={palette.muted} fontWeight={750}>{active.subtitle}</Typography></Box></Stack>
                    <Grid container spacing={1}>{active.bullets.map((bullet) => <Grid item xs={12} sm={4} key={bullet}><Stack direction="row" spacing={1} alignItems="center"><CheckCircle2 size={16} color={palette.goldDark} /><Typography fontWeight={850} color={palette.ink}>{bullet}</Typography></Stack></Grid>)}</Grid>
                  </Box>
                </Box>

                <LinearProgress variant="determinate" value={playing ? progress : 0} sx={{ height: 7, borderRadius: 99, bgcolor: '#EEF2F6', '& .MuiLinearProgress-bar': { bgcolor: palette.gold } }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <Button variant="contained" startIcon={playing ? <PauseCircle size={18} /> : <PlayCircle size={18} />} onClick={() => setPlaying(!playing)} sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{playing ? c.pause : c.play}</Button>
                  <Button variant="outlined" startIcon={<RotateCcw size={18} />} onClick={() => { setFrameIndex(0); setActiveId(list[0].id); setPlaying(true); }} sx={{ borderColor: '#D0D5DD', color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{c.replay}</Button>
                  <Button component="a" href={active.route} variant="outlined" sx={{ borderColor: palette.gold, color: palette.goldDark, fontWeight: 950, borderRadius: 999 }}>{c.openFlow}</Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 6 }}>
          <Typography variant="h3" fontWeight={950} sx={{ color: palette.ink, mb: 1 }}>{c.reel}</Typography>
          <Grid container spacing={2.4} sx={{ mt: 1 }}>
            {list.map((scene, index) => <Grid item xs={12} sm={6} md={4} lg={3} key={scene.id}><SceneCard scene={scene} active={scene.id === active.id} onClick={() => selectScene(scene.id, index)} /></Grid>)}
          </Grid>
        </Box>

        <Grid container spacing={3} sx={{ mt: 6 }}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, boxShadow: '0 14px 38px rgba(17,24,39,0.07)' }}>
              <Typography variant="h4" fontWeight={950} sx={{ color: palette.ink, mb: 3 }}><ShieldCheck color={palette.goldDark} /> {c.proof}</Typography>
              <Grid container spacing={1.5}>{c.proofItems.map((item) => <Grid item xs={12} sm={6} key={item}><Stack direction="row" spacing={1.2} alignItems="center"><CheckCircle2 size={17} color={palette.goldDark} /><Typography color={palette.ink} fontWeight={850}>{item}</Typography></Stack></Grid>)}</Grid>
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, borderRadius: 5, bgcolor: alpha(palette.gold, 0.08), border: `1px solid ${alpha(palette.gold, 0.22)}`, height: '100%' }}>
              <Typography variant="h5" fontWeight={950} color={palette.goldDark} sx={{ mb: 2 }}>BIN GROUP</Typography>
              <Typography color={palette.ink} fontWeight={850} sx={{ lineHeight: 1.8 }}>A public demo must create confidence. This page now shows the operational evidence chain: request, dispatch, GPS, proof, documents, and owner reporting.</Typography>
              <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ mt: 3, bgcolor: palette.gold, color: palette.ink, fontWeight: 950 }}>{c.request}</Button>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}

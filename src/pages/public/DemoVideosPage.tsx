import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  Grid,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import {
  ArrowLeft,
  Briefcase,
  Building2,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileText,
  Home,
  Languages,
  MapPin,
  MessageCircle,
  Navigation,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
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
  blue: '#0EA5E9',
  white: '#FFFFFF',
};

type DemoScene = {
  id: string;
  title: string;
  subtitle: string;
  metric: string;
  icon: React.ReactNode;
  bullets: string[];
  route: string;
};

const scenes: Record<'en' | 'ar', DemoScene[]> = {
  en: [
    { id: 'owner', title: 'Owner App', subtitle: 'Quote, contract, payment plan, and active dashboard.', metric: '15% mobilization', icon: <Building2 size={22} />, bullets: ['Property intake', 'Contract scope', 'Owner dashboard'], route: ONBOARDING_URL },
    { id: 'tenant', title: 'Tenant Photo Request', subtitle: 'Service request with category, unit, priority, and image proof.', metric: 'SOS ready', icon: <Users size={22} />, bullets: ['Photo issue', 'Priority', 'Status tracking'], route: '/tenants' },
    { id: 'technician', title: 'Technician Dispatch', subtitle: 'Job card, route context, SLA timer, and field checklist.', metric: 'Field proof', icon: <Wrench size={22} />, bullets: ['Job card', 'Route', 'Completion proof'], route: '/technicians' },
    { id: 'gps', title: 'GPS Route Map', subtitle: 'Nearest verified technician routed to the property.', metric: 'Live route', icon: <MapPin size={22} />, bullets: ['ETA', 'Route line', 'SLA active'], route: '/technicians' },
    { id: 'evidence', title: 'Before / After Evidence', subtitle: 'Visual proof before payment release or service closeout.', metric: 'Proof chain', icon: <Camera size={22} />, bullets: ['Before', 'After', 'Tenant approval'], route: '/owners' },
    { id: 'documents', title: 'Contracts & Reports', subtitle: 'PDF contract, invoice, report, and property history.', metric: 'Audit ready', icon: <FileCheck2 size={22} />, bullets: ['Contract PDF', 'Invoice hash', 'Service report'], route: '/owners' },
    { id: 'broker', title: 'Broker Pipeline', subtitle: 'Owner lead, property record, and commission tracking.', metric: '5–8%', icon: <Briefcase size={22} />, bullets: ['Lead', 'Pipeline', 'Commission'], route: '/brokers' },
    { id: 'design', title: 'AI Design Studio', subtitle: 'Interior and exterior concept options before owner approval.', metric: 'AI preview', icon: <Sparkles size={22} />, bullets: ['Interior', 'Exterior', 'Approval'], route: '/request-demo?demo=design' },
  ],
  ar: [
    { id: 'owner', title: 'تطبيق المالك', subtitle: 'عرض سعر، عقد، خطة دفع، ولوحة متابعة.', metric: '15٪ تفعيل', icon: <Building2 size={22} />, bullets: ['تفاصيل العقار', 'نطاق العقد', 'لوحة المالك'], route: ONBOARDING_URL },
    { id: 'tenant', title: 'طلب مستأجر بصورة', subtitle: 'طلب خدمة مع التصنيف والوحدة والأولوية والصورة.', metric: 'طلب جاهز', icon: <Users size={22} />, bullets: ['صورة العطل', 'الأولوية', 'تتبع الحالة'], route: '/tenants' },
    { id: 'technician', title: 'إرسال الفني', subtitle: 'بطاقة عمل ومسار ومؤقت SLA وقائمة إثبات.', metric: 'إثبات ميداني', icon: <Wrench size={22} />, bullets: ['بطاقة عمل', 'مسار', 'إثبات الإغلاق'], route: '/technicians' },
    { id: 'gps', title: 'خريطة GPS', subtitle: 'أقرب فني موثق يتم توجيهه إلى العقار.', metric: 'مسار مباشر', icon: <MapPin size={22} />, bullets: ['وقت الوصول', 'خط المسار', 'SLA نشط'], route: '/technicians' },
    { id: 'evidence', title: 'إثبات قبل وبعد', subtitle: 'إثبات بصري قبل إغلاق الخدمة أو اعتماد الدفع.', metric: 'سلسلة إثبات', icon: <Camera size={22} />, bullets: ['قبل', 'بعد', 'موافقة المستأجر'], route: '/owners' },
    { id: 'documents', title: 'العقود والتقارير', subtitle: 'عقد PDF وفاتورة وتقرير وسجل العقار.', metric: 'جاهز للتدقيق', icon: <FileCheck2 size={22} />, bullets: ['عقد PDF', 'تجزئة فاتورة', 'تقرير خدمة'], route: '/owners' },
    { id: 'broker', title: 'مسار الوسيط', subtitle: 'إحالة مالك وسجل عقار وتتبع عمولة.', metric: '5–8٪', icon: <Briefcase size={22} />, bullets: ['إحالة', 'مسار', 'عمولة'], route: '/brokers' },
    { id: 'design', title: 'استوديو التصميم الذكي', subtitle: 'خيارات تصميم داخلي وخارجي قبل موافقة المالك.', metric: 'معاينة ذكية', icon: <Sparkles size={22} />, bullets: ['داخلي', 'خارجي', 'موافقة'], route: '/request-demo?demo=design' },
  ],
};

const copy = {
  en: {
    brand: 'BIN GROUP',
    company: 'Company',
    quote: 'Get Quote',
    request: 'Request Contract',
    chip: 'PROFESSIONAL MISSION DEMO',
    title: 'A serious visual demo for property owners.',
    subtitle: 'Show the complete service chain with clean operational panels: owner dashboard, tenant request, technician GPS, before/after proof, reports, broker flow, and AI design.',
    play: 'Play Demo Reel',
    pause: 'Pause',
    replay: 'Replay',
    openFlow: 'Open This Flow',
    playing: 'Playing now',
    reel: 'Operational visual reel',
    proof: 'What the owner can verify',
    proofItems: ['Quote-to-contract owner flow', 'Tenant photo request', 'Technician GPS dispatch', 'Before/after service proof', 'PDF contract and reports', 'Broker and AI design workflow'],
    whatsapp: 'WhatsApp BIN GROUP',
  },
  ar: {
    brand: 'BIN GROUP',
    company: 'الشركة',
    quote: 'احصل على عرض سعر',
    request: 'اطلب عقداً',
    chip: 'عرض احترافي مرئي',
    title: 'عرض مرئي جاد لملاك العقارات.',
    subtitle: 'إظهار سلسلة الخدمة كاملة بلوحات تشغيل نظيفة: لوحة المالك، طلب المستأجر، GPS الفني، إثبات قبل وبعد، التقارير، الوسيط، والتصميم الذكي.',
    play: 'تشغيل العرض',
    pause: 'إيقاف',
    replay: 'إعادة',
    openFlow: 'افتح هذا المسار',
    playing: 'يعمل الآن',
    reel: 'عرض مرئي للعمليات',
    proof: 'ما يستطيع المالك التحقق منه',
    proofItems: ['مسار عرض السعر والعقد', 'طلب مستأجر بصورة', 'إرسال فني عبر GPS', 'إثبات خدمة قبل وبعد', 'عقد وتقارير PDF', 'مسار الوسيط والتصميم الذكي'],
    whatsapp: 'تواصل عبر واتساب',
  },
};

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ p: 1.35, borderRadius: 2, bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, boxShadow: '0 8px 18px rgba(17,24,39,0.05)' }}>
      <Typography fontSize={11} color={palette.muted} fontWeight={850} noWrap>{label}</Typography>
      <Typography fontSize={{ xs: 20, md: 26 }} color={palette.ink} fontWeight={950} lineHeight={1.1}>{value}</Typography>
    </Box>
  );
}

function WorkflowRow({ label, done = true }: { label: string; done?: boolean }) {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <CheckCircle2 size={18} color={done ? '#047857' : palette.goldDark} />
      <Typography fontSize={{ xs: 13, md: 15 }} fontWeight={850} color={palette.ink} noWrap>{label}</Typography>
    </Stack>
  );
}

function DemoVisual({ id }: { id: string }) {
  const shell = {
    minHeight: { xs: 238, md: 340 },
    borderRadius: 2.4,
    border: `1px solid ${palette.border}`,
    bgcolor: '#FFFFFF',
    overflow: 'hidden',
    position: 'relative',
  } as const;

  if (id === 'gps' || id === 'technician') {
    return (
      <Box sx={{ ...shell, bgcolor: '#EEF6FF' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, rgba(17,24,39,.06) 0 1px, transparent 1px 36px), repeating-linear-gradient(0deg, rgba(17,24,39,.05) 0 1px, transparent 1px 36px)' }} />
        <Box sx={{ position: 'absolute', left: '13%', top: '64%', width: '72%', height: 7, borderRadius: 99, bgcolor: palette.gold, transform: 'rotate(-12deg)', boxShadow: `0 0 0 7px ${alpha(palette.gold, .15)}` }} />
        <MapPin size={42} color={palette.red} style={{ position: 'absolute', left: '9%', top: '53%' }} />
        <Navigation size={48} color={palette.goldDark} style={{ position: 'absolute', right: '12%', top: '25%' }} />
        <Paper sx={{ position: 'absolute', left: 14, top: 14, p: 1.15, borderRadius: 2, boxShadow: '0 8px 18px rgba(17,24,39,.08)' }}>
          <Typography fontSize={14} fontWeight={950} color={palette.ink}>ETA 18 MIN</Typography>
          <Typography fontSize={11} fontWeight={850} color="#047857">SLA ACTIVE</Typography>
        </Paper>
        <Paper sx={{ position: 'absolute', right: 14, bottom: 14, p: 1.15, borderRadius: 2, boxShadow: '0 8px 18px rgba(17,24,39,.08)' }}>
          <Typography fontSize={14} fontWeight={950} color={palette.ink}>Technician #04</Typography>
          <Typography fontSize={11} fontWeight={850} color={palette.muted}>Verified route</Typography>
        </Paper>
      </Box>
    );
  }

  if (id === 'evidence' || id === 'tenant') {
    return (
      <Grid container spacing={1.2} sx={{ minHeight: { xs: 238, md: 340 } }}>
        <Grid item xs={6}>
          <Box sx={{ height: '100%', minHeight: { xs: 238, md: 340 }, borderRadius: 2.4, bgcolor: '#E5E7EB', border: `1px solid ${palette.border}`, position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(102,112,133,.34), transparent 27%)' }} />
            <Camera size={46} color="#475467" style={{ position: 'absolute', left: '50%', top: '43%', transform: 'translate(-50%,-50%)' }} />
            <Chip label="BEFORE" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: '#fff', color: '#475467', fontWeight: 950 }} />
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box sx={{ height: '100%', minHeight: { xs: 238, md: 340 }, borderRadius: 2.4, bgcolor: '#DCFCE7', border: `1px solid ${palette.border}`, position: 'relative', overflow: 'hidden' }}>
            <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 42%, rgba(16,185,129,.26), transparent 30%)' }} />
            <CheckCircle2 size={58} color="#047857" style={{ position: 'absolute', left: '50%', top: '43%', transform: 'translate(-50%,-50%)' }} />
            <Chip label="AFTER" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: '#fff', color: '#047857', fontWeight: 950 }} />
          </Box>
        </Grid>
      </Grid>
    );
  }

  if (id === 'design') {
    return (
      <Grid container spacing={1.2} sx={{ minHeight: { xs: 238, md: 340 } }}>
        <Grid item xs={6}>
          <Box sx={{ height: '100%', minHeight: { xs: 238, md: 340 }, borderRadius: 2.4, bgcolor: '#FAF3DF', border: `1px solid ${palette.border}`, position: 'relative' }}>
            <Home size={70} color={palette.goldDark} style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }} />
            <Chip label="INTERIOR" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: '#fff', color: palette.goldDark, fontWeight: 950 }} />
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box sx={{ height: '100%', minHeight: { xs: 238, md: 340 }, borderRadius: 2.4, bgcolor: '#EAF6FF', border: `1px solid ${palette.border}`, position: 'relative' }}>
            <Building2 size={70} color={palette.blue} style={{ position: 'absolute', left: '50%', top: '42%', transform: 'translate(-50%,-50%)' }} />
            <Chip label="EXTERIOR" sx={{ position: 'absolute', left: 12, bottom: 12, bgcolor: '#fff', color: '#0369A1', fontWeight: 950 }} />
          </Box>
        </Grid>
      </Grid>
    );
  }

  if (id === 'documents') {
    return (
      <Box sx={{ ...shell, p: { xs: 1.25, md: 1.75 }, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1.1 }}>
        {['SIGNED CONTRACT.pdf', 'INVOICE HASH VERIFIED', 'SERVICE REPORT.pdf'].map((row, index) => (
          <Paper key={row} sx={{ p: 1.35, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.25, boxShadow: '0 8px 18px rgba(17,24,39,.06)' }}>
            <Box sx={{ width: 42, height: 42, borderRadius: 2, bgcolor: alpha(index === 1 ? palette.green : palette.gold, .14), display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <FileText size={22} color={index === 1 ? '#047857' : palette.goldDark} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography noWrap fontSize={{ xs: 13, md: 15 }} fontWeight={950}>{row}</Typography>
              <Typography noWrap fontSize={11} color={palette.muted}>Owner-ready audit record</Typography>
            </Box>
            <CheckCircle2 size={20} color={index === 1 ? '#047857' : palette.goldDark} />
          </Paper>
        ))}
      </Box>
    );
  }

  if (id === 'broker') {
    return (
      <Grid container spacing={1.2} sx={{ minHeight: { xs: 238, md: 340 } }}>
        {['Owner Lead', 'Property Record', 'Quote Accepted', 'Commission 5–8%'].map((row, index) => (
          <Grid item xs={6} key={row}>
            <Box sx={{ height: '100%', minHeight: { xs: 113, md: 164 }, borderRadius: 2.4, bgcolor: index === 3 ? '#ECFDF5' : '#FFFFFF', border: `1px solid ${palette.border}`, p: 1.4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <Briefcase size={28} color={index === 3 ? '#047857' : palette.goldDark} />
              <Box>
                <Typography fontSize={{ xs: 14, md: 17 }} fontWeight={950}>{row}</Typography>
                <Typography fontSize={11} color={palette.muted}>Partner pipeline</Typography>
              </Box>
            </Box>
          </Grid>
        ))}
      </Grid>
    );
  }

  return (
    <Box sx={{ ...shell, p: { xs: 1.25, md: 1.75 } }}>
      <Grid container spacing={1.1}>
        <Grid item xs={4}><MetricTile label="Health" value="92%" /></Grid>
        <Grid item xs={4}><MetricTile label="Contract" value="86K" /></Grid>
        <Grid item xs={4}><MetricTile label="SLA" value="98%" /></Grid>
      </Grid>
      <Paper sx={{ mt: 1.2, p: { xs: 1.25, md: 1.6 }, borderRadius: 2.2, boxShadow: '0 8px 18px rgba(17,24,39,.06)' }}>
        <Stack spacing={1.05}>
          <WorkflowRow label="Property intake completed" />
          <WorkflowRow label="Quote and 15% mobilization" />
          <WorkflowRow label="Dashboard opens after payment" done />
        </Stack>
      </Paper>
    </Box>
  );
}

function SceneCard({ scene, active, onClick }: { scene: DemoScene; active: boolean; onClick: () => void }) {
  return (
    <Card onClick={onClick} sx={{ cursor: 'pointer', height: '100%', borderRadius: 2.5, bgcolor: '#FFFFFF', border: active ? `2px solid ${palette.gold}` : `1px solid ${palette.border}`, boxShadow: active ? '0 18px 42px rgba(201,166,70,0.18)' : '0 10px 28px rgba(17,24,39,0.06)', transition: '0.2s ease', '&:hover': { transform: 'translateY(-3px)' } }}>
      <CardContent sx={{ p: 2 }}>
        <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 1 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{scene.icon}</Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap fontWeight={950} color={palette.ink}>{scene.title}</Typography>
            <Typography noWrap fontSize={12} color={palette.muted}>{scene.metric}</Typography>
          </Box>
        </Stack>
        <Typography fontSize={13} color={palette.muted} sx={{ lineHeight: 1.55 }}>{scene.subtitle}</Typography>
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
  const initialIndex = Math.max(0, list.findIndex((item) => item.id === selected));
  const [activeId, setActiveId] = useState(list[initialIndex]?.id || 'owner');
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(initialIndex);
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
    }, 2800);
    return () => window.clearInterval(timer);
  }, [playing, list]);

  const selectScene = (id: string, index: number) => {
    setActiveId(id);
    setFrameIndex(index);
    setPlaying(true);
    document.getElementById('demo-reel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: palette.ink, direction: isRTL ? 'rtl' : 'ltr', background: 'radial-gradient(circle at 92% 4%, rgba(201,166,70,0.10), transparent 28rem), linear-gradient(180deg, #FFFFFF 0%, #F8F9FB 100%)' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: 'rgba(255,255,255,0.96)', borderBottom: `1px solid ${palette.border}`, backdropFilter: 'blur(14px)' }}>
        <Container maxWidth="xl" sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
          <Button component="a" href="/" sx={{ color: palette.ink, p: 0, minWidth: 0, mr: isRTL ? 0 : 'auto', ml: isRTL ? 'auto' : 0 }}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1.1} alignItems="center">
              <Box component="img" src="/logo.png" sx={{ width: 40, height: 40, borderRadius: 1.5 }} />
              <Typography fontWeight={950}>{c.brand}</Typography>
            </Stack>
          </Button>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1 }}>
            <Button component="a" href="/" startIcon={<ArrowLeft size={16} />} sx={{ color: palette.ink, fontWeight: 900 }}>{c.company}</Button>
            <Button type="button" onClick={() => setLang(language === 'en' ? 'ar' : 'en')} startIcon={<Languages size={16} />} sx={{ color: palette.goldDark, fontWeight: 950 }}>{language === 'en' ? 'العربية' : 'EN'}</Button>
            <Button component="a" href={QUOTE_URL} variant="outlined" sx={{ color: palette.goldDark, borderColor: palette.gold, fontWeight: 950, borderRadius: 999 }}>{c.quote}</Button>
            <Button component="a" href={ONBOARDING_URL} variant="contained" sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{c.request}</Button>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 7 } }}>
        <Grid container spacing={{ xs: 3, md: 4.5 }} alignItems="center">
          <Grid item xs={12} md={5}>
            <Chip label={c.chip} sx={{ bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, fontWeight: 950, letterSpacing: 1, mb: 2.5 }} />
            <Typography variant="h1" sx={{ fontSize: { xs: 34, md: 64 }, lineHeight: 1, fontWeight: 950, letterSpacing: -2, mb: 2.5, color: palette.ink }}>{c.title}</Typography>
            <Typography variant="h6" sx={{ color: palette.muted, lineHeight: 1.72, fontWeight: 750, mb: 3 }}>{c.subtitle}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={() => setPlaying(true)} sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, py: 1.35, borderRadius: 999 }}>{c.play}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" startIcon={<MessageCircle size={17} />} sx={{ borderColor: palette.gold, color: palette.goldDark, fontWeight: 950, py: 1.35, borderRadius: 999 }}>{c.whatsapp}</Button>
            </Stack>
          </Grid>

          <Grid item xs={12} md={7}>
            <Paper id="demo-reel" sx={{ p: { xs: 1.25, md: 2.4 }, borderRadius: { xs: 2.5, md: 3.5 }, bgcolor: '#FFFFFF', border: `1px solid ${alpha(palette.gold, 0.24)}`, boxShadow: '0 18px 48px rgba(17,24,39,0.10)', overflow: 'visible' }}>
              <Stack spacing={1.75}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  <Chip label={c.reel} sx={{ bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, fontWeight: 950 }} />
                  <Chip label={playing ? c.playing : active.metric} sx={{ bgcolor: playing ? alpha(palette.green, 0.12) : '#F3F4F6', color: playing ? '#047857' : palette.ink, fontWeight: 950 }} />
                </Stack>

                <Box sx={{ borderRadius: { xs: 2, md: 3 }, overflow: 'hidden', bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, boxShadow: '0 10px 26px rgba(17,24,39,0.06)' }}>
                  <Box sx={{ p: { xs: 1.25, md: 2 }, bgcolor: '#F8F9FB', borderBottom: `1px solid ${palette.border}` }}>
                    <DemoVisual id={active.id} />
                  </Box>
                  <Box sx={{ p: { xs: 1.75, md: 2.4 }, bgcolor: '#FFFFFF' }}>
                    <Stack direction="row" spacing={1.2} alignItems="flex-start" sx={{ mb: 1.2 }}>
                      <Box sx={{ width: 42, height: 42, borderRadius: 2.2, bgcolor: alpha(palette.gold, 0.14), color: palette.goldDark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{active.icon}</Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="h5" fontWeight={950} color={palette.ink} sx={{ fontSize: { xs: 23, md: 30 }, lineHeight: 1.1 }}>{active.title}</Typography>
                        <Typography color={palette.muted} fontWeight={750} sx={{ fontSize: { xs: 14, md: 17 }, lineHeight: 1.45 }}>{active.subtitle}</Typography>
                      </Box>
                    </Stack>
                    <Grid container spacing={0.75}>
                      {active.bullets.map((bullet) => (
                        <Grid item xs={12} sm={4} key={bullet}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <CheckCircle2 size={16} color={palette.goldDark} />
                            <Typography fontWeight={850} color={palette.ink} sx={{ fontSize: 15 }}>{bullet}</Typography>
                          </Stack>
                        </Grid>
                      ))}
                    </Grid>
                  </Box>
                </Box>

                <LinearProgress variant="determinate" value={playing ? progress : 0} sx={{ height: 7, borderRadius: 99, bgcolor: '#EEF2F6', '& .MuiLinearProgress-bar': { bgcolor: palette.gold } }} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                  <Button variant="contained" startIcon={playing ? <PauseCircle size={18} /> : <PlayCircle size={18} />} onClick={() => setPlaying(!playing)} sx={{ bgcolor: palette.gold, color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{playing ? c.pause : c.play}</Button>
                  <Button variant="outlined" startIcon={<RotateCcw size={18} />} onClick={() => { setFrameIndex(0); setActiveId(list[0].id); setPlaying(true); }} sx={{ borderColor: '#D0D5DD', color: palette.ink, fontWeight: 950, borderRadius: 999 }}>{c.replay}</Button>
                  <Button component="a" href={active.route} variant="outlined" sx={{ borderColor: palette.gold, color: palette.goldDark, fontWeight: 950, borderRadius: 999 }}>{c.openFlow}</Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Box sx={{ mt: 5 }}>
          <Typography variant="h3" fontWeight={950} sx={{ color: palette.ink, mb: 2 }}>{c.reel}</Typography>
          <Grid container spacing={2}>
            {list.map((scene, index) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={scene.id}>
                <SceneCard scene={scene} active={scene.id === active.id} onClick={() => selectScene(scene.id, index)} />
              </Grid>
            ))}
          </Grid>
        </Box>

        <Paper sx={{ mt: 5, p: { xs: 2.5, md: 4 }, borderRadius: 3.5, bgcolor: '#FFFFFF', border: `1px solid ${palette.border}`, boxShadow: '0 14px 38px rgba(17,24,39,0.07)' }}>
          <Typography variant="h4" fontWeight={950} sx={{ color: palette.ink, mb: 2 }}><ShieldCheck color={palette.goldDark} /> {c.proof}</Typography>
          <Grid container spacing={1.5}>
            {c.proofItems.map((item) => (
              <Grid item xs={12} sm={6} md={4} key={item}>
                <Stack direction="row" spacing={1.2} alignItems="center">
                  <CheckCircle2 size={17} color={palette.goldDark} />
                  <Typography color={palette.ink} fontWeight={850}>{item}</Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Paper>
      </Container>
    </Box>
  );
}

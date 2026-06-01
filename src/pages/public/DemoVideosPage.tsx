import React, { useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, Users, Wrench, Briefcase, MapPin, FileText, PlayCircle, Sparkles, ArrowLeft, CheckCircle2, Languages } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

const demos = [
  { id: 'owner', title: 'Owner Contract Demo', duration: '03:40', route: '/owners', icon: <Building2 size={28} />, summary: 'Property intake, custom quote, contract scope, payment plan, and owner dashboard preview.', bullets: ['Property intake', 'Custom quote', 'Contract scope', 'Payment plan'] },
  { id: 'tenant', title: 'Tenant Service Demo', duration: '02:55', route: '/tenants', icon: <Users size={28} />, summary: 'Service request with category, priority, photo, location confirmation, and status tracking.', bullets: ['Photo request', 'Priority', 'Location', 'Tracking'] },
  { id: 'technician', title: 'Technician Field Demo', duration: '03:10', route: '/technicians', icon: <Wrench size={28} />, summary: 'Job card, route context, work proof upload, and completion workflow.', bullets: ['Job card', 'Route context', 'Proof upload', 'Completion'] },
  { id: 'broker', title: 'Broker Partner Demo', duration: '02:20', route: '/brokers', icon: <Briefcase size={28} />, summary: 'Owner leads, property opportunities, pipeline records, and commission-ready tracking.', bullets: ['Owner lead', 'Property record', 'Pipeline', 'Commission'] },
  { id: 'gps', title: 'GPS Operations Demo', duration: '02:45', route: '/technicians', icon: <MapPin size={28} />, summary: 'Property coordinates and technician route context for faster service coordination.', bullets: ['Property map', 'Route context', 'Status view', 'Response clarity'] },
  { id: 'pdf', title: 'PDF & Report Demo', duration: '02:35', route: '/owners', icon: <FileText size={28} />, summary: 'Contracts, service reports, property records, and owner-ready PDF history.', bullets: ['Contract PDF', 'Service report', 'History', 'Property record'] },
  { id: 'ai-design', title: 'AI Design Studio Demo', duration: '03:25', route: '/ai-design-studio', icon: <Sparkles size={28} />, summary: 'Interior and exterior design preview, scope ideas, materials, and owner approval path.', bullets: ['Interior', 'Exterior', 'Scope', 'Approval'] },
];

export default function DemoVideosPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { lang, setLang, isRTL } = useLanguage();
  const selected = params.get('demo') || 'owner';
  const [activeId, setActiveId] = useState(demos.some((demo) => demo.id === selected) ? selected : 'owner');
  const active = useMemo(() => demos.find((demo) => demo.id === activeId) || demos[0], [activeId]);

  return <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
    <Box sx={{ position: 'sticky', top: 0, zIndex: 30, bgcolor: 'rgba(2,6,23,0.92)', borderBottom: '1px solid rgba(198,167,94,0.18)', backdropFilter: 'blur(14px)' }}>
      <Container maxWidth="xl" sx={{ py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
        <Stack component={Link} to="/company" direction="row" spacing={1.2} alignItems="center" sx={{ color: '#FFF', textDecoration: 'none' }}>
          <Box component="img" src="/logo.png" sx={{ width: 42, height: 42, borderRadius: 1.5 }} />
          <Typography fontWeight={950}>BIN <Box component="span" sx={{ color: binThemeTokens.gold }}>GROUP</Box></Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button onClick={() => navigate('/company')} startIcon={<ArrowLeft size={17} />} sx={{ color: '#FFF', fontWeight: 900 }}>Company</Button>
          <Button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')} startIcon={<Languages size={17} />} sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{lang === 'en' ? 'AR' : 'EN'}</Button>
          <Button component={Link} to="/onboarding" variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>Request Contract</Button>
        </Stack>
      </Container>
    </Box>

    <Container maxWidth="xl" sx={{ py: { xs: 6, md: 9 } }}>
      <Grid container spacing={5} alignItems="stretch">
        <Grid item xs={12} md={5}>
          <Chip label="PUBLIC DEMO & VIDEOS" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1.6, mb: 3 }} />
          <Typography variant="h1" sx={{ fontSize: { xs: 42, md: 70 }, lineHeight: 0.95, fontWeight: 950, letterSpacing: -2, mb: 3 }}>Watch how BIN GROUP works before onboarding</Typography>
          <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.66)', lineHeight: 1.65, fontWeight: 750, mb: 4 }}>Working public demo area for owner, tenant, technician, broker, GPS, PDF, and AI Design Studio flows.</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={() => document.getElementById('demo-player')?.scrollIntoView({ behavior: 'smooth' })} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}>Play Demo</Button>
            <Button variant="outlined" onClick={() => navigate('/onboarding')} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, py: 1.5, borderRadius: 3 }}>Request Contract</Button>
          </Stack>
        </Grid>
        <Grid item xs={12} md={7}>
          <Paper id="demo-player" sx={{ p: { xs: 3, md: 5 }, borderRadius: 7, bgcolor: 'rgba(15,23,42,0.82)', border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, minHeight: 520 }}>
            <Stack spacing={4}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}><Chip label="LIVE PREVIEW PLAYER" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950 }} /><Chip label={active.duration} sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFF', fontWeight: 900 }} /></Stack>
              <Box sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, bgcolor: '#020617', border: '1px solid rgba(255,255,255,0.08)', minHeight: 250, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}><PlayCircle size={64} color={binThemeTokens.gold} /><Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 3, mb: 1.5 }}>{active.title}</Typography><Typography sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.75, maxWidth: 650 }}>{active.summary}</Typography></Box>
              <Grid container spacing={1.5}>{active.bullets.map((bullet) => <Grid item xs={12} sm={6} md={3} key={bullet}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)' }}><CheckCircle2 size={16} color={binThemeTokens.gold} /><Typography variant="body2" sx={{ color: '#FFF', fontWeight: 850 }}>{bullet}</Typography></Box></Grid>)}</Grid>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" startIcon={<PlayCircle size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}>Playing Demo</Button><Button variant="outlined" onClick={() => navigate(active.route)} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, py: 1.5, borderRadius: 3 }}>Open Related Flow</Button></Stack>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
      <Grid container spacing={2.5} sx={{ mt: 6 }}>{demos.map((demo) => <Grid item xs={12} sm={6} md={4} lg={3} key={demo.id}><Card onClick={() => setActiveId(demo.id)} sx={{ cursor: 'pointer', height: '100%', bgcolor: demo.id === active.id ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.72)', border: demo.id === active.id ? `1px solid ${alpha(binThemeTokens.gold, 0.68)}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}><CardContent sx={{ p: 3 }}><Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}><Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{demo.icon}</Box><Chip size="small" label={demo.duration} sx={{ bgcolor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', fontWeight: 900 }} /></Stack><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{demo.title}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>{demo.summary}</Typography><Button size="small" startIcon={<PlayCircle size={15} />} sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 2, px: 0 }}>Preview</Button></CardContent></Card></Grid>)}</Grid>
    </Container>
  </Box>;
}

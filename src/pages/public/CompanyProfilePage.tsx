import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Card, CardContent, Chip, CircularProgress, Container, Grid, IconButton, Link as MuiLink, Paper, Stack, Typography, alpha } from '@mui/material';
import { Award, Briefcase, Building2, CheckCircle2, Globe, Mail, MapPin, MessageSquare, Phone, PlayCircle, Rocket, Shield, ShieldCheck, Sparkles, Users, Video, Wrench, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';
import { COMPANY_PROFILE_DOC_PATH, CompanyProfile, CompanyService, DEFAULT_COMPANY_PROFILE, normalizeCompanyProfile } from '../../lib/companyProfile';

const PUBLIC_CONTACT = { whatsapp: '+971 55 2423233', phone: '+971 55 7474560', email: 'owner@bin-group.com' };

function serviceIcon(icon?: CompanyService['icon']) {
  if (icon === 'zap') return <Zap size={30} />;
  if (icon === 'briefcase') return <Briefcase size={30} />;
  if (icon === 'users') return <Users size={30} />;
  if (icon === 'shield') return <Shield size={30} />;
  if (icon === 'wrench') return <Wrench size={30} />;
  if (icon === 'sparkles') return <Sparkles size={30} />;
  if (icon === 'shield-check') return <ShieldCheck size={30} />;
  return <Building2 size={30} />;
}

const pricingModels = [
  { label: 'Maintenance Contracts', value: 'Custom Quote', note: 'Prepared by property size, scope, condition, SLA, service frequency, and portfolio requirements.' },
  { label: 'Property Management', value: '5% model', note: 'Property management can be charged at 5% per rented unit or as agreed per portfolio.' },
  { label: 'Mobilization', value: '15% upfront', note: 'Initial activation amount before full onboarding and service mobilization.' },
  { label: 'Payment Plans', value: 'Monthly / Quarterly / Annual', note: 'Flexible plans for serious owners and long-term service contracts.' },
];

const publicFlows = [
  { title: 'Owner Journey', text: 'Property details, quote, contract selection, mobilization amount, payment plan, PDFs, videos, and dashboard visibility.' },
  { title: 'Tenant Journey', text: 'Photo request, category, priority, location confirmation, service tracking, and completion confirmation.' },
  { title: 'Technician Journey', text: 'Direct field workfeed, GPS route context, proof upload, job completion, and performance accountability.' },
  { title: 'Broker Journey', text: 'Owner referrals, property leads, pipeline records, and commission-ready tracking.' },
];

const demoVideos = [
  {
    id: 'owner',
    title: 'Owner Contract Demo',
    length: '03:40',
    route: '/owners',
    icon: <Building2 size={28} />,
    summary: 'Owner submits property details, receives a custom quote, selects contract scope, chooses payment plan, and starts onboarding.',
    bullets: ['Property intake', 'Custom quote', 'Contract selection', 'Payment plan'],
  },
  {
    id: 'tenant',
    title: 'Tenant Service Demo',
    length: '02:55',
    route: '/tenants',
    icon: <Users size={28} />,
    summary: 'Tenant submits a maintenance request with photo proof, category, priority, location confirmation, and service status tracking.',
    bullets: ['Photo request', 'Priority category', 'Status tracking', 'Completion confirmation'],
  },
  {
    id: 'technician',
    title: 'Technician Field Demo',
    length: '03:10',
    route: '/technicians',
    icon: <Wrench size={28} />,
    summary: 'Technician receives the job card, sees route context, uploads proof, updates status, and completes the service record.',
    bullets: ['Job card', 'GPS route', 'Proof upload', 'Completion record'],
  },
  {
    id: 'broker',
    title: 'Broker Partner Demo',
    length: '02:20',
    route: '/brokers',
    icon: <Briefcase size={28} />,
    summary: 'Broker registers owner referrals, property leads, pipeline records, and commission-ready activity logs.',
    bullets: ['Owner lead', 'Property record', 'Pipeline status', 'Commission-ready trail'],
  },
  {
    id: 'gps',
    title: 'GPS Dispatch Demo',
    length: '02:45',
    route: '/request-demo',
    icon: <MapPin size={28} />,
    summary: 'Shows how property location, request category, and technician route context work together for faster service execution.',
    bullets: ['Location context', 'Route visibility', 'Dispatch clarity', 'Faster response'],
  },
  {
    id: 'documents',
    title: 'PDF & Report Demo',
    length: '02:35',
    route: '/request-demo',
    icon: <Video size={28} />,
    summary: 'Explains contracts, service proof, maintenance history, move-in/out records, and owner-ready reports.',
    bullets: ['Contracts', 'Service proof', 'Maintenance history', 'Owner reports'],
  },
  {
    id: 'ai-design',
    title: 'AI Design Studio Demo',
    length: '03:25',
    route: '/ai-design-studio',
    icon: <Sparkles size={28} />,
    summary: 'Shows how owners can explore interior/exterior concepts, improvement scopes, material direction, and quote paths.',
    bullets: ['Design concept', 'Scope package', 'Material path', 'Quote direction'],
  },
];

const solved = [
  'Owners stop chasing calls and unclear updates.',
  'Tenants submit service requests with photos and location context.',
  'Technicians receive direct work instructions and proof requirements.',
  'Brokers support growth through structured lead records.',
  'Demo and video walkthroughs build trust before onboarding.',
  'Every property builds a digital passport of contracts, tickets, evidence, and history.',
];

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { isRTL } = useLanguage();
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [activeDemoId, setActiveDemoId] = useState(demoVideos[0].id);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, ...COMPANY_PROFILE_DOC_PATH), (snap) => {
      setProfile(normalizeCompanyProfile(snap.exists() ? (snap.data() as Partial<CompanyProfile>) : null));
      setLoading(false);
    }, () => {
      setProfile(DEFAULT_COMPANY_PROFILE);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const whatsappDigits = useMemo(() => PUBLIC_CONTACT.whatsapp.replace(/[^0-9]/g, ''), []);
  const activeDemo = useMemo(() => demoVideos.find((demo) => demo.id === activeDemoId) || demoVideos[0], [activeDemoId]);

  if (loading) return <Box sx={{ minHeight: '100vh', bgcolor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.24), transparent 36%), radial-gradient(circle at bottom left, rgba(59,130,246,0.12), transparent 32%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 10, md: 16 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip label="UAE SOVEREIGN PROPERTY CARE OS" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1.5 }} />
                  <Chip label="DEMO + VIDEOS AVAILABLE" sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)', fontWeight: 950 }} />
                </Stack>
                <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: -2.5, fontSize: { xs: '2.55rem', md: '4.4rem' }, lineHeight: 0.95, textAlign: isRTL ? 'right' : 'left' }}>{profile.companyName}</Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800, maxWidth: 760, lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>{profile.headline}</Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' }, pt: 2 }}>
                  <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>Request Contract</Button>
                  <Button variant="outlined" startIcon={<PlayCircle size={18} />} onClick={() => document.getElementById('demo-videos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>Watch Demo</Button>
                  <Button variant="outlined" startIcon={<Video size={18} />} onClick={() => document.getElementById('demo-videos')?.scrollIntoView({ behavior: 'smooth' })} sx={{ borderColor: alpha(binThemeTokens.gold, 0.65), color: binThemeTokens.gold, fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>Videos</Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6 }}>
                <Stack spacing={2.5}>
                  <Shield color={binThemeTokens.gold} size={38} />
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950, letterSpacing: 2 }}>COMPANY LICENSE / OPERATING MODEL</Typography>
                  <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{profile.licenseInfo}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, fontWeight: 700 }}>{profile.aboutText}</Typography>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={3}>
          {pricingModels.map((item) => (
            <Grid item xs={12} md={3} key={item.label}>
              <Card sx={{ height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950 }}>{item.label.toUpperCase()}</Typography>
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
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>WHAT WE SOLVE</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 3, letterSpacing: -1 }}>One operating system for the full property-care chain</Typography>
              <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 700, lineHeight: 1.9, mb: 3 }}>BIN GROUP connects owners, tenants, technicians, and brokers into one transparent operating flow. It replaces scattered calls, manual follow-ups, unclear service history, and delayed proof with structured digital execution.</Typography>
              <Grid container spacing={2}>
                {solved.map((item) => (
                  <Grid item xs={12} sm={6} key={item}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} style={{ marginTop: 3 }} />
                      <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800, lineHeight: 1.6 }}>{item}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.7)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, borderRadius: 6 }}>
                <Award color={binThemeTokens.gold} size={56} />
                <Typography variant="h5" fontWeight="950" sx={{ mt: 2, mb: 1 }}>UAE-first model</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, fontWeight: 700 }}>A UAE-first property care model combining smart maintenance, property management, AI support, tenant service, technician dispatch, broker growth, proof-of-work, demos, videos, and owner contract activation in one platform.</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Box sx={{ mb: 8, textAlign: 'center' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SERVICES & REVENUE MODEL</Typography>
          <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>What BIN GROUP offers</Typography>
        </Box>
        <Grid container spacing={3}>
          {profile.services.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.id}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, height: '100%' }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, width: 'fit-content', color: binThemeTokens.gold, mb: 3 }}>{serviceIcon(service.icon)}</Box>
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
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>PUBLIC WORKFLOWS</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>Customer-facing value only</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.55)', mt: 1, maxWidth: 760, mx: 'auto' }}>Internal administration stays private. The public profile focuses on owners, tenants, technicians, brokers, demos, videos, and the value they receive.</Typography>
          </Box>
          <Grid container spacing={3}>
            {publicFlows.map((item) => (
              <Grid item xs={12} md={6} key={item.title}>
                <Card sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
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
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>DEMO & VIDEOS</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>Watch the platform before onboarding</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.58)', mt: 1.5, maxWidth: 780, mx: 'auto', lineHeight: 1.8 }}>Real public demo tiles for the full customer journey: owner contract, tenant request, technician field work, broker partner flow, GPS dispatch, PDF reports, and AI Design Studio.</Typography>
          </Box>

          <Grid container spacing={4} alignItems="stretch">
            <Grid item xs={12} md={6}>
              <Paper sx={{ height: '100%', minHeight: 520, p: { xs: 3, md: 5 }, borderRadius: 7, bgcolor: 'rgba(15,23,42,0.82)', border: `1px solid ${alpha(binThemeTokens.gold, 0.32)}`, position: 'relative', overflow: 'hidden' }}>
                <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.18), transparent 40%)', pointerEvents: 'none' }} />
                <Stack spacing={4} sx={{ position: 'relative', height: '100%' }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
                    <Chip label="PUBLIC DEMO PLAYER" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1.3 }} />
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
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, p: 1.5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)' }}>
                          <CheckCircle2 size={16} color={binThemeTokens.gold} />
                          <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 850 }}>{bullet}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 'auto' }}>
                    <Button variant="contained" startIcon={<PlayCircle size={18} />} onClick={() => navigate(`/request-demo?demo=${activeDemo.id}`)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.6, borderRadius: 3 }}>
                      Watch This Demo
                    </Button>
                    <Button variant="outlined" onClick={() => navigate(activeDemo.route)} sx={{ borderColor: 'rgba(255,255,255,0.18)', color: '#FFF', fontWeight: 950, py: 1.6, borderRadius: 3 }}>
                      Open Related Page
                    </Button>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6}>
              <Grid container spacing={2}>
                {demoVideos.map((demo) => {
                  const selected = demo.id === activeDemo.id;
                  return (
                    <Grid item xs={12} sm={6} key={demo.id}>
                      <Card onClick={() => setActiveDemoId(demo.id)} sx={{ cursor: 'pointer', height: '100%', bgcolor: selected ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.72)', border: selected ? `1px solid ${alpha(binThemeTokens.gold, 0.68)}` : '1px solid rgba(255,255,255,0.06)', borderRadius: 5, transition: '0.2s ease', '&:hover': { transform: 'translateY(-3px)', borderColor: alpha(binThemeTokens.gold, 0.55) } }}>
                        <CardContent sx={{ p: 3 }}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                            <Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{demo.icon}</Box>
                            <Chip size="small" label={demo.length} sx={{ bgcolor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.75)', fontWeight: 900 }} />
                          </Stack>
                          <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{demo.title}</Typography>
                          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>{demo.summary}</Typography>
                          <Button size="small" startIcon={<PlayCircle size={15} />} sx={{ color: binThemeTokens.gold, fontWeight: 950, mt: 2, px: 0 }}>
                            Preview
                          </Button>
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
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}><Rocket color={binThemeTokens.gold} size={32} /><Typography variant="h4" fontWeight="950" color="#FFF">Mission</Typography></Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700, lineHeight: 1.8 }}>{profile.mission}</Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}><Globe color={binThemeTokens.gold} size={32} /><Typography variant="h4" fontWeight="950" color="#FFF">Vision</Typography></Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 700, lineHeight: 1.8 }}>{profile.vision}</Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Container maxWidth="lg" sx={{ py: 12 }}>
        <Grid container spacing={6}>
          <Grid item xs={12} md={5}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 4 }}>Contact BIN GROUP</Typography>
            <Stack spacing={4}>
              {[
                { label: 'WhatsApp', value: PUBLIC_CONTACT.whatsapp, icon: <MessageSquare />, color: '#25D366' },
                { label: 'Phone', value: PUBLIC_CONTACT.phone, icon: <Phone />, color: binThemeTokens.gold },
                { label: 'Email', value: PUBLIC_CONTACT.email, icon: <Mail />, color: '#3b82f6' },
              ].map((item) => (
                <Stack key={item.label} direction="row" spacing={3} alignItems="center">
                  <Box sx={{ p: 2, bgcolor: alpha(item.color, 0.1), borderRadius: 3, color: item.color, display: 'flex' }}>{item.icon}</Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1 }}>{item.label.toUpperCase()}</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{item.value}</Typography>
                  </Box>
                </Stack>
              ))}
              <Button variant="contained" size="large" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 3 }}>WhatsApp BIN GROUP</Button>
            </Stack>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 5, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h5" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5 }}><MapPin color={binThemeTokens.gold} /> UAE Service Coverage</Typography>
              <Grid container spacing={2}>
                {profile.serviceAreas.map((area) => (
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
          <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: 4, mb: 1 }}>BIN GROUP</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 4 }}>UAE PROPERTY CARE OS | SMART MAINTENANCE | PROPERTY MANAGEMENT | TECHNICIAN DISPATCH | DEMO VIDEOS | MADE IN UAE</Typography>
          <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
            <MuiLink href={profile.termsUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>Terms of Service</MuiLink>
            <MuiLink href={profile.privacyUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>Privacy Policy</MuiLink>
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

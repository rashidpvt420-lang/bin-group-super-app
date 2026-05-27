import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  IconButton,
  Link as MuiLink,
  Paper,
  Stack,
  Typography,
  alpha,
  LinearProgress,
  Card,
  CardContent,
} from '@mui/material';
import {
  ArrowRight,
  Award,
  Briefcase,
  Building2,
  CheckCircle2,
  FileText,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PlayCircle,
  Scale,
  Shield,
  Users,
  Wrench,
  Zap,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  Rocket,
  Play,
  Pause,
  Activity,
  Server,
  RefreshCw,
  AlertCircle,
  Check,
  Tv,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type CompanyService = {
  id: number | string;
  title: string;
  desc: string;
  icon?: 'building' | 'zap' | 'briefcase' | 'users' | 'shield' | 'wrench' | 'sparkles' | 'shield-check';
};

type CompanyProfile = {
  companyName: string;
  licenseInfo: string;
  headline: string;
  mission: string;
  vision: string;
  promise: string;
  services: CompanyService[];
  workflows: string[];
  technologies: string[];
  serviceAreas: string[];
  contact: {
    whatsapp: string;
    email: string;
    phone: string;
  };
  termsUrl: string;
  privacyUrl: string;
};

const productionProfile: CompanyProfile = {
  companyName: 'BIN GROUP – UAE General Maintenance & Property Management',
  licenseInfo: 'All Kind Building Projects Contracting – L.L.C – S.P.C · UAE Sovereign Standard',
  headline: 'The UAE\'s most advanced PropTech and Facility Management operating system for high-value assets and institutional portfolios.',
  mission: 'To redefine property operations in the UAE by merging elite facility management with real-time digital transparency, ensuring every asset is preserved, every tenant is satisfied, and every owner is informed.',
  vision: 'To become the UAE\'s benchmark for autonomous property care, institutional maintenance contracts, and sovereign property management operations.',
  promise: 'Uncompromising quality, real-time accountability, and digital-first asset tracking. One property, one passport, one command center.',
  services: [
    { id: 'fm', title: 'Facility Management (FM)', desc: 'Full-spectrum facility management for residential towers, luxury villas, and commercial complexes across the UAE.', icon: 'building' },
    { id: 'pm', title: 'Property Management', desc: 'Rent collection, unit ledgers, tenant screening, legal compliance, and owner net-payout automation.', icon: 'briefcase' },
    { id: 'maintenance', title: 'General Maintenance (AMC)', desc: 'Annual Maintenance Contracts covering MEP, HVAC, Civil, and specialty works for hotels, hospitals, and schools.', icon: 'wrench' },
    { id: 'construction', title: 'Construction & Fit-out', desc: 'Structural repairs, interior fit-outs, and construction support for government and private developments.', icon: 'shield-check' },
    { id: 'ai', title: 'AI Design & Studio', desc: 'Sovereign AI for interior visualization, layout optimization, and predictive maintenance triage.', icon: 'sparkles' },
    { id: 'compliance', title: 'Audit & Compliance', desc: 'Full audit trails, property passports, and VAT-compliant financial reporting for institutional owners.', icon: 'shield' },
  ],
  workflows: [
    'AI Design Studio Demo: Visualize property upgrades and fit-outs with real-time AI generation.',
    'Property Passport Demo: Unified digital record for every unit, contract, and maintenance job.',
    'Tenant Complaint Demo: Photo-based request submission with live technician tracking.',
    'Technician Dispatch Demo: Automated assignment to on-duty specialists with proof-of-work.',
    'Broker/Referral Demo: Transparent lead management and automated commission tracking.',
    'Owner Onboarding Demo: Seamless property enrollment with instant quote generation.',
  ],
  technologies: [
    'Sovereign Data Storage: UAE-based secure cloud infrastructure with military-grade encryption.',
    'Sovereign AI Integration: Advanced LLM and Image-Gen models for property intelligence.',
    'Real-time Ops Ledger: Instant syncing between technician actions and owner dashboards.',
    'Institutional Payouts: Automated VAT handling and secure financial dispersal.',
  ],
  serviceAreas: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'Al Ain'],
  contact: {
    whatsapp: '+971 50 123 4567',
    email: 'ops@bin-groups.com',
    phone: '+971 50 123 4567',
  },
  termsUrl: '/terms',
  privacyUrl: '/privacy',
};

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

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { t, isRTL } = useLanguage();
  const [profile, setProfile] = useState<CompanyProfile>(productionProfile);
  const [loading, setLoading] = useState(true);

  // Showcase Simulator States
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(30);
  const [simulationState, setSimulationState] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'companyProfile'), (snap) => {
      if (snap.exists()) {
        setProfile({ ...productionProfile, ...snap.data() } as CompanyProfile);
      } else {
        setProfile(productionProfile);
      }
      setLoading(false);
    }, () => {
      setProfile(productionProfile);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // Simulator loop to auto-advance active slides when playing
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            setActiveSlide((current) => (current + 1) % 5);
            setSimulationState(null); // clear action logs
            return 0;
          }
          return prev + 2;
        });
      }, 150);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  const handleSimulateAction = (type: string) => {
    setSimulationState('loading');
    setTimeout(() => {
      if (type === 'admin') {
        setSimulationState('SUCCESS: telemetry checked. All 14 building sensors nominal.');
      } else if (type === 'owner') {
        setSimulationState('SUCCESS: ROI projection generated. Est. annual contract value: AED 1,260,000.');
      } else if (type === 'tenant') {
        setSimulationState('SUCCESS: SOS signal transmitted. Simulated alarm active.');
      } else if (type === 'technician') {
        setSimulationState('SUCCESS: Live tracking coordinate feed initialized.');
      } else if (type === 'broker') {
        setSimulationState('SUCCESS: RERA lead pre-validated and queued.');
      }
    }, 800);
  };

  const whatsappDigits = useMemo(() => profile.contact?.whatsapp?.replace(/[^0-9]/g, '') || '971501234567', [profile.contact?.whatsapp]);

  const demoSlides = useMemo(() => [
    {
      title: 'Admin Command Center',
      subtitle: 'Unified operational oversight, telemetry logs, and dispatch analytics.',
      type: 'admin',
      highlights: ['Active GPS Dispatch Monitor', 'Real-time Telemetry & IoT Alarm Triage', 'UAE-VAT Compliant Ledger'],
      details: 'Status: NOMINAL | Active Tickets: 14 | Online Technicians: 8',
      actionLabel: 'Verify Telemetry Nodes'
    },
    {
      title: 'Owner Asset Terminal',
      subtitle: 'High-value portfolio passporting, ROI tracking, and net payout automation.',
      type: 'owner',
      highlights: ['Property Passport Registry', 'Mobilization Amount & ACV Matrix', 'Direct Bank Payouts'],
      details: 'Status: ACTIVE | Portfolio Value: AED 8.4M | Occupancy: 94.2%',
      actionLabel: 'Project Net Yields'
    },
    {
      title: 'Tenant Service Portal',
      subtitle: '1-click photo maintenance requests, immediate emergency SOS dispatch.',
      type: 'tenant',
      highlights: ['Interactive SOS/Emergency Triage', 'Gate Pass & Amenity Booking', 'Technician GPS Tracking'],
      details: 'Status: RESIDENCY ESTABLISHED | Active Tickets: 2',
      actionLabel: 'Simulate Alarm SOS'
    },
    {
      title: 'Technician Field App',
      subtitle: 'HR-free self-service operations, live route updates, en route broadcasting.',
      type: 'technician',
      highlights: ['GPS-Throttled Location Sync', 'Direct Job Acceptance without HR', 'Immediate Evidence Submissions'],
      details: 'Status: ON-DUTY | Lat: 25.2048° N, Lng: 55.2708° E | Shift: 4.5h',
      actionLabel: 'Broadcast Geopoint'
    },
    {
      title: 'Broker Partner Portal',
      subtitle: 'RERA verification, lead registrations, and automated commission payouts.',
      type: 'broker',
      highlights: ['Direct Lead Registration', 'Automated Referral Verification', 'Real-time AED Commissions Ledger'],
      details: 'Status: REGISTERED | Referrals: 12 | Commissions Paid: AED 48,500',
      actionLabel: 'Submit Referral Model'
    }
  ], []);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      {/* Hero Section */}
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.22), transparent 36%), radial-gradient(circle at bottom left, rgba(59,130,246,0.12), transparent 32%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 10, md: 16 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Chip label="BIN GROUP SOVEREIGN" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }} />
                  <Chip label="MADE IN UAE 🇦🇪" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)', fontWeight: 950, letterSpacing: 1 }} />
                </Stack>
                <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: -2.5, fontSize: { xs: '2.6rem', md: '4.5rem' }, lineHeight: 0.95, textAlign: isRTL ? 'right' : 'left' }}>
                  {profile.companyName}
                </Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 800, maxWidth: 760, lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>
                  {profile.headline}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' }, pt: 2 }}>
                  <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>
                    Start Onboarding
                  </Button>
                  <Button variant="outlined" onClick={() => navigate('/login')} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, px: 4, py: 1.8, borderRadius: 3 }}>
                    Partner Login
                  </Button>
                </Stack>
              </Stack>
            </Grid>
            <Grid item xs={12} md={5}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: 6, backdropFilter: 'blur(18px)' }}>
                <Stack spacing={3}>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Box sx={{ p: 1.6, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 3, display: 'flex' }}><Shield size={28} /></Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950, letterSpacing: 2 }}>UAE SOVEREIGN IDENTITY</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{profile.licenseInfo}</Typography>
                    </Box>
                  </Stack>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                  <Stack spacing={2}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>INSTITUTIONAL VERTICALS:</Typography>
                    <Grid container spacing={1}>
                      {['Residential Towers', 'Luxury Hotels', 'Malls', 'Hospitals', 'Schools', 'Government'].map(tag => (
                        <Grid item key={tag}><Chip label={tag} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#FFF', fontWeight: 700 }} /></Grid>
                      ))}
                    </Grid>
                  </Stack>
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Sovereign Trust & HR-Free Operations Narrative Section */}
      <Box sx={{ py: 10, borderBottom: '1px solid rgba(255,255,255,0.06)', bgcolor: 'rgba(255,255,255,0.005)' }}>
        <Container maxWidth="lg">
          <Paper sx={{ p: { xs: 4, md: 6 }, bgcolor: 'rgba(15,23,42,0.6)', border: `1px solid ${alpha(binThemeTokens.gold, 0.25)}`, borderRadius: 6, backdropFilter: 'blur(12px)' }}>
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={8}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>SOVEREIGN OPERATIONAL TRUST</Typography>
                <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 3, letterSpacing: -1, color: '#FFF' }}>
                  Direct Operational Dispatch, Zero HR Bottlenecks
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, lineHeight: 1.8, mb: 3 }}>
                  BIN GROUP is the UAE's first sovereign property management platform built to run entirely without HR or administrative intermediaries. Facility staff and field technicians access real-time dispatch instructions, logs, and performance metrics directly. This removes delay-causing layers, guarantees immediate action, and establishes an auditable, highly trustworthy record of service.
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>Direct Technician Workfeeds</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>Instant Auto-Generated Payouts</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>Sovereign Data Shielding</Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={18} />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#FFF' }}>Zero-Trust Audit Trails</Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Grid>
              <Grid item xs={12} md={4} sx={{ textAlign: 'center' }}>
                <Box sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 4 }}>
                  <Award color={binThemeTokens.gold} size={64} style={{ margin: '0 auto 16px' }} />
                  <Typography variant="h6" fontWeight="950" color="#FFF">Sovereign Standard</Typography>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800, mt: 1, display: 'block' }}>
                    100% UAE Developed & Hosted
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>
        </Container>
      </Box>

      {/* Mission & Vision */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Rocket color={binThemeTokens.gold} size={32} />
                  <Typography variant="h4" fontWeight="950" color="#FFF">Our Mission</Typography>
                </Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, lineHeight: 1.8 }}>
                  {profile.mission}
                </Typography>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 5, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
              <Stack spacing={3}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Globe color={binThemeTokens.gold} size={32} />
                  <Typography variant="h4" fontWeight="950" color="#FFF">Our Vision</Typography>
                </Box>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, lineHeight: 1.8 }}>
                  {profile.vision}
                </Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Services Grid */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Box sx={{ mb: 8, textAlign: 'center' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>OPERATIONAL COVERAGE</Typography>
          <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>What We Offer</Typography>
        </Box>
        <Grid container spacing={3}>
          {profile.services.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.id}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, height: '100%', transition: 'all 0.3s', '&:hover': { borderColor: alpha(binThemeTokens.gold, 0.6), bgcolor: 'rgba(255,255,255,0.04)', transform: 'translateY(-5px)' } }}>
                <Box sx={{ p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, width: 'fit-content', color: binThemeTokens.gold, mb: 3 }}>
                  {serviceIcon(service.icon)}
                </Box>
                <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 1.5 }}>{service.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.54)', fontWeight: 700, lineHeight: 1.75 }}>{service.desc}</Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* Demos Section & Interactive Showcase Video Player */}
      <Box sx={{ bgcolor: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', py: 12 }}>
        <Container maxWidth="lg">
          <Grid container spacing={8} alignItems="stretch">
            {/* Left: Platform Capability Checklist */}
            <Grid item xs={12} md={5}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>PRODUCTION DEMOS</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 4, letterSpacing: -1 }}>Platform Capabilities</Typography>
              <Stack spacing={2.5}>
                {demoSlides.map((item, index) => {
                  const active = activeSlide === index;
                  return (
                    <Paper
                      key={index}
                      onClick={() => {
                        setActiveSlide(index);
                        setSimulationState(null);
                      }}
                      sx={{
                        p: 2.5,
                        bgcolor: active ? 'rgba(198,167,94,0.08)' : 'rgba(255,255,255,0.02)',
                        borderRadius: 4,
                        border: `1px solid ${active ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        '&:hover': {
                          bgcolor: active ? 'rgba(198,167,94,0.12)' : 'rgba(255,255,255,0.04)',
                        }
                      }}
                    >
                      <Stack direction="row" spacing={2} alignItems="center">
                        <Box sx={{
                          minWidth: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: active ? binThemeTokens.gold : 'rgba(255,255,255,0.08)',
                          color: active ? '#000' : '#FFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 950
                        }}>
                          {index + 1}
                        </Box>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{item.title}</Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 0.5 }}>
                            {item.subtitle}
                          </Typography>
                        </Box>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </Grid>

            {/* Right: Interactive Video Player Simulator */}
            <Grid item xs={12} md={7}>
              <Paper
                sx={{
                  p: 4,
                  borderRadius: 6,
                  bgcolor: '#0f172a',
                  border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`,
                  position: 'relative',
                  overflow: 'hidden',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <Box sx={{ position: 'absolute', top: -50, right: -50, width: 250, height: 250, bgcolor: alpha(binThemeTokens.gold, 0.08), borderRadius: '50%', filter: 'blur(50px)' }} />

                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                    <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Tv color={binThemeTokens.gold} /> SOVEREIGN SHOWCASE PLAYER
                    </Typography>
                    <Chip label="2026 SOVEREIGN OS" size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.gold, fontWeight: 900 }} />
                  </Stack>

                  {/* Mock Video Canvas Area */}
                  <Box
                    sx={{
                      position: 'relative',
                      bgcolor: '#020617',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 4,
                      p: 4,
                      mb: 3,
                      minHeight: 220,
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      backgroundImage: 'radial-gradient(circle at center, rgba(198,167,94,0.05), transparent 80%)'
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <Activity size={32} color={binThemeTokens.gold} style={{ margin: '0 auto 12px' }} />
                      <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>
                        {demoSlides[activeSlide].title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 1, px: 2 }}>
                        {demoSlides[activeSlide].subtitle}
                      </Typography>

                      <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, border: '1px solid rgba(255,255,255,0.04)' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#FFF', fontSize: '0.8rem' }}>
                          {demoSlides[activeSlide].details}
                        </Typography>
                      </Box>

                      {simulationState && (
                        <Box sx={{ mt: 2, p: 1.5, bgcolor: alpha(binThemeTokens.gold, 0.08), border: `1px solid ${binThemeTokens.gold}`, borderRadius: 2 }}>
                          {simulationState === 'loading' ? (
                            <CircularProgress size={18} sx={{ color: binThemeTokens.gold }} />
                          ) : (
                            <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>
                              {simulationState}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* Slide bullet points */}
                  <Stack spacing={1.5} sx={{ mb: 4 }}>
                    {demoSlides[activeSlide].highlights.map((highlight, idx) => (
                      <Box key={idx} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                        <CheckCircle2 color={binThemeTokens.gold} size={16} />
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 800 }}>{highlight}</Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>

                <Box>
                  {/* Play controls */}
                  <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                    <IconButton
                      onClick={() => setIsPlaying(!isPlaying)}
                      sx={{
                        bgcolor: binThemeTokens.gold,
                        color: '#000',
                        width: 44,
                        height: 44,
                        '&:hover': { bgcolor: '#b4954e' }
                      }}
                    >
                      {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                    </IconButton>
                    <Box sx={{ flex: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={progress}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'rgba(255,255,255,0.1)',
                          '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold }
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>
                      SLIDE {activeSlide + 1}/5
                    </Typography>
                  </Stack>

                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="contained"
                        onClick={() => handleSimulateAction(demoSlides[activeSlide].type)}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}
                      >
                        {demoSlides[activeSlide].actionLabel}
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        fullWidth
                        variant="outlined"
                        onClick={() => navigate('/login')}
                        sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#FFF', fontWeight: 900, py: 1.5, borderRadius: 3 }}
                      >
                        Access Portal
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Stakeholder Problem-Solving Matrix Section */}
      <Box sx={{ py: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Container maxWidth="lg">
          <Box sx={{ mb: 8, textAlign: 'center' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN VALUE MATRIX</Typography>
            <Typography variant="h2" fontWeight="950" sx={{ mt: 1, letterSpacing: -2 }}>Solving Real Pain Points</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1, maxWidth: 600, mx: 'auto' }}>
              How our sovereign property operating system resolves traditional bottlenecks for every stakeholder.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            {[
              {
                role: 'Property Owners',
                pain: 'High vacancy overheads, delayed cash payouts, manual VAT invoices, and fragmented property passports.',
                solution: 'Dynamic unit status syncing, automatic lease processing, instant AED bank transfers, and full regulatory audit trails.',
                badge: 'Owner App'
              },
              {
                role: 'Tenants & Residents',
                pain: 'Delayed emergency response, unverified service vendors, and paper gate-pass approvals.',
                solution: 'Direct photo-based maintenance filing, instant 1h emergency SOS routing, and automated building credentials.',
                badge: 'Tenant App'
              },
              {
                role: 'Field Technicians',
                pain: 'HR payroll bottlenecks, phone tag with dispatchers, and coordinate navigation errors.',
                solution: 'Sovereign duty check-in (HR-free), direct job acceptance logs, coordinate map routing, and photographic proof uploads.',
                badge: 'Technician App'
              },
              {
                role: 'Broker Partners',
                pain: 'Unverified client listings, slow payout logs, and lack of referral visibility.',
                solution: 'Direct RERA-verified listing submission, immediate commission logs, and automatic verification status notifications.',
                badge: 'Broker Portal'
              },
              {
                role: 'System Admins',
                pain: 'Unverified manual transactions, disconnected communication silos, and bulk data entry lag.',
                solution: 'Live Ops Command Center, automated IoT triage tickets, and cryptographic zero-trust audit compliance logs.',
                badge: 'Admin Panel'
              }
            ].map((box, index) => (
              <Grid item xs={12} md={6} lg={4} key={index}>
                <Card sx={{ bgcolor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, height: '100%' }}>
                  <CardContent sx={{ p: 4 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                      <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{box.role}</Typography>
                      <Chip label={box.badge} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.15), color: binThemeTokens.gold, fontWeight: 900 }} />
                    </Stack>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 900, display: 'block', mb: 0.5 }}>PAIN POINT:</Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{box.pain}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 900, display: 'block', mb: 0.5 }}>SOVEREIGN RESOLUTION:</Typography>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)', fontWeight: 800, lineHeight: 1.6 }}>{box.solution}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Container>
      </Box>

      {/* Contact & Coverage */}
      <Container maxWidth="lg" sx={{ py: 12 }}>
        <Grid container spacing={6}>
          <Grid item xs={12} md={5}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 4 }}>Contact Institutional Support</Typography>
            <Stack spacing={4}>
              {[
                { label: 'WhatsApp Ops', value: profile.contact.whatsapp, icon: <MessageSquare />, color: '#25D366' },
                { label: 'Sovereign Hotline', value: profile.contact.phone, icon: <Phone />, color: binThemeTokens.gold },
                { label: 'Email Support', value: profile.contact.email, icon: <Mail />, color: '#3b82f6' },
              ].map((item) => (
                <Stack key={item.label} direction="row" spacing={3} alignItems="center">
                  <Box sx={{ p: 2, bgcolor: alpha(item.color, 0.1), borderRadius: 3, color: item.color, display: 'flex' }}>{item.icon}</Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 950, letterSpacing: 1 }}>{item.label.toUpperCase()}</Typography>
                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>{item.value}</Typography>
                  </Box>
                </Stack>
              ))}
              <Button variant="contained" size="large" onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ mt: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 2, borderRadius: 3 }}>
                Get Quote / Request Support
              </Button>
            </Stack>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 5, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h5" fontWeight="950" sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <MapPin color={binThemeTokens.gold} /> UAE Service Coverage
              </Typography>
              <Grid container spacing={2}>
                {profile.serviceAreas.map((area) => (
                  <Grid item xs={12} sm={6} md={4} key={area}>
                    <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                      <Typography variant="subtitle2" sx={{ color: '#FFF', fontWeight: 900 }}>{area}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
              <Box sx={{ mt: 6, p: 3, bgcolor: alpha(binThemeTokens.gold, 0.05), borderRadius: 4, border: `1px dashed ${alpha(binThemeTokens.gold, 0.2)}` }}>
                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 800, textAlign: 'center' }}>
                  Coverage includes all high-value zones, free zones, and institutional asset clusters across the Emirates.
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Footer */}
      <Box sx={{ py: 10, bgcolor: '#000', borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
        <Container maxWidth="lg">
          <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: 4, mb: 1 }}>BIN GROUP</Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 800, display: 'block', mb: 4 }}>
            © 2026 BIN GROUP · UAE PROPERTY OPERATIONS OS · INSTITUTIONAL GRADE · MADE IN UAE 🇦🇪
          </Typography>
          <Stack direction="row" spacing={3} justifyContent="center" sx={{ mb: 4 }}>
            <MuiLink href={profile.termsUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>Terms of Service</MuiLink>
            <MuiLink href={profile.privacyUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 850 }}>Privacy Policy</MuiLink>
          </Stack>
          <Stack direction="row" spacing={2} justifyContent="center">
            <IconButton onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><MessageSquare /></IconButton>
            <IconButton onClick={() => window.location.href = `mailto:${profile.contact.email}`} sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold }}><Mail /></IconButton>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

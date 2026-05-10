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
  Rocket
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

  const whatsappDigits = useMemo(() => profile.contact?.whatsapp?.replace(/[^0-9]/g, '') || '971501234567', [profile.contact?.whatsapp]);

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
                <Chip label="BIN GROUP PRODUCTION" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }} />
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

      {/* Demos Section */}
      <Box sx={{ bgcolor: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', py: 12 }}>
        <Container maxWidth="lg">
          <Grid container spacing={8} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>PRODUCTION DEMOS</Typography>
              <Typography variant="h3" fontWeight="950" sx={{ mt: 1, mb: 4, letterSpacing: -1 }}>Platform Capabilities</Typography>
              <Stack spacing={3}>
                {profile.workflows.map((item, index) => (
                  <Paper key={index} sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack direction="row" spacing={2} alignItems="center">
                      <Box sx={{ minWidth: 32, height: 32, borderRadius: '50%', bgcolor: binThemeTokens.gold, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>{index + 1}</Box>
                      <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 800 }}>{item}</Typography>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 5, borderRadius: 6, bgcolor: '#0f172a', border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, position: 'relative', overflow: 'hidden' }}>
                <Box sx={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: '50%', filter: 'blur(40px)' }} />
                <Typography variant="h5" fontWeight="950" sx={{ mb: 4, color: '#FFF', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <LayoutDashboard color={binThemeTokens.gold} /> Interactive Portals
                </Typography>
                <Stack spacing={2.5}>
                  {profile.technologies.map((tech, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                      <CheckCircle2 color={binThemeTokens.gold} size={20} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>{tech}</Typography>
                    </Box>
                  ))}
                </Stack>
                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.1)' }} />
                <Stack spacing={2}>
                  <Button fullWidth variant="contained" onClick={() => navigate('/design-studio')} startIcon={<Sparkles size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.8, borderRadius: 3 }}>
                    Open AI Studio
                  </Button>
                  <Button fullWidth variant="outlined" onClick={() => navigate('/request-demo')} startIcon={<PlayCircle size={18} />} sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#FFF', fontWeight: 950, py: 1.8, borderRadius: 3 }}>
                    Request Full Demo
                  </Button>
                </Stack>
              </Paper>
            </Grid>
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
            © 2026 BIN GROUP · UAE PROPERTY OPERATIONS OS · INSTITUTIONAL GRADE
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

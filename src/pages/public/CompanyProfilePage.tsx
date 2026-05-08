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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { useLanguage } from '../../context/LanguageContext';

type CompanyService = {
  id: number | string;
  title: string;
  desc: string;
  icon?: 'building' | 'zap' | 'briefcase' | 'users' | 'shield' | 'wrench';
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

const fallbackProfile: CompanyProfile = {
  companyName: 'BIN GROUP – General Maintenance & Property Management',
  licenseInfo: 'All Kind Building Projects Contracting – L.L.C – S.P.C · UAE',
  headline: 'A UAE-first PropTech and facility-management operating system for owners, tenants, technicians, brokers, and administrators.',
  mission: 'To give property owners peace of mind by combining verified maintenance teams, transparent contracts, live job tracking, VAT-ready pricing, and digital property records in one controlled platform.',
  vision: 'To become the UAE benchmark for no-call property care, institutional maintenance contracts, and owner-first property management operations.',
  promise: 'One property. One passport. One command center. Clear pricing, visible work, accountable teams, and faster decisions.',
  services: [
    { id: 'fm', title: 'Facility Maintenance Contracts', desc: 'Annual and custom maintenance coverage for villas, apartments, towers, hotels, offices, majlis properties, schools, malls, and government assets.', icon: 'wrench' },
    { id: 'pm', title: 'Property Management', desc: 'Rent tracking, tenant coordination, unit ledgers, owner payouts, document vaults, renewal workflows, and financial visibility.', icon: 'building' },
    { id: 'construction', title: 'Construction & Fit-out Support', desc: 'Building repair, civil works, renovation coordination, fit-out quotations, pre-event readiness, and move-in/move-out inspections.', icon: 'briefcase' },
    { id: 'ai', title: 'AI Studio & Smart Triage', desc: 'AI-assisted design, maintenance triage, issue classification, photo-based evidence workflows, and property performance intelligence.', icon: 'zap' },
    { id: 'tenant', title: 'Tenant Service Portal', desc: 'Complaint submission, emergency SOS, job status visibility, technician chat, before/after proof, and approval or rejection workflow.', icon: 'users' },
    { id: 'audit', title: 'Audit & Compliance Layer', desc: 'Role-based access, audit logs, property passports, secure documents, VAT visibility, and controlled staff permissions.', icon: 'shield' },
  ],
  workflows: [
    'Owner onboarding with property details, quote generation, contract selection, and mobilization payment flow.',
    'Admin property creation with owner invite, unit generation, property passport, contract, and audit trail.',
    'Tenant complaint lifecycle from photo evidence to technician dispatch and tenant approval/rejection.',
    'Technician mission control with job details, status updates, location, materials, notes, and completion proof.',
    'Broker referral pipeline with leads, property referrals, commissions, compliance documents, and payout status.',
  ],
  technologies: [
    'Firebase Auth, Firestore, Hosting, Cloud Functions, App Check, and role-based security rules.',
    'BIN Property Passport for asset history, tenant/unit linkage, documents, contracts, and maintenance records.',
    'Smart pricing engine with UAE VAT, add-ons, SLA tiers, property type filters, and majlis-specific maintenance packages.',
    'AI Studio access for design ideas, owner experience, and future predictive maintenance workflows.',
  ],
  serviceAreas: ['Abu Dhabi', 'Al Ain', 'Dubai', 'Sharjah', 'Ajman', 'Ras Al Khaimah', 'Fujairah', 'Umm Al Quwain', 'All UAE service zones'],
  contact: {
    whatsapp: '+971 50 000 0000',
    email: 'support@bin-groups.com',
    phone: '+971 50 000 0000',
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
  return <Building2 size={30} />;
}

export default function CompanyProfilePage() {
  const navigate = useNavigate();
  const { isRTL } = useLanguage();
  const [profile, setProfile] = useState<CompanyProfile>(fallbackProfile);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'companyProfile'), (snap) => {
      if (snap.exists()) {
        setProfile({ ...fallbackProfile, ...snap.data() } as CompanyProfile);
      } else {
        setProfile(fallbackProfile);
      }
      setLoading(false);
    }, () => {
      setProfile(fallbackProfile);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const whatsappDigits = useMemo(() => profile.contact?.whatsapp?.replace(/[^0-9]/g, '') || '971500000000', [profile.contact?.whatsapp]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#020617', color: '#FFF', direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at top right, rgba(198,167,94,0.22), transparent 36%), radial-gradient(circle at bottom left, rgba(59,130,246,0.12), transparent 32%)' }} />
        <Container maxWidth="lg" sx={{ position: 'relative', py: { xs: 10, md: 16 } }}>
          <Grid container spacing={6} alignItems="center">
            <Grid item xs={12} md={7}>
              <Stack spacing={3} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                <Chip label="UAE PROPERTY CARE OS" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }} />
                <Typography variant="h1" fontWeight="950" sx={{ letterSpacing: -2.5, fontSize: { xs: '2.6rem', md: '4.9rem' }, lineHeight: 0.95, textAlign: isRTL ? 'right' : 'left' }}>
                  {profile.companyName}
                </Typography>
                <Typography variant="h5" sx={{ color: 'rgba(255,255,255,0.68)', fontWeight: 800, maxWidth: 760, lineHeight: 1.55, textAlign: isRTL ? 'right' : 'left' }}>
                  {profile.headline}
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  <Button fullWidth variant="contained" startIcon={<MessageSquare size={19} />} onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.6, borderRadius: 3 }}>
                    WhatsApp BIN Group
                  </Button>
                  <Button fullWidth variant="outlined" startIcon={<PlayCircle size={19} />} onClick={() => navigate('/request-demo')} sx={{ borderColor: 'rgba(255,255,255,0.22)', color: '#FFF', fontWeight: 950, px: 4, py: 1.6, borderRadius: 3 }}>
                    Request Demo
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
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 950, letterSpacing: 2 }}>LICENSE / IDENTITY</Typography>
                      <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 950 }}>{profile.licenseInfo}</Typography>
                    </Box>
                  </Stack>
                  <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                  {[
                    ['Live owner/tenant/technician/admin/broker portals', <Building2 size={18} key="portal" />],
                    ['Property Passport and document vault workflows', <FileText size={18} key="passport" />],
                    ['Maintenance, PM, VAT pricing, add-ons and SLA logic', <Award size={18} key="pricing" />],
                  ].map(([text, icon]) => (
                    <Stack key={String(text)} direction="row" spacing={1.5} alignItems="center">
                      <Box sx={{ color: binThemeTokens.gold, display: 'flex' }}>{icon}</Box>
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.72)', fontWeight: 800 }}>{text}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={3} sx={{ mb: 8 }}>
          {[
            { icon: <Shield color={binThemeTokens.gold} />, label: 'Mission', value: profile.mission },
            { icon: <Globe color={binThemeTokens.gold} />, label: 'Vision', value: profile.vision },
            { icon: <CheckCircle2 color={binThemeTokens.gold} />, label: 'Promise', value: profile.promise },
          ].map((item) => (
            <Grid item xs={12} md={4} key={item.label}>
              <Paper sx={{ p: 4, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5 }}>
                <Stack spacing={2} alignItems={isRTL ? 'flex-end' : 'flex-start'}>
                  {item.icon}
                  <Typography variant="h6" fontWeight="950" color="#FFF">{item.label}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', fontWeight: 700, lineHeight: 1.8, textAlign: isRTL ? 'right' : 'left' }}>{item.value}</Typography>
                </Stack>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4, display: 'block', mb: 2 }}>WHAT WE OFFER</Typography>
        <Typography variant="h3" fontWeight="950" sx={{ mb: 6, letterSpacing: -1 }}>Complete UAE Property Operations</Typography>
        <Grid container spacing={3}>
          {profile.services?.map((service) => (
            <Grid item xs={12} md={6} lg={4} key={service.id}>
              <Paper sx={{ p: 4, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, height: '100%', '&:hover': { borderColor: alpha(binThemeTokens.gold, 0.6), bgcolor: 'rgba(255,255,255,0.04)' } }}>
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

      <Box sx={{ bgcolor: 'rgba(255,255,255,0.015)', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', py: 10 }}>
        <Container maxWidth="lg">
          <Grid container spacing={5}>
            <Grid item xs={12} md={6}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>LIVE PLATFORM DEMO</Typography>
              <Typography variant="h4" fontWeight="950" sx={{ mt: 1, mb: 3 }}>How the BIN Group app works</Typography>
              <Stack spacing={2.2}>
                {profile.workflows?.map((item, index) => (
                  <Stack direction="row" spacing={2} key={item} alignItems="flex-start">
                    <Box sx={{ minWidth: 34, height: 34, borderRadius: '50%', bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.gold, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950 }}>{index + 1}</Box>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.66)', fontWeight: 750, lineHeight: 1.75 }}>{item}</Typography>
                  </Stack>
                ))}
              </Stack>
              <Button onClick={() => navigate('/services')} endIcon={<ArrowRight size={18} />} sx={{ mt: 4, color: binThemeTokens.gold, fontWeight: 950 }}>Explore services</Button>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, borderRadius: 6, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }}>
                <Typography variant="h6" fontWeight="950" sx={{ mb: 3, color: '#FFF' }}>Technology Layer</Typography>
                <Stack spacing={2}>
                  {profile.technologies?.map((item) => (
                    <Stack key={item} direction="row" spacing={1.5} alignItems="flex-start">
                      <CheckCircle2 size={18} color={binThemeTokens.gold} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', fontWeight: 750, lineHeight: 1.65 }}>{item}</Typography>
                    </Stack>
                  ))}
                </Stack>
                <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.07)' }} />
                <Button fullWidth variant="contained" onClick={() => navigate('/design-studio')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5, borderRadius: 3 }}>
                  Open AI Studio
                </Button>
              </Paper>
            </Grid>
          </Grid>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Grid container spacing={5}>
          <Grid item xs={12} md={6}>
            <Typography variant="h4" fontWeight="950" sx={{ mb: 3 }}>Contact & Support</Typography>
            <Stack spacing={3}>
              {[
                { label: 'WhatsApp', value: profile.contact?.whatsapp, icon: <MessageSquare /> },
                { label: 'Phone', value: profile.contact?.phone, icon: <Phone /> },
                { label: 'Email', value: profile.contact?.email, icon: <Mail /> },
              ].map((item) => (
                <Stack key={item.label} direction="row" spacing={2} alignItems="center">
                  <Box sx={{ p: 1.4, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, color: binThemeTokens.gold, display: 'flex' }}>{item.icon}</Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.36)', fontWeight: 950 }}>{item.label.toUpperCase()}</Typography>
                    <Typography variant="subtitle1" sx={{ color: '#FFF', fontWeight: 900 }}>{item.value}</Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ mb: 3 }}>UAE Coverage</Typography>
              <Grid container spacing={1.5}>
                {profile.serviceAreas?.map((area) => (
                  <Grid item xs={12} sm={6} key={area}>
                    <Stack direction="row" spacing={1.2} alignItems="center">
                      <MapPin size={16} color={binThemeTokens.gold} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 850 }}>{area}</Typography>
                    </Stack>
                  </Grid>
                ))}
              </Grid>
              <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.07)' }} />
              <Stack direction="row" spacing={3} flexWrap="wrap">
                <MuiLink href={profile.termsUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 850 }}><Scale size={16} /> Terms</MuiLink>
                <MuiLink href={profile.privacyUrl} sx={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 1, fontWeight: 850 }}><FileText size={16} /> Privacy</MuiLink>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Box sx={{ py: 8, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
        <Typography variant="h6" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: 4, mb: 1 }}>BIN GROUP</Typography>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.28)', fontWeight: 800 }}>© 2026 BIN GROUP · UAE PROPERTY OPERATIONS OS</Typography>
        <Stack direction="row" spacing={1.5} justifyContent="center" sx={{ mt: 3 }}>
          <IconButton onClick={() => window.open(`https://wa.me/${whatsappDigits}`, '_blank')} sx={{ color: binThemeTokens.gold }}><MessageSquare /></IconButton>
          <IconButton onClick={() => window.location.href = `mailto:${profile.contact?.email}`} sx={{ color: binThemeTokens.gold }}><Mail /></IconButton>
        </Stack>
      </Box>
    </Box>
  );
}

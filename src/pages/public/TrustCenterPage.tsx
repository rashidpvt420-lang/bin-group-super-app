import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { CheckCircle2, Home, Mail, MessageSquare, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrandWatermark from '../../components/BrandWatermark';
import { UAE_TRUST_CENTER_POLICIES, UAE_TRUST_FEATURES } from '../../lib/uaeTrustDominanceBlueprint';

const gold = binThemeTokens.gold;
const line = '#E8E3D7';
const CONTACT = { whatsapp: '+971 55 2423233', email: 'ceo@bin-groups.com' };

export default function TrustCenterPage() {
  const navigate = useNavigate();
  const wa = CONTACT.whatsapp.replace(/[^0-9]/g, '');
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: '#111827', position: 'relative' }}>
      <BrandWatermark opacity={0.055} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: '#111827', color: '#fff', borderBottom: `1px solid ${alpha(gold, 0.25)}` }}>
          <Container maxWidth="lg" sx={{ py: 1.4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
              <Stack direction="row" spacing={1.2} alignItems="center"><ShieldCheck color={gold} size={20} /><Typography fontWeight={950}>BIN GROUP Trust Center</Typography></Stack>
              <Stack direction="row" spacing={1}><Button startIcon={<Home size={16} />} onClick={() => navigate('/')} sx={{ color: gold, fontWeight: 900 }}>Home</Button><Button onClick={() => navigate('/company')} sx={{ color: gold, fontWeight: 900 }}>Company</Button></Stack>
            </Stack>
          </Container>
        </Box>
        <Box sx={{ py: { xs: 8, md: 12 }, textAlign: 'center', background: 'linear-gradient(160deg,#0B0B0C 0%,#1a1a2e 55%,#111827 100%)' }}>
          <Container maxWidth="lg">
            <Stack spacing={3} alignItems="center">
              <Chip label="PUBLIC TRUST CENTER" sx={{ bgcolor: alpha(gold, .13), color: gold, border: `1px solid ${alpha(gold, .32)}`, fontWeight: 950, letterSpacing: 2 }} />
              <Typography variant="h2" fontWeight={950} sx={{ color: gold }}>Proof before promises.</Typography>
              <Typography variant="h5" sx={{ color: 'rgba(255,255,255,.82)', maxWidth: 900, lineHeight: 1.75, fontWeight: 750 }}>BIN GROUP is built for UAE owners, tenants, technicians, brokers, vendors, and staff who need maintenance decisions backed by approvals, photos, timelines, ledgers, invoices, and reports.</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>Apply for selected pilot</Button><Button variant="outlined" startIcon={<MessageSquare size={18} />} onClick={() => window.open(`https://wa.me/${wa}`, '_blank')} sx={{ color: gold, borderColor: alpha(gold, .42), fontWeight: 950 }}>WhatsApp BIN GROUP</Button></Stack>
            </Stack>
          </Container>
        </Box>
        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Typography variant="h3" fontWeight={950} textAlign="center" sx={{ mb: 5 }}>Trust features for UAE property operations</Typography>
          <Grid container spacing={3}>{UAE_TRUST_FEATURES.map((item) => <Grid item xs={12} md={6} key={item.title}><Paper sx={{ p: 3, height: '100%', borderRadius: 4, border: `1px solid ${line}`, boxShadow: '0 16px 40px rgba(17,24,39,.06)' }}><Typography fontWeight={950} sx={{ color: '#6F5522', mb: 1 }}>{item.title}</Typography><Typography variant="body2" sx={{ color: '#667085', mb: 1 }}><b>Problem:</b> {item.problem}</Typography><Typography variant="body2" sx={{ color: '#374151', mb: 1 }}><b>Solution:</b> {item.solution}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 800 }}>Metric: {item.launchMetric}</Typography></Paper></Grid>)}</Grid>
        </Container>
        <Box sx={{ bgcolor: '#111827', py: 8 }}>
          <Container maxWidth="lg"><Typography variant="h3" fontWeight={950} textAlign="center" sx={{ color: '#fff', mb: 5 }}>Public rules of trust</Typography><Grid container spacing={2}>{UAE_TRUST_CENTER_POLICIES.map((policy) => <Grid item xs={12} md={6} key={policy}><Stack direction="row" spacing={1.4} alignItems="flex-start" sx={{ p: 2.5, borderRadius: 3, border: `1px solid ${alpha(gold, .18)}`, bgcolor: 'rgba(255,255,255,.045)' }}><CheckCircle2 color={gold} size={20} /><Typography fontWeight={850} sx={{ color: 'rgba(255,255,255,.78)', lineHeight: 1.55 }}>{policy}</Typography></Stack></Grid>)}</Grid></Container>
        </Box>
        <Box sx={{ py: 8, textAlign: 'center', bgcolor: '#F8F9FB', borderTop: `1px solid ${line}` }}><Container maxWidth="md"><Typography variant="h4" fontWeight={950} sx={{ mb: 1 }}>Selected UAE properties can start as controlled pilot.</Typography><Typography sx={{ color: '#667085', mb: 3 }}>Full public launch requires production proof gates. Controlled pilot builds the evidence owners need to trust the platform.</Typography><Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center"><Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: '#111827', fontWeight: 950 }}>Start onboarding</Button><Button variant="outlined" startIcon={<Mail size={18} />} onClick={() => window.open(`mailto:${CONTACT.email}`, '_blank')} sx={{ color: '#6F5522', borderColor: alpha(gold, .45), fontWeight: 950 }}>Email CEO</Button></Stack></Container></Box>
      </Box>
    </Box>
  );
}

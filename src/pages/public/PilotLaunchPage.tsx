import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, BadgeCheck, Building2, CheckCircle2, ClipboardCheck, FileCheck2, MessageSquare, PlayCircle, ShieldAlert, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const cards = [
  { title: 'Owner pilot', body: 'Check portfolio, property passport, payments, documents, approvals, and handover reviews.', path: '/login?intendedRole=owner', icon: Building2 },
  { title: 'Tenant pilot', body: 'Submit issue, emergency request, payment check, documents, and move-in/move-out report.', path: '/login?intendedRole=tenant', icon: UserRound },
  { title: 'Technician pilot', body: 'Review jobs, live map, proof readiness, offline queue, support, and job lifecycle.', path: '/login?intendedRole=technician', icon: Wrench },
  { title: 'Broker pilot', body: 'Check leads, referrals, attribution proof, documents, and commissions dashboard.', path: '/login?intendedRole=broker', icon: ClipboardCheck },
  { title: 'Invoice verify', body: 'Open the public invoice verification page.', path: '/verify', icon: FileCheck2 },
  { title: 'Certificate verify', body: 'Open the public certificate verification page.', path: '/verify-cert', icon: BadgeCheck },
  { title: 'Feedback', body: 'Send pilot feedback after testing a workflow.', path: '/pilot-feedback', icon: MessageSquare },
  { title: 'Demo videos', body: 'Watch the public walkthrough and launch demo videos.', path: '/videos', icon: PlayCircle },
];

const profileTests = [
  {
    role: 'Owner',
    route: '/login?intendedRole=owner',
    mission: 'Open dashboard, check property passport, documents, financials, approvals, handover, and submit one feedback note.',
    pass: 'Owner can understand property status, money status, proof status, and next required action without calling anyone.',
  },
  {
    role: 'Tenant',
    route: '/login?intendedRole=tenant',
    mission: 'Open dashboard, report one issue with photo, check tickets, payments, documents, emergency, and move-in/out report.',
    pass: 'Tenant can submit a real workflow and see where the request goes next.',
  },
  {
    role: 'Technician',
    route: '/login?intendedRole=technician',
    mission: 'Open jobs, accept or review a mission, check map, proof readiness, offline queue, support, and job history.',
    pass: 'Technician can understand assigned job, field status, required proof, and offline behavior.',
  },
  {
    role: 'Broker',
    route: '/login?intendedRole=broker',
    mission: 'Open leads, referrals, attribution, documents, and commissions; confirm the broker can explain who brought the deal.',
    pass: 'Broker can see lead/referral/attribution/commission logic clearly enough to test a new opportunity.',
  },
];

const blockers = [
  'Workflow run for latest commits must be green after deploy.',
  'Stripe live keys must be configured before real payment collection.',
  'Firebase App Check production key must be active before broad sharing.',
  'Branded email sender must be configured before real customer notifications.',
  'Broker lead attribution, contract source, and commission trail still need verification.',
  'Full live smoke test must pass across Owner, Tenant, Technician, Broker, and internal Operations.',
];

const footerLinks = [
  { label: 'Company', path: '/company-profile' },
  { label: 'Support', path: '/support' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Feedback', path: '/pilot-feedback' },
];

export default function PilotLaunchPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#FFFFFF', color: '#111827', py: { xs: 5, md: 8 } }}>
      <Container maxWidth="lg">
        <Stack spacing={4}>
          <Paper sx={{ p: { xs: 3, md: 5 }, borderRadius: 6, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, background: `linear-gradient(135deg, ${alpha(binThemeTokens.gold, 0.10)}, #FFFFFF)` }}>
            <Stack spacing={2}>
              <Chip icon={<ShieldCheck size={16} />} label="CONTROLLED FRIENDS PILOT" sx={{ alignSelf: 'flex-start', bgcolor: alpha(binThemeTokens.gold, 0.14), color: binThemeTokens.goldHover, fontWeight: 950 }} />
              <Typography variant="h2" sx={{ fontWeight: 950, color: '#111827', letterSpacing: -1 }}>
                BIN GROUP Super App Pilot Launcher
              </Typography>
              <Typography sx={{ color: '#667085', maxWidth: 800, fontWeight: 700, lineHeight: 1.8 }}>
                Share this page with trusted friends and team members only. Each tester should open one profile, complete one mission, and submit feedback with screenshots if anything fails.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip label="Owner" />
                <Chip label="Tenant" />
                <Chip label="Technician" />
                <Chip label="Broker" />
                <Chip label="Public verification" />
                <Chip label="Feedback" />
              </Stack>
            </Stack>
          </Paper>

          <Grid container spacing={2.5}>
            {cards.map((card) => (
              <Grid item xs={12} sm={6} md={3} key={card.title}>
                <Paper sx={{ height: '100%', p: 3, borderRadius: 5, border: '1px solid #E5E7EB', boxShadow: '0 18px 42px rgba(17,24,39,0.06)' }}>
                  <Stack spacing={2} sx={{ height: '100%' }}>
                    <Box sx={{ width: 46, height: 46, borderRadius: 3, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.goldHover }}>
                      <SafeIcon icon={card.icon} size={22} />
                    </Box>
                    <Typography variant="h6" sx={{ color: '#111827', fontWeight: 950 }}>{card.title}</Typography>
                    <Typography variant="body2" sx={{ color: '#667085', fontWeight: 650, lineHeight: 1.65, flexGrow: 1 }}>{card.body}</Typography>
                    <Button fullWidth variant="contained" endIcon={<ArrowRight size={16} />} onClick={() => navigate(card.path)} sx={{ bgcolor: binThemeTokens.gold, color: '#111827', fontWeight: 950, borderRadius: 3 }}>
                      Open
                    </Button>
                  </Stack>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 5, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
            <Typography variant="h5" sx={{ fontWeight: 950, color: '#111827', mb: 2 }}>Profile test missions</Typography>
            <Grid container spacing={2}>
              {profileTests.map((test) => (
                <Grid item xs={12} md={6} key={test.role}>
                  <Paper sx={{ p: 2.5, borderRadius: 4, border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, bgcolor: alpha(binThemeTokens.gold, 0.035), height: '100%' }}>
                    <Stack spacing={1.5}>
                      <Typography sx={{ fontWeight: 950, color: '#111827' }}>{test.role}</Typography>
                      <Typography variant="body2" sx={{ color: '#667085', lineHeight: 1.65 }}>{test.mission}</Typography>
                      <Stack direction="row" spacing={1} alignItems="flex-start">
                        <CheckCircle2 size={17} color="#10b981" style={{ marginTop: 2 }} />
                        <Typography variant="caption" sx={{ color: '#475467', fontWeight: 800, lineHeight: 1.55 }}>{test.pass}</Typography>
                      </Stack>
                      <Button size="small" onClick={() => navigate(test.route)} sx={{ alignSelf: 'flex-start', color: binThemeTokens.goldHover, fontWeight: 950 }}>Open {test.role}</Button>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>

          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 5, border: `1px solid ${alpha('#f59e0b', 0.24)}`, bgcolor: alpha('#f59e0b', 0.06) }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
              <ShieldAlert size={22} color="#f59e0b" />
              <Typography variant="h5" sx={{ fontWeight: 950, color: '#111827' }}>Still blocked before full public launch</Typography>
            </Stack>
            <Grid container spacing={1.5}>
              {blockers.map((blocker) => (
                <Grid item xs={12} md={6} key={blocker}>
                  <Typography variant="body2" sx={{ color: '#667085', fontWeight: 750, lineHeight: 1.65 }}>• {blocker}</Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 5, border: '1px solid #E5E7EB', bgcolor: '#F8F9FB' }}>
            <Typography sx={{ fontWeight: 950, color: '#111827', mb: 1 }}>Pilot rule</Typography>
            <Typography sx={{ color: '#667085', lineHeight: 1.8 }}>
              Share this only with trusted testers. This is for controlled workflow validation, not full public commercial launch. Do not collect live payments or promise full commercial onboarding until Stripe live keys, App Check production key, branded email, and full smoke testing are confirmed green.
            </Typography>
          </Paper>

          <Paper sx={{ p: 3, borderRadius: 5, border: '1px solid #E5E7EB', bgcolor: '#FFFFFF' }}>
            <Stack spacing={2} alignItems="center" textAlign="center">
              <Typography sx={{ color: '#111827', fontWeight: 950 }}>Legal, support, and tester feedback</Typography>
              <Typography variant="body2" sx={{ color: '#667085', maxWidth: 760, lineHeight: 1.7 }}>
                Testers should use Support or Feedback for any issue. Privacy and Terms links stay visible on the pilot page so the launcher does not remove normal public safeguards.
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                {footerLinks.map((link) => (
                  <Button key={link.path} variant="text" onClick={() => navigate(link.path)} sx={{ color: binThemeTokens.goldHover, fontWeight: 950, textTransform: 'none' }}>
                    {link.label}
                  </Button>
                ))}
              </Stack>
              <Typography variant="caption" sx={{ color: '#98A2B3', fontWeight: 800, letterSpacing: 1.2 }}>
                © 2026 BIN GROUP · Controlled pilot launcher · Made in UAE
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

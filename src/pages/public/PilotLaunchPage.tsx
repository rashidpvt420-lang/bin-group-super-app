import React from 'react';
import { Box, Button, Chip, Container, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, BadgeCheck, Building2, ClipboardCheck, FileCheck2, MessageSquare, PlayCircle, ShieldCheck, UserRound, Wrench } from 'lucide-react';
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
              <Typography sx={{ color: '#667085', maxWidth: 760, fontWeight: 700, lineHeight: 1.8 }}>
                Use this page to share the live pilot with trusted friends and team members. Ask each tester to open one profile, complete one workflow, and submit feedback with screenshots if anything fails.
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

          <Paper sx={{ p: 3, borderRadius: 5, border: '1px solid #E5E7EB', bgcolor: '#F8F9FB' }}>
            <Typography sx={{ fontWeight: 950, color: '#111827', mb: 1 }}>Pilot rule</Typography>
            <Typography sx={{ color: '#667085', lineHeight: 1.8 }}>
              Share this only with trusted testers. This is for controlled workflow validation, not full public commercial launch. Do not collect live payments or promise full commercial onboarding until Stripe live keys, App Check production key, branded email, and full smoke testing are confirmed green.
            </Typography>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}

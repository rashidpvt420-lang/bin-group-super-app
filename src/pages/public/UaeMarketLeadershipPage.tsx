import React from 'react';
import { Box, Button, Chip, Container, Divider, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { ArrowRight, Building2, CheckCircle2, ClipboardCheck, FileText, ShieldCheck, Users2, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BrandWatermark from '../../components/BrandWatermark';
import { binThemeTokens } from '../../theme/binGroupTheme';
import {
  UAE_HR_WORKFORCE_MASTER_CAPABILITIES,
  UAE_MARKET_LEADERSHIP_DATA_MODEL,
  UAE_MARKET_LEADERSHIP_POSITIONING,
  UAE_MARKET_REALITY_MAP,
  UAE_MVP_BUILD_ORDER,
  UAE_OWNER_TRUST_MASTER_CAPABILITIES,
  UAE_PROPERTY_TRUST_OS_LOOP,
  UAE_RELEASE_GATES,
  getMustHaveMarketLeadershipCapabilities,
} from '../../lib/uaeMarketLeadershipMasterSpec';

const gold = binThemeTokens.gold;
const dark = '#111827';
const line = '#E8E3D7';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Chip
      label={children}
      sx={{
        bgcolor: alpha(gold, 0.12),
        border: `1px solid ${alpha(gold, 0.35)}`,
        color: '#6F5522',
        fontWeight: 950,
        letterSpacing: 1.7,
      }}
    />
  );
}

function CapabilityCard({ title, promise, implementation, antiMistakeRule }: { title: string; promise: string; implementation: string; antiMistakeRule: string }) {
  return (
    <Paper sx={{ p: 3, height: '100%', borderRadius: 4, border: `1px solid ${line}`, boxShadow: '0 16px 40px rgba(17,24,39,.06)' }}>
      <Typography fontWeight={950} sx={{ color: '#6F5522', mb: 1.2 }}>{title}</Typography>
      <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.65, mb: 1 }}><b>Promise:</b> {promise}</Typography>
      <Typography variant="body2" sx={{ color: '#667085', lineHeight: 1.65, mb: 1 }}><b>Build:</b> {implementation}</Typography>
      <Typography variant="caption" sx={{ color: '#92400E', fontWeight: 850, lineHeight: 1.55, display: 'block' }}>Guardrail: {antiMistakeRule}</Typography>
    </Paper>
  );
}

export default function UaeMarketLeadershipPage() {
  const navigate = useNavigate();
  const mustHaveCount = getMustHaveMarketLeadershipCapabilities().length;
  const ownerMustHaves = UAE_OWNER_TRUST_MASTER_CAPABILITIES.filter((item) => item.priority === 'must-have');
  const hrMustHaves = UAE_HR_WORKFORCE_MASTER_CAPABILITIES.filter((item) => item.priority === 'must-have');
  const hardenedCollections = UAE_MARKET_LEADERSHIP_DATA_MODEL.filter((entry) => entry.hardenedRuleRequired).length;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fff', color: dark, position: 'relative' }}>
      <BrandWatermark opacity={0.05} />
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: dark, color: '#fff', borderBottom: `1px solid ${alpha(gold, 0.28)}` }}>
          <Container maxWidth="lg" sx={{ py: 1.4 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1.5}>
              <Stack direction="row" spacing={1.2} alignItems="center">
                <ShieldCheck color={gold} size={20} />
                <Typography fontWeight={950}>BIN GROUP UAE Market Leadership OS</Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button onClick={() => navigate('/trust')} sx={{ color: gold, fontWeight: 900 }}>Trust Center</Button>
                <Button onClick={() => navigate('/onboarding')} sx={{ color: gold, fontWeight: 900 }}>Start Pilot</Button>
              </Stack>
            </Stack>
          </Container>
        </Box>

        <Box sx={{ py: { xs: 8, md: 12 }, background: 'linear-gradient(160deg,#0B0B0C 0%,#171827 58%,#111827 100%)', color: '#fff' }}>
          <Container maxWidth="lg">
            <Grid container spacing={5} alignItems="center">
              <Grid item xs={12} md={7}>
                <Stack spacing={3}>
                  <SectionLabel>MASTER PRODUCT SPEC</SectionLabel>
                  <Typography variant="h2" fontWeight={950} sx={{ color: gold, lineHeight: 1.05 }}>
                    {UAE_MARKET_LEADERSHIP_POSITIONING.winningMessage}
                  </Typography>
                  <Typography variant="h5" sx={{ color: 'rgba(255,255,255,.82)', lineHeight: 1.65, fontWeight: 750 }}>
                    {UAE_MARKET_LEADERSHIP_POSITIONING.ownerPromise}
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.75 }}>
                    {UAE_MARKET_LEADERSHIP_POSITIONING.category}. {UAE_MARKET_LEADERSHIP_POSITIONING.beachhead}
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                    <Button variant="contained" endIcon={<ArrowRight size={18} />} onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: dark, fontWeight: 950 }}>
                      Start owner pilot
                    </Button>
                    <Button variant="outlined" onClick={() => navigate('/trust-center')} sx={{ color: gold, borderColor: alpha(gold, 0.45), fontWeight: 950 }}>
                      View trust proof
                    </Button>
                  </Stack>
                </Stack>
              </Grid>
              <Grid item xs={12} md={5}>
                <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(255,255,255,.06)', border: `1px solid ${alpha(gold, .24)}`, color: '#fff' }}>
                  <Stack spacing={2}>
                    {[
                      ['Must-have capabilities', mustHaveCount, <ClipboardCheck size={22} color={gold} />],
                      ['Owner trust modules', UAE_OWNER_TRUST_MASTER_CAPABILITIES.length, <Building2 size={22} color={gold} />],
                      ['HR workforce modules', UAE_HR_WORKFORCE_MASTER_CAPABILITIES.length, <Users2 size={22} color={gold} />],
                      ['Hardened collections', hardenedCollections, <ShieldCheck size={22} color={gold} />],
                    ].map(([label, value, icon]) => (
                      <Stack key={String(label)} direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,.06)' }}>
                        <Stack direction="row" spacing={1.2} alignItems="center">{icon}<Typography fontWeight={850}>{label}</Typography></Stack>
                        <Typography variant="h5" fontWeight={950} sx={{ color: gold }}>{value}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Paper>
              </Grid>
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', borderRadius: 4, border: `1px solid ${line}` }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><Building2 color={gold} /><Typography variant="h4" fontWeight={950}>Market reality</Typography></Stack>
                <Typography sx={{ color: '#667085', lineHeight: 1.75, mb: 2 }}>{UAE_MARKET_REALITY_MAP.strategicGap}</Typography>
                <Divider sx={{ my: 2 }} />
                <Typography fontWeight={950} sx={{ mb: 1 }}>Regulator-aligned systems to respect</Typography>
                <Stack spacing={1}>{UAE_MARKET_REALITY_MAP.regulatorSystems.map((item) => <Typography key={item} variant="body2" sx={{ color: '#374151' }}>• {item}</Typography>)}</Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: '#F8F9FB', border: `1px solid ${line}` }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><FileText color={gold} /><Typography variant="h4" fontWeight={950}>Safe commercial claim</Typography></Stack>
                <Typography sx={{ color: '#374151', lineHeight: 1.75, mb: 2 }}>{UAE_MARKET_LEADERSHIP_POSITIONING.safeClaim}</Typography>
                <Typography sx={{ color: '#374151', lineHeight: 1.75 }}>{UAE_MARKET_LEADERSHIP_POSITIONING.taxPositioning}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        <Box sx={{ bgcolor: '#F8F9FB', py: 8, borderTop: `1px solid ${line}`, borderBottom: `1px solid ${line}` }}>
          <Container maxWidth="lg">
            <Stack alignItems="center" spacing={2} sx={{ mb: 5, textAlign: 'center' }}>
              <SectionLabel>OWNER TRUST OPERATING LOOP</SectionLabel>
              <Typography variant="h3" fontWeight={950}>From messy maintenance to owner-grade proof</Typography>
            </Stack>
            <Grid container spacing={2}>
              {UAE_PROPERTY_TRUST_OS_LOOP.map((step, index) => (
                <Grid item xs={12} md={4} key={step}>
                  <Paper sx={{ p: 2.4, height: '100%', borderRadius: 3, border: `1px solid ${line}` }}>
                    <Stack direction="row" spacing={1.4} alignItems="flex-start">
                      <Box sx={{ width: 30, height: 30, borderRadius: '50%', bgcolor: alpha(gold, .14), color: '#6F5522', display: 'grid', placeItems: 'center', flexShrink: 0, fontWeight: 950 }}>{index + 1}</Box>
                      <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.6, fontWeight: 800 }}>{step}</Typography>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Stack alignItems="center" spacing={2} sx={{ mb: 5, textAlign: 'center' }}>
            <SectionLabel>WHAT MUST BE BUILT</SectionLabel>
            <Typography variant="h3" fontWeight={950}>Owner platform and HR workforce OS</Typography>
          </Stack>
          <Grid container spacing={3}>
            {ownerMustHaves.slice(0, 6).map((item) => (
              <Grid item xs={12} md={6} key={item.id}>
                <CapabilityCard title={item.title} promise={item.promise} implementation={item.implementation} antiMistakeRule={item.antiMistakeRule} />
              </Grid>
            ))}
          </Grid>
          <Divider sx={{ my: 5 }} />
          <Grid container spacing={3}>
            {hrMustHaves.slice(0, 6).map((item) => (
              <Grid item xs={12} md={6} key={item.id}>
                <CapabilityCard title={item.title} promise={item.promise} implementation={item.implementation} antiMistakeRule={item.antiMistakeRule} />
              </Grid>
            ))}
          </Grid>
        </Container>

        <Box sx={{ bgcolor: dark, color: '#fff', py: 8 }}>
          <Container maxWidth="lg">
            <Grid container spacing={4}>
              <Grid item xs={12} md={5}>
                <SectionLabel>BUILD ORDER</SectionLabel>
                <Typography variant="h3" fontWeight={950} sx={{ color: gold, mt: 2, mb: 2 }}>No fake green status.</Typography>
                <Typography sx={{ color: 'rgba(255,255,255,.72)', lineHeight: 1.75 }}>
                  The app should ship in controlled gates: positioning, intake, ledger, approvals, offline technician proof, owner reporting, HR compliance, then hardened rules and smoke tests.
                </Typography>
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack spacing={1.2}>
                  {UAE_MVP_BUILD_ORDER.map((item, index) => (
                    <Stack key={item} direction="row" spacing={1.3} alignItems="flex-start" sx={{ p: 1.6, borderRadius: 3, bgcolor: 'rgba(255,255,255,.055)' }}>
                      <CheckCircle2 color={gold} size={18} style={{ marginTop: 3, flexShrink: 0 }} />
                      <Typography variant="body2" sx={{ color: 'rgba(255,255,255,.82)', fontWeight: 800, lineHeight: 1.55 }}>{index + 1}. {item}</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Grid>
            </Grid>
          </Container>
        </Box>

        <Container maxWidth="lg" sx={{ py: 8 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', borderRadius: 4, border: `1px solid ${line}` }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><WalletCards color={gold} /><Typography variant="h4" fontWeight={950}>Data model to harden</Typography></Stack>
                <Stack spacing={1.1}>{UAE_MARKET_LEADERSHIP_DATA_MODEL.slice(0, 8).map((entry) => <Typography key={entry.collection} variant="body2" sx={{ color: '#374151', lineHeight: 1.55 }}><b>{entry.collection}</b> — {entry.purpose}</Typography>)}</Stack>
              </Paper>
            </Grid>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: 4, height: '100%', borderRadius: 4, bgcolor: '#F8F9FB', border: `1px solid ${line}` }}>
                <Stack direction="row" spacing={1.2} alignItems="center" sx={{ mb: 2 }}><ShieldCheck color={gold} /><Typography variant="h4" fontWeight={950}>Release gates</Typography></Stack>
                <Stack spacing={1.1}>{UAE_RELEASE_GATES.slice(0, 6).map((gate) => <Typography key={gate.id} variant="body2" sx={{ color: '#374151', lineHeight: 1.55 }}><b>{gate.title}</b><br />{gate.proofCommandOrEvidence}</Typography>)}</Stack>
              </Paper>
            </Grid>
          </Grid>
        </Container>

        <Box sx={{ py: 8, textAlign: 'center', bgcolor: '#F8F9FB', borderTop: `1px solid ${line}` }}>
          <Container maxWidth="md">
            <Typography variant="h4" fontWeight={950} sx={{ mb: 1 }}>Launch as infrastructure, not another app.</Typography>
            <Typography sx={{ color: '#667085', mb: 3, lineHeight: 1.75 }}>
              This page is now the app-facing master spec: UAE owner trust, quote governance, maintenance ledger, field HR compliance, privacy guardrails, and launch gates.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
              <Button variant="contained" onClick={() => navigate('/onboarding')} sx={{ bgcolor: gold, color: dark, fontWeight: 950 }}>Start controlled pilot</Button>
              <Button variant="outlined" onClick={() => navigate('/security')} sx={{ color: '#6F5522', borderColor: alpha(gold, .45), fontWeight: 950 }}>Review security</Button>
            </Stack>
          </Container>
        </Box>
      </Box>
    </Box>
  );
}

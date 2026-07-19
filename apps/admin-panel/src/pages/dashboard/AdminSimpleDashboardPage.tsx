import React from 'react';
import { Box, Button, Chip, Grid, LinearProgress, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BarChart3, CheckCircle2, CreditCard, Gauge, Map, ShieldCheck, TicketCheck, Users, Wrench } from 'lucide-react';

const gold = '#DAA520';
const slaPolicy = [
  { key: 'EMERGENCY', label: 'Emergency', minutes: 30, route: '/sos', copy: 'Critical resident or property issue needing immediate dispatch.' },
  { key: 'HIGH', label: 'High', minutes: 120, route: '/tickets', copy: 'Urgent comfort, water, electrical, security, or owner-risk issue.' },
  { key: 'MEDIUM', label: 'Medium', minutes: 240, route: '/tickets', copy: 'Normal repair requiring same-day operational attention.' },
  { key: 'STANDARD', label: 'Standard', minutes: 480, route: '/tickets', copy: 'Routine maintenance with clear technician scheduling.' },
  { key: 'LOW', label: 'Low', minutes: 1440, route: '/tickets', copy: 'Low urgency service or admin follow-up item.' },
];

const adminActions = [
  { id: 'sla', label: 'SLA Command', route: '/tickets', icon: <Gauge size={22} />, desc: 'Open tickets, timers, breach risk, and dispatch pressure.' },
  { id: 'payments', label: 'Payment Approvals', route: '/payments', icon: <CreditCard size={22} />, desc: 'Verify deposits and owner activation payment proof.' },
  { id: 'dispatch', label: 'Live Dispatch', route: '/technicians/map', icon: <Map size={22} />, desc: 'Technician coverage, location, and assignment visibility.' },
  { id: 'launch', label: 'Launch Control', route: '/ops/public-launch-command', icon: <ShieldCheck size={22} />, desc: 'Public launch gates, proof checks, and go or no-go signals.' },
  { id: 'owners', label: 'Owner Activation', route: '/owners', icon: <Users size={22} />, desc: 'Owner approvals, property onboarding, documents, and trust gates.' },
  { id: 'tenants', label: 'Tenant Control', route: '/tenants', icon: <Users size={22} />, desc: 'Tenant profiles, unit links, service state, and communication.' },
  { id: 'technicians', label: 'Technician Corps', route: '/technicians', icon: <Wrench size={22} />, desc: 'Technician profile, readiness, duty, and performance control.' },
  { id: 'hr', label: 'HR Command', route: '/hr', icon: <Users size={22} />, desc: 'Staff registry, HR access, attendance, leave, and payroll handoff.' },
  { id: 'contracts', label: 'Contract Control', route: '/contracts', icon: <TicketCheck size={22} />, desc: 'Owner, tenant, broker, and platform contract operations.' },
  { id: 'documents', label: 'Document Vault', route: '/document-vault', icon: <ShieldCheck size={22} />, desc: 'Institutional files, proof documents, and evidence packages.' },
  { id: 'broker', label: 'Broker Attribution', route: '/broker-attributions', icon: <TicketCheck size={22} />, desc: 'Broker source proof before contract activation.' },
  { id: 'audit', label: 'Audit Log', route: '/audit', icon: <AlertTriangle size={22} />, desc: 'Systemic audit trail and admin evidence review.' },
  { id: 'units', label: 'Unit Status', route: '/admin/units', icon: <BarChart3 size={22} />, desc: 'Occupied, vacant, rentable, blocked, and service-linked units.' },
  { id: 'room-rent', label: 'Find Room Rent Ops', route: '/ops/marketplace-approvals', icon: <Users size={22} />, desc: 'BIN-managed vacant room listings and renter contact handling.' },
  { id: 'messages', label: 'Operations Messages', route: '/ops/messages', icon: <TicketCheck size={22} />, desc: 'Tenant, owner, staff, and operational message center.' },
  { id: 'control', label: 'Sovereign Control', route: '/control-center', icon: <BarChart3 size={22} />, desc: 'Full production control center instead of a missing dashboard route.' },
];

const pilotMetrics = [
  { label: 'Calls avoided', target: '60% fewer follow-up calls' },
  { label: 'Ticket speed', target: '80% submitted under 90 seconds' },
  { label: 'Proof completeness', target: '95% jobs with full evidence' },
  { label: 'Owner approval speed', target: 'Under 12 hours' },
  { label: 'Tenant satisfaction', target: '4.5/5 or higher' },
  { label: 'Broker tracing', target: '100% attributed deals' },
];

export default function AdminSimpleDashboardPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, color: '#fff' }}>
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3 }}>ADMIN COMMAND CENTER</Typography>
            <Typography variant="h3" sx={{ fontWeight: 950, mt: 1 }}>Everything that needs control today</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, maxWidth: 900 }}>
              Start from real registered routes only: SLA, payments, owners, tenants, technicians, HR, contracts, documents, launch gates, unit status, room rent operations, messages, and audit.
            </Typography>
          </Box>
          <Chip icon={<ShieldCheck size={16} />} label="Route-safe command mode" sx={{ bgcolor: alpha(gold, 0.14), color: gold, fontWeight: 950 }} />
        </Stack>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: alpha(gold, 0.055), border: `1px solid ${alpha(gold, 0.18)}`, borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>MAIN ADMIN ACTIONS</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.5 }}>These cards now point to registered Admin routes. No dead `/disputes` or `/dashboard/full` shortcuts.</Typography>
            </Box>
            <Grid container spacing={2}>
              {adminActions.map((action) => (
                <Grid item xs={12} sm={6} md={3} key={action.id}>
                  <Button fullWidth onClick={() => navigate(action.route)} sx={{ minHeight: 142, p: 2, alignItems: 'flex-start', justifyContent: 'flex-start', textAlign: 'left', color: '#fff', bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, '&:hover': { bgcolor: alpha(gold, 0.12), borderColor: alpha(gold, 0.4) } }}>
                    <Stack spacing={1} alignItems="flex-start">
                      <Box sx={{ color: gold }}>{action.icon}</Box>
                      <Typography sx={{ fontWeight: 950 }}>{action.label}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.45 }}>{action.desc}</Typography>
                    </Stack>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>CANONICAL SLA SUMMARY</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.5 }}>Admin must use the same SLA ladder as tenant requests and Cloud Functions.</Typography>
            </Box>
            <Grid container spacing={2}>
              {slaPolicy.map((item) => (
                <Grid item xs={12} md={2.4} key={item.key}>
                  <Paper onClick={() => navigate(item.route)} sx={{ p: 2, cursor: 'pointer', height: '100%', bgcolor: alpha(gold, 0.055), border: `1px solid ${alpha(gold, 0.14)}`, borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: gold, fontWeight: 950 }}>{item.key}</Typography>
                    <Typography sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{item.label}</Typography>
                    <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{item.minutes}m</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{item.copy}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: { xs: 2.5, md: 3.5 }, bgcolor: 'rgba(15,23,42,0.76)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5 }}>
          <Stack spacing={2.5}>
            <Box>
              <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 2 }}>90-DAY PILOT PROOF</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 0.5 }}>These are the proof metrics needed before major public commercial launch.</Typography>
            </Box>
            <Grid container spacing={2}>
              {pilotMetrics.map((metric) => (
                <Grid item xs={12} md={6} key={metric.label}>
                  <Box sx={{ p: 2, bgcolor: 'rgba(2,6,23,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center">
                      <Stack direction="row" spacing={1.2} alignItems="center">
                        <CheckCircle2 size={18} color={gold} />
                        <Typography sx={{ fontWeight: 950 }}>{metric.label}</Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)', fontWeight: 900 }}>Not measured</Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={0} sx={{ height: 8, mt: 1.5, mb: 1, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: gold } }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)' }}>Target: {metric.target}</Typography>
                  </Box>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2.5, bgcolor: alpha('#f59e0b', 0.08), border: `1px solid ${alpha('#f59e0b', 0.24)}`, borderRadius: 5 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Wrench size={20} color="#fbbf24" />
            <Box>
              <Typography sx={{ fontWeight: 950 }}>Hard launch remains evidence-gated</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                The Admin surface is being repaired, but hard-launch status must still come from live production evidence, external service proof, and the five-profile smoke workflow.
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}

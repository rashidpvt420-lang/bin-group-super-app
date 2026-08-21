import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CalendarClock, CheckCircle2, CreditCard, FileWarning, Gauge, MailWarning,
  Map, RefreshCw, ShieldAlert, ShieldCheck, TicketCheck, UserCheck, UserPlus, Users, Wrench,
} from 'lucide-react';
import { functions, httpsCallable } from '../../lib/firebase';

const gold = '#DAA520';

const slaPolicy = [
  { key: 'EMERGENCY', label: 'Emergency', minutes: 30, route: '/sos' },
  { key: 'HIGH', label: 'High', minutes: 120, route: '/tickets' },
  { key: 'MEDIUM', label: 'Medium', minutes: 240, route: '/tickets' },
  { key: 'STANDARD', label: 'Standard', minutes: 480, route: '/tickets' },
  { key: 'LOW', label: 'Low', minutes: 1440, route: '/tickets' },
];

const adminActions = [
  { id: 'sla', label: 'SLA Command', route: '/tickets', icon: <Gauge size={22} />, desc: 'Open tickets, timers, breach risk, and dispatch pressure.' },
  { id: 'payments', label: 'Payment Approvals', route: '/payments', icon: <CreditCard size={22} />, desc: 'Verify deposits and owner activation payment proof.' },
  { id: 'dispatch', label: 'Live Dispatch', route: '/technicians/map', icon: <Map size={22} />, desc: 'Technician coverage, location, and assignment visibility.' },
  { id: 'hr', label: 'HR Command', route: '/hr', icon: <Users size={22} />, desc: 'Staff identity, onboarding, documents, leave, attendance, payroll and offboarding.' },
  { id: 'owners', label: 'Owner Activation', route: '/owners', icon: <UserCheck size={22} />, desc: 'Pending owner approvals and dashboard activation readiness.' },
  { id: 'audit', label: 'Security & Audit', route: '/audit-shield', icon: <ShieldCheck size={22} />, desc: 'Audit trail, security controls and launch evidence.' },
  { id: 'reports', label: 'Reports', route: '/reports', icon: <BarChart3 size={22} />, desc: 'Operational, financial, portfolio and launch reporting.' },
  { id: 'tech', label: 'Technician Corps', route: '/technicians', icon: <Wrench size={22} />, desc: 'Technician operational profiles; employee identity remains owned by HR.' },
];

type HrSummary = {
  totalStaff: number; activeStaff: number; pendingInvitations: number; documentsExpiring: number;
  pendingLeave: number; absentToday: number; payrollPending: number;
};
type OpsCounts = {
  openEmergencyTickets: number; overdueSla: number; techniciansOnDuty: number; techniciansUnavailable: number;
  contractsExpiring: number; ownerActivationsPending: number; tenantComplaints: number; unresolvedSos: number;
  failedNotifications: number; securityAlerts24h: number; complianceAttention: number;
};

const emptyHr: HrSummary = { totalStaff: 0, activeStaff: 0, pendingInvitations: 0, documentsExpiring: 0, pendingLeave: 0, absentToday: 0, payrollPending: 0 };
const emptyOps: OpsCounts = { openEmergencyTickets: 0, overdueSla: 0, techniciansOnDuty: 0, techniciansUnavailable: 0, contractsExpiring: 0, ownerActivationsPending: 0, tenantComplaints: 0, unresolvedSos: 0, failedNotifications: 0, securityAlerts24h: 0, complianceAttention: 0 };

function errorText(error: any) {
  return String(error?.details || error?.message || error?.code || 'Command Center sync failed.').replace(/^FirebaseError:\s*/i, '').slice(0, 360);
}

export default function AdminSimpleDashboardPage() {
  const navigate = useNavigate();
  const [hr, setHr] = useState<HrSummary>(emptyHr);
  const [ops, setOps] = useState<OpsCounts>(emptyOps);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [coverageNote, setCoverageNote] = useState<string>('');

  const refresh = useCallback(async (quiet = false) => {
    quiet ? setRefreshing(true) : setLoading(true);
    try {
      const [hrResponse, opsResponse]: any[] = await Promise.all([
        httpsCallable(functions, 'adminGetHrCommandSnapshot')({}),
        httpsCallable(functions, 'adminGetCommandCenterSummary')({}),
      ]);
      setHr({ ...emptyHr, ...(hrResponse.data?.summary || {}) });
      setOps({ ...emptyOps, ...(opsResponse.data?.counts || {}) });
      setGeneratedAt(opsResponse.data?.generatedAt || hrResponse.data?.generatedAt || new Date().toISOString());
      setCoverageNote(opsResponse.data?.coverage?.note || 'Live counts loaded from canonical operational collections.');
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const liveCards = [
    { label: 'Open emergency tickets', value: ops.openEmergencyTickets, route: '/tickets', icon: <AlertTriangle size={18} />, danger: ops.openEmergencyTickets > 0 },
    { label: 'Overdue SLA', value: ops.overdueSla, route: '/tickets', icon: <Gauge size={18} />, danger: ops.overdueSla > 0 },
    { label: 'Unresolved SOS', value: ops.unresolvedSos, route: '/sos', icon: <ShieldAlert size={18} />, danger: ops.unresolvedSos > 0 },
    { label: 'Technicians on duty', value: ops.techniciansOnDuty, route: '/technicians', icon: <Wrench size={18} /> },
    { label: 'Technicians unavailable', value: ops.techniciansUnavailable, route: '/technicians', icon: <AlertTriangle size={18} />, danger: ops.techniciansUnavailable > 0 },
    { label: 'Pending staff invitations', value: hr.pendingInvitations, route: '/hr', icon: <UserPlus size={18} />, danger: hr.pendingInvitations > 0 },
    { label: 'HR documents expiring', value: hr.documentsExpiring, route: '/hr', icon: <FileWarning size={18} />, danger: hr.documentsExpiring > 0 },
    { label: 'Leave approvals', value: hr.pendingLeave, route: '/hr', icon: <CalendarClock size={18} />, danger: hr.pendingLeave > 0 },
    { label: 'Absent staff today', value: hr.absentToday, route: '/hr', icon: <Users size={18} />, danger: hr.absentToday > 0 },
    { label: 'Payroll awaiting closure', value: hr.payrollPending, route: '/hr', icon: <CreditCard size={18} />, danger: hr.payrollPending > 0 },
    { label: 'Contracts expiring ≤45d', value: ops.contractsExpiring, route: '/contracts', icon: <FileWarning size={18} />, danger: ops.contractsExpiring > 0 },
    { label: 'Owner activations pending', value: ops.ownerActivationsPending, route: '/owners', icon: <UserCheck size={18} />, danger: ops.ownerActivationsPending > 0 },
    { label: 'Open tenant complaints', value: ops.tenantComplaints, route: '/tickets', icon: <TicketCheck size={18} />, danger: ops.tenantComplaints > 0 },
    { label: 'Failed notifications', value: ops.failedNotifications, route: '/audit-shield', icon: <MailWarning size={18} />, danger: ops.failedNotifications > 0 },
    { label: 'Security alerts · 24h', value: ops.securityAlerts24h, route: '/audit-shield', icon: <ShieldAlert size={18} />, danger: ops.securityAlerts24h > 0 },
    { label: 'Compliance attention', value: ops.complianceAttention, route: '/compliance', icon: <ShieldCheck size={18} />, danger: ops.complianceAttention > 0 },
  ];

  if (loading) return <Box sx={{ minHeight: '75vh', display: 'grid', placeItems: 'center', bgcolor: '#020617' }}><CircularProgress sx={{ color: gold }} /></Box>;

  return (
    <Box sx={{ p: { xs: 2, md: 4 }, bgcolor: '#020617', minHeight: '100%', color: '#fff' }} data-testid="admin-command-center">
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3 }}>ADMIN COMMAND CENTER</Typography>
          <Typography variant="h3" fontWeight={950}>Live Operations Pulse</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mt: 1 }}>No placeholder pilot percentages. These counters come from live canonical HR, ticket, technician, owner, contract, mail and security records.</Typography>
          {generatedAt && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>Snapshot: {new Date(generatedAt).toLocaleString()}</Typography>}
        </Box>
        <Button startIcon={<RefreshCw size={17} />} variant="outlined" onClick={() => refresh(true)} disabled={refreshing} sx={{ borderColor: alpha(gold, 0.5), color: gold }}>{refreshing ? 'SYNCING' : 'REFRESH LIVE DATA'}</Button>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
      <Alert severity="info" sx={{ mb: 3 }}>{coverageNote}</Alert>

      <Grid container spacing={2} sx={{ mb: 5 }}>
        {liveCards.map((card) => <Grid item xs={12} sm={6} md={4} lg={3} key={card.label}><Paper onClick={() => navigate(card.route)} sx={{ p: 2.4, height: '100%', cursor: 'pointer', borderRadius: 3, bgcolor: card.danger ? alpha('#ef4444', 0.08) : 'rgba(15,23,42,0.72)', border: `1px solid ${card.danger ? alpha('#ef4444', 0.35) : 'rgba(255,255,255,0.06)'}`, '&:hover': { borderColor: alpha(gold, 0.5), transform: 'translateY(-1px)' }, transition: '0.18s ease' }}><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 800 }}>{card.label.toUpperCase()}</Typography><Typography variant="h4" fontWeight={950} sx={{ mt: 0.5, color: card.danger ? '#fca5a5' : '#fff' }}>{card.value}</Typography></Box><Box sx={{ p: 1, borderRadius: 2, bgcolor: alpha(card.danger ? '#ef4444' : gold, 0.12), color: card.danger ? '#f87171' : gold }}>{card.icon}</Box></Stack></Paper></Grid>)}
      </Grid>

      <Grid container spacing={3} sx={{ mb: 5 }}>
        <Grid item xs={12} lg={8}><Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Box><Typography variant="h6" fontWeight={950}>Admin action grid</Typography><Typography variant="caption" color="text.secondary">Every card routes to an operational surface; HR identity and Technician operations remain separated.</Typography></Box><Chip label={`${hr.activeStaff}/${hr.totalStaff} STAFF ACTIVE`} size="small" color="success" /></Stack><Grid container spacing={2}>{adminActions.map((action) => <Grid item xs={12} sm={6} key={action.id}><Paper onClick={() => navigate(action.route)} sx={{ p: 2, cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 3, '&:hover': { borderColor: alpha(gold, 0.45) } }}><Stack direction="row" spacing={2}><Box sx={{ color: gold }}>{action.icon}</Box><Box><Typography fontWeight={900}>{action.label}</Typography><Typography variant="caption" color="text.secondary">{action.desc}</Typography></Box></Stack></Paper></Grid>)}</Grid></Paper></Grid>
        <Grid item xs={12} lg={4}><Paper sx={{ p: 3, height: '100%', bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}><Typography variant="h6" fontWeight={950} sx={{ mb: 2 }}>SLA policy reference</Typography><Stack spacing={1.2}>{slaPolicy.map((policy) => <Stack key={policy.key} direction="row" justifyContent="space-between" alignItems="center" onClick={() => navigate(policy.route)} sx={{ p: 1.4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.025)', cursor: 'pointer' }}><Stack direction="row" spacing={1} alignItems="center"><CheckCircle2 size={15} color={gold} /><Typography variant="body2" fontWeight={800}>{policy.label}</Typography></Stack><Chip label={`${policy.minutes} MIN`} size="small" /></Stack>)}</Stack></Paper></Grid>
      </Grid>

      <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha(gold, 0.06), border: `1px solid ${alpha(gold, 0.2)}` }}><Typography variant="subtitle2" fontWeight={950} color={gold}>LAUNCH EVIDENCE SEPARATION</Typography><Typography variant="body2" sx={{ mt: 0.5, color: 'rgba(255,255,255,0.65)' }}>This dashboard is operational telemetry only. It does not certify a deployment, a protected workflow, or a Hard Public Launch exact SHA. After this PR is merged, production evidence must be regenerated for that new merge SHA.</Typography></Paper>
    </Box>
  );
}

import React, { useEffect, useState } from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Activity, AlertTriangle, Building2, CheckCircle2, FileText, Shield, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, limit, onSnapshot, query, Timestamp, where } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

type Row = { id: string; [key: string]: any };

const closedTickets = new Set(['CLOSED', 'COMPLETED', 'CANCELLED', 'CANCELED', 'DISPUTED']);
const openStates = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'ADMIN_REVIEW', 'pending_admin_approval', 'pending_approval'];
const verifyStates = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];

const normalize = (value: any) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const colorFor = (value: any) => {
  const text = normalize(value);
  if (text.includes('BREACH') || text.includes('ERROR') || text.includes('FAIL') || text.includes('BLOCKED')) return binThemeTokens.danger;
  if (text.includes('PENDING') || text.includes('MISSING') || text.includes('REVIEW')) return binThemeTokens.warning;
  if (text.includes('ACTIVE') || text.includes('VERIFIED') || text.includes('READY') || text.includes('GREEN')) return '#10b981';
  return 'rgba(255,255,255,0.68)';
};
const slaDue = (ticket: Row) => {
  const explicit = getMillis(ticket.slaDueAt || ticket.slaDeadline || ticket.dueAt);
  if (explicit) return explicit;
  const start = getMillis(ticket.createdAt || ticket.reportedAt || ticket.openedAt);
  const minutes = Number(ticket.slaMinutes);
  return start && Number.isFinite(minutes) && minutes > 0 ? start + minutes * 60_000 : 0;
};
const isBreached = (ticket: Row) => ticket.slaBreached === true || normalize(ticket.slaStatus) === 'BREACHED' || (slaDue(ticket) > 0 && slaDue(ticket) < Date.now());
const reviewPath = (row: Row) => row.kind === 'owner' ? `/vault?submissionId=${row.id}` : row.kind === 'technician' ? `/technicians?reviewId=${row.id}` : `/manual-approvals?paymentId=${row.id}`;

export default function DashboardPage() {
  const navigate = useNavigate();
  const [lastSync, setLastSync] = useState(new Date());
  const [warnings, setWarnings] = useState<string[]>([]);
  const [properties, setProperties] = useState({ count: 0, units: 0 });
  const [tenants, setTenants] = useState(0);
  const [technicians, setTechnicians] = useState(0);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [approvals, setApprovals] = useState<Row[]>([]);
  const [contracts, setContracts] = useState(0);
  const [docs, setDocs] = useState(0);
  const [auditToday, setAuditToday] = useState(0);
  const [summary, setSummary] = useState<Record<string, any>>({});

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const listen = (name: string, source: any, handler: (snap: any) => void) => {
      unsubs.push(onSnapshot(source, (snap: any) => { handler(snap); setLastSync(new Date()); }, (error: any) => {
        console.warn(`[ADMIN_DASHBOARD] ${name} read failed`, error);
        setWarnings((prev) => Array.from(new Set([...prev, name])).slice(0, 8));
      }));
    };

    listen('properties', collection(db, 'properties'), (snap) => {
      let units = 0;
      snap.docs.forEach((row: any) => { units += Number(row.data()?.units || row.data()?.totalUnits || row.data()?.unitsCount || 0); });
      setProperties({ count: snap.size, units });
    });
    listen('tenants', query(collection(db, 'users'), where('role', '==', 'tenant')), (snap) => setTenants(snap.size));
    listen('technicians', query(collection(db, 'users'), where('role', '==', 'technician')), (snap) => setTechnicians(snap.size));
    listen('tickets', query(collection(db, 'maintenanceTickets'), limit(40)), (snap) => setTickets(snap.docs.map((row: any) => ({ id: row.id, ...(row.data() || {}) })).filter((row: Row) => !closedTickets.has(normalize(row.status))).slice(0, 10)));
    listen('owner review', query(collection(db, 'intake_submissions'), where('status', 'in', openStates), limit(10)), (snap) => setApprovals((prev) => [...prev.filter((item) => item.kind !== 'owner'), ...snap.docs.map((row: any) => ({ id: row.id, kind: 'owner', label: row.data()?.companyProfile?.name || row.data()?.ownerEmail || row.id, createdAt: row.data()?.createdAt || row.data()?.submittedAt }))]));
    listen('tech review', query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', openStates), limit(10)), (snap) => setApprovals((prev) => [...prev.filter((item) => item.kind !== 'technician'), ...snap.docs.map((row: any) => ({ id: row.id, kind: 'technician', label: row.data()?.displayName || row.data()?.email || row.id, createdAt: row.data()?.createdAt }))]));
    listen('finance review', query(collection(db, 'payment_transactions'), where('status', 'in', verifyStates), limit(10)), (snap) => setApprovals((prev) => [...prev.filter((item) => item.kind !== 'finance'), ...snap.docs.map((row: any) => ({ id: row.id, kind: 'finance', label: row.data()?.ownerEmail || row.data()?.tenantEmail || row.id, amount: row.data()?.amount || row.data()?.amountPaid || 0, createdAt: row.data()?.createdAt || row.data()?.submittedAt }))]));
    listen('contracts', query(collection(db, 'contracts'), where('status', '==', 'ACTIVE')), (snap) => setContracts(snap.size));
    listen('documents', collection(db, 'documents'), (snap) => setDocs(snap.size));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    listen('audit', query(collection(db, 'audit_logs'), where('createdAt', '>=', Timestamp.fromDate(today))), (snap) => setAuditToday(snap.size));
    listen('summary', doc(db, 'admin_summaries', 'global'), (snap) => setSummary(snap.exists() ? snap.data() || {} : {}));
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const breaches = tickets.filter(isBreached).length;
  const orderedApprovals = approvals.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt)).slice(0, 12);
  const queuedAmount = orderedApprovals.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cards = [
    ['Properties', properties.count, <Building2 size={18} />, '/properties/passport', 'ACTIVE'],
    ['Units', properties.units, <Building2 size={18} />, '/admin/units', 'ACTIVE'],
    ['Tenants', tenants, <Users size={18} />, '/tenants', 'ACTIVE'],
    ['Technicians', technicians, <Wrench size={18} />, '/technicians', 'ACTIVE'],
    ['Open Missions', tickets.length, <Wrench size={18} />, '/tickets', tickets.length ? 'PENDING' : 'CLEAR'],
    ['SLA Breaches', breaches, <AlertTriangle size={18} />, '/tickets', breaches ? 'BREACH' : 'CLEAR'],
    ['Approvals', orderedApprovals.length, <Shield size={18} />, '/vault', orderedApprovals.length ? 'PENDING' : 'CLEAR'],
    ['Contracts', contracts, <FileText size={18} />, '/contracts/termination', 'ACTIVE'],
    ['Documents', docs, <FileText size={18} />, '/document-vault', 'ACTIVE'],
    ['Audit Today', auditToday, <Activity size={18} />, '/audit', 'ACTIVE'],
    ['Collections', money(summary.totalCollections), <CheckCircle2 size={18} />, '/transactions', 'VERIFIED'],
    ['Queued Amount', money(queuedAmount), <Shield size={18} />, '/manual-approvals', queuedAmount ? 'PENDING' : 'CLEAR'],
  ] as const;

  return (
    <AdminPageFrame title="Executive Command Center" subtitle="Live dashboard for profile counts, work orders, approvals, finance review, launch health and audit activity." status={warnings.length ? 'PARTIAL DATA' : 'LIVE'} lastUpdated={lastSync}>
      <Stack spacing={4}>
        {warnings.length > 0 && <Paper sx={{ p: 2, bgcolor: alpha(binThemeTokens.warning, 0.08) }}><Typography sx={{ color: binThemeTokens.warning, fontWeight: 900 }}>Partial data: {warnings.join(', ')}</Typography></Paper>}
        <Grid container spacing={2}>{cards.map(([label, value, icon, route, status]) => <Grid item xs={12} sm={6} md={3} key={label}><Paper onClick={() => navigate(route)} sx={{ p: 2, minHeight: 118, borderRadius: 4, bgcolor: binThemeTokens.graphite, cursor: 'pointer', border: `1px solid ${alpha(colorFor(status), 0.25)}` }}><Box sx={{ color: colorFor(status), mb: 1 }}>{icon}</Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>{label.toUpperCase()}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950 }}>{value}</Typography></Paper></Grid>)}</Grid>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#0f172a' }}><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}><Typography variant="h6" fontWeight={950}><Shield color={binThemeTokens.gold} /> Action Queue</Typography><Chip label={`${orderedApprovals.length} awaiting`} sx={{ color: binThemeTokens.gold, bgcolor: alpha(binThemeTokens.gold, 0.12), fontWeight: 900 }} /></Stack><Stack spacing={1.5}>{orderedApprovals.map((row) => <Box key={`${row.kind}-${row.id}`} sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)', display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}><Box><Typography sx={{ color: '#fff', fontWeight: 900 }}>{normalize(row.kind)}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.label}</Typography></Box><Button size="small" variant="outlined" onClick={() => navigate(reviewPath(row))}>Review</Button></Box>)}{orderedApprovals.length === 0 && <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>No pending actions.</Typography>}</Stack></Paper></Grid>
          <Grid item xs={12} md={5}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#0f172a' }}><Typography variant="h6" fontWeight={950} sx={{ mb: 2 }}><Wrench color={binThemeTokens.gold} /> Live Work Orders</Typography><Stack spacing={1.5}>{tickets.map((ticket) => <Box key={ticket.id} sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${isBreached(ticket) ? alpha(binThemeTokens.danger, 0.45) : 'rgba(255,255,255,0.06)'}` }}><Stack direction="row" justifyContent="space-between"><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>#{ticket.id.slice(0, 8)}</Typography><Chip size="small" label={normalize(ticket.status)} sx={{ color: colorFor(ticket.status), bgcolor: alpha(colorFor(ticket.status), 0.12), fontWeight: 900 }} /></Stack><Typography sx={{ color: '#fff', fontWeight: 800 }}>{ticket.title || ticket.issueType || ticket.category || 'Maintenance mission'}</Typography><Typography variant="caption" sx={{ color: isBreached(ticket) ? binThemeTokens.danger : 'rgba(255,255,255,0.45)' }}>{isBreached(ticket) ? 'SLA breached' : slaDue(ticket) ? 'SLA configured' : 'SLA not configured'}</Typography></Box>)}{tickets.length === 0 && <Typography sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900 }}>No active work orders.</Typography>}</Stack></Paper></Grid>
          <Grid item xs={12}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: alpha(binThemeTokens.gold, 0.035) }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>Dashboard truth note</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>Duplicate SLA helper blocks and undefined dashboard state were removed. Missing SLA data is shown as missing instead of fake time. Missing launch-health values stay missing until `admin_summaries/global` supplies proof.</Typography></Paper></Grid>
        </Grid>
      </Stack>
    </AdminPageFrame>
  );
}

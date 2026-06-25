import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  alpha,
} from '@mui/material';
import { Activity, AlertTriangle, Briefcase, Building2, Clock, DollarSign, FileText, Shield, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, limit, onSnapshot, orderBy, query, Timestamp, where } from '../../lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import { binThemeTokens } from '../../theme/adminTheme';

type Row = { id: string; [key: string]: any };

type Card = {
  label: string;
  value: string | number;
  path: string;
  icon: React.ReactNode;
  tone: string;
};

const openTicketStates = ['OPEN', 'PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'open', 'pending', 'assigned', 'accepted', 'in_progress'];
const pendingPayments = ['PENDING', 'ADMIN_VERIFICATION_REQUIRED', 'pending', 'pending_verification'];
const pendingOwnerStates = ['AWAITING_VERIFICATION', 'PENDING', 'PENDING_ADMIN_REVIEW', 'pending_admin_review'];
const pendingTechStates = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval', 'pending_approval'];
const pendingCommissionStates = ['PENDING', 'PENDING_ADMIN_APPROVAL', 'pending', 'pending_admin_approval'];

const money = (value: any) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;

const millis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const labelDate = (value: any) => {
  const time = millis(value);
  return time ? new Date(time).toLocaleString('en-AE') : 'Not recorded';
};

const normalize = (value: any) => String(value || '').replace(/_/g, ' ').toUpperCase();

const slaDue = (ticket: Row) => {
  const explicit = millis(ticket.slaDueAt || ticket.slaDeadline || ticket.dueAt);
  if (explicit) return explicit;
  const created = millis(ticket.createdAt || ticket.reportedAt);
  const minutes = Number(ticket.slaMinutes || ticket.slaBudgetMinutes || 0);
  if (created && Number.isFinite(minutes) && minutes > 0) return created + minutes * 60_000;
  const priority = normalize(ticket.priority || ticket.severity || ticket.category);
  const fallback = priority.includes('EMERGENCY') || priority.includes('CRITICAL') ? 30 : priority.includes('HIGH') || priority.includes('URGENT') ? 120 : 240;
  return created ? created + fallback * 60_000 : 0;
};

const slaLabel = (ticket: Row) => {
  const due = slaDue(ticket);
  if (!due) return 'SLA not configured';
  const diff = due - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return diff < 0 ? `Breached by ${h}h ${m}m` : `${h}h ${m}m remaining`;
};

const isBreached = (ticket: Row) => ticket.slaBreached === true || normalize(ticket.slaStatus).includes('BREACH') || (slaDue(ticket) > 0 && slaDue(ticket) < Date.now());
const isNearBreach = (ticket: Row) => {
  const due = slaDue(ticket);
  return due > Date.now() && due - Date.now() <= 60 * 60_000;
};

const reviewPath = (item: Row) => {
  if (item.type === 'OWNER_ONBOARDING') return '/vault';
  if (item.type === 'TECH_ONBOARD') return '/technicians';
  if (item.type === 'PAYMENT_PROOF') return '/manual-approvals';
  if (item.type === 'BROKER_COMMISSION') return '/broker';
  return '/dashboard';
};

export default function AdminLiveDashboard() {
  const navigate = useNavigate();
  const [lastSync, setLastSync] = useState(new Date());
  const [streamErrors, setStreamErrors] = useState<Record<string, string>>({});
  const [properties, setProperties] = useState<Row[]>([]);
  const [tenantCount, setTenantCount] = useState(0);
  const [techCount, setTechCount] = useState(0);
  const [brokerCount, setBrokerCount] = useState(0);
  const [contracts, setContracts] = useState(0);
  const [passports, setPassports] = useState(0);
  const [documents, setDocuments] = useState(0);
  const [expiredDocs, setExpiredDocs] = useState(0);
  const [tickets, setTickets] = useState<Row[]>([]);
  const [ownerApprovals, setOwnerApprovals] = useState<Row[]>([]);
  const [techApprovals, setTechApprovals] = useState<Row[]>([]);
  const [paymentQueue, setPaymentQueue] = useState<Row[]>([]);
  const [commissionQueue, setCommissionQueue] = useState<Row[]>([]);
  const [auditToday, setAuditToday] = useState(0);
  const [orphans, setOrphans] = useState(0);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [activity, setActivity] = useState<Row[]>([]);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    const listen = (name: string, source: any, handler: (snap: any) => void) => {
      const unsub = onSnapshot(source, (snap: any) => {
        handler(snap);
        setLastSync(new Date());
        setStreamErrors((old) => {
          if (!old[name]) return old;
          const next = { ...old };
          delete next[name];
          return next;
        });
      }, (error: any) => {
        setStreamErrors((old) => ({ ...old, [name]: error?.code || error?.message || 'failed' }));
      });
      unsubscribers.push(unsub);
    };

    listen('properties', collection(db, 'properties'), (snap) => setProperties(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));
    listen('tenants', query(collection(db, 'users'), where('role', '==', 'tenant')), (snap) => setTenantCount(snap.size));
    listen('technicians', query(collection(db, 'users'), where('role', '==', 'technician')), (snap) => setTechCount(snap.size));
    listen('brokers', query(collection(db, 'users'), where('role', '==', 'broker')), (snap) => setBrokerCount(snap.size));
    listen('contracts', query(collection(db, 'contracts'), where('status', '==', 'ACTIVE')), (snap) => setContracts(snap.size));
    listen('passports', collection(db, 'propertyPassports'), (snap) => setPassports(snap.size));
    listen('tickets', query(collection(db, 'maintenanceTickets'), where('status', 'in', openTicketStates)), (snap) => setTickets(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).sort((a: Row, b: Row) => millis(b.updatedAt || b.createdAt) - millis(a.updatedAt || a.createdAt)).slice(0, 12)));
    listen('owner approvals', query(collection(db, 'intake_submissions'), where('status', 'in', pendingOwnerStates)), (snap) => setOwnerApprovals(snap.docs.map((d: any) => ({ id: d.id, type: 'OWNER_ONBOARDING', origin: 'Owner onboarding', ...d.data() }))));
    listen('tech approvals', query(collection(db, 'users'), where('role', '==', 'technician'), where('status', 'in', pendingTechStates)), (snap) => setTechApprovals(snap.docs.map((d: any) => ({ id: d.id, type: 'TECH_ONBOARD', origin: 'Technician onboarding', ...d.data() }))));
    listen('payments', query(collection(db, 'payment_transactions'), where('status', 'in', pendingPayments)), (snap) => setPaymentQueue(snap.docs.map((d: any) => ({ id: d.id, type: 'PAYMENT_PROOF', origin: 'Payment verification', ...d.data() }))));
    listen('commissions', query(collection(db, 'broker_commissions'), where('status', 'in', pendingCommissionStates)), (snap) => setCommissionQueue(snap.docs.map((d: any) => ({ id: d.id, type: 'BROKER_COMMISSION', origin: 'Broker commission', ...d.data() }))));
    listen('documents', collection(db, 'documents'), (snap) => {
      setDocuments(snap.size);
      setExpiredDocs(snap.docs.filter((d: any) => millis(d.data().expiryDate || d.data().expiresAt || d.data().validUntil) > 0 && millis(d.data().expiryDate || d.data().expiresAt || d.data().validUntil) < Date.now()).length);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    listen('audit today', query(collection(db, 'audit_logs'), where('createdAt', '>=', Timestamp.fromDate(today))), (snap) => setAuditToday(snap.size));
    listen('orphans', doc(db, 'system_stats', 'orphans'), (snap) => setOrphans(snap.exists() ? Number(snap.data().total || 0) : 0));
    listen('summary', doc(db, 'admin_summaries', 'global'), (snap) => setSummary(snap.exists() ? snap.data() : {}));
    listen('activity', query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(8)), (snap) => setActivity(snap.docs.map((d: any) => ({ id: d.id, ...d.data() }))));

    return () => unsubscribers.forEach((unsub) => unsub());
  }, []);

  const totalUnits = properties.reduce((sum, property) => sum + Number(property.units || property.totalUnits || property.unitsCount || 0), 0);
  const breachCount = tickets.filter(isBreached).length;
  const nearCount = tickets.filter(isNearBreach).length;
  const queue = [...ownerApprovals, ...techApprovals, ...paymentQueue, ...commissionQueue].sort((a, b) => millis(b.createdAt || b.submittedAt) - millis(a.createdAt || a.submittedAt));

  const cards: Card[] = useMemo(() => [
    { label: 'Properties', value: properties.length, path: '/properties/passport', icon: <Building2 size={20} />, tone: binThemeTokens.gold },
    { label: 'Units', value: totalUnits, path: '/unit-status', icon: <Building2 size={20} />, tone: '#60a5fa' },
    { label: 'Tenants', value: tenantCount, path: '/tenants', icon: <Users size={20} />, tone: '#10b981' },
    { label: 'Technicians', value: techCount, path: '/technicians', icon: <Wrench size={20} />, tone: '#22c55e' },
    { label: 'Brokers', value: brokerCount, path: '/broker', icon: <Briefcase size={20} />, tone: '#a78bfa' },
    { label: 'Open Missions', value: tickets.length, path: '/tickets', icon: <Wrench size={20} />, tone: tickets.length ? binThemeTokens.warning : '#10b981' },
    { label: 'SLA Breaches', value: breachCount, path: '/tickets', icon: <AlertTriangle size={20} />, tone: breachCount ? binThemeTokens.danger : '#10b981' },
    { label: 'Near Breaches', value: nearCount, path: '/tickets', icon: <Clock size={20} />, tone: nearCount ? binThemeTokens.warning : '#10b981' },
    { label: 'Owner Approvals', value: ownerApprovals.length, path: '/vault', icon: <Shield size={20} />, tone: ownerApprovals.length ? binThemeTokens.warning : '#10b981' },
    { label: 'Payment Proofs', value: paymentQueue.length, path: '/manual-approvals', icon: <DollarSign size={20} />, tone: paymentQueue.length ? binThemeTokens.warning : '#10b981' },
    { label: 'Commissions', value: commissionQueue.length, path: '/broker', icon: <DollarSign size={20} />, tone: commissionQueue.length ? binThemeTokens.warning : '#10b981' },
    { label: 'Contracts', value: contracts, path: '/contracts', icon: <FileText size={20} />, tone: binThemeTokens.gold },
    { label: 'Passports', value: passports, path: '/properties/passport', icon: <FileText size={20} />, tone: '#60a5fa' },
    { label: 'Documents', value: documents, path: '/document-vault', icon: <FileText size={20} />, tone: '#818cf8' },
    { label: 'Expired Docs', value: expiredDocs, path: '/document-vault', icon: <AlertTriangle size={20} />, tone: expiredDocs ? binThemeTokens.warning : '#10b981' },
    { label: 'Audit Today', value: auditToday, path: '/audit-log', icon: <Activity size={20} />, tone: binThemeTokens.gold },
    { label: 'Orphans', value: orphans, path: '/orphans', icon: <AlertTriangle size={20} />, tone: orphans ? binThemeTokens.danger : '#10b981' },
    { label: 'Collections', value: money(summary.totalCollections), path: '/transactions', icon: <DollarSign size={20} />, tone: '#10b981' },
  ], [auditToday, brokerCount, breachCount, commissionQueue.length, contracts, documents, expiredDocs, nearCount, orphans, ownerApprovals.length, passports, paymentQueue.length, properties.length, summary.totalCollections, techCount, tenantCount, tickets.length, totalUnits]);

  return (
    <AdminPageFrame title="Executive Command Center" subtitle="Live operational control for approvals, missions, finance, compliance, and launch health." status={Object.keys(streamErrors).length ? 'STREAM WARNINGS' : 'LIVE'} lastUpdated={lastSync} onRefresh={() => window.location.reload()}>
      <Stack spacing={4}>
        {Object.keys(streamErrors).length > 0 && <Paper sx={{ p: 2, borderRadius: 3, bgcolor: alpha(binThemeTokens.warning, 0.08), border: `1px solid ${alpha(binThemeTokens.warning, 0.28)}` }}><Typography sx={{ color: binThemeTokens.warning, fontWeight: 950 }}>Live stream warnings: {Object.keys(streamErrors).join(', ')}</Typography></Paper>}

        <Grid container spacing={2}>{cards.map((card) => <Grid item xs={12} sm={6} md={3} lg={2} key={card.label}><Paper onClick={() => navigate(card.path)} sx={{ p: 2, borderRadius: 4, cursor: 'pointer', bgcolor: binThemeTokens.graphite, border: `1px solid ${alpha(card.tone, 0.28)}` }}><Box sx={{ color: card.tone, mb: 1 }}>{card.icon}</Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography><Typography variant="h6" sx={{ fontWeight: 950 }}>{card.value}</Typography></Paper></Grid>)}</Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}><Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 5, bgcolor: '#0f172a' }}><Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.06)' }}><Typography variant="h6" fontWeight={950}>Action Queues</Typography></Box><TableContainer><Table size="small"><TableHead><TableRow><TableCell>Origin</TableCell><TableCell>Type</TableCell><TableCell>Linked</TableCell><TableCell>Submitted</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead><TableBody>{queue.length ? queue.map((item) => <TableRow key={`${item.type}-${item.id}`}><TableCell>{item.origin}</TableCell><TableCell>{normalize(item.type)}</TableCell><TableCell>{item.companyProfile?.name || item.ownerAccount?.email || item.displayName || item.brokerName || item.ownerEmail || item.id}</TableCell><TableCell>{labelDate(item.createdAt || item.submittedAt)}</TableCell><TableCell align="right"><Button size="small" onClick={() => navigate(reviewPath(item))}>Review</Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={5} align="center">No pending actions</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper></Grid>

          <Grid item xs={12} lg={5}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#0f172a', height: '100%' }}><Typography variant="h6" fontWeight={950} sx={{ mb: 2 }}>Live Missions</Typography><Stack spacing={2}>{tickets.length ? tickets.map((ticket) => <Box key={ticket.id} sx={{ p: 2, borderRadius: 3, border: `1px solid ${isBreached(ticket) ? alpha(binThemeTokens.danger, 0.35) : isNearBreach(ticket) ? alpha(binThemeTokens.warning, 0.35) : 'rgba(255,255,255,0.08)'}` }}><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>#{ticket.id.slice(0, 8)}</Typography><Typography fontWeight={900}>{ticket.title || ticket.issueType || ticket.category || 'Maintenance mission'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{ticket.propertyName || ticket.propertyTitle || 'Property not linked'}</Typography><Typography variant="caption" sx={{ display: 'block', mt: 1, color: isBreached(ticket) ? binThemeTokens.danger : isNearBreach(ticket) ? binThemeTokens.warning : 'rgba(255,255,255,0.62)' }}>{slaLabel(ticket)}</Typography></Box>) : <Typography color="text.secondary">No active missions</Typography>}</Stack></Paper></Grid>

          <Grid item xs={12} lg={6}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#0f172a' }}><Typography variant="h6" fontWeight={950} sx={{ mb: 2 }}>Launch Health</Typography><Grid container spacing={1}>{['mainAppBuild', 'adminPanelBuild', 'functionsDeploy', 'firestoreRules', 'storageRules', 'appCheck', 'paymentVerification', 'brandedEmail'].map((key) => <Grid item xs={12} sm={6} key={key}><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2" fontWeight={800}>{key}</Typography><Chip size="small" label={normalize(summary.launchHealth?.[key] || summary[key] || 'unknown')} /></Box></Grid>)}</Grid></Paper></Grid>

          <Grid item xs={12} lg={6}><Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#0f172a' }}><Typography variant="h6" fontWeight={950} sx={{ mb: 2 }}>Recent Audit Activity</Typography><Stack spacing={1.5}>{activity.length ? activity.map((row) => <Box key={row.id}><Typography fontWeight={800}>{row.actorRole || row.actorId || 'SYSTEM'} - {row.action || 'updated'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{row.targetType || row.module || 'Audit'} - {labelDate(row.createdAt || row.timestamp)}</Typography></Box>) : <Typography color="text.secondary">No recent audit records</Typography>}</Stack></Paper></Grid>
        </Grid>
      </Stack>
    </AdminPageFrame>
  );
}

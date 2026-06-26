import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Briefcase, DollarSign, FileText, Link2, PlusCircle, Send, TrendingUp, Users } from 'lucide-react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import BrokerPageFrame from '../components/BrokerPageFrame';
import RoleJourneyStrip from '../../components/RoleJourneyStrip';

const money = (value: number) => `AED ${Number(value || 0).toLocaleString('en-AE', { maximumFractionDigits: 0 })}`;
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const uniqueRows = (rows: any[]) => Array.from(new Map(rows.map((row) => [String(row.id), row])).values());
const rowTime = (row: any) => row?.createdAt?.toDate ? row.createdAt.toDate().getTime() : row?.createdAt?.seconds ? row.createdAt.seconds * 1000 : 0;

export default function BrokerDashboardPage() {
  const { user } = useRole();
  const { tx } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [stats, setStats] = useState({ leadsActive: 0, referralsPending: 0, commissionPending: 0, commissionPaid: 0 });
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs: Array<() => void> = [];
    const buckets: Record<string, any[]> = {};
    const identitySources = [
      { field: 'brokerId', value: user.uid },
      { field: 'brokerUid', value: user.uid },
      { field: 'createdByUid', value: user.uid },
      { field: 'brokerEmail', value: normalizeEmail(user.email) },
    ].filter((source) => source.value);

    const refreshLeads = () => {
      const rows = uniqueRows(Object.entries(buckets).filter(([key]) => key.startsWith('brokerLeads:')).flatMap(([, value]) => value)).sort((a, b) => rowTime(b) - rowTime(a));
      setRecentLeads(rows.slice(0, 5));
      setStats((prev) => ({ ...prev, leadsActive: rows.filter((row: any) => ['new', 'contacted', 'viewing', 'negotiation'].includes(String(row.status || '').toLowerCase())).length }));
      setLoading(false);
    };

    const refreshReferrals = () => {
      const rows = uniqueRows(Object.entries(buckets).filter(([key]) => key.startsWith('referrals:')).flatMap(([, value]) => value));
      const pending = rows.filter((row: any) => ['submitted', 'under_review'].includes(String(row.status || '').toLowerCase())).length;
      setStats((prev) => ({ ...prev, referralsPending: pending }));
    };

    const refreshCommissions = () => {
      const rows = uniqueRows(Object.entries(buckets).filter(([key]) => key.startsWith('broker_commissions:')).flatMap(([, value]) => value));
      let pending = 0;
      let paid = 0;
      rows.forEach((row: any) => {
        const amount = Number(row.amount || row.commissionAmount || 0);
        const status = String(row.status || '').toLowerCase();
        if (status === 'paid') paid += amount;
        else pending += amount;
      });
      setStats((prev) => ({ ...prev, commissionPending: pending, commissionPaid: paid }));
    };

    const bind = (collectionName: string, refresh: () => void, max = 25) => {
      identitySources.forEach((source) => {
        const key = `${collectionName}:${source.field}:${source.value}`;
        const q = query(collection(db, collectionName), where(source.field, '==', source.value), orderBy('createdAt', 'desc'), limit(max));
        unsubs.push(onSnapshot(q, (snap) => {
          buckets[key] = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
          refresh();
        }, (err) => {
          console.warn(`[BrokerDashboard] ${collectionName}.${source.field} failed`, err);
          setWarning('Some broker data could not load. Check Firestore rules if dashboard numbers look incomplete.');
          setLoading(false);
        }));
      });
    };

    try {
      bind('brokerLeads', refreshLeads, 10);
      bind('referrals', refreshReferrals, 25);
      bind('broker_commissions', refreshCommissions, 50);
    } catch (err) {
      console.error('[BrokerDashboard] startup failed', err);
      setWarning('Broker dashboard could not start all listeners.');
      setLoading(false);
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid, user?.email]);

  const statCards = useMemo(() => [
    { label: tx('broker.dash.active_leads', 'Active Leads'), value: stats.leadsActive, icon: <Users size={22} />, route: '/broker/leads', tone: '#10b981' },
    { label: tx('broker.dash.pending_referrals', 'Pending Referrals'), value: stats.referralsPending, icon: <Briefcase size={22} />, route: '/broker/referrals', tone: binThemeTokens.gold },
    { label: tx('broker.dash.pending_payout', 'Pending Payout'), value: money(stats.commissionPending), icon: <DollarSign size={22} />, route: '/broker/commissions', tone: '#f59e0b' },
    { label: tx('broker.dash.lifetime_paid', 'Lifetime Paid'), value: money(stats.commissionPaid), icon: <TrendingUp size={22} />, route: '/broker/commissions', tone: '#3b82f6' },
  ], [stats, tx]);

  const commands = [
    { label: tx('broker.dash.add_lead', 'Add New Lead'), route: '/broker/leads/new', icon: <PlusCircle size={18} /> },
    { label: tx('broker.dash.submit_referral', 'Submit Referral'), route: '/broker/referrals/new', icon: <Send size={18} /> },
    { label: tx('broker.dash.view_payouts', 'View Payouts'), route: '/broker/commissions', icon: <DollarSign size={18} /> },
    { label: tx('broker.dash.doc_vault', 'Document Vault'), route: '/broker/documents', icon: <FileText size={18} /> },
    { label: tx('broker.nav.attribution', 'Attribution'), route: '/broker/attribution', icon: <Link2 size={18} /> },
  ];

  return (
    <BrokerPageFrame title={`${tx('dash.hello', 'Hello')}, ${user?.displayName?.split(' ')[0] || 'Partner'}`} subtitle={`${tx('broker.dash.broker_code', 'Broker Code')}: BIN-${user?.uid?.substring(0, 6).toUpperCase() || 'BROKER'}`} loading={loading}>
      <RoleJourneyStrip role="broker" />
      <Stack spacing={3}>
        {warning && <Alert severity="warning">{warning}</Alert>}
        <Grid container spacing={3}>{statCards.map((card) => <Grid item xs={12} sm={6} md={3} key={card.label}><Paper onClick={() => navigate(card.route)} sx={{ p: 3, cursor: 'pointer', borderRadius: 5, bgcolor: alpha(card.tone, 0.06), border: `1px solid ${alpha(card.tone, 0.22)}` }}><Box sx={{ color: card.tone, mb: 1 }}>{card.icon}</Box><Typography variant="h5" fontWeight={950} sx={{ color: '#111827' }}>{card.value}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 950 }}>{card.label.toUpperCase()}</Typography></Paper></Grid>)}</Grid>
        <Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#fff', border: '1px solid #E5E7EB' }}><Typography variant="h6" fontWeight={950} sx={{ color: '#111827', mb: 2 }}>Broker launcher</Typography><Grid container spacing={2}>{commands.map((action) => <Grid item xs={12} sm={6} md={2.4} key={action.route}><Button fullWidth variant="outlined" startIcon={action.icon} onClick={() => navigate(action.route)} sx={{ py: 1.5, borderColor: binThemeTokens.gold, color: '#111827', fontWeight: 900 }}>{action.label}</Button></Grid>)}</Grid></Paper>
        <Paper sx={{ p: 3, borderRadius: 5, bgcolor: '#fff', border: '1px solid #E5E7EB' }}><Typography variant="h6" fontWeight={950} sx={{ color: '#111827', mb: 2 }}>Recent leads</Typography>{recentLeads.length === 0 ? <Typography sx={{ color: '#667085' }}>No recent lead activity yet.</Typography> : <Stack spacing={1.5}>{recentLeads.map((lead) => <Paper key={lead.id} sx={{ p: 2, bgcolor: '#F8F9FB', border: '1px solid #E5E7EB', borderRadius: 3 }}><Typography fontWeight={900} sx={{ color: '#111827' }}>{lead.leadName || lead.clientName || lead.ownerName || 'Lead'}</Typography><Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}><Chip size="small" label={String(lead.status || 'new').toUpperCase()} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} /><Typography variant="caption" sx={{ color: '#667085' }}>{lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : 'Just now'}</Typography></Stack></Paper>)}</Stack>}</Paper>
      </Stack>
    </BrokerPageFrame>
  );
}

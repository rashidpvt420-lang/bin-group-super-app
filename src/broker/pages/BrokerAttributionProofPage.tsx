import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Divider, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Briefcase, CheckCircle2, FileText, Link2, ShieldCheck, Wallet } from 'lucide-react';
import { collection, db, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type Row = { id: string; [key: string]: any };
const gold = binThemeTokens.gold;
const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: any) => `AED ${Number(value || 0).toLocaleString()}`;
const statusColor = (value: any) => {
  const status = String(value || '').toUpperCase();
  if (['PAID', 'APPROVED', 'VERIFIED', 'LOCKED'].some((x) => status.includes(x))) return '#10b981';
  if (['REJECTED', 'FAILED', 'DISPUTED'].some((x) => status.includes(x))) return '#ef4444';
  return '#f59e0b';
};
const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const byId = (rows: Row[]) => new Map(rows.map((row) => [String(row.id), row]));
const uniqueRows = (rows: Row[]) => Array.from(new Map(rows.map((row) => [String(row.id), row])).values());

export default function BrokerAttributionProofPage() {
  const { user } = useRole();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Row[]>([]);
  const [referrals, setReferrals] = useState<Row[]>([]);
  const [commissions, setCommissions] = useState<Row[]>([]);
  const [warning, setWarning] = useState('');

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs: Array<() => void> = [];
    const buckets: Record<string, Row[]> = {};
    const email = normalizeEmail(user.email);

    const bind = (collectionName: string, setter: React.Dispatch<React.SetStateAction<Row[]>>) => {
      const sources = [
        { field: 'brokerId', value: user.uid },
        { field: 'brokerUid', value: user.uid },
        { field: 'createdByUid', value: user.uid },
        { field: 'brokerEmail', value: email },
      ].filter((source) => source.value);

      sources.forEach((source) => {
        const key = `${collectionName}:${source.field}:${source.value}`;
        const q = query(collection(db, collectionName), where(source.field, '==', source.value));
        unsubs.push(onSnapshot(q, (snap) => {
          buckets[key] = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Row));
          const merged = uniqueRows(Object.entries(buckets).filter(([bucketKey]) => bucketKey.startsWith(`${collectionName}:`)).flatMap(([, rows]) => rows))
            .sort((a, b) => getMillis(b.updatedAt || b.createdAt || b.submittedAt) - getMillis(a.updatedAt || a.createdAt || a.submittedAt));
          setter(merged);
        }, (err) => {
          console.warn(`[BrokerAttributionProof] ${collectionName}.${source.field} listener failed:`, err);
          setWarning('Some attribution records could not load. Check Firestore rules if the chain looks incomplete.');
        }));
      });
    };

    bind('brokerLeads', setLeads);
    bind('referrals', setReferrals);
    bind('broker_commissions', setCommissions);
    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid, user?.email]);

  const chains = useMemo(() => {
    const leadMap = byId(leads);
    const referralMap = byId(referrals);
    const referralChains = referrals.map((referral) => {
      const lead = leadMap.get(String(referral.leadId || referral.brokerLeadId || '')) || null;
      const relatedCommissions = commissions.filter((commission) => String(commission.referralId || commission.referralRef || '') === referral.id || String(commission.leadId || '') === String(referral.leadId || ''));
      return { id: referral.id, lead, referral, commissions: relatedCommissions };
    });
    const orphanCommissions = commissions
      .filter((commission) => !referralMap.has(String(commission.referralId || commission.referralRef || '')))
      .map((commission) => ({ id: `commission-${commission.id}`, lead: leadMap.get(String(commission.leadId || '')) || null, referral: null, commissions: [commission] }));
    return [...referralChains, ...orphanCommissions];
  }, [leads, referrals, commissions]);

  const locked = chains.filter((chain) => chain.commissions.some((commission) => commission.attributionLocked || String(commission.status || '').toUpperCase().includes('APPROVED') || String(commission.status || '').toUpperCase().includes('PAID'))).length;
  const missingLead = chains.filter((chain) => !chain.lead).length;
  const missingReferral = chains.filter((chain) => !chain.referral).length;
  const withCommission = chains.filter((chain) => chain.commissions.length > 0).length;

  return (
    <Box>
      <Stack spacing={3}>
        <Box>
          <Typography variant="overline" sx={{ color: gold, fontWeight: 950, letterSpacing: 3 }}>BROKER ATTRIBUTION PROOF</Typography>
          <Typography variant="h3" sx={{ color: '#111827', fontWeight: 950, mt: 1 }}>Referral → Contract → Commission Chain</Typography>
          <Typography sx={{ color: '#667085', mt: 1, fontWeight: 700 }}>Verify whether broker leads, referrals, owner/property links, contracts, and commission records are connected before payout.</Typography>
        </Box>
        {warning && <Alert severity="warning">{warning}</Alert>}
        <Grid container spacing={2}>
          {[{ label: 'Chains', value: chains.length, icon: <Link2 />, color: gold }, { label: 'Locked / paid', value: locked, icon: <ShieldCheck />, color: '#10b981' }, { label: 'With commission', value: withCommission, icon: <Wallet />, color: '#3b82f6' }, { label: 'Missing links', value: missingLead + missingReferral, icon: <FileText />, color: missingLead + missingReferral ? '#f59e0b' : '#10b981' }].map((card) => (
            <Grid item xs={12} sm={6} md={3} key={card.label}><Paper sx={{ p: 3, borderRadius: 4, border: `1px solid ${alpha(card.color, 0.24)}`, bgcolor: alpha(card.color, 0.06) }}><Box sx={{ color: card.color, mb: 1 }}>{card.icon}</Box><Typography variant="h4" sx={{ color: '#111827', fontWeight: 950 }}>{card.value}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 900 }}>{card.label.toUpperCase()}</Typography></Paper></Grid>
          ))}
        </Grid>
        <Stack spacing={2}>
          {chains.map((chain) => {
            const commission = chain.commissions[0];
            const commissionColor = statusColor(commission?.status || (commission?.attributionLocked ? 'LOCKED' : 'PENDING'));
            return (
              <Paper key={chain.id} sx={{ p: 3, borderRadius: 5, border: `1px solid ${alpha(commissionColor, 0.22)}`, bgcolor: '#fff' }}>
                <Grid container spacing={2} alignItems="stretch">
                  <Grid item xs={12} md={4}><Stack spacing={1}><Typography variant="overline" sx={{ color: gold, fontWeight: 950 }}>1. Lead Source</Typography><Typography sx={{ color: '#111827', fontWeight: 950 }}>{chain.lead?.clientName || chain.lead?.ownerName || chain.referral?.clientName || 'Lead not linked'}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 800 }}>{chain.lead?.phone || chain.lead?.email || chain.referral?.clientEmail || 'Contact pending'}</Typography><Chip size="small" label={chain.lead ? 'LEAD LINKED' : 'MISSING LEAD'} sx={{ width: 'fit-content', bgcolor: alpha(chain.lead ? '#10b981' : '#f59e0b', 0.12), color: chain.lead ? '#10b981' : '#f59e0b', fontWeight: 950 }} /></Stack></Grid>
                  <Grid item xs={12} md={4}><Stack spacing={1}><Typography variant="overline" sx={{ color: gold, fontWeight: 950 }}>2. Referral / Contract</Typography><Typography sx={{ color: '#111827', fontWeight: 950 }}>{chain.referral?.propertyName || chain.referral?.propertyId || commission?.propertyName || 'Property pending'}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 800 }}>Contract: {chain.referral?.contractId || commission?.contractId || 'Not linked yet'}</Typography><Chip size="small" label={chain.referral ? String(chain.referral.status || 'SUBMITTED').replace(/_/g, ' ').toUpperCase() : 'NO REFERRAL'} sx={{ width: 'fit-content', bgcolor: alpha(statusColor(chain.referral?.status), 0.12), color: statusColor(chain.referral?.status), fontWeight: 950 }} /></Stack></Grid>
                  <Grid item xs={12} md={4}><Stack spacing={1}><Typography variant="overline" sx={{ color: gold, fontWeight: 950 }}>3. Commission Proof</Typography><Typography sx={{ color: '#111827', fontWeight: 950 }}>{money(commission?.amount || commission?.commissionAmount)}</Typography><Typography variant="caption" sx={{ color: '#667085', fontWeight: 800 }}>Source: {commission?.sourceContractId || commission?.contractId || chain.referral?.contractId || 'Pending contract source'}</Typography><Chip size="small" icon={(commission?.attributionLocked || String(commission?.status || '').toUpperCase().includes('PAID')) ? <CheckCircle2 size={14} /> : undefined} label={commission ? String(commission.status || (commission.attributionLocked ? 'LOCKED' : 'PENDING')).replace(/_/g, ' ').toUpperCase() : 'NO COMMISSION'} sx={{ width: 'fit-content', bgcolor: alpha(commissionColor, 0.12), color: commissionColor, fontWeight: 950 }} /></Stack></Grid>
                </Grid>
                <Divider sx={{ my: 2 }} />
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap><Chip size="small" label={`Referral ID: ${chain.referral?.id || 'missing'}`} /><Chip size="small" label={`Lead ID: ${chain.lead?.id || chain.referral?.leadId || 'missing'}`} /><Chip size="small" label={`Commission IDs: ${chain.commissions.map((item) => item.id).join(', ') || 'missing'}`} /><Button endIcon={<ArrowRight size={14} />} onClick={() => navigate('/broker/commissions')} sx={{ ml: 'auto', color: gold, fontWeight: 950 }}>Open commissions</Button></Stack>
              </Paper>
            );
          })}
          {chains.length === 0 && <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 5, border: `1px dashed ${alpha(gold, 0.28)}` }}><Briefcase size={44} color={gold} style={{ margin: '0 auto 12px' }} /><Typography sx={{ color: '#111827', fontWeight: 950 }}>No attribution chains yet</Typography><Typography sx={{ color: '#667085', mt: 1 }}>Submit leads and referrals to build commission proof chains.</Typography></Paper>}
        </Stack>
      </Stack>
    </Box>
  );
}

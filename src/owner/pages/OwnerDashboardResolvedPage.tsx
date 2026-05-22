import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, CreditCard, FileText, Shield, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const ACTIVE_CONTRACT_STATUSES = new Set(['ACTIVE', 'READY_FOR_ACTIVATION', 'SIGNED']);
const ACTIVE_SIGNATURE_STATUSES = new Set(['ACTIVE', 'OWNER_SIGNED', 'SIGNED']);
const ACTIVE_TICKET_STATUSES = new Set(['OPEN', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'ESCALATED']);

type DashboardState = 'loading' | 'locked' | 'pending' | 'active';

type OwnerResolution = {
  state: DashboardState;
  profile: any;
  contract: any;
  ownerIds: string[];
  emails: string[];
  reason?: string;
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const canonicalEmail = (value: unknown) => {
  const email = normalizeEmail(value);
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
  return `${normalizedLocal}@${normalizedDomain}`;
};

const compact = (values: unknown[]) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
const emailVariants = (email: unknown) => compact([normalizeEmail(email), canonicalEmail(email)]);

const getSeconds = (value: any) => Number(value?.seconds || value?._seconds || 0);

const isActiveProfile = (profile: any) => {
  if (!profile) return false;
  const status = String(profile.status || '').trim().toUpperCase();
  const activationStatus = String(profile.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(profile.contractSignatureStatus || profile.signatureStatus || '').trim().toUpperCase();
  return profile.dashboardUnlocked === true ||
    profile.dashboardLocked === false && (profile.paymentVerified === true || profile.adminApproved === true) && !!(profile.activeContractId || profile.latestActivationContractId) ||
    status === 'ACTIVE' ||
    activationStatus === 'ACTIVE' ||
    ACTIVE_SIGNATURE_STATUSES.has(signatureStatus);
};

const isActiveContract = (contract: any) => {
  if (!contract) return false;
  const status = String(contract.status || '').trim().toUpperCase();
  const activationStatus = String(contract.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(contract.signatureStatus || contract.signatureState?.status || '').trim().toUpperCase();
  return contract.dashboardUnlocked === true ||
    contract.paymentVerified === true && (contract.ownerSigned === true || ACTIVE_CONTRACT_STATUSES.has(status) || ACTIVE_CONTRACT_STATUSES.has(activationStatus)) ||
    ACTIVE_CONTRACT_STATUSES.has(status) ||
    ACTIVE_CONTRACT_STATUSES.has(activationStatus) ||
    ACTIVE_SIGNATURE_STATUSES.has(signatureStatus);
};

const sortByRecent = (a: any, b: any) => getSeconds(b.updatedAt || b.createdAt) - getSeconds(a.updatedAt || a.createdAt);

async function getCollectionDocs(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function resolveOwner(user: any): Promise<OwnerResolution> {
  const authUid = String(user?.uid || '').trim();
  const authEmails = emailVariants(user?.email);
  const profiles: any[] = [];

  if (authUid) {
    const [userSnap, ownerSnap] = await Promise.all([
      getDoc(doc(db, 'users', authUid)),
      getDoc(doc(db, 'owners', authUid)),
    ]);
    if (userSnap.exists()) profiles.push({ id: userSnap.id, ...userSnap.data() });
    if (ownerSnap.exists()) profiles.push({ id: ownerSnap.id, ...ownerSnap.data() });
  }

  for (const email of authEmails) {
    profiles.push(...await getCollectionDocs('users', 'email', email));
    profiles.push(...await getCollectionDocs('owners', 'email', email));
  }

  const profile = profiles.sort((a, b) => Number(isActiveProfile(b)) - Number(isActiveProfile(a)) || sortByRecent(a, b))[0] || null;
  const emails = compact([
    ...authEmails,
    profile?.email,
    profile?.ownerEmail,
    ...(Array.isArray(profile?.linkedEmails) ? profile.linkedEmails : []),
  ]).flatMap(emailVariants);

  const ownerIds = compact([
    authUid,
    profile?.uid,
    profile?.ownerId,
    profile?.activeOwnerId,
    ...(Array.isArray(profile?.linkedOwnerIds) ? profile.linkedOwnerIds : []),
  ]);

  const contractIds = compact([
    profile?.activeContractId,
    profile?.latestActivationContractId,
    profile?.pendingContractId,
    profile?.contractId,
    profile?.latestContractId,
  ]);

  const contracts = new Map<string, any>();
  for (const contractId of contractIds) {
    const snap = await getDoc(doc(db, 'contracts', contractId));
    if (snap.exists()) contracts.set(snap.id, { id: snap.id, ...snap.data() });
  }
  for (const ownerId of ownerIds) {
    for (const c of await getCollectionDocs('contracts', 'ownerId', ownerId)) contracts.set(c.id, c);
    for (const c of await getCollectionDocs('contracts', 'ownerUid', ownerId)) contracts.set(c.id, c);
  }
  for (const email of emails) {
    for (const c of await getCollectionDocs('contracts', 'ownerEmail', email)) contracts.set(c.id, c);
    for (const c of await getCollectionDocs('contracts', 'emailDelivery.recipient', email)) contracts.set(c.id, c);
  }

  const contractList = Array.from(contracts.values()).sort((a, b) => Number(isActiveContract(b)) - Number(isActiveContract(a)) || sortByRecent(a, b));
  const contract = contractList[0] || null;
  const finalOwnerIds = compact([...ownerIds, contract?.ownerId, contract?.ownerUid]);
  const finalEmails = compact([...emails, contract?.ownerEmail, contract?.emailDelivery?.recipient]).flatMap(emailVariants);

  if (isActiveProfile(profile) || isActiveContract(contract)) {
    return { state: 'active', profile, contract, ownerIds: finalOwnerIds, emails: finalEmails };
  }
  if (profile || contract) return { state: 'pending', profile, contract, ownerIds: finalOwnerIds, emails: finalEmails, reason: 'Identity found, but activation flags are not complete.' };
  return { state: 'locked', profile, contract, ownerIds: finalOwnerIds, emails: finalEmails, reason: 'No owner profile or contract found for this login.' };
}

export default function OwnerDashboardResolvedPage() {
  const { user, refreshRole } = useRole();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [resolution, setResolution] = useState<OwnerResolution>({ state: 'loading', profile: null, contract: null, ownerIds: [], emails: [] });
  const [properties, setProperties] = useState<any[]>([]);
  const [tickets, setTickets] = useState(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      if (!user?.uid && !user?.email) {
        setResolution({ state: 'locked', profile: null, contract: null, ownerIds: [], emails: [], reason: 'Not signed in.' });
        return;
      }
      try {
        setLoadError('');
        const resolved = await resolveOwner(user);
        if (!alive) return;
        setResolution(resolved);

        if (resolved.state !== 'active') return;

        const propertyMap = new Map<string, any>();
        for (const ownerId of resolved.ownerIds) {
          for (const p of await getCollectionDocs('properties', 'ownerId', ownerId)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerId', ownerId)) propertyMap.set(p.propertyId || p.id, p);
        }
        for (const email of resolved.emails) {
          for (const p of await getCollectionDocs('properties', 'ownerEmail', email)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerEmail', email)) propertyMap.set(p.propertyId || p.id, p);
        }
        const linkedProperties = Array.from(propertyMap.values()).sort(sortByRecent);
        if (!alive) return;
        setProperties(linkedProperties);

        let openTickets = 0;
        for (const ownerId of resolved.ownerIds) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerId', ownerId)) {
            if (ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())) openTickets += 1;
          }
        }
        for (const email of resolved.emails) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerEmail', email)) {
            if (ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())) openTickets += 1;
          }
        }
        if (alive) setTickets(openTickets);
      } catch (err: any) {
        console.error('[OwnerDashboardResolved] load failed:', err);
        if (alive) {
          setLoadError(err?.message || 'Dashboard identity resolution failed.');
          setResolution((prev) => ({ ...prev, state: 'pending' }));
        }
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.uid, user?.email]);

  const stats = useMemo(() => {
    const units = properties.reduce((sum, p) => sum + Number(p.units || p.numberOfUnits || p.totalUnits || 0), 0);
    const rent = properties.reduce((sum, p) => sum + Number(p.rentCollectedTotal || 0), 0);
    const maintenance = properties.reduce((sum, p) => sum + Number(p.maintenanceCostTotal || 0), 0);
    return { units, rent, maintenance, net: rent * 0.92 };
  }, [properties]);

  if (resolution.state === 'loading') {
    return <Box sx={{ height: '70vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  if (resolution.state !== 'active') {
    const contractId = resolution.contract?.id || resolution.profile?.activeContractId || resolution.profile?.latestActivationContractId;
    return (
      <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Paper sx={{ p: { xs: 3, md: 6 }, maxWidth: 720, bgcolor: 'rgba(22,22,24,.82)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 6, textAlign: 'center' }}>
          <Shield size={58} color={binThemeTokens.gold} style={{ margin: '0 auto 20px' }} />
          <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 2 }}>
            {resolution.state === 'locked' ? 'Owner profile not linked yet' : 'Activation still requires final sync'}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.62)', mb: 3, lineHeight: 1.8 }}>
            {resolution.reason || 'Your profile was found, but the active contract/payment flags are not complete yet.'}
          </Typography>
          {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button variant="contained" onClick={() => navigate(contractId ? `/owner/contracts?contractId=${encodeURIComponent(contractId)}` : '/owner/contracts')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
              Review Contracts
            </Button>
            <Button variant="outlined" onClick={async () => { await refreshRole?.(); window.location.reload(); }} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>
              Refresh Identity
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const contract = resolution.contract || {};
  const annual = Number(contract.annualContractValue || contract.annualValue || 0);
  const mobilization = Number(contract.mobilizationAmount || contract.depositAmount || contract.paymentSchedule?.mobilizationAmount || 0);

  const KPI_CARDS = [
    { label: 'Annual Contract Value', value: annual ? `AED ${annual.toLocaleString()}` : 'Active', icon: <CreditCard size={20} />, color: binThemeTokens.gold },
    { label: '15% Mobilization', value: mobilization ? `AED ${mobilization.toLocaleString()}` : 'Verified', icon: <Shield size={20} />, color: '#10b981' },
    { label: t('dash.kpi.portfolio') || 'Asset Portfolio', value: properties.length, icon: <Building2 size={20} />, color: '#3b82f6' },
    { label: t('dash.kpi.ops_load') || 'Open Maintenance Tasks', value: tickets, icon: <Wrench size={20} />, color: '#ef4444' },
  ];

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}
      <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 2 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN OWNER TERMINAL</Typography>
          <Typography variant="h3" fontWeight={950} sx={{ color: '#fff', mt: 1 }}>Dashboard Active</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.55)', mt: 1 }}>Identity, contract signature, and payment verification are resolved through linked UID/email/contract records.</Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate(`/owner/contracts?contractId=${encodeURIComponent(contract.id || '')}`)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Contracts</Button>
          <Button variant="contained" onClick={() => navigate('/owner/property-passport')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Property Passport</Button>
        </Stack>
      </Box>

      <Grid container spacing={3} sx={{ mb: 5 }}>
        {KPI_CARDS.map((card, idx) => (
          <Grid item xs={12} sm={6} md={3} key={idx}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.42)', border: `1px solid ${alpha(card.color, .22)}`, borderRadius: 5 }}>
              <Box sx={{ color: card.color, mb: 2 }}>{card.icon}</Box>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff' }}>{card.value}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)', fontWeight: 900, letterSpacing: 1 }}>{card.label.toUpperCase()}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={4}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,.42)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 6 }}>
            <Typography variant="h6" fontWeight={950} sx={{ color: '#fff', mb: 3, display: 'flex', gap: 1.5, alignItems: 'center' }}><Building2 size={20} color={binThemeTokens.gold} /> ACTIVE ASSETS</Typography>
            {properties.length === 0 ? (
              <Box sx={{ py: 7, textAlign: 'center', color: 'rgba(255,255,255,.35)', fontWeight: 900 }}>NO LINKED PROPERTIES FOUND YET</Box>
            ) : (
              <Grid container spacing={2}>
                {properties.slice(0, 6).map((property) => (
                  <Grid item xs={12} md={6} key={property.id || property.propertyId}>
                    <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.06)', borderRadius: 4 }}>
                      <Typography fontWeight={950} sx={{ color: '#fff' }}>{property.propertyName || property.name || property.address || 'Property'}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.48)' }}>{property.emirate || property.city || 'UAE'} · {property.units || property.numberOfUnits || property.totalUnits || 0} units</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, .035), border: `1px solid ${alpha(binThemeTokens.gold, .16)}`, borderRadius: 6 }}>
            <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.gold, mb: 2 }}><FileText size={18} /> Contract Resolution</Typography>
            <Stack spacing={1.2}>
              <Typography variant="body2" sx={{ color: '#fff' }}><b>Status:</b> {contract.status || contract.activationStatus || 'ACTIVE'}</Typography>
              <Typography variant="body2" sx={{ color: '#fff' }}><b>Owner ID:</b> {contract.ownerId || resolution.ownerIds[0] || 'linked'}</Typography>
              <Typography variant="body2" sx={{ color: '#fff' }}><b>Email:</b> {contract.ownerEmail || resolution.emails[0] || 'linked'}</Typography>
              <Typography variant="body2" sx={{ color: '#fff' }}><b>Package:</b> {contract.packageName || contract.planType || 'Active Service Agreement'}</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import { Building2, CreditCard, FileText, Lock, Shield, Users, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type DashboardState = 'loading' | 'locked' | 'pending' | 'active';

type OwnerIdentityResolution = {
  state: Exclude<DashboardState, 'loading'>;
  emails: string[];
  ownerIds: string[];
  activeContractIds: string[];
  activationSource: string;
  contracts: any[];
};

const ACTIVE_TICKET_STATUSES = new Set([
  'OPEN',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'ESCALATED',
]);

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const normalizeId = (value: unknown) => String(value || '').trim();
const unique = <T,>(values: T[]) => Array.from(new Set(values.filter(Boolean)));

const emailLookupCandidates = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return [];
  const [local, domain] = email.split('@');
  if (!local || !domain) return [email];
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const variants = new Set<string>([email, `${local}@${normalizedDomain}`]);
  if (normalizedDomain === 'gmail.com') {
    variants.add(`${local.split('+')[0].replace(/\./g, '')}@${normalizedDomain}`);
  }
  return Array.from(variants);
};

const idsFromProfile = (profile: any) => unique([
  normalizeId(profile?.uid),
  normalizeId(profile?.ownerUid),
  normalizeId(profile?.ownerId),
  normalizeId(profile?.authUid),
  ...((Array.isArray(profile?.linkedOwnerIds) ? profile.linkedOwnerIds : []) as unknown[]).map(normalizeId),
]);

const contractIdsFromProfile = (profile: any) => unique([
  normalizeId(profile?.activeContractId),
  normalizeId(profile?.latestActivationContractId),
  normalizeId(profile?.pendingContractId),
  normalizeId(profile?.contractId),
  normalizeId(profile?.latestContractId),
]);

const emailsFromProfile = (profile: any) => unique([
  ...emailLookupCandidates(profile?.email),
  ...emailLookupCandidates(profile?.ownerEmail),
  ...emailLookupCandidates(profile?.emailDelivery?.recipient),
]);

const hasTrustedActivation = (record: any) => {
  if (!record) return false;
  const status = String(record.status || '').toUpperCase();
  const activationStatus = String(record.activationStatus || '').toUpperCase();
  const signatureStatus = String(record.contractSignatureStatus || record.signatureStatus || record.signatureState?.status || '').toUpperCase();
  return record.dashboardUnlocked === true ||
    record.dashboardLocked === false && (status === 'ACTIVE' || activationStatus === 'ACTIVE') ||
    status === 'ACTIVE' ||
    activationStatus === 'ACTIVE' ||
    signatureStatus === 'ACTIVE' ||
    signatureStatus === 'OWNER_SIGNED';
};

const contractIsActive = (contract: any) => {
  const status = String(contract?.status || '').toUpperCase();
  const activationStatus = String(contract?.activationStatus || '').toUpperCase();
  const signatureStatus = String(contract?.contractSignatureStatus || contract?.signatureStatus || contract?.signatureState?.status || '').toUpperCase();
  return contract?.dashboardUnlocked === true ||
    status === 'ACTIVE' ||
    activationStatus === 'ACTIVE' ||
    signatureStatus === 'ACTIVE' ||
    signatureStatus === 'OWNER_SIGNED' ||
    contract?.ownerSigned === true;
};

async function safeCollectionQuery(collectionName: string, field: string, value: string) {
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerDashboard] ${collectionName}.${field} lookup failed`, error);
    return [] as any[];
  }
}

async function readProfileDoc(collectionName: 'users' | 'owners', id: string) {
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`[OwnerDashboard] ${collectionName}/${id} lookup failed`, error);
    return null;
  }
}

async function readDirectContract(contractId: string) {
  try {
    const snap = await getDoc(doc(db, 'contracts', contractId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`[OwnerDashboard] contracts/${contractId} lookup failed`, error);
    return null;
  }
}

function sortContracts(a: any, b: any) {
  const aActive = contractIsActive(a);
  const bActive = contractIsActive(b);
  if (aActive && !bActive) return -1;
  if (!aActive && bActive) return 1;
  const aTime = Number(a?.updatedAt?.seconds || a?.createdAt?.seconds || 0);
  const bTime = Number(b?.updatedAt?.seconds || b?.createdAt?.seconds || 0);
  return bTime - aTime;
}

async function resolveOwnerIdentity(profile: any): Promise<OwnerIdentityResolution> {
  const profileEmails = emailsFromProfile(profile);
  const profileOwnerIds = idsFromProfile(profile);
  const directContractIds = contractIdsFromProfile(profile);

  const profileDocs = (await Promise.all(
    profileOwnerIds.flatMap((ownerId) => [readProfileDoc('owners', ownerId), readProfileDoc('users', ownerId)])
  )).filter(Boolean) as any[];

  const emails = unique([
    ...profileEmails,
    ...profileDocs.flatMap((entry) => emailsFromProfile(entry)),
  ]);

  const ownerIds = unique([
    ...profileOwnerIds,
    ...profileDocs.flatMap(idsFromProfile),
  ]);

  const activeContractIds = unique([
    ...directContractIds,
    ...profileDocs.flatMap(contractIdsFromProfile),
  ]);

  const contractMap = new Map<string, any>();
  const addContracts = (items: any[]) => items.forEach((item) => item?.id && contractMap.set(item.id, item));

  const directContracts = (await Promise.all(activeContractIds.map(readDirectContract))).filter(Boolean) as any[];
  addContracts(directContracts);

  for (const ownerId of ownerIds) {
    addContracts(await safeCollectionQuery('contracts', 'ownerId', ownerId));
    addContracts(await safeCollectionQuery('contracts', 'ownerUid', ownerId));
  }

  for (const email of emails) {
    addContracts(await safeCollectionQuery('contracts', 'ownerEmail', email));
    addContracts(await safeCollectionQuery('contracts', 'emailDelivery.recipient', email));
    addContracts(await safeCollectionQuery('contracts', 'companyProfile.email', email));
  }

  const contracts = Array.from(contractMap.values()).sort(sortContracts);

  const trustedProfile = [profile, ...profileDocs].find(hasTrustedActivation);
  const trustedContract = contracts.find(contractIsActive);

  if (trustedProfile) {
    return {
      state: 'active',
      emails,
      ownerIds,
      activeContractIds,
      activationSource: `profile:${trustedProfile.id || trustedProfile.uid || 'auth-user'}`,
      contracts,
    };
  }

  if (trustedContract) {
    const contractEmails = unique([
      ...emails,
      ...emailLookupCandidates(trustedContract.ownerEmail),
      ...emailLookupCandidates(trustedContract.emailDelivery?.recipient),
      ...emailLookupCandidates(trustedContract.companyProfile?.email),
    ]);
    const contractOwnerIds = unique([
      ...ownerIds,
      normalizeId(trustedContract.ownerId),
      normalizeId(trustedContract.ownerUid),
      normalizeId(trustedContract.authUid),
      ...((Array.isArray(trustedContract.linkedOwnerIds) ? trustedContract.linkedOwnerIds : []) as unknown[]).map(normalizeId),
    ]);
    return {
      state: 'active',
      emails: contractEmails,
      ownerIds: contractOwnerIds,
      activeContractIds: unique([...activeContractIds, trustedContract.id]),
      activationSource: `contract:${trustedContract.id}`,
      contracts,
    };
  }

  return {
    state: contracts.length || profileDocs.length ? 'pending' : 'locked',
    emails,
    ownerIds,
    activeContractIds,
    activationSource: contracts.length ? 'contract-pending' : 'no-linked-record',
    contracts,
  };
}

async function loadPortfolioStats(identity: OwnerIdentityResolution) {
  const propertyMap = new Map<string, any>();
  const passportMap = new Map<string, any>();
  const ticketMap = new Map<string, any>();
  const bankMap = new Map<string, any>();

  const add = (target: Map<string, any>, rows: any[]) => rows.forEach((row) => row?.id && target.set(row.id, row));

  for (const ownerId of identity.ownerIds) {
    add(propertyMap, await safeCollectionQuery('properties', 'ownerId', ownerId));
    add(passportMap, await safeCollectionQuery('propertyPassports', 'ownerId', ownerId));
    add(ticketMap, await safeCollectionQuery('maintenanceTickets', 'ownerId', ownerId));
    add(bankMap, await safeCollectionQuery('ownerBankAccounts', 'ownerId', ownerId));
  }

  for (const email of identity.emails) {
    add(propertyMap, await safeCollectionQuery('properties', 'ownerEmail', email));
    add(passportMap, await safeCollectionQuery('propertyPassports', 'ownerEmail', email));
    add(ticketMap, await safeCollectionQuery('maintenanceTickets', 'ownerEmail', email));
    add(bankMap, await safeCollectionQuery('ownerBankAccounts', 'ownerEmail', email));
  }

  const properties = Array.from(propertyMap.values());
  const passports = Array.from(passportMap.values());
  const tickets = Array.from(ticketMap.values());

  const unitsFromPassports = passports.reduce((total, item) => total + Number(item.totalUnits || item.units || item.unitCount || 0), 0);
  const unitsFromProperties = properties.reduce((total, item) => total + Number(item.unitsCount || item.numberOfUnits || item.units || 0), 0);
  const tenantCount = passports.reduce((total, item) => total + Number(item.occupiedUnits || item.activeTenants || 0), 0);
  const rentCollected = passports.reduce((total, item) => total + Number(item.rentCollectedTotal || 0), 0);
  const maintenanceCost = passports.reduce((total, item) => total + Number(item.maintenanceCostTotal || 0), 0);
  const openTickets = tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())).length;

  const activeContract = identity.contracts.find(contractIsActive) || identity.contracts[0];
  const contractScope = String(activeContract?.managementScope || activeContract?.contractType || activeContract?.planType || '').toUpperCase();
  const unitsMissingDetails = passports.some((item) => !Array.isArray(item.rentPerUnitTable) || item.rentPerUnitTable.length === 0);

  return {
    properties,
    stats: {
      properties: properties.length,
      units: unitsFromPassports || unitsFromProperties,
      tenants: tenantCount,
      tickets: openTickets,
      rentCollected,
      payoutsPending: rentCollected * 0.92,
      maintenanceCost,
    },
    missingInfo: { iban: bankMap.size === 0, units: unitsMissingDetails },
    contractScope,
  };
}

export default function OwnerDashboardPageV2() {
  const { user } = useRole();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>('loading');
  const [activationSource, setActivationSource] = useState('');
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState({ properties: 0, units: 0, tenants: 0, tickets: 0, rentCollected: 0, payoutsPending: 0, maintenanceCost: 0 });
  const [properties, setProperties] = useState<any[]>([]);
  const [missingInfo, setMissingInfo] = useState({ iban: false, units: false });
  const [contractScope, setContractScope] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      if (!user?.uid && !user?.email) {
        setState('locked');
        return;
      }

      setState('loading');
      setLoadError('');
      try {
        const identity = await resolveOwnerIdentity(user);
        if (cancelled) return;
        setActivationSource(identity.activationSource);
        setState(identity.state);

        if (identity.state !== 'active') return;

        const portfolio = await loadPortfolioStats(identity);
        if (cancelled) return;
        setStats(portfolio.stats);
        setProperties(portfolio.properties);
        setMissingInfo(portfolio.missingInfo);
        setContractScope(portfolio.contractScope);
      } catch (error: any) {
        console.error('[OwnerDashboard] hardened identity load failed:', error);
        if (!cancelled) {
          setLoadError(error?.message || 'Dashboard identity could not be resolved.');
          setState('locked');
        }
      }
    }

    loadDashboard();
    return () => { cancelled = true; };
  }, [user]);

  const kpis = useMemo(() => [
    { label: 'Total Revenue', value: `AED ${stats.rentCollected.toLocaleString()}`, icon: <CreditCard size={20} />, color: '#10b981', sub: 'Gross rent / portfolio revenue' },
    { label: 'Net Payout', value: `AED ${stats.payoutsPending.toLocaleString()}`, icon: <Shield size={20} />, color: binThemeTokens.gold, sub: 'Estimated owner settlement' },
    { label: 'Asset Portfolio', value: stats.properties, icon: <Building2 size={20} />, color: '#3b82f6', sub: `${stats.units} units` },
    { label: 'Open Maintenance', value: stats.tickets, icon: <Wrench size={20} />, color: '#ef4444', sub: 'Active operational tickets' },
  ], [stats]);

  if (state === 'loading') {
    return (
      <Box sx={{ height: '70vh', display: 'grid', placeItems: 'center' }}>
        <Stack spacing={2} alignItems="center">
          <CircularProgress sx={{ color: binThemeTokens.gold }} />
          <Typography variant="overline" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 3 }}>Resolving owner identity...</Typography>
        </Stack>
      </Box>
    );
  }

  if (state !== 'active') {
    return (
      <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Paper sx={{ p: 5, maxWidth: 620, bgcolor: 'rgba(22,22,24,0.86)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, textAlign: 'center' }}>
          {state === 'pending' ? <FileText size={58} color={binThemeTokens.gold} /> : <Lock size={58} color="#ef4444" />}
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 3, mb: 1 }}>
            {state === 'pending' ? 'Onboarding Submitted' : 'Dashboard Locked'}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.8, mb: 3 }}>
            {state === 'pending'
              ? 'Your owner profile or contract exists, but the dashboard could not find a trusted activation source yet.'
              : 'No active owner profile, signed contract, or linked activation record was found for this login.'}
          </Typography>
          {loadError && <Alert severity="error" sx={{ mb: 2 }}>{loadError}</Alert>}
          <Alert severity="info" sx={{ mb: 3, textAlign: 'left', bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
            Resolver source: {activationSource || 'none'}
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button variant="contained" onClick={() => navigate('/owner/contracts')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>
              Review Contracts
            </Button>
            <Button variant="outlined" onClick={() => navigate('/owner/activation')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>
              Activation / Payment
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const requiresPMData = ['PM_ONLY', 'BOTH', 'HYBRID'].includes(contractScope);

  return (
    <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      {loadError && <Alert severity="error" sx={{ mb: 3 }}>{loadError}</Alert>}
      <Alert severity="success" sx={{ mb: 4, bgcolor: alpha('#10b981', 0.08), color: '#d1fae5', border: `1px solid ${alpha('#10b981', 0.24)}` }}>
        Dashboard unlocked by trusted identity resolver: {activationSource}
      </Alert>

      {requiresPMData && (missingInfo.iban || missingInfo.units) && (
        <Alert severity="warning" sx={{ mb: 4, bgcolor: alpha('#f59e0b', 0.1), color: '#fbbf24', border: `1px solid ${alpha('#f59e0b', 0.25)}` }}>
          PM contract data incomplete: {missingInfo.iban ? 'IBAN missing. ' : ''}{missingInfo.units ? 'Unit rent table missing.' : ''}
        </Alert>
      )}

      <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 3, flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' } }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>{t('dash.terminal.owner') || 'SOVEREIGN OWNER TERMINAL'}</Typography>
          <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>Hello, {user?.displayName?.split(' ')[0] || 'Partner'}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)', mt: 1 }}>Identity-safe owner dashboard with contract, email, and linked-owner fallback resolution.</Typography>
        </Box>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate('/owner/contracts')} sx={{ borderColor: alpha(binThemeTokens.gold, 0.4), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>Contracts</Button>
          <Button variant="contained" onClick={() => navigate('/owner/roi')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3 }}>Portfolio ROI</Button>
        </Stack>
      </Box>

      <Grid container spacing={3} sx={{ mb: 5 }}>
        {kpis.map((kpi) => (
          <Grid item xs={12} sm={6} md={3} key={kpi.label}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.48)', border: `1px solid ${alpha(kpi.color, 0.22)}`, borderRadius: 5 }}>
              <Box sx={{ color: kpi.color, mb: 2 }}>{kpi.icon}</Box>
              <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{kpi.value}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.42)', fontWeight: 900, letterSpacing: 1 }}>{kpi.label.toUpperCase()}</Typography>
              <Typography variant="caption" sx={{ display: 'block', color: alpha(kpi.color, 0.86), mt: 1, fontWeight: 800 }}>{kpi.sub}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={4}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ bgcolor: 'rgba(15,23,42,0.48)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>ACTIVE ASSETS</Typography>
              <Chip label={`${properties.length} linked`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} />
            </Box>
            <Box sx={{ p: 3 }}>
              {properties.length === 0 ? (
                <Box sx={{ py: 8, textAlign: 'center' }}>
                  <Building2 size={48} color="rgba(255,255,255,0.12)" />
                  <Typography sx={{ color: 'rgba(255,255,255,0.32)', mt: 2, fontWeight: 900 }}>Dashboard active, but no properties are linked yet.</Typography>
                  <Button onClick={() => navigate('/owner/property-passport')} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 950 }}>Open Property Passport</Button>
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {properties.slice(0, 6).map((property) => (
                    <Grid item xs={12} md={6} key={property.id}>
                      <Paper sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF' }}>{property.propertyName || property.name || 'Property'}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{property.emirate || property.location || 'UAE'} · {property.units || property.numberOfUnits || property.unitsCount || 0} units</Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
            <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>IDENTITY RESOLUTION FIX</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.56)', lineHeight: 1.8 }}>
              This dashboard no longer depends only on Firebase Auth UID. It resolves activation through owners, users, contracts, activeContractId, latestActivationContractId, ownerEmail, emailDelivery.recipient, ownerId, and linked owner IDs.
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 3 }}>
              <Button fullWidth variant="outlined" onClick={() => navigate('/owner/contracts')} sx={{ borderColor: alpha(binThemeTokens.gold, 0.4), color: binThemeTokens.gold, fontWeight: 950, borderRadius: 3 }}>Contracts</Button>
              <Button fullWidth variant="outlined" onClick={() => navigate('/owner/property-passport')} sx={{ borderColor: 'rgba(255,255,255,0.14)', color: '#FFF', fontWeight: 900, borderRadius: 3 }}>Property Passport</Button>
              <Button fullWidth variant="outlined" onClick={() => navigate('/owner/iban')} sx={{ borderColor: 'rgba(255,255,255,0.14)', color: '#FFF', fontWeight: 900, borderRadius: 3 }}>IBAN / Payout</Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

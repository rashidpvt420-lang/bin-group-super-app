<<<<<<< HEAD
import React from 'react';
import {
    Box, Typography, Grid, Paper, Stack, Button, IconButton, alpha
} from '@mui/material';
import {
    Building2, FileText, ChevronRight, Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerExecutiveDashboardSection from '../components/OwnerExecutiveDashboardSection';

interface OwnerDashboardResolvedPageProps {
    user: any;
    t: (key: string) => string;
    isRTL: boolean;
    properties: any[];
    stats: any;
    contractScope: string;
    missingInfo: any;
}

export default function OwnerDashboardResolvedPage({
    user,
    t,
    isRTL,
    properties,
    stats,
    contractScope,
    missingInfo
}: OwnerDashboardResolvedPageProps) {
    const navigate = useNavigate();

    return (
        <Box sx={{ pb: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
            
            {/* 1. DASHBOARD ACTIVE HEADER */}
            <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 3 }}>
                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>
                        {t('dash.terminal.owner') || 'SOVEREIGN OWNER TERMINAL · ACTIVE'}
                    </Typography>
                    <Typography variant="h3" fontWeight="950" sx={{ color: '#FFF', mt: 1, letterSpacing: -1 }}>
                        {t('dash.hello') || 'Hello'}, {user?.displayName?.split(' ')[0] || 'Partner'}
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', mt: 0.5 }}>
                        UAE Owner Control Room: Real-time asset oversight.
                    </Typography>
                </Box>
                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2}>
                    <Button 
                        variant="contained" 
                        startIcon={<Sparkles size={16} />} 
                        onClick={() => navigate('/design-studio')}
                        sx={{ bgcolor: '#FFF', color: '#000', fontWeight: 900, px: 3, borderRadius: 3, '&:hover': { bgcolor: '#e2e2e2' } }}
                    >
                        {t('nav.ai_studio') || 'AI Studio'}
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={() => navigate('/owner/roi')} 
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, px: 3, borderRadius: 3 }}
                    >
                        {t('dash.portfolio_roi') || 'Portfolio ROI'}
                    </Button>
                </Stack>
            </Box>

            {/* 2-3. FINANCIAL CONTROL & PORTFOLIO HEALTH (Handled within Executive Section) */}
            {/* 5-7-8-10. TENANT REGISTRY, MAJLIS, OPERATIONS/SLA, COMPLIANCE, ACTION ITEMS */}
            <OwnerExecutiveDashboardSection 
                properties={properties}
                stats={stats}
                contractScope={contractScope}
                missingInfo={missingInfo}
                user={user}
            />

            <Grid container spacing={4} sx={{ mt: 2 }}>
                <Grid item xs={12} lg={8}>
                    
                    {/* 4. ACTIVE ASSETS */}
                    <Paper sx={{ p: 0, bgcolor: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, overflow: 'hidden', mb: 4 }}>
                        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                <Building2 size={20} color={binThemeTokens.gold} /> {t('dash.active_assets') || 'ACTIVE ASSETS'}
                            </Typography>
                            <Button 
                                size="small" 
                                sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }} 
                                onClick={() => navigate('/owner/properties')}
                            >
                                {t('common.view_all') || 'View All'}
                            </Button>
                        </Box>
                        <Box sx={{ p: 3 }}>
                            {properties.length === 0 ? (
                                <Box sx={{ py: 6, textAlign: 'center' }}>
                                    <Building2 size={48} color="rgba(255,255,255,0.05)" style={{ margin: '0 auto 16px' }} />
                                    <Typography sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>{t('dash.no_properties') || 'NO PROPERTIES LINKED'}</Typography>
                                </Box>
                            ) : (
                                <Grid container spacing={2.5}>
                                    {properties.map(prop => (
                                        <Grid item xs={12} md={6} key={prop.id}>
                                            <Paper 
                                                onClick={() => navigate(`/owner/property-passport/${prop.id}`)}
                                                sx={{ 
                                                    p: 2.5, 
                                                    bgcolor: 'rgba(255,255,255,0.02)', 
                                                    border: '1px solid rgba(255,255,255,0.05)', 
                                                    borderRadius: 4, 
                                                    cursor: 'pointer', 
                                                    transition: 'all 0.3s ease',
                                                    '&:hover': { 
                                                        bgcolor: 'rgba(255,255,255,0.04)',
                                                        borderColor: alpha(binThemeTokens.gold, 0.35)
                                                    } 
                                                }}
                                            >
                                                <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2} alignItems="center">
                                                    <Box sx={{ width: 48, height: 48, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <Building2 size={24} color={binThemeTokens.gold} />
                                                    </Box>
                                                    <Box sx={{ flex: 1, textAlign: isRTL ? 'right' : 'left' }}>
                                                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#FFF' }}>
                                                            {prop.propertyName || prop.name || 'Property'}
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 0.5 }}>
                                                            {prop.emirate || prop.location || 'UAE'} · {prop.units || 0} units
                                                        </Typography>
                                                        <Typography variant="caption" sx={{ color: binThemeTokens.gold, display: 'block', mt: 0.5, fontSize: '0.65rem', fontWeight: 900 }}>
                                                            Source: {prop.source ? String(prop.source).toUpperCase().replace('_', ' ') : 'OFFICIAL RECORD'}
                                                        </Typography>
                                                    </Box>
                                                    <IconButton size="small" sx={{ color: 'rgba(255,255,255,0.2)' }}>
                                                        <ChevronRight size={18} style={{ transform: isRTL ? 'rotate(180deg)' : 'none' }} />
                                                    </IconButton>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            )}
                        </Box>
                    </Paper>
                </Grid>

                <Grid item xs={12} lg={4}>
                    
                    {/* 9. PROPERTY PASSPORTS QUICK ACCESS */}
                    <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 6, mb: 4 }}>
                        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, display: 'block', mb: 3, textAlign: isRTL ? 'right' : 'left' }}>
                            PROPERTY PASSPORTS
                        </Typography>
                        <Stack spacing={2}>
                            {properties.slice(0, 3).map((prop, idx) => (
                                <Button
                                    key={idx}
                                    fullWidth
                                    variant="outlined"
                                    onClick={() => navigate(`/owner/property-passport/${prop.id}`)}
                                    sx={{
                                        justifyContent: 'space-between',
                                        px: 2,
                                        py: 1.5,
                                        borderRadius: 3.5,
                                        borderColor: 'rgba(255,255,255,0.05)',
                                        '&:hover': {
                                            borderColor: binThemeTokens.gold,
                                            bgcolor: alpha(binThemeTokens.gold, 0.02)
                                        }
                                    }}
                                >
                                    <Stack direction="row" spacing={1.5} alignItems="center">
                                        <FileText size={16} color={binThemeTokens.gold} />
                                        <Typography variant="caption" fontWeight="950" sx={{ color: '#FFF' }}>
                                            {String(prop.propertyName || prop.name || 'Passport').toUpperCase()}
                                        </Typography>
                                    </Stack>
                                    <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
                                </Button>
                            ))}
                            <Button 
                                fullWidth
                                variant="contained"
                                onClick={() => navigate('/owner/property-passport')}
                                sx={{ mt: 1 }}
                            >
                                Open Passport Registry
                            </Button>
                        </Stack>
                    </Paper>

                    {/* Sovereignty Info Panel */}
                    <Paper sx={{ p: 3, bgcolor: alpha(binThemeTokens.gold, 0.03), border: `1px solid ${alpha(binThemeTokens.gold, 0.15)}`, borderRadius: 6, textAlign: isRTL ? 'right' : 'left' }}>
                        <Typography variant="subtitle2" fontWeight="950" sx={{ color: binThemeTokens.gold, mb: 1 }}>
                            UAE DATA SOVEREIGNTY
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, display: 'block' }}>
                            Your control room operates strictly in compliance with UAE cybersecurity frameworks, protecting local assets and transaction ledgers.
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
=======
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, CreditCard, FileText, Shield, Wrench } from 'lucide-react';
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

const isPermissionDenied = (err: any) => String(err?.code || err?.message || '').toLowerCase().includes('permission');

const isActiveProfile = (profile: any) => {
  if (!profile) return false;
  const status = String(profile.status || '').trim().toUpperCase();
  const activationStatus = String(profile.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(profile.contractSignatureStatus || profile.signatureStatus || '').trim().toUpperCase();
  return profile.dashboardUnlocked === true ||
    (profile.dashboardLocked === false && (profile.paymentVerified === true || profile.adminApproved === true) && !!(profile.activeContractId || profile.latestActivationContractId)) ||
    status === 'ACTIVE' ||
    activationStatus === 'ACTIVE' ||
    ACTIVE_SIGNATURE_STATUSES.has(signatureStatus);
};

const isActiveContract = (contract: any) => {
  if (!contract) return false;
  const status = String(contract.status || '').trim().toUpperCase();
  const contractStatus = String(contract.contractStatus || '').trim().toUpperCase();
  const activationStatus = String(contract.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(contract.signatureStatus || contract.signatureState?.status || '').trim().toUpperCase();
  return contract.dashboardUnlocked === true ||
    (contract.paymentVerified === true && (contract.ownerSigned === true || ACTIVE_CONTRACT_STATUSES.has(status) || ACTIVE_CONTRACT_STATUSES.has(activationStatus))) ||
    ACTIVE_CONTRACT_STATUSES.has(status) ||
    ACTIVE_CONTRACT_STATUSES.has(contractStatus) ||
    ACTIVE_CONTRACT_STATUSES.has(activationStatus) ||
    ACTIVE_SIGNATURE_STATUSES.has(signatureStatus);
};

const sortByRecent = (a: any, b: any) => getSeconds(b.updatedAt || b.createdAt) - getSeconds(a.updatedAt || a.createdAt);

async function safeGetDocument(collectionName: string, id: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    if (!isPermissionDenied(err)) console.warn(`[OwnerDashboardResolved] ${collectionName}/${id} read failed:`, err);
    return null;
  }
}

async function getCollectionDocs(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(`[OwnerDashboardResolved] Skipped ${collectionName}.${field} == ${value}:`, err);
    return [] as any[];
  }
}

function contractPropertyRows(contract: any) {
  const rows = Array.isArray(contract?.properties) ? contract.properties : [];
  return rows.map((property: any, index: number) => ({
    id: property?.propertyId || property?.id || `contract-property-${index + 1}`,
    propertyId: property?.propertyId || property?.id || `contract-property-${index + 1}`,
    ...property,
  }));
}

async function resolveOwner(user: any): Promise<OwnerResolution> {
  const authUid = String(user?.uid || '').trim();
  const authEmail = normalizeEmail(user?.email);
  const profiles: any[] = [];

  if (authUid) {
    const [userProfile, ownerProfile] = await Promise.all([
      safeGetDocument('users', authUid),
      safeGetDocument('owners', authUid),
    ]);
    if (userProfile) profiles.push(userProfile);
    if (ownerProfile) profiles.push(ownerProfile);
  }

  const profile = profiles.sort((a, b) => Number(isActiveProfile(b)) - Number(isActiveProfile(a)) || sortByRecent(a, b))[0] || null;

  const trustedEmails = compact([
    authEmail,
    normalizeEmail(profile?.email),
    normalizeEmail(profile?.ownerEmail),
    ...(Array.isArray(profile?.linkedEmails) ? profile.linkedEmails.map(normalizeEmail) : []),
  ]);

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
    const contract = await safeGetDocument('contracts', contractId);
    if (contract) contracts.set(contract.id, contract);
  }

  if (authUid) {
    for (const c of await getCollectionDocs('contracts', 'ownerId', authUid)) contracts.set(c.id, c);
    for (const c of await getCollectionDocs('contracts', 'ownerUid', authUid)) contracts.set(c.id, c);
  }

  for (const email of trustedEmails) {
    for (const c of await getCollectionDocs('contracts', 'ownerEmail', email)) contracts.set(c.id, c);
    for (const c of await getCollectionDocs('contracts', 'emailDelivery.recipient', email)) contracts.set(c.id, c);
  }

  const contractList = Array.from(contracts.values()).sort((a, b) => Number(isActiveContract(b)) - Number(isActiveContract(a)) || sortByRecent(a, b));
  const contract = contractList[0] || null;
  const finalOwnerIds = compact([...ownerIds, contract?.ownerId, contract?.ownerUid]);
  const finalEmails = compact([
    ...trustedEmails,
    normalizeEmail(contract?.ownerEmail),
    normalizeEmail(contract?.emailDelivery?.recipient),
  ]).flatMap(emailVariants);

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
        contractPropertyRows(resolved.contract).forEach((property: any) => propertyMap.set(property.propertyId || property.id, property));

        const authUid = String(user?.uid || '').trim();
        if (authUid) {
          for (const p of await getCollectionDocs('properties', 'ownerId', authUid)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('properties', 'ownerUid', authUid)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerId', authUid)) propertyMap.set(p.propertyId || p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerUid', authUid)) propertyMap.set(p.propertyId || p.id, p);
        }

        const exactEmails = compact([
          normalizeEmail(user?.email),
          normalizeEmail(resolved.profile?.email),
          normalizeEmail(resolved.profile?.ownerEmail),
          normalizeEmail(resolved.contract?.ownerEmail),
          normalizeEmail(resolved.contract?.emailDelivery?.recipient),
        ]);
        for (const email of exactEmails) {
          for (const p of await getCollectionDocs('properties', 'ownerEmail', email)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerEmail', email)) propertyMap.set(p.propertyId || p.id, p);
        }

        const linkedProperties = Array.from(propertyMap.values()).sort(sortByRecent);
        if (!alive) return;
        setProperties(linkedProperties);

        const ticketMap = new Map<string, any>();
        if (authUid) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerId', authUid)) ticketMap.set(ticket.id, ticket);
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerUid', authUid)) ticketMap.set(ticket.id, ticket);
        }
        for (const email of exactEmails) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerEmail', email)) ticketMap.set(ticket.id, ticket);
        }
        const openTickets = Array.from(ticketMap.values()).filter((ticket) => ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())).length;
        if (alive) setTickets(openTickets);
      } catch (err: any) {
        console.error('[OwnerDashboardResolved] load failed:', err);
        if (alive) {
          setLoadError(err?.message || 'Dashboard identity resolution failed.');
          setResolution((prev) => ({ ...prev, state: prev.state === 'active' ? 'active' : 'pending' }));
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
>>>>>>> origin/main
}

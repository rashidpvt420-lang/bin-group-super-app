import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, CreditCard, Shield, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import OwnerExecutiveDashboardSection from '../components/OwnerExecutiveDashboardSection';
import OwnerRoiFinancialSection from '../components/OwnerRoiFinancialSection';
import OwnerAuthorizedReportersSection from '../components/OwnerAuthorizedReportersSection';
import OwnerComplaintCommandCenter from '../components/OwnerComplaintCommandCenter';
import OwnerContractIntelligenceSection from '../components/OwnerContractIntelligenceSection';
import OwnerContractModeMatrix from '../components/OwnerContractModeMatrix';
import { resolveOwnerFinancials } from '../utils/ownerFinancialResolver';
import { resolveOwnerComplaint } from '../utils/ownerComplaintResolver';
import { resolvePropertyReporter } from '../utils/ownerReporterResolver';
import { detectContractMode, canSeeMaintenance, canSeePropertyManagement } from '../utils/ownerServiceMode';
import { resolveTenantLedger } from '../utils/ownerTenantLedgerResolver';

const ACTIVE_CONTRACT_STATUSES = new Set(['ACTIVE', 'SIGNED']);
const ACTIVE_SIGNATURE_STATUSES = new Set(['ACTIVE', 'SIGNED']);
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
const makeInviteCode = () => `BIN-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Date.now().toString().slice(-5)}`;

const isActiveProfile = (profile: any) => {
  if (!profile) return false;
  const status = String(profile.status || '').trim().toUpperCase();
  const activationStatus = String(profile.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(profile.contractSignatureStatus || profile.signatureStatus || '').trim().toUpperCase();
  const verified = profile.paymentVerified === true;
  const linkedContract = !!(profile.activeContractId || profile.latestActivationContractId);

  return verified && (
    profile.dashboardUnlocked === true ||
    (profile.dashboardLocked === false && linkedContract) ||
    (linkedContract && (status === 'ACTIVE' || activationStatus === 'ACTIVE' || ACTIVE_SIGNATURE_STATUSES.has(signatureStatus)))
  );
};

const isActiveContract = (contract: any) => {
  if (!contract) return false;
  const status = String(contract.status || '').trim().toUpperCase();
  const contractStatus = String(contract.contractStatus || '').trim().toUpperCase();
  const activationStatus = String(contract.activationStatus || '').trim().toUpperCase();
  const signatureStatus = String(contract.signatureStatus || contract.signatureState?.status || '').trim().toUpperCase();
  const verified = contract.paymentVerified === true;

  return verified && (
    contract.dashboardUnlocked === true ||
    contract.ownerSigned === true ||
    ACTIVE_CONTRACT_STATUSES.has(status) ||
    ACTIVE_CONTRACT_STATUSES.has(contractStatus) ||
    ACTIVE_CONTRACT_STATUSES.has(activationStatus) ||
    ACTIVE_SIGNATURE_STATUSES.has(signatureStatus)
  );
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

function propertyUnits(property: any) {
  return Number(property?.units || property?.numberOfUnits || property?.totalUnits || property?.unitsCount || 0);
}

function isPlaceholderProperty(property: any) {
  const name = String(property?.propertyName || property?.name || property?.address || '').trim().toLowerCase();
  const floors = Number(property?.floors || property?.numberOfFloors || 0);
  const rooms = Number(property?.rooms || property?.roomCount || property?.numberOfRooms || property?.majlisRooms || 0);
  const halls = Number(property?.halls || property?.hallCount || property?.numberOfHalls || property?.majlisHalls || 0);
  const isDefaultName = !name || name === 'new asset' || name === 'property' || name.includes('draft') || name.includes('placeholder');
  return isDefaultName && propertyUnits(property) === 0 && floors === 0 && rooms === 0 && halls === 0;
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
  const trustedEmails = compact([authEmail, normalizeEmail(profile?.email), normalizeEmail(profile?.ownerEmail), ...(Array.isArray(profile?.linkedEmails) ? profile.linkedEmails.map(normalizeEmail) : [])]);
  const ownerIds = compact([authUid, profile?.uid, profile?.ownerId, profile?.activeOwnerId, ...(Array.isArray(profile?.linkedOwnerIds) ? profile.linkedOwnerIds : [])]);
  const contractIds = compact([profile?.activeContractId, profile?.latestActivationContractId, profile?.pendingContractId, profile?.contractId, profile?.latestContractId]);
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
  const finalEmails = compact([...trustedEmails, normalizeEmail(contract?.ownerEmail), normalizeEmail(contract?.emailDelivery?.recipient)]).flatMap(emailVariants);

  if (isActiveProfile(profile) || isActiveContract(contract)) return { state: 'active', profile, contract, ownerIds: finalOwnerIds, emails: finalEmails };
  if (profile || contract) return { state: 'pending', profile, contract, ownerIds: finalOwnerIds, emails: finalEmails, reason: 'Identity found, but verified activation flags are not complete yet.' };
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
  const [financials, setFinancials] = useState<any>(null);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [reporters, setReporters] = useState<any[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [tenantCount, setTenantCount] = useState(0);
  const [ledgerSummary, setLedgerSummary] = useState<any>(null);

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

        const exactEmails = compact([normalizeEmail(user?.email), normalizeEmail(resolved.profile?.email), normalizeEmail(resolved.profile?.ownerEmail), normalizeEmail(resolved.contract?.ownerEmail), normalizeEmail(resolved.contract?.emailDelivery?.recipient)]);
        for (const email of exactEmails) {
          for (const p of await getCollectionDocs('properties', 'ownerEmail', email)) propertyMap.set(p.id, p);
          for (const p of await getCollectionDocs('propertyPassports', 'ownerEmail', email)) propertyMap.set(p.propertyId || p.id, p);
        }

        let linkedProperties = Array.from(propertyMap.values());
        const realProperties = linkedProperties.filter((property) => !isPlaceholderProperty(property));
        if (realProperties.length > 0) linkedProperties = realProperties;
        linkedProperties.sort((a, b) => (propertyUnits(b) - propertyUnits(a)) || sortByRecent(a, b));
        if (!alive) return;
        setProperties(linkedProperties);

        const ticketMap = new Map<string, any>();
        const invoiceMap = new Map<string, any>();
        const paymentMap = new Map<string, any>();
        const reporterMap = new Map<string, any>();
        const occupancyMap = new Map<string, any>();
        const leaseMap = new Map<string, any>();
        const ledgerMap = new Map<string, any>();
        const invitationMap = new Map<string, any>();

        if (authUid) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerId', authUid)) ticketMap.set(ticket.id, ticket);
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerUid', authUid)) ticketMap.set(ticket.id, ticket);
          for (const inv of await getCollectionDocs('invoices', 'ownerUid', authUid)) invoiceMap.set(inv.id, inv);
          for (const pay of await getCollectionDocs('payment_transactions', 'ownerId', authUid)) paymentMap.set(pay.id, pay);
          for (const rep of await getCollectionDocs('propertyReporters', 'ownerId', authUid)) reporterMap.set(rep.id, rep);
          for (const rep of await getCollectionDocs('propertyReporters', 'ownerUid', authUid)) reporterMap.set(rep.id, rep);
          for (const occ of await getCollectionDocs('occupancies', 'ownerId', authUid)) occupancyMap.set(occ.id, occ);
          for (const occ of await getCollectionDocs('occupancies', 'ownerUid', authUid)) occupancyMap.set(occ.id, occ);
          for (const l of await getCollectionDocs('leases', 'ownerId', authUid)) leaseMap.set(l.id, l);
          for (const l of await getCollectionDocs('leases', 'ownerUid', authUid)) leaseMap.set(l.id, l);
          for (const led of await getCollectionDocs('tenant_ledger', 'ownerId', authUid)) ledgerMap.set(led.id, led);
          for (const led of await getCollectionDocs('tenant_ledger', 'ownerUid', authUid)) ledgerMap.set(led.id, led);
          for (const inv of await getCollectionDocs('tenantInvitations', 'ownerId', authUid)) invitationMap.set(inv.id, inv);
          for (const inv of await getCollectionDocs('tenantInvitations', 'ownerUid', authUid)) invitationMap.set(inv.id, inv);
        }

        for (const email of exactEmails) {
          for (const ticket of await getCollectionDocs('maintenanceTickets', 'ownerEmail', email)) ticketMap.set(ticket.id, ticket);
          for (const l of await getCollectionDocs('leases', 'ownerEmail', email)) leaseMap.set(l.id, l);
          for (const led of await getCollectionDocs('tenant_ledger', 'ownerEmail', email)) ledgerMap.set(led.id, led);
          for (const inv of await getCollectionDocs('tenantInvitations', 'ownerEmail', email)) invitationMap.set(inv.id, inv);
        }

        if (resolved.contract?.id) {
          for (const inv of await getCollectionDocs('invoices', 'contractId', resolved.contract.id)) invoiceMap.set(inv.id, inv);
          for (const pay of await getCollectionDocs('payment_transactions', 'contractId', resolved.contract.id)) paymentMap.set(pay.id, pay);
        }

        const allTickets = Array.from(ticketMap.values());
        const openTickets = allTickets.filter((ticket) => ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())).length;
        const resolvedComplaints = allTickets.map(resolveOwnerComplaint);
        const finData = resolveOwnerFinancials(resolved.contract, linkedProperties, Array.from(invoiceMap.values()), Array.from(paymentMap.values()), allTickets);
        const resolvedReporters = Array.from(reporterMap.values()).map(resolvePropertyReporter);
        const resolvedLedger = resolveTenantLedger(
          linkedProperties,
          Array.from(occupancyMap.values()),
          Array.from(invitationMap.values()),
          Array.from(leaseMap.values()),
          Array.from(ledgerMap.values()),
          Array.from(paymentMap.values())
        );

        if (alive) {
          setTickets(openTickets);
          setFinancials(finData);
          setComplaints(resolvedComplaints);
          setReporters(resolvedReporters);
          setLedgerSummary(resolvedLedger);
          setTenantCount(resolvedLedger.activeTenants);
          setLoadingExtras(false);
        }
      } catch (err: any) {
        console.error('[OwnerDashboardResolved] load failed:', err);
        if (alive) {
          setLoadError(err?.message || 'Dashboard identity resolution failed.');
          setResolution((prev) => ({ ...prev, state: prev.state === 'active' ? 'active' : 'pending' }));
          setLoadingExtras(false);
        }
      }
    }
    load();
    return () => { alive = false; };
  }, [user?.uid, user?.email]);

  const stats = useMemo(() => {
    const units = properties.reduce((sum, p) => sum + propertyUnits(p), 0);
    const rent = properties.reduce((sum, p) => sum + Number(p.rentCollectedTotal || 0), 0);
    const maintenance = properties.reduce((sum, p) => sum + Number(p.maintenanceCostTotal || 0), 0);
    return { units, rent, maintenance };
  }, [properties]);

  const handleAddReporter = async (reporterData: any) => {
    const ownerId = String(user?.uid || resolution.contract?.ownerId || resolution.contract?.ownerUid || '').trim();
    if (!ownerId) throw new Error('Owner UID is required before adding an authorized reporter.');
    const property = properties.find((p) => String(p.id || p.propertyId) === String(reporterData.propertyId));
    const reporterId = `reporter_${ownerId}_${Date.now()}`;
    const permissionScope = String(reporterData.permissionScope || 'COMPLAINTS_ONLY').toUpperCase();
    const accessType = String(reporterData.accessType || 'MAJLIS_RESIDENT').toUpperCase();
    const canActOnOwnerBehalf = permissionScope === 'OWNER_DELEGATE' || accessType === 'OWNER_DELEGATE';
    const canViewPropertyComplaints = canActOnOwnerBehalf || permissionScope === 'VIEW_AND_COMPLAIN';
    const payload = {
      reporterId,
      ownerId,
      ownerUid: ownerId,
      propertyId: String(reporterData.propertyId || ''),
      propertyName: String(property?.propertyName || property?.name || reporterData.propertyName || 'Property'),
      reporterUid: null,
      reporterName: String(reporterData.reporterName || '').trim(),
      reporterEmail: normalizeEmail(reporterData.reporterEmail),
      reporterPhone: String(reporterData.reporterPhone || '').trim(),
      roleLabel: String(reporterData.roleLabel || 'Other'),
      accessType,
      permissionScope,
      occupiedArea: String(reporterData.occupiedArea || '').trim(),
      unitId: String(reporterData.unitId || '').trim(),
      notes: String(reporterData.notes || '').trim(),
      inviteCode: makeInviteCode(),
      portalRoute: canActOnOwnerBehalf ? '/owner/dashboard' : '/tenant/request',
      loginHint: 'Reporter must use a separate verified login for portal access.',
      accessStatus: 'INVITED',
      canCreateComplaints: true,
      canViewOwnComplaints: true,
      canViewPropertyComplaints,
      canActOnOwnerBehalf,
      canViewOwnerFinancials: false,
      canApproveWork: canActOnOwnerBehalf,
      invitedByOwnerUid: ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'propertyReporters', reporterId), payload);
    setReporters((current) => [resolvePropertyReporter({ id: reporterId, ...payload, createdAt: new Date(), updatedAt: new Date() }), ...current]);
  };

  const handleRemoveReporter = async (reporterId: string) => {
    await updateDoc(doc(db, 'propertyReporters', reporterId), {
      accessStatus: 'SUSPENDED',
      canCreateComplaints: false,
      canViewOwnComplaints: false,
      canViewPropertyComplaints: false,
      canActOnOwnerBehalf: false,
      canViewOwnerFinancials: false,
      canApproveWork: false,
      updatedAt: serverTimestamp(),
    });
    setReporters((current) => current.map((reporter) => reporter.id === reporterId ? { ...reporter, accessStatus: 'SUSPENDED', canCreateComplaints: false } : reporter));
  };

  if (resolution.state === 'loading') {
    return <Box sx={{ height: '70vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  if (resolution.state !== 'active') {
    const contractId = resolution.contract?.id || resolution.profile?.activeContractId || resolution.profile?.latestActivationContractId;
    return (
      <Box sx={{ minHeight: '70vh', display: 'grid', placeItems: 'center', direction: isRTL ? 'rtl' : 'ltr' }}>
        <Paper sx={{ p: { xs: 3, md: 6 }, maxWidth: 720, bgcolor: 'rgba(22,22,24,.82)', border: `1px solid ${alpha(binThemeTokens.gold, .18)}`, borderRadius: 6, textAlign: 'center' }}>
          <Shield size={58} color={binThemeTokens.gold} style={{ margin: '0 auto 20px' }} />
          <Typography variant="h4" fontWeight={950} sx={{ color: '#fff', mb: 2 }}>{resolution.state === 'locked' ? 'Owner profile not linked yet' : 'Activation still requires verified approval'}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.62)', mb: 3, lineHeight: 1.8 }}>{resolution.reason || 'Your profile was found, but verified activation flags are not complete yet.'}</Typography>
          {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center">
            <Button variant="contained" onClick={() => navigate(contractId ? `/owner/contracts?contractId=${encodeURIComponent(contractId)}` : '/owner/contracts')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Review Contracts</Button>
            <Button variant="outlined" onClick={async () => { await refreshRole?.(); window.location.reload(); }} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Refresh Identity</Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  const contract = resolution.contract || {};
  const annual = Number(contract.annualContractValue || contract.annualValue || contract.totalValue || 0);
  const mobilization = Number(contract.mobilizationAmount || contract.depositAmount || contract.paymentSchedule?.mobilizationAmount || (annual ? Math.round(annual * 0.15) : 0));
  const executiveStats = { properties: properties.length, units: stats.units, tenants: tenantCount, tickets, rentCollected: stats.rent, payoutsPending: 0, maintenanceCost: stats.maintenance };
  const missingInfo = { iban: false, units: stats.units === 0 };
  const scrollToObject = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const KPI_CARDS = [
    { label: 'Annual Contract Value', value: annual ? `AED ${annual.toLocaleString()}` : 'Pending', icon: <CreditCard size={20} />, color: binThemeTokens.gold },
    { label: '15% Mobilization', value: mobilization ? `AED ${mobilization.toLocaleString()}` : 'Pending', icon: <Shield size={20} />, color: '#10b981' },
    { label: t('dash.kpi.portfolio') || 'Asset Portfolio', value: properties.length, icon: <Building2 size={20} />, color: '#3b82f6' },
    { label: t('dash.kpi.ops_load') || 'Open Maintenance Tasks', value: tickets, icon: <Wrench size={20} />, color: '#ef4444' },
  ];

  return (
    <Box sx={{ pb: { xs: 12, md: 6 }, pr: { xs: 9, md: 0 }, direction: isRTL ? 'rtl' : 'ltr' }}>
      {loadError && <Alert severity="warning" sx={{ mb: 3 }}>{loadError}</Alert>}
      <Box sx={{ mb: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexDirection: { xs: 'column', md: isRTL ? 'row-reverse' : 'row' }, gap: 2 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 4 }}>SOVEREIGN OWNER TERMINAL</Typography>
          <Typography variant="h3" fontWeight={950} sx={{ color: '#fff', mt: 1 }}>Dashboard Active</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,.55)', mt: 1 }}>Contract mode, property type, title deed evidence, tenant registry and maintenance operations are resolved together.</Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1 }}>
          {contract.contractUrl && (
            <Button variant="outlined" onClick={() => window.open(contract.contractUrl, '_blank')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Download Agreement</Button>
          )}
          <Button variant="outlined" onClick={() => navigate(`/owner/contracts?contractId=${encodeURIComponent(contract.id || '')}`)} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Contracts</Button>
          <Button variant="contained" onClick={() => navigate('/owner/property-passport')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Property Passport</Button>
          <Button variant="outlined" onClick={() => scrollToObject('complaints-command-center')} sx={{ borderColor: '#ef4444', color: '#ef4444', fontWeight: 950 }}>Complaints</Button>
          <Button variant="outlined" onClick={() => scrollToObject('authorized-property-reporters')} sx={{ borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>Add Person</Button>
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

      <OwnerContractIntelligenceSection contract={contract} properties={properties} tenantCount={tenantCount} reporterCount={reporters.filter((r) => r.accessStatus !== 'SUSPENDED').length} />

      <Box sx={{ mt: 5 }}>
        <OwnerContractModeMatrix user={user} contract={contract} properties={properties} />
      </Box>

      <Box sx={{ mt: 5 }}>
        <OwnerExecutiveDashboardSection properties={properties} stats={executiveStats} contractScope={contract.packageName || contract.selectedPlan?.name || contract.planType || contract.serviceType || ''} missingInfo={missingInfo} user={user} contract={contract} />
      </Box>
      
      <Box sx={{ mt: 5 }}>{financials && <OwnerRoiFinancialSection financials={financials} onAddRentDetails={() => alert('Rent update flow triggered.')} />}</Box>

      <Box sx={{ mt: 5 }} id="authorized-property-reporters">
        <OwnerAuthorizedReportersSection properties={properties} reporters={reporters} onAddReporter={handleAddReporter} onRemoveReporter={handleRemoveReporter} loading={loadingExtras} />
      </Box>

      {canSeeMaintenance(detectContractMode(contract)) && (
        <Box sx={{ mt: 5 }} id="complaints-command-center">
          <OwnerComplaintCommandCenter complaints={complaints} properties={properties} />
        </Box>
      )}
    </Box>
  );
}

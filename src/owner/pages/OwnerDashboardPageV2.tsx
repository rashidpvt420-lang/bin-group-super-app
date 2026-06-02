import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
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

type PortfolioStats = {
  properties: number;
  units: number;
  tenants: number;
  tickets: number;
  rentCollected: number;
  payoutsPending: number;
  maintenanceCost: number;
};

type OwnerIntelligence = {
  assets: any[];
  tenants: any[];
  units: any[];
  tickets: any[];
  activeContract: any | null;
  actionItems: string[];
  leaseTrackedAssets: number;
  leaseExemptAssets: number;
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

const EXEMPT_LEASE_TYPES = [
  'majlis',
  'majils',
  'government majlis',
  'hotel',
  'school',
  'hospital',
  'clinic',
  'healthcare',
  'medical',
];

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

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const firstNumber = (...values: unknown[]) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return 0;
};

const money = (value: unknown) => {
  const numeric = Number(value || 0);
  return numeric > 0 ? `AED ${Math.round(numeric).toLocaleString('en-AE')}` : 'Pending';
};

const asDate = (...values: any[]) => {
  for (const value of values) {
    if (!value) continue;
    const candidate = value?.toDate?.() || value;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate;
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const parsed = new Date(candidate);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    if (typeof candidate === 'object' && Number.isFinite(Number(candidate.seconds))) {
      const parsed = new Date(Number(candidate.seconds) * 1000);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
};

const formatDate = (value: any) => {
  const date = asDate(value);
  return date ? date.toLocaleDateString('en-AE') : 'Pending';
};

const hasTrustedActivation = (record: any) => {
  if (!record) return false;
  const status = String(record.status || '').toUpperCase();
  const activationStatus = String(record.activationStatus || '').toUpperCase();
  const signatureStatus = String(record.contractSignatureStatus || record.signatureStatus || record.signatureState?.status || '').toUpperCase();
  return record.dashboardUnlocked === true ||
    (record.dashboardLocked === false && (status === 'ACTIVE' || activationStatus === 'ACTIVE')) ||
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
    contract?.ownerSigned === true ||
    contract?.signatureState?.ownerSigned === true;
};

async function safeCollectionQuery(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
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

const propertyIdOf = (asset: any) => firstText(asset?.propertyId, asset?.id, asset?.passportId, asset?.propertyPassportId);
const assetUnitsOf = (asset: any) => firstNumber(asset?.numberOfUnits, asset?.units, asset?.unitCount, asset?.totalUnits, asset?.unitsCount);
const assetFloorsOf = (asset: any) => firstNumber(asset?.floors, asset?.floorCount, asset?.numberOfFloors);
const assetRoomsOf = (asset: any) => firstNumber(asset?.rooms, asset?.roomsCount, asset?.roomCount, asset?.majlis?.rooms, asset?.majlisProfile?.rooms);
const assetHallsOf = (asset: any) => firstNumber(asset?.halls, asset?.hallsCount, asset?.hallCount, asset?.majlis?.halls, asset?.majlisProfile?.halls);

const assetTypeText = (asset: any) => firstText(
  asset?.propertyType,
  asset?.assetType,
  asset?.assetClass,
  asset?.buildingType,
  asset?.type,
  asset?.category,
  'Property',
);

const isMajlisAsset = (asset: any) => {
  const raw = `${assetTypeText(asset)} ${asset?.majlisType || ''} ${asset?.majlisSubtype || ''} ${asset?.serviceModel || ''}`.toLowerCase();
  return raw.includes('majlis') || raw.includes('majils') || asset?.majlis === true || Boolean(asset?.majlisProfile);
};

const isLeaseExemptAsset = (asset: any) => {
  const raw = `${assetTypeText(asset)} ${asset?.riskProfile || ''} ${asset?.serviceModel || ''}`.toLowerCase();
  return EXEMPT_LEASE_TYPES.some((type) => raw.includes(type)) || isMajlisAsset(asset);
};

const serviceZonesOf = (asset: any) => {
  const zones = asset?.serviceZones || asset?.guestReadinessZones || asset?.majlisProfile?.serviceZones || asset?.zones || asset?.missions;
  if (Array.isArray(zones)) return zones.filter(Boolean).map((item) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label)).filter(Boolean);
  if (zones && typeof zones === 'object') return Object.values(zones).map((item: any) => typeof item === 'string' ? item : firstText(item?.name, item?.title, item?.label)).filter(Boolean);
  if (typeof zones === 'string') return zones.split(',').map((item) => item.trim()).filter(Boolean);
  return [] as string[];
};

const normalizeAsset = (asset: any, source: string, contract?: any, index = 0) => {
  const contractId = firstText(contract?.id, contract?.contractId, asset?.contractId, asset?.sourceContractId);
  const fallbackId = `${contractId || source}_${index}_${firstText(asset?.propertyName, asset?.name, asset?.addressLine, 'asset').replace(/[^a-z0-9_-]/gi, '_')}`;
  return {
    ...asset,
    id: firstText(asset?.id, asset?.propertyId, asset?.passportId, fallbackId),
    propertyId: firstText(asset?.propertyId, asset?.id, asset?.passportId, fallbackId),
    source,
    sourceContractId: contractId,
    sourceContractStatus: firstText(contract?.status, contract?.activationStatus),
    sourcePackage: firstText(contract?.packageName, contract?.selectedPlan?.name, contract?.planType, contract?.contractType),
  };
};

const isPlaceholderAsset = (asset: any) => {
  const name = firstText(asset?.propertyName, asset?.name, asset?.addressLine).toLowerCase();
  return assetUnitsOf(asset) === 0 && (name.includes('new asset') || name.includes('draft') || !name);
};

const sortAssets = (a: any, b: any) => {
  const aUnits = assetUnitsOf(a);
  const bUnits = assetUnitsOf(b);
  if (aUnits !== bUnits) return bUnits - aUnits;
  const aName = firstText(a.propertyName, a.name, a.addressLine);
  const bName = firstText(b.propertyName, b.name, b.addressLine);
  return aName.localeCompare(bName);
};

function tenantsForProperty(tenants: any[], propertyId: string, ownerIds: string[]) {
  return tenants.filter((tenant) => {
    const tenantPropertyId = firstText(tenant?.propertyId, tenant?.propertyUid, tenant?.passportId);
    const tenantUid = firstText(tenant?.tenantUid, tenant?.uid, tenant?.userId, tenant?.authUid);
    return tenantPropertyId === propertyId && !ownerIds.includes(tenantUid);
  });
}

function unitsForProperty(units: any[], propertyId: string) {
  return units.filter((unit) => firstText(unit?.propertyId, unit?.propertyUid, unit?.passportId) === propertyId);
}

function ticketsForProperty(tickets: any[], propertyId: string) {
  return tickets.filter((ticket) => firstText(ticket?.propertyId, ticket?.propertyUid, ticket?.passportId) === propertyId);
}

async function loadPortfolioStats(identity: OwnerIdentityResolution) {
  const propertyMap = new Map<string, any>();
  const passportMap = new Map<string, any>();
  const ticketMap = new Map<string, any>();
  const bankMap = new Map<string, any>();
  const tenantMap = new Map<string, any>();
  const unitMap = new Map<string, any>();

  const add = (target: Map<string, any>, rows: any[]) => rows.forEach((row) => row?.id && target.set(row.id, row));

  identity.contracts.forEach((contract) => {
    if (Array.isArray(contract?.properties)) {
      contract.properties.forEach((property: any, index: number) => {
        const normalized = normalizeAsset(property, 'contract.properties', contract, index);
        propertyMap.set(normalized.propertyId, normalized);
      });
    }
  });

  for (const ownerId of identity.ownerIds) {
    add(propertyMap, await safeCollectionQuery('properties', 'ownerId', ownerId));
    add(propertyMap, await safeCollectionQuery('properties', 'ownerUid', ownerId));
    add(passportMap, await safeCollectionQuery('propertyPassports', 'ownerId', ownerId));
    add(ticketMap, await safeCollectionQuery('maintenanceTickets', 'ownerId', ownerId));
    add(ticketMap, await safeCollectionQuery('tickets', 'ownerId', ownerId));
    add(bankMap, await safeCollectionQuery('ownerBankAccounts', 'ownerId', ownerId));
    add(tenantMap, await safeCollectionQuery('tenants', 'ownerId', ownerId));
    add(tenantMap, await safeCollectionQuery('tenants', 'ownerUid', ownerId));
    add(unitMap, await safeCollectionQuery('units', 'ownerId', ownerId));
    add(unitMap, await safeCollectionQuery('units', 'ownerUid', ownerId));
  }

  for (const email of identity.emails) {
    add(propertyMap, await safeCollectionQuery('properties', 'ownerEmail', email));
    add(passportMap, await safeCollectionQuery('propertyPassports', 'ownerEmail', email));
    add(ticketMap, await safeCollectionQuery('maintenanceTickets', 'ownerEmail', email));
    add(ticketMap, await safeCollectionQuery('tickets', 'ownerEmail', email));
    add(bankMap, await safeCollectionQuery('ownerBankAccounts', 'ownerEmail', email));
    add(tenantMap, await safeCollectionQuery('tenants', 'ownerEmail', email));
    add(unitMap, await safeCollectionQuery('units', 'ownerEmail', email));
  }

  const passportAssets = Array.from(passportMap.values()).map((passport, index) => normalizeAsset(passport, 'propertyPassports', null, index));
  passportAssets.forEach((asset) => propertyMap.set(propertyIdOf(asset), { ...(propertyMap.get(propertyIdOf(asset)) || {}), ...asset }));

  const rawProperties = Array.from(propertyMap.values()).map((property, index) => normalizeAsset(property, property.source || 'properties', null, index));
  const realProperties = rawProperties.filter((property) => !isPlaceholderAsset(property));
  const properties = (realProperties.length ? realProperties : rawProperties).sort(sortAssets);
  const passports = Array.from(passportMap.values());
  const tickets = Array.from(ticketMap.values());
  const tenants = Array.from(tenantMap.values());
  const units = Array.from(unitMap.values());

  const unitsFromAssets = properties.reduce((total, item) => total + assetUnitsOf(item), 0);
  const unitsFromUnitsCollection = units.length;
  const linkedTenantCount = tenants.filter((tenant) => !identity.ownerIds.includes(firstText(tenant?.tenantUid, tenant?.uid, tenant?.userId, tenant?.authUid))).length;
  const rentCollected = passports.reduce((total, item) => total + Number(item.rentCollectedTotal || 0), 0);
  const maintenanceCost = passports.reduce((total, item) => total + Number(item.maintenanceCostTotal || 0), 0);
  const openTickets = tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())).length;

  const activeContract = identity.contracts.find(contractIsActive) || identity.contracts[0] || null;
  const contractScope = String(activeContract?.managementScope || activeContract?.contractType || activeContract?.planType || activeContract?.packageName || '').toUpperCase();
  const unitsMissingDetails = passports.some((item) => !Array.isArray(item.rentPerUnitTable) || item.rentPerUnitTable.length === 0);
  const leaseExemptAssets = properties.filter(isLeaseExemptAsset).length;
  const leaseTrackedAssets = Math.max(properties.length - leaseExemptAssets, 0);

  const actionItems = unique([
    bankMap.size === 0 ? 'Add verified IBAN / payout bank account.' : '',
    unitsMissingDetails && ['PM_ONLY', 'BOTH', 'HYBRID'].includes(contractScope) ? 'Complete rent-per-unit table for PM visibility.' : '',
    properties.length === 0 ? 'No active properties linked to this owner dashboard yet.' : '',
    properties.some((asset) => isMajlisAsset(asset) && (assetRoomsOf(asset) === 0 || assetHallsOf(asset) === 0)) ? 'Complete Majlis rooms and halls metadata for guest-readiness view.' : '',
    properties.some((asset) => {
      const propertyId = propertyIdOf(asset);
      const expectedUnits = assetUnitsOf(asset);
      return expectedUnits > 0 && tenantsForProperty(tenants, propertyId, identity.ownerIds).length < expectedUnits && !isLeaseExemptAsset(asset);
    }) ? 'Continue tenant invitations: some rentable units are not linked to tenant auth records.' : '',
    openTickets > 0 ? `${openTickets} active maintenance ticket(s) require operational monitoring.` : '',
  ]);

  return {
    properties,
    stats: {
      properties: properties.length,
      units: unitsFromAssets || unitsFromUnitsCollection,
      tenants: linkedTenantCount,
      tickets: openTickets,
      rentCollected,
      payoutsPending: rentCollected * 0.92,
      maintenanceCost,
    },
    missingInfo: { iban: bankMap.size === 0, units: unitsMissingDetails },
    contractScope,
    intelligence: {
      assets: properties,
      tenants,
      units,
      tickets,
      activeContract,
      actionItems,
      leaseTrackedAssets,
      leaseExemptAssets,
    } as OwnerIntelligence,
  };
}

export default function OwnerDashboardPageV2() {
  const { user } = useRole();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [state, setState] = useState<DashboardState>('loading');
  const [activationSource, setActivationSource] = useState('');
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<PortfolioStats>({ properties: 0, units: 0, tenants: 0, tickets: 0, rentCollected: 0, payoutsPending: 0, maintenanceCost: 0 });
  const [properties, setProperties] = useState<any[]>([]);
  const [missingInfo, setMissingInfo] = useState({ iban: false, units: false });
  const [contractScope, setContractScope] = useState('');
  const [intelligence, setIntelligence] = useState<OwnerIntelligence>({ assets: [], tenants: [], units: [], tickets: [], activeContract: null, actionItems: [], leaseTrackedAssets: 0, leaseExemptAssets: 0 });
  const [ownerIds, setOwnerIds] = useState<string[]>([]);

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
        setOwnerIds(identity.ownerIds);
        setState(identity.state);

        if (identity.state !== 'active') return;

        const portfolio = await loadPortfolioStats(identity);
        if (cancelled) return;
        setStats(portfolio.stats);
        setProperties(portfolio.properties);
        setMissingInfo(portfolio.missingInfo);
        setContractScope(portfolio.contractScope);
        setIntelligence(portfolio.intelligence);
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
    { label: 'Total Revenue', value: `AED ${stats.rentCollected.toLocaleString('en-AE')}`, icon: <CreditCard size={20} />, color: '#10b981', sub: 'Gross rent / portfolio revenue' },
    { label: 'Net Payout', value: `AED ${Math.round(stats.payoutsPending).toLocaleString('en-AE')}`, icon: <Shield size={20} />, color: binThemeTokens.gold, sub: 'Estimated owner settlement' },
    { label: 'Asset Portfolio', value: stats.properties, icon: <Building2 size={20} />, color: '#3b82f6', sub: `${stats.units} units` },
    { label: 'Open Maintenance', value: stats.tickets, icon: <Wrench size={20} />, color: '#ef4444', sub: 'Active operational tickets' },
  ], [stats]);

  const activeContract = intelligence.activeContract;
  const annualContractValue = firstNumber(activeContract?.annualContractValue, activeContract?.annualValue, activeContract?.paymentSchedule?.annualContractValue, activeContract?.latestContractValue);
  const mobilizationAmount = firstNumber(activeContract?.mobilizationAmount, activeContract?.depositAmount, activeContract?.paymentSchedule?.mobilizationAmount, annualContractValue ? annualContractValue * 0.15 : 0);
  const contractTermMonths = firstNumber(activeContract?.contractTermMonths, activeContract?.termSummary?.months, 13) || 13;
  const paymentStatus = firstText(activeContract?.paymentStatus, activeContract?.paymentState, activeContract?.payment?.status, 'Pending admin confirmation');
  const contractStatus = firstText(activeContract?.status, activeContract?.activationStatus, activeContract?.contractStatus, 'Pending');
  const servicePackage = firstText(activeContract?.packageName, activeContract?.selectedPlan?.name, activeContract?.planType, contractScope || 'Service package pending');
  const slaTier = firstText(activeContract?.slaTier, activeContract?.selectedPlan?.slaTier, activeContract?.tier, 'Standard SLA');

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

      <Grid container spacing={4} sx={{ mb: 5 }}>
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
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{property.emirate || property.location || 'UAE'} · {assetUnitsOf(property)} units</Typography>
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

      <Paper sx={{ p: 3, mb: 5, bgcolor: 'rgba(8,13,24,0.74)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 5 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>OWNER INTELLIGENCE</Typography>
            <Typography variant="h5" fontWeight="950" sx={{ color: '#FFF' }}>UAE Owner Control Room</Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)', mt: 0.75 }}>
              Real assets are prioritized over zero-unit drafts. Majlis, hotels, schools, hospitals and clinics are exempt from lease-expiry pressure while residential/rental units keep normal tenancy tracking.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={3}><MiniMetric label="Annual Contract" value={money(annualContractValue)} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="15% Mobilization" value={money(mobilizationAmount)} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="Payment Status" value={paymentStatus} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="Contract Term" value={`${contractTermMonths} months`} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="Service Package" value={servicePackage} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="SLA Tier" value={slaTier} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="Contract Status" value={contractStatus} /></Grid>
            <Grid item xs={12} md={3}><MiniMetric label="Next Invoice" value={formatDate(activeContract?.nextInvoiceAt || activeContract?.nextInstallmentAt || activeContract?.paymentSchedule?.nextDueAt)} /></Grid>
          </Grid>

          <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

          <Grid container spacing={2}>
            {intelligence.assets.slice(0, 8).map((asset) => {
              const propertyId = propertyIdOf(asset);
              const unitCount = assetUnitsOf(asset);
              const linkedTenants = tenantsForProperty(intelligence.tenants, propertyId, ownerIds).length;
              const propertyUnits = unitsForProperty(intelligence.units, propertyId).length;
              const propertyTickets = ticketsForProperty(intelligence.tickets, propertyId).filter((ticket) => ACTIVE_TICKET_STATUSES.has(String(ticket.status || '').toUpperCase())).length;
              const rooms = assetRoomsOf(asset);
              const halls = assetHallsOf(asset);
              const zones = serviceZonesOf(asset);
              const majlis = isMajlisAsset(asset);
              const leaseExempt = isLeaseExemptAsset(asset);
              return (
                <Grid item xs={12} md={6} key={`intel-${asset.id}`}>
                  <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                    <Stack spacing={1.4}>
                      <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="flex-start">
                        <Box>
                          <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{firstText(asset.propertyName, asset.name, asset.addressLine, 'Property')}</Typography>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{firstText(asset.emirate, asset.city, asset.area, 'UAE')} · {assetTypeText(asset)}</Typography>
                        </Box>
                        <Chip size="small" label={leaseExempt ? 'No lease alert' : 'Lease tracked'} sx={{ bgcolor: alpha(leaseExempt ? '#10b981' : binThemeTokens.gold, 0.12), color: leaseExempt ? '#86efac' : binThemeTokens.gold, fontWeight: 900 }} />
                      </Stack>

                      <Grid container spacing={1}>
                        <Grid item xs={4}><SmallFact label="Units" value={unitCount || propertyUnits || 0} /></Grid>
                        <Grid item xs={4}><SmallFact label="Floors" value={assetFloorsOf(asset)} /></Grid>
                        <Grid item xs={4}><SmallFact label="Tickets" value={propertyTickets} /></Grid>
                        <Grid item xs={6}><SmallFact label="Tenants linked" value={`${linkedTenants}/${unitCount || propertyUnits || 0}`} /></Grid>
                        <Grid item xs={6}><SmallFact label="Passport" value={firstText(asset.passportStatus, asset.status, asset.activationState, 'Active')} /></Grid>
                      </Grid>

                      {majlis && (
                        <Alert severity={(rooms && halls) ? 'success' : 'warning'} sx={{ bgcolor: alpha((rooms && halls) ? '#10b981' : '#f59e0b', 0.08), color: (rooms && halls) ? '#bbf7d0' : '#fde68a', border: `1px solid ${alpha((rooms && halls) ? '#10b981' : '#f59e0b', 0.22)}` }}>
                          Majlis profile: {halls ? `${halls} hall(s)` : 'halls missing'} · {rooms ? `${rooms} room(s)` : 'rooms missing'} · {zones.length ? zones.slice(0, 3).join(', ') : 'service zones pending'}.
                        </Alert>
                      )}

                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 800 }}>
                        Source: {asset.source || 'property'}{asset.sourceContractId ? ` · Contract ${String(asset.sourceContractId).slice(0, 8)}` : ''}
                      </Typography>
                    </Stack>
                  </Paper>
                </Grid>
              );
            })}
          </Grid>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}><MiniMetric label="Tenant Registry" value={`${stats.tenants}/${stats.units || 0} linked`} helper="Tenants must use their own auth UID and link through ownerId/propertyId/unitId/invitation status." /></Grid>
            <Grid item xs={12} md={4}><MiniMetric label="Lease Rules" value={`${intelligence.leaseExemptAssets} exempt / ${intelligence.leaseTrackedAssets} tracked`} helper="Majlis, hotels, schools, hospitals and clinics suppress lease-expiry alerts." /></Grid>
            <Grid item xs={12} md={4}><MiniMetric label="Operations" value={`${stats.tickets} open ticket(s)`} helper="Preventive maintenance, inspections and recent evidence are monitored through property passports and tickets." /></Grid>
          </Grid>

          {intelligence.actionItems.length > 0 && (
            <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.07), color: '#fef3c7', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
              <Typography variant="subtitle2" fontWeight="950" sx={{ mb: 1 }}>Owner action items</Typography>
              <Stack component="ul" sx={{ pl: 2, m: 0 }}>
                {intelligence.actionItems.map((item) => <Typography component="li" variant="caption" key={item} sx={{ mb: 0.5 }}>{item}</Typography>)}
              </Stack>
            </Alert>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

function MiniMetric({ label, value, helper }: { label: string; value: React.ReactNode; helper?: string }) {
  return (
    <Paper sx={{ p: 2, height: '100%', bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900, letterSpacing: 1 }}>{label.toUpperCase()}</Typography>
      <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF', mt: 0.5 }}>{value}</Typography>
      {helper && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', display: 'block', mt: 0.75, lineHeight: 1.5 }}>{helper}</Typography>}
    </Paper>
  );
}

function SmallFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box sx={{ p: 1, bgcolor: 'rgba(255,255,255,0.035)', borderRadius: 2 }}>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.34)', fontWeight: 800, display: 'block' }}>{label}</Typography>
      <Typography variant="caption" sx={{ color: '#FFF', fontWeight: 950 }}>{value}</Typography>
    </Box>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Stack,
  Typography,
  alpha,
  Button,
} from '@mui/material';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle,
  CreditCard,
  FileText,
  Landmark,
  Shield,
  Users,
  Wrench,
  ExternalLink,
  MapPin,
} from 'lucide-react';
import { collection, db, getDocs, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { getOwnerDatePolicy } from '../utils/ownerDatePolicy';
import { resolvePropertyLocation } from '../../utils/propertyLocationResolver';
import {
  getAssetTypeLabel,
  getFirstAssetValue,
  getOwnerAssetTemplate,
  isFakeOwnerAsset,
} from '../utils/ownerAssetTemplates';
import { detectContractMode, canSeeMaintenance, canSeePropertyManagement } from '../utils/ownerServiceMode';

interface OwnerExecutiveDashboardSectionProps {
  properties: any[];
  stats: {
    properties: number;
    units: number;
    tenants: number;
    tickets: number;
    rentCollected: number;
    payoutsPending: number;
    maintenanceCost: number;
  };
  contractScope: string;
  missingInfo: {
    iban: boolean;
    units: boolean;
  };
  user: any;
  contract?: any;
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.72)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const metricBoxSx = {
  p: 2.5,
  bgcolor: 'rgba(255,255,255,0.025)',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.06)',
  minWidth: 0,
  height: '100%',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

function toNumber(value: any, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatCurrency(value: any) {
  const amount = toNumber(value, 0);
  return amount > 0 ? `AED ${amount.toLocaleString()}` : 'Pending';
}

function readSeconds(value: any) {
  return Number(value?.seconds || value?._seconds || 0);
}

function formatDate(value: any) {
  if (!value) return 'Not set';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleDateString('en-GB');
  const seconds = readSeconds(value);
  if (seconds) return new Date(seconds * 1000).toLocaleDateString('en-GB');
  return String(value);
}

function normalizeStatus(value: any, fallback = 'PENDING') {
  return String(value || fallback).trim().toUpperCase().replace(/\s+/g, '_');
}

function getPropertyUnits(property: any) {
  return toNumber(property?.units || property?.numberOfUnits || property?.totalUnits || property?.unitsCount, 0);
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = getKey(item);
    if (key) map.set(key, item);
  }
  return Array.from(map.values());
}

async function safeCollectionQuery(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerExecutiveDashboard] Optional read skipped: ${collectionName}.${field}`, error);
    return [] as any[];
  }
}

function renderHeader(icon: React.ReactNode, overline: string, title: string) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3, minWidth: 0 }}>
      <Box sx={{ p: 1, bgcolor: alpha(binThemeTokens.gold, 0.1), borderRadius: 2, color: binThemeTokens.gold, flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
          {overline}
        </Typography>
        <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
          {title}
        </Typography>
      </Box>
    </Stack>
  );
}

function renderMetric(label: string, value: React.ReactNode, caption?: React.ReactNode, color = '#fff') {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Box sx={metricBoxSx}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, display: 'block', mb: 1, ...textSafeSx }}>
          {label.toUpperCase()}
        </Typography>
        <Typography variant="h5" fontWeight={950} sx={{ color, ...textSafeSx }}>
          {value}
        </Typography>
        {caption && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', mt: 0.8, display: 'block', ...textSafeSx }}>
            {caption}
          </Typography>
        )}
      </Box>
    </Grid>
  );
}

function AssetIntelligenceCard({ property, user }: { property: any; user?: any }) {
  const loc = resolvePropertyLocation(property);
  const pUnits = property.units || property.numberOfUnits || property.unitsCount || 0;
  const pFloors = property.floors || property.numberOfFloors || property.floorsCount || 0;
  const pType = property.propertyType || property.type || 'Residential';
  const ownerName = property.ownerName || user?.displayName || 'Sovereign Owner';

  return (
    <Card sx={{ ...cardSx, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.25, md: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2, minWidth: 0 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 1.5, ...textSafeSx }}>
              {pType}
            </Typography>
            <Typography variant="h6" fontWeight="950" sx={{ color: '#fff', ...textSafeSx }}>
              {property.propertyName || property.name || 'Property'}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', ...textSafeSx }}>
              Owner: {ownerName}
            </Typography>
          </Box>
          <Chip 
            label={loc.hasExactCoordinates ? "EXACT GPS READY" : (loc.locationQuality === "MISSING" ? "GPS REQUIRED" : "ADDRESS ONLY")}
            size="small" 
            sx={{ 
              bgcolor: loc.hasExactCoordinates ? alpha('#10b981', 0.12) : (loc.locationQuality === "MISSING" ? alpha('#ef4444', 0.12) : alpha('#f59e0b', 0.12)), 
              color: loc.hasExactCoordinates ? '#10b981' : (loc.locationQuality === "MISSING" ? '#fca5a5' : '#fde047'), 
              fontWeight: 950,
              fontSize: '0.65rem',
              flexShrink: 0
            }} 
          />
        </Stack>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>EMIRATE</Typography>
            <Typography variant="body2" fontWeight={900} sx={{ color: '#fff', ...textSafeSx }}>{loc.emirate}</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>COMPOSITION</Typography>
            <Typography variant="body2" fontWeight={900} sx={{ color: '#fff', ...textSafeSx }}>{pUnits} Units · {pFloors} Floors</Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>GPS STATUS</Typography>
            <Typography variant="body2" fontWeight={900} sx={{ color: loc.hasExactCoordinates ? '#10b981' : '#ef4444', ...textSafeSx }}>
              {loc.hasExactCoordinates ? 'PIN READY' : 'PIN REQUIRED'}
            </Typography>
          </Grid>
          <Grid item xs={6} sm={3}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>COORDINATES</Typography>
            <Typography variant="body2" fontWeight={900} sx={{ color: '#fff', fontFamily: 'monospace', ...textSafeSx }}>
              {loc.hasExactCoordinates ? `${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)}` : 'N/A'}
            </Typography>
          </Grid>
        </Grid>

        <Stack spacing={1} sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>FULL ADDRESS</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', ...textSafeSx }}>{loc.address || 'Address pending'}</Typography>
        </Stack>

        {(() => {
          const template = getOwnerAssetTemplate(property);
          if (!template || !template.fields || template.fields.length === 0) return null;
          return (
            <Box sx={{ mt: 2.5 }}>
              <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.06)' }} />
              <Typography variant="caption" fontWeight={900} sx={{ color: binThemeTokens.gold, display: 'block', mb: 1.5, letterSpacing: 1 }}>
                {template.title.toUpperCase()}
              </Typography>
              <Grid container spacing={1.5}>
                {template.fields.map((field) => {
                  const val = getFirstAssetValue(property, field.keys, 'Pending setup', field.label);
                  return (
                    <Grid item xs={12} sm={6} md={4} key={field.label}>
                      <Box sx={{ p: 1.25, bgcolor: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 2 }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900, display: 'block', mb: 0.5 }}>
                          {field.label.toUpperCase()}
                        </Typography>
                        <Typography variant="body2" fontWeight={900} sx={{ color: '#fff', ...textSafeSx }}>
                          {val}
                        </Typography>
                      </Box>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          );
        })()}

        <Box sx={{ display: 'flex', gap: 2, mt: 2.5 }}>
          <Button 
            href={loc.googleMapsUrl} 
            target="_blank" 
            rel="noreferrer" 
            variant="outlined" 
            size="small"
            endIcon={<ExternalLink size={14} />} 
            sx={{ 
              color: binThemeTokens.gold, 
              borderColor: alpha(binThemeTokens.gold, 0.3),
              fontWeight: 950,
              fontSize: '0.7rem'
            }}
          >
            Open in Maps
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function OwnerExecutiveDashboardSection({
  properties,
  stats,
  contractScope,
  missingInfo,
  user,
  contract = {},
}: OwnerExecutiveDashboardSectionProps) {
  const [occupancies, setOccupancies] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    let active = true;
    async function fetchControlRoomData() {
      if (!user?.uid && !user?.email) {
        setLoadingData(false);
        return;
      }

      const uid = String(user?.uid || '').trim();
      const email = String(user?.email || '').trim().toLowerCase();
      const [
        occByOwnerUid,
        occByOwnerId,
        invByOwnerUid,
        invByOwnerId,
        invByOwnerEmail,
        ticketsByOwnerUid,
        ticketsByOwnerId,
        ticketsByOwnerEmail,
      ] = await Promise.all([
        safeCollectionQuery('occupancies', 'ownerUid', uid),
        safeCollectionQuery('occupancies', 'ownerId', uid),
        safeCollectionQuery('tenantInvitations', 'ownerUid', uid),
        safeCollectionQuery('tenantInvitations', 'ownerId', uid),
        safeCollectionQuery('tenantInvitations', 'ownerEmail', email),
        safeCollectionQuery('maintenanceTickets', 'ownerUid', uid),
        safeCollectionQuery('maintenanceTickets', 'ownerId', uid),
        safeCollectionQuery('maintenanceTickets', 'ownerEmail', email),
      ]);

      if (!active) return;
      setOccupancies(uniqueBy([...occByOwnerUid, ...occByOwnerId], (item) => item.id || `${item.propertyId}-${item.unitId}-${item.tenantUid || item.tenantEmail}`));
      setInvitations(uniqueBy([...invByOwnerUid, ...invByOwnerId, ...invByOwnerEmail], (item) => item.id || `${item.propertyId}-${item.unitId}-${item.tenantUid || item.tenantEmail}`));
      setTickets(uniqueBy([...ticketsByOwnerUid, ...ticketsByOwnerId, ...ticketsByOwnerEmail], (item) => item.id || `${item.propertyId}-${item.ticketId}-${item.createdAt?.seconds || ''}`));
      setLoadingData(false);
    }

    fetchControlRoomData().catch((error) => {
      console.warn('[OwnerExecutiveDashboard] Optional dashboard telemetry failed.', error);
      if (active) setLoadingData(false);
    });

    return () => {
      active = false;
    };
  }, [user?.uid, user?.email]);

  const liveContract = contract || {};
  const contractMode = detectContractMode(liveContract);
  const maintenanceEnabled = canSeeMaintenance(contractMode);
  const pmEnabled = canSeePropertyManagement(contractMode);
  const annualContractValue = toNumber(liveContract.annualContractValue || liveContract.annualValue || liveContract.totalValue, 0);
  const mobilization = toNumber(
    liveContract.mobilizationAmount || liveContract.activationDeposit || liveContract.depositAmount || liveContract.paymentSchedule?.mobilizationAmount,
    annualContractValue ? Math.round(annualContractValue * 0.15) : 0
  );
  const paymentStatus = normalizeStatus(
    liveContract.paymentStatus || liveContract.paymentSchedule?.paymentStatus || liveContract.activationStatus || liveContract.status,
    'PENDING'
  );
  const packageName =
    liveContract.packageName ||
    liveContract.selectedPlan?.name ||
    liveContract.planType ||
    liveContract.serviceType ||
    contractScope ||
    'Active Service Agreement';
  const signatureStatus = normalizeStatus(
    liveContract.contractSignatureStatus || liveContract.signatureState?.status || liveContract.signatureStatus,
    'PENDING'
  );
  const contractStart = liveContract.activeContractValidFrom || liveContract.validFrom || liveContract.createdAt;
  const contractEnd = liveContract.activeContractValidTo || liveContract.validTo || liveContract.endDate;
  const nextInvoiceAmount = liveContract.nextInvoiceAmount || liveContract.paymentSchedule?.nextInvoiceAmount;
  const nextInvoiceDue = liveContract.nextInvoiceDueDate || liveContract.paymentSchedule?.nextDueDate;
  const slaTier = liveContract.slaTier || liveContract.serviceLevel || liveContract.selectedPlan?.slaTier || liveContract.sla || 'Not assigned';
  const slaHealth = liveContract.slaHealth || liveContract.slaScore || liveContract.slaCompliance || 'Not reported';
  const nextMaintenanceVisit = liveContract.nextMaintenanceVisit || liveContract.nextPmVisit || liveContract.maintenanceSchedule?.nextVisit;
  const technicianSchedule = liveContract.nextTechnicianVisit || liveContract.technicianSchedule?.nextVisit;

  const visibleProperties = useMemo(() => {
    const source = Array.isArray(properties) ? properties : [];
    const real = source.filter((property) => !isFakeOwnerAsset(property));
    return real.length ? real : source;
  }, [properties]);

  const totalUnits = stats.units || visibleProperties.reduce((sum, property) => sum + getPropertyUnits(property), 0);
  const totalRentalUnits = visibleProperties.reduce((sum, property) => {
    const assetType = getAssetTypeLabel(property);
    const policy = getOwnerDatePolicy(assetType, property);
    return policy.showLeaseExpiry ? sum + getPropertyUnits(property) : sum;
  }, 0);
  const acceptedTenants = occupancies.filter((item) => ['ACCEPTED', 'ACTIVE', 'SIGNED', 'OCCUPIED'].includes(normalizeStatus(item.occupancyStatus || item.status))).length || stats.tenants;
  const pendingInvitations = invitations.filter((item) => ['PENDING_AUTH_CREATION', 'PENDING', 'INVITED', 'SENT'].includes(normalizeStatus(item.invitationStatus || item.status))).length;
  const linkedTenantsCount = acceptedTenants + pendingInvitations;
  const vacantUnitsCount = Math.max(0, totalUnits - acceptedTenants);
  const tenantRegistryReadiness = totalRentalUnits > 0 ? Math.min(100, Math.round((linkedTenantsCount / totalRentalUnits) * 100)) : 0;
  const openTicketsCount = tickets.filter((ticket) => ['OPEN', 'PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED'].includes(normalizeStatus(ticket.status))).length || stats.tickets;
  const criticalTickets = tickets.filter((ticket) => normalizeStatus(ticket.priority || ticket.severity) === 'CRITICAL' && normalizeStatus(ticket.status) !== 'COMPLETED').length;
  const passportReady = visibleProperties.filter((property) => ['ACTIVE', 'READY', 'ISSUED'].includes(normalizeStatus(property.passportStatus || property.governanceStatus || property.status))).length;

  // Detect non-tenant properties (Majlis, Hospital, etc.)
  const NON_TENANT_TYPES = ['Government Majlis', 'Private Majlis', 'Hospital', 'Clinic', 'School', 'Stadium', 'Sports Complex', 'Event Venue'];
  const nonTenantPropertiesCount = visibleProperties.filter(p => NON_TENANT_TYPES.includes(p.propertyType || p.type || p.assetGrade || '')).length;
  const missingDataWarnings = visibleProperties.filter((property) => {
    const template = getOwnerAssetTemplate(property);
    return template.fields.some((field) => getFirstAssetValue(property, field.keys) === 'Not provided');
  }).length;

  const actionItems: { title: string; priority: 'Critical' | 'High' | 'Medium' | 'Low'; section: string }[] = [];
  if (missingInfo.iban) actionItems.push({ title: 'Missing owner payout bank schedule or IBAN configuration', priority: 'Critical', section: 'Finance' });
  if (annualContractValue <= 0) actionItems.push({ title: 'Annual contract value is missing from the active contract', priority: 'High', section: 'Finance' });
  if (signatureStatus === 'PENDING') actionItems.push({ title: 'Contract signature status still requires verification', priority: 'High', section: 'Contract' });
  if (tenantRegistryReadiness < 50 && totalRentalUnits > 0) actionItems.push({ title: 'Tenant registry readiness is below 50%', priority: 'High', section: 'Tenant Registry' });
  if (passportReady < visibleProperties.length) actionItems.push({ title: 'Some active assets do not have official property passport status yet', priority: 'Medium', section: 'Property Passport' });
  if (missingDataWarnings > 0) actionItems.push({ title: `${missingDataWarnings} asset profile(s) need missing field backfill`, priority: 'Medium', section: 'Asset Data' });
  if (openTicketsCount > 0) actionItems.push({ title: `${openTicketsCount} maintenance ticket(s) require owner visibility`, priority: 'High', section: 'Operations' });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical':
        return '#ef4444';
      case 'High':
        return '#f97316';
      case 'Medium':
        return '#f59e0b';
      default:
        return '#3b82f6';
    }
  };

  return (
    <Stack spacing={4} sx={{ width: '100%', mt: 4, minWidth: 0 }}>
      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          {renderHeader(<CreditCard size={22} />, 'Financial Control', 'Live Contract Ledger & Mobilization')}
          <Grid container spacing={3}>
            {renderMetric('Annual Contract Value', formatCurrency(annualContractValue), `Package: ${packageName}`, binThemeTokens.gold)}
            {renderMetric('15% Mobilization', formatCurrency(mobilization), `Payment: ${paymentStatus}`)}
            {renderMetric('Signature Status', <Chip label={signatureStatus} sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950, maxWidth: '100%' }} />, `${formatDate(contractStart)} → ${formatDate(contractEnd)}`)}
            {renderMetric('Next Invoice / SLA', nextInvoiceAmount ? formatCurrency(nextInvoiceAmount) : 'Not scheduled', nextInvoiceDue ? `Due: ${formatDate(nextInvoiceDue)} · SLA: ${slaTier}` : `SLA: ${slaTier}`)}
          </Grid>
        </CardContent>
      </Card>

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          {renderHeader(<Building2 size={22} />, 'Portfolio Health', 'Assets, Occupancy, SLA & Passports')}
          <Grid container spacing={3}>
            {renderMetric('Active Assets', visibleProperties.length, `${passportReady}/${visibleProperties.length || 0} passports ready`)}
            {renderMetric(
              'Occupied / Vacant Units',
              pmEnabled ? `${acceptedTenants} / ${vacantUnitsCount}` : 'N/A',
              pmEnabled ? `Total registered units: ${totalUnits}` : 'Requires Property Management'
            )}
            {renderMetric(
              'SLA Health',
              maintenanceEnabled ? String(slaHealth) : 'N/A',
              maintenanceEnabled ? 'Live from contract/SLA records' : 'Requires Maintenance Scope',
              maintenanceEnabled ? '#10b981' : '#94a3b8'
            )}
            {renderMetric('Missing Data Warnings', missingDataWarnings, 'Backfill required for complete owner visibility', missingDataWarnings ? '#f59e0b' : '#10b981')}
          </Grid>
        </CardContent>
      </Card>

      {pmEnabled && (
        <Card sx={cardSx}>
          <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3, minWidth: 0 }}>
              {renderHeader(<Users size={22} />, 'Tenant Registry', 'Linked Occupancies & UID Security')}
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>REGISTRY READINESS</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: binThemeTokens.gold, ...textSafeSx }}>{tenantRegistryReadiness}% Linked</Typography>
              </Box>
            </Stack>
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {renderMetric('Accepted Tenants', acceptedTenants)}
              {renderMetric('Pending Invitations', pendingInvitations, undefined, binThemeTokens.gold)}
              {renderMetric('Vacant Units', vacantUnitsCount, undefined, vacantUnitsCount ? (nonTenantPropertiesCount > 0 ? '#3b82f6' : '#ef4444') : '#10b981')}
              {renderMetric('Linked / Total', `${linkedTenantsCount} / ${totalUnits}`)}
            </Grid>
            
            {nonTenantPropertiesCount > 0 && (
              <Alert severity="info" sx={{ mb: 3, bgcolor: alpha('#3b82f6', 0.05), border: `1px solid ${alpha('#3b82f6', 0.2)}`, borderRadius: 3 }}>
                <Typography variant="caption" fontWeight={900} sx={{ display: 'block', ...textSafeSx, color: '#93c5fd' }}>
                  Your portfolio contains {nonTenantPropertiesCount} non-tenant asset(s) (e.g. Majlis, Hospital). Vacancy is normal. Please configure their access via the Authorized Reporters section.
                </Typography>
              </Alert>
            )}

            <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.035), border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`, color: binThemeTokens.gold, borderRadius: 3 }}>
              <Typography variant="caption" fontWeight={900} sx={{ display: 'block', ...textSafeSx }}>
                Tenants must never share the owner UID. Tenant records must use ownerId/ownerUid + propertyId + unitId + tenantUid + tenantEmail, with each tenant using their own Firebase Auth UID/login.
              </Typography>
            </Alert>
          </CardContent>
        </Card>
      )}

      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2, minWidth: 0 }}>
          <Landmark size={22} color={binThemeTokens.gold} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, letterSpacing: 2, ...textSafeSx }}>
              Asset Intelligence
            </Typography>
            <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>
              Universal UAE Property Dashboard Renderer
            </Typography>
          </Box>
        </Stack>
        <Grid container spacing={3}>
          {visibleProperties.length === 0 ? (
            <Grid item xs={12}>
              <Card sx={cardSx}>
                <CardContent sx={{ p: 4, textAlign: 'center' }}>
                  <Typography fontWeight={950} sx={{ color: 'rgba(255,255,255,0.52)' }}>NO ACTIVE ASSETS FOUND</Typography>
                </CardContent>
              </Card>
            </Grid>
          ) : (
            visibleProperties.map((property) => (
              <Grid item xs={12} key={property.id || property.propertyId || property.name} sx={{ minWidth: 0 }}>
                <AssetIntelligenceCard property={property} user={user} />
              </Grid>
            ))
          )}
        </Grid>
      </Box>

      {maintenanceEnabled && (
        <Card sx={cardSx}>
          <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
            {renderHeader(<Wrench size={22} />, 'Operations & SLA', 'Maintenance Tickets, Visits & Field Readiness')}
            <Grid container spacing={3}>
              {renderMetric('Open Maintenance Tickets', openTicketsCount, `Critical: ${criticalTickets}`)}
              {renderMetric('PM Schedule', nextMaintenanceVisit ? formatDate(nextMaintenanceVisit) : 'Not scheduled', 'Next preventive maintenance visit')}
              {renderMetric('Technician Scheduling', technicianSchedule ? formatDate(technicianSchedule) : 'Not scheduled', 'Upcoming technician field visit')}
              {renderMetric('Maintenance Cost', formatCurrency(stats.maintenanceCost), 'Live owner ledger cost')}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          {renderHeader(<Calendar size={22} />, 'Compliance Calendar', 'Lease, Permit, Inspection & Maintenance Readiness')}
          <Grid container spacing={2}>
            {visibleProperties.map((property) => {
              const assetType = getAssetTypeLabel(property);
              const policy = getOwnerDatePolicy(assetType, property);
              return (
                <Grid item xs={12} md={6} key={`compliance-${property.id || property.propertyId || property.name}`} sx={{ minWidth: 0 }}>
                  <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.025)', borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', minWidth: 0 }}>
                    <Typography fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>{property.propertyName || property.name || property.address || 'Asset'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', display: 'block', mb: 1, ...textSafeSx }}>{assetType}</Typography>
                    <Stack spacing={0.75}>
                      {policy.showLeaseExpiry && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', ...textSafeSx }}>Lease expiry: {formatDate(property.leaseExpiry || property.leaseEndDate || property.leaseValidTo)}</Typography>}
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', ...textSafeSx }}>Permit: {formatDate(property.permitExpiry || property.permitValidTo)}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', ...textSafeSx }}>Inspection: {formatDate(property.inspectionExpiry || property.nextInspectionDate)}</Typography>
                    </Stack>
                  </Box>
                </Grid>
              );
            })}
          </Grid>
        </CardContent>
      </Card>

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          {renderHeader(<FileText size={22} />, 'Owner Action Items', 'Priority Fixes for Complete Owner Visibility')}
          {loadingData && (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', mb: 2 }}>Loading live owner telemetry...</Typography>
          )}
          {actionItems.length === 0 ? (
            <Alert icon={<CheckCircle size={18} />} severity="success" sx={{ borderRadius: 3 }}>
              No critical owner action items detected from available dashboard data.
            </Alert>
          ) : (
            <Stack spacing={1.5}>
              {actionItems.map((item, index) => (
                <Box key={`${item.title}-${index}`} sx={{ p: 2, bgcolor: alpha(getPriorityColor(item.priority), 0.08), border: `1px solid ${alpha(getPriorityColor(item.priority), 0.24)}`, borderRadius: 3, minWidth: 0 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1.2} alignItems="center" sx={{ minWidth: 0 }}>
                      <AlertTriangle size={18} color={getPriorityColor(item.priority)} style={{ flexShrink: 0 }} />
                      <Typography fontWeight={900} sx={{ color: '#fff', ...textSafeSx }}>{item.title}</Typography>
                    </Stack>
                    <Chip label={`${item.priority} · ${item.section}`} size="small" sx={{ bgcolor: alpha(getPriorityColor(item.priority), 0.12), color: getPriorityColor(item.priority), fontWeight: 950, maxWidth: '100%' }} />
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}

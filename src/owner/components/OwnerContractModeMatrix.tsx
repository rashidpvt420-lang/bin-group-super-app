import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Card, CardContent, Chip, Grid, Stack, Typography, alpha } from '@mui/material';
import { Banknote, Building2, CheckCircle2, ClipboardList, CreditCard, Home, Lock, Users, Wrench } from 'lucide-react';
import { collection, db, getDocs, query, where } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

type ContractMode = 'MAINTENANCE_ONLY' | 'PROPERTY_MANAGEMENT_ONLY' | 'HYBRID' | 'UNKNOWN';

interface OwnerContractModeMatrixProps {
  user: any;
  contract: any;
  properties: any[];
}

const cardSx = {
  bgcolor: 'rgba(22,22,24,0.76)',
  border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`,
  borderRadius: 4,
  minWidth: 0,
  overflow: 'hidden',
};

const textSafeSx = {
  minWidth: 0,
  overflowWrap: 'anywhere',
  wordBreak: 'break-word',
};

const ACTIVE_TICKET_STATUSES = new Set(['OPEN', 'PENDING', 'PENDING_ASSIGNMENT', 'ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'WAITING_PARTS', 'ESCALATED']);
const ACTIVE_TENANT_STATUSES = new Set(['ACCEPTED', 'ACTIVE', 'SIGNED', 'OCCUPIED']);
const PENDING_TENANT_STATUSES = new Set(['PENDING', 'INVITED', 'SENT', 'PENDING_AUTH_CREATION']);

function toNumber(value: any, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function money(value: any) {
  const amount = toNumber(value, 0);
  return `AED ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function status(value: any, fallback = 'PENDING') {
  return String(value || fallback).trim().toUpperCase().replace(/\s+/g, '_');
}

function propertyUnits(property: any) {
  return toNumber(property?.units || property?.numberOfUnits || property?.totalUnits || property?.unitsCount, 0);
}

function uniqBy(items: any[], keyFn: (item: any) => string) {
  const map = new Map<string, any>();
  for (const item of items) {
    const key = keyFn(item);
    if (key) map.set(key, item);
  }
  return Array.from(map.values());
}

async function safeQuery(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerContractModeMatrix] Optional query skipped: ${collectionName}.${field}`, error);
    return [] as any[];
  }
}

function detectContractMode(contract: any): ContractMode {
  const raw = [
    contract?.contractType,
    contract?.packageType,
    contract?.packageName,
    contract?.planType,
    contract?.serviceType,
    contract?.selectedPlan?.name,
    contract?.selectedPlan?.type,
    contract?.scope,
  ].filter(Boolean).join(' ').toLowerCase();

  const hasMaintenance = /maintenance|facility|fm|mep|repair|preventive/.test(raw);
  const hasPm = /property management|management|pm|leasing|tenant|rent|collection/.test(raw);

  if (hasMaintenance && hasPm) return 'HYBRID';
  if (hasMaintenance) return 'MAINTENANCE_ONLY';
  if (hasPm) return 'PROPERTY_MANAGEMENT_ONLY';
  return 'UNKNOWN';
}

function modeLabel(mode: ContractMode) {
  switch (mode) {
    case 'MAINTENANCE_ONLY': return 'Maintenance Only';
    case 'PROPERTY_MANAGEMENT_ONLY': return 'Property Management Only';
    case 'HYBRID': return 'Maintenance + Property Management';
    default: return 'Contract Scope Pending Classification';
  }
}

function modeDescription(mode: ContractMode) {
  switch (mode) {
    case 'MAINTENANCE_ONLY': return 'Owners see maintenance tickets, SLA, preventive schedules, technicians, evidence, costs, and property asset health. Tenant rent/payment ledgers stay hidden because PM is not part of the agreement.';
    case 'PROPERTY_MANAGEMENT_ONLY': return 'Owners see tenant registry, occupancy, leases, rent collection, payment balances, vacant units, renewals, and owner payouts. Maintenance execution modules stay hidden unless maintenance is included.';
    case 'HYBRID': return 'Owners see the full operating command center: maintenance operations plus tenant management, rent collection, balances, complaints, property passports, and financial performance.';
    default: return 'The contract exists, but its service mode is not explicit. The dashboard shows available data and flags missing contract classification.';
  }
}

function allowsMaintenance(mode: ContractMode) {
  return mode === 'MAINTENANCE_ONLY' || mode === 'HYBRID' || mode === 'UNKNOWN';
}

function allowsPropertyManagement(mode: ContractMode) {
  return mode === 'PROPERTY_MANAGEMENT_ONLY' || mode === 'HYBRID';
}

function tenantDisplayName(item: any) {
  return item.tenantName || item.displayName || item.name || item.fullName || item.tenantEmail || 'Tenant';
}

function propertyDisplayName(item: any, properties: any[]) {
  const propertyId = String(item.propertyId || item.propertyUid || '');
  const property = properties.find((p) => String(p.id || p.propertyId) === propertyId);
  return item.propertyName || property?.propertyName || property?.name || 'Property';
}

function renderMetric(label: string, value: React.ReactNode, caption?: React.ReactNode, color = '#fff') {
  return (
    <Grid item xs={12} sm={6} md={3}>
      <Box sx={{ p: 2.5, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3, height: '100%', minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)', fontWeight: 900, display: 'block', mb: 1, ...textSafeSx }}>{label.toUpperCase()}</Typography>
        <Typography variant="h5" fontWeight={950} sx={{ color, ...textSafeSx }}>{value}</Typography>
        {caption && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,.55)', display: 'block', mt: .75, ...textSafeSx }}>{caption}</Typography>}
      </Box>
    </Grid>
  );
}

export default function OwnerContractModeMatrix({ user, contract, properties }: OwnerContractModeMatrixProps) {
  const [loading, setLoading] = useState(true);
  const [occupancies, setOccupancies] = useState<any[]>([]);
  const [invitations, setInvitations] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);

  const uid = String(user?.uid || contract?.ownerId || contract?.ownerUid || '').trim();
  const email = String(user?.email || contract?.ownerEmail || contract?.emailDelivery?.recipient || '').trim().toLowerCase();
  const mode = useMemo(() => detectContractMode(contract), [contract]);
  const maintenanceEnabled = allowsMaintenance(mode);
  const pmEnabled = allowsPropertyManagement(mode);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [
        occOwnerId, occOwnerUid,
        invOwnerId, invOwnerUid, invEmail,
        leasesOwnerId, leasesOwnerUid, leasesEmail,
        ledgerOwnerId, ledgerOwnerUid, ledgerEmail,
        payOwnerId, payOwnerUid, payContract,
        ticketsOwnerId, ticketsOwnerUid, ticketsEmail,
      ] = await Promise.all([
        safeQuery('occupancies', 'ownerId', uid),
        safeQuery('occupancies', 'ownerUid', uid),
        safeQuery('tenantInvitations', 'ownerId', uid),
        safeQuery('tenantInvitations', 'ownerUid', uid),
        safeQuery('tenantInvitations', 'ownerEmail', email),
        safeQuery('leases', 'ownerId', uid),
        safeQuery('leases', 'ownerUid', uid),
        safeQuery('leases', 'ownerEmail', email),
        safeQuery('tenant_ledger', 'ownerId', uid),
        safeQuery('tenant_ledger', 'ownerUid', uid),
        safeQuery('tenant_ledger', 'ownerEmail', email),
        safeQuery('payment_transactions', 'ownerId', uid),
        safeQuery('payment_transactions', 'ownerUid', uid),
        safeQuery('payment_transactions', 'contractId', String(contract?.id || '')),
        safeQuery('maintenanceTickets', 'ownerId', uid),
        safeQuery('maintenanceTickets', 'ownerUid', uid),
        safeQuery('maintenanceTickets', 'ownerEmail', email),
      ]);
      if (!alive) return;
      setOccupancies(uniqBy([...occOwnerId, ...occOwnerUid], (item) => item.id || `${item.propertyId}-${item.unitId}-${item.tenantUid || item.tenantEmail}`));
      setInvitations(uniqBy([...invOwnerId, ...invOwnerUid, ...invEmail], (item) => item.id || `${item.propertyId}-${item.unitId}-${item.tenantUid || item.tenantEmail}`));
      setLeases(uniqBy([...leasesOwnerId, ...leasesOwnerUid, ...leasesEmail], (item) => item.id || item.leaseId || `${item.propertyId}-${item.unitId}-${item.tenantEmail}`));
      setLedger(uniqBy([...ledgerOwnerId, ...ledgerOwnerUid, ...ledgerEmail], (item) => item.id || item.ledgerId || `${item.propertyId}-${item.unitId}-${item.tenantEmail}-${item.period}`));
      setPayments(uniqBy([...payOwnerId, ...payOwnerUid, ...payContract], (item) => item.id || item.paymentId || `${item.contractId}-${item.amount}-${item.createdAt?.seconds || ''}`));
      setTickets(uniqBy([...ticketsOwnerId, ...ticketsOwnerUid, ...ticketsEmail], (item) => item.id || item.ticketId));
      setLoading(false);
    }
    load().catch((error) => {
      console.warn('[OwnerContractModeMatrix] Load failed', error);
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [uid, email, contract?.id]);

  const summary = useMemo(() => {
    const totalUnits = properties.reduce((sum, p) => sum + propertyUnits(p), 0);
    const activeTenants = occupancies.filter((item) => ACTIVE_TENANT_STATUSES.has(status(item.occupancyStatus || item.status))).length;
    const pendingTenants = invitations.filter((item) => PENDING_TENANT_STATUSES.has(status(item.invitationStatus || item.status))).length;
    const openTickets = tickets.filter((ticket) => ACTIVE_TICKET_STATUSES.has(status(ticket.status))).length;
    const emergencyTickets = tickets.filter((ticket) => ['EMERGENCY', 'CRITICAL', 'HIGH'].includes(status(ticket.priority || ticket.severity)) && ACTIVE_TICKET_STATUSES.has(status(ticket.status))).length;

    const paidFromPayments = payments.filter((p) => ['PAID', 'COMPLETED', 'SUCCESS'].includes(status(p.status || p.paymentStatus))).reduce((sum, p) => sum + toNumber(p.amount || p.total || p.paidAmount, 0), 0);
    const pendingFromPayments = payments.filter((p) => !['PAID', 'COMPLETED', 'SUCCESS'].includes(status(p.status || p.paymentStatus))).reduce((sum, p) => sum + toNumber(p.amount || p.total || p.balance || p.pendingAmount, 0), 0);
    const rentDue = [...leases, ...ledger].reduce((sum, item) => sum + toNumber(item.rentDue || item.amountDue || item.annualRent || item.totalRent || item.invoiceAmount, 0), 0);
    const rentPaid = [...leases, ...ledger].reduce((sum, item) => sum + toNumber(item.rentPaid || item.amountPaid || item.paidAmount || item.collectedAmount, 0), 0);
    const balance = Math.max(0, rentDue + pendingFromPayments - rentPaid - paidFromPayments);

    return {
      totalUnits,
      activeTenants,
      pendingTenants,
      vacantUnits: Math.max(0, totalUnits - activeTenants),
      openTickets,
      emergencyTickets,
      paid: rentPaid + paidFromPayments,
      due: rentDue + pendingFromPayments,
      balance,
      collectionRate: rentDue > 0 ? Math.round((rentPaid / rentDue) * 100) : 0,
    };
  }, [properties, occupancies, invitations, leases, ledger, payments, tickets]);

  const tenantRows = useMemo(() => {
    const rows = uniqBy([...occupancies, ...leases, ...ledger], (item) => item.tenantUid || item.tenantId || item.tenantEmail || item.id || item.leaseId || '');
    return rows.slice(0, 8).map((item) => ({
      name: tenantDisplayName(item),
      property: propertyDisplayName(item, properties),
      unit: item.unitNumber || item.unitId || '—',
      status: status(item.occupancyStatus || item.leaseStatus || item.status, 'ACTIVE'),
      due: toNumber(item.rentDue || item.amountDue || item.annualRent || item.totalRent, 0),
      paid: toNumber(item.rentPaid || item.amountPaid || item.paidAmount || item.collectedAmount, 0),
      balance: Math.max(0, toNumber(item.rentDue || item.amountDue || item.annualRent || item.totalRent, 0) - toNumber(item.rentPaid || item.amountPaid || item.paidAmount || item.collectedAmount, 0)),
    }));
  }, [occupancies, leases, ledger, properties]);

  return (
    <Stack spacing={3} sx={{ mt: 5, minWidth: 0 }}>
      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" sx={{ mb: 3, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3, ...textSafeSx }}>OWNER CONTRACT MODE ENGINE</Typography>
              <Typography variant="h5" fontWeight={950} sx={{ color: '#fff', ...textSafeSx }}>{modeLabel(mode)}</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,.58)', mt: 1, lineHeight: 1.7, ...textSafeSx }}>{modeDescription(mode)}</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
              <Chip icon={maintenanceEnabled ? <CheckCircle2 size={14} /> : <Lock size={14} />} label="Maintenance" sx={{ bgcolor: maintenanceEnabled ? alpha('#10b981', .12) : alpha('#64748b', .12), color: maintenanceEnabled ? '#10b981' : '#94a3b8', fontWeight: 950 }} />
              <Chip icon={pmEnabled ? <CheckCircle2 size={14} /> : <Lock size={14} />} label="Property Management" sx={{ bgcolor: pmEnabled ? alpha(binThemeTokens.gold, .12) : alpha('#64748b', .12), color: pmEnabled ? binThemeTokens.gold : '#94a3b8', fontWeight: 950 }} />
            </Stack>
          </Stack>
          {mode === 'UNKNOWN' && (
            <Alert severity="warning" sx={{ mb: 3, borderRadius: 3 }}>
              Contract mode is not explicit. Add contractType/packageType/serviceType as Maintenance Only, Property Management Only, or Maintenance + Property Management so the dashboard can enforce the correct owner view.
            </Alert>
          )}
          <Grid container spacing={3}>
            {renderMetric('Properties', properties.length, 'Active assets linked to this contract', '#fff')}
            {renderMetric('Units', summary.totalUnits, 'Resolved from property/unit data', '#fff')}
            {renderMetric('Open Maintenance', maintenanceEnabled ? summary.openTickets : 'Hidden', maintenanceEnabled ? `Emergency/high: ${summary.emergencyTickets}` : 'Not included in PM-only contract', maintenanceEnabled ? '#ef4444' : '#94a3b8')}
            {renderMetric('Tenant Balance', pmEnabled ? money(summary.balance) : 'Hidden', pmEnabled ? `${summary.collectionRate}% collection rate` : 'Not included in Maintenance-only contract', pmEnabled ? binThemeTokens.gold : '#94a3b8')}
          </Grid>
        </CardContent>
      </Card>

      {maintenanceEnabled && (
        <Card sx={cardSx}>
          <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
              <Wrench color={binThemeTokens.gold} />
              <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>MAINTENANCE COMMAND</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>Tickets, SLA, technicians, evidence and preventive work</Typography>
              </Box>
            </Stack>
            <Grid container spacing={3}>
              {renderMetric('Open Tickets', summary.openTickets, 'Owner/tenant complaints requiring action')}
              {renderMetric('Emergency / High', summary.emergencyTickets, 'Priority operations load', summary.emergencyTickets ? '#ef4444' : '#10b981')}
              {renderMetric('Properties Covered', properties.length, 'Assets under maintenance scope')}
              {renderMetric('Work Evidence', tickets.filter((t) => Array.isArray(t.afterPhotos) && t.afterPhotos.length > 0).length, 'Completed jobs with photo proof')}
            </Grid>
          </CardContent>
        </Card>
      )}

      {pmEnabled && (
        <Card sx={cardSx}>
          <CardContent sx={{ p: { xs: 2.25, md: 4 } }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
              <Users color={binThemeTokens.gold} />
              <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>PROPERTY MANAGEMENT COMMAND</Typography>
                <Typography variant="h6" fontWeight={950} sx={{ color: '#fff' }}>Tenants, rent collection, payment balance and occupancy</Typography>
              </Box>
            </Stack>
            <Grid container spacing={3} sx={{ mb: 3 }}>
              {renderMetric('Active Tenants', summary.activeTenants, `${summary.pendingTenants} pending invitations`, '#10b981')}
              {renderMetric('Vacant Units', summary.vacantUnits, 'Available / not occupied units')}
              {renderMetric('Paid / Collected', money(summary.paid), 'Tenant payments and ledger collections', '#10b981')}
              {renderMetric('Left To Pay', money(summary.balance), `Due: ${money(summary.due)}`, summary.balance ? '#ef4444' : '#10b981')}
            </Grid>

            <Box sx={{ border: '1px solid rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
              <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,.035)' }}>
                <Typography fontWeight={950} sx={{ color: '#fff' }}><CreditCard size={16} style={{ verticalAlign: 'middle', marginRight: 8 }} />Tenant Payment Process</Typography>
              </Box>
              {loading ? (
                <Typography sx={{ p: 2, color: 'rgba(255,255,255,.55)' }}>Loading tenant ledger...</Typography>
              ) : tenantRows.length === 0 ? (
                <Typography sx={{ p: 2, color: 'rgba(255,255,255,.55)' }}>No tenant ledger rows found yet. Import tenants/leases or invite tenants to activate this section.</Typography>
              ) : (
                <Stack divider={<Box sx={{ borderTop: '1px solid rgba(255,255,255,.06)' }} />}>
                  {tenantRows.map((row, index) => (
                    <Grid container key={`${row.name}-${index}`} sx={{ p: 2 }} spacing={1} alignItems="center">
                      <Grid item xs={12} md={3}><Typography fontWeight={900} sx={{ color: '#fff', ...textSafeSx }}>{row.name}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)', ...textSafeSx }}>{row.property}</Typography></Grid>
                      <Grid item xs={6} md={2}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>UNIT</Typography><Typography sx={{ color: '#fff' }}>{row.unit}</Typography></Grid>
                      <Grid item xs={6} md={2}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>STATUS</Typography><Typography sx={{ color: '#fff' }}>{row.status}</Typography></Grid>
                      <Grid item xs={6} md={2}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>PAID</Typography><Typography sx={{ color: '#10b981', fontWeight: 900 }}>{money(row.paid)}</Typography></Grid>
                      <Grid item xs={6} md={3}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,.45)' }}>LEFT TO PAY</Typography><Typography sx={{ color: row.balance > 0 ? '#ef4444' : '#10b981', fontWeight: 900 }}>{money(row.balance)}</Typography></Grid>
                    </Grid>
                  ))}
                </Stack>
              )}
            </Box>
          </CardContent>
        </Card>
      )}

      {!pmEnabled && (
        <Alert icon={<Home size={18} />} severity="info" sx={{ borderRadius: 3, bgcolor: alpha('#3b82f6', .06), border: `1px solid ${alpha('#3b82f6', .18)}` }}>
          Property management details such as tenant balances, rent collection, leases and owner payout workflow are intentionally hidden because this contract is Maintenance Only. Upgrade to Property Management or Hybrid to enable the tenant ledger.
        </Alert>
      )}

      {!maintenanceEnabled && (
        <Alert icon={<ClipboardList size={18} />} severity="info" sx={{ borderRadius: 3, bgcolor: alpha('#3b82f6', .06), border: `1px solid ${alpha('#3b82f6', .18)}` }}>
          Maintenance tickets, technician dispatch, GPS tracking, SLA and preventive work are intentionally hidden because this contract is Property Management Only. Add maintenance scope to enable field operations.
        </Alert>
      )}
    </Stack>
  );
}

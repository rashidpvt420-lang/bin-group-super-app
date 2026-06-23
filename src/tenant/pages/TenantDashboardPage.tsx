import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, Dumbbell, FileText, Home, MapPin, Paintbrush, ShieldCheck, Sparkles, Truck, Wrench, Bell, Key, Package, Car, Store, Contact, MessageSquare, Users } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { getContractModeProfile, getPropertyIntelligenceProfile, resolveContractMode } from '../../utils/contractIntelligence';
import RoleJourneyStrip from '../../components/RoleJourneyStrip';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const CLOSED_TICKET_STATUSES = new Set(['CLOSED', 'DISPUTED', 'COMPLETED', 'CANCELLED', 'CANCELED']);

const formatDate = (value: any) => {
  if (!value) return 'Pending';
  if (typeof value === 'string') return value;
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
  if (value?._seconds) return new Date(value._seconds * 1000).toLocaleDateString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Pending' : parsed.toLocaleDateString();
};

const getMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value?.seconds) return value.seconds * 1000;
  if (value?._seconds) return value._seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isActiveTicket = (ticket: any) => !CLOSED_TICKET_STATUSES.has(String(ticket?.status || '').trim().toUpperCase());

async function safeGetDocument(collectionName: string, id?: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.warn(`[TenantDashboard] ${collectionName}/${id} read failed:`, err);
    return null;
  }
}

async function getFirstByField(collectionName: string, field: string, value?: string) {
  if (!value) return null;
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value), limit(1)));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.warn(`[TenantDashboard] ${collectionName}.${field} lookup failed:`, err);
    return null;
  }
}

export default function TenantDashboardPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [unitData, setUnitData] = useState<any>(null);
  const [contractData, setContractData] = useState<any>(null);
  const [activeTickets, setActiveTickets] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);
  const [permissionWarning, setPermissionWarning] = useState('');
  const [ticketReadWarning, setTicketReadWarning] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadResidence() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        setPermissionWarning('');
        let nextUnit: any = null;
        let nextProperty: any = null;
        let nextContract: any = null;

        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
        }

        if (!unitSnap.empty) {
          nextUnit = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
          nextProperty = await safeGetDocument('properties', nextUnit.propertyId);
          nextContract = await safeGetDocument('contracts', nextUnit.contractId || nextUnit.activeContractId);
          if (!nextContract) nextContract = await getFirstByField('contracts', 'tenantId', user.uid);
          if (!nextContract && user.email) nextContract = await getFirstByField('contracts', 'tenantEmail', normalizeEmail(user.email));
          if (!nextContract && nextUnit.propertyId) nextContract = await getFirstByField('contracts', 'propertyId', nextUnit.propertyId);
        } else {
          nextContract = await getFirstByField('contracts', 'tenantId', user.uid);
          if (!nextContract && user.email) nextContract = await getFirstByField('contracts', 'tenantEmail', normalizeEmail(user.email));
          nextProperty = await safeGetDocument('properties', nextContract?.propertyId);
        }

        if (!cancelled) {
          setUnitData(nextUnit);
          setPropertyData(nextProperty);
          setContractData(nextContract);
        }
      } catch (err: any) {
        const isPermissionDenied = err?.code === 'permission-denied' ||
          err?.message?.includes('permission-denied') ||
          err?.message?.includes('insufficient permissions');
        if (isPermissionDenied) {
          console.warn('[TenantDashboard] residence fetch failed: permission-denied.', err);
          if (!cancelled) setPermissionWarning(tx('dash.permissionWarning', 'Some residence records could not load because access rules blocked them. Please contact BIN GROUP Operations if this does not refresh.'));
        } else {
          console.error('[TenantDashboard] residence fetch failed:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadResidence();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email, tx]);

  useEffect(() => {
    if (!user?.uid) return;
    setTicketReadWarning('');
    const normalizedEmail = normalizeEmail(user.email);
    const ticketSources = [
      { field: 'tenantId', value: user.uid },
      { field: 'createdBy', value: user.uid },
      { field: 'requesterId', value: user.uid },
      { field: 'tenantEmail', value: normalizedEmail },
      { field: 'reporterEmail', value: normalizedEmail },
      { field: 'requesterEmail', value: normalizedEmail },
      { field: 'unitId', value: unitData?.id || unitData?.unitId },
      { field: 'propertyId', value: unitData?.propertyId || propertyData?.id || contractData?.propertyId },
    ].filter((source) => source.value);

    const uniqueSources = Array.from(new Map(ticketSources.map((source) => [`${source.field}:${source.value}`, source])).values());
    const buckets: Record<string, any[]> = {};
    const publish = () => {
      const deduped = new Map<string, any>();
      Object.values(buckets).flat().forEach((ticket) => {
        if (ticket?.id && isActiveTicket(ticket)) deduped.set(ticket.id, ticket);
      });
      const rows = Array.from(deduped.values())
        .sort((a, b) => getMillis(b.updatedAt || b.createdAt) - getMillis(a.updatedAt || a.createdAt))
        .slice(0, 3);
      setActiveTickets(rows);
    };

    const unsubs = uniqueSources.map((source) => {
      const key = `${source.field}:${source.value}`;
      try {
        const qActive = query(collection(db, 'maintenanceTickets'), where(source.field, '==', source.value), limit(20));
        return onSnapshot(qActive, (snap) => {
          buckets[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          publish();
        }, (err) => {
          console.warn(`[TenantDashboard] active tickets listener failed for ${key}:`, err);
          setTicketReadWarning(tx('dash.ticketReadWarning', 'Some ticket records could not load. Your visible list may be incomplete until access rules are refreshed.'));
        });
      } catch (err) {
        console.warn(`[TenantDashboard] active ticket query could not start for ${key}:`, err);
        return () => undefined;
      }
    });

    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid, user?.email, unitData?.id, unitData?.unitId, unitData?.propertyId, propertyData?.id, contractData?.propertyId, tx]);

  useEffect(() => {
    const qNotices = query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), limit(2));
    const unsubNotices = onSnapshot(qNotices, (snap) => setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.warn('[TenantDashboard] notices listener failed:', err));
    return () => unsubNotices();
  }, []);

  const contractMode = useMemo(() => resolveContractMode(contractData || {}), [contractData]);
  const contractProfile = useMemo(() => getContractModeProfile(contractMode), [contractMode]);
  const propertyProfile = useMemo(() => getPropertyIntelligenceProfile(propertyData || {}, contractData || {}), [propertyData, contractData]);
  const showMaintenance = contractProfile.showMaintenance;
  const showManagement = contractProfile.showPropertyManagement;
  const showLedger = contractProfile.showRentLedger && propertyProfile.tenantContractRequired;

  const serviceButtons = useMemo(() => [
    { label: tx('service.deep_cleaning', 'Deep Cleaning'), icon: <Sparkles size={20} />, route: '/tenant/request?category=cleaning', visible: true },
    { label: tx('service.moving', 'Moving & Packing'), icon: <Truck size={20} />, route: '/tenant/request?category=moving', visible: true },
    { label: showMaintenance ? tx('nav.maintenance', 'Maintenance') : tx('service.contactMgmt', 'Contact Management'), icon: <Wrench size={20} />, route: showMaintenance ? '/tenant/request' : '/tenant/request?category=management', visible: true },
    { label: tx('nav.ai_studio', 'AI Design Studio'), icon: <Paintbrush size={20} />, route: '/tenant/design-studio', visible: true },
    { label: tx('service.handover', 'Move-In / Move-Out'), icon: <Home size={20} />, route: '/tenant/documents?type=handover', visible: true },
    { label: tx('service.gatePass', 'Gate Pass'), icon: <ShieldCheck size={20} />, route: '/tenant/gate-pass', visible: showManagement },
    { label: tx('service.amenities', 'Amenities'), icon: <Dumbbell size={20} />, route: '/tenant/amenities', visible: showManagement },
    { label: tx('service.notices', 'Notices'), icon: <Bell size={20} />, route: '/tenant/notices', visible: true },
    { label: tx('service.keys', 'Keys'), icon: <Key size={20} />, route: '/tenant/keys', visible: showManagement },
    { label: tx('service.parcels', 'Parcels'), icon: <Package size={20} />, route: '/tenant/parcels', visible: showManagement },
    { label: tx('service.visitor_parking', 'Visitor Parking'), icon: <Car size={20} />, route: '/tenant/visitor-parking', visible: showManagement },
    { label: tx('service.marketplace', 'Marketplace'), icon: <Store size={20} />, route: '/tenant/marketplace', visible: true },
    { label: tx('service.staff', 'Staff Directory'), icon: <Contact size={20} />, route: '/tenant/staff-directory', visible: showManagement },
    { label: tx('service.messages', 'Messages'), icon: <MessageSquare size={20} />, route: '/tenant/messages', visible: true },
    { label: tx('service.community', 'Community Board'), icon: <Users size={20} />, route: '/tenant/community', visible: true },
  ].filter((button) => button.visible), [showMaintenance, showManagement, tx]);

  if (loading) {
    return <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{tx('dash.terminal.tenant', 'TENANT DASHBOARD')}</Typography>
            <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{tx('dash.hello', 'Hello')}, {user?.displayName?.split(' ')[0] || tx('dash.resident', 'Resident')}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.48)', mt: 1 }}>{contractProfile.tenantSummary}</Typography>
          </Box>
          <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, fontWeight: 950 }}>{user?.displayName?.charAt(0) || 'R'}</Avatar>
        </Box>

        <RoleJourneyStrip role="tenant" dark />

        <Button variant="contained" onClick={() => navigate('/tenant/request')} data-testid="tenant-new-request" sx={{ alignSelf: isRTL ? 'flex-end' : 'flex-start', bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 4, fontWeight: 950, px: 4, py: 1.5 }}>
          {tx('dash.newRequestBtn', 'New Request')}
        </Button>

        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>{tx('dash.contractAccessMode', 'CONTRACT ACCESS MODE')}</Typography>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{contractProfile.tenantTitle}</Typography>
            </Box>
            <Chip label={contractMode.replace(/_/g, ' ')} sx={{ bgcolor: alpha(showMaintenance ? '#10b981' : '#3b82f6', 0.12), color: showMaintenance ? '#10b981' : '#93c5fd', fontWeight: 950 }} />
          </Stack>
          <Grid container spacing={2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.propType', 'PROPERTY TYPE')}</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{propertyProfile.propertyClass.replace(/_/g, ' ')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.leaseRent', 'LEASE / RENT')}</Typography><Typography sx={{ color: showLedger ? '#10b981' : '#f59e0b', fontWeight: 950 }}>{showLedger ? tx('dash.visible', 'Visible') : tx('dash.notIncluded', 'Not Included')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.maintenance', 'MAINTENANCE')}</Typography><Typography sx={{ color: showMaintenance ? '#10b981' : '#f59e0b', fontWeight: 950 }}>{showMaintenance ? tx('dash.enabled', 'Enabled') : tx('dash.mgmtRouted', 'Management Routed')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.unitArea', 'UNIT / AREA')}</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{unitData?.unitNumber || unitData?.unitId || tx('dash.propAccess', 'Property Access')}</Typography></Box></Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}><Button fullWidth variant="contained" onClick={() => navigate(showMaintenance ? '/tenant/request' : '/tenant/request?category=management')} startIcon={<Wrench size={24} />} sx={{ height: 96, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 5, fontWeight: 950, fontSize: '1rem' }}>{showMaintenance ? tx('dash.newRequestBtn', 'New Request') : tx('dash.managementRequest', 'Management Request')}</Button></Grid>
          <Grid item xs={12} md={4}><Button fullWidth variant="outlined" onClick={() => navigate('/tenant/emergency')} startIcon={<AlertTriangle size={24} />} sx={{ height: 96, borderColor: '#ef4444', color: '#ef4444', borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>{showMaintenance ? tx('dash.emergency_dispatch', 'Emergency Dispatch') : tx('dash.escalateMgmt', 'Escalate to Management')}</Button></Grid>
          <Grid item xs={12} md={4}><Button fullWidth variant="outlined" onClick={() => navigate('/tenant/design-studio')} startIcon={<Paintbrush size={24} />} sx={{ height: 96, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>{tx('nav.ai_studio', 'AI Design Studio')}</Button></Grid>
        </Grid>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><CreditCard size={20} /> {showLedger ? tx('dash.lease_financials', 'Lease & Financials') : tx('dash.paymentsDocsReceipts', 'Payments, Documents & Receipts')}</Typography>
                <Chip label={showLedger ? (contractData?.status === 'ACTIVE' ? tx('dash.activeLease', 'ACTIVE LEASE') : (contractData?.status || tx('dash.noActiveLease', 'NO ACTIVE LEASE')).replace(/_/g, ' ')) : tx('dash.accessControlled', 'ACCESS CONTROLLED')} sx={{ bgcolor: showLedger && contractData?.status === 'ACTIVE' ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)', color: showLedger && contractData?.status === 'ACTIVE' ? '#10b981' : 'rgba(255,255,255,0.65)', fontWeight: 950 }} />
              </Stack>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{tx('dash.contractTerm', 'CONTRACT TERM')}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '0.9rem' }}>{formatDate(contractData?.startDate || contractData?.validFrom)} - {formatDate(contractData?.endDate || contractData?.validTo)}</Typography></Box></Grid>
                <Grid item xs={12} md={4}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{showLedger ? tx('dash.upcomingPayment', 'UPCOMING PAYMENT') : tx('dash.receiptAccess', 'RECEIPT ACCESS')}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '1.1rem' }}>{showLedger && contractData?.rentAmount ? `AED ${Number(contractData.rentAmount).toLocaleString()}` : tx('dash.viaDocsVault', 'Documents Vault')}</Typography></Box></Grid>
                <Grid item xs={12} md={4}><Button fullWidth variant="contained" onClick={() => navigate(showLedger ? '/tenant/payments' : '/tenant/documents')} sx={{ height: '100%', minHeight: 80, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 4, fontWeight: 950 }}>{showLedger ? tx('dash.viewPayments', 'VIEW PAYMENTS') : tx('dash.viewDocsReceipts', 'VIEW DOCS / RECEIPTS')}</Button></Grid>
              </Grid>
              {!showLedger && <Alert severity="info" sx={{ mt: 3, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, color: '#fff', borderRadius: 4 }}>{tx('dash.ledgerHiddenInfo', 'Lease and rent ledger are not shown for this access mode. This dashboard still keeps service requests, property access, notices, documents, and receipts reachable.')}</Alert>}
            </Paper>

            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><Home size={20} /> {tx('dash.residency_details', 'Residency Details')}</Typography>
                <Chip label={propertyProfile.tenantContractRequired ? tx('dash.leaseOccupancy', 'Lease / Occupancy') : tx('dash.reporterAccess', 'Reporter Access')} sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950 }} />
              </Stack>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{tx('field.property', 'PROPERTY')}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{propertyData?.propertyName || propertyData?.name || tx('dash.verifying_location', 'Property verification pending')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 0.7, alignItems: 'center', mt: 1 }}><MapPin size={13} /> {propertyData?.emirate || 'UAE'}</Typography></Box></Grid>
                <Grid item xs={12} md={3}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{propertyProfile.tenantContractRequired ? tx('field.unit', 'UNIT') : tx('dash.areaRole', 'AREA / ROLE')}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{unitData?.unitNumber || unitData?.unitId || '—'}</Typography></Box></Grid>
                <Grid item xs={12} md={3}><Box sx={{ p: 3, bgcolor: alpha('#10b981', 0.06), borderRadius: 4, textAlign: 'center' }}><CheckCircle2 color="#10b981" /><Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950, display: 'block', mt: 1 }}>{tx('status.connected', 'Connected')}</Typography></Box></Grid>
              </Grid>
            </Paper>

            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 5, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><Activity size={20} color={binThemeTokens.gold} /> {tx('dash.active_tickets', 'Active Tickets')}</Typography>
            {activeTickets.length ? activeTickets.map((ticket) => (
              <Paper key={ticket.id} sx={{ p: 3, mb: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                <Stack direction="row" justifyContent="space-between" gap={2}><Box><Typography sx={{ color: '#fff', fontWeight: 950 }}>{ticket.description || ticket.category || tx('dash.maintenanceRequest', 'Maintenance request')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>REF: {ticket.id.substring(0, 8)} · {ticket.category || tx('dash.general', 'General')}</Typography></Box><Chip label={String(ticket.status || 'OPEN').replaceAll('_', ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} /></Stack>
                <Button size="small" onClick={() => navigate(`/tenant/ticket/${ticket.id}`)} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 950 }}>{tx('common.view_details', 'View Details')}</Button>
              </Paper>
            )) : <Paper sx={{ p: 5, textAlign: 'center', bgcolor: alpha('#10b981', 0.03), border: `1px dashed ${alpha('#10b981', 0.22)}`, borderRadius: 6 }}><CheckCircle2 color="#10b981" size={44} /><Typography sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>{tx('dash.no_tickets', 'No active maintenance tickets')}</Typography></Paper>}
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2 }}>{tx('dash.quick_services', 'Quick Services')}</Typography>
              <Grid container spacing={2}>{serviceButtons.map((service) => <Grid item xs={6} key={service.label}><Button fullWidth variant="outlined" onClick={() => navigate(service.route)} sx={{ minHeight: 112, flexDirection: 'column', gap: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 4, fontWeight: 900 }}><Box sx={{ color: binThemeTokens.gold }}>{service.icon}</Box>{service.label}</Button></Grid>)}</Grid>
            </Paper>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}><FileText size={20} /> {tx('dash.notices', 'Notices')}</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>{notices.length ? notices.map((notice) => <Box key={notice.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography sx={{ color: '#fff', fontWeight: 900 }}>{notice.title || tx('dash.systemUpdate', 'System Update')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{notice.message || tx('dash.buildingNotice', 'Building notice')}</Typography></Box>) : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{tx('dash.no_notices', 'No current notices.')}</Typography>}</Stack>
              <Button fullWidth variant="outlined" onClick={() => navigate('/tenant/documents')} sx={{ mt: 3, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>{tx('dash.open_vault', 'Open Document Vault')}</Button>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}

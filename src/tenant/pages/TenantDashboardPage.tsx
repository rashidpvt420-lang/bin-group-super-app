import { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, CreditCard, Dumbbell, FileText, Home, MapPin, Paintbrush, ShieldCheck, Sparkles, Truck, Wrench } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { getContractModeProfile, getPropertyIntelligenceProfile, resolveContractMode } from '../../utils/contractIntelligence';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

const formatDate = (value: any) => {
  if (!value) return 'Pending';
  if (typeof value === 'string') return value;
  if (value?.seconds) return new Date(value.seconds * 1000).toLocaleDateString();
  if (value?._seconds) return new Date(value._seconds * 1000).toLocaleDateString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Pending' : parsed.toLocaleDateString();
};

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

  useEffect(() => {
    let cancelled = false;
    async function loadResidence() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
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
          console.warn('[TenantDashboard] residence fetch failed: permission-denied. Failing silently with empty state.');
        } else {
          console.error('[TenantDashboard] residence fetch failed:', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadResidence();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!user?.uid) return;
    const qActive = query(collection(db, 'maintenanceTickets'), where('tenantId', '==', user.uid), where('status', 'not-in', ['CLOSED', 'DISPUTED']), orderBy('status'), orderBy('createdAt', 'desc'), limit(3));
    const unsubActive = onSnapshot(qActive, (snap) => setActiveTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.warn('[TenantDashboard] active tickets listener failed:', err));
    const qNotices = query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), limit(2));
    const unsubNotices = onSnapshot(qNotices, (snap) => setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (err) => console.warn('[TenantDashboard] notices listener failed:', err));
    return () => {
      unsubActive();
      unsubNotices();
    };
  }, [user?.uid]);

  const contractMode = useMemo(() => resolveContractMode(contractData || {}), [contractData]);
  const contractProfile = useMemo(() => getContractModeProfile(contractMode), [contractMode]);
  const propertyProfile = useMemo(() => getPropertyIntelligenceProfile(propertyData || {}, contractData || {}), [propertyData, contractData]);
  const showMaintenance = contractProfile.showMaintenance;
  const showManagement = contractProfile.showPropertyManagement;
  const showLedger = contractProfile.showRentLedger && propertyProfile.tenantContractRequired;

  const serviceButtons = useMemo(() => [
    { label: tx('service.deep_cleaning', 'Deep Cleaning', 'تنظيف عميق'), icon: <Sparkles size={20} />, route: '/tenant/request?category=cleaning', visible: true },
    { label: tx('service.moving', 'Moving & Packing', 'نقل وتغليف'), icon: <Truck size={20} />, route: '/tenant/request?category=moving', visible: true },
    { label: showMaintenance ? tx('nav.maintenance', 'Maintenance', 'الصيانة') : tx('service.contactMgmt', 'Contact Management', 'التواصل مع الإدارة'), icon: <Wrench size={20} />, route: showMaintenance ? '/tenant/request' : '/tenant/request?category=management', visible: true },
    { label: tx('nav.ai_studio', 'AI Design Studio', 'استوديو التصميم بالذكاء الاصطناعي'), icon: <Paintbrush size={20} />, route: '/tenant/design-studio', visible: true },
    { label: tx('service.gatePass', 'Gate Pass', 'تصريح الدخول'), icon: <ShieldCheck size={20} />, route: '/tenant/gate-pass', visible: showManagement },
    { label: tx('service.amenities', 'Amenities', 'المرافق'), icon: <Dumbbell size={20} />, route: '/tenant/amenities', visible: showManagement },
  ].filter((button) => button.visible), [showMaintenance, showManagement, tx]);

  if (loading) {
    return <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row', gap: 2 }}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{tx('dash.terminal.tenant', 'TENANT DASHBOARD', 'لوحة تحكم المستأجر')}</Typography>
            <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{tx('dash.hello', 'Hello', 'مرحباً')}, {user?.displayName?.split(' ')[0] || tx('dash.resident', 'Resident', 'مقيم')}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.48)', mt: 1 }}>{contractProfile.tenantSummary}</Typography>
          </Box>
          <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, fontWeight: 950 }}>{user?.displayName?.charAt(0) || 'R'}</Avatar>
        </Box>

        <Button
          variant="contained"
          onClick={() => navigate('/tenant/request')}
          data-testid="tenant-new-request"
          sx={{
            alignSelf: isRTL ? 'flex-end' : 'flex-start',
            bgcolor: binThemeTokens.gold,
            color: '#000',
            borderRadius: 4,
            fontWeight: 950,
            px: 4,
            py: 1.5,
          }}
        >
          {tx('dash.newRequestBtn', 'New Request', 'طلب جديد')}
        </Button>

        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} sx={{ mb: 3 }}>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>CONTRACT ACCESS MODE</Typography>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950 }}>{contractProfile.tenantTitle}</Typography>
            </Box>
            <Chip label={contractMode.replace(/_/g, ' ')} sx={{ bgcolor: alpha(showMaintenance ? '#10b981' : '#3b82f6', 0.12), color: showMaintenance ? '#10b981' : '#93c5fd', fontWeight: 950 }} />
          </Stack>
          <Grid container spacing={2} sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.propType', 'PROPERTY TYPE', 'نوع العقار')}</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{propertyProfile.propertyClass.replace(/_/g, ' ')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.leaseRent', 'LEASE / RENT', 'الإيجار / العقد')}</Typography><Typography sx={{ color: showLedger ? '#10b981' : '#f59e0b', fontWeight: 950 }}>{showLedger ? tx('dash.visible', 'Visible', 'مرئي') : tx('dash.notIncluded', 'Not Included', 'غير مشمول')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.maintenance', 'MAINTENANCE', 'الصيانة')}</Typography><Typography sx={{ color: showMaintenance ? '#10b981' : '#f59e0b', fontWeight: 950 }}>{showMaintenance ? tx('dash.enabled', 'Enabled', 'مفعل') : tx('dash.mgmtRouted', 'Management Routed', 'موجه للإدارة')}</Typography></Box></Grid>
            <Grid item xs={12} md={3}><Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 950 }}>{tx('dash.unitArea', 'UNIT / AREA', 'الوحدة / المساحة')}</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{unitData?.unitNumber || unitData?.unitId || tx('dash.propAccess', 'Property Access', 'وصول العقار')}</Typography></Box></Grid>
          </Grid>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}><Button fullWidth variant="contained" onClick={() => navigate(showMaintenance ? '/tenant/request' : '/tenant/request?category=management')} startIcon={<Wrench size={24} />} sx={{ height: 96, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 5, fontWeight: 950, fontSize: '1rem' }}>{showMaintenance ? 'New Request' : 'Management Request'}</Button></Grid>
          <Grid item xs={12} md={4}><Button fullWidth variant="outlined" onClick={() => navigate('/tenant/emergency')} startIcon={<AlertTriangle size={24} />} sx={{ height: 96, borderColor: '#ef4444', color: '#ef4444', borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>{showMaintenance ? (t('dash.emergency_dispatch') || 'Emergency Dispatch') : 'Escalate to Management'}</Button></Grid>
          <Grid item xs={12} md={4}><Button fullWidth variant="outlined" onClick={() => navigate('/tenant/design-studio')} startIcon={<Paintbrush size={24} />} sx={{ height: 96, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>{t('nav.ai_studio') || 'AI Design Studio'}</Button></Grid>
        </Grid>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={8}>
            {showLedger ? (
              <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                  <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><CreditCard size={20} /> {t('dash.lease_financials') || 'Lease & Financials'}</Typography>
                  <Chip label={contractData?.status === 'ACTIVE' ? 'ACTIVE LEASE' : (contractData?.status || 'NO ACTIVE LEASE').replace(/_/g, ' ')} sx={{ bgcolor: contractData?.status === 'ACTIVE' ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)', color: contractData?.status === 'ACTIVE' ? '#10b981' : 'rgba(255,255,255,0.5)', fontWeight: 950 }} />
                </Stack>
                <Grid container spacing={3}>
                  <Grid item xs={12} md={4}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>CONTRACT TERM</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '0.9rem' }}>{formatDate(contractData?.startDate || contractData?.validFrom)} - {formatDate(contractData?.endDate || contractData?.validTo)}</Typography></Box></Grid>
                  <Grid item xs={12} md={4}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>UPCOMING PAYMENT</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '1.1rem' }}>{contractData?.rentAmount ? `AED ${Number(contractData.rentAmount).toLocaleString()}` : '—'}</Typography></Box></Grid>
                  <Grid item xs={12} md={4}><Button fullWidth variant="contained" onClick={() => navigate('/tenant/documents')} sx={{ height: '100%', minHeight: 80, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 4, fontWeight: 950 }}>VIEW LEDGER / DOCUMENTS</Button></Grid>
                </Grid>
              </Paper>
            ) : (
              <Alert severity="info" sx={{ mb: 4, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, color: '#fff', borderRadius: 4 }}>Lease and rent ledger are not shown for this access mode. This dashboard focuses on service requests, property access, notices, and available management tools.</Alert>
            )}

            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><Home size={20} /> {t('dash.residency_details') || 'Residency Details'}</Typography>
                <Chip label={propertyProfile.tenantContractRequired ? 'Lease / Occupancy' : 'Reporter Access'} sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950 }} />
              </Stack>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{t('field.property') || 'PROPERTY'}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{propertyData?.propertyName || propertyData?.name || t('dash.verifying_location') || 'Property verification pending'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 0.7, alignItems: 'center', mt: 1 }}><MapPin size={13} /> {propertyData?.emirate || 'UAE'}</Typography></Box></Grid>
                <Grid item xs={12} md={3}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{propertyProfile.tenantContractRequired ? (t('field.unit') || 'UNIT') : 'AREA / ROLE'}</Typography><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{unitData?.unitNumber || unitData?.unitId || '—'}</Typography></Box></Grid>
                <Grid item xs={12} md={3}><Box sx={{ p: 3, bgcolor: alpha('#10b981', 0.06), borderRadius: 4, textAlign: 'center' }}><CheckCircle2 color="#10b981" /><Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950, display: 'block', mt: 1 }}>{t('status.connected') || 'Connected'}</Typography></Box></Grid>
              </Grid>
            </Paper>

            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 5, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><Activity size={20} color={binThemeTokens.gold} /> {t('dash.active_tickets') || 'Active Tickets'}</Typography>
            {activeTickets.length ? activeTickets.map((ticket) => (
              <Paper key={ticket.id} sx={{ p: 3, mb: 2, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                <Stack direction="row" justifyContent="space-between" gap={2}><Box><Typography sx={{ color: '#fff', fontWeight: 950 }}>{ticket.description || ticket.category || 'Maintenance request'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>REF: {ticket.id.substring(0, 8)} · {ticket.category || 'General'}</Typography></Box><Chip label={String(ticket.status || 'OPEN').replaceAll('_', ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} /></Stack>
                <Button size="small" onClick={() => navigate(`/tenant/ticket/${ticket.id}`)} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 950 }}>{t('common.view_details') || 'View Details'}</Button>
              </Paper>
            )) : <Paper sx={{ p: 5, textAlign: 'center', bgcolor: alpha('#10b981', 0.03), border: `1px dashed ${alpha('#10b981', 0.22)}`, borderRadius: 6 }}><CheckCircle2 color="#10b981" size={44} /><Typography sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>{t('dash.no_tickets') || 'No active maintenance tickets'}</Typography></Paper>}
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2 }}>{t('dash.quick_services') || 'Quick Services'}</Typography>
              <Grid container spacing={2}>{serviceButtons.map((service) => <Grid item xs={6} key={service.label}><Button fullWidth variant="outlined" onClick={() => navigate(service.route)} sx={{ minHeight: 112, flexDirection: 'column', gap: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 4, fontWeight: 900 }}><Box sx={{ color: binThemeTokens.gold }}>{service.icon}</Box>{service.label}</Button></Grid>)}</Grid>
            </Paper>
            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}><FileText size={20} /> {t('dash.notices') || 'Notices'}</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>{notices.length ? notices.map((notice) => <Box key={notice.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography sx={{ color: '#fff', fontWeight: 900 }}>{notice.title || 'System Update'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{notice.message || 'Building notice'}</Typography></Box>) : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{t('dash.no_notices') || 'No current notices.'}</Typography>}</Stack>
              <Button fullWidth variant="outlined" onClick={() => navigate('/tenant/documents')} sx={{ mt: 3, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>{t('dash.open_vault') || 'Open Document Vault'}</Button>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}


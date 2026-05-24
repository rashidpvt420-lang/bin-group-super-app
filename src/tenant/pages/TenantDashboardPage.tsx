import { useEffect, useState } from 'react';
import {
  Avatar,
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
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Home,
  MapPin,
  MessageSquare,
  Paintbrush,
  Sparkles,
  Truck,
  Wrench,
  CreditCard,
  ShieldCheck,
  Dumbbell,
  Calendar,
} from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantDashboardPage() {
  const { user } = useRole();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [unitData, setUnitData] = useState<any>(null);
  const [contractData, setContractData] = useState<any>(null);
  const [activeTickets, setActiveTickets] = useState<any[]>([]);
  const [notices, setNotices] = useState<any[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function fetchResidence() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())));
        }
        if (!unitSnap.empty) {
          const uData: any = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() };
          if (!cancelled) setUnitData(uData);
          if (uData.propertyId) {
            const propSnap = await getDoc(doc(db, 'properties', uData.propertyId));
            if (propSnap.exists() && !cancelled) setPropertyData({ id: propSnap.id, ...propSnap.data() });
          }

          const contractSnap = await getDocs(query(collection(db, 'contracts'), where('tenantId', '==', user.uid), orderBy('createdAt', 'desc'), limit(1)));
          if (!contractSnap.empty && !cancelled) {
            setContractData({ id: contractSnap.docs[0].id, ...contractSnap.docs[0].data() });
          }
        }
      } catch (err) {
        console.error('[TenantDashboard] residence fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchResidence();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email]);

  useEffect(() => {
    if (!user?.uid) return;
    const qActive = query(
      collection(db, 'maintenanceTickets'),
      where('tenantId', '==', user.uid),
      where('status', 'not-in', ['CLOSED', 'DISPUTED']),
      orderBy('status'),
      orderBy('createdAt', 'desc'),
      limit(3)
    );
    const unsubActive = onSnapshot(qActive, (snap) => {
      setActiveTickets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('[TenantDashboard] active tickets listener failed:', err));

    const qNotices = query(collection(db, 'systemLogs'), where('type', '==', 'TENANT_NOTICE'), limit(2));
    const unsubNotices = onSnapshot(qNotices, (snap) => {
      setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn('[TenantDashboard] notices listener failed:', err));

    return () => {
      unsubActive();
      unsubNotices();
    };
  }, [user?.uid]);

  if (loading) {
    return (
      <Box sx={{ minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  const addons = [
    { label: t('service.deep_cleaning') || 'Deep Cleaning', icon: <Sparkles size={20} />, route: '/tenant/request?category=cleaning' },
    { label: t('service.moving') || 'Moving & Packing', icon: <Truck size={20} />, route: '/tenant/request?category=moving' },
    { label: t('nav.maintenance') || 'Maintenance', icon: <Wrench size={20} />, route: '/tenant/request' },
    { label: t('nav.ai_studio') || 'AI Design Studio', icon: <Paintbrush size={20} />, route: '/tenant/design-studio' },
    { label: 'Gate Pass', icon: <ShieldCheck size={20} />, route: '/tenant/gate-pass' },
    { label: 'Amenities', icon: <Dumbbell size={20} />, route: '/tenant/amenities' },
  ];

  return (
    <Box sx={{ pb: 8, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack spacing={4}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{t('dash.terminal.tenant') || 'TENANT DASHBOARD'}</Typography>
            <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, mt: 1 }}>{t('dash.hello') || 'Hello'}, {user?.displayName?.split(' ')[0] || 'Resident'}</Typography>
            <Typography sx={{ color: 'rgba(255,255,255,0.48)', mt: 1 }}>{t('dash.tenant_desc') || 'Submit complaints, track technicians, access documents, and open AI Studio.'}</Typography>
          </Box>
          <Avatar sx={{ width: 64, height: 64, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.35)}`, fontWeight: 950 }}>
            {user?.displayName?.charAt(0) || 'R'}
          </Avatar>
        </Box>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Button fullWidth variant="contained" onClick={() => navigate('/tenant/request')} startIcon={<Wrench size={24} />} sx={{ height: 96, bgcolor: binThemeTokens.gold, color: '#000', borderRadius: 5, fontWeight: 950, fontSize: '1rem' }}>
              {t('dash.new_request') || 'New Complaint / Request'}
            </Button>
          </Grid>
          <Grid item xs={12} md={4}>
            <Button fullWidth variant="outlined" onClick={() => navigate('/tenant/emergency')} startIcon={<AlertTriangle size={24} />} sx={{ height: 96, borderColor: '#ef4444', color: '#ef4444', borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>
              {t('dash.emergency_dispatch') || 'Emergency Dispatch'}
            </Button>
          </Grid>
          <Grid item xs={12} md={4}>
            <Button fullWidth variant="outlined" onClick={() => navigate('/tenant/design-studio')} startIcon={<Paintbrush size={24} />} sx={{ height: 96, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderRadius: 5, borderWidth: 2, fontWeight: 950, fontSize: '1rem' }}>
              {t('nav.ai_studio') || 'AI Design Studio'}
            </Button>
          </Grid>
        </Grid>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><CreditCard size={20} /> {t('dash.lease_financials') || 'Lease & Financials'}</Typography>
                <Chip label={contractData?.status === 'ACTIVE' ? 'ACTIVE LEASE' : (contractData?.status || 'NO ACTIVE LEASE').replace(/_/g, ' ')} sx={{ bgcolor: contractData?.status === 'ACTIVE' ? alpha('#10b981', 0.1) : 'rgba(255,255,255,0.05)', color: contractData?.status === 'ACTIVE' ? '#10b981' : 'rgba(255,255,255,0.5)', fontWeight: 950 }} />
                </Stack>
                <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>CONTRACT TERM</Typography>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '0.9rem' }}>
                        {contractData?.startDate ? new Date(contractData.startDate.seconds * 1000).toLocaleDateString() : 'Pending'} - {contractData?.endDate ? new Date(contractData.endDate.seconds * 1000).toLocaleDateString() : 'Pending'}
                    </Typography>
                    </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>UPCOMING PAYMENT</Typography>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, fontSize: '1.1rem' }}>
                        {contractData?.rentAmount ? `AED ${Number(contractData.rentAmount).toLocaleString()}` : '—'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#10b981', display: 'flex', gap: 0.7, alignItems: 'center', mt: 1, fontWeight: 900 }}><Calendar size={13} /> {contractData?.nextPaymentDate ? new Date(contractData.nextPaymentDate.seconds * 1000).toLocaleDateString() : 'No Pending Invoices'}</Typography>
                    </Box>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Button fullWidth variant="contained" onClick={() => navigate('/tenant/documents')} sx={{ height: '100%', minHeight: 80, bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.3)}`, borderRadius: 4, fontWeight: 950 }}>
                        VIEW LEDGER / DOCUMENTS
                    </Button>
                </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1.2 }}><Home size={20} /> {t('dash.residency_details') || 'Residency Details'}</Typography>
                <Chip label={t('status.lease_active') || 'Lease Active'} sx={{ bgcolor: alpha('#10b981', 0.1), color: '#10b981', fontWeight: 950 }} />
              </Stack>
              <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{t('field.property') || 'PROPERTY'}</Typography>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{propertyData?.propertyName || propertyData?.name || t('dash.verifying_location') || 'Property verification pending'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'flex', gap: 0.7, alignItems: 'center', mt: 1 }}><MapPin size={13} /> {propertyData?.emirate || 'UAE'}</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950 }}>{t('field.unit') || 'UNIT'}</Typography>
                    <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{unitData?.unitNumber || '—'}</Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} md={3}>
                  <Box sx={{ p: 3, bgcolor: alpha('#10b981', 0.06), borderRadius: 4, textAlign: 'center' }}>
                    <CheckCircle2 color="#10b981" />
                    <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 950, display: 'block', mt: 1 }}>{t('status.connected') || 'Connected'}</Typography>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mt: 5, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}><Activity size={20} color={binThemeTokens.gold} /> {t('dash.active_tickets') || 'Active Tickets'}</Typography>
            {activeTickets.length ? (
              <Stack spacing={2}>
                {activeTickets.map((ticket) => (
                  <Paper key={ticket.id} sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4 }}>
                    <Stack direction="row" justifyContent="space-between" gap={2}>
                      <Box>
                        <Typography sx={{ color: '#fff', fontWeight: 950 }}>{ticket.description || ticket.category || 'Maintenance request'}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>REF: {ticket.id.substring(0, 8)} · {ticket.category || 'General'}</Typography>
                      </Box>
                      <Chip label={String(ticket.status || 'OPEN').replaceAll('_', ' ')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }} />
                    </Stack>
                    <Button size="small" onClick={() => navigate(`/tenant/ticket/${ticket.id}`)} sx={{ mt: 2, color: binThemeTokens.gold, fontWeight: 950 }}>{t('common.view_details') || 'View Details'}</Button>
                  </Paper>
                ))}
              </Stack>
            ) : (
              <Paper sx={{ p: 5, textAlign: 'center', bgcolor: alpha('#10b981', 0.03), border: `1px dashed ${alpha('#10b981', 0.22)}`, borderRadius: 6 }}>
                <CheckCircle2 color="#10b981" size={44} />
                <Typography sx={{ color: '#fff', fontWeight: 950, mt: 2 }}>{t('dash.no_tickets') || 'No active maintenance tickets'}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{t('dash.residence_stable') || 'Your residence is stable.'}</Typography>
              </Paper>
            )}
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: 3, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, mb: 4 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, mb: 2 }}>{t('dash.quick_services') || 'Quick Services'}</Typography>
              <Grid container spacing={2}>
                {addons.map((service) => (
                  <Grid item xs={6} key={service.label}>
                    <Button fullWidth variant="outlined" onClick={() => navigate(service.route)} sx={{ minHeight: 112, flexDirection: 'column', gap: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#fff', borderRadius: 4, fontWeight: 900 }}>
                      <Box sx={{ color: binThemeTokens.gold }}>{service.icon}</Box>
                      {service.label}
                    </Button>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
              <Typography variant="h6" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', gap: 1, alignItems: 'center' }}><FileText size={20} /> {t('dash.notices') || 'Notices'}</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                {notices.length ? notices.map((notice) => (
                  <Box key={notice.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}>
                    <Typography sx={{ color: '#fff', fontWeight: 900 }}>{notice.title || 'System Update'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>{notice.message || 'Building notice'}</Typography>
                  </Box>
                )) : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{t('dash.no_notices') || 'No current notices.'}</Typography>}
              </Stack>
              <Button fullWidth variant="outlined" onClick={() => navigate('/tenant/documents')} sx={{ mt: 3, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, fontWeight: 950 }}>{t('dash.open_vault') || 'Open Document Vault'}</Button>
            </Paper>

            <Paper sx={{ p: 3, mt: 4, bgcolor: alpha(binThemeTokens.gold, 0.04), border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6 }}>
              <Typography variant="subtitle2" sx={{ color: binThemeTokens.gold, fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}><MessageSquare size={18} /> {t('dash.resident_support') || 'Resident Support'}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)', display: 'block', mt: 1 }}>{t('dash.support_info') || 'Use the AI button or submit a ticket for support.'}</Typography>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Box>
  );
}

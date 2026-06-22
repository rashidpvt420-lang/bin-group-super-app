import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { AlertTriangle, Bot, CalendarCheck, Car, CheckCircle2, Clock, Home, Package, ShieldCheck, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, db, limit, onSnapshot, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

type SmartHomeStatusProps = {
  activeTickets: any[];
  notices: any[];
  showManagement: boolean;
};

const getSeconds = (value: any) => Number(value?.seconds || value?._seconds || 0);
const firstRecent = (items: any[], timeFields: string[]) => {
  const sorted = [...items].sort((a, b) => {
    const aTime = timeFields.reduce((max, field) => Math.max(max, getSeconds(a?.[field])), 0);
    const bTime = timeFields.reduce((max, field) => Math.max(max, getSeconds(b?.[field])), 0);
    return bTime - aTime;
  });
  return sorted[0] || null;
};

export default function TenantSmartHomeStatus({ activeTickets, notices, showManagement }: SmartHomeStatusProps) {
  const navigate = useNavigate();
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [bookings, setBookings] = useState<any[]>([]);
  const [parcels, setParcels] = useState<any[]>([]);
  const [parkingPasses, setParkingPasses] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs: Array<() => void> = [];
    const attach = (collectionName: string, setter: React.Dispatch<React.SetStateAction<any[]>>, timeFields: string[]) => {
      try {
        const q = query(collection(db, collectionName), where('tenantUid', '==', user.uid), limit(8));
        const unsub = onSnapshot(q, (snap) => {
          const rows = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          rows.sort((a, b) => {
            const aTime = timeFields.reduce((max, field) => Math.max(max, getSeconds(a?.[field])), 0);
            const bTime = timeFields.reduce((max, field) => Math.max(max, getSeconds(b?.[field])), 0);
            return bTime - aTime;
          });
          setter(rows);
        }, (err) => console.warn(`[TenantSmartHomeStatus] ${collectionName} listener failed:`, err));
        unsubs.push(unsub);
      } catch (err) {
        console.warn(`[TenantSmartHomeStatus] could not attach ${collectionName}:`, err);
      }
    };

    attach('amenityBookings', setBookings, ['slotStartAt', 'createdAt']);
    attach('parcels', setParcels, ['receivedAt', 'createdAt']);
    attach('visitorParkingRequests', setParkingPasses, ['visitStartAt', 'createdAt']);
    return () => unsubs.forEach((unsub) => unsub());
  }, [user?.uid]);

  const activeTicket = activeTickets[0] || null;
  const upcomingBooking = useMemo(() => firstRecent(bookings.filter((item) => !['cancelled', 'rejected'].includes(String(item.status || '').toLowerCase())), ['slotStartAt', 'createdAt']), [bookings]);
  const parcelWaiting = useMemo(() => parcels.find((item) => ['received', 'notified', 'waiting'].includes(String(item.status || '').toLowerCase())) || null, [parcels]);
  const parkingPass = useMemo(() => firstRecent(parkingPasses.filter((item) => ['approved', 'pending'].includes(String(item.status || '').toLowerCase())), ['visitStartAt', 'createdAt']), [parkingPasses]);
  const latestNotice = notices[0] || null;

  const tracker = [
    { key: 'accepted', label: tx('tracker.accepted', 'Accepted'), active: ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(String(activeTicket?.status || '').toUpperCase()) },
    { key: 'en_route', label: tx('tracker.en_route', 'On the way'), active: ['EN_ROUTE', 'ARRIVED', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(String(activeTicket?.status || '').toUpperCase()) },
    { key: 'onsite', label: tx('tracker.onsite', 'On-site'), active: ['ARRIVED', 'ON_SITE', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'].includes(String(activeTicket?.status || '').toUpperCase()) },
    { key: 'proof', label: tx('tracker.proof', 'Proof'), active: Boolean(activeTicket?.afterPhotoUrl || activeTicket?.evidenceStatus === 'TENANT_EVIDENCE_UPLOADED' || ['COMPLETED', 'CLOSED'].includes(String(activeTicket?.status || '').toUpperCase())) },
  ];

  const statusCards = [
    {
      icon: <Wrench size={20} />,
      title: tx('smart.active_issue', 'Active issue'),
      value: activeTicket ? String(activeTicket.category || activeTicket.issueType || activeTicket.description || 'Maintenance') : tx('smart.no_issue', 'No active issue'),
      chip: activeTicket ? String(activeTicket.status || 'OPEN').replace(/_/g, ' ') : tx('status.clear', 'CLEAR'),
      color: activeTicket ? binThemeTokens.gold : '#10b981',
      route: activeTicket ? `/tenant/ticket/${activeTicket.id}` : '/tenant/request',
    },
    {
      icon: <CalendarCheck size={20} />,
      title: tx('smart.next_booking', 'Amenity booking'),
      value: upcomingBooking ? String(upcomingBooking.amenityName || upcomingBooking.amenityType || 'Amenity') : tx('smart.no_booking', 'Nothing booked'),
      chip: upcomingBooking ? String(upcomingBooking.status || 'pending') : tx('smart.book', 'BOOK'),
      color: upcomingBooking ? '#3b82f6' : 'rgba(255,255,255,0.34)',
      route: '/tenant/amenities',
    },
    {
      icon: <Package size={20} />,
      title: tx('smart.parcel', 'Parcel'),
      value: parcelWaiting ? String(parcelWaiting.courierName || 'Parcel waiting') : tx('smart.no_parcel', 'No parcel waiting'),
      chip: parcelWaiting ? tx('smart.collect', 'COLLECT') : tx('status.clear', 'CLEAR'),
      color: parcelWaiting ? binThemeTokens.gold : '#10b981',
      route: '/tenant/parcels',
    },
    {
      icon: <Car size={20} />,
      title: tx('smart.visitor_pass', 'Visitor pass'),
      value: parkingPass ? String(parkingPass.visitorName || parkingPass.vehiclePlate || 'Visitor pass') : tx('smart.no_pass', 'No active pass'),
      chip: parkingPass ? String(parkingPass.status || 'pending') : tx('smart.request', 'REQUEST'),
      color: parkingPass?.status === 'approved' ? '#10b981' : binThemeTokens.gold,
      route: '/tenant/visitor-parking',
    },
  ];

  return (
    <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'linear-gradient(135deg, rgba(15,23,42,.88), rgba(2,6,23,.92))', border: `1px solid ${alpha(binThemeTokens.gold, 0.16)}`, borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at ${isRTL ? '10%' : '90%'} 0%, ${alpha(binThemeTokens.gold, 0.16)}, transparent 34%)`, pointerEvents: 'none' }} />
      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3} sx={{ position: 'relative', zIndex: 1, mb: 3 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>{tx('smart.home_status', 'MY HOME STATUS')}</Typography>
          <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5 }}>{tx('smart.daily_control', 'Daily control without calling anyone')}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.52)', mt: 1 }}>{tx('smart.daily_desc', 'Issue, booking, parcel, visitor pass, notice, and emergency access in one trusted screen.')}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ minWidth: { md: 330 } }}>
          <Button fullWidth variant="contained" startIcon={<SafeIcon icon={Bot} size={18} />} onClick={() => navigate('/tenant/ai-concierge')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>{tx('smart.ai', 'BIN AI Concierge')}</Button>
          <Button fullWidth variant="outlined" startIcon={<SafeIcon icon={AlertTriangle} size={18} />} onClick={() => navigate('/tenant/emergency')} sx={{ borderColor: '#ef4444', color: '#ef4444', fontWeight: 950, borderRadius: 4 }}>{tx('smart.emergency', 'Emergency')}</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ position: 'relative', zIndex: 1 }}>
        {statusCards.map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.title}>
            <Paper onClick={() => navigate(item.route)} sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(255,255,255,0.035)', border: `1px solid ${alpha(item.color, 0.22)}`, borderRadius: 4, cursor: 'pointer', transition: 'all .18s ease', '&:hover': { transform: 'translateY(-2px)', borderColor: item.color } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Box sx={{ color: item.color }}>{item.icon}</Box>
                <Chip size="small" label={item.chip} sx={{ bgcolor: alpha(item.color, 0.12), color: item.color, fontWeight: 950, fontSize: '0.62rem' }} />
              </Stack>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)', fontWeight: 900, letterSpacing: 1 }}>{item.title.toUpperCase()}</Typography>
              <Typography sx={{ color: '#fff', fontWeight: 950, mt: 0.6, minHeight: 44, lineHeight: 1.25 }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {activeTicket && (
        <Box sx={{ mt: 3, p: 2.5, borderRadius: 4, bgcolor: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={2}>
            <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
              <Typography sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><SafeIcon icon={ShieldCheck} size={18} style={{ color: binThemeTokens.gold }} /> {tx('smart.technician_command', 'Technician Live Command')}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.48)' }}>{tx('smart.command_desc', 'Accept → On the way → On-site → before/after proof → tenant approve/dispute.')}</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={isRTL ? 'flex-end' : 'flex-start'}>
              {tracker.map((step) => <Chip key={step.key} icon={step.active ? <CheckCircle2 size={14} /> : <Clock size={14} />} label={step.label} sx={{ mb: 1, bgcolor: step.active ? alpha('#10b981', 0.12) : 'rgba(255,255,255,0.04)', color: step.active ? '#10b981' : 'rgba(255,255,255,0.46)', fontWeight: 900, '& .MuiChip-icon': { color: step.active ? '#10b981' : 'rgba(255,255,255,0.3)' } }} />)}
            </Stack>
          </Stack>
        </Box>
      )}

      {latestNotice && (
        <Box sx={{ mt: 2.5, p: 2.5, borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.05), border: `1px solid ${alpha(binThemeTokens.gold, 0.14)}`, position: 'relative', zIndex: 1, textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 1 }}>{tx('smart.latest_notice', 'LATEST BUILDING NOTICE')}</Typography>
          <Typography sx={{ color: '#fff', fontWeight: 900 }}>{latestNotice.title || tx('dash.systemUpdate', 'System Update')}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>{latestNotice.message || tx('dash.buildingNotice', 'Building notice')}</Typography>
        </Box>
      )}

      {showManagement && (
        <Button onClick={() => navigate('/tenant/move-inspection')} startIcon={<SafeIcon icon={Home} size={16} />} sx={{ mt: 3, color: binThemeTokens.gold, fontWeight: 950, position: 'relative', zIndex: 1 }}>{tx('smart.move_inspection', 'Open Move-In / Move-Out Inspection')}</Button>
      )}
    </Paper>
  );
}

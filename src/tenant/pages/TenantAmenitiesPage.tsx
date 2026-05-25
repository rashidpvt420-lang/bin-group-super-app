import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Container, Grid, Button, alpha, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Select, FormControl, InputLabel, CircularProgress, Stack, Card, CardContent } from '@mui/material';
import { Dumbbell, CalendarRange, MapPin, Coffee, Waves, Trash2, Calendar, Clock } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, addDoc, onSnapshot, query, where, doc, deleteDoc, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';

export default function TenantAmenitiesPage() {
  const { t, isRTL } = useLanguage();
  const { user } = useRole();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openAdd, setOpenAdd] = useState(false);
  const [selectedAmenity, setSelectedAmenity] = useState<any>(null);
  const [bookingDate, setBookingDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('09:00 AM - 11:00 AM');
  const [submitting, setSubmitting] = useState(false);

  const amenities = [
    { name: 'Fitness Center', icon: <Dumbbell size={24} />, status: 'Available', color: '#10b981', location: 'Ground Floor' },
    { name: 'Community Pool', icon: <Waves size={24} />, status: 'Available', color: '#3b82f6', location: 'Podium Level' },
    { name: 'Resident Majlis', icon: <Coffee size={24} />, status: 'Requires Booking', color: binThemeTokens.gold, location: 'Clubhouse Entrance' },
  ];

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const q = query(collection(db, 'amenityBookings'), where('tenantUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const list: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toDate?.()?.getTime?.() || 0) - (a.createdAt?.toDate?.()?.getTime?.() || 0));
      setBookings(list);
      setLoading(false);
    }, (err) => { console.error('Amenity bookings listener error:', err); setLoading(false); });
    return () => unsub();
  }, [user?.uid]);

  const handleOpenBooking = (amenity: any) => {
    setSelectedAmenity(amenity);
    setBookingDate(new Date().toISOString().split('T')[0]);
    setOpenAdd(true);
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !selectedAmenity || !bookingDate) return;
    setSubmitting(true);
    try {
      await addDoc(collection(db, 'amenityBookings'), { tenantUid: user.uid, tenantName: user.displayName || 'Resident', amenityName: selectedAmenity.name, bookingDate, timeSlot, status: 'booked', createdAt: serverTimestamp() });
      setOpenAdd(false); setSelectedAmenity(null); setBookingDate(''); setTimeSlot('09:00 AM - 11:00 AM');
    } catch (err) { console.error('Failed to book slot', err); alert('Failed to book slot: ' + (err instanceof Error ? err.message : String(err))); }
    finally { setSubmitting(false); }
  };

  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking slot?')) return;
    try { await deleteDoc(doc(db, 'amenityBookings', bookingId)); }
    catch (err) { console.error('Failed to cancel booking', err); alert('Failed to cancel booking.'); }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 6, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><Dumbbell size={36} color={binThemeTokens.gold} /> {t('tenant.amenities.title') || 'Amenities'}</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>{t('tenant.amenities.desc') || 'Book community spaces and access resident amenities.'}</Typography>
      </Box>
      <Grid container spacing={4}>{amenities.map((item) => <Grid item xs={12} md={4} key={item.name}><Paper sx={{ p: 4, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, display: 'flex', flexDirection: 'column', height: '100%' }}><Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}><Box sx={{ p: 1.5, bgcolor: alpha(item.color, 0.1), color: item.color, borderRadius: 3 }}>{item.icon}</Box><Typography variant="caption" sx={{ color: item.color, fontWeight: 900, px: 2, py: 0.5, bgcolor: alpha(item.color, 0.1), borderRadius: 2, height: 'fit-content' }}>{item.status.toUpperCase()}</Typography></Box><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 1, textAlign: isRTL ? 'right' : 'left' }}>{item.name}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 0.5, mb: 3, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><MapPin size={14} /> {item.location}</Typography><Box sx={{ mt: 'auto' }}><Button fullWidth variant="outlined" onClick={() => handleOpenBooking(item)} startIcon={<CalendarRange size={16} />} sx={{ borderColor: 'rgba(255,255,255,0.1)', color: '#fff', fontWeight: 950, borderRadius: 3 }}>{t('tenant.amenities.book') || 'BOOK SLOT'}</Button></Box></Paper></Grid>)}</Grid>
      <Box sx={{ mt: 8 }}><Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}><CalendarRange size={24} color={binThemeTokens.gold} /> {t('tenant.amenities.myBookings') || 'My Booked Slots'}</Typography>{loading ? <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={30} sx={{ color: binThemeTokens.gold }} /></Box> : bookings.length === 0 ? <Paper sx={{ p: 4, bgcolor: 'rgba(22, 22, 24, 0.4)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 5, textAlign: 'center' }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)' }}>No active amenity bookings found.</Typography></Paper> : <Grid container spacing={3}>{bookings.map((booking) => <Grid item xs={12} md={6} key={booking.id}><Card sx={{ bgcolor: 'rgba(22, 22, 24, 0.7)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 4 }}><CardContent sx={{ p: 3 }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Stack spacing={0.5}><Typography variant="body1" fontWeight="950" color="#FFF">{booking.amenityName}</Typography><Stack direction="row" spacing={2} sx={{ mt: 1 }}><Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Calendar size={13} /> {booking.bookingDate}</Typography><Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><Clock size={13} /> {booking.timeSlot}</Typography></Stack></Stack><Button variant="outlined" color="error" size="small" onClick={() => handleCancelBooking(booking.id)} startIcon={<Trash2 size={13} />} sx={{ fontWeight: 900, borderRadius: 2 }}>CANCEL</Button></Stack></CardContent></Card></Grid>)}</Grid>}</Box>
      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: { xs: '90%', sm: 400 } } }}><form onSubmit={handleCreateBooking}><DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>Book {selectedAmenity?.name}</DialogTitle><DialogContent sx={{ p: 4 }}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>Select the date and time slot you would like to book this facility.</Typography><Stack spacing={3}><TextField fullWidth type="date" label="Booking Date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} InputLabelProps={{ shrink: true }} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} /><FormControl fullWidth variant="filled"><InputLabel sx={{ color: 'rgba(255,255,255,0.5)' }}>Time Slot</InputLabel><Select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} sx={{ bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF', borderRadius: 2 }}><MenuItem value="07:00 AM - 09:00 AM">07:00 AM - 09:00 AM</MenuItem><MenuItem value="09:00 AM - 11:00 AM">09:00 AM - 11:00 AM</MenuItem><MenuItem value="11:00 AM - 01:00 PM">11:00 AM - 01:00 PM</MenuItem><MenuItem value="01:00 PM - 03:00 PM">01:00 PM - 03:00 PM</MenuItem><MenuItem value="03:00 PM - 05:00 PM">03:00 PM - 05:00 PM</MenuItem><MenuItem value="05:00 PM - 07:00 PM">05:00 PM - 07:00 PM</MenuItem><MenuItem value="07:00 PM - 09:00 PM">07:00 PM - 09:00 PM</MenuItem></Select></FormControl></Stack></DialogContent><DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}><Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button><Button type="submit" variant="contained" disabled={submitting || !bookingDate} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.2, borderRadius: 3 }}>{submitting ? <CircularProgress size={20} color="inherit" /> : 'CONFIRM BOOKING'}</Button></DialogActions></form></Dialog>
    </Container>
  );
}

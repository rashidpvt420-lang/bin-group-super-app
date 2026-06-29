import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';
import { ShieldCheck, Plus, Clock, Trash2, Car, Calendar, AlertCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs, limit, addDoc, onSnapshot, doc, updateDoc, serverTimestamp, functions, httpsCallable } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantVisitorParkingPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<any[]>([]);
  const [openAdd, setOpenAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [visitStartAt, setVisitStartAt] = useState('');
  const [visitEndAt, setVisitEndAt] = useState('');
  const [unitId, setUnitId] = useState('');
  const [propertyId, setPropertyId] = useState('');

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  // 1. Resolve residence info
  useEffect(() => {
    async function resolveResidence() {
      if (!user?.uid) return;
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid), limit(1)));
        if (unitSnap.empty && user.email) {
          unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)));
        }
        if (!unitSnap.empty) {
          const uDoc = unitSnap.docs[0];
          setUnitId(uDoc.id);
          setPropertyId(uDoc.data().propertyId || '');
        }
      } catch (err) {
        console.error('Failed to resolve tenant unit:', err);
      }
    }
    resolveResidence();
  }, [user]);

  // 2. Listen to parking requests
  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'visitorParkingRequests'),
      where('tenantUid', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setRequests(list);
      setLoading(false);
    }, (err) => {
      console.warn('Parking requests listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !visitorName.trim() || !vehiclePlate.trim()) return;
    setSubmitting(true);
    try {
      const passCode = `VP-${Math.floor(100000 + Math.random() * 900000)}`;
      const vStart = new Date(visitStartAt).getTime();
      const vEnd = new Date(visitEndAt).getTime();
      
      const generateSignedQrPass = httpsCallable(functions, 'generateSignedQrPass');
      const result = await generateSignedQrPass({
          propertyId,
          unitId,
          type: 'visitor_parking',
          name: visitorName.trim(),
          validFrom: vStart,
          validUntil: vEnd
      });
      const { token, passId } = result.data as any;

      await addDoc(collection(db, 'visitorParkingRequests'), {
        passId,
        qrToken: token,
        propertyId,
        unitId,
        tenantUid: user.uid,
        visitorName: visitorName.trim(),
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        visitStartAt,
        visitEndAt,
        status: 'pending',
        passCode,
        createdAt: serverTimestamp()
      });
      setOpenAdd(false);
      setVisitorName('');
      setVehiclePlate('');
      setVisitStartAt('');
      setVisitEndAt('');
    } catch (err) {
      console.error('Failed to create parking request:', err);
      alert('Failed to request parking: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to cancel this parking request?')) return;
    try {
      await updateDoc(doc(db, 'visitorParkingRequests', requestId), {
        status: 'cancelled'
      });
    } catch (err) {
      console.error('Failed to cancel request:', err);
      alert('Failed to cancel request.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return '#10b981';
      case 'pending': return binThemeTokens.gold;
      case 'rejected':
      case 'cancelled':
        return '#ef4444';
      default: return '#94a3b8';
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
            <SafeIcon icon={Car} size={36} style={{ color: binThemeTokens.gold }} />
            {label('tenant.parking.title', 'Visitor Parking', 'مواقف الزوار')}
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
            {label('tenant.parking.desc', 'Request and manage temporary parking permissions for your visitors.', 'طلب وإدارة تصاريح وقوف السيارات المؤقتة لزوارك.')}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Plus />}
          onClick={() => setOpenAdd(true)}
          disabled={!unitId}
          sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 3, py: 1.2, '&:hover': { bgcolor: '#b4954e' } }}
        >
          {label('tenant.parking.request', 'REQUEST PARKING', 'طلب موقف')}
        </Button>
      </Box>

      {!unitId ? (
        <Paper sx={{ p: 5, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertCircle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.parking.no_unit', 'No Assigned Unit Found', 'لم يتم العثور على وحدة معينة')}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {requests.map((r) => {
            const isApproved = r.status === 'approved';
            const isPending = r.status === 'pending';
            const statusColor = getStatusColor(r.status);

            return (
              <Grid item xs={12} md={6} lg={4} key={r.id}>
                <Paper sx={{
                  bgcolor: 'rgba(15,23,42,0.6)',
                  border: `1px solid ${alpha(statusColor, 0.2)}`,
                  borderRadius: 5,
                  overflow: 'hidden'
                }}>
                  {isApproved && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3, bgcolor: '#FFF' }}>
                      <Box sx={{ p: 1, bgcolor: '#fff', borderRadius: 2 }}>
                        <QRCodeSVG value={r.qrToken || r.qrPayload || 'invalid'} size={140} fgColor="#0f172a" />
                      </Box>
                    </Box>
                  )}
                  <Box sx={{ p: 3 }}>
                    <Stack spacing={2}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6" fontWeight="950" color="#FFF">{r.visitorName}</Typography>
                        <Chip
                          size="small"
                          label={(r.status || 'pending').toUpperCase()}
                          sx={{ bgcolor: alpha(statusColor, 0.12), color: statusColor, fontWeight: 950, fontSize: '0.65rem' }}
                        />
                      </Stack>

                      <Grid container spacing={1} sx={{ py: 1, borderTop: '1px solid rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="textSecondary" display="block">PLATE NUMBER</Typography>
                          <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 950 }}>{r.vehiclePlate}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="textSecondary" display="block">PASS CODE</Typography>
                          <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 950 }}>{r.passCode || '—'}</Typography>
                        </Grid>
                      </Grid>

                      <Stack spacing={0.5}>
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Clock size={12} />
                          {r.visitStartAt ? new Date(r.visitStartAt).toLocaleString() : ''} - {r.visitEndAt ? new Date(r.visitEndAt).toLocaleString() : ''}
                        </Typography>
                      </Stack>

                      {isPending && (
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 1 }}>
                          <Button
                            variant="outlined"
                            color="error"
                            size="small"
                            onClick={() => handleCancelRequest(r.id)}
                            sx={{ fontWeight: 900, borderRadius: 2 }}
                          >
                            CANCEL
                          </Button>
                        </Box>
                      )}
                    </Stack>
                  </Box>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}

      {requests.length === 0 && unitId && (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={Car} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.parking.none', 'No Parking Requests', 'لا توجد طلبات مواقف')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 1 }}>
            {label('tenant.parking.none_hint', 'Create a request to clear visitor vehicle access at the gate.', 'قم بإنشاء طلب لتسهيل دخول مركبة الزائر عند البوابة.')}
          </Typography>
        </Paper>
      )}

      <Dialog open={openAdd} onClose={() => setOpenAdd(false)} PaperProps={{ sx: { bgcolor: '#020617', color: '#FFF', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)', minWidth: { xs: '90%', sm: 480 } } }}>
        <form onSubmit={handleCreateRequest}>
          <DialogTitle sx={{ p: 4, pb: 0, fontWeight: 950, color: binThemeTokens.gold, textTransform: 'uppercase', letterSpacing: 2 }}>
            {label('tenant.parking.new_title', 'Request Visitor Parking', 'طلب موقف لزائر')}
          </DialogTitle>
          <DialogContent sx={{ p: 4 }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)', mb: 3 }}>
              {label('tenant.parking.new_desc', 'Enter the visitor name, vehicle plate details, and duration to generate a security-approved parking pass.', 'أدخل اسم الزائر وتفاصيل لوحة السيارة والمدة لإنشاء تصريح وقوف سيارات معتمد أمنياً.')}
            </Typography>
            <Stack spacing={3}>
              <TextField fullWidth label={label('tenant.parking.lbl_name', 'Visitor Full Name *', 'اسم الزائر الكامل *')} required value={visitorName} onChange={e => setVisitorName(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
              <TextField fullWidth label={label('tenant.parking.lbl_plate', 'Vehicle Plate Number (e.g. DXB-A-1234) *', 'رقم لوحة المركبة (مثال: DXB-A-1234) *')} required value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value)} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
              <TextField fullWidth type="datetime-local" label={label('tenant.parking.lbl_start', 'Visit Start Time *', 'وقت بدء الزيارة *')} required value={visitStartAt} onChange={e => setVisitStartAt(e.target.value)} InputLabelProps={{ shrink: true }} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
              <TextField fullWidth type="datetime-local" label={label('tenant.parking.lbl_end', 'Visit End Time *', 'وقت انتهاء الزيارة *')} required value={visitEndAt} onChange={e => setVisitEndAt(e.target.value)} InputLabelProps={{ shrink: true }} variant="filled" sx={{ '& .MuiFilledInput-root': { bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, color: '#FFF' } }} />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 4, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <Button onClick={() => setOpenAdd(false)} sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 900 }}>CANCEL</Button>
            <Button type="submit" variant="contained" disabled={submitting} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, px: 4, py: 1.2, borderRadius: 3 }}>
              {submitting ? <CircularProgress size={20} color="inherit" /> : label('tenant.parking.lbl_request', 'SUBMIT REQUEST', 'تقديم الطلب')}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Container>
  );
}

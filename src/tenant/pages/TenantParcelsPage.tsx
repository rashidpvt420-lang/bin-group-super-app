import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, Snackbar, Alert } from '@mui/material';
import { Package, CheckCircle, Clock, Truck, FileCheck2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, doc, updateDoc, onSnapshot, serverTimestamp } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

export default function TenantParcelsPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [parcels, setParcels] = useState<any[]>([]);
  const [snackbar, setSnackbar] = useState<{open: boolean, message: string, severity: 'success' | 'error' | 'warning' | 'info'}>({ open: false, message: '', severity: 'info' });

  const label = (key: string, en: string, ar: string) => lang === 'ar' ? ar : tx(key, en);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'parcels'),
      where('tenantUid', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a: any, b: any) => (b.receivedAt?.seconds || 0) - (a.receivedAt?.seconds || 0));
      setParcels(list);
      setLoading(false);
    }, (err) => {
      console.warn('Parcels listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  const handleConfirmCollection = async (parcelId: string) => {
    try {
      await updateDoc(doc(db, 'parcels', parcelId), {
        status: 'collected',
        collectedBy: user?.displayName || 'Tenant',
        collectedAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Failed to confirm collection:', err);
      setSnackbar({ open: true, message: 'Error confirming collection: ' + (err instanceof Error ? err.message : String(err)), severity: 'error' });
    }
  };

  const getStatusChip = (status: string) => {
    switch (status) {
      case 'collected':
        return (
          <Chip
            size="small"
            icon={<CheckCircle size={14} />}
            label={label('tenant.parcels.status.collected', 'COLLECTED', 'تم الاستلام')}
            sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950, '& .MuiChip-icon': { color: '#10b981' } }}
          />
        );
      case 'received':
      case 'notified':
        return (
          <Chip
            size="small"
            icon={<Clock size={14} />}
            label={label('tenant.parcels.status.pending', 'AWAITING CLAIM', 'في انتظار الاستلام')}
            sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950, '& .MuiChip-icon': { color: binThemeTokens.gold } }}
          />
        );
      default:
        return (
          <Chip
            size="small"
            label={status.toUpperCase()}
            sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', fontWeight: 950 }}
          />
        );
    }
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
          <SafeIcon icon={Package} size={36} style={{ color: binThemeTokens.gold }} />
          {label('tenant.parcels.title', 'Parcel Management', 'إدارة الطرود')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
          {label('tenant.parcels.desc', 'View details of courier parcel deliveries registered at the front desk and confirm collection.', 'عرض تفاصيل طرود التوصيل المسجلة في مكتب الاستقبال وتأكيد استلامها.')}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {parcels.map((p) => {
          const isPending = p.status === 'received' || p.status === 'notified';
          return (
            <Grid item xs={12} md={6} key={p.id}>
              <Paper sx={{
                p: 3,
                bgcolor: 'rgba(15,23,42,0.7)',
                border: isPending ? `1px solid ${alpha(binThemeTokens.gold, 0.25)}` : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4
              }}>
                <Stack spacing={2}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <SafeIcon icon={Truck} size={20} style={{ color: binThemeTokens.gold }} />
                      <Typography variant="body1" fontWeight="950" color="#FFF">
                        {p.courierName || 'Courier Delivery'}
                      </Typography>
                    </Stack>
                    {getStatusChip(p.status)}
                  </Stack>

                  <Grid container spacing={1.5} sx={{ py: 1, borderTop: '1px solid rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary" display="block">TRACKING NUMBER</Typography>
                      <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{p.trackingNumberMasked || '••••••••'}</Typography>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" color="textSecondary" display="block">PARCEL TYPE</Typography>
                      <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{(p.parcelType || 'Package').toUpperCase()}</Typography>
                    </Grid>
                  </Grid>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" color="textSecondary">
                      Received: {p.receivedAt?.toDate ? p.receivedAt.toDate().toLocaleString() : '—'}
                    </Typography>

                    {isPending && (
                      <Button
                        variant="contained"
                        size="small"
                        startIcon={<SafeIcon icon={FileCheck2} size={14} />}
                        onClick={() => handleConfirmCollection(p.id)}
                        sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}
                      >
                        {label('tenant.parcels.confirm', 'CONFIRM CLAIM', 'تأكيد الاستلام')}
                      </Button>
                    )}
                  </Box>
                  {p.status === 'collected' && p.collectedAt && (
                    <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 800, mt: 1, alignSelf: 'flex-end' }}>
                      Claimed by {p.collectedBy} on {p.collectedAt.toDate ? p.collectedAt.toDate().toLocaleString() : ''}
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {parcels.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertCircle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.parcels.none', 'No Parcels Logged', 'لا توجد طرود مسجلة')}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 1 }}>
            {label('tenant.parcels.none_hint', 'Parcels logged by the front desk will appear here.', 'الطرود المسجلة من قبل مكتب الاستقبال ستظهر هنا.')}
          </Typography>
        </Paper>
      )}
      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setSnackbar({ ...snackbar, open: false })} severity={snackbar.severity} sx={{ width: '100%', borderRadius: 3 }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

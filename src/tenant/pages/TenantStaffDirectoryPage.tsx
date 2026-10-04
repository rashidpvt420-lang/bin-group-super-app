import React, { useEffect, useState } from 'react';
import { Box, Container, Typography, Paper, Grid, Stack, Button, Chip, CircularProgress, alpha, Card, CardContent } from '@mui/material';
import { Contact, Phone, Mail, MessageSquare, AlertCircle, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { db, collection, query, where, getDocs, limit, onSnapshot } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export default function TenantStaffDirectoryPage() {
  const { tx, lang, isRTL } = useLanguage();
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<any[]>([]);
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
          setPropertyId(unitSnap.docs[0].data().propertyId || '');
        }
      } catch (err) {
        console.error('Failed to resolve tenant unit:', err);
      }
    }
    resolveResidence();
  }, [user]);

  // 2. Query staff directory
  useEffect(() => {
    if (!propertyId) {
      if (!loading) setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'staffDirectory'),
      where('propertyId', '==', propertyId),
      where('active', '==', true),
      where('visibleToTenants', '==', true)
    );

    const unsub = onSnapshot(q, (snap) => {
      setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => {
      console.warn('Staff directory listener failed:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [propertyId]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Box sx={{ mb: 4, textAlign: isRTL ? 'right' : 'left' }}>
        <Typography variant="h3" sx={{ color: '#fff', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 2, justifyContent: isRTL ? 'flex-end' : 'flex-start' }}>
          <SafeIcon icon={Contact} size={36} style={{ color: binThemeTokens.gold }} />
          {label('tenant.staff.title', 'Staff Directory', 'دليل الموظفين')}
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.5)', mt: 1 }}>
          {label('tenant.staff.desc', 'Get direct contact information for approved concierge, security, maintenance and property management contacts.', 'احصل على معلومات الاتصال المباشرة لموظفي الاستقبال والأمن والصيانة وإدارة العقارات المعتمدين.')}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {staff.map((s) => {
          const isEmergency = s.emergencyContact === true;
          return (
            <Grid item xs={12} md={6} lg={4} key={s.id}>
              <Card sx={{
                bgcolor: 'rgba(15,23,42,0.7)',
                border: isEmergency ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.06)',
                borderRadius: 4,
                height: '100%'
              }}>
                <CardContent sx={{ p: 4, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="h6" fontWeight="950" color="#FFF" sx={{ mb: 0.5 }}>{s.displayName}</Typography>
                        <Chip label={s.role?.toUpperCase()} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: binThemeTokens.gold, fontWeight: 900, fontSize: '0.65rem' }} />
                      </Box>
                      {isEmergency && (
                        <Chip
                          icon={<ShieldAlert size={14} color="#ef4444" />}
                          label={label('tenant.staff.emergency', 'EMERGENCY', 'طوارئ')}
                          sx={{ bgcolor: alpha('#ef4444', 0.12), color: '#ef4444', fontWeight: 950, fontSize: '0.65rem', '& .MuiChip-icon': { color: '#ef4444' } }}
                        />
                      )}
                    </Stack>

                    {s.shiftLabel && (
                      <Box>
                        <Typography variant="caption" color="textSecondary" display="block">SHIFT TIME</Typography>
                        <Typography variant="body2" sx={{ color: '#FFF', fontWeight: 900 }}>{s.shiftLabel}</Typography>
                      </Box>
                    )}

                    <Stack spacing={1} sx={{ pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                      {s.phone && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          <Phone size={14} />
                          <Typography variant="body2">{s.phone}</Typography>
                        </Stack>
                      )}
                      {s.email && (
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                          <Mail size={14} />
                          <Typography variant="body2" noWrap>{s.email}</Typography>
                        </Stack>
                      )}
                    </Stack>
                  </Stack>

                  <Stack direction="row" spacing={2} sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    {s.whatsapp && (
                      <Button
                        variant="contained"
                        fullWidth
                        startIcon={<SafeIcon icon={MessageSquare} size={16} />}
                        onClick={() => window.open(`https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}`, '_blank')}
                        sx={{ bgcolor: '#10b981', color: '#000', fontWeight: 950, borderRadius: 2, '&:hover': { bgcolor: '#059669' } }}
                      >
                        WHATSAPP
                      </Button>
                    )}
                    {s.phone && (
                      <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<SafeIcon icon={Phone} size={16} />}
                        onClick={() => window.open(`tel:${s.phone}`, '_blank')}
                        sx={{ borderColor: 'rgba(255,255,255,0.15)', color: '#FFF', fontWeight: 950, borderRadius: 2 }}
                      >
                        CALL
                      </Button>
                    )}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {staff.length === 0 && (
        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.01)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 4 }}>
          <SafeIcon icon={AlertCircle} size={48} style={{ color: 'rgba(255,255,255,0.2)', margin: '0 auto' }} />
          <Typography sx={{ color: '#FFF', fontWeight: 950, mt: 2 }}>
            {label('tenant.staff.none', 'No Staff Contacts Found', 'لم يتم العثور على جهات اتصال للموظفين')}
          </Typography>
        </Paper>
      )}
    </Container>
  );
}

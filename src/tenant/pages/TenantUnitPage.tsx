import React, { useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, Home, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type UnitDoc = { id: string; propertyId?: string; propertyName?: string; unitNumber?: string; floor?: number; tenantName?: string; tenantEmail?: string; occupancyStatus?: string; tenantStatus?: string; maintenanceStatus?: string; rentAmount?: number; annualRent?: number };

export default function TenantUnitPage() {
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<UnitDoc | null>(null);
  const [property, setProperty] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid && !user?.email) return;
      setLoading(true);
      setError(null);
      try {
        let snap = user?.uid ? await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid))) : null;
        if ((!snap || snap.empty) && user?.email) snap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', user.email.toLowerCase())));
        if (!snap || snap.empty) {
          if (!cancelled) setError('No assigned unit found for this tenant profile.');
          return;
        }
        const unitData = { id: snap.docs[0].id, ...snap.docs[0].data() } as UnitDoc;
        if (!cancelled) setUnit(unitData);
        if (unitData.propertyId) {
          const propSnap = await getDoc(doc(db, 'properties', unitData.propertyId));
          if (propSnap.exists() && !cancelled) setProperty({ id: propSnap.id, ...propSnap.data() });
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load assigned unit.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [user?.uid, user?.email]);

  if (loading) return <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!unit) return null;

  const occupancy = String(unit.occupancyStatus || 'occupied').toUpperCase();
  const maintenance = String(unit.maintenanceStatus || 'normal').replaceAll('_', ' ').toUpperCase();

  return (
    <Box>
      <Stack spacing={4}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3}>
            <Stack direction="row" spacing={2.5} alignItems="center">
              <Box sx={{ width: 64, height: 64, display: 'grid', placeItems: 'center', borderRadius: 4, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}><Home size={32} /></Box>
              <Box>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>MY UNIT</Typography>
                <Typography variant="h4" sx={{ color: '#FFF', fontWeight: 950 }}>Unit {unit.unitNumber || '—'}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{property?.propertyName || property?.name || unit.propertyName || 'Property'} · Floor {unit.floor || '—'}</Typography>
              </Box>
            </Stack>
            <Chip icon={<ShieldCheck size={14} />} label="TENANT ISOLATED VIEW" sx={{ alignSelf: 'flex-start', bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950 }} />
          </Stack>
        </Paper>

        <Grid container spacing={3}>
          <Grid item xs={12} md={4}><Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}><Building2 color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950, display: 'block', mt: 2 }}>PROPERTY</Typography><Typography sx={{ color: '#FFF', fontWeight: 950 }}>{property?.propertyName || property?.name || unit.propertyName || 'Property'}</Typography></Paper></Grid>
          <Grid item xs={12} md={4}><Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}><UserRound color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950, display: 'block', mt: 2 }}>OCCUPANCY</Typography><Typography sx={{ color: '#FFF', fontWeight: 950 }}>{occupancy}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)' }}>{unit.tenantStatus || 'active'}</Typography></Paper></Grid>
          <Grid item xs={12} md={4}><Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}><Wrench color={binThemeTokens.gold} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 950, display: 'block', mt: 2 }}>MAINTENANCE</Typography><Typography sx={{ color: '#FFF', fontWeight: 950 }}>{maintenance}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)' }}>Submit requests from the tenant dashboard.</Typography></Paper></Grid>
        </Grid>

        <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#f8fafc', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
          This page only loads the unit assigned to your tenant profile by tenant ID or tenant email. Other building units are not shown here.
        </Alert>
      </Stack>
    </Box>
  );
}

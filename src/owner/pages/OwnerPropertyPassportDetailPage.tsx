import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, FileText, Layers, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import { db, doc, onSnapshot } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import UaePropertyMap from '../../components/maps/UaePropertyMap';

function PassportMetric({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2.4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ color: binThemeTokens.gold }}>{children}</Box>
        <Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>{label}</Typography>
          <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{value}</Typography>
        </Box>
      </Stack>
    </Paper>
  );
}

export default function OwnerPropertyPassportDetailPage() {
  const { passportId } = useParams();
  const { isRTL } = useLanguage();
  const [passport, setPassport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!passportId) return;
    return onSnapshot(doc(db, 'propertyPassports', passportId), (snap) => {
      if (!snap.exists()) {
        setError('Property passport not found or access is not allowed.');
        setPassport(null);
      } else {
        setPassport({ id: snap.id, ...snap.data() });
      }
      setLoading(false);
    }, (err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [passportId]);

  const systems = useMemo(() => {
    const raw = passport?.systems || passport?.buildingSystems || passport?.assets || {};
    if (Array.isArray(raw)) return raw.map(String);
    return Object.entries(raw).filter(([, enabled]) => !!enabled).map(([key]) => key);
  }, [passport]);

  if (loading) {
    return <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!passport) return null;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={4}>
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.66)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2.5} alignItems="center">
              <Box sx={{ width: 64, height: 64, borderRadius: 4, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
                <Building2 size={32} />
              </Box>
              <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PROPERTY PASSPORT</Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{passport.propertyName || passport.name || 'Unnamed Property'}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{passport.address || passport.zone || passport.emirate || 'UAE property registry'}</Typography>
              </Box>
            </Stack>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center">
              <Chip icon={<ShieldCheck size={14} />} label={passport.status || 'ACTIVE'} sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950 }} />
              <Chip label={`ID ${passport.id.slice(0, 8).toUpperCase()}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
            </Stack>
          </Stack>
        </Paper>

        <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} md={8}>
            <UaePropertyMap title={passport.propertyName || 'Property Location'} address={passport.address || passport.zone} emirate={passport.emirate} lat={passport.lat || passport.latitude} lng={passport.lng || passport.longitude} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <PassportMetric label="Units" value={passport.totalUnits || passport.units || 0}><UsersRound size={20} /></PassportMetric>
              <PassportMetric label="Floors" value={passport.floors || 0}><Layers size={20} /></PassportMetric>
              <PassportMetric label="Contract" value={passport.activeContractId ? 'Linked' : 'Pending'}><FileText size={20} /></PassportMetric>
            </Stack>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.48)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}>
          <Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>Building Systems</Typography>
          {systems.length ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {systems.map((systemName) => <Chip key={systemName} icon={<Wrench size={13} />} label={systemName.replace(/([A-Z])/g, ' $1')} sx={{ color: '#FFF', bgcolor: 'rgba(255,255,255,0.06)' }} />)}
            </Stack>
          ) : (
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.42)' }}>No systems recorded yet.</Typography>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}

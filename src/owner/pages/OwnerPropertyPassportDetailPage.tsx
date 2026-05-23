import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, FileText, Layers, ShieldCheck, UsersRound, Wrench } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
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

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const compact = (values: unknown[]) => Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));

const emailLookupCandidates = (value: unknown) => {
  const email = normalizeEmail(value);
  if (!email || !email.includes('@')) return [];
  const [local, domain] = email.split('@');
  if (!local || !domain) return [email];
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const variants = new Set<string>([email, `${local}@${normalizedDomain}`]);
  if (normalizedDomain === 'gmail.com') variants.add(`${local.split('+')[0].replace(/\./g, '')}@${normalizedDomain}`);
  return Array.from(variants);
};

async function safeRead(collectionName: string, id: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`[OwnerPropertyPassportDetail] direct read skipped: ${collectionName}/${id}`, error);
    return null;
  }
}

async function safeQuery(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  } catch (error) {
    console.warn(`[OwnerPropertyPassportDetail] optional lookup skipped: ${collectionName}.${field}`, error);
    return [] as any[];
  }
}

function propertyToPassport(property: any) {
  return {
    ...property,
    id: property.propertyPassportId || property.passportId || property.id,
    propertyId: property.id,
    propertyName: property.propertyName || property.name || property.address || 'Property',
    emirate: property.emirate || property.city || property.location || 'UAE',
    totalUnits: property.totalUnits || property.units || property.numberOfUnits || property.unitsCount || 0,
    floors: property.floors || property.numberOfFloors || 0,
    status: 'PROVISIONAL',
    provisional: true,
  };
}

function isRequestedRecord(record: any, passportId: string) {
  if (!record) return false;
  return compact([
    record.id,
    record.propertyId,
    record.passportId,
    record.propertyPassportId,
    record.slug,
  ]).includes(passportId);
}

export default function OwnerPropertyPassportDetailPage() {
  const { passportId } = useParams();
  const { isRTL } = useLanguage();
  const { user } = useRole();
  const [passport, setPassport] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadPassportDetail() {
      if (!passportId) return;
      setLoading(true);
      setError(null);

      const directPassport = await safeRead('propertyPassports', passportId);
      if (directPassport) {
        if (!alive) return;
        setPassport(directPassport);
        setLoading(false);
        return;
      }

      const directProperty = await safeRead('properties', passportId);
      if (directProperty) {
        if (!alive) return;
        setPassport(propertyToPassport(directProperty));
        setLoading(false);
        return;
      }

      const ownerIds = compact([
        user?.uid,
        (user as any)?.ownerId,
        (user as any)?.ownerUid,
        ...((Array.isArray((user as any)?.linkedOwnerIds) ? (user as any).linkedOwnerIds : []) as unknown[]),
      ]);
      const emails = compact([
        ...emailLookupCandidates(user?.email),
        ...emailLookupCandidates((user as any)?.ownerEmail),
      ]);

      const rows: any[] = [];
      for (const ownerId of ownerIds) {
        rows.push(...await safeQuery('propertyPassports', 'ownerId', ownerId));
        rows.push(...await safeQuery('propertyPassports', 'ownerUid', ownerId));
        rows.push(...(await safeQuery('properties', 'ownerId', ownerId)).map(propertyToPassport));
        rows.push(...(await safeQuery('properties', 'ownerUid', ownerId)).map(propertyToPassport));
      }
      for (const email of emails) {
        rows.push(...await safeQuery('propertyPassports', 'ownerEmail', email));
        rows.push(...(await safeQuery('properties', 'ownerEmail', email)).map(propertyToPassport));
      }

      const matched = rows.find((row) => isRequestedRecord(row, passportId)) || rows.find((row) => String(row.id || '').startsWith(passportId)) || null;
      if (!alive) return;
      if (matched) {
        setPassport(matched);
      } else {
        setError('Property passport not found for this owner identity.');
        setPassport(null);
      }
      setLoading(false);
    }

    loadPassportDetail();
    return () => { alive = false; };
  }, [passportId, user?.email, user?.uid]);

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
        {passport.provisional && (
          <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>
            This is a provisional property passport generated from the linked active asset. Official passport issuance is pending.
          </Alert>
        )}

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
              <Chip icon={<ShieldCheck size={14} />} label={passport.status || 'ACTIVE'} sx={{ bgcolor: alpha(passport.provisional ? binThemeTokens.gold : '#10b981', 0.12), color: passport.provisional ? binThemeTokens.gold : '#10b981', fontWeight: 950 }} />
              <Chip label={`ID ${String(passport.id || '').slice(0, 8).toUpperCase()}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} />
            </Stack>
          </Stack>
        </Paper>

        <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} md={8}>
            <UaePropertyMap title={passport.propertyName || 'Property Location'} address={passport.address || passport.zone} emirate={passport.emirate} lat={passport.lat || passport.latitude} lng={passport.lng || passport.longitude} />
          </Grid>
          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <PassportMetric label="Units" value={passport.totalUnits || passport.units || passport.numberOfUnits || passport.unitsCount || 0}><UsersRound size={20} /></PassportMetric>
              <PassportMetric label="Floors" value={passport.floors || passport.numberOfFloors || 0}><Layers size={20} /></PassportMetric>
              <PassportMetric label="Contract" value={passport.activeContractId || passport.contractId ? 'Linked' : 'Pending'}><FileText size={20} /></PassportMetric>
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

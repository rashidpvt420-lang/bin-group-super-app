import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Chip, CircularProgress, Grid, Paper, Stack, Typography, alpha } from '@mui/material';
import { Building2, FileText, Layers, ShieldCheck, UsersRound } from 'lucide-react';
import { collection, db, doc, getDoc, getDocs, query, where } from '../../lib/firebase';
import { useLanguage } from '../../context/LanguageContext';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import UaePropertyMap from '../../components/maps/UaePropertyMap';

const clean = (value: unknown) => String(value || '').trim();
const email = (value: unknown) => clean(value).toLowerCase();
const uniq = (values: unknown[]) => Array.from(new Set(values.map(clean).filter(Boolean)));
const units = (row: any) => Number(row?.totalUnits || row?.units || row?.numberOfUnits || row?.unitsCount || 0);

function emailVariants(value: unknown) {
  const base = email(value);
  if (!base.includes('@')) return [];
  const [local, domain] = base.split('@');
  const d = domain === 'googlemail.com' ? 'gmail.com' : domain;
  const out = new Set([base, `${local}@${d}`]);
  if (d === 'gmail.com') out.add(`${local.split('+')[0].replace(/\./g, '')}@${d}`);
  return Array.from(out);
}

async function readDocSafe(collectionName: string, id: string) {
  if (!id) return null;
  try {
    const snap = await getDoc(doc(db, collectionName, id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.warn(`[OwnerPassportContractDetail] skipped ${collectionName}/${id}`, error);
    return null;
  }
}

async function querySafe(collectionName: string, field: string, value: string) {
  if (!value) return [] as any[];
  try {
    const snap = await getDocs(query(collection(db, collectionName), where(field, '==', value)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.warn(`[OwnerPassportContractDetail] skipped ${collectionName}.${field}`, error);
    return [] as any[];
  }
}

function toPassport(row: any) {
  return {
    ...row,
    id: row.propertyPassportId || row.passportId || row.propertyId || row.id,
    propertyId: row.propertyId || row.id,
    propertyName: row.propertyName || row.name || row.address || 'Property',
    emirate: row.emirate || row.city || row.location || 'UAE',
    totalUnits: units(row),
    floors: row.floors || row.numberOfFloors || 0,
    provisional: row.provisional !== false,
    status: row.status || 'PROVISIONAL',
  };
}

function fromContract(contract: any) {
  const rows = Array.isArray(contract?.properties) ? contract.properties : [];
  return rows.map((property: any, index: number) => toPassport({
    ...property,
    propertyId: property.propertyId || property.id || `${contract.id || 'contract'}-property-${index + 1}`,
    activeContractId: contract.id,
    ownerId: contract.ownerId,
    ownerUid: contract.ownerUid,
    ownerEmail: contract.ownerEmail || contract.emailDelivery?.recipient,
    packageName: contract.packageName || contract.planType,
  }));
}

function matches(row: any, id: string) {
  return uniq([row.id, row.propertyId, row.passportId, row.propertyPassportId]).includes(id);
}

function Metric({ label, value, children }: { label: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2.4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 4 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Box sx={{ color: binThemeTokens.gold }}>{children}</Box>
        <Box><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.38)', fontWeight: 900 }}>{label}</Typography><Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF' }}>{value}</Typography></Box>
      </Stack>
    </Paper>
  );
}

export default function OwnerPropertyPassportContractDetailPage() {
  const { passportId = '' } = useParams();
  const { user } = useRole();
  const { isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [passport, setPassport] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError('');

      const directPassport = await readDocSafe('propertyPassports', passportId);
      if (directPassport) {
        if (alive) { setPassport(toPassport({ ...directPassport, provisional: false })); setLoading(false); }
        return;
      }

      const directProperty = await readDocSafe('properties', passportId);
      if (directProperty) {
        if (alive) { setPassport(toPassport(directProperty)); setLoading(false); }
        return;
      }

      const rows: any[] = [];
      const contracts = new Map<string, any>();
      const ownerIds = uniq([user?.uid, (user as any)?.ownerId, (user as any)?.ownerUid, ...((Array.isArray((user as any)?.linkedOwnerIds) ? (user as any).linkedOwnerIds : []) as unknown[])]);
      for (const ownerId of ownerIds) {
        rows.push(...(await querySafe('propertyPassports', 'ownerId', ownerId)).map((x) => toPassport({ ...x, provisional: false })));
        rows.push(...(await querySafe('properties', 'ownerId', ownerId)).map(toPassport));
        for (const c of await querySafe('contracts', 'ownerId', ownerId)) contracts.set(c.id, c);
        for (const c of await querySafe('contracts', 'ownerUid', ownerId)) contracts.set(c.id, c);
      }
      for (const e of emailVariants(user?.email)) {
        rows.push(...(await querySafe('propertyPassports', 'ownerEmail', e)).map((x) => toPassport({ ...x, provisional: false })));
        rows.push(...(await querySafe('properties', 'ownerEmail', e)).map(toPassport));
        for (const c of await querySafe('contracts', 'ownerEmail', e)) contracts.set(c.id, c);
        for (const c of await querySafe('contracts', 'emailDelivery.recipient', e)) contracts.set(c.id, c);
      }
      for (const c of contracts.values()) rows.push(...fromContract(c));

      const found = rows.find((row) => matches(row, passportId)) || rows.find((row) => String(row.id || '').startsWith(passportId));
      if (!alive) return;
      if (found) setPassport(found);
      else setError('Property passport not found for this owner identity.');
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [passportId, user?.email, user?.uid]);

  if (loading) return <Box sx={{ height: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!passport) return null;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr', pb: 6 }}>
      <Stack spacing={4}>
        {passport.provisional && <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.06), color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}` }}>This provisional property passport is generated from the linked active asset or active contract. Official passport issuance is pending.</Alert>}
        <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.66)', border: `1px solid ${alpha(binThemeTokens.gold, 0.18)}`, borderRadius: 6 }}>
          <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3}>
            <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={2.5} alignItems="center">
              <Box sx={{ width: 64, height: 64, borderRadius: 4, display: 'grid', placeItems: 'center', bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}><Building2 size={32} /></Box>
              <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}><Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>PROPERTY PASSPORT</Typography><Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>{passport.propertyName}</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{passport.address || passport.zone || passport.emirate}</Typography></Box>
            </Stack>
            <Stack direction="row" spacing={1}><Chip icon={<ShieldCheck size={14} />} label={passport.status || 'PROVISIONAL'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 950 }} /><Chip label={`ID ${String(passport.id || '').slice(0, 8).toUpperCase()}`} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 950 }} /></Stack>
          </Stack>
        </Paper>
        <Grid container spacing={3} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
          <Grid item xs={12} md={8}><UaePropertyMap title={passport.propertyName} address={passport.address || passport.zone} emirate={passport.emirate} lat={passport.lat || passport.latitude} lng={passport.lng || passport.longitude} /></Grid>
          <Grid item xs={12} md={4}><Stack spacing={2}><Metric label="Units" value={passport.totalUnits || 0}><UsersRound size={20} /></Metric><Metric label="Floors" value={passport.floors || 0}><Layers size={20} /></Metric><Metric label="Contract" value={passport.activeContractId || passport.contractId ? 'Linked' : 'Pending'}><FileText size={20} /></Metric></Stack></Grid>
        </Grid>
        <Paper sx={{ p: 3, bgcolor: 'rgba(15,23,42,0.48)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5 }}><Typography variant="subtitle1" fontWeight="950" sx={{ color: '#FFF', mb: 2 }}>Building Systems</Typography><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.42)' }}>Systems will appear here when the official passport is issued.</Typography></Paper>
      </Stack>
    </Box>
  );
}

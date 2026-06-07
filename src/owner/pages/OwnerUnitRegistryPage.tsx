import React, { useEffect, useMemo, useState } from 'react';
import { Box, Chip, CircularProgress, Grid, InputAdornment, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, Layout, Search } from 'lucide-react';
import { collection, db, getDocs, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type PropertyDoc = { id: string; propertyName?: string; name?: string; ownerEmail?: string; ownerId?: string; ownerUid?: string };
type UnitDoc = { id: string; propertyId?: string; propertyName?: string; unitNumber?: string; floor?: number; floorNumber?: number; tenantName?: string; tenantEmail?: string; occupancyStatus?: string; status?: string; tenantStatus?: string; maintenanceStatus?: string; rentAmount?: number; annualRent?: number };

const unique = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
const norm = (value: unknown) => String(value || 'vacant').toUpperCase();
const chunksOf = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, idx) => items.slice(idx * size, idx * size + size));

function statusOf(unit: UnitDoc) {
  const value = norm(unit.occupancyStatus || unit.status);
  return value === 'UNDER_MAINTENANCE' ? 'MAINTENANCE' : value;
}

function statusColor(status: string) {
  if (status === 'OCCUPIED') return '#10b981';
  if (status === 'MAINTENANCE') return '#f59e0b';
  return 'rgba(255,255,255,0.42)';
}

export default function OwnerUnitRegistryPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<UnitDoc[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.uid && !user?.email) return;
      setLoading(true);
      const email = user?.email?.toLowerCase() || '';
      const propertyQueries = [];
      if (email) propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerEmail', '==', email))));
      if (user?.uid) {
        propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid))));
        propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerUid', '==', user.uid))));
      }

      const propertySnaps = await Promise.all(propertyQueries);
      const properties = unique(propertySnaps.flatMap((snap) => snap.docs.map((d) => ({ ...(d.data() as Omit<PropertyDoc, 'id'>), id: d.id } as PropertyDoc))));
      const propIds = properties.map((p) => p.id);
      const propName = new Map(properties.map((p) => [p.id, p.propertyName || p.name || 'Property']));

      const unitSnaps = [];
      for (const chunk of chunksOf(propIds, 10)) unitSnaps.push(await getDocs(query(collection(db, 'units'), where('propertyId', 'in', chunk))));
      if (user?.uid) unitSnaps.push(await getDocs(query(collection(db, 'units'), where('ownerId', '==', user.uid))));
      if (email) unitSnaps.push(await getDocs(query(collection(db, 'units'), where('ownerEmail', '==', email))));

      const merged = unique(unitSnaps.flatMap((snap) => snap.docs.map((d) => {
        const data = d.data() as Omit<UnitDoc, 'id'>;
        return { ...data, id: d.id, propertyName: data.propertyName || (data.propertyId ? propName.get(data.propertyId) : undefined) || 'Property' };
      })));

      if (!cancelled) {
        setUnits(merged);
        setLoading(false);
      }
    }
    load().catch((error) => { console.warn('[OwnerUnitRegistry] load failed:', error); if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.uid, user?.email]);

  const filtered = useMemo(() => units.filter((unit) => {
    const text = `${unit.unitNumber || ''} ${unit.propertyName || ''} ${unit.tenantName || ''} ${unit.tenantEmail || ''}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (filter === 'ALL' || statusOf(unit) === filter);
  }), [units, search, filter]);

  const counts = {
    ALL: units.length,
    OCCUPIED: units.filter((u) => statusOf(u) === 'OCCUPIED').length,
    VACANT: units.filter((u) => statusOf(u) === 'VACANT').length,
    MAINTENANCE: units.filter((u) => statusOf(u) === 'MAINTENANCE').length,
  };

  if (loading) return <Box sx={{ height: '50vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{tx('owner.units.registry_overline', 'OWNER UNIT REGISTRY')}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{tx('owner.units.registry_title', 'Unit Ledger')}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{tx('owner.units.subtitle', 'All units linked to your approved properties.')}</Typography>
        </Box>
        <TextField size="small" placeholder={tx('owner.units.search_placeholder', 'Search unit, tenant, property...')} value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment> }} sx={{ minWidth: 320 }} />
      </Stack>

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {Object.entries(counts).map(([label, value]) => (
          <Grid item xs={6} md={3} key={label}>
            <Paper onClick={() => setFilter(label)} sx={{ p: 2.5, cursor: 'pointer', bgcolor: filter === label ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.5)', border: `1px solid ${filter === label ? alpha(binThemeTokens.gold, 0.42) : 'rgba(255,255,255,0.07)'}`, borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: filter === label ? binThemeTokens.gold : 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{label}</Typography>
              <Typography variant="h5" sx={{ color: '#FFF', fontWeight: 950 }}>{value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.45)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}>
          <Layout size={42} color="rgba(255,255,255,0.12)" />
          <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900, mt: 2 }}>{tx('owner.units.no_units', 'NO UNITS FOUND')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15,23,42,0.45)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6 }}>
          <Table>
            <TableHead><TableRow><TableCell>{tx('owner.units.unit_col', 'UNIT')}</TableCell><TableCell>{tx('owner.units.occupancy_col', 'OCCUPANCY')}</TableCell><TableCell>{tx('owner.units.rent_col', 'RENT')}</TableCell><TableCell>{tx('owner.units.maintenance_col', 'MAINTENANCE')}</TableCell></TableRow></TableHead>
            <TableBody>
              {filtered.map((unit) => {
                const status = statusOf(unit);
                return (
                  <TableRow key={unit.id} hover>
                    <TableCell><Typography fontWeight="950" sx={{ color: '#FFF', fontFamily: 'monospace' }}>{unit.unitNumber || '—'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{unit.propertyName} · Floor {unit.floor || unit.floorNumber || '—'}</Typography></TableCell>
                    <TableCell><Chip label={status} size="small" sx={{ color: statusColor(status), bgcolor: alpha(statusColor(status), 0.1), fontWeight: 950 }} /> <Typography variant="caption" sx={{ color: unit.tenantName ? '#FFF' : 'rgba(255,255,255,0.35)', ml: 1 }}>{unit.tenantName || unit.tenantEmail || tx('owner.units.unassigned', 'Unassigned')}</Typography></TableCell>
                    <TableCell><Typography sx={{ color: unit.rentAmount || unit.annualRent ? '#10b981' : 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{unit.rentAmount || unit.annualRent ? `AED ${Number(unit.rentAmount || unit.annualRent).toLocaleString()}` : '—'}</Typography></TableCell>
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><CheckCircle2 size={14} color={unit.maintenanceStatus === 'normal' ? '#10b981' : '#f59e0b'} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{String(unit.maintenanceStatus || 'normal').replaceAll('_', ' ').toUpperCase()}</Typography></Stack></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}

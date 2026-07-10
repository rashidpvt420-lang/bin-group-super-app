import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { CheckCircle2, Download, Layout, Plus, Search } from 'lucide-react';
import { collection, db, functions, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type PropertyDoc = {
  id: string;
  propertyName?: string;
  name?: string;
  ownerEmail?: string;
  ownerId?: string;
  ownerUid?: string;
};

type UnitDoc = {
  id: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  floor?: number | string;
  floorNumber?: number | string;
  tenantName?: string;
  tenantEmail?: string;
  occupancyStatus?: string;
  status?: string;
  maintenanceStatus?: string;
  rentAmount?: number;
  annualRent?: number;
  paymentStatus?: string;
  nextPaymentDate?: string;
};

const unique = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
const norm = (value: unknown) => String(value || 'vacant').toUpperCase();
const chunksOf = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

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
  const [loading, setLoading] = React.useState(true);
  const [properties, setProperties] = React.useState<PropertyDoc[]>([]);
  const [units, setUnits] = React.useState<UnitDoc[]>([]);
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('ALL');
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [wizardSaving, setWizardSaving] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [notice, setNotice] = React.useState<{ severity: 'success' | 'warning' | 'error' | 'info'; text: string } | null>(null);
  const [wizard, setWizard] = React.useState({ propertyId: '', count: 1, prefix: '', startNumber: 1, padding: 0, floor: '', annualRent: 0 });

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.uid && !user?.email) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotice(null);
      try {
        const email = String(user?.email || '').trim().toLowerCase();
        const propertyQueries: Array<ReturnType<typeof getDocs>> = [];
        if (email) propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerEmail', '==', email))));
        if (user?.uid) {
          propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid))));
          propertyQueries.push(getDocs(query(collection(db, 'properties'), where('ownerUid', '==', user.uid))));
        }

        const propertySnaps = await Promise.all(propertyQueries);
        const ownedProperties = unique(propertySnaps.flatMap((snapshot) => snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<PropertyDoc, 'id'>) }))));
        if (cancelled) return;
        setProperties(ownedProperties);
        if (ownedProperties[0]?.id) setWizard((current) => current.propertyId ? current : { ...current, propertyId: ownedProperties[0].id });

        const propertyIds = ownedProperties.map((property) => property.id);
        const propertyNames = new Map(ownedProperties.map((property) => [property.id, property.propertyName || property.name || tx('owner.units.property_fallback', 'Property')]));
        const unitSnaps = [];
        for (const chunk of chunksOf(propertyIds, 10)) {
          if (chunk.length) unitSnaps.push(await getDocs(query(collection(db, 'units'), where('propertyId', 'in', chunk))));
        }
        if (user?.uid) {
          unitSnaps.push(await getDocs(query(collection(db, 'units'), where('ownerId', '==', user.uid))));
          unitSnaps.push(await getDocs(query(collection(db, 'units'), where('ownerUid', '==', user.uid))));
        }
        if (email) unitSnaps.push(await getDocs(query(collection(db, 'units'), where('ownerEmail', '==', email))));

        const mergedUnits = unique(unitSnaps.flatMap((snapshot) => snapshot.docs.map((item) => {
          const data = item.data() as Omit<UnitDoc, 'id'>;
          return {
            id: item.id,
            ...data,
            propertyName: data.propertyName || (data.propertyId ? propertyNames.get(data.propertyId) : undefined) || tx('owner.units.property_fallback', 'Property'),
          };
        })));
        if (!cancelled) setUnits(mergedUnits);
      } catch (error: any) {
        console.warn('[OwnerUnitRegistry] load failed:', error);
        if (!cancelled) setNotice({ severity: 'error', text: error?.message || tx('owner.units.load_failed', 'Unit registry could not be loaded.') });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [reloadKey, tx, user?.email, user?.uid]);

  const filtered = React.useMemo(() => units.filter((unit) => {
    const text = `${unit.unitNumber || ''} ${unit.propertyName || ''} ${unit.tenantName || ''} ${unit.tenantEmail || ''}`.toLowerCase();
    return text.includes(search.toLowerCase()) && (filter === 'ALL' || statusOf(unit) === filter);
  }), [filter, search, units]);

  const counts = {
    ALL: units.length,
    OCCUPIED: units.filter((unit) => statusOf(unit) === 'OCCUPIED').length,
    VACANT: units.filter((unit) => statusOf(unit) === 'VACANT').length,
    MAINTENANCE: units.filter((unit) => statusOf(unit) === 'MAINTENANCE').length,
  };

  const submitWizard = async () => {
    if (!wizard.propertyId) {
      setNotice({ severity: 'warning', text: tx('owner.units.select_property', 'Select an owned property before generating units.') });
      return;
    }
    setWizardSaving(true);
    setNotice(null);
    try {
      const callable = httpsCallable(functions, 'ownerGenerateUnits');
      const result = await callable({
        propertyId: wizard.propertyId,
        count: Number(wizard.count || 1),
        prefix: wizard.prefix.trim(),
        startNumber: Number(wizard.startNumber || 1),
        padding: Number(wizard.padding || 0),
        floor: wizard.floor.trim(),
        annualRent: Number(wizard.annualRent || 0),
      });
      const data = result.data as any;
      setNotice({
        severity: 'success',
        text: tx('owner.units.generate_result', `${data?.createdCount || 0} unit(s) generated${data?.skipped?.length ? `; skipped duplicates: ${data.skipped.join(', ')}` : ''}.`),
      });
      setWizardOpen(false);
      setReloadKey((value) => value + 1);
    } catch (error: any) {
      setNotice({ severity: 'error', text: error?.message || tx('owner.units.generate_failed', 'Unit generation failed.') });
    } finally {
      setWizardSaving(false);
    }
  };

  const exportLedger = () => {
    const headers = ['Property', 'Unit', 'Floor', 'Occupancy', 'Tenant', 'Annual Rent AED', 'Payment Status', 'Next Payment', 'Maintenance'];
    const lines = filtered.map((unit) => [
      unit.propertyName,
      unit.unitNumber,
      unit.floor || unit.floorNumber,
      statusOf(unit),
      unit.tenantName || unit.tenantEmail || '',
      Number(unit.annualRent || unit.rentAmount || 0),
      unit.paymentStatus || 'NO_RECORD',
      unit.nextPaymentDate || '',
      unit.maintenanceStatus || 'normal',
    ].map(csvCell).join(','));
    const csv = `\uFEFF${headers.map(csvCell).join(',')}\n${lines.join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bin-group-owner-unit-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Box sx={{ height: '50vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: isRTL ? 'row-reverse' : 'row' }} justifyContent="space-between" spacing={3} sx={{ mb: 4 }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{tx('owner.units.registry_overline', 'OWNER UNIT REGISTRY')}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mt: 1 }}>{tx('owner.units.registry_title', 'Unit Ledger')}</Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.45)' }}>{tx('owner.units.subtitle', 'Units, occupancy, rent, payment cycle and maintenance status for your approved properties.')}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
          <Button variant="outlined" startIcon={<Download size={16} />} disabled={!filtered.length} onClick={exportLedger} sx={{ color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>{tx('owner.units.export_ledger', 'Export Ledger')}</Button>
          <Button variant="contained" startIcon={<Plus size={16} />} disabled={!properties.length} onClick={() => setWizardOpen(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{tx('owner.units.generate_units', 'Generate Units')}</Button>
          <TextField size="small" placeholder={tx('owner.units.search_placeholder', 'Search unit, tenant, property...')} value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color="rgba(255,255,255,0.4)" /></InputAdornment> }} sx={{ minWidth: 300 }} />
        </Stack>
      </Stack>

      {notice && <Alert severity={notice.severity} sx={{ mb: 3 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {Object.entries(counts).map(([label, value]) => <Grid item xs={6} md={3} key={label}><Paper onClick={() => setFilter(label)} sx={{ p: 2.5, cursor: 'pointer', bgcolor: filter === label ? alpha(binThemeTokens.gold, 0.12) : 'rgba(15,23,42,0.5)', border: `1px solid ${filter === label ? alpha(binThemeTokens.gold, 0.42) : 'rgba(255,255,255,0.07)'}`, borderRadius: 4 }}><Typography variant="caption" sx={{ color: filter === label ? binThemeTokens.gold : 'rgba(255,255,255,0.4)', fontWeight: 950 }}>{label}</Typography><Typography variant="h5" sx={{ color: '#FFF', fontWeight: 950 }}>{value}</Typography></Paper></Grid>)}
      </Grid>

      {!filtered.length ? (
        <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'rgba(15,23,42,0.45)', border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 6 }}><Layout size={42} color="rgba(255,255,255,0.12)" /><Typography sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 900, mt: 2 }}>{tx('owner.units.no_units', 'NO UNITS FOUND')}</Typography></Paper>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: 'rgba(15,23,42,0.45)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6 }}>
          <Table>
            <TableHead><TableRow><TableCell>{tx('owner.units.unit_col', 'UNIT')}</TableCell><TableCell>{tx('owner.units.occupancy_col', 'OCCUPANCY')}</TableCell><TableCell>{tx('owner.units.rent_col', 'RENT')}</TableCell><TableCell>{tx('owner.units.payment_col', 'PAYMENT')}</TableCell><TableCell>{tx('owner.units.maintenance_col', 'MAINTENANCE')}</TableCell></TableRow></TableHead>
            <TableBody>
              {filtered.map((unit) => {
                const status = statusOf(unit);
                const paid = String(unit.paymentStatus || '').toUpperCase() === 'PAID';
                return <TableRow key={unit.id} hover>
                  <TableCell><Typography fontWeight="950" sx={{ color: '#FFF', fontFamily: 'monospace' }}>{unit.unitNumber || '—'}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.42)' }}>{unit.propertyName} · {tx('owner.units.floor', 'Floor')} {unit.floor || unit.floorNumber || '—'}</Typography></TableCell>
                  <TableCell><Chip label={status} size="small" sx={{ color: statusColor(status), bgcolor: alpha(statusColor(status), 0.1), fontWeight: 950 }} /> <Typography variant="caption" sx={{ color: unit.tenantName ? '#FFF' : 'rgba(255,255,255,0.35)', ml: isRTL ? 0 : 1, mr: isRTL ? 1 : 0 }}>{unit.tenantName || unit.tenantEmail || tx('owner.units.unassigned', 'Unassigned')}</Typography></TableCell>
                  <TableCell><Typography sx={{ color: unit.rentAmount || unit.annualRent ? '#10b981' : 'rgba(255,255,255,0.3)', fontWeight: 900 }}>{unit.rentAmount || unit.annualRent ? `AED ${Number(unit.rentAmount || unit.annualRent).toLocaleString()}` : '—'}</Typography></TableCell>
                  <TableCell><Stack spacing={0.4}><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={0.8} alignItems="center"><CheckCircle2 size={14} color={paid ? '#10b981' : '#f59e0b'} /><Typography variant="caption" sx={{ color: paid ? '#10b981' : 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{String(unit.paymentStatus || 'NO RECORD').toUpperCase()}</Typography></Stack><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.32)' }}>{tx('owner.units.next_payment', 'Next')}: {unit.nextPaymentDate || '—'}</Typography></Stack></TableCell>
                  <TableCell><Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} alignItems="center"><CheckCircle2 size={14} color={unit.maintenanceStatus === 'normal' ? '#10b981' : '#f59e0b'} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontWeight: 900 }}>{String(unit.maintenanceStatus || 'normal').replaceAll('_', ' ').toUpperCase()}</Typography></Stack></TableCell>
                </TableRow>;
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { direction: isRTL ? 'rtl' : 'ltr' } }}>
        <DialogTitle>{tx('owner.units.generate_dialog_title', 'Generate property units')}</DialogTitle>
        <DialogContent><Stack spacing={2.25} sx={{ pt: 1 }}>
          <TextField select label={tx('field.property', 'Property')} value={wizard.propertyId} onChange={(event) => setWizard((current) => ({ ...current, propertyId: event.target.value }))} fullWidth required>{properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.propertyName || property.name || property.id}</MenuItem>)}</TextField>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField type="number" label={tx('owner.units.count', 'Number of units')} value={wizard.count} onChange={(event) => setWizard((current) => ({ ...current, count: Number(event.target.value) }))} inputProps={{ min: 1, max: 100 }} fullWidth /><TextField label={tx('owner.units.prefix', 'Prefix')} value={wizard.prefix} onChange={(event) => setWizard((current) => ({ ...current, prefix: event.target.value.toUpperCase() }))} placeholder="A-" fullWidth /></Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField type="number" label={tx('owner.units.start_number', 'Start number')} value={wizard.startNumber} onChange={(event) => setWizard((current) => ({ ...current, startNumber: Number(event.target.value) }))} inputProps={{ min: 1 }} fullWidth /><TextField type="number" label={tx('owner.units.padding', 'Number padding')} value={wizard.padding} onChange={(event) => setWizard((current) => ({ ...current, padding: Number(event.target.value) }))} inputProps={{ min: 0, max: 4 }} fullWidth /></Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}><TextField label={tx('owner.units.floor', 'Floor')} value={wizard.floor} onChange={(event) => setWizard((current) => ({ ...current, floor: event.target.value }))} fullWidth /><TextField type="number" label={tx('owner.units.annual_rent_optional', 'Annual rent optional')} value={wizard.annualRent} onChange={(event) => setWizard((current) => ({ ...current, annualRent: Number(event.target.value) }))} inputProps={{ min: 0 }} fullWidth /></Stack>
          <Alert severity="info">{tx('owner.units.generate_security_note', 'Only units for properties owned by your signed-in owner account can be generated. Existing unit numbers are skipped.')}</Alert>
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setWizardOpen(false)}>{tx('common.cancel', 'Cancel')}</Button><Button disabled={wizardSaving || !wizard.propertyId || Number(wizard.count || 0) < 1} onClick={submitWizard} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{wizardSaving ? tx('common.saving', 'Saving...') : tx('owner.units.generate_action', 'Generate')}</Button></DialogActions>
      </Dialog>
    </Box>
  );
}

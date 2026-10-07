import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha } from '@mui/material';
import { CheckCircle2, Layout, Plus, Search } from 'lucide-react';
import { collection, db, functions, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type PropertyDoc = { id: string; propertyName?: string; name?: string; ownerEmail?: string; ownerId?: string; ownerUid?: string };
type UnitDoc = { id: string; propertyId?: string; propertyName?: string; unitNumber?: string; floor?: number; floorNumber?: number; tenantName?: string; tenantEmail?: string; occupancyStatus?: string; status?: string; tenantStatus?: string; maintenanceStatus?: string; rentAmount?: number; annualRent?: number };

const unique = <T extends { id: string }>(items: T[]) => Array.from(new Map(items.map((item) => [item.id, item])).values());
const norm = (value: unknown) => String(value || 'vacant').toUpperCase();
const emptyWizard = () => ({ propertyId: '', count: 1, prefix: '', startNumber: 1, padding: 0, floor: '', annualRent: 0 });

function statusOf(unit: UnitDoc) {
  const value = norm(unit.occupancyStatus || unit.status);
  return value === 'UNDER_MAINTENANCE' ? 'MAINTENANCE' : value;
}

function statusColor(status: string) {
  if (status === 'OCCUPIED') return '#047857';
  if (status === 'MAINTENANCE') return '#92400e';
  return binThemeTokens.textSecondary;
}

export default function OwnerUnitRegistryPage() {
  const { user } = useRole();
  const { tx, isRTL } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyDoc[]>([]);
  const [units, setUnits] = useState<UnitDoc[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const [wizard, setWizard] = useState(emptyWizard());
  const [registryOwnerId, setRegistryOwnerId] = useState('');
  const [noticeSeverity, setNoticeSeverity] = useState<'success' | 'warning'>('success');
  const [loadFailed, setLoadFailed] = useState(false);
  const currentOwnerId = useRef(user?.uid || '');
  currentOwnerId.current = user?.uid || '';
  const submission = useRef<{ ownerId: string } | null>(null);
  const identityMatches = registryOwnerId === (user?.uid || '');

  useEffect(() => {
    setWizard(emptyWizard());
    setWizardOpen(false);
    setWizardSaving(false);
    submission.current = null;
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    setRegistryOwnerId(user?.uid || '');
    setProperties([]);
    setUnits([]);
    setLoadFailed(false);
    setNoticeSeverity('success');
    async function load() {
      if (!user?.uid) {
        setProperties([]);
        setUnits([]);
        setNoticeSeverity('warning');
        setNotice(tx('owner.units.auth_required', 'Authenticated Owner identity is unavailable. Reload the portal and try again.'));
        setLoading(false);
        return;
      }
      setLoading(true);
      setNotice('');
      // Firestore list authorization is provable only against canonical ownerId.
      // Legacy ownerEmail/ownerUid aliases are read compatibility fields, not list authority.
      const propertySnap = await getDocs(query(collection(db, 'properties'), where('ownerId', '==', user.uid)));
      if (cancelled) return;
      const properties = unique(propertySnap.docs.map((d) => ({ ...(d.data() as Omit<PropertyDoc, 'id'>), id: d.id } as PropertyDoc)));
      if (!cancelled) {
        setProperties(properties);
        if (properties[0]?.id) setWizard((current) => current.propertyId ? current : ({ ...current, propertyId: properties[0].id }));
      }
      const propName = new Map(properties.map((p) => [p.id, p.propertyName || p.name || 'Property']));

      // The units rules authorize the unit's canonical ownerId. Knowing the parent
      // property ID alone cannot authorize a collection query over possible rows.
      const unitSnaps = [await getDocs(query(collection(db, 'units'), where('ownerId', '==', user.uid)))];

      const merged = unique(unitSnaps.flatMap((snap) => snap.docs.map((d) => {
        const data = d.data() as Omit<UnitDoc, 'id'>;
        return { ...data, id: d.id, propertyName: data.propertyName || (data.propertyId ? propName.get(data.propertyId) : undefined) || 'Property' };
      })));

      if (!cancelled) {
        setUnits(merged);
        setLoading(false);
      }
    }
    load().catch((error) => {
      console.warn('[OwnerUnitRegistry] load failed:', error);
      if (!cancelled) {
        setProperties([]);
        setUnits([]);
        setLoadFailed(true);
        setNoticeSeverity('warning');
        setNotice(tx('owner.units.load_failed', 'Unable to load the unit registry. Please retry.'));
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [user?.uid, reloadKey, tx]);

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

  const submitWizard = async () => {
    if (submission.current || !user?.uid || currentOwnerId.current !== user.uid || !identityMatches) return;
    if (!wizard.propertyId || !properties.some((property) => property.id === wizard.propertyId)) {
      setNoticeSeverity('warning');
      setNotice('Select an owned property before generating units.');
      return;
    }
    const operation = { ownerId: user.uid };
    submission.current = operation;
    setWizardSaving(true);
    setNoticeSeverity('success');
    setNotice('');
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
      if (currentOwnerId.current !== operation.ownerId || submission.current !== operation) return;
      const data = result.data as any;
      setNotice(`${data?.createdCount || 0} unit(s) generated${data?.skipped?.length ? `; skipped duplicates: ${data.skipped.join(', ')}` : ''}.`);
      setWizardOpen(false);
      setReloadKey((value) => value + 1);
    } catch (error: any) {
      if (currentOwnerId.current !== operation.ownerId || submission.current !== operation) return;
      setNoticeSeverity('warning');
      setNotice(error?.message || 'Unit generation failed.');
    } finally {
      if (currentOwnerId.current === operation.ownerId && submission.current === operation) {
        submission.current = null;
        setWizardSaving(false);
      }
    }
  };

  if (!user?.uid) return <Alert severity="warning">{tx('owner.units.auth_required', 'Authenticated Owner identity is unavailable. Reload the portal and try again.')}</Alert>;
  if (!identityMatches || loading) return <Box sx={{ height: '50vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Box sx={{ direction: isRTL ? 'rtl' : 'ltr' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={3} sx={{ mb: 4 }}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950, letterSpacing: 4 }}>{tx('owner.units.registry_overline', 'OWNER UNIT REGISTRY')}</Typography>
          <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.textPrimary, mt: 1 }}>{tx('owner.units.registry_title', 'Unit Ledger')}</Typography>
          <Typography variant="body2" sx={{ color: binThemeTokens.textSecondary }}>{tx('owner.units.subtitle', 'All units linked to your approved properties.')}</Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={1.5}>
          <Button variant="contained" startIcon={<Plus size={16} />} disabled={properties.length === 0} onClick={() => setWizardOpen(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>
            {tx('owner.units.generate_units', 'Generate Units')}
          </Button>
          <TextField size="small" placeholder={tx('owner.units.search_placeholder', 'Search unit, tenant, property...')} value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search size={16} color={binThemeTokens.textSecondary} /></InputAdornment> }} sx={{ minWidth: { xs: 0, sm: 320 }, width: { xs: '100%', sm: 'auto' } }} />
        </Stack>
      </Stack>

      {notice && <Alert severity={noticeSeverity} action={loadFailed ? <Button color="inherit" onClick={() => setReloadKey((value) => value + 1)}>{tx('common.retry', 'Retry')}</Button> : undefined} sx={{ mb: 3 }} onClose={() => setNotice('')}>{notice}</Alert>}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {Object.entries(counts).map(([label, value]) => (
          <Grid item xs={6} md={3} key={label}>
            <Paper onClick={() => setFilter(label)} sx={{ p: 2.5, cursor: 'pointer', bgcolor: filter === label ? alpha(binThemeTokens.gold, 0.12) : '#FFFFFF', border: `1px solid ${filter === label ? alpha(binThemeTokens.gold, 0.42) : binThemeTokens.border}`, borderRadius: 4 }}>
              <Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 950 }}>{label}</Typography>
              <Typography variant="h5" sx={{ color: binThemeTokens.textPrimary, fontWeight: 950 }}>{value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {filtered.length === 0 ? (
        <Paper sx={{ p: 8, textAlign: 'center', bgcolor: '#FFFFFF', border: `1px dashed ${binThemeTokens.border}`, borderRadius: 6 }}>
          <Layout size={42} color={binThemeTokens.textSecondary} />
          <Typography sx={{ color: binThemeTokens.textSecondary, fontWeight: 900, mt: 2 }}>{tx('owner.units.no_units', 'NO UNITS FOUND')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ bgcolor: '#FFFFFF', border: `1px solid ${binThemeTokens.border}`, borderRadius: 6 }}>
          <Table>
            <TableHead><TableRow><TableCell>{tx('owner.units.unit_col', 'UNIT')}</TableCell><TableCell>{tx('owner.units.occupancy_col', 'OCCUPANCY')}</TableCell><TableCell>{tx('owner.units.rent_col', 'RENT')}</TableCell><TableCell>{tx('owner.units.maintenance_col', 'MAINTENANCE')}</TableCell></TableRow></TableHead>
            <TableBody>
              {filtered.map((unit) => {
                const status = statusOf(unit);
                return (
                  <TableRow key={unit.id} hover>
                    <TableCell><Typography fontWeight="950" sx={{ color: binThemeTokens.textPrimary, fontFamily: 'monospace' }}>{unit.unitNumber || '—'}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary }}>{unit.propertyName} · Floor {unit.floor || unit.floorNumber || '—'}</Typography></TableCell>
                    <TableCell><Chip label={status} size="small" sx={{ color: statusColor(status), bgcolor: alpha(statusColor(status), 0.1), fontWeight: 950 }} /> <Typography variant="caption" sx={{ color: unit.tenantName ? binThemeTokens.textPrimary : binThemeTokens.textSecondary, ml: 1 }}>{unit.tenantName || unit.tenantEmail || tx('owner.units.unassigned', 'Unassigned')}</Typography></TableCell>
                    <TableCell><Typography sx={{ color: unit.rentAmount || unit.annualRent ? '#047857' : binThemeTokens.textSecondary, fontWeight: 900 }}>{unit.rentAmount || unit.annualRent ? `AED ${Number(unit.rentAmount || unit.annualRent).toLocaleString()}` : '—'}</Typography></TableCell>
                    <TableCell><Stack direction="row" spacing={1} alignItems="center"><CheckCircle2 size={14} color={unit.maintenanceStatus === 'normal' ? '#047857' : '#92400e'} /><Typography variant="caption" sx={{ color: binThemeTokens.textSecondary, fontWeight: 900 }}>{String(unit.maintenanceStatus || 'normal').replaceAll('_', ' ').toUpperCase()}</Typography></Stack></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={wizardOpen} onClose={() => setWizardOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{tx('owner.units.generate_dialog_title', 'Generate property units')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25} sx={{ pt: 1 }}>
            <TextField select label={tx('field.property', 'Property')} value={wizard.propertyId} onChange={(event) => setWizard((current) => ({ ...current, propertyId: event.target.value }))} fullWidth required>
              {properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.propertyName || property.name || property.id}</MenuItem>)}
            </TextField>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="number" label={tx('owner.units.count', 'Number of units')} value={wizard.count} onChange={(event) => setWizard((current) => ({ ...current, count: Number(event.target.value) }))} inputProps={{ min: 1, max: 100 }} fullWidth />
              <TextField label={tx('owner.units.prefix', 'Prefix')} value={wizard.prefix} onChange={(event) => setWizard((current) => ({ ...current, prefix: event.target.value.toUpperCase() }))} placeholder="A-" fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="number" label={tx('owner.units.start_number', 'Start number')} value={wizard.startNumber} onChange={(event) => setWizard((current) => ({ ...current, startNumber: Number(event.target.value) }))} inputProps={{ min: 1 }} fullWidth />
              <TextField type="number" label={tx('owner.units.padding', 'Number padding')} value={wizard.padding} onChange={(event) => setWizard((current) => ({ ...current, padding: Number(event.target.value) }))} inputProps={{ min: 0, max: 4 }} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label={tx('owner.units.floor', 'Floor')} value={wizard.floor} onChange={(event) => setWizard((current) => ({ ...current, floor: event.target.value }))} fullWidth />
              <TextField type="number" label={tx('owner.units.annual_rent_optional', 'Annual rent optional')} value={wizard.annualRent} onChange={(event) => setWizard((current) => ({ ...current, annualRent: Number(event.target.value) }))} inputProps={{ min: 0 }} fullWidth />
            </Stack>
            <Alert severity="info">
              {tx('owner.units.generate_security_note', 'Only units for properties owned by your signed-in owner account can be generated. Existing unit numbers are skipped.')}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWizardOpen(false)}>{tx('common.cancel', 'Cancel')}</Button>
          <Button disabled={wizardSaving || !wizard.propertyId || Number(wizard.count || 0) < 1} onClick={submitWizard} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {wizardSaving ? tx('common.saving', 'Saving...') : tx('owner.units.generate_action', 'Generate')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

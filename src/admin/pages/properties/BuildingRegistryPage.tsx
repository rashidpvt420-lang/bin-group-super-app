import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Building2, FileSpreadsheet, Layers, PlusCircle, UsersRound } from 'lucide-react';
import {
  auth,
  collection,
  db,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from '@/lib/firebase';
import AdminPageFrame from '../../components/AdminPageFrame';
import BulkTenantImportDialog from '../../components/tenants/BulkTenantImportDialog';
import { binThemeTokens } from '../../theme/adminTheme';

type PropertyRecord = {
  id: string;
  propertyName?: string;
  name?: string;
  emirate?: string;
  ownerId?: string;
  status?: string;
  floors?: number;
  totalUnits?: number;
  units?: number;
};

type UnitRecord = {
  id: string;
  unitNumber?: string;
  floor?: number;
  occupancyStatus?: string;
};

const normalizeUnitNumber = (floor: number, index: number, digits: number) => `${floor}${String(index).padStart(digits, '0')}`;

export default function BuildingRegistryPage() {
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [units, setUnits] = useState<UnitRecord[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [floors, setFloors] = useState(10);
  const [unitsPerFloor, setUnitsPerFloor] = useState(4);
  const [startFloor, setStartFloor] = useState(1);
  const [digits, setDigits] = useState(2);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [tenantImportOpen, setTenantImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedProperty = useMemo(() => properties.find((p) => p.id === selectedPropertyId), [properties, selectedPropertyId]);
  const occupiedCount = units.filter((u) => String(u.occupancyStatus || '').toLowerCase() === 'occupied').length;
  const vacantCount = Math.max(units.length - occupiedCount, 0);
  const previewUnits = useMemo(() => {
    const list: string[] = [];
    const max = Math.min(Number(floors || 0), 6);
    for (let f = Number(startFloor || 1); f < Number(startFloor || 1) + max; f += 1) {
      for (let u = 1; u <= Math.min(Number(unitsPerFloor || 0), 6); u += 1) list.push(normalizeUnitNumber(f, u, Number(digits || 2)));
    }
    return list;
  }, [floors, unitsPerFloor, startFloor, digits]);

  const loadProperties = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, 'properties'), limit(200)));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PropertyRecord));
      setProperties(data);
      if (!selectedPropertyId && data.length) setSelectedPropertyId(data[0].id);
    } catch (err: any) {
      setError(err.message || 'Failed to load properties.');
    } finally {
      setLoading(false);
    }
  };

  const loadUnits = async (propertyId: string) => {
    if (!propertyId) return;
    try {
      const snap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', propertyId)));
      setUnits(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UnitRecord)));
    } catch (err: any) {
      setError(err.message || 'Failed to load units.');
    }
  };

  useEffect(() => { loadProperties(); }, []);
  useEffect(() => { loadUnits(selectedPropertyId); }, [selectedPropertyId]);

  const generateUnits = async () => {
    if (!selectedPropertyId || !selectedProperty) {
      setError('Select a property first.');
      return;
    }
    const total = Number(floors || 0) * Number(unitsPerFloor || 0);
    if (total <= 0 || total > 1200) {
      setError('Unit generation must be between 1 and 1,200 units per batch.');
      return;
    }

    setWorking(true);
    setError(null);
    setSuccess(null);
    try {
      const existingSnap = await getDocs(query(collection(db, 'units'), where('propertyId', '==', selectedPropertyId)));
      const existingNumbers = new Set(existingSnap.docs.map((d) => String((d.data() as any).unitNumber || '').trim()));
      const batch = writeBatch(db);
      let created = 0;
      const batchId = `unit_batch_${Date.now()}`;

      for (let floor = Number(startFloor || 1); floor < Number(startFloor || 1) + Number(floors || 0); floor += 1) {
        for (let index = 1; index <= Number(unitsPerFloor || 0); index += 1) {
          const unitNumber = normalizeUnitNumber(floor, index, Number(digits || 2));
          if (existingNumbers.has(unitNumber)) continue;
          const ref = doc(collection(db, 'units'));
          batch.set(ref, {
            propertyId: selectedPropertyId,
            propertyName: selectedProperty.propertyName || selectedProperty.name || 'Property',
            ownerId: selectedProperty.ownerId || '',
            unitNumber,
            floor,
            stack: index,
            occupancyStatus: 'vacant',
            tenantStatus: 'none',
            maintenanceStatus: 'normal',
            source: 'ADMIN_BUILDING_REGISTRY',
            createdBy: auth.currentUser?.uid || 'admin',
            importBatchId: batchId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          created += 1;
        }
      }

      const propertyRef = doc(db, 'properties', selectedPropertyId);
      batch.set(propertyRef, {
        floors: Number(floors || 0),
        unitsPerFloor: Number(unitsPerFloor || 0),
        totalUnits: existingSnap.size + created,
        unitRegistryReady: true,
        lastUnitBatchId: batchId,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      batch.set(doc(collection(db, 'building_registry_batches')), {
        propertyId: selectedPropertyId,
        propertyName: selectedProperty.propertyName || selectedProperty.name || 'Property',
        requestedFloors: Number(floors || 0),
        requestedUnitsPerFloor: Number(unitsPerFloor || 0),
        createdUnits: created,
        skippedExistingUnits: total - created,
        createdBy: auth.currentUser?.uid || 'admin',
        batchId,
        createdAt: serverTimestamp(),
        status: 'completed',
      });

      await batch.commit();
      await loadUnits(selectedPropertyId);
      setSuccess(`Created ${created} new units. ${total - created} existing units skipped.`);
    } catch (err: any) {
      setError(err.message || 'Unit generation failed.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <AdminPageFrame
      title="BUILDING REGISTRY COMMAND"
      subtitle="Create structured units first, then import tenants in bulk for real towers and high-rise buildings"
      loading={loading}
      isEmpty={false}
      breadcrumbs={[{ label: 'Building Registry' }]}
    >
      <Stack spacing={3}>
        {error && <Alert severity="error">{error}</Alert>}
        {success && <Alert severity="success">{success}</Alert>}

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
              <Stack spacing={3}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Box sx={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 3, bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold }}>
                    <Building2 />
                  </Box>
                  <Box>
                    <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>Property Unit Registry</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>Generate a clean unit structure before inviting tenants.</Typography>
                  </Box>
                </Stack>

                <TextField select label="Property" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)} fullWidth>
                  {properties.map((property) => (
                    <MenuItem key={property.id} value={property.id}>{property.propertyName || property.name || property.id} · {property.emirate || 'UAE'}</MenuItem>
                  ))}
                </TextField>

                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}><TextField label="Floors" type="number" fullWidth value={floors} onChange={(e) => setFloors(Number(e.target.value))} /></Grid>
                  <Grid item xs={6} md={3}><TextField label="Units / Floor" type="number" fullWidth value={unitsPerFloor} onChange={(e) => setUnitsPerFloor(Number(e.target.value))} /></Grid>
                  <Grid item xs={6} md={3}><TextField label="Start Floor" type="number" fullWidth value={startFloor} onChange={(e) => setStartFloor(Number(e.target.value))} /></Grid>
                  <Grid item xs={6} md={3}><TextField label="Unit Digits" type="number" fullWidth value={digits} onChange={(e) => setDigits(Number(e.target.value))} /></Grid>
                </Grid>

                <Box sx={{ p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.03)' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>PREVIEW</Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {previewUnits.slice(0, 24).map((unit) => <Chip key={unit} label={unit} size="small" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />)}
                  </Stack>
                </Box>

                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                  <Button variant="contained" onClick={generateUnits} disabled={working || !selectedPropertyId} startIcon={working ? <CircularProgress size={16} color="inherit" /> : <PlusCircle size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 4 }}>
                    Generate Unit Registry
                  </Button>
                  <Button variant="outlined" onClick={() => setTenantImportOpen(true)} disabled={!selectedPropertyId} startIcon={<FileSpreadsheet size={16} />} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.4), fontWeight: 950, borderRadius: 3, px: 4 }}>
                    Import Tenants CSV
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={2}>
              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                <Stack direction="row" spacing={1.5} alignItems="center"><Layers color={binThemeTokens.gold} /><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{units.length}</Typography></Stack>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>TOTAL REGISTERED UNITS</Typography>
              </Paper>
              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                <Stack direction="row" spacing={1.5} alignItems="center"><UsersRound color="#10b981" /><Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{occupiedCount}</Typography></Stack>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>OCCUPIED UNITS</Typography>
              </Paper>
              <Paper sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4 }}>
                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF' }}>{vacantCount}</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900 }}>VACANT / READY UNITS</Typography>
              </Paper>
              <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
              <Alert severity="info" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.08), color: '#f8fafc', border: `1px solid ${alpha(binThemeTokens.gold, 0.22)}` }}>
                Recommended flow: generate units → import tenant CSV → review tenant ledger and invitations.
              </Alert>
            </Stack>
          </Grid>
        </Grid>
      </Stack>

      <BulkTenantImportDialog
        open={tenantImportOpen}
        onClose={() => setTenantImportOpen(false)}
        properties={selectedProperty ? [selectedProperty] : properties}
        onImportComplete={() => loadUnits(selectedPropertyId)}
      />
    </AdminPageFrame>
  );
}

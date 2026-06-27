import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Grid, MenuItem, Paper, Stack, TextField, Typography, alpha } from '@mui/material';
import { Building2, ClipboardCheck, Home, ShieldCheck, UserRound, Wrench } from 'lucide-react';
import { collection, db, doc, functions, getDoc, getDocs, httpsCallable, query, where } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import TenantUnitLinkFallback from '../components/TenantUnitLinkFallback';

type UnitDoc = {
  id: string;
  propertyId?: string;
  propertyName?: string;
  unitNumber?: string;
  floor?: number;
  tenantName?: string;
  tenantEmail?: string;
  occupancyStatus?: string;
  tenantStatus?: string;
  maintenanceStatus?: string;
  rentAmount?: number;
  annualRent?: number;
  ownerId?: string;
  ownerUid?: string;
  ownerEmail?: string;
};

type InspectionForm = {
  inspectionType: 'MOVE_IN' | 'MOVE_OUT';
  summary: string;
  notes: string;
  reportUrl: string;
  evidenceUrl: string;
  depositHeld: number;
  damageEstimate: number;
};

const emptyInspectionForm = (): InspectionForm => ({
  inspectionType: 'MOVE_IN',
  summary: '',
  notes: '',
  reportUrl: '',
  evidenceUrl: '',
  depositHeld: 0,
  damageEstimate: 0,
});

export default function TenantUnitPage() {
  const { user } = useRole();
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState<UnitDoc | null>(null);
  const [property, setProperty] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [handoverForm, setHandoverForm] = useState<InspectionForm>(() => emptyInspectionForm());
  const [handoverResult, setHandoverResult] = useState('');

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

  const submitHandoverInspection = async () => {
    if (!unit?.id || !unit?.propertyId) {
      setError('A linked unit and property are required before submitting a handover inspection.');
      return;
    }
    setHandoverSaving(true);
    setError(null);
    try {
      const submitTenantMoveInspection = httpsCallable(functions, 'submitTenantMoveInspection');
      const payload = {
        unitId: unit.id,
        propertyId: unit.propertyId,
        unitNumber: unit.unitNumber || '',
        propertyName: property?.propertyName || property?.name || unit.propertyName || '',
        ownerId: unit.ownerId || property?.ownerId || '',
        ownerUid: unit.ownerUid || property?.ownerUid || property?.ownerId || '',
        ownerEmail: unit.ownerEmail || property?.ownerEmail || '',
        inspectionType: handoverForm.inspectionType,
        type: handoverForm.inspectionType,
        summary: handoverForm.summary.trim(),
        notes: handoverForm.notes.trim(),
        reportUrl: handoverForm.reportUrl.trim(),
        evidenceUrl: handoverForm.evidenceUrl.trim(),
        depositHeld: Number(handoverForm.depositHeld || 0),
        damageEstimate: Number(handoverForm.damageEstimate || 0),
      };
      const result = await submitTenantMoveInspection(payload);
      const data = (result.data || {}) as { propertyInspectionId?: string; legacyInspectionId?: string };
      setHandoverResult(`Submitted. Owner review ID: ${data.propertyInspectionId || 'created'}${data.legacyInspectionId ? ` · Tenant history ID: ${data.legacyInspectionId}` : ''}`);
      setHandoverOpen(false);
      setHandoverForm(emptyInspectionForm());
    } catch (err: any) {
      setError(err?.message || 'Failed to submit handover inspection.');
    } finally {
      setHandoverSaving(false);
    }
  };

  if (loading) return <Box sx={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  if (error && !unit) return <TenantUnitLinkFallback message={error} />;
  if (!unit) return null;

  const occupancy = String(unit.occupancyStatus || 'occupied').toUpperCase();
  const maintenance = String(unit.maintenanceStatus || 'normal').replaceAll('_', ' ').toUpperCase();

  return (
    <Box>
      <Stack spacing={4}>
        {error && <Alert severity="warning" onClose={() => setError(null)}>{error}</Alert>}
        {handoverResult && <Alert severity="success" onClose={() => setHandoverResult('')}>{handoverResult}</Alert>}

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
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start" justifyContent="flex-end">
              <Chip icon={<ShieldCheck size={14} />} label="TENANT ISOLATED VIEW" sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 950 }} />
              <Button startIcon={<ClipboardCheck size={16} />} variant="contained" onClick={() => setHandoverOpen(true)} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                Submit Handover
              </Button>
            </Stack>
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

      <Dialog open={handoverOpen} onClose={() => setHandoverOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Submit move-in / move-out handover</DialogTitle>
        <DialogContent>
          <Stack spacing={2.25} sx={{ pt: 1 }}>
            <TextField select label="Inspection type" value={handoverForm.inspectionType} onChange={(event) => setHandoverForm((current) => ({ ...current, inspectionType: event.target.value as InspectionForm['inspectionType'] }))} fullWidth>
              <MenuItem value="MOVE_IN">Move-in</MenuItem>
              <MenuItem value="MOVE_OUT">Move-out</MenuItem>
            </TextField>
            <TextField label="Summary" value={handoverForm.summary} onChange={(event) => setHandoverForm((current) => ({ ...current, summary: event.target.value }))} fullWidth required />
            <TextField label="Notes" value={handoverForm.notes} onChange={(event) => setHandoverForm((current) => ({ ...current, notes: event.target.value }))} fullWidth multiline minRows={3} />
            <TextField label="Evidence URL" value={handoverForm.evidenceUrl} onChange={(event) => setHandoverForm((current) => ({ ...current, evidenceUrl: event.target.value }))} fullWidth helperText="Paste uploaded photo/video/report evidence URL if available." />
            <TextField label="Report URL" value={handoverForm.reportUrl} onChange={(event) => setHandoverForm((current) => ({ ...current, reportUrl: event.target.value }))} fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField type="number" label="Deposit held" value={handoverForm.depositHeld} onChange={(event) => setHandoverForm((current) => ({ ...current, depositHeld: Number(event.target.value) }))} fullWidth />
              <TextField type="number" label="Damage estimate" value={handoverForm.damageEstimate} onChange={(event) => setHandoverForm((current) => ({ ...current, damageEstimate: Number(event.target.value) }))} fullWidth />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHandoverOpen(false)}>Cancel</Button>
          <Button disabled={handoverSaving || !handoverForm.summary.trim()} onClick={submitHandoverInspection} variant="contained" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
            {handoverSaving ? 'Submitting...' : 'Submit handover'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

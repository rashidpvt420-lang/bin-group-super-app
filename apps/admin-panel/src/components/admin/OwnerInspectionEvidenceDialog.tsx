import React from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Grid, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Camera, CheckCircle2, Dumbbell, MapPin, ShieldCheck } from 'lucide-react';
import { auth, collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';

type GymVerification = {
  verifiedServiceAreaSqft: number;
  verifiedComplexity: 'STANDARD_DRY' | 'ENHANCED' | 'WET_RECOVERY';
  openingSchedule: 'STANDARD_HOURS' | 'EXTENDED_HOURS' | '24_7';
  equipmentCount: number;
  changingRooms: number;
  showers: number;
  groupStudios: number;
  wetFacilities: string[];
  swimmingPool: boolean;
  treatmentRecoveryArea: boolean;
  sportsEstablishmentApprovalStatus: 'verified' | 'pending' | 'not_available' | 'not_applicable';
  insuranceStatus: 'verified' | 'pending' | 'not_available' | 'not_applicable';
  floorPlanStatus: 'verified' | 'pending' | 'not_available' | 'not_applicable';
};

type InspectionRow = {
  id: string;
  propertyId?: string;
  propertyName?: string;
  propertyType?: string;
  evidenceStatus?: string;
  evidenceFileName?: string;
  arrivalLocation?: { distanceMetres?: number };
  ownerDeclaredGymServiceAreaSqft?: number;
  gymProfileSnapshot?: Record<string, any>;
  gymVerification?: GymVerification;
  gymVerificationStatus?: string;
};

type Draft = {
  inspectorName: string;
  findings: string;
  startedAt: string;
  completedAt: string;
  file: File | null;
  gps: { lat: number; lng: number } | null;
  checklist: Record<string, boolean>;
  gymVerification: GymVerification;
};

const checklistItems = [
  ['propertyIdentityConfirmed', 'Property identity confirmed'],
  ['locationConfirmed', 'Location and access confirmed'],
  ['accessAndSafetyReviewed', 'Access and safety reviewed'],
  ['systemsAndConditionReviewed', 'Systems and condition reviewed'],
  ['serviceScopeConfirmed', 'Service scope confirmed'],
] as const;

const wetFacilityOptions = [
  ['sauna', 'Sauna'],
  ['steam', 'Steam room'],
  ['jacuzzi', 'Jacuzzi / hot tub'],
  ['cold_plunge', 'Cold plunge / ice bath'],
  ['recovery_room', 'Recovery room'],
  ['other', 'Other wet / recovery facility'],
] as const;

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const defaultGymVerification = (row?: InspectionRow): GymVerification => {
  const profile = row?.gymProfileSnapshot || {};
  return {
    verifiedServiceAreaSqft: Number(row?.ownerDeclaredGymServiceAreaSqft || profile.declaredServiceAreaSqft || 0),
    verifiedComplexity: (profile.suggestedComplexity || 'STANDARD_DRY') as GymVerification['verifiedComplexity'],
    openingSchedule: (profile.openingSchedule || 'STANDARD_HOURS') as GymVerification['openingSchedule'],
    equipmentCount: Number(profile.equipmentCount || 0),
    changingRooms: Number(profile.changingRooms || 0),
    showers: Number(profile.showers || 0),
    groupStudios: Number(profile.groupStudios || 0),
    wetFacilities: Array.isArray(profile.wetFacilities) ? profile.wetFacilities : [],
    swimmingPool: profile.swimmingPool === true,
    treatmentRecoveryArea: profile.treatmentRecoveryArea === true,
    sportsEstablishmentApprovalStatus: profile.sportsEstablishmentApprovalStatus === 'available' ? 'pending' : (profile.sportsEstablishmentApprovalStatus || 'pending'),
    insuranceStatus: profile.insuranceStatus === 'available' ? 'pending' : (profile.insuranceStatus || 'pending'),
    floorPlanStatus: profile.floorPlanStatus === 'available' ? 'pending' : (profile.floorPlanStatus || 'pending'),
  };
};

const defaultDraft = (row?: InspectionRow): Draft => ({
  inspectorName: auth.currentUser?.displayName || auth.currentUser?.email || '',
  findings: '',
  startedAt: localDateTime(new Date(Date.now() - 30 * 60 * 1000)),
  completedAt: localDateTime(new Date()),
  file: null,
  gps: null,
  checklist: Object.fromEntries(checklistItems.map(([key]) => [key, false])),
  gymVerification: defaultGymVerification(row),
});

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const value = String(reader.result || '');
    resolve(value.includes(',') ? value.split(',').pop() || '' : value);
  };
  reader.onerror = () => reject(reader.error || new Error('Unable to read visit evidence.'));
  reader.readAsDataURL(file);
});

const isGym = (row: InspectionRow) => row.propertyType === 'Gym / Fitness Centre';
const formatMoney = (value: number) => Number(value || 0).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OwnerInspectionEvidenceDialog({
  open,
  intake,
  onClose,
  onCompleted,
}: {
  open: boolean;
  intake: any | null;
  onClose: () => void;
  onCompleted: (message: string) => void;
}) {
  const [rows, setRows] = React.useState<InspectionRow[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = React.useState('');
  const [portfolioNotes, setPortfolioNotes] = React.useState(
    'All property identities, GPS locations, access, systems, condition and agreed service scope were physically verified.',
  );
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');

  React.useEffect(() => {
    if (!open || !intake?.id) return;
    const inspectionsQuery = query(collection(db, 'property_inspections'), where('intakeId', '==', intake.id));
    return onSnapshot(inspectionsQuery, (snapshot) => {
      const nextRows = snapshot.docs
        .map((document) => ({ id: document.id, ...(document.data() as any) } as InspectionRow))
        .sort((a, b) => String(a.propertyId || '').localeCompare(String(b.propertyId || '')));
      setRows(nextRows);
      setDrafts((current) => {
        const next = { ...current };
        nextRows.forEach((row) => {
          if (!next[row.id]) next[row.id] = defaultDraft(row);
        });
        return next;
      });
      setError('');
    }, (streamError) => setError(streamError.message || 'Unable to load property visits.'));
  }, [open, intake?.id]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    const row = rows.find((entry) => entry.id === id);
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || defaultDraft(row)), ...patch } }));
  };

  const updateGym = (id: string, patch: Partial<GymVerification>) => {
    const row = rows.find((entry) => entry.id === id);
    setDrafts((current) => {
      const currentDraft = current[id] || defaultDraft(row);
      return {
        ...current,
        [id]: {
          ...currentDraft,
          gymVerification: { ...currentDraft.gymVerification, ...patch },
        },
      };
    });
  };

  const captureGps = async (id: string) => {
    setError('');
    if (!navigator.geolocation) {
      setError('This device does not support GPS capture.');
      return;
    }
    setBusyId(id);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });
      updateDraft(id, { gps: { lat: position.coords.latitude, lng: position.coords.longitude } });
      setNotice('Arrival GPS captured on this device.');
    } catch (gpsError: any) {
      setError(gpsError?.message || 'GPS capture failed. Enable location permission and retry at the property.');
    } finally {
      setBusyId('');
    }
  };

  const saveEvidence = async (row: InspectionRow) => {
    const draft = drafts[row.id] || defaultDraft(row);
    const checklistComplete = checklistItems.every(([key]) => draft.checklist[key] === true);
    if (!draft.gps || !draft.file || draft.inspectorName.trim().length < 3 || draft.findings.trim().length < 8 || !checklistComplete) {
      setError('Capture GPS, upload a property photo/PDF, complete the checklist, and record clear findings.');
      return;
    }
    if (draft.file.size > 10 * 1024 * 1024) {
      setError('Visit evidence exceeds the secure 10 MB limit.');
      return;
    }
    if (isGym(row)) {
      const verifiedArea = Number(draft.gymVerification.verifiedServiceAreaSqft);
      if (!Number.isFinite(verifiedArea) || verifiedArea <= 0) {
        setError('Gym / Fitness Centre requires the Admin-measured verified service area before the visit can be saved.');
        return;
      }
      if (!['STANDARD_DRY', 'ENHANCED', 'WET_RECOVERY'].includes(draft.gymVerification.verifiedComplexity)) {
        setError('Select the verified Gym complexity band.');
        return;
      }
    }

    setBusyId(row.id);
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'adminRecordOwnerPropertyInspectionEvidence')({
        intakeId: intake.id,
        inspectionId: row.id,
        inspectorName: draft.inspectorName.trim(),
        findings: draft.findings.trim(),
        startedAtMs: new Date(draft.startedAt).getTime(),
        completedAtMs: new Date(draft.completedAt).getTime(),
        arrivalLat: draft.gps.lat,
        arrivalLng: draft.gps.lng,
        checklist: draft.checklist,
        filename: draft.file.name.replace(/[^A-Za-z0-9._-]/g, '_'),
        contentType: draft.file.type || 'image/jpeg',
        encodedDocument: await fileToBase64(draft.file),
        ...(isGym(row) ? { gymVerification: draft.gymVerification } : {}),
      });
      setNotice(`Verified evidence recorded for ${row.propertyName || row.propertyId || row.id}.`);
    } catch (saveError: any) {
      setError(saveError?.details || saveError?.message || 'Visit evidence could not be recorded.');
    } finally {
      setBusyId('');
    }
  };

  const allVerified = rows.length > 0 && rows.every((row) => {
    const evidenceVerified = String(row.evidenceStatus || '').toUpperCase() === 'VERIFIED';
    const gymVerified = !isGym(row) || String(row.gymVerificationStatus || '').toUpperCase() === 'VERIFIED';
    return evidenceVerified && gymVerified;
  });

  const completePortfolio = async () => {
    if (!allVerified || portfolioNotes.trim().length < 8) {
      setError('Record verified evidence for every property, complete every Gym verification, and add portfolio notes first.');
      return;
    }
    setBusyId('complete');
    setError('');
    try {
      const response = await httpsCallable(functions, 'adminCompleteOwnerPortfolioInspections')({
        intakeId: intake.id,
        notes: portfolioNotes.trim(),
      });
      const result = response.data as { activationDeposit?: number; annualContractValue?: number; finalVerifiedQuoteHash?: string };
      onCompleted(
        `Every evidence-backed visit is complete and the portfolio was re-priced from verified facts. Final annual value AED ${formatMoney(Number(result.annualContractValue || 0))}; exact 15% mobilisation AED ${formatMoney(Number(result.activationDeposit || 0))}.`,
      );
      onClose();
    } catch (completionError: any) {
      setError(completionError?.details || completionError?.message || 'Portfolio completion failed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Dialog open={open} onClose={() => !busyId && onClose()} fullWidth maxWidth="lg">
      <DialogTitle sx={{ fontWeight: 950 }}>Guided Property Visit Evidence & Final Verification</DialogTitle>
      <DialogContent>
        <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 2 }}>
          Admin records one secure evidence package per property. For Gym / Fitness Centre assets, verified area and complexity are mandatory and become the authoritative final-quote inputs. The 15% remains locked until every property passes verification.
        </Alert>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

        <Stack spacing={2}>
          {rows.map((row, index) => {
            const verified = String(row.evidenceStatus || '').toUpperCase() === 'VERIFIED';
            const gymVerified = !isGym(row) || String(row.gymVerificationStatus || '').toUpperCase() === 'VERIFIED';
            const draft = drafts[row.id] || defaultDraft(row);
            return (
              <Paper key={row.id} variant="outlined" sx={{ p: 2.5, borderColor: verified && gymVerified ? 'success.main' : 'divider' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography fontWeight={950}>Property {index + 1}: {row.propertyName || row.propertyId || row.id}</Typography>
                    <Typography variant="caption">{row.propertyType || 'Property'} · Inspection {row.id}</Typography>
                  </Box>
                  {verified && gymVerified && (
                    <Alert severity="success" icon={<CheckCircle2 size={16} />}>
                      Evidence verified
                      {Number.isFinite(Number(row.arrivalLocation?.distanceMetres)) ? ` · ${row.arrivalLocation?.distanceMetres} m from property` : ''}
                    </Alert>
                  )}
                </Stack>

                {isGym(row) && !verified && (
                  <Paper variant="outlined" sx={{ p: 2.5, mt: 2, bgcolor: 'rgba(218,165,32,0.05)' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <Dumbbell size={19} />
                      <Box>
                        <Typography fontWeight={950}>Gym / Fitness Centre site verification</Typography>
                        <Typography variant="caption">Owner-declared area: {Number(row.ownerDeclaredGymServiceAreaSqft || 0).toLocaleString('en-AE')} sq ft. Admin measurement below controls the final quote.</Typography>
                      </Box>
                    </Stack>
                    <Grid container spacing={2}>
                      <Grid item xs={12} md={4}><TextField fullWidth required type="number" label="Verified measured service area (sq ft)" value={draft.gymVerification.verifiedServiceAreaSqft || ''} onChange={(event) => updateGym(row.id, { verifiedServiceAreaSqft: Math.max(0, Number(event.target.value)) })} /></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth required select label="Verified complexity" value={draft.gymVerification.verifiedComplexity} onChange={(event) => updateGym(row.id, { verifiedComplexity: event.target.value as GymVerification['verifiedComplexity'] })}><MenuItem value="STANDARD_DRY">STANDARD DRY</MenuItem><MenuItem value="ENHANCED">ENHANCED</MenuItem><MenuItem value="WET_RECOVERY">WET / RECOVERY</MenuItem></TextField></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth select label="Verified opening schedule" value={draft.gymVerification.openingSchedule} onChange={(event) => updateGym(row.id, { openingSchedule: event.target.value as GymVerification['openingSchedule'] })}><MenuItem value="STANDARD_HOURS">Standard hours</MenuItem><MenuItem value="EXTENDED_HOURS">Extended hours</MenuItem><MenuItem value="24_7">24×7</MenuItem></TextField></Grid>
                      <Grid item xs={6} md={3}><TextField fullWidth type="number" label="Verified equipment count" value={draft.gymVerification.equipmentCount} onChange={(event) => updateGym(row.id, { equipmentCount: Math.max(0, Number(event.target.value)) })} helperText="Scope only — not a property price multiplier" /></Grid>
                      <Grid item xs={6} md={3}><TextField fullWidth type="number" label="Changing rooms" value={draft.gymVerification.changingRooms} onChange={(event) => updateGym(row.id, { changingRooms: Math.max(0, Number(event.target.value)) })} /></Grid>
                      <Grid item xs={6} md={3}><TextField fullWidth type="number" label="Showers" value={draft.gymVerification.showers} onChange={(event) => updateGym(row.id, { showers: Math.max(0, Number(event.target.value)) })} /></Grid>
                      <Grid item xs={6} md={3}><TextField fullWidth type="number" label="Group studios" value={draft.gymVerification.groupStudios} onChange={(event) => updateGym(row.id, { groupStudios: Math.max(0, Number(event.target.value)) })} /></Grid>
                      <Grid item xs={12}><Box><Typography variant="subtitle2" fontWeight={900}>Wet / recovery facilities</Typography><Stack direction="row" flexWrap="wrap" useFlexGap>{wetFacilityOptions.map(([value, label]) => <FormControlLabel key={value} control={<Checkbox checked={draft.gymVerification.wetFacilities.includes(value)} onChange={(event) => updateGym(row.id, { wetFacilities: event.target.checked ? Array.from(new Set([...draft.gymVerification.wetFacilities, value])) : draft.gymVerification.wetFacilities.filter((entry) => entry !== value) })} />} label={label} />)}</Stack></Box></Grid>
                      <Grid item xs={12} md={6}><FormControlLabel control={<Checkbox checked={draft.gymVerification.swimmingPool} onChange={(event) => updateGym(row.id, { swimmingPool: event.target.checked })} />} label="Swimming pool present" /></Grid>
                      <Grid item xs={12} md={6}><FormControlLabel control={<Checkbox checked={draft.gymVerification.treatmentRecoveryArea} onChange={(event) => updateGym(row.id, { treatmentRecoveryArea: event.target.checked })} />} label="Dedicated treatment / recovery area" /></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth select label="Sports establishment approval" value={draft.gymVerification.sportsEstablishmentApprovalStatus} onChange={(event) => updateGym(row.id, { sportsEstablishmentApprovalStatus: event.target.value as GymVerification['sportsEstablishmentApprovalStatus'] })}><MenuItem value="verified">Verified</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="not_available">Not available</MenuItem><MenuItem value="not_applicable">Not applicable</MenuItem></TextField></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth select label="Insurance" value={draft.gymVerification.insuranceStatus} onChange={(event) => updateGym(row.id, { insuranceStatus: event.target.value as GymVerification['insuranceStatus'] })}><MenuItem value="verified">Verified</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="not_available">Not available</MenuItem><MenuItem value="not_applicable">Not applicable</MenuItem></TextField></Grid>
                      <Grid item xs={12} md={4}><TextField fullWidth select label="Floor plan" value={draft.gymVerification.floorPlanStatus} onChange={(event) => updateGym(row.id, { floorPlanStatus: event.target.value as GymVerification['floorPlanStatus'] })}><MenuItem value="verified">Verified</MenuItem><MenuItem value="pending">Pending</MenuItem><MenuItem value="not_available">Not available</MenuItem><MenuItem value="not_applicable">Not applicable</MenuItem></TextField></Grid>
                    </Grid>
                    <Alert severity="warning" sx={{ mt: 2 }}>Member count and equipment count remain scope information only. The measured service area and verified complexity are the Gym FM pricing drivers.</Alert>
                  </Paper>
                )}

                {isGym(row) && verified && row.gymVerification && (
                  <Alert severity="success" sx={{ mt: 2 }}>
                    Gym authority locked: {Number(row.gymVerification.verifiedServiceAreaSqft || 0).toLocaleString('en-AE')} sq ft · {row.gymVerification.verifiedComplexity} · {row.gymVerification.openingSchedule}.
                  </Alert>
                )}

                {!verified && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <TextField label="Inspector name" value={draft.inspectorName} onChange={(event) => updateDraft(row.id, { inspectorName: event.target.value })} fullWidth />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField type="datetime-local" label="Visit started" InputLabelProps={{ shrink: true }} value={draft.startedAt} onChange={(event) => updateDraft(row.id, { startedAt: event.target.value })} fullWidth />
                      <TextField type="datetime-local" label="Visit completed" InputLabelProps={{ shrink: true }} value={draft.completedAt} onChange={(event) => updateDraft(row.id, { completedAt: event.target.value })} fullWidth />
                    </Stack>
                    <TextField label="Property findings and recommended works" multiline minRows={3} value={draft.findings} onChange={(event) => updateDraft(row.id, { findings: event.target.value })} fullWidth />
                    <Box>
                      {checklistItems.map(([key, label]) => (
                        <FormControlLabel key={key} control={<Checkbox checked={draft.checklist[key] === true} onChange={(event) => updateDraft(row.id, { checklist: { ...draft.checklist, [key]: event.target.checked } })} />} label={label} />
                      ))}
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button variant="outlined" startIcon={<MapPin size={17} />} disabled={busyId === row.id} onClick={() => void captureGps(row.id)}>{draft.gps ? `GPS captured: ${draft.gps.lat.toFixed(5)}, ${draft.gps.lng.toFixed(5)}` : 'Capture arrival GPS now'}</Button>
                      <Button component="label" variant="outlined" startIcon={<Camera size={17} />}>{draft.file ? draft.file.name : 'Add property photo or PDF'}<input hidden type="file" accept="image/*,.pdf" capture="environment" onChange={(event) => updateDraft(row.id, { file: event.target.files?.[0] || null })} /></Button>
                    </Stack>
                    <Button variant="contained" disabled={busyId === row.id} onClick={() => void saveEvidence(row)} startIcon={busyId === row.id ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={17} />}>Verify and save this property visit</Button>
                  </Stack>
                )}
              </Paper>
            );
          })}

          {!rows.length && <Alert severity="warning">Create and link one property visit per property before recording evidence.</Alert>}
          <TextField label="Portfolio completion notes" multiline minRows={3} value={portfolioNotes} onChange={(event) => setPortfolioNotes(event.target.value)} fullWidth />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={Boolean(busyId)}>Close</Button>
        <Button variant="contained" color="success" disabled={!allVerified || portfolioNotes.trim().length < 8 || Boolean(busyId)} onClick={() => void completePortfolio()} startIcon={busyId === 'complete' ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={17} />}>Complete verified visits, final re-quote & request 15%</Button>
      </DialogActions>
    </Dialog>
  );
}

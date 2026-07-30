import React from 'react';
import {
  Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { Camera, CheckCircle2, MapPin, ShieldCheck } from 'lucide-react';
import { auth, collection, db, functions, httpsCallable, onSnapshot, query, where } from '../../lib/firebase';

type InspectionRow = {
  id: string;
  propertyId?: string;
  propertyName?: string;
  evidenceStatus?: string;
  evidenceFileName?: string;
  arrivalLocation?: { distanceMetres?: number };
};

type Draft = {
  inspectorName: string;
  findings: string;
  startedAt: string;
  completedAt: string;
  file: File | null;
  gps: { lat: number; lng: number } | null;
  checklist: Record<string, boolean>;
};

const checklistItems = [
  ['propertyIdentityConfirmed', 'Property identity confirmed'],
  ['locationConfirmed', 'Location and access confirmed'],
  ['accessAndSafetyReviewed', 'Access and safety reviewed'],
  ['systemsAndConditionReviewed', 'Systems and condition reviewed'],
  ['serviceScopeConfirmed', 'Service scope confirmed'],
] as const;

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const defaultDraft = (): Draft => ({
  inspectorName: auth.currentUser?.displayName || auth.currentUser?.email || '',
  findings: '',
  startedAt: localDateTime(new Date(Date.now() - 30 * 60 * 1000)),
  completedAt: localDateTime(new Date()),
  file: null,
  gps: null,
  checklist: Object.fromEntries(checklistItems.map(([key]) => [key, false])),
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
          if (!next[row.id]) next[row.id] = defaultDraft();
        });
        return next;
      });
      setError('');
    }, (streamError) => setError(streamError.message || 'Unable to load property visits.'));
  }, [open, intake?.id]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || defaultDraft()), ...patch } }));
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
    const draft = drafts[row.id] || defaultDraft();
    const checklistComplete = checklistItems.every(([key]) => draft.checklist[key] === true);
    if (!draft.gps || !draft.file || draft.inspectorName.trim().length < 3 || draft.findings.trim().length < 8 || !checklistComplete) {
      setError('Capture GPS, upload a property photo/PDF, complete the checklist, and record clear findings.');
      return;
    }
    if (draft.file.size > 10 * 1024 * 1024) {
      setError('Visit evidence exceeds the secure 10 MB limit.');
      return;
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
      });
      setNotice(`Verified evidence recorded for ${row.propertyName || row.propertyId || row.id}.`);
    } catch (saveError: any) {
      setError(saveError?.details || saveError?.message || 'Visit evidence could not be recorded.');
    } finally {
      setBusyId('');
    }
  };

  const allVerified = rows.length > 0 && rows.every((row) => String(row.evidenceStatus || '').toUpperCase() === 'VERIFIED');

  const completePortfolio = async () => {
    if (!allVerified || portfolioNotes.trim().length < 8) {
      setError('Record verified evidence for every property and add portfolio notes first.');
      return;
    }
    setBusyId('complete');
    setError('');
    try {
      const response = await httpsCallable(functions, 'adminCompleteOwnerPortfolioInspections')({
        intakeId: intake.id,
        notes: portfolioNotes.trim(),
      });
      const result = response.data as { activationDeposit?: number };
      onCompleted(
        `Every evidence-backed visit is complete. AED ${Number(result.activationDeposit || 0).toLocaleString('en-AE', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} is now due as the exact 15% mobilisation payment.`,
      );
      onClose();
    } catch (completionError: any) {
      setError(completionError?.details || completionError?.message || 'Portfolio completion failed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Dialog open={open} onClose={() => !busyId && onClose()} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: 950 }}>Guided Property Visit Evidence</DialogTitle>
      <DialogContent>
        <Alert severity="info" icon={<ShieldCheck size={20} />} sx={{ mb: 2 }}>
          Admin records one secure evidence package per property. The 15% payment remains locked until every package passes GPS, checklist, photo and timestamp validation.
        </Alert>
        {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
        {notice && <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: 2 }}>{notice}</Alert>}

        <Stack spacing={2}>
          {rows.map((row, index) => {
            const verified = String(row.evidenceStatus || '').toUpperCase() === 'VERIFIED';
            const draft = drafts[row.id] || defaultDraft();
            return (
              <Paper key={row.id} variant="outlined" sx={{ p: 2.5, borderColor: verified ? 'success.main' : 'divider' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                  <Box>
                    <Typography fontWeight={950}>Property {index + 1}: {row.propertyName || row.propertyId || row.id}</Typography>
                    <Typography variant="caption">Inspection {row.id}</Typography>
                  </Box>
                  {verified && (
                    <Alert severity="success" icon={<CheckCircle2 size={16} />}>
                      Evidence verified
                      {Number.isFinite(Number(row.arrivalLocation?.distanceMetres)) ? ` · ${row.arrivalLocation?.distanceMetres} m from property` : ''}
                    </Alert>
                  )}
                </Stack>

                {!verified && (
                  <Stack spacing={2} sx={{ mt: 2 }}>
                    <TextField
                      label="Inspector name"
                      value={draft.inspectorName}
                      onChange={(event) => updateDraft(row.id, { inspectorName: event.target.value })}
                      fullWidth
                    />
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                      <TextField
                        type="datetime-local"
                        label="Visit started"
                        InputLabelProps={{ shrink: true }}
                        value={draft.startedAt}
                        onChange={(event) => updateDraft(row.id, { startedAt: event.target.value })}
                        fullWidth
                      />
                      <TextField
                        type="datetime-local"
                        label="Visit completed"
                        InputLabelProps={{ shrink: true }}
                        value={draft.completedAt}
                        onChange={(event) => updateDraft(row.id, { completedAt: event.target.value })}
                        fullWidth
                      />
                    </Stack>
                    <TextField
                      label="Property findings and recommended works"
                      multiline
                      minRows={3}
                      value={draft.findings}
                      onChange={(event) => updateDraft(row.id, { findings: event.target.value })}
                      fullWidth
                    />
                    <Box>
                      {checklistItems.map(([key, label]) => (
                        <FormControlLabel
                          key={key}
                          control={(
                            <Checkbox
                              checked={draft.checklist[key] === true}
                              onChange={(event) => updateDraft(row.id, {
                                checklist: { ...draft.checklist, [key]: event.target.checked },
                              })}
                            />
                          )}
                          label={label}
                        />
                      ))}
                    </Box>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                      <Button
                        variant="outlined"
                        startIcon={<MapPin size={17} />}
                        disabled={busyId === row.id}
                        onClick={() => void captureGps(row.id)}
                      >
                        {draft.gps ? `GPS captured: ${draft.gps.lat.toFixed(5)}, ${draft.gps.lng.toFixed(5)}` : 'Capture arrival GPS now'}
                      </Button>
                      <Button component="label" variant="outlined" startIcon={<Camera size={17} />}>
                        {draft.file ? draft.file.name : 'Add property photo or PDF'}
                        <input
                          hidden
                          type="file"
                          accept="image/*,.pdf"
                          capture="environment"
                          onChange={(event) => updateDraft(row.id, { file: event.target.files?.[0] || null })}
                        />
                      </Button>
                    </Stack>
                    <Button
                      variant="contained"
                      disabled={busyId === row.id}
                      onClick={() => void saveEvidence(row)}
                      startIcon={busyId === row.id ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={17} />}
                    >
                      Verify and save this property visit
                    </Button>
                  </Stack>
                )}
              </Paper>
            );
          })}

          {!rows.length && <Alert severity="warning">Create and link one property visit per property before recording evidence.</Alert>}
          <TextField
            label="Portfolio completion notes"
            multiline
            minRows={3}
            value={portfolioNotes}
            onChange={(event) => setPortfolioNotes(event.target.value)}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={Boolean(busyId)}>Close</Button>
        <Button
          variant="contained"
          color="success"
          disabled={!allVerified || portfolioNotes.trim().length < 8 || Boolean(busyId)}
          onClick={() => void completePortfolio()}
          startIcon={busyId === 'complete' ? <CircularProgress size={16} color="inherit" /> : <CheckCircle2 size={17} />}
        >
          Complete verified visits & request 15%
        </Button>
      </DialogActions>
    </Dialog>
  );
}

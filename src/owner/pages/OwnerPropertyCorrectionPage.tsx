import React from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowLeft, RefreshCcw, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { doc, functions, getDoc, httpsCallable, db } from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

type FormState = {
  propertyName: string;
  address: string;
  emirate: string;
  city: string;
  area: string;
  titleDeedNumber: string;
  lat: string;
  lng: string;
};

const clean = (value: unknown) => String(value || '').trim();
const normalizedStatus = (value: unknown) => clean(value).toLowerCase().replace(/[\s-]+/g, '_');

export default function OwnerPropertyCorrectionPage() {
  const { propertyId = '' } = useParams();
  const { user } = useRole();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [form, setForm] = React.useState<FormState>({
    propertyName: '',
    address: '',
    emirate: '',
    city: '',
    area: '',
    titleDeedNumber: '',
    lat: '',
    lng: '',
  });

  const load = React.useCallback(async () => {
    if (!propertyId || !user?.uid) {
      setError('Property correction context is missing.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const snapshot = await getDoc(doc(db, 'properties', propertyId));
      if (!snapshot.exists()) throw new Error('Property was not found or is not available to this Owner.');
      const property: any = snapshot.data() || {};
      const boundOwner = clean(property.ownerUid || property.ownerId);
      if (boundOwner !== user.uid) throw new Error('This property is not owned by the signed-in Owner.');
      const nextStatus = normalizedStatus(property.status || property.approvalStatus || property.onboardingStatus);
      setStatus(nextStatus);
      const geo = property.submittedGeo || property.geo || {};
      setReason(clean(property.changeRequestReason));
      setForm({
        propertyName: clean(property.propertyName || property.name),
        address: clean(property.address || property.propertyAddress || geo.address),
        emirate: clean(property.emirate || geo.emirate),
        city: clean(property.city || geo.city),
        area: clean(property.area || property.community || geo.area),
        titleDeedNumber: clean(property.titleDeedNumber || property.titleDeedId || property.titleDeedReference),
        lat: Number.isFinite(Number(geo.lat)) ? String(geo.lat) : '',
        lng: Number.isFinite(Number(geo.lng)) ? String(geo.lng) : '',
      });
    } catch (loadError: any) {
      setError(loadError?.message || 'Unable to load the property correction request.');
    } finally {
      setLoading(false);
    }
  }, [propertyId, user?.uid]);

  React.useEffect(() => { void load(); }, [load]);

  const setField = (key: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const submit = async () => {
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (status !== 'changes_requested') {
      setError('This property is not currently eligible for resubmission.');
      return;
    }
    if (!form.propertyName.trim() || !form.address.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('Property name, address and valid submitted coordinates are required.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const resubmit = httpsCallable(functions, 'resubmitOwnerProperty');
      await resubmit({
        propertyId,
        property: {
          propertyName: form.propertyName.trim(),
          name: form.propertyName.trim(),
          address: form.address.trim(),
          propertyAddress: form.address.trim(),
          emirate: form.emirate.trim(),
          city: form.city.trim(),
          area: form.area.trim(),
          titleDeedNumber: form.titleDeedNumber.trim(),
          submittedGeo: {
            lat,
            lng,
            address: form.address.trim(),
            emirate: form.emirate.trim(),
            city: form.city.trim(),
            area: form.area.trim(),
          },
        },
      });
      navigate('/owner/properties', { replace: true });
    } catch (submitError: any) {
      setError(submitError?.message || 'Property resubmission failed. No lifecycle state was changed.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Box minHeight="50vh" display="grid" sx={{ placeItems: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;
  }

  return (
    <Box sx={{ pb: 6 }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}>
          <Box>
            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 2 }}>OWNER PROPERTY CORRECTION</Typography>
            <Typography variant="h4" fontWeight="950">Correct & Resubmit Property</Typography>
            <Typography color="text.secondary">Only Owner-submitted details are editable here. GPS remains unverified until a BIN GROUP physical inspection is completed.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<ArrowLeft size={17} />} onClick={() => navigate('/owner/properties')}>Back</Button>
            <Button startIcon={<RefreshCcw size={17} />} onClick={() => void load()} disabled={busy}>Reload</Button>
          </Stack>
        </Stack>

        {reason && <Alert severity="warning"><strong>BIN GROUP requested changes:</strong> {reason}</Alert>}
        {error && <Alert severity="error">{error}</Alert>}
        {status !== 'changes_requested' && (
          <Alert severity="info">Current status: {status || 'unknown'}. Resubmission is available only from CHANGES_REQUESTED.</Alert>
        )}

        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4 }}>
          <Grid container spacing={2.5}>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required label="Property name" value={form.propertyName} onChange={setField('propertyName')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth label="Title deed / property reference" value={form.titleDeedNumber} onChange={setField('titleDeedNumber')} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth required label="Property address" value={form.address} onChange={setField('address')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Emirate" value={form.emirate} onChange={setField('emirate')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="City" value={form.city} onChange={setField('city')} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Area / community" value={form.area} onChange={setField('area')} />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required inputMode="decimal" label="Submitted latitude" value={form.lat} onChange={setField('lat')} helperText="Owner-submitted only — not verified GPS." />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField fullWidth required inputMode="decimal" label="Submitted longitude" value={form.lng} onChange={setField('lng')} helperText="Dispatch remains locked until physical inspection." />
            </Grid>
          </Grid>

          <Alert severity="info" sx={{ mt: 3 }}>
            Resubmitting does not approve, verify, activate or make this property dispatch-ready. It returns the property to BIN GROUP review and the mandatory physical-inspection workflow.
          </Alert>

          <Button
            data-testid="owner-property-resubmit"
            fullWidth
            variant="contained"
            startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <Send size={18} />}
            disabled={busy || status !== 'changes_requested'}
            onClick={() => void submit()}
            sx={{ mt: 3, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.4 }}
          >
            Resubmit for Review & Physical Inspection
          </Button>
        </Paper>
      </Stack>
    </Box>
  );
}

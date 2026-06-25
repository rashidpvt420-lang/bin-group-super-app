import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardCheck,
  Droplets,
  FileText,
  Key,
  Minus,
  Plus,
  Save,
  X,
  Zap,
} from 'lucide-react';
import {
  addDoc,
  collection,
  db,
  doc,
  getDoc,
  getDocs,
  getDownloadURL,
  query,
  ref,
  serverTimestamp,
  storage,
  uploadBytes,
  where,
} from '../../lib/firebase';
import { useRole } from '../../context/RoleContext';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import SafeIcon from '../../components/SafeIcon';

const ROOMS = [
  { id: 'entrance', label: 'Entrance / Foyer', icon: '🚪', items: ['Flooring', 'Walls & Paint', 'Ceiling', 'Lighting', 'Door / Lock'] },
  { id: 'living', label: 'Living Room', icon: '🛋️', items: ['Flooring', 'Walls & Paint', 'Ceiling', 'Lighting', 'Windows / Blinds'] },
  { id: 'master_bedroom', label: 'Master Bedroom', icon: '🛏️', items: ['Flooring', 'Walls & Paint', 'Ceiling', 'Lighting', 'Wardrobe', 'AC Unit', 'Windows / Blinds'] },
  { id: 'bedroom2', label: 'Bedroom 2', icon: '🛏️', items: ['Flooring', 'Walls & Paint', 'Ceiling', 'Lighting', 'AC Unit'] },
  { id: 'kitchen', label: 'Kitchen', icon: '🍳', items: ['Flooring', 'Cabinets', 'Countertops', 'Sink / Taps', 'Exhaust Fan', 'Lighting'] },
  { id: 'bathroom_master', label: 'Master Bathroom', icon: '🚿', items: ['Flooring / Tiles', 'Walls / Tiles', 'Shower / Tub', 'Toilet', 'Sink / Taps', 'Mirror', 'Exhaust Fan'] },
  { id: 'bathroom2', label: 'Bathroom 2', icon: '🚿', items: ['Flooring / Tiles', 'Toilet', 'Sink / Taps', 'Exhaust Fan'] },
  { id: 'balcony', label: 'Balcony / Terrace', icon: '🌿', items: ['Flooring', 'Railing', 'Drain'] },
  { id: 'utility', label: 'Utility / Store Room', icon: '📦', items: ['Flooring', 'Walls', 'Lighting'] },
];

type Condition = 'good' | 'fair' | 'poor' | '';
type MoveType = 'move_in' | 'move_out';
type Step = 'rooms' | 'meters' | 'handover' | 'sign' | 'done';
type RoomChecks = Record<string, { condition: Condition; notes: string; photoUrl: string }>;

interface InspectionState {
  type: MoveType;
  roomChecks: Record<string, RoomChecks>;
  expandedRoom: string | null;
  electricityMeter: string;
  waterMeter: string;
  gasMeter: string;
  keyCount: string;
  fobCount: string;
  parkingRemote: boolean;
  mailboxKey: boolean;
  depositNotes: string;
  tenantSignature: string;
  ownerSignature: string;
  step: Step;
}

const STEPS: Step[] = ['rooms', 'meters', 'handover', 'sign'];
const STEP_LABELS = ['Room Checklist', 'Meter Readings', 'Key Handover', 'Sign & Submit'];

const conditionColor: Record<Condition, string> = {
  good: '#10b981',
  fair: '#f59e0b',
  poor: '#ef4444',
  '': 'rgba(255,255,255,0.2)',
};

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();
const inspectionTypeFor = (type: MoveType) => type === 'move_out' ? 'MOVE_OUT' : 'MOVE_IN';
const titleFor = (type: MoveType) => type === 'move_out' ? 'Move-Out Inspection' : 'Move-In Inspection';
const sanitizeStorageFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'evidence.jpg';

const initRoomChecks = (): Record<string, RoomChecks> => {
  const result: Record<string, RoomChecks> = {};
  for (const room of ROOMS) {
    result[room.id] = {};
    for (const item of room.items) result[room.id][item] = { condition: '', notes: '', photoUrl: '' };
  }
  return result;
};

const collectEvidenceUrls = (roomChecks: Record<string, RoomChecks>) => Object.values(roomChecks)
  .flatMap((room) => Object.values(room).map((check) => check.photoUrl).filter(Boolean));

export default function TenantMoveInspectionPage() {
  const { user } = useRole();
  const { type } = useParams();
  const navigate = useNavigate();
  const { tx, isRTL } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [unitData, setUnitData] = useState<any>(null);
  const [propertyData, setPropertyData] = useState<any>(null);
  const [residenceLoading, setResidenceLoading] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<{ roomId: string; item: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');

  const [state, setState] = useState<InspectionState>({
    type: String(type || '').toLowerCase().includes('out') ? 'move_out' : 'move_in',
    roomChecks: initRoomChecks(),
    expandedRoom: ROOMS[0].id,
    electricityMeter: '',
    waterMeter: '',
    gasMeter: '',
    keyCount: '2',
    fobCount: '1',
    parkingRemote: false,
    mailboxKey: false,
    depositNotes: '',
    tenantSignature: '',
    ownerSignature: '',
    step: 'rooms',
  });

  useEffect(() => {
    const incomingType: MoveType = String(type || '').toLowerCase().includes('out') ? 'move_out' : 'move_in';
    setState((prev) => ({ ...prev, type: incomingType }));
  }, [type]);

  useEffect(() => {
    let alive = true;
    async function fetchResidence() {
      if (!user?.uid) return;
      setResidenceLoading(true);
      try {
        let unitSnap = await getDocs(query(collection(db, 'units'), where('tenantId', '==', user.uid)));
        if (unitSnap.empty && user.email) unitSnap = await getDocs(query(collection(db, 'units'), where('tenantEmail', '==', normalizeEmail(user.email))));
        if (unitSnap.empty) return;
        const unit = { id: unitSnap.docs[0].id, ...unitSnap.docs[0].data() } as any;
        if (!alive) return;
        setUnitData(unit);
        if (unit.propertyId) {
          const propSnap = await getDoc(doc(db, 'properties', unit.propertyId));
          if (propSnap.exists() && alive) setPropertyData({ id: propSnap.id, ...propSnap.data() });
        }
      } catch (err) {
        console.error('[TenantMoveInspection] residence fetch failed:', err);
        setError('Could not load assigned unit/property. Try again or contact management.');
      } finally {
        if (alive) setResidenceLoading(false);
      }
    }
    fetchResidence();
    return () => { alive = false; };
  }, [user?.uid, user?.email]);

  const setCondition = (roomId: string, item: string, condition: Condition) => {
    setState((prev) => ({
      ...prev,
      roomChecks: {
        ...prev.roomChecks,
        [roomId]: { ...prev.roomChecks[roomId], [item]: { ...prev.roomChecks[roomId][item], condition } },
      },
    }));
  };

  const setNotes = (roomId: string, item: string, notes: string) => {
    setState((prev) => ({
      ...prev,
      roomChecks: {
        ...prev.roomChecks,
        [roomId]: { ...prev.roomChecks[roomId], [item]: { ...prev.roomChecks[roomId][item], notes } },
      },
    }));
  };

  const handlePhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !uploadingFor) return;
    if (!user?.uid) {
      setPhotoError('You must be signed in to attach a photo.');
      return;
    }
    const { roomId, item } = uploadingFor;
    const uploadKey = `${roomId}:${item}`;
    setUploadingFor(null);
    setPhotoUploading(uploadKey);
    setPhotoError('');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const safeItem = item.replace(/[^a-z0-9]+/gi, '_');
      const storageRef = ref(storage, `inspections/${user.uid}/${Date.now()}_${roomId}_${safeItem}_${sanitizeStorageFileName(file.name)}.${ext}`);
      await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
      const photoUrl = await getDownloadURL(storageRef);
      setState((prev) => ({
        ...prev,
        roomChecks: {
          ...prev.roomChecks,
          [roomId]: { ...prev.roomChecks[roomId], [item]: { ...prev.roomChecks[roomId][item], photoUrl } },
        },
      }));
    } catch (err: any) {
      setPhotoError(err?.message || 'Photo upload failed. Please try again.');
    } finally {
      setPhotoUploading(null);
    }
  };

  const roomProgress = (roomId: string) => {
    const checks = Object.values(state.roomChecks[roomId] || {});
    const done = checks.filter((check) => check.condition !== '').length;
    return { done, total: checks.length };
  };

  const overallProgress = () => {
    const all = ROOMS.flatMap((room) => Object.values(state.roomChecks[room.id] || {}));
    const done = all.filter((check) => check.condition !== '').length;
    return Math.round((done / Math.max(all.length, 1)) * 100);
  };

  const poorItems = ROOMS.flatMap((room) =>
    Object.entries(state.roomChecks[room.id] || {})
      .filter(([, value]) => value.condition === 'poor')
      .map(([item]) => `${room.label}: ${item}`),
  );

  const submitPayload = () => {
    const inspectionType = inspectionTypeFor(state.type);
    const evidencePhotos = collectEvidenceUrls(state.roomChecks);
    return {
      tenantId: user?.uid || null,
      tenantUid: user?.uid || null,
      tenantEmail: normalizeEmail(user?.email),
      tenantName: user?.displayName || 'Resident',
      ownerId: propertyData?.ownerId || propertyData?.ownerUid || unitData?.ownerId || '',
      ownerUid: propertyData?.ownerUid || propertyData?.ownerId || unitData?.ownerUid || unitData?.ownerId || '',
      ownerEmail: normalizeEmail(propertyData?.ownerEmail || unitData?.ownerEmail),
      propertyId: unitData?.propertyId || propertyData?.id || '',
      propertyName: propertyData?.propertyName || propertyData?.name || unitData?.propertyName || '',
      propertyPassportId: propertyData?.propertyPassportId || propertyData?.passportId || unitData?.propertyPassportId || '',
      unitId: unitData?.id || unitData?.unitId || '',
      unitNumber: unitData?.unitNumber || unitData?.number || '',
      inspectionType,
      type: inspectionType,
      legacyType: state.type,
      title: titleFor(state.type),
      roomChecks: state.roomChecks,
      evidencePhotos,
      photos: evidencePhotos,
      meters: { electricity: state.electricityMeter, water: state.waterMeter, gas: state.gasMeter },
      keyHandover: {
        keys: Number(state.keyCount || 0),
        fobs: Number(state.fobCount || 0),
        parkingRemote: state.parkingRemote,
        mailboxKey: state.mailboxKey,
      },
      depositNotes: state.depositNotes,
      poorConditionItems: poorItems,
      signatures: { tenant: state.tenantSignature, owner: state.ownerSignature },
      tenantSignature: state.tenantSignature,
      ownerSignature: state.ownerSignature,
      status: 'SUBMITTED',
      ownerReviewStatus: 'PENDING',
      source: 'TENANT_PORTAL',
      submittedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
  };

  const handleSubmit = async () => {
    if (!state.tenantSignature.trim()) { setError('Tenant signature is required.'); return; }
    if (!user?.uid) { setError('You must be signed in to submit an inspection.'); return; }
    if (!unitData?.propertyId && !propertyData?.id) { setError('No linked property was found. Cannot submit inspection.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const payload = submitPayload();
      const ownerReviewRef = await addDoc(collection(db, 'propertyInspections'), payload);
      await addDoc(collection(db, 'inspections'), {
        ...payload,
        ownerReviewInspectionId: ownerReviewRef.id,
        status: 'submitted',
      });
      setState((prev) => ({ ...prev, step: 'done' }));
    } catch (err: any) {
      console.error('[TenantMoveInspection] submission failed:', err);
      setError(err?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentStepIdx = Math.max(0, STEPS.indexOf(state.step));
  const progress = Math.round(((currentStepIdx + 1) / STEPS.length) * 100);

  if (state.step === 'done') {
    return (
      <Container maxWidth="sm" sx={{ py: 8, textAlign: 'center' }}>
        <CheckCircle2 size={72} color="#10b981" style={{ marginBottom: 24 }} />
        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, mb: 2 }}>Inspection Submitted</Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.55)', mb: 4, lineHeight: 1.8 }}>
          Your {state.type === 'move_in' ? 'move-in' : 'move-out'} inspection has been sent to the Owner Handover Center.
          {poorItems.length > 0 && ` ${poorItems.length} poor-condition item(s) are flagged for review.`}
        </Typography>
        <Button variant="contained" onClick={() => navigate('/tenant/dashboard')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 4 }}>
          Back to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ py: 4, direction: isRTL ? 'rtl' : 'ltr' }}>
      <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,.88)', border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}`, borderRadius: '24px 24px 0 0' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2}>
          <Stack direction="row" spacing={2} alignItems="center">
            <IconButton onClick={() => navigate(-1)} sx={{ color: 'rgba(255,255,255,0.5)', transform: isRTL ? 'rotate(180deg)' : 'none' }}><ChevronLeft /></IconButton>
            <Box>
              <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 3 }}>DIGITAL HANDOVER INSPECTION</Typography>
              <Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, mt: 0.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <SafeIcon icon={ClipboardCheck} size={26} style={{ color: binThemeTokens.gold }} />
                {titleFor(state.type)}
              </Typography>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Chip label="Move-In" onClick={() => setState((prev) => ({ ...prev, type: 'move_in' }))} sx={{ bgcolor: state.type === 'move_in' ? binThemeTokens.gold : 'rgba(255,255,255,0.07)', color: state.type === 'move_in' ? '#000' : 'rgba(255,255,255,0.5)', fontWeight: 950, cursor: 'pointer' }} />
            <Chip label="Move-Out" onClick={() => setState((prev) => ({ ...prev, type: 'move_out' }))} sx={{ bgcolor: state.type === 'move_out' ? binThemeTokens.gold : 'rgba(255,255,255,0.07)', color: state.type === 'move_out' ? '#000' : 'rgba(255,255,255,0.5)', fontWeight: 950, cursor: 'pointer' }} />
          </Stack>
        </Stack>
        <Stack direction="row" spacing={0} sx={{ mt: 3 }}>
          {STEP_LABELS.map((label, index) => (
            <Box key={label} sx={{ flex: 1, textAlign: 'center' }}>
              <Box sx={{ width: 28, height: 28, borderRadius: '50%', mx: 'auto', mb: 0.5, bgcolor: index < currentStepIdx ? '#10b981' : index === currentStepIdx ? binThemeTokens.gold : 'rgba(255,255,255,0.1)', color: index <= currentStepIdx ? '#000' : 'rgba(255,255,255,0.3)', display: 'grid', placeItems: 'center', fontWeight: 950, fontSize: '0.75rem' }}>
                {index < currentStepIdx ? <CheckCircle2 size={14} /> : index + 1}
              </Box>
              <Typography variant="caption" sx={{ color: index === currentStepIdx ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: index === currentStepIdx ? 950 : 400, display: { xs: 'none', sm: 'block' } }}>{label}</Typography>
            </Box>
          ))}
        </Stack>
        <LinearProgress variant="determinate" value={progress} sx={{ mt: 1.5, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
      </Paper>

      {residenceLoading && <Alert severity="info" sx={{ mt: 2 }}>Loading linked unit and property...</Alert>}
      {!residenceLoading && !unitData && <Alert severity="warning" sx={{ mt: 2 }}>No assigned unit was found. Submit will stay blocked until the tenant is linked to a unit.</Alert>}

      {state.step === 'rooms' && (
        <Box>
          <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', borderLeft: `3px solid ${alpha(binThemeTokens.gold, 0.4)}` }}>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)' }}>Overall: <strong style={{ color: '#fff' }}>{overallProgress()}% complete</strong> · Rate each item: Good / Fair / Poor</Typography>
          </Box>
          <Stack spacing={1.5} sx={{ mt: 1.5 }}>
            {ROOMS.map((room) => {
              const { done, total } = roomProgress(room.id);
              const isExpanded = state.expandedRoom === room.id;
              return (
                <Paper key={room.id} sx={{ bgcolor: 'rgba(15,23,42,0.72)', border: `1px solid ${done === total ? alpha('#10b981', 0.25) : 'rgba(255,255,255,0.07)'}`, borderRadius: 4, overflow: 'hidden' }}>
                  <Box onClick={() => setState((prev) => ({ ...prev, expandedRoom: isExpanded ? null : room.id }))} sx={{ p: 2.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}>
                    <Stack direction="row" spacing={2} alignItems="center"><Typography sx={{ fontSize: 22 }}>{room.icon}</Typography><Box><Typography sx={{ color: '#fff', fontWeight: 950 }}>{room.label}</Typography><Typography variant="caption" sx={{ color: done === total ? '#10b981' : 'rgba(255,255,255,0.4)' }}>{done}/{total} items rated</Typography></Box></Stack>
                    <Stack direction="row" spacing={1} alignItems="center">{done === total && <CheckCircle2 size={18} color="#10b981" />}<SafeIcon icon={isExpanded ? ChevronUp : ChevronDown} size={18} style={{ color: 'rgba(255,255,255,0.4)' }} /></Stack>
                  </Box>
                  {isExpanded && (
                    <Box sx={{ px: 2.5, pb: 2.5 }}>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', mb: 2 }} />
                      <Stack spacing={2}>{room.items.map((item) => {
                        const check = state.roomChecks[room.id][item];
                        return (
                          <Box key={item} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.025)', borderRadius: 3, border: `1px solid ${conditionColor[check.condition]}22` }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5}>
                              <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>{item}</Typography>
                              <Stack direction="row" spacing={1}>{(['good', 'fair', 'poor'] as Condition[]).map((condition) => <Chip key={condition} label={condition.charAt(0).toUpperCase() + condition.slice(1)} size="small" onClick={() => setCondition(room.id, item, condition)} sx={{ bgcolor: check.condition === condition ? alpha(conditionColor[condition], 0.18) : 'rgba(255,255,255,0.04)', color: check.condition === condition ? conditionColor[condition] : 'rgba(255,255,255,0.4)', border: `1px solid ${check.condition === condition ? conditionColor[condition] : 'transparent'}`, fontWeight: 950, cursor: 'pointer' }} />)}<IconButton size="small" disabled={photoUploading === `${room.id}:${item}`} onClick={() => { setUploadingFor({ roomId: room.id, item }); fileInputRef.current?.click(); }} sx={{ color: check.photoUrl ? '#10b981' : 'rgba(255,255,255,0.3)', border: `1px solid ${check.photoUrl ? alpha('#10b981', 0.3) : 'rgba(255,255,255,0.1)'}`, borderRadius: 1.5 }}>{photoUploading === `${room.id}:${item}` ? <CircularProgress size={14} /> : <SafeIcon icon={Camera} size={14} />}</IconButton></Stack>
                            </Stack>
                            {check.condition === 'poor' && <TextField size="small" fullWidth placeholder="Describe the damage or issue..." value={check.notes} onChange={(event) => setNotes(room.id, item, event.target.value)} sx={{ mt: 1.5, '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(239,68,68,0.04)', borderRadius: 2 } }} />}
                            {check.photoUrl && <Box sx={{ mt: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}><Box component="img" src={check.photoUrl} onClick={() => setPreviewPhoto(check.photoUrl)} sx={{ width: 56, height: 56, borderRadius: 2, objectFit: 'cover', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }} /><Typography variant="caption" sx={{ color: '#10b981' }}>Photo attached</Typography></Box>}
                          </Box>
                        );
                      })}</Stack>
                    </Box>
                  )}
                </Paper>
              );
            })}
          </Stack>
        </Box>
      )}

      {state.step === 'meters' && <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, mt: 1.5 }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><SafeIcon icon={Zap} size={22} style={{ color: binThemeTokens.gold }} /> Meter Readings</Typography><Stack spacing={3}><TextField fullWidth label="Electricity Meter Reading (kWh)" value={state.electricityMeter} onChange={(event) => setState((prev) => ({ ...prev, electricityMeter: event.target.value }))} type="number" sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} /><TextField fullWidth label="Water Meter Reading (m³)" value={state.waterMeter} onChange={(event) => setState((prev) => ({ ...prev, waterMeter: event.target.value }))} type="number" sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} /><TextField fullWidth label="Gas Meter Reading (optional)" value={state.gasMeter} onChange={(event) => setState((prev) => ({ ...prev, gasMeter: event.target.value }))} type="number" sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} /></Stack></Paper>}

      {state.step === 'handover' && <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, mt: 1.5 }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><SafeIcon icon={Key} size={22} style={{ color: binThemeTokens.gold }} /> Key Handover</Typography><Stack spacing={3}><Grid container spacing={2}><Grid item xs={6}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>Door Keys</Typography><Stack direction="row" alignItems="center" spacing={1.5}><IconButton size="small" onClick={() => setState((prev) => ({ ...prev, keyCount: String(Math.max(0, Number(prev.keyCount) - 1)) }))} sx={{ border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 2 }}><SafeIcon icon={Minus} size={14} /></IconButton><Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, minWidth: 36, textAlign: 'center' }}>{state.keyCount}</Typography><IconButton size="small" onClick={() => setState((prev) => ({ ...prev, keyCount: String(Number(prev.keyCount) + 1) }))} sx={{ border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 2 }}><SafeIcon icon={Plus} size={14} /></IconButton></Stack></Grid><Grid item xs={6}><Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', mb: 1 }}>Key Fobs / Access Cards</Typography><Stack direction="row" alignItems="center" spacing={1.5}><IconButton size="small" onClick={() => setState((prev) => ({ ...prev, fobCount: String(Math.max(0, Number(prev.fobCount) - 1)) }))} sx={{ border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 2 }}><SafeIcon icon={Minus} size={14} /></IconButton><Typography variant="h5" sx={{ color: '#fff', fontWeight: 950, minWidth: 36, textAlign: 'center' }}>{state.fobCount}</Typography><IconButton size="small" onClick={() => setState((prev) => ({ ...prev, fobCount: String(Number(prev.fobCount) + 1) }))} sx={{ border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 2 }}><SafeIcon icon={Plus} size={14} /></IconButton></Stack></Grid></Grid><Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap><Chip label="Parking Remote" onClick={() => setState((prev) => ({ ...prev, parkingRemote: !prev.parkingRemote }))} sx={{ bgcolor: state.parkingRemote ? alpha('#10b981', 0.15) : 'rgba(255,255,255,0.06)', color: state.parkingRemote ? '#10b981' : 'rgba(255,255,255,0.5)', fontWeight: 950, cursor: 'pointer' }} /><Chip label="Mailbox Key" onClick={() => setState((prev) => ({ ...prev, mailboxKey: !prev.mailboxKey }))} sx={{ bgcolor: state.mailboxKey ? alpha('#10b981', 0.15) : 'rgba(255,255,255,0.06)', color: state.mailboxKey ? '#10b981' : 'rgba(255,255,255,0.5)', fontWeight: 950, cursor: 'pointer' }} /></Stack>{state.type === 'move_out' && <TextField fullWidth multiline rows={3} label="Deposit deduction notes (if any)" value={state.depositNotes} onChange={(event) => setState((prev) => ({ ...prev, depositNotes: event.target.value }))} placeholder="Describe any items to be deducted from deposit..." sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} />}</Stack></Paper>}

      {state.step === 'sign' && <Paper sx={{ p: { xs: 3, md: 4 }, bgcolor: 'rgba(15,23,42,0.72)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 4, mt: 1.5 }}><Typography variant="h6" sx={{ color: '#fff', fontWeight: 950, mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><SafeIcon icon={FileText} size={22} style={{ color: binThemeTokens.gold }} /> Sign & Submit</Typography>{poorItems.length > 0 && <Alert severity="warning" sx={{ mb: 3 }}><strong>{poorItems.length} item(s) marked as Poor:</strong><Box component="ul" sx={{ m: '8px 0 0', pl: 2.5 }}>{poorItems.map((item) => <li key={item}>{item}</li>)}</Box></Alert>}<Stack spacing={3}><Box sx={{ p: 3, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 3 }}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontWeight: 900, letterSpacing: 1 }}>OWNER-REVIEW SUBMISSION SUMMARY</Typography><Grid container spacing={2} sx={{ mt: 1 }}><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Type</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{titleFor(state.type)}</Typography></Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Owner Review Collection</Typography><Typography sx={{ color: '#10b981', fontWeight: 950 }}>propertyInspections</Typography></Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Property</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{propertyData?.propertyName || propertyData?.name || unitData?.propertyId || 'Pending'}</Typography></Grid><Grid item xs={6}><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Evidence Photos</Typography><Typography sx={{ color: '#fff', fontWeight: 950 }}>{collectEvidenceUrls(state.roomChecks).length}</Typography></Grid></Grid></Box><TextField fullWidth label="Tenant Full Name (acts as signature) *" required value={state.tenantSignature} onChange={(event) => setState((prev) => ({ ...prev, tenantSignature: event.target.value }))} placeholder="Type your full name to confirm and sign" sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} /><TextField fullWidth label="Owner / BIN GROUP Representative Name (optional)" value={state.ownerSignature} onChange={(event) => setState((prev) => ({ ...prev, ownerSignature: event.target.value }))} sx={{ '& .MuiOutlinedInput-root': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 3 }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' } }} /><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>By typing your name, you confirm that this inspection record is accurate. It will be sent to the Owner Handover Center for review and settlement action.</Typography>{error && <Alert severity="error">{error}</Alert>}</Stack></Paper>}

      <Paper sx={{ p: 3, mt: 1.5, bgcolor: 'rgba(15,23,42,.88)', border: `1px solid ${alpha(binThemeTokens.gold, 0.1)}`, borderRadius: '0 0 24px 24px' }}>
        <Stack direction="row" justifyContent="space-between" spacing={2}>
          <Button variant="outlined" disabled={currentStepIdx === 0} onClick={() => setState((prev) => ({ ...prev, step: STEPS[currentStepIdx - 1] }))} sx={{ borderColor: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.6)', fontWeight: 950, borderRadius: 3, minWidth: 110 }}>Back</Button>
          {state.step === 'sign' ? <Button variant="contained" onClick={handleSubmit} disabled={submitting || !state.tenantSignature.trim() || residenceLoading || !unitData} startIcon={submitting ? <CircularProgress size={16} sx={{ color: '#000' }} /> : <SafeIcon icon={Save} size={18} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 4 }}>{submitting ? 'Submitting...' : 'Submit Inspection'}</Button> : <Button variant="contained" onClick={() => setState((prev) => ({ ...prev, step: STEPS[Math.min(currentStepIdx + 1, STEPS.length - 1)] }))} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 3, px: 4 }}>Next</Button>}
        </Stack>
      </Paper>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handlePhotoSelect} />
      <Dialog open={!!previewPhoto} onClose={() => setPreviewPhoto(null)} maxWidth="md" PaperProps={{ sx: { bgcolor: '#020617', borderRadius: 4 } }}><Box sx={{ position: 'relative' }}><IconButton onClick={() => setPreviewPhoto(null)} sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', zIndex: 1 }}><X size={18} /></IconButton>{previewPhoto && <Box component="img" src={previewPhoto} sx={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }} />}</Box></Dialog>
      <Snackbar open={!!photoError} autoHideDuration={6000} onClose={() => setPhotoError('')} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}><Alert severity="error" onClose={() => setPhotoError('')} sx={{ width: '100%' }}>{photoError}</Alert></Snackbar>
    </Container>
  );
}

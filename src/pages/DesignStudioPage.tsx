import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Grid,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  Home,
  Info,
  RefreshCcw,
  Ruler,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  auth,
  db,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  storage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useNavigate } from 'react-router-dom';
import { DESIGN_ZONES, calculateDesignStudioQuote } from '../utils/DesignStudioPricingEngine';
import type { DesignScope } from '../utils/DesignStudioPricingEngine';
import { NotificationEvents } from '../lib/notificationService';
import { logAuditAction } from '../utils/auditLogger';
import {
  DESIGN_SPACE_TYPES,
  DESIGN_OBJECTIVES,
  DESIGN_STYLES,
  buildDesignConcepts,
  getDepositAmount
} from '../utils/aiDesignStudioWorkflow';

const OWNER_SIDE_ROLES = ['owner', 'admin', 'ceo', 'super_admin', 'manager'];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

const isOwnerSideRole = (role?: string | null) => OWNER_SIDE_ROLES.includes(String(role || '').toLowerCase());
const normalizeEmail = (email?: string | null) => String(email || '').trim().toLowerCase();

const isSupportedImage = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeOk = file.type ? file.type.startsWith('image/') : false;
  return mimeOk || IMAGE_EXTENSIONS.includes(extension);
};

const getUploadContentType = (file: File) => {
  if (file.type?.startsWith('image/')) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'png') return 'image/png';
  return 'image/jpeg';
};

const safeTimestamp = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function DesignStudioPage() {
  const { user, role } = useRole();
  const navigate = useNavigate();
  const tenantMode = String(role || '').toLowerCase() === 'tenant';
  const ownerSide = isOwnerSideRole(role);

  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [keepConstraints, setKeepConstraints] = useState('');

  const [scope, setScope] = useState<DesignScope>({
    dimensions: 50,
    isMetric: false,
    zoneType: 'living room',
    propertyType: 'Residential',
    finishTier: 'Premium',
    furnitureBudget: 15000,
    hasMEP: false,
    hasStructural: false,
    accessLevel: 'Standard',
    emirate: 'Dubai',
    isNightWork: false,
    isMallEnvironment: false,
    addons: [],
  });

  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [designObjective, setDesignObjective] = useState('refresh');
  const [unitNumber, setUnitNumber] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [existingCondition, setExistingCondition] = useState('');
  const [requiredWork, setRequiredWork] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [staffInstructions, setStaffInstructions] = useState('');

  const selectedProperty = useMemo(() => properties.find((p) => p.id === selectedPropertyId), [properties, selectedPropertyId]);

  const liveQuote = useMemo(() => {
    const safeScope = { ...scope, addons: [], hasMEP: tenantMode ? false : scope.hasMEP, hasStructural: tenantMode ? false : scope.hasStructural, isNightWork: tenantMode ? false : scope.isNightWork };
    return calculateDesignStudioQuote(safeScope);
  }, [scope, tenantMode]);

  const liveMobilization = getDepositAmount(liveQuote.finalTotal, 15);

  useEffect(() => {
    const fetchProperties = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const seen = new Map<string, any>();
      const runQuery = async (field: string, value?: string | null) => {
        if (!value) return;
        try {
          const snap = await getDocs(query(collection(db, 'properties'), where(field, '==', value)));
          snap.docs.forEach((docSnap) => seen.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));
        } catch (err) {
          console.warn(`[DesignStudio] property lookup skipped for ${field}:`, err);
        }
      };

      try {
        const email = normalizeEmail(user.email);
        if (tenantMode) {
          await runQuery('tenantId', user.uid);
          await runQuery('tenantUid', user.uid);
          await runQuery('tenantEmail', email);
        } else {
          await runQuery('ownerId', user.uid);
          await runQuery('ownerUid', user.uid);
          await runQuery('ownerEmail', email);
        }

        const props = Array.from(seen.values());
        setProperties(props);
        if (props.length > 0) {
          setSelectedPropertyId((current) => current || props[0].id);
          const first = props[0];
          setScope((prev) => ({
            ...prev,
            propertyType: first.propertyType || first.assetType || first.type || prev.propertyType,
            emirate: first.emirate || first.city || prev.emirate,
          }));
        }
      } catch (err) {
        console.error('Failed to fetch properties for Design Studio:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProperties();
  }, [user, role, tenantMode]);

  useEffect(() => {
    if (!tenantMode) return;
    setScope((prev) => ({
      ...prev,
      addons: [],
      hasMEP: false,
      hasStructural: false,
      isNightWork: false,
    }));
  }, [tenantMode]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      setUploadError('Please sign in before uploading design images.');
      return;
    }

    const invalidFile = files.find((file) => !isSupportedImage(file) || file.size > MAX_IMAGE_SIZE_BYTES);
    if (invalidFile) {
      setUploadError('Upload JPG, PNG, WEBP, HEIC, or HEIF images only. Maximum size is 50 MB per image.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const uploadedUrls = [...referenceImages];
      let completedBytes = 0;
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0) || 1;

      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `design-image-${i}.jpg`;
        const storagePath = `design_requests/${currentUser.uid}/${safeTimestamp()}_${i}_${safeName}`;
        const storageRef = ref(storage, storagePath);
        const contentType = getUploadContentType(file);

        await new Promise<void>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file, {
            contentType,
            customMetadata: {
              uploadedBy: currentUser.uid,
              uploadedByEmail: normalizeEmail(currentUser.email),
              feature: 'design_studio',
              role: String(role || 'user'),
              originalName: safeName,
            },
          });

          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const currentProgress = ((completedBytes + snapshot.bytesTransferred) / totalBytes) * 100;
              setUploadProgress(Math.min(99, currentProgress));
            },
            (error) => reject(error),
            async () => {
              try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);
                uploadedUrls.push(url);
                completedBytes += file.size;
                setUploadProgress(Math.min(100, (completedBytes / totalBytes) * 100));
                resolve();
              } catch (downloadError) {
                reject(downloadError);
              }
            },
          );
        });
      }

      setReferenceImages(uploadedUrls);
      setUploadProgress(0);
      setSnackbar({ open: true, message: 'Image uploaded successfully. Preview is ready.', severity: 'success' });

      await logAuditAction({
        actorId: currentUser.uid,
        actorRole: role || 'user',
        action: 'DOCUMENT_UPLOAD',
        targetType: 'design_studio_reference',
        targetId: currentUser.uid,
        metadata: { fileCount: files.length, totalImages: uploadedUrls.length, source: 'AI_DESIGN_STUDIO' },
      });
    } catch (err) {
      console.error('Upload failure:', err);
      const code = String((err as any)?.code || '');
      const message = String((err as any)?.message || '');
      const blocked = code.includes('unauthorized') || message.toLowerCase().includes('permission');
      setUploadError(
        blocked
          ? 'Image upload is blocked by storage permission for this account. Refresh, sign in again, and retry. If it repeats, BIN GROUP Admin must deploy the updated storage rules.'
          : 'Image upload failed because the browser or network stopped the upload. Retry once, or choose JPG/PNG under 50 MB.',
      );
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (url: string) => setReferenceImages((prev) => prev.filter((item) => item !== url));

  const handleInitializeStudio = async () => {
    if (!selectedPropertyId) {
      setSnackbar({ open: true, message: 'Select a property before initializing the studio.', severity: 'error' });
      return;
    }
    if (referenceImages.length === 0) {
      setSnackbar({ open: true, message: 'Upload at least one room, hall, garden, majlis, or area photo first.', severity: 'error' });
      return;
    }

    setSubmitting(true);
    try {
      const safeScope = { ...scope, addons: [], hasMEP: tenantMode ? false : scope.hasMEP, hasStructural: tenantMode ? false : scope.hasStructural, isNightWork: tenantMode ? false : scope.isNightWork };
      const quote = calculateDesignStudioQuote(safeScope);
      const mobilizationAmount = getDepositAmount(quote.finalTotal, 15);

      const isTenant = tenantMode;
      const status = isTenant ? "AWAITING_OWNER_APPROVAL" : "DEPOSIT_PENDING";
      const approvalRequired = isTenant;
      const approvalStatus = isTenant ? "PENDING_OWNER_APPROVAL" : "NOT_REQUIRED";
      const quoteStatus = isTenant ? "AWAITING_OWNER_APPROVAL" : "DEPOSIT_PENDING";
      const paymentStatus = "NOT_STARTED";
      const adminHandoffStatus = isTenant ? "WAITING_OWNER_APPROVAL" : "PAYMENT_QUEUE";
      const engineerHandoffStatus = "WAITING_PAYMENT";
      
      const ownerIdStr = selectedProperty?.ownerId || selectedProperty?.ownerUid || (isTenant ? selectedProperty?.ownerId : user?.uid) || 'SYSTEM';

      const concepts = buildDesignConcepts({
        zoneType: scope.zoneType,
        designStyle,
        designObjective,
        uploadedImageUrl: referenceImages[0],
        notes: scopeDescription
      });

      const requestData = {
        userId: user?.uid,
        createdByUid: user?.uid,
        createdByRole: role || 'user',
        userName: user?.displayName || user?.email || 'Unknown User',
        role,
        propertyId: selectedPropertyId,
        propertyName: selectedProperty?.name || selectedProperty?.propertyName || 'Selected Property',
        propertyLocation: selectedProperty?.location?.formattedAddress || selectedProperty?.location?.emirate || selectedProperty?.emirate || selectedProperty?.address || 'Location Pending',
        ownerId: ownerIdStr,
        ownerUid: ownerIdStr,
        ownerEmail: selectedProperty?.ownerEmail || (!isTenant ? user?.email : selectedProperty?.ownerEmail) || null,
        tenantUid: isTenant ? user?.uid : null,
        tenantEmail: isTenant ? user?.email : null,
        tenantName: isTenant ? user?.displayName : null,
        unitId: unitNumber || null,
        scope: {
          ...safeScope,
          scopeDescription,
          keepConstraints,
          referenceImages,
          unitNumber,
          floorLevel,
          existingCondition,
          requiredWork,
        },
        concepts,
        selectedConceptId: null,
        selectedConcept: null,
        conceptPrompt: concepts[0].prompt,
        metadata: {
          adminNotes: ownerSide ? adminNotes : '',
          staffInstructions: ownerSide ? staffInstructions : '',
          tenantMode,
          imageCount: referenceImages.length,
          addonsRemovedFromOwnerFlow: true,
        },
        designStyle,
        designObjective,
        quote,
        quoteStatus,
        approvalRequired,
        approvalStatus,
        paymentStatus,
        mobilizationPercent: 15,
        mobilizationAmount,
        status,
        workflowStage: status,
        executionStatus: "PENDING",
        adminHandoffStatus,
        engineerHandoffStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'AI_DESIGN_STUDIO_END_TO_END_V1',
      };

      const docRef = await addDoc(collection(db, 'design_requests'), requestData);

      await addDoc(collection(db, 'design_quotes'), {
        requestId: docRef.id,
        propertyId: selectedPropertyId,
        ownerId: ownerIdStr,
        ownerUid: ownerIdStr,
        tenantUid: isTenant ? user?.uid : null,
        tenantEmail: isTenant ? user?.email : null,
        totalAmount: quote.finalTotal,
        mobilizationPercent: 15,
        mobilizationAmount,
        quoteStatus,
        paymentStatus,
        scopeSummary: scopeDescription,
        selectedConceptId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      await addDoc(collection(db, 'design_concepts'), {
        requestId: docRef.id,
        propertyId: selectedPropertyId,
        ownerId: ownerIdStr,
        tenantUid: isTenant ? user?.uid : null,
        concepts,
        selectedConceptId: null,
        prompt: concepts[0].prompt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      if (isTenant) {
        await addDoc(collection(db, 'design_approvals'), {
          requestId: docRef.id,
          ownerId: ownerIdStr,
          ownerUid: ownerIdStr,
          tenantUid: user?.uid,
          tenantEmail: user?.email,
          decision: "pending",
          status: "PENDING_OWNER_APPROVAL",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        if (selectedProperty?.ownerId) {
          await NotificationEvents.OWNER.DESIGN_STUDIO_NOC(selectedProperty.ownerId, user?.displayName || 'Your Tenant', scope.zoneType);
        }
      }

      await logAuditAction({
        actorId: user?.uid || 'ANONYMOUS',
        actorRole: role || 'user',
        action: 'DESIGN_REQUEST_SUBMITTED',
        targetType: 'design_requests',
        targetId: docRef.id,
        metadata: { propertyId: selectedPropertyId, zoneType: scope.zoneType, style: designStyle, imageCount: referenceImages.length, tenantMode, addonsDisabled: true },
      });

      const currentPath = window.location.pathname;
      const basePrefix = currentPath.includes('/design-studio') ? currentPath.split('/design-studio')[0] : '';
      navigate(`${basePrefix}/design-studio/request/${docRef.id}`);
    } catch (err) {
      console.error('Design Studio Fault:', err);
      setSnackbar({ open: true, message: 'Sovereign AI Engine timeout. Check connection or retry.', severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress sx={{ color: binThemeTokens.gold }} />
      </Box>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 4, md: 6 }, pr: { xs: 9, md: 3 }, pb: { xs: 14, md: 8 } }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3, flexDirection: { xs: 'column', sm: 'row' }, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: { xs: 3, md: 4 }, overflowWrap: 'anywhere' }}>
            SOVEREIGN CREATIVE ENGINE
          </Typography>
          <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ fontSize: { xs: '2.35rem', md: '3rem' }, overflowWrap: 'anywhere' }}>
            AI Design <Box component="span" sx={{ color: binThemeTokens.gold }}>Studio</Box>
          </Typography>
        </Box>
        <Chip icon={<Sparkles size={16} />} label="FREE AI CONCEPTS" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
      </Box>

      {uploadError && (
        <Alert
          severity="error"
          icon={<AlertTriangle />}
          sx={{ mb: 4, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 3, '& .MuiAlert-message': { width: '100%' }, '& .MuiAlert-action': { alignItems: 'center' } }}
          action={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button size="small" color="inherit" onClick={() => setUploadError(null)} startIcon={<RefreshCcw size={14} />}>RETRY</Button>
              <Button size="small" color="inherit" component="label">
                CHANGE IMAGE
                <input type="file" hidden accept="image/*,.heic,.heif,.webp" capture="environment" multiple onChange={handleImageUpload} />
              </Button>
            </Stack>
          }
        >
          {uploadError}
        </Alert>
      )}

      <Grid container spacing={{ xs: 3, md: 6 }}>
        <Grid item xs={12} lg={5}>
          <Stack spacing={4}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', minWidth: 0 }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2, overflowWrap: 'anywhere' }}>
                <Camera color={binThemeTokens.gold} /> 1. VISUAL CONTEXT
              </Typography>

              <Box sx={{ mb: 3 }}>
                <Stack direction="row" spacing={2} sx={{ mb: 2, overflowX: 'auto', pb: 1 }}>
                  {referenceImages.map((url, idx) => (
                    <Box key={url} sx={{ position: 'relative', flexShrink: 0 }}>
                      <img src={url} alt={`Reference ${idx + 1}`} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 12, border: `1px solid ${binThemeTokens.gold}` }} />
                      <IconButton size="small" onClick={() => removeImage(url)} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#ef4444', color: '#FFF', '&:hover': { bgcolor: '#dc2626' }, padding: 0.2 }}>
                        <X size={12} />
                      </IconButton>
                    </Box>
                  ))}
                  {!uploading && (
                    <Button component="label" sx={{ width: 92, height: 92, flexShrink: 0, border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 3, display: 'flex', flexDirection: 'column', color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.02)', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: binThemeTokens.gold } }}>
                      <Camera size={24} />
                      <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 900 }}>ADD</Typography>
                      <input type="file" hidden accept="image/*,.heic,.heif,.webp" capture="environment" multiple onChange={handleImageUpload} />
                    </Button>
                  )}
                  {uploading && (
                    <Box sx={{ width: 92, height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
                      <CircularProgress size={24} sx={{ color: binThemeTokens.gold }} />
                    </Box>
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mb: 1 }}>
                  Accepted: JPG, PNG, WEBP, HEIC/HEIF images. Max 50 MB per image.
                </Typography>
                {uploading && (
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ flexGrow: 1, height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{Math.round(uploadProgress)}%</Typography>
                  </Box>
                )}
              </Box>

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>Redesign Objective</Typography>
              <TextField multiline rows={3} fullWidth placeholder="Describe what you want to achieve..." value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)} sx={{ mb: 3 }} />

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>Constraints (Must keep / Must avoid)</Typography>
              <TextField multiline rows={2} fullWidth placeholder="e.g. Keep the flooring, avoid dark colors..." value={keepConstraints} onChange={(e) => setKeepConstraints(e.target.value)} sx={{ mb: 3 }} />

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>Existing Condition & Required Work</Typography>
              <TextField multiline rows={2} fullWidth placeholder="Describe current state..." value={existingCondition} onChange={(e) => setExistingCondition(e.target.value)} sx={{ mb: 2 }} />
              <TextField multiline rows={2} fullWidth placeholder="List required work..." value={requiredWork} onChange={(e) => setRequiredWork(e.target.value)} />
            </Paper>

            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Home color={binThemeTokens.gold} /> 2. SELECT ASSET
              </Typography>
              <TextField select fullWidth label="Property Node" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} sx={{ mb: 3 }}>
                {properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.name || property.propertyName || property.address || property.id}</MenuItem>)}
              </TextField>

              {properties.length === 0 && (
                <Alert severity="warning" icon={<Info />} sx={{ mb: 3, bgcolor: 'rgba(245,158,11,0.08)', color: '#facc15', border: '1px solid rgba(245,158,11,0.2)' }}>
                  No linked property was found for this account. Refresh identity from the dashboard or contact BIN GROUP Admin.
                </Alert>
              )}

              <TextField select fullWidth label="Redesign Zone" value={scope.zoneType} onChange={(e) => setScope({ ...scope, zoneType: e.target.value })} sx={{ mb: 3 }}>
                {DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone.toUpperCase()}</MenuItem>)}
              </TextField>

              <TextField select fullWidth label="Redesign Objective" value={designObjective} onChange={(e) => setDesignObjective(e.target.value)} sx={{ mb: 3 }}>
                {DESIGN_OBJECTIVES.map((obj) => <MenuItem key={obj} value={obj}>{obj.toUpperCase()}</MenuItem>)}
              </TextField>

              <TextField select fullWidth label="Design Style" value={designStyle} onChange={(e) => setDesignStyle(e.target.value)} sx={{ mb: 3 }}>
                {DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style.toUpperCase()}</MenuItem>)}
              </TextField>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Unit #" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Floor" value={floorLevel} onChange={(e) => setFloorLevel(e.target.value)} />
                </Grid>
              </Grid>
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={4} sx={{ height: '100%' }}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Ruler color={binThemeTokens.gold} /> 3. DIMENSIONS & BUDGET
              </Typography>

              <Box sx={{ mb: 4 }}>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>AREA: {scope.dimensions} SQ FT</Typography>
                <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, value) => setScope({ ...scope, dimensions: value as number })} sx={{ color: binThemeTokens.gold }} />
              </Box>

              {!tenantMode && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>FURNITURE BUDGET: AED {scope.furnitureBudget.toLocaleString()}</Typography>
                  <Slider value={scope.furnitureBudget} min={0} max={500000} step={5000} onChange={(_, value) => setScope({ ...scope, furnitureBudget: value as number })} sx={{ color: binThemeTokens.gold }} />
                </Box>
              )}

              {!tenantMode && (
                <Stack spacing={1}>
                  <FormControlLabel control={<Checkbox checked={scope.hasMEP} onChange={(e) => setScope({ ...scope, hasMEP: e.target.checked })} />} label="MEP Changes (Electrical/Plumbing)" />
                  <FormControlLabel control={<Checkbox checked={scope.hasStructural} onChange={(e) => setScope({ ...scope, hasStructural: e.target.checked })} />} label="Structural Changes (Walls/Partitions)" />
                  <FormControlLabel control={<Checkbox checked={scope.isNightWork} onChange={(e) => setScope({ ...scope, isNightWork: e.target.checked })} />} label="Night-shift Execution" />
                </Stack>
              )}

              {tenantMode && (
                <Alert severity="info" icon={<Info />} sx={{ mt: 2, bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
                  Tenant requests are submitted as owner NOC design concepts. Paid execution add-ons are hidden until owner approval.
                </Alert>
              )}
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={3}>
          <Stack spacing={4}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
              <Typography variant="h5" fontWeight="950" sx={{ mb: 2 }}>GENERATE CONCEPT</Typography>
              
              <Box sx={{ my: 3, p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 900 }}>ESTIMATED QUOTE</Typography>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, my: 1 }}>AED {liveQuote.finalTotal.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>15% Mobilization: AED {liveMobilization.toLocaleString()}</Typography>
              </Box>

              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 4 }}>
                {tenantMode 
                  ? "Tenant submission goes to owner approval first. Payment opens only after owner approval." 
                  : "Owner submission goes directly to 15% mobilization payment request."}
              </Typography>
              <Button variant="contained" fullWidth size="large" onClick={handleInitializeStudio} disabled={submitting || !selectedPropertyId} endIcon={submitting ? <CircularProgress size={20} /> : <ArrowRight />} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                {tenantMode ? "SUBMIT FOR OWNER APPROVAL" : "CREATE QUOTE + PAYMENT STEP"}
              </Button>
            </Paper>

            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}>
              <Typography variant="subtitle2" fontWeight="950" sx={{ color: '#10b981', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldCheck size={18} /> INSTITUTIONAL PROTECTED
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                All designs generated are compliant with BIN Group technical standards and local municipality codes.
              </Typography>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

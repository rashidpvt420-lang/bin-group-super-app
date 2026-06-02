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
import { useLanguage } from '../context/LanguageContext';
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

type AiDesignStudioReadiness = {
  externalImageGeneration: boolean;
};

const getAiDesignStudioReadiness = (): AiDesignStudioReadiness => {
  const env = import.meta.env as Record<string, string | undefined>;
  const configuredKeys = [
    'VITE_AI_IMAGE_API_KEY',
    'VITE_OPENAI_API_KEY',
    'VITE_IMAGE_GENERATION_API_KEY',
    'VITE_DESIGN_STUDIO_IMAGE_API_KEY',
  ];

  return {
    externalImageGeneration: configuredKeys.some((key) => Boolean(env[key]?.trim())),
  };
};

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
  const { isRTL, tx } = useLanguage();
  const aiReadiness = useMemo(() => getAiDesignStudioReadiness(), []);
  const designLabels = {
    eyebrow: tx('design.eyebrow', '{designLabels.eyebrow}'),
    titlePrefix: tx('design.title_prefix', 'AI Design'),
    titleSuffix: tx('design.title_suffix', 'Studio'),
    freeConcepts: tx('design.free_concepts', 'FREE AI CONCEPTS'),
    visualContext: tx('design.visual_context', '1. VISUAL CONTEXT'),
    add: tx('design.add', 'ADD'),
    accepted: tx('design.accepted', '{designLabels.accepted}'),
    objective: tx('design.objective', 'Redesign Objective'),
    objectivePlaceholder: tx('design.objective_placeholder', 'Describe what you want to achieve...'),
    constraints: tx('design.constraints', 'Constraints (Must keep / Must avoid)'),
    constraintsPlaceholder: tx('design.constraints_placeholder', 'e.g. Keep the flooring, avoid dark colors...'),
    conditionWork: tx('design.condition_work', 'Existing Condition & Required Work'),
    currentStatePlaceholder: tx('design.current_state_placeholder', 'Describe current state...'),
    requiredWorkPlaceholder: tx('design.required_work_placeholder', 'List required work...'),
    selectAsset: tx('design.select_asset', '2. SELECT ASSET'),
    propertyNode: tx('design.property_node', 'Property Node'),
    noProperty: tx('design.no_property', '{designLabels.noProperty}'),
    redesignZone: tx('design.redesign_zone', 'Redesign Zone'),
    designStyle: tx('design.design_style', 'Design Style'),
    unit: tx('design.unit', 'Unit #'),
    floor: tx('design.floor', 'Floor'),
    dimensionsBudget: tx('design.dimensions_budget', '3. DIMENSIONS & BUDGET'),
    area: tx('design.area', 'AREA'),
    furnitureBudget: tx('design.furniture_budget', 'FURNITURE BUDGET'),
    mep: tx('design.mep', 'MEP Changes (Electrical/Plumbing)'),
    structural: tx('design.structural', 'Structural Changes (Walls/Partitions)'),
    nightShift: tx('design.night_shift', 'Night-shift Execution'),
    tenantInfo: tx('design.tenant_info', '{designLabels.tenantInfo}'),
    generateConcept: tx('design.generate_concept', '{designLabels.generateConcept}'),
    estimatedQuote: tx('design.estimated_quote', '{designLabels.estimatedQuote}'),
    mobilization: tx('design.mobilization', '15% Mobilization'),
    tenantSubmission: tx('design.tenant_submission', 'Tenant submission goes to owner approval first. Payment opens only after owner approval.'),
    ownerSubmission: tx('design.owner_submission', 'Owner submission goes directly to 15% mobilization payment request.'),
    submitOwnerApproval: tx('design.submit_owner_approval', 'SUBMIT FOR OWNER APPROVAL'),
    createQuotePayment: tx('design.create_quote_payment', 'CREATE QUOTE + PAYMENT STEP'),
    protected: tx('design.protected', '{designLabels.protected}'),
    protectedDesc: tx('design.protected_desc', 'All designs generated are compliant with BIN GROUP technical standards and local municipality codes.'),
    aiStatusReady: tx('design.ai_status_ready', 'AI image generation configured'),
    aiStatusWorkflow: tx('design.ai_status_workflow', 'Workflow AI active / external image API pending'),
  };
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
    <Container maxWidth="xl" dir={isRTL ? "rtl" : "ltr"} sx={{ py: { xs: 4, md: 6 }, pr: { xs: 9, md: 3 }, pb: { xs: 14, md: 8 }, textAlign: isRTL ? "right" : "left" }}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 3, flexDirection: { xs: 'column', sm: 'row' }, minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: { xs: 3, md: 4 }, overflowWrap: 'anywhere' }}>
            {designLabels.eyebrow}
          </Typography>
          <Typography variant="h3" fontWeight="950" color="#FFF" sx={{ fontSize: { xs: '2.35rem', md: '3rem' }, overflowWrap: 'anywhere' }}>
            {designLabels.titlePrefix} <Box component="span" sx={{ color: binThemeTokens.gold }}>{designLabels.titleSuffix}</Box>
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Chip icon={<Sparkles size={16} />} label={designLabels.freeConcepts} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
          <Chip label={aiReadiness.externalImageGeneration ? designLabels.aiStatusReady : designLabels.aiStatusWorkflow} sx={{ bgcolor: alpha(aiReadiness.externalImageGeneration ? "#10b981" : "#f59e0b", 0.12), color: aiReadiness.externalImageGeneration ? "#10b981" : "#f59e0b", fontWeight: 900 }} />
        </Stack>
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
                <Camera color={binThemeTokens.gold} /> {designLabels.visualContext}
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
                      <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 900 }}>{designLabels.add}</Typography>
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
                  {designLabels.accepted}
                </Typography>
                {uploading && (
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ flexGrow: 1, height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{Math.round(uploadProgress)}%</Typography>
                  </Box>
                )}
              </Box>

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>{designLabels.objective}</Typography>
              <TextField multiline rows={3} fullWidth placeholder={designLabels.objectivePlaceholder} value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)} sx={{ mb: 3 }} />

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>{designLabels.constraints}</Typography>
              <TextField multiline rows={2} fullWidth placeholder={designLabels.constraintsPlaceholder} value={keepConstraints} onChange={(e) => setKeepConstraints(e.target.value)} sx={{ mb: 3 }} />

              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block', fontWeight: 900 }}>{designLabels.conditionWork}</Typography>
              <TextField multiline rows={2} fullWidth placeholder={designLabels.currentStatePlaceholder} value={existingCondition} onChange={(e) => setExistingCondition(e.target.value)} sx={{ mb: 2 }} />
              <TextField multiline rows={2} fullWidth placeholder={designLabels.requiredWorkPlaceholder} value={requiredWork} onChange={(e) => setRequiredWork(e.target.value)} />
            </Paper>

            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Home color={binThemeTokens.gold} /> {designLabels.selectAsset}
              </Typography>
              <TextField select fullWidth label={designLabels.propertyNode} value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} sx={{ mb: 3 }}>
                {properties.map((property) => <MenuItem key={property.id} value={property.id}>{property.name || property.propertyName || property.address || property.id}</MenuItem>)}
              </TextField>

              {properties.length === 0 && (
                <Alert severity="warning" icon={<Info />} sx={{ mb: 3, bgcolor: 'rgba(245,158,11,0.08)', color: '#facc15', border: '1px solid rgba(245,158,11,0.2)' }}>
                  {designLabels.noProperty}
                </Alert>
              )}

              <TextField select fullWidth label={designLabels.redesignZone} value={scope.zoneType} onChange={(e) => setScope({ ...scope, zoneType: e.target.value })} sx={{ mb: 3 }}>
                {DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone.toUpperCase()}</MenuItem>)}
              </TextField>

              <TextField select fullWidth label={designLabels.objective} value={designObjective} onChange={(e) => setDesignObjective(e.target.value)} sx={{ mb: 3 }}>
                {DESIGN_OBJECTIVES.map((obj) => <MenuItem key={obj} value={obj}>{obj.toUpperCase()}</MenuItem>)}
              </TextField>

              <TextField select fullWidth label={designLabels.designStyle} value={designStyle} onChange={(e) => setDesignStyle(e.target.value)} sx={{ mb: 3 }}>
                {DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style.toUpperCase()}</MenuItem>)}
              </TextField>

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label={designLabels.unit} value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label={designLabels.floor} value={floorLevel} onChange={(e) => setFloorLevel(e.target.value)} />
                </Grid>
              </Grid>
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Stack spacing={4} sx={{ height: '100%' }}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Ruler color={binThemeTokens.gold} /> {designLabels.dimensionsBudget}
              </Typography>

              <Box sx={{ mb: 4 }}>
                <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>{designLabels.area}: {scope.dimensions} SQ FT</Typography>
                <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, value) => setScope({ ...scope, dimensions: value as number })} sx={{ color: binThemeTokens.gold }} />
              </Box>

              {!tenantMode && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>{designLabels.furnitureBudget}: AED {scope.furnitureBudget.toLocaleString()}</Typography>
                  <Slider value={scope.furnitureBudget} min={0} max={500000} step={5000} onChange={(_, value) => setScope({ ...scope, furnitureBudget: value as number })} sx={{ color: binThemeTokens.gold }} />
                </Box>
              )}

              {!tenantMode && (
                <Stack spacing={1}>
                  <FormControlLabel control={<Checkbox checked={scope.hasMEP} onChange={(e) => setScope({ ...scope, hasMEP: e.target.checked })} />} label={designLabels.mep} />
                  <FormControlLabel control={<Checkbox checked={scope.hasStructural} onChange={(e) => setScope({ ...scope, hasStructural: e.target.checked })} />} label={designLabels.structural} />
                  <FormControlLabel control={<Checkbox checked={scope.isNightWork} onChange={(e) => setScope({ ...scope, isNightWork: e.target.checked })} />} label={designLabels.nightShift} />
                </Stack>
              )}

              {tenantMode && (
                <Alert severity="info" icon={<Info />} sx={{ mt: 2, bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
                  {designLabels.tenantInfo}
                </Alert>
              )}
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={3}>
          <Stack spacing={4}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
              <Typography variant="h5" fontWeight="950" sx={{ mb: 2 }}>{designLabels.generateConcept}</Typography>
              
              <Box sx={{ my: 3, p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 900 }}>{designLabels.estimatedQuote}</Typography>
                <Typography variant="h4" sx={{ color: '#fff', fontWeight: 950, my: 1 }}>AED {liveQuote.finalTotal.toLocaleString()}</Typography>
                <Typography variant="body2" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{designLabels.mobilization}: AED {liveMobilization.toLocaleString()}</Typography>
              </Box>

              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 4 }}>
                {tenantMode 

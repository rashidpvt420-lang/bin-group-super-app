import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Grid,
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
import { Camera, Home, Image as ImageIcon, MessageCircle, Ruler, ShieldCheck, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { calculateDesignStudioQuote } from '../utils/DesignStudioPricingEngine';
import type { DesignScope } from '../utils/DesignStudioPricingEngine';
import {
  DESIGN_OBJECTIVES,
  DESIGN_SPACE_TYPES,
  DESIGN_STYLES,
  buildDesignConcepts,
  buildDesignExecutionDetails,
  getApprovalRequired,
  getDepositAmount,
  getInitialDesignStatus,
  type DesignConcept,
  type DesignExecutionDetail,
} from '../utils/aiDesignStudioWorkflow';
import {
  addDoc,
  collection,
  db,
  doc,
  functions,
  getDoc,
  getDocs,
  getDownloadURL,
  httpsCallable,
  query,
  ref,
  serverTimestamp,
  setDoc,
  storage,
  uploadBytes,
  where,
} from '../lib/firebase';
import { logAuditAction } from '../utils/auditLogger';

type ReferenceImage = {
  file: File;
  previewUrl: string;
  name: string;
  size: number;
};

type RenderResult = {
  aiProvider: string;
  renderStatus: string;
  generatedImages: string[];
  concepts: DesignConcept[];
  executionDetails: DesignExecutionDetail[];
};

const WHATSAPP_URL = 'https://wa.me/971552423233';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

const isSupportedImage = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeOk = file.type ? file.type.startsWith('image/') : false;
  return mimeOk || IMAGE_EXTENSIONS.includes(extension);
};

const readImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Image preview failed'));
  reader.readAsDataURL(file);
});

const safeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

async function resolveTenantContext(user: any) {
  if (!user?.uid) return {} as any;

  const lookups = [
    query(collection(db, 'units'), where('tenantId', '==', user.uid)),
    query(collection(db, 'units'), where('tenantUid', '==', user.uid)),
  ];
  if (user.email) lookups.push(query(collection(db, 'units'), where('tenantEmail', '==', String(user.email).toLowerCase())));

  for (const unitQuery of lookups) {
    try {
      const snap = await getDocs(unitQuery);
      if (!snap.empty) {
        const unit: any = { id: snap.docs[0].id, ...snap.docs[0].data() };
        let property: any = null;
        if (unit.propertyId) {
          try {
            const propertySnap = await getDoc(doc(db, 'properties', unit.propertyId));
            if (propertySnap.exists()) property = { id: propertySnap.id, ...propertySnap.data() };
          } catch (error) {
            console.warn('[AI Studio] property lookup failed:', error);
          }
        }
        return { unit, property };
      }
    } catch (error) {
      console.warn('[AI Studio] tenant unit lookup failed:', error);
    }
  }

  return {} as any;
}

function designErrorMessage(error: any) {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code.includes('storage') || message.includes('storage')) {
    return 'Image upload blocked by Storage rules. Check design_requests/{uid}/{fileName} rule.';
  }
  if (code.includes('permission-denied') || message.includes('permission')) {
    return 'Submission blocked by Firestore rules. Please check design_requests, design_quotes, design_concepts, and design_approvals rules.';
  }
  return 'Design request could not be submitted. Please retry.';
}

export default function DesignStudioPage() {
  const { user, role } = useRole();
  const { isRTL, tx } = useLanguage();
  const navigate = useNavigate();
  const normalizedRole = String(role || '').toLowerCase();
  const tenantMode = normalizedRole === 'tenant';

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
  const [referenceImages, setReferenceImages] = useState<ReferenceImage[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [designObjective, setDesignObjective] = useState('refresh');
  const [submitting, setSubmitting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [renderStatus, setRenderStatus] = useState('AI_RENDER_PENDING');
  const [renderError, setRenderError] = useState('');
  const [renderedConcepts, setRenderedConcepts] = useState<DesignConcept[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' | 'info' });

  const quote = useMemo(() => {
    const safeScope: DesignScope = {
      ...scope,
      addons: [],
      hasMEP: tenantMode ? false : scope.hasMEP,
      hasStructural: tenantMode ? false : scope.hasStructural,
      isNightWork: tenantMode ? false : scope.isNightWork,
    };
    return calculateDesignStudioQuote(safeScope);
  }, [scope, tenantMode]);

  const mobilization = getDepositAmount(quote.finalTotal, 15);

  const executionDetails = useMemo(() => buildDesignExecutionDetails({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    finishTier: scope.finishTier,
    dimensions: scope.dimensions,
    notes: scopeDescription,
    quoteTotal: quote.finalTotal,
    mobilizationAmount: mobilization,
  }), [scope.zoneType, scope.finishTier, scope.dimensions, designStyle, designObjective, scopeDescription, quote.finalTotal, mobilization]);

  const fallbackConcepts = useMemo(() => buildDesignConcepts({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    uploadedImageUrl: referenceImages[0]?.previewUrl,
    notes: scopeDescription,
    finishTier: scope.finishTier,
    quoteTotal: quote.finalTotal,
    mobilizationAmount: mobilization,
  }), [scope.zoneType, scope.finishTier, designStyle, designObjective, referenceImages, scopeDescription, quote.finalTotal, mobilization]);

  const concepts = renderedConcepts.length ? renderedConcepts : fallbackConcepts;

  const labels = {
    eyebrow: tx('design.eyebrow', 'AI PROPERTY DESIGN'),
    title: tx('design.title', 'AI Design Studio'),
    subtitle: tx('design.subtitle', 'Take or upload a room, hall, majlis, garden, facade, or property area photo. BIN GROUP prepares AI redesign images, itemized execution scope, estimated quote, and 15% mobilization path.'),
    objective: tx('design.objective', 'Redesign objective'),
    objectivePlaceholder: tx('design.objective_placeholder', 'Describe what you want to improve, repair, redesign, or upgrade...'),
    zone: tx('design.zone', 'Design zone'),
    style: tx('design.style', 'Design style'),
    action: tx('design.action', tenantMode ? 'Submit for owner approval' : 'Create concept and quote'),
    estimate: tx('design.estimate', 'Estimated execution quote'),
    mobilization: tx('design.mobilization', '15% mobilization'),
    protected: tx('design.protected', 'Protected BIN GROUP design workflow'),
    protectedDesc: tx('design.protected_desc', 'Concepts are scope-controlled. Final execution requires owner approval, confirmed scope, site verification, and payment step.'),
  };

  const handleImageFiles = async (files: File[]) => {
    if (!files.length) return;
    const invalid = files.find((file) => !isSupportedImage(file) || file.size > MAX_IMAGE_SIZE_BYTES);
    if (invalid) {
      setSnackbar({ open: true, message: 'Upload JPG, PNG, WEBP, HEIC, or HEIF images only. Maximum size is 50 MB per image.', severity: 'error' });
      return;
    }

    try {
      const previews = await Promise.all(files.map(async (file) => ({
        file,
        previewUrl: await readImageAsDataUrl(file),
        name: file.name,
        size: file.size,
      })));
      setReferenceImages((current) => [...current, ...previews].slice(0, 8));
      setRenderedConcepts([]);
      setRenderStatus('AI_RENDER_PENDING');
      setRenderError('');
      setSnackbar({ open: true, message: 'Image preview added. AI redesign scope is ready.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Image preview failed. Please retry with another image.', severity: 'error' });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await handleImageFiles(files);
  };

  const uploadReferenceImages = async (requestId: string) => {
    if (!user?.uid) return [] as string[];
    const urls: string[] = [];
    for (let index = 0; index < referenceImages.length; index += 1) {
      const image = referenceImages[index];
      const path = `design_requests/${user.uid}/${requestId}_${index}_${Date.now()}_${safeFileName(image.name)}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, image.file, { contentType: image.file.type || 'image/jpeg' });
      const url = await getDownloadURL(storageRef);
      urls.push(url);
      setUploadProgress(Math.round(((index + 1) / referenceImages.length) * 100));
    }
    return urls;
  };

  const buildFallbackRender = (imageUrl: string): RenderResult => ({
    aiProvider: 'fallback',
    renderStatus: 'AI_RENDER_PENDING',
    generatedImages: [],
    concepts: buildDesignConcepts({
      zoneType: scope.zoneType,
      designStyle,
      designObjective,
      uploadedImageUrl: imageUrl,
      notes: scopeDescription,
      finishTier: scope.finishTier,
      quoteTotal: quote.finalTotal,
      mobilizationAmount: mobilization,
    }),
    executionDetails,
  });

  const runAIDesignRender = async (requestId: string, imageUrl: string): Promise<RenderResult> => {
    setRendering(true);
    setRenderError('');
    try {
      const callable = httpsCallable(functions, 'generateAIDesignConceptImages');
      const result: any = await callable({
        requestId,
        imageUrl,
        zoneType: scope.zoneType,
        designStyle,
        designObjective,
        finishTier: scope.finishTier,
        dimensions: scope.dimensions,
        notes: scopeDescription,
        quoteTotal: quote.finalTotal,
        mobilizationAmount: mobilization,
      });
      const data = result?.data || {};
      const fallback = buildFallbackRender(imageUrl);
      const nextConcepts = Array.isArray(data.concepts) && data.concepts.length ? data.concepts : fallback.concepts;
      const nextResult: RenderResult = {
        aiProvider: data.aiProvider || data.provider || 'server',
        renderStatus: data.renderStatus || 'AI_RENDER_PENDING',
        generatedImages: Array.isArray(data.generatedImages) ? data.generatedImages : nextConcepts.map((concept: any) => concept.afterImageUrl).filter(Boolean),
        concepts: nextConcepts,
        executionDetails: Array.isArray(data.executionDetails) ? data.executionDetails : executionDetails,
      };
      setRenderedConcepts(nextResult.concepts);
      setRenderStatus(nextResult.renderStatus);
      if (nextResult.renderStatus === 'AI_RENDER_PENDING') setRenderError('AI render pending — scope is still saved');
      return nextResult;
    } catch (error: any) {
      console.error('[AI Studio] render failed:', { code: error?.code, message: error?.message, error });
      const fallback = buildFallbackRender(imageUrl);
      setRenderedConcepts(fallback.concepts);
      setRenderStatus(fallback.renderStatus);
      setRenderError('AI render pending — scope is still saved');
      return fallback;
    } finally {
      setRendering(false);
    }
  };

  const handleCreateConcept = async () => {
    if (!user?.uid) {
      setSnackbar({ open: true, message: 'Please sign in before submitting a design request.', severity: 'error' });
      return;
    }

    if (!referenceImages.length) {
      setSnackbar({ open: true, message: 'Take or upload at least one property image before creating a concept.', severity: 'error' });
      return;
    }

    setSubmitting(true);
    setUploadProgress(0);
    try {
      const tenantContext = tenantMode ? await resolveTenantContext(user) : {};
      const unit = tenantContext.unit || {};
      const property = tenantContext.property || {};
      const ownerId = tenantMode ? (property.ownerId || property.ownerUid || unit.ownerId || unit.ownerUid || null) : user.uid;
      const ownerEmail = tenantMode ? (property.ownerEmail || unit.ownerEmail || null) : (user.email || null);
      const status = getInitialDesignStatus(normalizedRole, true);
      const requestRef = doc(collection(db, 'design_requests'));
      const uploadedUrls = await uploadReferenceImages(requestRef.id);
      const aiResult = await runAIDesignRender(requestRef.id, uploadedUrls[0]);
      const persistedConcepts = aiResult.concepts;

      const requestPayload = {
        userId: user.uid,
        createdByUid: user.uid,
        authUid: user.uid,
        role: normalizedRole || 'owner',
        userName: user.displayName || user.email || 'BIN GROUP user',
        userEmail: user.email || null,
        ownerId,
        ownerUid: ownerId,
        ownerEmail,
        tenantId: tenantMode ? user.uid : null,
        tenantUid: tenantMode ? user.uid : null,
        tenantEmail: tenantMode ? (user.email || null) : null,
        propertyId: property.id || unit.propertyId || null,
        propertyName: property.name || property.propertyName || unit.propertyName || (tenantMode ? 'Tenant assigned unit' : 'Owner design request'),
        propertyLocation: property.address || property.location || unit.propertyLocation || null,
        unitId: unit.id || null,
        roomType: scope.zoneType,
        theme: designStyle,
        budget: quote.finalTotal,
        referenceImages: uploadedUrls,
        generatedImages: aiResult.generatedImages,
        renderStatus: aiResult.renderStatus,
        aiProvider: aiResult.aiProvider,
        mobilizationAmount: mobilization,
        executionDetails: aiResult.executionDetails,
        scope: {
          ...scope,
          scopeDescription,
          requiredWork: scopeDescription,
          designObjective,
          referenceImages: uploadedUrls,
          generatedImages: aiResult.generatedImages,
          unitNumber: unit.unitNumber || '',
          floorLevel: unit.floorNumber || '',
          imageCount: uploadedUrls.length,
        },
        designStyle,
        designObjective,
        quote,
        concepts: persistedConcepts,
        conceptPrompt: persistedConcepts[0]?.prompt || quote.conceptDesignResult,
        status,
        workflowStage: status,
        approvalStatus: getApprovalRequired(normalizedRole) ? 'PENDING_OWNER_APPROVAL' : 'OWNER_CREATED',
        quoteStatus: tenantMode ? 'PENDING_OWNER_APPROVAL' : 'DEPOSIT_PENDING',
        paymentStatus: 'NOT_STARTED',
        adminHandoffStatus: tenantMode ? 'WAITING_OWNER_APPROVAL' : 'PAYMENT_NOT_STARTED',
        engineerHandoffStatus: 'WAITING_PAYMENT',
        source: 'AI_DESIGN_STUDIO_PUBLIC_PORTAL',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(requestRef, { ...requestPayload, id: requestRef.id });
      await addDoc(collection(db, 'design_quotes'), { requestId: requestRef.id, ...requestPayload, createdAt: serverTimestamp() });
      await Promise.all(persistedConcepts.map((concept) => addDoc(collection(db, 'design_concepts'), {
        requestId: requestRef.id,
        ownerId,
        ownerUid: ownerId,
        tenantId: tenantMode ? user.uid : null,
        tenantUid: tenantMode ? user.uid : null,
        userId: user.uid,
        role: normalizedRole || 'owner',
        ...concept,
        createdAt: serverTimestamp(),
      })));

      if (tenantMode) {
        await addDoc(collection(db, 'design_approvals'), {
          requestId: requestRef.id,
          ownerId,
          ownerUid: ownerId,
          tenantUid: user.uid,
          tenantEmail: user.email || null,
          propertyId: property.id || unit.propertyId || null,
          status: 'PENDING_OWNER_APPROVAL',
          approvalStatus: 'PENDING_OWNER_APPROVAL',
          decision: 'pending',
          payerRole: 'tenant',
          payerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await logAuditAction({
        actorId: user.uid,
        actorRole: normalizedRole || 'owner',
        action: 'AI_DESIGN_REQUEST_SUBMITTED',
        targetType: 'design_requests',
        targetId: requestRef.id,
        metadata: {
          imageCount: uploadedUrls.length,
          quoteTotal: quote.finalTotal,
          tenantMode,
          ownerId,
          renderStatus: aiResult.renderStatus,
          aiProvider: aiResult.aiProvider,
        },
      });

      setSnackbar({ open: true, message: tenantMode ? 'Design request submitted for owner approval.' : 'Design request created. Deposit workflow is ready.', severity: 'success' });
      const prefix = tenantMode ? '/tenant' : '/owner';
      navigate(`${prefix}/design-studio/request/${requestRef.id}`);
    } catch (error: any) {
      console.error('[AI Studio] request submission failed:', { code: error?.code, message: error?.message, error });
      setSnackbar({ open: true, message: designErrorMessage(error), severity: 'error' });
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const DetailList = ({ details }: { details: DesignExecutionDetail[] }) => (
    <Stack spacing={1.25}>
      {details.map((group) => (
        <Paper key={group.category} sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.025)', border: '1px solid rgba(198,167,94,0.14)', borderRadius: 2 }}>
          <Typography fontWeight={950} sx={{ color: binThemeTokens.gold }}>{group.category}</Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.4, color: 'rgba(255,255,255,0.68)' }}>
            {group.items.map((item) => <li key={item}><Typography variant="body2" sx={{ lineHeight: 1.55 }}>{item}</Typography></li>)}
          </Box>
        </Paper>
      ))}
    </Stack>
  );

  return (
    <Container maxWidth="xl" dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 4, md: 6 }, pb: { xs: 14, md: 8 }, textAlign: isRTL ? 'right' : 'left' }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{labels.eyebrow}</Typography>
          <Typography variant="h3" fontWeight={950} color="#FFF" sx={{ mt: 1 }}>{labels.title}</Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.72)', maxWidth: 920, lineHeight: 1.8 }}>{labels.subtitle}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
            <Chip icon={<Sparkles size={16} />} label="Server-side AI design workflow active" sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 900 }} />
            <Chip label={tenantMode ? 'Tenant approval flow' : 'Owner quote flow'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
          </Stack>
        </Box>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}><Camera color={binThemeTokens.gold} /> Reference images</Typography>
              <Grid container spacing={1.5}>
                <Grid item xs={12} sm={6}>
                  <Button component="label" variant="contained" fullWidth disabled={submitting} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                    Take photo
                    <input type="file" hidden accept="image/*" capture="environment" onChange={handleImageUpload} />
                  </Button>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Button component="label" variant="outlined" fullWidth disabled={submitting} sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                    Upload from gallery
                    <input type="file" hidden accept="image/*,.heic,.heif,.webp" multiple onChange={handleImageUpload} />
                  </Button>
                </Grid>
              </Grid>

              <Grid container spacing={1.5} sx={{ mt: 2 }}>
                {referenceImages.map((image, index) => (
                  <Grid item xs={4} key={`${image.name}-${index}`}>
                    <Box component="img" src={image.previewUrl} alt={`Reference ${index + 1}`} sx={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 2, border: `1px solid ${binThemeTokens.gold}` }} />
                  </Grid>
                ))}
              </Grid>

              {rendering && <Alert severity="info" sx={{ mt: 2 }}>Generating redesign image…</Alert>}
              {renderError && <Alert severity="warning" sx={{ mt: 2 }}>{renderError}</Alert>}
              {submitting && uploadProgress > 0 && (
                <Box sx={{ mt: 2 }}>
                  <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
                  <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{uploadProgress}% uploaded</Typography>
                </Box>
              )}

              <TextField multiline rows={4} fullWidth label={labels.objective} placeholder={labels.objectivePlaceholder} value={scopeDescription} onChange={(event) => setScopeDescription(event.target.value)} sx={{ mt: 3 }} />
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Home color={binThemeTokens.gold} /> Property design scope</Typography>
              <Stack spacing={2.5}>
                <TextField select label={labels.zone} value={scope.zoneType} onChange={(event) => setScope({ ...scope, zoneType: event.target.value })} fullWidth>{DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone}</MenuItem>)}</TextField>
                <TextField select label="Objective" value={designObjective} onChange={(event) => setDesignObjective(event.target.value)} fullWidth>{DESIGN_OBJECTIVES.map((objective) => <MenuItem key={objective} value={objective}>{objective}</MenuItem>)}</TextField>
                <TextField select label={labels.style} value={designStyle} onChange={(event) => setDesignStyle(event.target.value)} fullWidth>{DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style}</MenuItem>)}</TextField>
                <TextField select label="Finish tier" value={scope.finishTier} onChange={(event) => setScope({ ...scope, finishTier: event.target.value as DesignScope['finishTier'] })} fullWidth>{['Standard', 'Premium', 'Luxury'].map((tier) => <MenuItem key={tier} value={tier}>{tier}</MenuItem>)}</TextField>
                <Box><Typography variant="caption" color="text.secondary" fontWeight={900}><Ruler size={14} /> Area: {scope.dimensions} sq ft</Typography><Slider value={scope.dimensions} min={10} max={5000} onChange={(_, value) => setScope({ ...scope, dimensions: value as number })} sx={{ color: binThemeTokens.gold }} /></Box>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={3}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={46} color={binThemeTokens.gold} />
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>{labels.estimate}</Typography>
              <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>AED {quote.finalTotal.toLocaleString()}</Typography>
              <Typography sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1 }}>{labels.mobilization}: AED {mobilization.toLocaleString()}</Typography>
              <Button variant="contained" fullWidth onClick={handleCreateConcept} disabled={submitting || rendering} sx={{ mt: 3, py: 1.6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? 'Submitting...' : labels.action}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth startIcon={<MessageCircle size={17} />} sx={{ mt: 1.5, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>WhatsApp BIN GROUP</Button>
            </Paper>

            <Paper sx={{ mt: 3, p: 3, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}>
              <Typography variant="subtitle2" fontWeight={950} sx={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 1 }}><ShieldCheck size={18} /> {labels.protected}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, lineHeight: 1.7 }}>{labels.protectedDesc}</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="h5" fontWeight={950} color="#FFF" sx={{ mb: 2 }}>AI redesign images & execution scope</Typography>
          <Grid container spacing={2}>
            {concepts.map((concept) => (
              <Grid item xs={12} md={4} key={concept.id}>
                <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(198,167,94,0.2)' }}>
                  <Typography fontWeight={950} color={binThemeTokens.gold}>{concept.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1, lineHeight: 1.7 }}>{concept.scopeSummary}</Typography>
                  <Stack direction="row" spacing={1.5} sx={{ my: 2 }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">Before</Typography>
                      {concept.beforeImageUrl ? <Box component="img" src={concept.beforeImageUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center' }}><ImageIcon /></Box>}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="caption" color="text.secondary">After</Typography>
                      {concept.afterImageUrl ? <Box component="img" src={concept.afterImageUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.08)', display: 'grid', placeItems: 'center', p: 1, textAlign: 'center' }}><Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 900 }}>AI render pending — scope is still saved</Typography></Box>}
                    </Box>
                  </Stack>
                  <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Finish tier: {concept.finishTier || scope.finishTier}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Estimated quote: AED {quote.finalTotal.toLocaleString()}</Typography>
                  <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 900 }}>15% mobilization: AED {mobilization.toLocaleString()}</Typography>
                  <Box sx={{ mt: 2, maxHeight: 360, overflow: 'auto' }}><DetailList details={concept.executionDetails || executionDetails} /></Box>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>

        <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
          AI Studio saves uploaded images, generated redesign images when available, full execution details, quote, approval state, and handoff record into the BIN GROUP workflow ledger. Current render status: {renderStatus}.
        </Alert>
      </Stack>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

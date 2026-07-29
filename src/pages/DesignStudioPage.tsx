import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
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
import { calculateDesignStudioQuote, type DesignScope } from '../utils/DesignStudioPricingEngine';
import {
  DESIGN_OBJECTIVES,
  DESIGN_SPACE_TYPES,
  DESIGN_STYLES,
  buildDesignConcepts,
  buildDesignExecutionDetails,
  getDepositAmount,
  type DesignConcept,
  type DesignExecutionDetail,
} from '../utils/aiDesignStudioWorkflow';
import { functions, httpsCallable } from '../lib/firebase';

type PreviewImage = {
  previewUrl: string;
  name: string;
  size: number;
  contentType: string;
};

type ServerQuote = {
  currency?: string;
  finalTotal?: number;
  mobilizationAmount?: number;
  quoteHash?: string;
  quoteAuthority?: string;
};

type SubmitDesignResponse = {
  requestId?: string;
  renderStatus?: string;
  aiProvider?: string;
  concepts?: DesignConcept[];
  quote?: ServerQuote;
};

type SnackbarState = {
  open: boolean;
  message: string;
  severity: 'success' | 'error' | 'info' | 'warning';
};

const WHATSAPP_URL = 'https://wa.me/971552423233';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_REFERENCE_IMAGES = 1;

const defaultScope: DesignScope = {
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
};

const isSupportedImage = (file: File) => {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return (file.type ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) : false)
    || IMAGE_EXTENSIONS.includes(extension);
};

const mimeFromFile = (file: File) => {
  if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

const readImageAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Image preview failed'));
  reader.readAsDataURL(file);
});

const createDesignRequestId = () => {
  const browserCrypto = globalThis.crypto;
  if (browserCrypto && typeof browserCrypto.randomUUID === 'function') {
    return `design_${browserCrypto.randomUUID()}`.replace(/[^A-Za-z0-9_-]/g, '_');
  }
  const bytes = new Uint8Array(16);
  browserCrypto.getRandomValues(bytes);
  return `design_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};

function designErrorMessage(error: unknown) {
  const details = error as { code?: string; message?: string; details?: string };
  const code = String(details?.code || '').toLowerCase();
  const message = String(details?.details || details?.message || '').toLowerCase();
  if (code.includes('unauthenticated') || message.includes('sign in')) return 'Please sign in before submitting a design request.';
  if (code.includes('permission-denied') || message.includes('permission')) return 'Submission blocked by server authority checks.';
  if (code.includes('resource-exhausted')) return 'AI Design Studio request limit reached. Please retry later.';
  if (code.includes('failed-precondition') && message.includes('unit')) return 'A verified tenant unit link is required before submitting this design request.';
  if (code.includes('failed-precondition') || message.includes('app check')) return 'Submission requires production App Check and configured AI provider access.';
  if (code.includes('unavailable')) return 'AI image rendering is temporarily unavailable. No design workflow record was created.';
  return 'Design request could not be submitted. Please retry.';
}

function DetailList({ details }: { details: DesignExecutionDetail[] }) {
  return (
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
}

export default function DesignStudioPage() {
  const { user, role } = useRole();
  const { isRTL, tx } = useLanguage();
  const navigate = useNavigate();
  const normalizedRole = String(role || '').toLowerCase();
  const tenantMode = normalizedRole === 'tenant';

  const [scope, setScope] = useState<DesignScope>(defaultScope);
  const [referenceImages, setReferenceImages] = useState<PreviewImage[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [designObjective, setDesignObjective] = useState('refresh');
  const [submitting, setSubmitting] = useState(false);
  const [renderStatus, setRenderStatus] = useState('REFERENCE_IMAGE_REQUIRED');
  const [renderedConcepts, setRenderedConcepts] = useState<DesignConcept[]>([]);
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

  const preliminaryQuote = useMemo(() => calculateDesignStudioQuote({
    ...scope,
    addons: [],
    hasMEP: tenantMode ? false : scope.hasMEP,
    hasStructural: tenantMode ? false : scope.hasStructural,
    isNightWork: tenantMode ? false : scope.isNightWork,
  }), [scope, tenantMode]);

  const preliminaryMobilization = getDepositAmount(preliminaryQuote.finalTotal, 15);
  const displayedQuoteTotal = Number(serverQuote?.finalTotal || preliminaryQuote.finalTotal);
  const displayedMobilization = Number(serverQuote?.mobilizationAmount || preliminaryMobilization);

  const executionDetails = useMemo(() => buildDesignExecutionDetails({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    finishTier: scope.finishTier,
    dimensions: scope.dimensions,
    notes: scopeDescription,
    quoteTotal: displayedQuoteTotal,
    mobilizationAmount: displayedMobilization,
  }), [scope.zoneType, scope.finishTier, scope.dimensions, designStyle, designObjective, scopeDescription, displayedQuoteTotal, displayedMobilization]);

  const fallbackConcepts = useMemo(() => buildDesignConcepts({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    uploadedImageUrl: referenceImages[0]?.previewUrl,
    notes: scopeDescription,
    finishTier: scope.finishTier,
    quoteTotal: displayedQuoteTotal,
    mobilizationAmount: displayedMobilization,
  }), [scope.zoneType, scope.finishTier, designStyle, designObjective, referenceImages, scopeDescription, displayedQuoteTotal, displayedMobilization]);

  const concepts = renderedConcepts.length ? renderedConcepts : fallbackConcepts;

  const labels = {
    eyebrow: tx('design.eyebrow', 'AI PROPERTY DESIGN'),
    title: tx('design.title', 'AI Design Studio'),
    subtitle: tx('design.subtitle', 'Upload one real property image. The protected backend edits that image, resolves property authority, calculates the quote and creates the approval workflow.'),
    objective: tx('design.objective', 'Redesign objective'),
    objectivePlaceholder: tx('design.objective_placeholder', 'Describe what you want to improve, repair, redesign, or upgrade...'),
    zone: tx('design.zone', 'Design zone'),
    style: tx('design.style', 'Design style'),
    action: tx('design.action', tenantMode ? 'Submit for owner approval' : 'Create private concept and quote'),
    estimate: tx('design.estimate', serverQuote ? 'Server-calculated execution quote' : 'Preliminary execution estimate'),
    mobilization: tx('design.mobilization', '15% mobilization'),
    protected: tx('design.protected', 'Protected BIN GROUP design workflow'),
    protectedDesc: tx('design.protected_desc', 'The reference and generated property images remain private. Authoritative quote, ownership, approval and workflow records are created only by the App Check-protected callable.'),
  };

  const handleImageFiles = async (files: File[]) => {
    if (!files.length) return;
    const file = files[0];
    if (!isSupportedImage(file) || file.size > MAX_IMAGE_SIZE_BYTES) {
      setSnackbar({ open: true, message: 'Use one JPG, PNG, or WEBP image no larger than 5 MB.', severity: 'error' });
      return;
    }

    try {
      const preview: PreviewImage = {
        previewUrl: await readImageAsDataUrl(file),
        name: file.name,
        size: file.size,
        contentType: mimeFromFile(file),
      };
      setReferenceImages([preview]);
      setRenderedConcepts([]);
      setServerQuote(null);
      setRenderStatus('READY_FOR_PRIVATE_RENDER');
      setSnackbar({ open: true, message: 'Reference image secured locally. Submit when the design scope is ready.', severity: 'info' });
    } catch {
      setSnackbar({ open: true, message: 'Image preview failed. Please retry with another image.', severity: 'error' });
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await handleImageFiles(files.slice(0, MAX_REFERENCE_IMAGES));
  };

  const handleCreateConcept = async () => {
    if (!user?.uid) {
      setSnackbar({ open: true, message: 'Please sign in before submitting a design request.', severity: 'error' });
      return;
    }
    const reference = referenceImages[0];
    if (!reference) {
      setSnackbar({ open: true, message: 'Take or upload one real property image before creating a design request.', severity: 'error' });
      return;
    }

    setSubmitting(true);
    setRenderStatus('AI_RENDER_IN_PROGRESS');
    try {
      const requestId = createDesignRequestId();
      const submitDesign = httpsCallable(functions, 'submitAIDesignRequest');
      const result = await submitDesign({
        requestId,
        imageBase64: reference.previewUrl,
        mimeType: reference.contentType,
        scope: {
          ...scope,
          scopeDescription,
          requiredWork: scopeDescription,
          imageCount: 1,
        },
        designStyle,
        designObjective,
        notes: scopeDescription,
      });
      const data = (result?.data || {}) as SubmitDesignResponse;
      setRenderedConcepts(Array.isArray(data.concepts) ? data.concepts : []);
      setServerQuote(data.quote || null);
      setRenderStatus(data.renderStatus || 'AI_RENDER_COMPLETE');
      setSnackbar({
        open: true,
        message: tenantMode
          ? 'Private design request submitted for the canonical property owner approval.'
          : 'Private design concept and server quote created.',
        severity: 'success',
      });
      const prefix = tenantMode ? '/tenant' : '/owner';
      navigate(`${prefix}/design-studio/request/${data.requestId || requestId}`);
    } catch (error) {
      setRenderStatus('AI_RENDER_FAILED');
      setSnackbar({ open: true, message: designErrorMessage(error), severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="xl" dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 4, md: 6 }, pb: { xs: 14, md: 8 }, textAlign: isRTL ? 'right' : 'left' }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{labels.eyebrow}</Typography>
          <Typography variant="h3" fontWeight={950} color="#FFF" sx={{ mt: 1 }}>{labels.title}</Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.72)', maxWidth: 920, lineHeight: 1.8 }}>{labels.subtitle}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
            <Chip icon={<Sparkles size={16} />} label={`Server authority - ${renderStatus.replace(/_/g, ' ').toLowerCase()}`} sx={{ bgcolor: alpha(renderStatus === 'AI_RENDER_COMPLETE' ? '#10b981' : '#f59e0b', 0.12), color: renderStatus === 'AI_RENDER_COMPLETE' ? '#10b981' : '#f59e0b', fontWeight: 900 }} />
            <Chip label={tenantMode ? 'Tenant-to-owner approval flow' : 'Owner private quote flow'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
          </Stack>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.1fr 1fr 0.85fr' }, gap: 4 }}>
          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}><Camera color={binThemeTokens.gold} /> One private reference image</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <Button component="label" variant="contained" disabled={submitting} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                Take photo
                <input type="file" hidden accept="image/jpeg,image/png,image/webp" capture="environment" onChange={handleImageUpload} />
              </Button>
              <Button component="label" variant="outlined" disabled={submitting} sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                Upload from gallery
                <input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={handleImageUpload} />
              </Button>
            </Box>

            <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr', gap: 1.5 }}>
              {referenceImages.map((image) => (
                <Box key={image.name} component="img" src={image.previewUrl} alt="Private property reference" sx={{ width: '100%', maxHeight: 320, objectFit: 'cover', borderRadius: 2, border: `1px solid ${binThemeTokens.gold}` }} />
              ))}
              {!referenceImages.length && (
                <Box sx={{ height: 180, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.56)' }}>
                  <Stack alignItems="center" spacing={1}><ImageIcon /><Typography variant="caption">Reference image required</Typography></Stack>
                </Box>
              )}
            </Box>

            {submitting && (
              <Box sx={{ mt: 2 }}>
                <LinearProgress sx={{ height: 6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />
              </Box>
            )}

            <TextField multiline rows={4} fullWidth label={labels.objective} placeholder={labels.objectivePlaceholder} value={scopeDescription} onChange={(event) => setScopeDescription(event.target.value)} sx={{ mt: 3 }} />
          </Paper>

          <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Home color={binThemeTokens.gold} /> Property design scope</Typography>
            <Stack spacing={2.5}>
              <TextField select label={labels.zone} value={scope.zoneType} onChange={(event) => setScope({ ...scope, zoneType: event.target.value })} fullWidth>{DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone}</MenuItem>)}</TextField>
              <TextField select label="Objective" value={designObjective} onChange={(event) => setDesignObjective(event.target.value)} fullWidth>{DESIGN_OBJECTIVES.map((objective) => <MenuItem key={objective} value={objective}>{objective}</MenuItem>)}</TextField>
              <TextField select label={labels.style} value={designStyle} onChange={(event) => setDesignStyle(event.target.value)} fullWidth>{DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style}</MenuItem>)}</TextField>
              <TextField select label="Finish tier" value={scope.finishTier} onChange={(event) => setScope({ ...scope, finishTier: event.target.value as DesignScope['finishTier'] })} fullWidth>{['Standard', 'Premium', 'Luxury'].map((tier) => <MenuItem key={tier} value={tier}>{tier}</MenuItem>)}</TextField>
              <Box>
                <Typography variant="caption" color="text.secondary" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Ruler size={14} /> Area: {scope.dimensions} sq ft</Typography>
                <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, value) => setScope({ ...scope, dimensions: value as number })} sx={{ color: binThemeTokens.gold }} />
              </Box>
            </Stack>
          </Paper>

          <Stack spacing={3}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={46} color={binThemeTokens.gold} />
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>{labels.estimate}</Typography>
              <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>AED {displayedQuoteTotal.toLocaleString()}</Typography>
              <Typography sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1 }}>{labels.mobilization}: AED {displayedMobilization.toLocaleString()}</Typography>
              {!serverQuote && <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.52)', mt: 1 }}>The protected backend recalculates and locks the final quote.</Typography>}
              <Button variant="contained" fullWidth onClick={handleCreateConcept} disabled={submitting || !referenceImages.length} sx={{ mt: 3, py: 1.6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{submitting ? 'Creating private render...' : labels.action}</Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth startIcon={<MessageCircle size={17} />} sx={{ mt: 1.5, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>WhatsApp BIN GROUP</Button>
            </Paper>

            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}>
              <Typography variant="subtitle2" fontWeight={950} sx={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 1 }}><ShieldCheck size={18} /> {labels.protected}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, lineHeight: 1.7 }}>{labels.protectedDesc}</Typography>
            </Paper>
          </Stack>
        </Box>

        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="h5" fontWeight={950} color="#FFF" sx={{ mb: 2 }}>Execution scope preview</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {concepts.map((concept) => (
              <Paper key={concept.id} sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(198,167,94,0.2)' }}>
                <Typography fontWeight={950} color={binThemeTokens.gold}>{concept.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1, lineHeight: 1.7 }}>{concept.scopeSummary}</Typography>
                <Stack direction="row" spacing={1.5} sx={{ my: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">Before</Typography>
                    {concept.beforeImageUrl ? <Box component="img" src={concept.beforeImageUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center' }}><ImageIcon /></Box>}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">After</Typography>
                    {concept.afterImageUrl ? <Box component="img" src={concept.afterImageUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.08)', display: 'grid', placeItems: 'center', p: 1, textAlign: 'center' }}><Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 900 }}>Private AI render not created yet</Typography></Box>}
                  </Box>
                </Stack>
                <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Finish tier: {concept.finishTier || scope.finishTier}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#FFF' }}>Quote: AED {displayedQuoteTotal.toLocaleString()}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: binThemeTokens.gold, fontWeight: 900 }}>15% mobilization: AED {displayedMobilization.toLocaleString()}</Typography>
                <Box sx={{ mt: 2, maxHeight: 360, overflow: 'auto' }}><DetailList details={concept.executionDetails || executionDetails} /></Box>
              </Paper>
            ))}
          </Box>
        </Paper>

        <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
          The server creates the request, canonical owner/property binding, quote, approval record, audit log and private media paths. Current render status: {renderStatus}.
        </Alert>
      </Stack>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

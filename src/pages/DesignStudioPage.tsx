import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { type DesignScope } from '../utils/DesignStudioPricingEngine';
import { previewDesignQuote } from '../lib/designQuotePreview';
import {
  DESIGN_OBJECTIVES,
  DESIGN_SPACE_TYPES,
  DESIGN_STYLES,
  buildDesignConcepts,
  buildDesignExecutionDetails,
  type DesignConcept,
  type DesignExecutionDetail,
} from '../utils/aiDesignStudioWorkflow';
import { functions, httpsCallable } from '../lib/firebase';
import { DESIGN_SUBMIT_TIMEOUT_MS, designErrorMessage } from '../lib/designStudioErrors';
import { STATUS_TONES } from '../theme/statusColors';
import { designStatusLabel } from '../lib/designStatusLabels';
import { stripDesignPrompt } from '../lib/stripDesignPrompt';

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
const designSelectSx = {
  '& .MuiInputLabel-root': { color: '#F9FAFB', backgroundColor: '#161618', px: 0.5, lineHeight: 1.2 },
  '& .MuiInputLabel-root.Mui-focused': { color: '#E5C86B' },
  '& .MuiSelect-select': { color: '#F9FAFB' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(249,250,251,0.45)' },
};
const DESIGN_WAIT_NOTE_MS = 45_000;
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

function DetailList({ details }: { details: DesignExecutionDetail[] }) {
  return (
    <Stack spacing={1.25}>
      {details.map((group) => (
        <Paper key={group.category} className="design-studio-detail" sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(229,231,235,0.35)', borderRadius: 2 }}>
          <Typography fontWeight={950} sx={{ color: binThemeTokens.gold }}>{group.category}</Typography>
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.4, color: '#E5E7EB' }}>
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
  const [submitError, setSubmitError] = useState('');
  const brokerMode = normalizedRole === 'broker';

  const [scope, setScope] = useState<DesignScope>(defaultScope);
  const [referenceImages, setReferenceImages] = useState<PreviewImage[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [designObjective, setDesignObjective] = useState('refresh');
  const [submitting, setSubmitting] = useState(false);
  const [waitNote, setWaitNote] = useState(false);
  const stoppedWaitingRef = useRef(false);
  const [renderStatus, setRenderStatus] = useState('REFERENCE_IMAGE_REQUIRED');
  const [renderedConcepts, setRenderedConcepts] = useState<DesignConcept[]>([]);
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

  const preliminaryQuote = useMemo(() => previewDesignQuote({
    ...scope,
    hasMEP: tenantMode ? false : scope.hasMEP,
    hasStructural: tenantMode ? false : scope.hasStructural,
    isNightWork: tenantMode ? false : scope.isNightWork,
  }), [scope, tenantMode]);

  const preliminaryMobilization = preliminaryQuote.mobilizationAmount;
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
    dimensions: scope.dimensions,
    quoteTotal: displayedQuoteTotal,
    mobilizationAmount: displayedMobilization,
  }), [scope.zoneType, scope.finishTier, scope.dimensions, designStyle, designObjective, referenceImages, scopeDescription, displayedQuoteTotal, displayedMobilization]);

  const concepts = renderedConcepts.length ? renderedConcepts : fallbackConcepts;

  const labels = {
    eyebrow: tx('design.eyebrow', 'AI PROPERTY DESIGN'),
    title: tx('design.title', 'AI Design Studio'),
    subtitle: tenantMode
      ? "Upload a photo of your room. We'll create design ideas and a price, then send them to your owner for approval."
      : "Upload a photo of your room. We'll create 3 design ideas and a price for you to choose from.",
    objective: tx('design.objective', 'Redesign objective'),
    objectivePlaceholder: tx('design.objective_placeholder', 'Describe what you want to improve, repair, redesign, or upgrade...'),
    zone: tx('design.zone', 'Design zone'),
    style: tx('design.style', 'Design style'),
    action: tx('design.action', tenantMode ? 'Submit for owner approval' : 'Create private concept and quote'),
    estimate: tx('design.estimate', serverQuote ? 'Server-calculated execution quote' : 'Preliminary execution estimate'),
    mobilization: tx('design.mobilization', '15% mobilization'),
    protected: tx('design.protected', 'Protected BIN GROUP design workflow'),
    protectedDesc: 'Your photo and the design images stay private. Only you, the property owner and BIN Group can see them.',
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

  useEffect(() => {
    if (!submitting) {
      setWaitNote(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setWaitNote(true), DESIGN_WAIT_NOTE_MS);
    return () => window.clearTimeout(timer);
  }, [submitting]);

  const stopWaitingForDesign = () => {
    stoppedWaitingRef.current = true;
    setSubmitting(false);
    setWaitNote(false);
    setRenderStatus('AI_RENDER_FAILED');
    setSubmitError('Stopped waiting. No design image was shown. If a request was saved, open your design requests before trying again.');
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

    stoppedWaitingRef.current = false;
    setSubmitting(true);
    setSubmitError('');
    setWaitNote(false);
    setRenderStatus('AI_RENDER_IN_PROGRESS');
    try {
      const requestId = createDesignRequestId();
      const submitDesign = httpsCallable(functions, 'submitAIDesignRequest', { timeout: DESIGN_SUBMIT_TIMEOUT_MS });
      let timeoutId = 0;
      const result = await Promise.race([
        submitDesign({
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
      }),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => reject({ code: 'deadline-exceeded', message: 'deadline-exceeded' }), DESIGN_SUBMIT_TIMEOUT_MS);
        }),
      ]).finally(() => window.clearTimeout(timeoutId));
      if (stoppedWaitingRef.current) return;
      const data = stripDesignPrompt((result?.data || {}) as Record<string, unknown>) as SubmitDesignResponse;
      const concepts = (Array.isArray(data.concepts) ? data.concepts : []).map((concept) => (
        concept && typeof concept === 'object' ? stripDesignPrompt(concept as unknown as Record<string, unknown>) as unknown as DesignConcept : concept
      ));
      const hasImage = concepts.some((concept) => Boolean(concept.afterImageUrl));
      if (!hasImage) {
        setRenderedConcepts([]);
        setRenderStatus('AI_RENDER_FAILED');
        setSubmitError('The design service did not return an image. Nothing was invented. Try again, or open your design requests if one was saved.');
        setSnackbar({ open: true, message: 'No design image came back. Nothing was invented.', severity: 'error' });
        return;
      }
      setRenderedConcepts(concepts);
      setServerQuote(data.quote || null);
      setRenderStatus(data.renderStatus || 'AI_RENDER_COMPLETE');
      setSnackbar({
        open: true,
        message: tenantMode
          ? 'Sent to your owner for approval. You will see their decision in your design requests.'
          : 'Private design concept and server quote created.',
        severity: 'success',
      });
      // Brokers keep the concept on this page (marketing proposal; no owner approval or payment flow).
      if (!brokerMode) {
        const prefix = tenantMode ? '/tenant' : '/owner';
        navigate(`${prefix}/design-studio/request/${data.requestId || requestId}`);
      }
    } catch (error) {
      if (stoppedWaitingRef.current) return;
      setRenderStatus('AI_RENDER_FAILED');
      setSubmitError(designErrorMessage(error));
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
          <Typography variant="h3" fontWeight={950} color={binThemeTokens.adaptiveText} sx={{ mt: 1 }}>{labels.title}</Typography>
          <Typography sx={{ mt: 2, color: binThemeTokens.adaptiveTextMuted, maxWidth: 920, lineHeight: 1.8 }}>{labels.subtitle}</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
            <Chip icon={<Sparkles size={16} />} label={`Design status: ${designStatusLabel(renderStatus, isRTL ? 'ar' : 'en')}`} sx={{ bgcolor: alpha(renderStatus === 'AI_RENDER_COMPLETE' ? '#10b981' : '#f59e0b', 0.12), color: renderStatus === 'AI_RENDER_COMPLETE' ? STATUS_TONES.success.text : STATUS_TONES.warning.text, fontWeight: 900 }} />
            <Chip label={tenantMode ? 'Your owner approves this' : 'Private to you'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
          </Stack>
          {submitting && (
            <Alert severity="info" sx={{ mt: 2 }} data-testid="design-creating">
              Creating your design image. This can take a few minutes. No image is shown until one is created.
            </Alert>
          )}
          {renderStatus === 'AI_RENDER_FAILED' && submitError && (
            <Alert severity="error" sx={{ mt: 2 }} data-testid="design-submit-error" action={<Button color="inherit" disabled={submitting} onClick={() => void handleCreateConcept()}>{submitting ? 'Creating…' : 'Try again'}</Button>}>{submitError}</Alert>
          )}
          {submitting && waitNote && (
            <Alert severity="warning" sx={{ mt: 2 }} data-testid="design-still-waiting" action={<Button color="inherit" onClick={stopWaitingForDesign}>Stop waiting</Button>}>
              Still waiting for a real design image. This can take a few minutes. No image is shown until one is created. You can stop waiting and try again.
            </Alert>
          )}
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

          <Paper className="design-studio-panel" sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#161618', border: '1px solid rgba(255,255,255,0.16)' }}>
            <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}><Home color={binThemeTokens.gold} /> Property design scope</Typography>
            <Stack spacing={2.5}>
              <TextField select label={labels.zone} value={scope.zoneType} onChange={(event) => setScope({ ...scope, zoneType: event.target.value })} fullWidth InputLabelProps={{ shrink: true }} sx={designSelectSx}>{DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone}</MenuItem>)}</TextField>
              <TextField select label="Objective" value={designObjective} onChange={(event) => setDesignObjective(event.target.value)} fullWidth InputLabelProps={{ shrink: true }} sx={designSelectSx}>{DESIGN_OBJECTIVES.map((objective) => <MenuItem key={objective} value={objective}>{objective}</MenuItem>)}</TextField>
              <TextField select label={labels.style} value={designStyle} onChange={(event) => setDesignStyle(event.target.value)} fullWidth InputLabelProps={{ shrink: true }} sx={designSelectSx}>{DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style}</MenuItem>)}</TextField>
              <TextField select label="Finish tier" value={scope.finishTier} onChange={(event) => setScope({ ...scope, finishTier: event.target.value as DesignScope['finishTier'] })} fullWidth InputLabelProps={{ shrink: true }} sx={designSelectSx}>{['Standard', 'Premium', 'Luxury'].map((tier) => <MenuItem key={tier} value={tier}>{tier}</MenuItem>)}</TextField>
              <Box>
                <Typography variant="caption" data-testid="design-area-label" fontWeight={900} sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#F9FAFB' }}><Ruler size={14} /> Area: {scope.dimensions} sq ft</Typography>
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
              {!serverQuote && <Typography variant="caption" sx={{ display: 'block', color: '#D1D5DB', mt: 1 }}>This is an estimate. The final price is confirmed when your design is created.</Typography>}
              <Typography variant="caption" data-testid="design-estimate-label" sx={{ display: 'block', color: 'rgba(255,255,255,0.72)', mt: 1 }}>{(serverQuote as any)?.estimateLabel || "Indicative estimate from BIN's price list. Not a supplier quote; final price is confirmed after site verification."}</Typography>
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
          <Typography variant="h5" fontWeight={950} color={binThemeTokens.adaptiveText} sx={{ mb: 2 }}>Execution scope preview</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {concepts.map((concept) => (
              <Paper key={concept.id} sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(198,167,94,0.2)' }}>
                <Typography fontWeight={950} color={binThemeTokens.gold}>{concept.title}</Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1, lineHeight: 1.7 }}>{concept.scopeSummary}</Typography>
                <Stack direction="row" spacing={1.5} sx={{ my: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">Before</Typography>
                    {(concept.beforeImageUrl || referenceImages[0]?.previewUrl) ? <Box component="img" alt="Before" src={concept.beforeImageUrl || referenceImages[0]?.previewUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', display: 'grid', placeItems: 'center' }}><ImageIcon /></Box>}
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">After</Typography>
                    {concept.afterImageUrl ? <Box component="img" alt="AI concept after" src={concept.afterImageUrl} sx={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 2 }} /> : <Box sx={{ height: 120, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.08)', display: 'grid', placeItems: 'center', p: 1, textAlign: 'center' }}><Typography variant="caption" sx={{ color: '#fbbf24', fontWeight: 900 }}>Private AI render not created yet</Typography></Box>}
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
          {tenantMode ? 'Your owner will see the design ideas and price and decide. Nothing is charged until it is approved.' : 'Nothing is charged until you approve a quote.'} Status: {designStatusLabel(renderStatus, isRTL ? 'ar' : 'en')}.
        </Alert>
      </Stack>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert>
      </Snackbar>
    </Container>
  );
}

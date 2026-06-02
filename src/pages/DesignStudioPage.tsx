import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Grid,
  MenuItem,
  Paper,
  Slider,
  Snackbar,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import { Camera, Home, MessageCircle, Ruler, ShieldCheck, Sparkles } from 'lucide-react';
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
  getDepositAmount,
} from '../utils/aiDesignStudioWorkflow';

type AiDesignStudioReadiness = {
  externalImageGeneration: boolean;
};

const WHATSAPP_URL = 'https://wa.me/971552423233';
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const MAX_IMAGE_SIZE_BYTES = 50 * 1024 * 1024;

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

export default function DesignStudioPage() {
  const { user, role } = useRole();
  const { isRTL, tx } = useLanguage();
  const aiReadiness = useMemo(() => getAiDesignStudioReadiness(), []);
  const tenantMode = String(role || '').toLowerCase() === 'tenant';

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
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [designObjective, setDesignObjective] = useState('refresh');
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
  const concepts = useMemo(() => buildDesignConcepts({
    zoneType: scope.zoneType,
    designStyle,
    designObjective,
    uploadedImageUrl: referenceImages[0],
    notes: scopeDescription,
  }), [scope.zoneType, designStyle, designObjective, referenceImages, scopeDescription]);

  const labels = {
    eyebrow: tx('design.eyebrow', 'AI PROPERTY DESIGN'),
    title: tx('design.title', 'AI Design Studio'),
    subtitle: tx('design.subtitle', 'Upload a room, hall, majlis, garden, facade, or property area photo. BIN GROUP prepares a design concept, execution scope, estimated quote, and 15% mobilization path.'),
    upload: tx('design.upload', 'Upload reference images'),
    objective: tx('design.objective', 'Redesign objective'),
    objectivePlaceholder: tx('design.objective_placeholder', 'Describe what you want to improve, repair, redesign, or upgrade...'),
    zone: tx('design.zone', 'Design zone'),
    style: tx('design.style', 'Design style'),
    action: tx('design.action', tenantMode ? 'Submit for owner approval' : 'Create concept and quote'),
    estimate: tx('design.estimate', 'Estimated execution quote'),
    mobilization: tx('design.mobilization', '15% mobilization'),
    aiReady: tx('design.ai_ready', 'AI image generation configured'),
    aiPending: tx('design.ai_pending', 'Workflow AI active / external image API pending'),
    protected: tx('design.protected', 'Protected BIN GROUP design workflow'),
    protectedDesc: tx('design.protected_desc', 'Concepts are scope-controlled. Final execution requires owner approval, confirmed scope, site verification, and payment step.'),
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const invalid = files.find((file) => !isSupportedImage(file) || file.size > MAX_IMAGE_SIZE_BYTES);
    if (invalid) {
      setSnackbar({ open: true, message: 'Upload JPG, PNG, WEBP, HEIC, or HEIF images only. Maximum size is 50 MB per image.', severity: 'error' });
      return;
    }

    try {
      const previews = await Promise.all(files.map(readImageAsDataUrl));
      setReferenceImages((current) => [...current, ...previews].slice(0, 8));
      setSnackbar({ open: true, message: 'Image preview added. Concept workflow is ready.', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Image preview failed. Please retry with another image.', severity: 'error' });
    }
  };

  const handleCreateConcept = () => {
    if (!user?.uid) {
      setSnackbar({ open: true, message: 'Please sign in before submitting a design request.', severity: 'error' });
      return;
    }

    if (!referenceImages.length) {
      setSnackbar({ open: true, message: 'Upload at least one property image before creating a concept.', severity: 'error' });
      return;
    }

    setSnackbar({ open: true, message: 'Design concept prepared. Full submission/payment handoff will open in the owner workflow.', severity: 'success' });
  };

  return (
    <Container maxWidth="xl" dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 4, md: 6 }, pb: { xs: 14, md: 8 }, textAlign: isRTL ? 'right' : 'left' }}>
      <Stack spacing={4}>
        <Box>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
            {labels.eyebrow}
          </Typography>
          <Typography variant="h3" fontWeight={950} color="#FFF" sx={{ mt: 1 }}>
            {labels.title}
          </Typography>
          <Typography sx={{ mt: 2, color: 'rgba(255,255,255,0.72)', maxWidth: 920, lineHeight: 1.8 }}>
            {labels.subtitle}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
            <Chip icon={<Sparkles size={16} />} label={aiReadiness.externalImageGeneration ? labels.aiReady : labels.aiPending} sx={{ bgcolor: alpha(aiReadiness.externalImageGeneration ? '#10b981' : '#f59e0b', 0.12), color: aiReadiness.externalImageGeneration ? '#10b981' : '#f59e0b', fontWeight: 900 }} />
            <Chip label={tenantMode ? 'Tenant approval flow' : 'Owner quote flow'} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.12), color: binThemeTokens.gold, fontWeight: 900 }} />
          </Stack>
        </Box>

        <Grid container spacing={4}>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Camera color={binThemeTokens.gold} /> {labels.upload}
              </Typography>
              <Button component="label" variant="outlined" fullWidth sx={{ py: 2, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                {labels.upload}
                <input type="file" hidden accept="image/*,.heic,.heif,.webp" multiple onChange={handleImageUpload} />
              </Button>
              <Grid container spacing={1.5} sx={{ mt: 2 }}>
                {referenceImages.map((url, index) => (
                  <Grid item xs={4} key={`${url}-${index}`}>
                    <Box component="img" src={url} alt={`Reference ${index + 1}`} sx={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 2, border: `1px solid ${binThemeTokens.gold}` }} />
                  </Grid>
                ))}
              </Grid>

              <TextField
                multiline
                rows={4}
                fullWidth
                label={labels.objective}
                placeholder={labels.objectivePlaceholder}
                value={scopeDescription}
                onChange={(event) => setScopeDescription(event.target.value)}
                sx={{ mt: 3 }}
              />
            </Paper>
          </Grid>

          <Grid item xs={12} lg={4}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Home color={binThemeTokens.gold} /> Property design scope
              </Typography>
              <Stack spacing={2.5}>
                <TextField select label={labels.zone} value={scope.zoneType} onChange={(event) => setScope({ ...scope, zoneType: event.target.value })} fullWidth>
                  {DESIGN_SPACE_TYPES.map((zone) => <MenuItem key={zone} value={zone}>{zone}</MenuItem>)}
                </TextField>
                <TextField select label="Objective" value={designObjective} onChange={(event) => setDesignObjective(event.target.value)} fullWidth>
                  {DESIGN_OBJECTIVES.map((objective) => <MenuItem key={objective} value={objective}>{objective}</MenuItem>)}
                </TextField>
                <TextField select label={labels.style} value={designStyle} onChange={(event) => setDesignStyle(event.target.value)} fullWidth>
                  {DESIGN_STYLES.map((style) => <MenuItem key={style} value={style}>{style}</MenuItem>)}
                </TextField>
                <TextField select label="Finish tier" value={scope.finishTier} onChange={(event) => setScope({ ...scope, finishTier: event.target.value as DesignScope['finishTier'] })} fullWidth>
                  {['Standard', 'Premium', 'Luxury'].map((tier) => <MenuItem key={tier} value={tier}>{tier}</MenuItem>)}
                </TextField>
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={900}><Ruler size={14} /> Area: {scope.dimensions} sq ft</Typography>
                  <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, value) => setScope({ ...scope, dimensions: value as number })} sx={{ color: binThemeTokens.gold }} />
                </Box>
              </Stack>
            </Paper>
          </Grid>

          <Grid item xs={12} lg={3}>
            <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={46} color={binThemeTokens.gold} />
              <Typography variant="h6" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>{labels.estimate}</Typography>
              <Typography variant="h4" fontWeight={950} color="#FFF" sx={{ mt: 2 }}>
                AED {quote.finalTotal.toLocaleString()}
              </Typography>
              <Typography sx={{ color: binThemeTokens.gold, fontWeight: 900, mt: 1 }}>
                {labels.mobilization}: AED {mobilization.toLocaleString()}
              </Typography>
              <Button variant="contained" fullWidth onClick={handleCreateConcept} sx={{ mt: 3, py: 1.6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                {labels.action}
              </Button>
              <Button component="a" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" variant="outlined" fullWidth startIcon={<MessageCircle size={17} />} sx={{ mt: 1.5, color: binThemeTokens.gold, borderColor: binThemeTokens.gold, fontWeight: 950 }}>
                WhatsApp BIN GROUP
              </Button>
            </Paper>

            <Paper sx={{ mt: 3, p: 3, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}>
              <Typography variant="subtitle2" fontWeight={950} sx={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShieldCheck size={18} /> {labels.protected}
              </Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mt: 1, lineHeight: 1.7 }}>
                {labels.protectedDesc}
              </Typography>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: { xs: 3, md: 4 }, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Typography variant="h5" fontWeight={950} color="#FFF" sx={{ mb: 2 }}>Generated concept prompts</Typography>
          <Grid container spacing={2}>
            {concepts.map((concept) => (
              <Grid item xs={12} md={4} key={concept.id}>
                <Paper sx={{ p: 2.5, height: '100%', bgcolor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(198,167,94,0.2)' }}>
                  <Typography fontWeight={950} color={binThemeTokens.gold}>{concept.title}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.68)', mt: 1, lineHeight: 1.7 }}>{concept.scopeSummary}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>

        <Alert severity="info" sx={{ bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
          This launch-safe Design Studio keeps quote generation and concept preparation online. Full Firestore submission/payment handoff can be reconnected after the public route smoke tests are green.
        </Alert>
      </Stack>

      <Snackbar open={snackbar.open} autoHideDuration={5000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}

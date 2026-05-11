import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Checkbox
} from '@mui/material';
import { AlertTriangle, ArrowRight, Camera, Home, Image as ImageIcon, RefreshCcw, Ruler, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db, collection, addDoc, serverTimestamp, getDocs, query, where, storage, ref, uploadBytesResumable, getDownloadURL } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { DESIGN_SCOPE_OPTIONS, DESIGN_ZONES, calculateDesignStudioQuote } from '../utils/DesignStudioPricingEngine';
import type { DesignScope } from '../utils/DesignStudioPricingEngine';
import { NotificationEvents } from '../lib/notificationService';
import { logAuditAction } from '../utils/auditLogger';

export default function DesignStudioPage() {
  const { user, role } = useRole();
  const { tx, isRTL } = useLanguage();
  const navigate = useNavigate();

  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [keepConstraints, setKeepConstraints] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [designStyle, setDesignStyle] = useState('Modern');
  const [unitNumber, setUnitNumber] = useState('');
  const [floorLevel, setFloorLevel] = useState('');
  const [existingCondition, setExistingCondition] = useState('');
  const [requiredWork, setRequiredWork] = useState('');

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
    addons: ['concept_layout', 'moodboard']
  });

  useEffect(() => {
    const fetchProperties = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const q = query(collection(db, 'properties'), where(role === 'tenant' ? 'tenantId' : 'ownerId', '==', user.uid));
        const snap = await getDocs(q);
        const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProperties(props);
        if (props.length > 0) setSelectedPropertyId(props[0].id);
      } catch (err) {
        console.error('Failed to fetch properties for Design Studio:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProperties();
  }, [user, role]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadError(null);

    const currentUser = auth.currentUser;
    if (!currentUser?.uid) {
      setUploadError(tx('ai.upload_signin_required', 'Please sign in before uploading design images.'));
      return;
    }

    const maxFileSize = 10 * 1024 * 1024;
    const invalidFile = Array.from(files).find((file) => !file.type.startsWith('image/') || file.size > maxFileSize);
    if (invalidFile) {
      setUploadError(tx('ai.upload_limit', 'Upload images only, up to 10 MB each.'));
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedUrls = [...referenceImages];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storageRef = ref(storage, `design_requests/${currentUser.uid}/${Date.now()}_${i}_${safeName}`);
        await new Promise<void>((resolve, reject) => {
          const uploadTask = uploadBytesResumable(storageRef, file);
          uploadTask.on('state_changed',
            (snapshot) => setUploadProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
            (error) => reject(error),
            async () => {
              try {
                uploadedUrls.push(await getDownloadURL(uploadTask.snapshot.ref));
                resolve();
              } catch (error) {
                reject(error);
              }
            }
          );
        });
      }
      setReferenceImages(uploadedUrls);
      setSnackbar({ open: true, message: tx('ai.upload_success', 'Image uploaded successfully.'), severity: 'success' });
      await logAuditAction({
        actorId: currentUser.uid,
        actorRole: role || 'user',
        action: 'DOCUMENT_UPLOAD',
        targetType: 'design_studio_reference',
        targetId: currentUser.uid,
        metadata: { fileCount: files.length, totalImages: uploadedUrls.length }
      });
    } catch (err) {
      console.error('Upload failure:', err);
      setUploadError(tx('ai.image_upload_failed', 'Image upload failed. Please retry or choose another image.'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const toggleDesignOption = (id: string) => {
    setScope(prev => ({ ...prev, addons: prev.addons.includes(id) ? prev.addons.filter(a => a !== id) : [...prev.addons, id] }));
  };

  const handleInitializeStudio = async () => {
    if (!user?.uid) {
      setSnackbar({ open: true, message: tx('ai.error_unauthenticated', 'Please sign in again.'), severity: 'error' });
      return;
    }
    setSubmitting(true);
    try {
      const property = properties.find(p => p.id === selectedPropertyId);
      const quote = calculateDesignStudioQuote(scope);
      const docRef = await addDoc(collection(db, 'design_requests'), {
        userId: user.uid,
        role,
        propertyId: selectedPropertyId || null,
        propertyName: property?.name || property?.propertyName || 'Selected Property',
        ownerId: property?.ownerId || user.uid,
        scope: { ...scope, scopeDescription, keepConstraints, referenceImages, unitNumber, floorLevel, existingCondition, requiredWork },
        designStyle,
        quote,
        status: role === 'tenant' ? 'PENDING_OWNER_NOC' : 'AI_CONCEPT_READY',
        createdAt: serverTimestamp(),
        source: 'AI_DESIGN_STUDIO_CONCEPT_ONLY'
      });

      if (role === 'tenant' && property?.ownerId) {
        await NotificationEvents.OWNER.DESIGN_STUDIO_NOC(property.ownerId, user.displayName || 'Your Tenant', scope.zoneType).catch(console.warn);
      }

      await logAuditAction({
        actorId: user.uid,
        actorRole: role || 'user',
        action: 'DESIGN_REQUEST_SUBMITTED',
        targetType: 'design_requests',
        targetId: docRef.id,
        metadata: { propertyId: selectedPropertyId, zoneType: scope.zoneType, style: designStyle, imageCount: referenceImages.length }
      });

      navigate(`/design-studio/request/${docRef.id}`);
    } catch (err) {
      console.error('Design Studio Fault:', err);
      setSnackbar({ open: true, message: tx('ai.error_internal', 'AI backend temporarily unavailable. Please try again.'), severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

  return (
    <Container maxWidth="xl" sx={{ py: 6 }} dir={isRTL ? 'rtl' : 'ltr'}>
      <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isRTL ? 'row-reverse' : 'row' }}>
        <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
          <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>{tx('ai.design_eyebrow', 'SOVEREIGN CREATIVE ENGINE')}</Typography>
          <Typography variant="h3" fontWeight="950" color="#FFF">{tx('ai.design_title', 'AI Design')} <Box component="span" sx={{ color: binThemeTokens.gold }}>{tx('ai.design_studio', 'Studio')}</Box></Typography>
        </Box>
        <Chip icon={<Sparkles size={16} />} label={tx('ai.free_concepts', 'FREE AI CONCEPTS')} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
      </Box>

      {uploadError && <Alert severity="error" icon={<AlertTriangle />} sx={{ mb: 4 }} action={<Button size="small" color="inherit" onClick={() => setUploadError(null)} startIcon={<RefreshCcw size={14} />}>{tx('common.retry', 'Retry')}</Button>}>{uploadError}</Alert>}

      <Grid container spacing={5}>
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}><Camera color={binThemeTokens.gold} /> {tx('ai.visual_context', '1. Visual Context')}</Typography>
            <Stack direction="row" spacing={2} sx={{ mb: 2, overflowX: 'auto', pb: 1 }}>
              {referenceImages.map((url, idx) => <Box key={idx} sx={{ position: 'relative', flexShrink: 0 }}><img src={url} alt="Reference" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${binThemeTokens.gold}` }} /><IconButton size="small" onClick={() => setReferenceImages(prev => prev.filter(i => i !== url))} sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#ef4444', color: '#fff', p: 0.2 }}><X size={12} /></IconButton></Box>)}
              {!uploading && <Button component="label" sx={{ width: 92, height: 80, flexShrink: 0, border: '1px dashed rgba(255,255,255,0.22)', borderRadius: 2, display: 'flex', flexDirection: 'column', color: binThemeTokens.gold }}><Camera size={24} /><Typography variant="caption" sx={{ mt: 0.5, fontWeight: 900 }}>{tx('ai.camera_add', 'CAMERA / ADD')}</Typography><input type="file" hidden accept="image/*" capture="environment" multiple onChange={handleImageUpload} /></Button>}
              {uploading && <Box sx={{ width: 92, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress size={24} sx={{ color: binThemeTokens.gold }} /></Box>}
            </Stack>
            {uploading && <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.08)', '& .MuiLinearProgress-bar': { bgcolor: binThemeTokens.gold } }} />}
            <TextField multiline rows={3} fullWidth label={tx('ai.objective', 'Redesign objective')} value={scopeDescription} onChange={(e) => setScopeDescription(e.target.value)} sx={{ mb: 3 }} />
            <TextField multiline rows={2} fullWidth label={tx('ai.constraints', 'Must keep / must avoid')} value={keepConstraints} onChange={(e) => setKeepConstraints(e.target.value)} sx={{ mb: 3 }} />
            <TextField multiline rows={2} fullWidth label={tx('ai.current_condition', 'Existing condition')} value={existingCondition} onChange={(e) => setExistingCondition(e.target.value)} sx={{ mb: 3 }} />
            <TextField multiline rows={2} fullWidth label={tx('ai.required_work', 'Required design work')} value={requiredWork} onChange={(e) => setRequiredWork(e.target.value)} />
          </Paper>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Stack spacing={4}>
            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}><Home color={binThemeTokens.gold} /> {tx('ai.select_asset', '2. Select Asset')}</Typography>
              <TextField select fullWidth label={tx('ai.property_node', 'Property Node')} value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} sx={{ mb: 3 }}>
                {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                {!properties.length && <MenuItem value="">{tx('ai.no_property', 'No linked property yet')}</MenuItem>}
              </TextField>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}><TextField select fullWidth label={tx('ai.zone', 'Redesign Zone')} value={scope.zoneType} onChange={(e) => setScope({ ...scope, zoneType: e.target.value })}>{DESIGN_ZONES.map(z => <MenuItem key={z} value={z}>{z.toUpperCase()}</MenuItem>)}</TextField></Grid>
                <Grid item xs={12} md={6}><TextField select fullWidth label={tx('ai.style', 'Design Style')} value={designStyle} onChange={(e) => setDesignStyle(e.target.value)}>{['Modern', 'Luxury', 'Minimalist', 'Traditional Majlis', 'Industrial'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}</TextField></Grid>
                <Grid item xs={6}><TextField fullWidth label={tx('field.unit', 'Unit #')} value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} /></Grid>
                <Grid item xs={6}><TextField fullWidth label={tx('field.floor', 'Floor')} value={floorLevel} onChange={(e) => setFloorLevel(e.target.value)} /></Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}><Ruler color={binThemeTokens.gold} /> {tx('ai.dimensions_budget', '3. Dimensions & Budget')}</Typography>
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>{tx('ai.area', 'Area')}: {scope.dimensions} SQ FT</Typography>
              <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, v) => setScope({ ...scope, dimensions: v as number })} sx={{ color: binThemeTokens.gold, mb: 3 }} />
              <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 900 }}>{tx('ai.furniture_budget', 'Furniture budget')}: AED {scope.furnitureBudget.toLocaleString()}</Typography>
              <Slider value={scope.furnitureBudget} min={0} max={500000} step={5000} onChange={(_, v) => setScope({ ...scope, furnitureBudget: v as number })} sx={{ color: binThemeTokens.gold, mb: 2 }} />
              <Stack spacing={1}><FormControlLabel control={<Checkbox checked={scope.hasMEP} onChange={(e) => setScope({ ...scope, hasMEP: e.target.checked })} />} label={tx('ai.mep_changes', 'MEP changes')} /><FormControlLabel control={<Checkbox checked={scope.hasStructural} onChange={(e) => setScope({ ...scope, hasStructural: e.target.checked })} />} label={tx('ai.structural_changes', 'Structural changes')} /><FormControlLabel control={<Checkbox checked={scope.isNightWork} onChange={(e) => setScope({ ...scope, isNightWork: e.target.checked })} />} label={tx('ai.night_work', 'Night-shift execution')} /></Stack>
            </Paper>

            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22,22,24,0.72)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}><ImageIcon color={binThemeTokens.gold} /> {tx('ai.design_outputs', '4. Design Outputs')}</Typography>
              <Grid container spacing={1.5}>{DESIGN_SCOPE_OPTIONS.map(option => <Grid item xs={12} key={option.id}><Paper onClick={() => toggleDesignOption(option.id)} sx={{ p: 2, cursor: 'pointer', bgcolor: scope.addons.includes(option.id) ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.025)', border: `1px solid ${scope.addons.includes(option.id) ? binThemeTokens.gold : 'rgba(255,255,255,0.06)'}`, borderRadius: 2 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={scope.addons.includes(option.id) ? 950 : 500}>{option.label}</Typography><Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{tx('ai.included', 'Included')}</Typography></Stack></Paper></Grid>)}</Grid>
            </Paper>
          </Stack>
        </Grid>

        <Grid item xs={12} lg={3}>
          <Stack spacing={4}>
            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
              <Sparkles size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
              <Typography variant="h5" fontWeight="950" sx={{ mb: 2 }}>{tx('ai.generate_concept', 'GENERATE CONCEPT')}</Typography>
              <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', mb: 4 }}>{tx('ai.generate_desc', 'Generate a design concept from photos, budget, style and scope. Maintenance add-ons are handled in owner onboarding.')}</Typography>
              <Button variant="contained" fullWidth size="large" onClick={handleInitializeStudio} disabled={submitting} endIcon={submitting ? <CircularProgress size={20} /> : <ArrowRight />} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>{tx('ai.initialize_studio', 'INITIALIZE STUDIO')}</Button>
            </Paper>
            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}><Typography variant="subtitle2" fontWeight="950" sx={{ color: '#10b981', mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}><ShieldCheck size={18} /> {tx('ai.protected', 'INSTITUTIONAL PROTECTED')}</Typography><Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.52)' }}>{tx('ai.protected_desc', 'Concepts are checked against BIN Group technical standards before execution quotation.')}</Typography></Paper>
          </Stack>
        </Grid>
      </Grid>

      <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}><Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>{snackbar.message}</Alert></Snackbar>
    </Container>
  );
}

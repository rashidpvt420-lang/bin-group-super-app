import React, { useState, useEffect } from 'react';
import { 
    Container, Typography, Box, Paper, Grid, Stack, Button, 
    TextField, MenuItem, FormControlLabel, Checkbox, Slider,
    Divider, alpha, CircularProgress, Chip, IconButton,
    Snackbar, Alert
} from '@mui/material';
import { 
    Sparkles, ArrowRight, Camera, Ruler, ShieldCheck, 
    Home, Image as ImageIcon, X, AlertTriangle, RefreshCcw, Info
} from 'lucide-react';
import { auth, db, collection, addDoc, serverTimestamp, getDocs, query, where, storage, ref, uploadBytesResumable, getDownloadURL } from '../lib/firebase';
import { useRole } from '../context/RoleContext';
import { useLanguage } from '../context/LanguageContext';
import { binThemeTokens } from '../theme/binGroupTheme';
import { useNavigate } from 'react-router-dom';
import { 
    DESIGN_ZONES, ADDON_SERVICES, calculateDesignStudioQuote
} from '../utils/DesignStudioPricingEngine';
import type { DesignScope } from '../utils/DesignStudioPricingEngine';
import { NotificationEvents } from '../lib/notificationService';
import { logAuditAction } from '../utils/auditLogger';
import { LinearProgress } from '@mui/material';

const TENANT_ALLOWED_DESIGN_ADDONS: string[] = [];
const isOwnerSideRole = (role?: string | null) => ['owner', 'admin', 'ceo', 'super_admin', 'manager'].includes(String(role || '').toLowerCase());

export default function DesignStudioPage() {
    const { user, role } = useRole();
    const { t, tx } = useLanguage();
    const navigate = useNavigate();
    const tenantMode = String(role || '').toLowerCase() === 'tenant';
    const visibleAddonServices = tenantMode
        ? ADDON_SERVICES.filter((addon) => TENANT_ALLOWED_DESIGN_ADDONS.includes(addon.id))
        : ADDON_SERVICES;
    
    const [properties, setProperties] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success'|'error' });

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
        addons: []
    });

    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [designStyle, setDesignStyle] = useState('Modern');
    const [unitNumber, setUnitNumber] = useState('');
    const [floorLevel, setFloorLevel] = useState('');
    const [existingCondition, setExistingCondition] = useState('');
    const [requiredWork, setRequiredWork] = useState('');
    const [adminNotes, setAdminNotes] = useState('');
    const [staffInstructions, setStaffInstructions] = useState('');

    useEffect(() => {
        const fetchProperties = async () => {
            if (!user) return;
            try {
                const q = query(collection(db, 'properties'), where(role === 'tenant' ? 'tenantId' : 'ownerId', '==', user.uid));
                const snap = await getDocs(q);
                const props = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setProperties(props);
                if (props.length > 0) setSelectedPropertyId(props[0].id);
            } catch (err) {
                console.error("Failed to fetch properties for Design Studio:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchProperties();
    }, [user, role]);

    useEffect(() => {
        if (!tenantMode) return;
        setScope((prev) => ({
            ...prev,
            addons: prev.addons.filter((id) => TENANT_ALLOWED_DESIGN_ADDONS.includes(id)),
            hasMEP: false,
            hasStructural: false,
            isNightWork: false,
        }));
    }, [tenantMode]);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setUploadError(null);
        
        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
            setUploadError("Please sign in before uploading design images.");
            return;
        }

        const maxFileSize = 10 * 1024 * 1024;
        const invalidFile = Array.from(files).find((file) => !file.type.startsWith('image/') || file.size > maxFileSize);
        if (invalidFile) {
            setUploadError("Upload images only, up to 10 MB each. Choose a smaller photo or a supported image file.");
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
                    const uploadTask = uploadBytesResumable(storageRef, file, {
                        contentType: file.type || 'image/jpeg',
                        customMetadata: {
                            uploadedBy: currentUser.uid,
                            feature: 'design_studio',
                            role: String(role || 'user'),
                        },
                    });
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(progress);
                        },
                        (error) => reject(error),
                        async () => {
                            try {
                                const url = await getDownloadURL(uploadTask.snapshot.ref);
                                uploadedUrls.push(url);
                                resolve();
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });
            }
            setReferenceImages(uploadedUrls);
            setUploadProgress(0);
            setSnackbar({ open: true, message: "Image uploaded successfully. Preview is ready.", severity: 'success' });
            
            await logAuditAction({
                actorId: currentUser.uid,
                actorRole: role || 'user',
                action: 'DOCUMENT_UPLOAD',
                targetType: 'design_studio_reference',
                targetId: currentUser.uid,
                metadata: { fileCount: files.length, totalImages: uploadedUrls.length }
            });
        } catch (err) {
            console.error("Upload failure:", err);
            const code = (err as any)?.code || '';
            setUploadError(
                code.includes('unauthorized') || code.includes('storage/unauthorized')
                    ? "Image upload is not allowed for this account yet. Please refresh, sign in again, and retry."
                    : "Image upload failed. Please retry or choose another image."
            );
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const removeImage = (url: string) => {
        setReferenceImages(prev => prev.filter(i => i !== url));
    };

    const handleAddonToggle = (id: string) => {
        if (tenantMode && !TENANT_ALLOWED_DESIGN_ADDONS.includes(id)) return;
        setScope(prev => ({
            ...prev,
            addons: prev.addons.includes(id) 
                ? prev.addons.filter(a => a !== id) 
                : [...prev.addons, id]
        }));
    };

    const handleInitializeStudio = async () => {
        setSubmitting(true);
        try {
            const property = properties.find(p => p.id === selectedPropertyId);
            const safeScope = tenantMode
                ? { ...scope, addons: [], hasMEP: false, hasStructural: false, isNightWork: false }
                : scope;
            const quote = calculateDesignStudioQuote(safeScope);
            
            const requestData = {
                userId: user?.uid,
                role: role,
                propertyId: selectedPropertyId,
                propertyName: property?.name || property?.propertyName || 'Selected Property',
                ownerId: property?.ownerId || 'SYSTEM',
                scope: {
                    ...safeScope,
                    scopeDescription,
                    keepConstraints,
                    referenceImages,
                    unitNumber,
                    floorLevel,
                    existingCondition,
                    requiredWork
                },
                metadata: {
                    adminNotes: isOwnerSideRole(role) ? adminNotes : '',
                    staffInstructions: isOwnerSideRole(role) ? staffInstructions : '',
                    tenantMode
                },
                designStyle,
                quote,
                status: role === 'tenant' ? 'PENDING_OWNER_NOC' : 'AI_CONCEPT_READY',
                createdAt: serverTimestamp(),
                source: 'AI_DESIGN_STUDIO_V2_PHOTO'
            };

            const docRef = await addDoc(collection(db, 'design_requests'), requestData);
            
            if (role === 'tenant' && property?.ownerId) {
                await NotificationEvents.OWNER.DESIGN_STUDIO_NOC(
                    property.ownerId, 
                    user?.displayName || 'Your Tenant', 
                    scope.zoneType
                );
            }

            await logAuditAction({
                actorId: user?.uid || 'ANONYMOUS',
                actorRole: role || 'user',
                action: 'DESIGN_REQUEST_SUBMITTED',
                targetType: 'design_requests',
                targetId: docRef.id,
                metadata: { 
                    propertyId: selectedPropertyId, 
                    zoneType: scope.zoneType,
                    style: designStyle,
                    imageCount: referenceImages.length,
                    tenantMode
                }
            });

            navigate(`/design-studio/request/${docRef.id}`);
        } catch (err) {
            console.error("Design Studio Fault:", err);
            setSnackbar({ open: true, message: "Sovereign AI Engine timeout. Please check your data connectivity or retry.", severity: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Box sx={{ height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CircularProgress sx={{ color: binThemeTokens.gold }} /></Box>;

    return (
        <Container maxWidth="xl" sx={{ py: 6 }}>
            <Box sx={{ mb: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>
                        SOVEREIGN CREATIVE ENGINE
                    </Typography>
                    <Typography variant="h3" fontWeight="950" color="#FFF">
                        AI Design <Box component="span" sx={{ color: binThemeTokens.gold }}>Studio</Box>
                    </Typography>
                </Box>
                <Chip icon={<Sparkles size={16} />} label="FREE AI CONCEPTS" sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
            </Box>

            {uploadError && (
                <Alert 
                    severity="error" 
                    icon={<AlertTriangle />}
                    sx={{ mb: 4, bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)', '& .MuiAlert-message': { width: '100%' } }}
                    action={
                        <Stack direction="row" spacing={2}>
                            <Button size="small" color="inherit" onClick={() => setUploadError(null)} startIcon={<RefreshCcw size={14}/>}>RETRY</Button>
                            <Button size="small" color="inherit" component="label">
                                CHANGE IMAGE
                                <input type="file" hidden accept="image/*" capture="environment" onChange={handleImageUpload} />
                            </Button>
                        </Stack>
                    }
                >
                    {uploadError}
                </Alert>
            )}

            <Grid container spacing={6}>
                <Grid item xs={12} lg={4}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Camera color={binThemeTokens.gold} /> 1. VISUAL CONTEXT
                            </Typography>
                            
                            <Box sx={{ mb: 3 }}>
                                <Stack direction="row" spacing={2} sx={{ mb: 2, overflowX: 'auto', pb: 1 }}>
                                    {referenceImages.map((url, idx) => (
                                        <Box key={idx} sx={{ position: 'relative', flexShrink: 0 }}>
                                            <img src={url} alt="Reference" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: `1px solid ${binThemeTokens.gold}` }} />
                                            <IconButton 
                                                size="small" 
                                                onClick={() => removeImage(url)}
                                                sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#ef4444', color: '#FFF', '&:hover': { bgcolor: '#dc2626' }, padding: 0.2 }}
                                            >
                                                <X size={12} />
                                            </IconButton>
                                        </Box>
                                    ))}
                                    {!uploading && (
                                        <Button
                                            component="label"
                                            sx={{ 
                                                width: 80, height: 80, flexShrink: 0, 
                                                border: '1px dashed rgba(255,255,255,0.2)', 
                                                borderRadius: 2, display: 'flex', flexDirection: 'column',
                                                color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.02)',
                                                '&:hover': { bgcolor: 'rgba(255,255,255,0.05)', borderColor: binThemeTokens.gold }
                                            }}
                                        >
                                            <Camera size={24} />
                                            <Typography variant="caption" sx={{ mt: 0.5, fontWeight: 900 }}>ADD</Typography>
                                            <input type="file" hidden accept="image/*" capture="environment" multiple onChange={handleImageUpload} />
                                        </Button>
                                    )}
                                    {uploading && (
                                        <Box sx={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                            <CircularProgress size={24} sx={{ color: binThemeTokens.gold }} />
                                        </Box>
                                    )}
                                </Stack>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', display: 'block', mb: 1 }}>
                                    Accepted: JPG, PNG, HEIC/Web images. Max 10 MB per image.
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

                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Home color={binThemeTokens.gold} /> 2. SELECT ASSET
                            </Typography>
                            <TextField select fullWidth label="Property Node" value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} sx={{ mb: 3 }}>
                                {properties.map(p => <MenuItem key={p.id} value={p.id}>{p.name || p.propertyName}</MenuItem>)}
                            </TextField>

                            <TextField select fullWidth label="Redesign Zone" value={scope.zoneType} onChange={(e) => setScope({...scope, zoneType: e.target.value})} sx={{ mb: 3 }}>
                                {DESIGN_ZONES.map(z => <MenuItem key={z} value={z}>{z.toUpperCase()}</MenuItem>)}
                            </TextField>

                            <TextField select fullWidth label="Design Style" value={designStyle} onChange={(e) => setDesignStyle(e.target.value)} sx={{ mb: 3 }}>
                                <MenuItem value="Modern">MODERN</MenuItem>
                                <MenuItem value="Luxury">LUXURY</MenuItem>
                                <MenuItem value="Minimalist">MINIMALIST</MenuItem>
                                <MenuItem value="Traditional Majlis">TRADITIONAL MAJLIS</MenuItem>
                                <MenuItem value="Industrial">INDUSTRIAL</MenuItem>
                            </TextField>

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="Unit #" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField fullWidth label="Floor" value={floorLevel} onChange={(e) => setFloorLevel(e.target.value)} />
                                </Grid>
                            </Grid>
                        </Paper>
                    </Stack>
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Stack spacing={4} sx={{ height: '100%' }}>
                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Ruler color={binThemeTokens.gold} /> 3. DIMENSIONS & BUDGET
                            </Typography>
                            
                            <Box sx={{ mb: 4 }}>
                                <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>AREA: {scope.dimensions} SQ FT</Typography>
                                <Slider value={scope.dimensions} min={10} max={5000} onChange={(_, v) => setScope({...scope, dimensions: v as number})} sx={{ color: binThemeTokens.gold }} />
                            </Box>

                            {!tenantMode && (
                                <Box sx={{ mb: 4 }}>
                                    <Typography variant="caption" color="textSecondary" sx={{ mb: 1, display: 'block', fontWeight: 900 }}>FURNITURE BUDGET: AED {scope.furnitureBudget.toLocaleString()}</Typography>
                                    <Slider value={scope.furnitureBudget} min={0} max={500000} step={5000} onChange={(_, v) => setScope({...scope, furnitureBudget: v as number})} sx={{ color: binThemeTokens.gold }} />
                                </Box>
                            )}

                            {!tenantMode && (
                                <Stack spacing={1}>
                                    <FormControlLabel control={<Checkbox checked={scope.hasMEP} onChange={(e) => setScope({...scope, hasMEP: e.target.checked})} />} label="MEP Changes (Electrical/Plumbing)" />
                                    <FormControlLabel control={<Checkbox checked={scope.hasStructural} onChange={(e) => setScope({...scope, hasStructural: e.target.checked})} />} label="Structural Changes (Walls/Partitions)" />
                                    <FormControlLabel control={<Checkbox checked={scope.isNightWork} onChange={(e) => setScope({...scope, isNightWork: e.target.checked})} />} label="Night-shift Execution" />
                                </Stack>
                            )}

                            {tenantMode && (
                                <Alert severity="info" icon={<Info />} sx={{ mt: 2, bgcolor: 'rgba(59,130,246,0.08)', color: '#bfdbfe', border: '1px solid rgba(59,130,246,0.25)' }}>
                                    Tenant requests are submitted as owner NOC design concepts. Paid execution add-ons are hidden until owner approval.
                                </Alert>
                            )}
                        </Paper>

                        {!tenantMode && (
                            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', flexGrow: 1 }}>
                                <Typography variant="h6" fontWeight="950" sx={{ color: '#FFF', mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                                    <ImageIcon color={binThemeTokens.gold} /> 4. SELECT ADD-ON SERVICES
                                </Typography>
                                <Grid container spacing={1}>
                                    {visibleAddonServices.map(addon => (
                                        <Grid item xs={12} key={addon.id}>
                                            <Paper onClick={() => handleAddonToggle(addon.id)} sx={{ p: 2, cursor: 'pointer', bgcolor: scope.addons.includes(addon.id) ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)', border: `1px solid ${scope.addons.includes(addon.id) ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`, borderRadius: 2, transition: 'all 0.2s ease' }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                                    <Typography variant="body2" fontWeight={scope.addons.includes(addon.id) ? 900 : 400}>{addon.label}</Typography>
                                                    <Typography variant="caption" sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>+AED {addon.price.toLocaleString()}</Typography>
                                                </Stack>
                                            </Paper>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Paper>
                        )}
                    </Stack>
                </Grid>

                <Grid item xs={12} lg={3}>
                    <Stack spacing={4}>
                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: '#0B0B0C', border: `2px solid ${binThemeTokens.gold}`, textAlign: 'center' }}>
                            <Sparkles size={48} color={binThemeTokens.gold} style={{ margin: '0 auto 24px' }} />
                            <Typography variant="h5" fontWeight="950" sx={{ mb: 2 }}>GENERATE CONCEPT</Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mb: 4 }}>
                                Our Sovereign AI will synthesize your requirements and generate a free conceptual layout and scope-locked execution quote.
                            </Typography>
                            <Button variant="contained" fullWidth size="large" onClick={handleInitializeStudio} disabled={submitting || !selectedPropertyId} endIcon={submitting ? <CircularProgress size={20} /> : <ArrowRight />} sx={{ py: 2, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, borderRadius: 2 }}>
                                INITIALIZE STUDIO
                            </Button>
                        </Paper>

                        <Paper sx={{ p: 4, borderRadius: 4, bgcolor: alpha('#10b981', 0.05), border: '1px solid #10b981' }}>
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

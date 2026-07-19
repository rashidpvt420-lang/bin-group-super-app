import React, { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Container,
    Grid,
    IconButton,
    Paper,
    Slider,
    Stack,
    TextField,
    Typography,
    alpha,
    Autocomplete,
} from '@mui/material';
import {
    AlertCircle,
    Download,
    Image as ImageIcon,
    RefreshCw,
    Sparkles,
    UploadCloud,
    Wand2,
} from 'lucide-react';
import { auth, functions, getDownloadURL, httpsCallable, ref, storage, uploadBytes } from '../../lib/firebase';
import { binThemeTokens } from '../../theme/adminTheme';

const THEMES = [
    'Sovereign Elite (Gold & Graphite)',
    'Neo-Classic Majlis',
    'Modern Minimalist',
    'Corporate Executive',
    'Ultra-Luxury Hospitality',
    'Futuristic / Sci-Fi',
    'Traditional Emirati',
    'Industrial Chic',
    'Biophilic Design',
];

const ROOM_TYPES = [
    'Government Majlis',
    'Executive Office',
    'Lobby / Reception',
    'Master Suite',
    'Exterior Facade',
    'Conference Room',
    'Luxury Villa Living Area',
    'Retail Showroom',
    'Data Center Control Room',
    'Hospitality Suite',
    'Staff Accommodation',
    'Warehouse / Industrial',
];

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const value = String(reader.result || '');
            resolve(value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, ''));
        };
        reader.onerror = reject;
    });
}

export default function DesignStudioAdminPage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [roomType, setRoomType] = useState('Executive Office');
    const [theme, setTheme] = useState('Sovereign Elite (Gold & Graphite)');
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [sliderPos, setSliderPos] = useState(50);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<string>('READY');
    const [provider, setProvider] = useState<string>('waiting');

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selected = event.target.files?.[0];
        if (!selected) return;
        if (!selected.type.startsWith('image/')) {
            setError('Upload an image file only.');
            return;
        }
        if (selected.size > 50 * 1024 * 1024) {
            setError('Image is too large. Maximum supported size is 50MB.');
            return;
        }
        setError(null);
        setFile(selected);
        setPreview(URL.createObjectURL(selected));
        setGeneratedImage(null);
        setStatus('REFERENCE_LOADED');
        setProvider('waiting');
    };

    const handleGenerate = async () => {
        if (!file) {
            setError('Please upload a reference image first.');
            return;
        }

        setIsGenerating(true);
        setError(null);
        setStatus('GENERATING');

        try {
            let originalImageUrl = '';
            try {
                const storageRef = ref(storage, `design_requests/${auth.currentUser?.uid || 'admin'}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file, { contentType: file.type || 'image/jpeg' });
                originalImageUrl = await getDownloadURL(storageRef);
            } catch (uploadError) {
                console.warn('[AI Design Studio] Reference upload skipped, continuing with callable payload.', uploadError);
            }

            const imageBase64 = await fileToBase64(file);
            const generateDesignConcept = httpsCallable(functions, 'generateDesignConcept');
            const result: any = await generateDesignConcept({
                requestId: `admin_design_${Date.now()}`,
                scope: { zoneType: roomType, propertyType: 'Custom' },
                zoneType: roomType,
                designStyle: theme,
                customPrompt: prompt,
                notes: prompt,
                imageBase64,
                imageUrl: originalImageUrl,
                mimeType: file.type || 'image/jpeg',
            });

            const data = result.data || {};
            if (data.status !== 'SUCCESS' || !data.generatedImage) {
                throw new Error(data.error || 'AI Design Studio returned no image payload.');
            }

            const mimeType = data.mimeType || 'image/png';
            setGeneratedImage(`data:${mimeType};base64,${data.generatedImage}`);
            setProvider(data.live === true ? String(data.provider || 'live-ai') : 'fallback');
            setStatus(data.renderStatus || (data.live ? 'AI_RENDER_COMPLETE' : 'AI_RENDER_PENDING'));
            setSliderPos(50);

            if (data.live !== true) {
                setError(data.concept?.renderError || 'AI image provider is not configured yet. Showing safe fallback preview.');
            }
        } catch (caught: any) {
            console.error('[AI Design Studio] generation failed:', caught);
            setError(caught?.message || 'Failed to generate design. Check Functions secrets, App Check, and deployment status.');
            setStatus('FAILED');
        } finally {
            setIsGenerating(false);
        }
    };

    const downloadGeneratedImage = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        link.href = generatedImage;
        link.download = `bin-ai-design-${Date.now()}.png`;
        link.click();
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', pt: 4, pb: 10 }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                    <Box>
                        <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: -1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Sparkles size={28} /> AI DESIGN STUDIO
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                            Live Firebase callable render engine for BIN GROUP design concepts
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={status} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
                        <Chip label={provider.toUpperCase()} sx={{ bgcolor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.7)', fontWeight: 900 }} />
                    </Stack>
                </Box>

                {error && (
                    <Alert severity={status === 'AI_RENDER_COMPLETE' ? 'warning' : 'error'} icon={<AlertCircle size={20} />} sx={{ mb: 4, bgcolor: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                        {error}
                    </Alert>
                )}

                <Grid container spacing={4}>
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Stack spacing={4}>
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>REFERENCE IMAGE</Typography>
                                    <input accept="image/*" style={{ display: 'none' }} id="ai-design-reference-file" type="file" onChange={handleFileChange} />
                                    <label htmlFor="ai-design-reference-file">
                                        <Box sx={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: 4, p: 4, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', '&:hover': { bgcolor: 'rgba(255,255,255,0.02)', borderColor: binThemeTokens.gold } }}>
                                            <UploadCloud size={48} color={binThemeTokens.gold} style={{ marginBottom: 16, opacity: 0.8 }} />
                                            <Typography variant="subtitle1" fontWeight="900" color="#fff">{file ? file.name : 'Upload Space Reference'}</Typography>
                                            <Typography variant="caption" color="rgba(255,255,255,0.5)">JPG/PNG/WebP up to 50MB</Typography>
                                        </Box>
                                    </label>
                                </Box>

                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>CONFIGURATION</Typography>
                                    <Stack spacing={3}>
                                        <Autocomplete freeSolo options={ROOM_TYPES} value={roomType} onChange={(_, newValue) => setRoomType(newValue || '')} onInputChange={(_, newValue) => setRoomType(newValue)} renderInput={(params) => <TextField {...params} label="Space / Property Type" InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }} sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } } }} />} />
                                        <Autocomplete freeSolo options={THEMES} value={theme} onChange={(_, newValue) => setTheme(newValue || '')} onInputChange={(_, newValue) => setTheme(newValue)} renderInput={(params) => <TextField {...params} label="Architectural Theme" InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }} sx={{ '& .MuiOutlinedInput-root': { color: '#fff', '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } } }} />} />
                                        <TextField label="Custom Directives" multiline rows={3} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Example: add chandelier, marble flooring, warm premium lighting..." InputProps={{ sx: { color: '#fff' } }} InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }} sx={{ '& .MuiOutlinedInput-root': { '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' }, '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold } } }} />
                                    </Stack>
                                </Box>

                                <Button variant="contained" size="large" onClick={handleGenerate} disabled={!file || isGenerating} startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <Wand2 />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, py: 2, borderRadius: 3, '&:hover': { bgcolor: '#FFF' }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}>
                                    {isGenerating ? 'GENERATING RENDER...' : 'GENERATE DESIGN'}
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} md={8}>
                        <Paper sx={{ p: 2, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%', minHeight: 600, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                            {!preview && !generatedImage ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.3 }}>
                                    <ImageIcon size={80} style={{ marginBottom: 24 }} />
                                    <Typography variant="h6" fontWeight="900">NO IMAGE LOADED</Typography>
                                    <Typography variant="body2">Upload a reference image to begin.</Typography>
                                </Box>
                            ) : (
                                <Box sx={{ position: 'relative', flex: 1, borderRadius: 4, overflow: 'hidden', bgcolor: '#000' }}>
                                    {preview && <img src={preview} alt="Original room" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }} />}
                                    {generatedImage && (
                                        <Box sx={{ position: 'absolute', inset: 0, clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` }}>
                                            <img src={generatedImage} alt="Generated design" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </Box>
                                    )}
                                    {generatedImage && (
                                        <>
                                            <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`, width: 4, bgcolor: binThemeTokens.gold, transform: 'translateX(-50%)', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }} />
                                            <Slider value={sliderPos} onChange={(_, value) => setSliderPos(value as number)} min={0} max={100} sx={{ position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)', opacity: 0, '& .MuiSlider-thumb': { width: 40, height: 40 } }} />
                                            <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1 }}>
                                                <IconButton onClick={handleGenerate} sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', '&:hover': { bgcolor: binThemeTokens.gold, color: '#000' } }}><RefreshCw size={20} /></IconButton>
                                                <IconButton onClick={downloadGeneratedImage} sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', '&:hover': { bgcolor: binThemeTokens.gold, color: '#000' } }}><Download size={20} /></IconButton>
                                            </Box>
                                        </>
                                    )}
                                    <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 2 }}>
                                        {generatedImage && <Chip label="AI DESIGN" sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />}
                                        {preview && <Chip label="ORIGINAL" sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', fontWeight: 900, backdropFilter: 'blur(4px)' }} />}
                                    </Box>
                                </Box>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}

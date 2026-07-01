import React, { useState } from 'react';
import { 
    Box, Container, Typography, Grid, Paper, Button, TextField, 
    CircularProgress, Stack, Alert, IconButton, Slider, Chip, Autocomplete, alpha 
} from '@mui/material';
import { 
    UploadCloud, Wand2, Image as ImageIcon, Download, 
    RefreshCw, Sparkles, AlertCircle 
} from 'lucide-react';

// ----------------------------------------------------------------------
// 🛡️ PRODUCTION SOVEREIGN IMPORTS
// ----------------------------------------------------------------------
import { auth, db, storage, functions, httpsCallable } from '../../lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { binThemeTokens } from '../../theme/adminTheme';
import { useLanguage } from '@bin/shared';

const THEMES = [
    "Sovereign Elite (Gold & Graphite)",
    "Neo-Classic Majlis",
    "Modern Minimalist",
    "Corporate Executive",
    "Ultra-Luxury Hospitality",
    "Futuristic / Sci-Fi",
    "Traditional Emirati",
    "Industrial Chic",
    "Biophilic Design"
];

const ROOM_TYPES = [
    "Government Majlis",
    "Executive Office",
    "Lobby / Reception",
    "Master Suite",
    "Exterior Facade",
    "Conference Room",
    "Luxury Villa Living Area",
    "Retail Showroom",
    "Data Center Control Room",
    "Hospitality Suite",
    "Staff Accommodation",
    "Warehouse / Industrial"
];

export default function DesignStudioAdminPage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    
    // Free-form selections
    const [roomType, setRoomType] = useState<string>("Executive Office");
    const [theme, setTheme] = useState<string>("Sovereign Elite (Gold & Graphite)");
    const [prompt, setPrompt] = useState("");
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedImageBase64, setGeneratedImageBase64] = useState<string | null>(null);
    const [sliderPos, setSliderPos] = useState(50);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setPreview(URL.createObjectURL(selected));
            setGeneratedImageBase64(null); // Reset output when new image is uploaded
        }
    };

    const convertFileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                let encoded = reader.result?.toString().replace(/^data:(.*,)?/, '') || '';
                if ((encoded.length % 4) > 0) {
                    encoded += '='.repeat(4 - (encoded.length % 4));
                }
                resolve(encoded);
            };
            reader.onerror = error => reject(error);
        });
    };

    const handleGenerate = async () => {
        if (!file) {
            setError(t('admin.design_studio.error_upload_required'));
            return;
        }

        setIsGenerating(true);
        setError(null);

        try {
            // 1. Firebase Storage Upload (Aligning with storage.rules)
            let downloadUrl = "";
            try {
                const storageRef = ref(storage, `design_requests/${auth.currentUser?.uid || 'guest'}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                downloadUrl = await getDownloadURL(storageRef);
            } catch (err) {
                console.warn("Firebase upload skipped/failed. Proceeding to AI generation.", err);
            }

            // 2. Secure Backend AI Call
            const base64Data = await convertFileToBase64(file);
            const generateDesignConcept = httpsCallable(functions, 'generateDesignConcept');
            
            const result: any = await generateDesignConcept({
                requestId: "admin-manual",
                scope: { zoneType: roomType, propertyType: "Custom" },
                designStyle: theme,
                imageBase64: base64Data,
                mimeType: file.type || "image/jpeg"
            });

            if (result.data.status !== "SUCCESS") {
                throw new Error("Sovereign AI synthesis faulty.");
            }

            const genBase64 = result.data.generatedImage;

            if (!genBase64) {
                throw new Error("No image data returned from Sovereign AI.");
            }

            const generatedUrl = `data:image/jpeg;base64,${genBase64}`;
            setGeneratedImageBase64(generatedUrl);
            setSliderPos(50); 

            // 3. Log to Registry
            await addDoc(collection(db, 'design_requests'), {
                userId: auth.currentUser?.uid || 'admin-manual',
                originalImage: downloadUrl,
                roomType,
                theme,
                customPrompt: prompt,
                conceptMetadata: result.data.concept,
                createdAt: serverTimestamp(),
                status: 'AI_CONCEPT_READY',
                type: 'IMAGE_TO_IMAGE'
            });

        } catch (err: any) {
            console.error(err);
            setError(err.message || t('admin.design_studio.error_generate_failed'));
        } finally {
            setIsGenerating(false);
        }
    };

    const { t, isRTL } = useLanguage();
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#020617', pt: 4, pb: 10, direction: isRTL ? 'rtl' : 'ltr' }}>
            <Container maxWidth="xl">
                <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h4" fontWeight="950" sx={{ color: binThemeTokens.gold, letterSpacing: -1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Sparkles size={28} /> {t('admin.design_studio.page_title')}
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                            {t('admin.design_studio.page_subtitle')}
                        </Typography>
                    </Box>
                    <Chip label={t('admin.design_studio.status_chip')} sx={{ bgcolor: alpha(binThemeTokens.gold, 0.1), color: binThemeTokens.gold, fontWeight: 900 }} />
                </Box>

                {error && (
                    <Alert 
                        severity="error" 
                        icon={<AlertCircle size={20} />}
                        sx={{ mb: 4, bgcolor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                    >
                        {error}
                    </Alert>
                )}

                <Grid container spacing={4}>
                    {/* Left Panel: Configuration */}
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Stack spacing={4}>
                                
                                {/* Image Upload Zone */}
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>{t('admin.design_studio.reference_image_label')}</Typography>
                                    <input
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        id="raised-button-file"
                                        type="file"
                                        onChange={handleFileChange}
                                    />
                                    <label htmlFor="raised-button-file">
                                        <Box sx={{ 
                                            border: '2px dashed rgba(255,255,255,0.1)', 
                                            borderRadius: 4, 
                                            p: 4, 
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            '&:hover': { bgcolor: 'rgba(255,255,255,0.02)', borderColor: binThemeTokens.gold }
                                        }}>
                                            <UploadCloud size={48} color={binThemeTokens.gold} style={{ marginBottom: 16, opacity: 0.8 }} />
                                            <Typography variant="subtitle1" fontWeight="900" color="#fff">
                                                {file ? file.name : t('admin.design_studio.upload_btn')}
                                            </Typography>
                                            <Typography variant="caption" color="rgba(255,255,255,0.5)">
                                                {t('admin.design_studio.upload_hint')}
                                            </Typography>
                                        </Box>
                                    </label>
                                </Box>

                                {/* Dropdowns (Free-form Autocomplete) */}
                                <Box>
                                    <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>{t('admin.design_studio.configuration_label')}</Typography>
                                    <Stack spacing={3}>
                                        <Autocomplete
                                            freeSolo
                                            options={ROOM_TYPES}
                                            value={roomType}
                                            onChange={(_, newValue) => setRoomType(newValue || "")}
                                            onInputChange={(_, newInputValue) => setRoomType(newInputValue)}
                                            renderInput={(params) => (
                                                <TextField 
                                                    {...params} 
                                                    label={t('admin.design_studio.room_type_label')}
                                                    variant="outlined"
                                                    placeholder={t('admin.design_studio.room_type_placeholder')}
                                                    InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                                                    sx={{ 
                                                        '& .MuiOutlinedInput-root': { 
                                                            color: '#fff',
                                                            '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                                            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                                            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold }
                                                        }
                                                    }}
                                                />
                                            )}
                                        />

                                        <Autocomplete
                                            freeSolo
                                            options={THEMES}
                                            value={theme}
                                            onChange={(_, newValue) => setTheme(newValue || "")}
                                            onInputChange={(_, newInputValue) => setTheme(newInputValue)}
                                            renderInput={(params) => (
                                                <TextField 
                                                    {...params} 
                                                    label={t('admin.design_studio.theme_label')}
                                                    variant="outlined"
                                                    placeholder={t('admin.design_studio.theme_placeholder')}
                                                    InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                                                    sx={{ 
                                                        '& .MuiOutlinedInput-root': { 
                                                            color: '#fff',
                                                            '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                                            '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                                            '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold }
                                                        }
                                                    }}
                                                />
                                            )}
                                        />

                                        <TextField
                                            label={t('admin.design_studio.custom_directives_label')}
                                            multiline rows={3}
                                            value={prompt}
                                            onChange={(e) => setPrompt(e.target.value)}
                                            placeholder={t('admin.design_studio.custom_directives_placeholder')}
                                            InputProps={{ sx: { color: '#fff' } }}
                                            InputLabelProps={{ sx: { color: 'rgba(255,255,255,0.5)' } }}
                                            sx={{ 
                                                '& .MuiOutlinedInput-root': { 
                                                    '& fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                                    '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.3)' },
                                                    '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold }
                                                }
                                            }}
                                        />
                                    </Stack>
                                </Box>

                                <Button 
                                    variant="contained" 
                                    size="large"
                                    onClick={handleGenerate}
                                    disabled={!file || isGenerating}
                                    startIcon={isGenerating ? <CircularProgress size={20} color="inherit" /> : <Wand2 />}
                                    sx={{ 
                                        bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900, py: 2, borderRadius: 3,
                                        '&:hover': { bgcolor: '#FFF' },
                                        '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' }
                                    }}
                                >
                                    {isGenerating ? t('admin.design_studio.generating_btn') : t('admin.design_studio.generate_btn')}
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>

                    {/* Right Panel: Preview Area */}
                    <Grid item xs={12} md={8}>
                        <Paper sx={{ 
                            p: 2, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', 
                            border: '1px solid rgba(255,255,255,0.05)', height: '100%', 
                            minHeight: 600, display: 'flex', flexDirection: 'column', position: 'relative'
                        }}>
                            {!preview && !generatedImageBase64 ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, opacity: 0.3 }}>
                                    <ImageIcon size={80} style={{ marginBottom: 24 }} />
                                    <Typography variant="h6" fontWeight="900">{t('admin.design_studio.no_image_title')}</Typography>
                                    <Typography variant="body2">{t('admin.design_studio.no_image_desc')}</Typography>
                                </Box>
                            ) : (
                                <Box sx={{ position: 'relative', flex: 1, borderRadius: 4, overflow: 'hidden', bgcolor: '#000' }}>
                                    
                                    {/* Original Image Layer */}
                                    {preview && (
                                        <img 
                                            src={preview} 
                                            alt="Original Room" 
                                            style={{ 
                                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                                                objectFit: 'contain' 
                                            }} 
                                        />
                                    )}

                                    {/* Generated Image Layer (Clipped by Slider) */}
                                    {generatedImageBase64 && (
                                        <div style={{ 
                                            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', 
                                            clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)` 
                                        }}>
                                            <img 
                                                src={generatedImageBase64} 
                                                alt="Generated Design" 
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                                            />
                                        </div>
                                    )}

                                    {/* Interactive Slider */}
                                    {generatedImageBase64 && (
                                        <>
                                            <div style={{
                                                position: 'absolute', top: 0, bottom: 0, left: `${sliderPos}%`, width: 4,
                                                backgroundColor: binThemeTokens.gold, cursor: 'ew-resize', transform: 'translateX(-50%)',
                                                boxShadow: '0 0 10px rgba(0,0,0,0.5)'
                                            }} />
                                            <Slider
                                                value={sliderPos}
                                                onChange={(_, val) => setSliderPos(val as number)}
                                                min={0} max={100}
                                                sx={{
                                                    position: 'absolute', top: '50%', left: 0, right: 0, transform: 'translateY(-50%)',
                                                    opacity: 0, '& .MuiSlider-thumb': { width: 40, height: 40 }
                                                }}
                                            />
                                        </>
                                    )}

                                    {/* Labels */}
                                    <Box sx={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', gap: 2 }}>
                                        {generatedImageBase64 && (
                                            <Chip label={t('admin.design_studio.new_design_chip')} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 900 }} />
                                        )}
                                        {preview && (
                                            <Chip label={t('admin.design_studio.original_chip')} sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', fontWeight: 900, backdropFilter: 'blur(4px)' }} />
                                        )}
                                    </Box>

                                    {/* Action Bar (Only shows if generated) */}
                                    {generatedImageBase64 && (
                                        <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1 }}>
                                            <IconButton sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', '&:hover': { bgcolor: binThemeTokens.gold, color: '#000' } }}>
                                                <RefreshCw size={20} />
                                            </IconButton>
                                            <IconButton sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: '#FFF', '&:hover': { bgcolor: binThemeTokens.gold, color: '#000' } }}>
                                                <Download size={20} />
                                            </IconButton>
                                        </Box>
                                    )}
                                </Box>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
}

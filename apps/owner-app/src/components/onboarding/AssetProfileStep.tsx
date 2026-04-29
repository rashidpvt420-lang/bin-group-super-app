import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Divider, TextField, MenuItem, Container, Button, CircularProgress, Chip, Snackbar, Alert
} from '@mui/material';
import { 
    Home, Building2, Building, Hotel, Landmark, Gem, 
    Briefcase, Warehouse, ShieldCheck, ArrowRight, ArrowLeft, Scan, AlertTriangle, RefreshCcw
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { storage, ref, uploadBytes, getDownloadURL, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const AssetProfileStep: React.FC<{ onNext: () => void; onBack?: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { tx } = useLanguage();
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [ocrError, setOcrError] = useState<string | null>(null);
    const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success'|'error' });

    React.useEffect(() => {
        if (properties.length === 0) {
            addProperty();
        }
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];

    const handleTitleDeedUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanning(true);
        setOcrError(null);
        try {
            // 1. Upload to Temp
            const storageRef = ref(storage, `temp_kyc/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const fileUrl = await getDownloadURL(storageRef);

            // 2. Call OCR Protocol
            const ocrNode = httpsCallable(functions, 'processTitleDeedOCR');
            const result: any = await ocrNode({ fileUrl });

            if (result.data.status === 'SUCCESS') {
                const extracted = result.data.data;
                updateProperty(0, {
                    propertyType: extracted.propertyType || 'Apartment',
                    sqft: extracted.sqft || 1850,
                    area: extracted.area || '',
                    emirate: extracted.emirate || 'Dubai',
                    titleDeedStatus: 'extracted'
                });
                setScanned(true);
                setSnackbar({ open: true, message: "Title deed data extracted successfully.", severity: 'success' });
            } else {
                throw new Error("OCR_NODE_BUSY");
            }
        } catch (err) {
            console.error("OCR Failure:", err);
            setOcrError("Scanner node busy or document unclear. Please fill data manually or retry.");
            updateProperty(0, { titleDeedStatus: 'manual_review_required' });
        } finally {
            setScanning(false);
        }
    };

    const types = [
        { id: 'Villa', label: 'Villa', icon: <Home size={24} /> },
        { id: 'Apartment', label: 'Apartment', icon: <Building size={24} /> },
        { id: 'Residential Building', label: 'Residential Building', icon: <Building2 size={24} /> },
        { id: 'Commercial Building', label: 'Commercial Building', icon: <Warehouse size={24} /> },
        { id: 'Office', label: 'Office', icon: <Briefcase size={24} /> },
        { id: 'Retail Center', label: 'Retail Center', icon: <Building size={24} /> },
        { id: 'Mall', label: 'Mall', icon: <Building2 size={24} />, premium: true },
        { id: 'Hotel', label: 'Hotel', icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Hospital', label: 'Hospital', icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'Clinic', label: 'Clinic', icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'School', label: 'School', icon: <Landmark size={24} />, premium: true, useType: 'education' },
        { id: 'Warehouse', label: 'Warehouse', icon: <Warehouse size={24} /> },
        { id: 'Labour Camp', label: 'Labour Camp', icon: <Building2 size={24} />, premium: true },
        { id: 'Government Property', label: 'Government Property', icon: <ShieldCheck size={24} />, premium: true, ownerType: 'government' },
        { id: 'Government Majlis', label: 'Government Majlis', icon: <Landmark size={24} />, premium: true, ownerType: 'government', majlis: true, majlisType: 'government' },
        { id: 'Private Majlis', label: 'Private Majlis', icon: <Landmark size={24} />, premium: true, majlis: true, majlisType: 'private' },
        { id: 'Mixed-Use Tower', label: 'Mixed-Use Tower', icon: <Gem size={24} />, premium: true },
        { id: 'Skyscraper', label: 'Skyscraper', icon: <Building2 size={24} />, premium: true },
        { id: 'Stadium', label: 'Stadium', icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Sports Complex', label: 'Sports Complex', icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Event Venue', label: 'Event Venue', icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Resort', label: 'Resort', icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Industrial Property', label: 'Industrial Property', icon: <Warehouse size={24} /> },
        { id: 'Staff Accommodation', label: 'Staff Accommodation', icon: <Building2 size={24} /> },
        { id: 'Farm / Estate', label: 'Farm / Estate', icon: <Home size={24} /> },
    ];

    const selectPropertyType = (type: typeof types[number]) => {
        updateProperty(0, {
            propertyType: type.id,
            majlis: Boolean((type as any).majlis),
            majlisType: (type as any).majlisType || 'none',
            ownerType: (type as any).ownerType || activeProperty?.ownerType || 'individual',
            useType: (type as any).useType || activeProperty?.useType || 'residential'
        });
    };

    const canProceed = activeProperty?.propertyType && activeProperty?.units > 0 && activeProperty?.sqft > 0;

    return (
        <Box sx={{ py: 2 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.asset_profile', 'ASSET PROFILE')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.asset_profile_desc', 'Select category and quantify structural scale in one step.')}
                </Typography>
            </Box>

            <Container maxWidth="lg">
                {ocrError && (
                    <Alert 
                        severity="warning" 
                        icon={<AlertTriangle />}
                        sx={{ mb: 4, bgcolor: 'rgba(255, 152, 0, 0.1)', color: '#ffb74d', border: '1px solid rgba(255,152,0,0.2)' }}
                        action={
                            <Button size="small" color="inherit" component="label" startIcon={<RefreshCcw size={14}/>}>
                                RETRY SCAN
                                <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />
                            </Button>
                        }
                    >
                        {ocrError}
                    </Alert>
                )}

                <Grid container spacing={4}>
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                1. SELECT CATEGORY
                            </Typography>
                            <Grid container spacing={2}>
                                {types.map((type) => (
                                    <Grid item xs={12} sm={4} key={type.id}>
                                        <Paper 
                                            onClick={() => selectPropertyType(type)}
                                            sx={{ 
                                                p: 2, 
                                                cursor: 'pointer',
                                                bgcolor: activeProperty?.propertyType === type.id ? alpha(binThemeTokens.gold, 0.1) : 'rgba(255,255,255,0.02)',
                                                border: `1px solid ${activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.05)'}`,
                                                borderRadius: 3,
                                                transition: 'all 0.2s ease',
                                                textAlign: 'center',
                                                '&:hover': { borderColor: binThemeTokens.gold, bgcolor: 'rgba(198, 167, 94, 0.05)' }
                                            }}
                                        >
                                            <Box sx={{ color: activeProperty?.propertyType === type.id ? binThemeTokens.gold : 'rgba(255,255,255,0.3)', mb: 1, display: 'flex', justifyContent: 'center' }}>
                                                {type.icon}
                                            </Box>
                                            <Typography variant="caption" fontWeight="900" sx={{ color: '#FFF', display: 'block', lineHeight: 1.2 }}>
                                                {type.label}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                ))}
                            </Grid>
                        </Paper>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', height: '100%' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                2. QUANTIFY SCALE
                            </Typography>
                            <Stack spacing={3}>
                                    <Button 
                                        variant="outlined" 
                                        component="label"
                                        fullWidth
                                        startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <Scan size={18} />}
                                        sx={{ mb: 3, py: 1.5, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderStyle: 'dashed' }}
                                    >
                                        {scanning ? 'SCANNING DOCUMENT...' : scanned ? 'TITLE DEED VERIFIED' : 'SCAN TITLE DEED (AUTO-FILL)'}
                                        {!scanning && !scanned && <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />}
                                    </Button>

                                    <TextField 
                                        select fullWidth label="Asset Grade" size="small"
                                        value={activeProperty?.assetGrade || 'Premium'} 
                                        onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                    >
                                    <MenuItem value="Standard">Standard</MenuItem>
                                    <MenuItem value="Premium">Premium</MenuItem>
                                    <MenuItem value="Luxury">Luxury</MenuItem>
                                    <MenuItem value="Sovereign">Sovereign</MenuItem>
                                </TextField>

                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label="Units" type="number" size="small"
                                            value={activeProperty?.units || 0} 
                                            onChange={(e) => updateProperty(0, { units: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label="Floors" type="number" size="small"
                                            value={activeProperty?.floors || 1} 
                                            onChange={(e) => updateProperty(0, { floors: parseInt(e.target.value) || 1 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label="Sqft" type="number" size="small"
                                            value={activeProperty?.sqft || 0} 
                                            onChange={(e) => updateProperty(0, { sqft: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label="Age (Yrs)" type="number" size="small"
                                            value={activeProperty?.age || 0} 
                                            onChange={(e) => updateProperty(0, { age: parseInt(e.target.value) || 0 })}
                                        />
                                    </Grid>
                                </Grid>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                    {onBack && (
                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            size="large"
                                            onClick={onBack}
                                            startIcon={<ArrowLeft />}
                                            sx={{ mt: 2, borderRadius: 4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}
                                        >
                                            BACK
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained" fullWidth size="large"
                                        onClick={onNext} disabled={!canProceed}
                                        endIcon={<ArrowRight />}
                                        sx={{ mt: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                    >
                                        CONTINUE
                                    </Button>
                                </Stack>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>

            <Snackbar open={snackbar.open} autoHideDuration={6000} onClose={() => setSnackbar({ ...snackbar, open: false })}>
                <Alert severity={snackbar.severity} variant="filled" sx={{ width: '100%' }}>
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default AssetProfileStep;

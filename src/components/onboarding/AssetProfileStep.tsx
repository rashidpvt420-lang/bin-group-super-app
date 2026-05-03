import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Divider, TextField, MenuItem, Container, Button, CircularProgress, Chip, Snackbar, Alert
} from '@mui/material';
import { 
    Home, Building2, Building, Hotel, Landmark, Gem, 
    Briefcase, Warehouse, ShieldCheck, ArrowRight, ArrowLeft, Scan, AlertTriangle, RefreshCcw
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { storage, ref, uploadBytes, getDownloadURL, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const AssetProfileStep: React.FC<{ onNext: () => void; onBack?: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
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
            const storageRef = ref(storage, `temp_kyc/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const fileUrl = await getDownloadURL(storageRef);

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
        { id: 'Villa', label: t('onboarding.type.villa'), icon: <Home size={24} /> },
        { id: 'Apartment', label: t('onboarding.type.apartment'), icon: <Building size={24} /> },
        { id: 'Residential Building', label: t('onboarding.type.res_building'), icon: <Building2 size={24} /> },
        { id: 'Commercial Building', label: t('onboarding.type.com_building'), icon: <Warehouse size={24} /> },
        { id: 'Office', label: t('onboarding.type.office'), icon: <Briefcase size={24} /> },
        { id: 'Retail Center', label: t('onboarding.type.retail'), icon: <Building size={24} /> },
        { id: 'Mall', label: t('onboarding.type.mall'), icon: <Building2 size={24} />, premium: true },
        { id: 'Hotel', label: t('onboarding.type.hotel'), icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Hospital', label: t('onboarding.type.hospital'), icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'Clinic', label: t('onboarding.type.clinic'), icon: <ShieldCheck size={24} />, premium: true, useType: 'healthcare' },
        { id: 'School', label: t('onboarding.type.school'), icon: <Landmark size={24} />, premium: true, useType: 'education' },
        { id: 'Warehouse', label: t('onboarding.type.warehouse'), icon: <Warehouse size={24} /> },
        { id: 'Labour Camp', label: t('onboarding.type.labour_camp'), icon: <Building2 size={24} />, premium: true },
        { id: 'Government Property', label: t('onboarding.type.gov_prop'), icon: <ShieldCheck size={24} />, premium: true, ownerType: 'government' },
        { id: 'Government Majlis', label: t('onboarding.type.gov_majlis'), icon: <Landmark size={24} />, premium: true, ownerType: 'government', majlis: true, majlisType: 'government' },
        { id: 'Private Majlis', label: t('onboarding.type.priv_majlis'), icon: <Landmark size={24} />, premium: true, majlis: true, majlisType: 'private' },
        { id: 'Mixed-Use Tower', label: t('onboarding.type.mixed_tower'), icon: <Gem size={24} />, premium: true },
        { id: 'Skyscraper', label: t('onboarding.type.skyscraper'), icon: <Building2 size={24} />, premium: true },
        { id: 'Stadium', label: t('onboarding.type.stadium'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Sports Complex', label: t('onboarding.type.sports_complex'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Event Venue', label: t('onboarding.type.event_venue'), icon: <Gem size={24} />, premium: true, useType: 'event' },
        { id: 'Resort', label: t('onboarding.type.resort'), icon: <Hotel size={24} />, premium: true, useType: 'hospitality' },
        { id: 'Industrial Property', label: t('onboarding.type.industrial'), icon: <Warehouse size={24} /> },
        { id: 'Staff Accommodation', label: t('onboarding.type.staff_acc'), icon: <Building2 size={24} /> },
        { id: 'Farm / Estate', label: t('onboarding.type.farm'), icon: <Home size={24} /> },
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
                    {t('onboarding.asset_profile')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.asset_desc')}
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
                                {t('onboarding.retry_scan')}
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
                                1. {t('onboarding.asset_type').toUpperCase()}
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
                                2. {t('onboarding.verification').toUpperCase()}
                            </Typography>
                            <Stack spacing={3}>
                                    <Button 
                                        variant="outlined" 
                                        component="label"
                                        fullWidth
                                        startIcon={scanning ? <CircularProgress size={16} color="inherit" /> : <Scan size={18} />}
                                        sx={{ mb: 3, py: 1.5, borderColor: binThemeTokens.gold, color: binThemeTokens.gold, borderStyle: 'dashed' }}
                                    >
                                        {scanning ? t('onboarding.scanning') : scanned ? t('onboarding.scanned') : t('onboarding.scan_btn')}
                                        {!scanning && !scanned && <input type="file" accept="image/*,.pdf" hidden onChange={handleTitleDeedUpload} />}
                                    </Button>

                                    <TextField 
                                        select fullWidth label={t('onboarding.asset_type')} size="small"
                                        value={activeProperty?.assetGrade || 'Premium'} 
                                        onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                    >
                                    <MenuItem value="Standard">{t('onboarding.grade.standard')}</MenuItem>
                                    <MenuItem value="Premium">{t('onboarding.grade.premium')}</MenuItem>
                                    <MenuItem value="Luxury">{t('onboarding.grade.luxury')}</MenuItem>
                                    <MenuItem value="Sovereign">{t('onboarding.grade.sovereign')}</MenuItem>
                                </TextField>

                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.units')} type="number" size="small"
                                            value={activeProperty?.units || 0} 
                                            onChange={(e) => updateProperty(0, { units: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.floors')} type="number" size="small"
                                            value={activeProperty?.floors || 1} 
                                            onChange={(e) => updateProperty(0, { floors: parseInt(e.target.value) || 1 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.sqft')} type="number" size="small"
                                            value={activeProperty?.sqft || 0} 
                                            onChange={(e) => updateProperty(0, { sqft: parseInt(e.target.value) || 0 })}
                                            InputProps={{
                                                endAdornment: scanned ? <ShieldCheck size={16} color="#10b981" /> : null
                                            }}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField 
                                            fullWidth label={t('onboarding.age')} type="number" size="small"
                                            value={activeProperty?.age || 0} 
                                            onChange={(e) => updateProperty(0, { age: parseInt(e.target.value) || 0 })}
                                            sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                        />
                                    </Grid>
                                </Grid>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                                    {onBack && (
                                        <Button
                                            variant="outlined"
                                            fullWidth
                                            size="large"
                                            onClick={onBack}
                                            startIcon={!isRTL ? <ArrowLeft /> : null}
                                            endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null}
                                            sx={{ mt: 2, borderRadius: 4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}
                                        >
                                            {t('onboarding.back')}
                                        </Button>
                                    )}
                                    <Button
                                        variant="contained" fullWidth size="large"
                                        onClick={onNext} disabled={!canProceed}
                                        endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                        sx={{ mt: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                    >
                                        {t('onboarding.continue')}
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

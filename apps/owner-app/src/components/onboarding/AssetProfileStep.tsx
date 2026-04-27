import React, { useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, Stack, Divider, TextField, MenuItem, Container, Button, CircularProgress, Chip
} from '@mui/material';
import { 
    Home, Building2, Building, Hotel, Landmark, Gem, 
    Briefcase, Warehouse, ShieldCheck, Hash, Scaling, Calendar, ArrowRight, Scan, Upload
} from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const AssetProfileStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
    const { properties, updateProperty, addProperty } = useOnboardingStore();
    const { tx } = useLanguage();
    const [scanning, setScanning] = useState(false);
    const [scanned, setScanned] = useState(false);

    React.useEffect(() => {
        if (properties.length === 0) {
            addProperty();
        }
    }, [properties.length, addProperty]);

    const activeProperty = properties[0];

    const simulateScan = () => {
        setScanning(true);
        setTimeout(() => {
            setScanning(false);
            setScanned(true);
            updateProperty(0, {
                propertyType: 'Apartment',
                sqft: 1850,
                units: 1,
                floors: 1,
                age: 2
            });
        }, 2000);
    };

    const types = [
        { id: 'Villa', label: 'Villa', icon: <Home size={24} /> },
        { id: 'Apartment', label: 'Apartment', icon: <Building size={24} /> },
        { id: 'Residential Building', label: 'Residential Building', icon: <Building2 size={24} /> },
        { id: 'Office', label: 'Office', icon: <Briefcase size={24} /> },
        { id: 'Commercial Building', label: 'Commercial Building', icon: <Warehouse size={24} /> },
        { id: 'HOTEL', label: 'Hotel', icon: <Hotel size={24} />, premium: true },
        { id: 'GOVERNMENT_MAJLIS', label: 'Government Majlis', icon: <Landmark size={24} />, premium: true },
        { id: 'GOVERNMENT_PROPERTY', label: 'Government Property', icon: <ShieldCheck size={24} />, premium: true },
        { id: 'Mixed-Use Tower', label: 'Mixed-Use Tower', icon: <Gem size={24} />, premium: true },
    ];

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
                <Grid container spacing={4}>
                    {/* CATEGORY SELECTOR */}
                    <Grid item xs={12} lg={7}>
                        <Paper sx={{ p: 4, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 3, display: 'block' }}>
                                1. SELECT CATEGORY
                            </Typography>
                            <Grid container spacing={2}>
                                {types.map((type) => (
                                    <Grid item xs={12} sm={4} key={type.id}>
                                        <Paper 
                                            onClick={() => updateProperty(0, { propertyType: type.id })}
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

                    {/* PARAMETERS */}
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
                                        {!scanning && !scanned && <input type="file" accept="image/*,.pdf" hidden onChange={simulateScan} />}
                                    </Button>

                                    <TextField 
                                        select fullWidth label="Asset Grade" size="small"
                                        value={activeProperty?.assetGrade || 'Premium'} 
                                        onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                        disabled={scanned}
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
                                            disabled={scanned}
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
                                            disabled={scanned}
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
                                            disabled={scanned}
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
                                            disabled={scanned}
                                        />
                                    </Grid>
                                </Grid>

                                <Button 
                                    variant="contained" fullWidth size="large" 
                                    onClick={onNext} disabled={!canProceed}
                                    endIcon={<ArrowRight />}
                                    sx={{ mt: 2, borderRadius: 4, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                                >
                                    CONTINUE
                                </Button>
                            </Stack>
                        </Paper>
                    </Grid>
                </Grid>
            </Container>
        </Box>
    );
};

export default AssetProfileStep;

import React from 'react';
import { 
    Box, Typography, Grid, Paper, TextField, MenuItem, 
    Stack, Button, Divider, alpha, Container 
} from '@mui/material';
import { ArrowRight, ArrowLeft, Building, Hash, Scaling, Calendar } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const BuildingDataStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();

    const activeProperty = properties[0];

    const canProceed = activeProperty?.units > 0 && activeProperty?.sqft > 0;

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.building_parameters', 'BUILDING PARAMETERS')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.building_desc', 'Quantify the structural scale to calibrate maintenance resources.')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>
                                OWNER CLASSIFICATION
                            </Typography>
                            <TextField 
                                select 
                                fullWidth 
                                label="Owner Type" 
                                value={activeProperty?.ownerType || 'Private'} 
                                onChange={(e) => updateProperty(0, { ownerType: e.target.value as any })}
                                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                            >
                                <MenuItem value="Private">Private Owner</MenuItem>
                                <MenuItem value="Government">Government Entity</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>
                                ASSET GRADE
                            </Typography>
                            <TextField 
                                select 
                                fullWidth 
                                label="Quality Tier" 
                                value={activeProperty?.assetGrade || 'Premium'} 
                                onChange={(e) => updateProperty(0, { assetGrade: e.target.value as any })}
                                sx={{ '& .MuiOutlinedInput-root': { bgcolor: 'rgba(255,255,255,0.02)' } }}
                            >
                                <MenuItem value="Standard">Standard</MenuItem>
                                <MenuItem value="Premium">Premium</MenuItem>
                                <MenuItem value="Luxury">Luxury</MenuItem>
                                <MenuItem value="Ultra-Luxury">Ultra-Luxury</MenuItem>
                                <MenuItem value="Sovereign">Sovereign</MenuItem>
                            </TextField>
                        </Grid>

                        <Grid item xs={12}><Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} /></Grid>

                        <Grid item xs={12} sm={6}>
                            <Stack spacing={1}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>TOTAL UNITS / ROOMS</Typography>
                                <TextField 
                                    fullWidth 
                                    type="number" 
                                    value={activeProperty?.units || 0} 
                                    onChange={(e) => updateProperty(0, { units: parseInt(e.target.value) || 0 })}
                                    InputProps={{
                                        startAdornment: <Hash size={18} style={{ marginRight: 8, color: binThemeTokens.gold }} />
                                    }}
                                />
                            </Stack>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Stack spacing={1}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>VERTICAL FLOORS</Typography>
                                <TextField 
                                    fullWidth 
                                    type="number" 
                                    value={activeProperty?.floors || 1} 
                                    onChange={(e) => updateProperty(0, { floors: parseInt(e.target.value) || 1 })}
                                    InputProps={{
                                        startAdornment: <Building size={18} style={{ marginRight: 8, color: binThemeTokens.gold }} />
                                    }}
                                />
                            </Stack>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Stack spacing={1}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>BUILT-UP AREA (SQFT)</Typography>
                                <TextField 
                                    fullWidth 
                                    type="number" 
                                    value={activeProperty?.sqft || 0} 
                                    onChange={(e) => updateProperty(0, { sqft: parseInt(e.target.value) || 0 })}
                                    InputProps={{
                                        startAdornment: <Scaling size={18} style={{ marginRight: 8, color: binThemeTokens.gold }} />
                                    }}
                                />
                            </Stack>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <Stack spacing={1}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 900 }}>ASSET AGE (YEARS)</Typography>
                                <TextField 
                                    fullWidth 
                                    type="number" 
                                    value={activeProperty?.age || 0} 
                                    onChange={(e) => updateProperty(0, { age: parseInt(e.target.value) || 0 })}
                                    InputProps={{
                                        startAdornment: <Calendar size={18} style={{ marginRight: 8, color: binThemeTokens.gold }} />
                                    }}
                                />
                            </Stack>
                        </Grid>
                    </Grid>

                    <Box sx={{ mt: 8, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                        <Button 
                            variant="outlined" 
                            size="large" 
                            onClick={onBack}
                            startIcon={<ArrowLeft />}
                            sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}
                        >
                            BACK
                        </Button>
                        <Button 
                            variant="contained" 
                            size="large" 
                            onClick={onNext}
                            disabled={!canProceed}
                            endIcon={<ArrowRight />}
                            sx={{ 
                                borderRadius: 100, px: 6, 
                                bgcolor: binThemeTokens.gold, color: '#000', 
                                fontWeight: 950,
                                '&:hover': { bgcolor: '#E6C77A' }
                            }}
                        >
                            CONFIRM DATA
                        </Button>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default BuildingDataStep;

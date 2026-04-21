import React, { useRef, useEffect } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, TextField, 
    InputAdornment, Button, Stack, Divider, Container 
} from '@mui/material';
import { MapPin, Search, Navigation, ArrowRight, ArrowLeft } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const googleAutocompleteRef = useRef<any>(null);

    const activeProperty = properties[0];

    useEffect(() => {
        let autocomplete: any = null;

        const initAutocomplete = async () => {
            if (autocompleteRef.current) {
                try {
                    const { Autocomplete } = await (window as any).google.maps.importLibrary("places") as any;
                    
                    autocomplete = new Autocomplete(autocompleteRef.current, {
                        componentRestrictions: { country: "ae" },
                        fields: ["address_components", "geometry", "formatted_address"],
                        types: ["address"]
                    });

                    autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry) return;

                        const address = place.formatted_address;
                        let emirate = 'Dubai';
                        let area = '';

                        for (const component of place.address_components) {
                            if (component.types.includes("administrative_area_level_1")) {
                                emirate = component.long_name.replace('Emirate of ', '').replace(' Emirate', '');
                            }
                            if (component.types.includes("sublocality") || component.types.includes("neighborhood")) {
                                area = component.long_name;
                            }
                        }

                        updateProperty(0, { 
                            address, 
                            emirate, 
                            area: area || activeProperty?.area,
                            location: {
                                lat: place.geometry.location.lat(),
                                lng: place.geometry.location.lng()
                            }
                        });
                    });
                    
                    googleAutocompleteRef.current = autocomplete;
                } catch (e) {
                    console.error("Google Autocomplete Init Failed:", e);
                }
            }
        };

        initAutocomplete();

        return () => {
            if (googleAutocompleteRef.current) {
                (window as any).google.maps.event.clearInstanceListeners(googleAutocompleteRef.current);
            }
        };
    }, []);

    const canProceed = activeProperty?.address && activeProperty?.emirate;

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {tx('onboarding.location_identification', 'LOCATION IDENTIFICATION')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {tx('onboarding.location_desc', 'Identify the geographic coordinates for dispatch optimization.')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: 6, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        <Box>
                            <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 900, mb: 2, display: 'block' }}>
                                ASSET GEO-ANCHOR
                            </Typography>
                            <TextField
                                fullWidth
                                inputRef={autocompleteRef}
                                placeholder="Search for property address or area in UAE..."
                                value={activeProperty?.address || ''}
                                onChange={(e) => updateProperty(0, { address: e.target.value })}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <Search color={binThemeTokens.gold} size={20} />
                                        </InputAdornment>
                                    ),
                                    sx: { 
                                        borderRadius: 3, 
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        '& fieldset': { borderColor: 'rgba(198,167,94,0.2)' }
                                    }
                                }}
                            />
                        </Box>

                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 1, display: 'block' }}>
                                    EMIRATE
                                </Typography>
                                <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                    <Typography variant="body1" sx={{ color: activeProperty?.emirate ? '#FFF' : 'rgba(255,255,255,0.2)' }}>
                                        {activeProperty?.emirate || 'Awaiting selection...'}
                                    </Typography>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', fontWeight: 900, mb: 1, display: 'block' }}>
                                    AREA / ZONE
                                </Typography>
                                <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                    <Typography variant="body1" sx={{ color: activeProperty?.area ? '#FFF' : 'rgba(255,255,255,0.2)' }}>
                                        {activeProperty?.area || 'Awaiting selection...'}
                                    </Typography>
                                </Paper>
                            </Grid>
                        </Grid>

                        {activeProperty?.location && (
                            <Box sx={{ 
                                p: 3, 
                                borderRadius: 3, 
                                bgcolor: alpha('#10b981', 0.05), 
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2
                            }}>
                                <Navigation color="#10b981" size={24} />
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#10b981', fontWeight: 900 }}>
                                        GEO-DATA LOCKED
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(16, 185, 129, 0.6)' }}>
                                        Coordinates: {activeProperty.location.lat.toFixed(6)}, {activeProperty.location.lng.toFixed(6)}
                                    </Typography>
                                </Box>
                            </Box>
                        )}
                    </Stack>

                    <Box sx={{ mt: 6, display: 'flex', justifyContent: 'space-between', gap: 2 }}>
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
                            CONFIRM LOCATION
                        </Button>
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;

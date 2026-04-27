import React, { useRef, useEffect, useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, TextField, 
    InputAdornment, Button, Stack, Divider, Container, Alert
} from '@mui/material';
import { MapPin, Search, Navigation, ArrowRight, ArrowLeft, Crosshair } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx, isRTL } = useLanguage();
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const googleAutocompleteRef = useRef<any>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);
    const [locationError, setLocationError] = useState<string | null>(null);

    const activeProperty = properties[0];

    const commitGeoAnchor = (payload: { lat: number; lng: number; address?: string; emirate?: string; city?: string; area?: string; placeId?: string; source?: 'google_maps' | 'title_deed' | 'admin_manual'; verified?: boolean }) => {
        try {
            const geo = buildPersistableGeoAnchor({
                lat: payload.lat,
                lng: payload.lng,
                address: payload.address || activeProperty?.address,
                emirate: payload.emirate || activeProperty?.emirate,
                city: payload.city || activeProperty?.city || payload.area || activeProperty?.area,
                area: payload.area || activeProperty?.area || payload.city,
                placeId: payload.placeId || activeProperty?.googlePlaceId,
                source: payload.source || 'google_maps',
                verified: payload.verified ?? true
            });

            updateProperty(0, {
                address: geo.address,
                addressLine: geo.address,
                emirate: geo.emirate,
                city: geo.city,
                area: geo.area,
                googlePlaceId: geo.placeId,
                geo,
                location: { lat: geo.lat, lng: geo.lng }
            });
            setLocationError(null);
        } catch (err: any) {
            setLocationError(err?.message || 'We could not verify this location. Admin review is required.');
        }
    };

    const extractAddressParts = (components: any[] = []) => {
        let emirate = activeProperty?.emirate || '';
        let city = activeProperty?.city || '';
        let area = activeProperty?.area || '';
        components.forEach((component) => {
            if (component.types.includes('administrative_area_level_1')) {
                emirate = component.long_name.replace('Emirate of ', '').replace(' Emirate', '');
            }
            if (component.types.includes('locality') || component.types.includes('administrative_area_level_2')) {
                city = component.long_name;
            }
            if (component.types.includes('sublocality') || component.types.includes('neighborhood')) {
                area = component.long_name;
            }
        });
        return { emirate, city: city || area || emirate, area: area || city || emirate };
    };

    const reverseGeocode = (lat: number, lng: number) => {
        if (!geocoderRef.current) {
            commitGeoAnchor({ lat, lng, source: 'admin_manual', verified: false });
            return;
        }
        geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
            if (status === 'OK' && results?.[0]) {
                const parts = extractAddressParts(results[0].address_components || []);
                commitGeoAnchor({
                    lat,
                    lng,
                    address: results[0].formatted_address,
                    placeId: results[0].place_id,
                    ...parts,
                    source: 'google_maps',
                    verified: true
                });
            } else {
                commitGeoAnchor({ lat, lng, source: 'admin_manual', verified: false });
            }
        });
    };

    const moveMarker = (lat: number, lng: number) => {
        if (!isValidLatLng(lat, lng)) {
            setLocationError('Please select the property location from Google Maps.');
            return;
        }
        const position = { lat, lng };
        mapInstanceRef.current?.setCenter(position);
        markerRef.current?.setPosition(position);
        reverseGeocode(lat, lng);
    };

    useEffect(() => {
        let autocomplete: any = null;

        const initAutocomplete = async () => {
            if (autocompleteRef.current) {
                try {
                    if (!(window as any).google?.maps) {
                        setLocationError('Google Maps is still loading. Please retry the location search.');
                        return;
                    }
                    const { Autocomplete } = await (window as any).google.maps.importLibrary("places") as any;
                    const { Map } = await (window as any).google.maps.importLibrary("maps") as any;
                    const { Marker } = await (window as any).google.maps.importLibrary("marker") as any;
                    
                    autocomplete = new Autocomplete(autocompleteRef.current, {
                        componentRestrictions: { country: "ae" },
                        fields: ["address_components", "geometry", "formatted_address", "place_id"],
                        types: ["address"]
                    });

                    geocoderRef.current = new (window as any).google.maps.Geocoder();

                    if (mapRef.current && !mapInstanceRef.current) {
                        const initial = activeProperty?.location || { lat: 24.4539, lng: 54.3773 };
                        mapInstanceRef.current = new Map(mapRef.current, {
                            center: initial,
                            zoom: activeProperty?.location ? 16 : 7,
                            mapTypeControl: false,
                            streetViewControl: false,
                            fullscreenControl: true
                        });
                        markerRef.current = new Marker({
                            map: mapInstanceRef.current,
                            position: initial,
                            draggable: true,
                            title: 'Property geo-anchor'
                        });
                        markerRef.current.addListener('dragend', () => {
                            const position = markerRef.current.getPosition();
                            moveMarker(position.lat(), position.lng());
                        });
                        mapInstanceRef.current.addListener('click', (event: any) => {
                            if (event.latLng) moveMarker(event.latLng.lat(), event.latLng.lng());
                        });
                    }

                    autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry) return;

                        const address = place.formatted_address;
                        const parts = extractAddressParts(place.address_components || []);
                        const lat = place.geometry.location.lat();
                        const lng = place.geometry.location.lng();

                        commitGeoAnchor({
                            address,
                            placeId: place.place_id,
                            lat,
                            lng,
                            ...parts,
                            source: 'google_maps',
                            verified: true
                        });
                        mapInstanceRef.current?.setZoom(16);
                        markerRef.current?.setPosition({ lat, lng });
                        mapInstanceRef.current?.setCenter({ lat, lng });
                    });
                    
                    googleAutocompleteRef.current = autocomplete;
                } catch (e) {
                    console.error("Google Autocomplete Init Failed:", e);
                    setLocationError('We could not verify this location. Admin review is required.');
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

    const handleUseCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError('Location permission is required to anchor this property.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => moveMarker(position.coords.latitude, position.coords.longitude),
            () => setLocationError('Location permission is required to anchor this property.'),
            { enableHighAccuracy: true, timeout: 12000 }
        );
    };

    const canProceed = activeProperty?.address && activeProperty?.emirate && activeProperty?.geo?.lat && activeProperty?.geo?.lng;

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
                            {locationError && (
                                <Alert severity="warning" sx={{ mb: 2, bgcolor: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.22)' }}>
                                    {locationError}
                                </Alert>
                            )}
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
                            <Button
                                variant="outlined"
                                startIcon={<Crosshair size={16} />}
                                onClick={handleUseCurrentLocation}
                                sx={{ mt: 2, color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.35), fontWeight: 900 }}
                            >
                                Use Current Location
                            </Button>
                        </Box>

                        <Paper sx={{ height: { xs: 280, md: 360 }, overflow: 'hidden', borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: 'rgba(255,255,255,0.03)' }}>
                            <Box ref={mapRef} sx={{ width: '100%', height: '100%' }} />
                        </Paper>

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

                        {activeProperty?.geo && (
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
                                        Coordinates: {activeProperty.geo.lat.toFixed(6)}, {activeProperty.geo.lng.toFixed(6)} | {activeProperty.geo.geohash}
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

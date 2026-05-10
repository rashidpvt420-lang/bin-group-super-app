import React, { useRef, useEffect, useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, TextField, 
    InputAdornment, Button, Stack, Divider, Container, Alert, MenuItem, CircularProgress
} from '@mui/material';
import { MapPin, Search, ArrowRight, ArrowLeft, RefreshCcw, Info, Globe } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';
import { useGoogleMaps } from '../../lib/maps';

const EMIRATES_LIST = [
    { id: 'Dubai', key: 'onboarding.emirate.dubai', lat: 25.2048, lng: 55.2708 },
    { id: 'Abu Dhabi', key: 'onboarding.emirate.abudhabi', lat: 24.4539, lng: 54.3773 },
    { id: 'Sharjah', key: 'onboarding.emirate.sharjah', lat: 25.3463, lng: 55.4209 },
    { id: 'Ajman', key: 'onboarding.emirate.ajman', lat: 25.4052, lng: 55.5136 },
    { id: 'Umm Al Quwain', key: 'onboarding.emirate.ummalquwain', lat: 25.5647, lng: 55.5552 },
    { id: 'Ras Al Khaimah', key: 'onboarding.emirate.rasalkhaimah', lat: 25.8007, lng: 55.9762 },
    { id: 'Fujairah', key: 'onboarding.emirate.fujairah', lat: 25.1288, lng: 56.3265 }
];

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);
    
    const [locationError, setLocationError] = useState<string | null>(null);
    const [mapFailed, setMapFailed] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');

    const activeProperty = properties[0];

    // Initialize manual coordinates from store if they exist
    useEffect(() => {
        if (activeProperty?.location?.lat) setManualLat(String(activeProperty.location.lat));
        if (activeProperty?.location?.lng) setManualLng(String(activeProperty.location.lng));
    }, []);

    const commitGeoAnchor = (payload: { 
        lat: number; 
        lng: number; 
        address?: string; 
        emirate?: string; 
        city?: string; 
        area?: string; 
        placeId?: string; 
        source?: 'google_maps' | 'title_deed' | 'admin_manual'; 
        verified?: boolean; 
        requiresGeoReview?: boolean; 
        dispatchReady?: boolean 
    }) => {
        try {
            const isManual = payload.source === 'admin_manual' || !payload.placeId;
            let resolvedEmirate = payload.emirate || activeProperty?.emirate;
            let resolvedCity = payload.city || activeProperty?.city;
            let resolvedArea = payload.area || activeProperty?.area;

            const geo = buildPersistableGeoAnchor({
                lat: payload.lat,
                lng: payload.lng,
                address: payload.address || activeProperty?.address,
                emirate: resolvedEmirate,
                city: resolvedCity,
                area: resolvedArea,
                placeId: payload.placeId || 'MANUAL',
                source: payload.source || (isManual ? 'admin_manual' : 'google_maps'),
                verified: payload.verified ?? !isManual,
                requiresGeoReview: isManual ? true : Boolean(payload.requiresGeoReview),
                dispatchReady: isManual ? false : payload.dispatchReady ?? true
            });

            updateProperty(0, {
                address: geo.address,
                emirate: geo.emirate,
                city: geo.city,
                area: geo.area,
                googlePlaceId: geo.placeId || undefined,
                geo: geo as any,
                location: { lat: geo.lat, lng: geo.lng }
            });
            
            if (payload.lat) setManualLat(String(payload.lat));
            if (payload.lng) setManualLng(String(payload.lng));
            setLocationError(null);
        } catch (err: any) {
            console.error("Geo Commit Error:", err);
            setLocationError(err?.message || 'Verification failed.');
        }
    };

    const extractAddressParts = (components: any[] = []) => {
        let emirate = ''; let city = ''; let area = '';
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
        return { emirate, city, area };
    };

    const { isLoaded, loadError, apiKey } = useGoogleMaps();

    const initAutocomplete = async () => {
        if (!isLoaded || !apiKey) return;
        
        setInitializing(true);
        setMapFailed(false);
        try {
            const googleMaps = (window as any).google?.maps;
            if (!googleMaps) throw new Error("GOOGLE_MAPS_NOT_AVAILABLE");
            
            const mapsLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('maps') : googleMaps;
            const placesLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('places') : googleMaps.places;
            const geocodingLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('geocoding') : googleMaps;
            
            geocoderRef.current = new geocodingLibrary.Geocoder();

            if (autocompleteRef.current) {
                const autocomplete = new placesLibrary.Autocomplete(autocompleteRef.current, {
                    componentRestrictions: { country: "ae" },
                    fields: ["address_components", "geometry", "formatted_address", "place_id"],
                });

                autocomplete.addListener("place_changed", () => {
                    const place = autocomplete.getPlace();
                    if (!place.geometry) return;
                    const parts = extractAddressParts(place.address_components || []);
                    const lat = place.geometry.location.lat();
                    const lng = place.geometry.location.lng();
                    commitGeoAnchor({ 
                        address: place.formatted_address, 
                        placeId: place.place_id, 
                        lat, 
                        lng, 
                        ...parts,
                        source: 'google_maps'
                    });
                    mapInstanceRef.current?.setCenter({ lat, lng });
                    markerRef.current?.setPosition({ lat, lng });
                });
            }

            if (mapRef.current) {
                const initial = activeProperty?.location || { lat: 25.2048, lng: 55.2708 };
                mapInstanceRef.current = new mapsLibrary.Map(mapRef.current, {
                    center: initial, 
                    zoom: activeProperty?.location?.lat ? 16 : 10,
                    mapTypeControl: false, 
                    streetViewControl: false,
                    styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }]
                });
                markerRef.current = new googleMaps.Marker({
                    map: mapInstanceRef.current, 
                    position: initial, 
                    draggable: true
                });
                markerRef.current.addListener('dragend', () => {
                    const pos = markerRef.current.getPosition();
                    geocoderRef.current.geocode({ location: pos }, (results: any[]) => {
                        if (results?.[0]) {
                            const parts = extractAddressParts(results[0].address_components);
                            commitGeoAnchor({ 
                                lat: pos.lat(), 
                                lng: pos.lng(), 
                                address: results[0].formatted_address, 
                                ...parts,
                                source: 'google_maps'
                            });
                        } else {
                            commitGeoAnchor({
                                lat: pos.lat(),
                                lng: pos.lng(),
                                source: 'admin_manual'
                            });
                        }
                    });
                });
            }
        } catch (e: any) {
            console.error("Map Init Error:", e);
            setMapFailed(true);
        } finally {
            setInitializing(false);
        }
    };

    useEffect(() => {
        if (isLoaded) {
            initAutocomplete();
        } else if (loadError) {
            setMapFailed(true);
            setInitializing(false);
        }
    }, [isLoaded, loadError]);

    const handleEmirateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const emirateId = e.target.value;
        const emirateData = EMIRATES_LIST.find(em => em.id === emirateId);
        
        updateProperty(0, { emirate: emirateId });
        
        if (emirateData && !manualLat && !manualLng) {
            setManualLat(String(emirateData.lat));
            setManualLng(String(emirateData.lng));
            if (mapInstanceRef.current) {
                mapInstanceRef.current.setCenter({ lat: emirateData.lat, lng: emirateData.lng });
                mapInstanceRef.current.setZoom(12);
                markerRef.current?.setPosition({ lat: emirateData.lat, lng: emirateData.lng });
            }
        }
    };

    const handleContinue = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        
        if (!isValidLatLng(lat, lng)) {
            setLocationError("Please enter valid coordinates.");
            return;
        }

        // Final commit to ensure data is correct
        commitGeoAnchor({
            lat,
            lng,
            address: activeProperty?.address,
            emirate: activeProperty?.emirate,
            source: activeProperty?.googlePlaceId && activeProperty?.googlePlaceId !== 'MANUAL' ? 'google_maps' : 'admin_manual',
            placeId: activeProperty?.googlePlaceId === 'MANUAL' ? undefined : activeProperty?.googlePlaceId
        });
        
        onNext();
    };

    const canProceed = activeProperty?.emirate && activeProperty?.address && isValidLatLng(Number(manualLat), Number(manualLng));

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>
                    {t('onboarding.location_title')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {t('onboarding.location_subtitle')}
                </Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        {/* Manual Fields - Always Visible */}
                        <Stack spacing={3}>
                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MapPin size={18} /> {t('onboarding.property_address')}
                            </Typography>
                            
                            <TextField 
                                select 
                                fullWidth 
                                label={t('onboarding.emirate')} 
                                value={activeProperty?.emirate || ''} 
                                onChange={handleEmirateChange} 
                                sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                            >
                                {EMIRATES_LIST.map(e => <MenuItem key={e.id} value={e.id}>{t(e.key)}</MenuItem>)}
                            </TextField>

                            <TextField 
                                fullWidth 
                                label={t('onboarding.address')} 
                                placeholder={t('onboarding.address_placeholder')}
                                value={activeProperty?.address || ''} 
                                onChange={(e) => updateProperty(0, { address: e.target.value })} 
                                inputRef={autocompleteRef}
                                sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} 
                            />

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth 
                                        label="Latitude" 
                                        value={manualLat} 
                                        onChange={(e) => setManualLat(e.target.value)} 
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} 
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField 
                                        fullWidth 
                                        label="Longitude" 
                                        value={manualLng} 
                                        onChange={(e) => setManualLng(e.target.value)} 
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} 
                                    />
                                </Grid>
                            </Grid>
                        </Stack>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                        {/* Google Maps Section - Optional */}
                        {!mapFailed ? (
                            <Box sx={{ position: 'relative' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Globe size={14} /> {t('onboarding.map_optional')}
                                    </Typography>
                                    {initializing && <CircularProgress size={16} sx={{ color: binThemeTokens.gold }} />}
                                </Box>
                                <Box ref={mapRef} sx={{ width: '100%', height: 300, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: '#000' }} />
                                {locationError && <Alert severity="error" sx={{ mt: 2 }}>{locationError}</Alert>}
                            </Box>
                        ) : (
                            <Alert severity="info" icon={<Info size={18}/>} sx={{ bgcolor: 'rgba(198,167,94,0.05)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.2)' }}>
                                {t('onboarding.location_manual_info')}
                            </Alert>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Button 
                                variant="outlined" 
                                onClick={onBack} 
                                startIcon={!isRTL ? <ArrowLeft /> : null} 
                                endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} 
                                sx={{ borderRadius: 100, px: 4, color: '#FFF' }}
                            >
                                {t('onboarding.back')}
                            </Button>
                            <Button 
                                variant="contained" 
                                size="large" 
                                onClick={handleContinue} 
                                disabled={!canProceed} 
                                endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} 
                                sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
                                {t('onboarding.continue')}
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;


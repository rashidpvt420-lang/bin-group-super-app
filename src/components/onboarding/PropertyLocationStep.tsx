import React, { useRef, useEffect, useState } from 'react';
import {
    Box, Typography, Grid, Paper, TextField,
    Button, Stack, Divider, Container, Alert, MenuItem, CircularProgress
} from '@mui/material';
import { MapPin, ArrowRight, ArrowLeft, Info, Globe } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';
import { useGoogleMaps } from '../../lib/maps';

const EMIRATES_LIST = [
    { id: 'Dubai', key: 'onboarding.emirate.dubai', label: 'Dubai', lat: 25.2048, lng: 55.2708 },
    { id: 'Abu Dhabi', key: 'onboarding.emirate.abudhabi', label: 'Abu Dhabi', lat: 24.4539, lng: 54.3773 },
    { id: 'Sharjah', key: 'onboarding.emirate.sharjah', label: 'Sharjah', lat: 25.3463, lng: 55.4209 },
    { id: 'Ajman', key: 'onboarding.emirate.ajman', label: 'Ajman', lat: 25.4052, lng: 55.5136 },
    { id: 'Umm Al Quwain', key: 'onboarding.emirate.ummalquwain', label: 'Umm Al Quwain', lat: 25.5647, lng: 55.5552 },
    { id: 'Ras Al Khaimah', key: 'onboarding.emirate.rasalkhaimah', label: 'Ras Al Khaimah', lat: 25.8007, lng: 55.9762 },
    { id: 'Fujairah', key: 'onboarding.emirate.fujairah', label: 'Fujairah', lat: 25.1288, lng: 56.3265 }
];

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const getEmirate = (emirate?: string) => EMIRATES_LIST.find((em) => em.id === emirate) || EMIRATES_LIST[0];

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();
    const autocompleteRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);

    const activeProperty = properties[0];
    const fallbackEmirate = getEmirate(activeProperty?.emirate);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [mapFailed, setMapFailed] = useState(false);
    const [initializing, setInitializing] = useState(true);
    const [manualLat, setManualLat] = useState(String(activeProperty?.location?.lat || activeProperty?.geo?.lat || fallbackEmirate.lat));
    const [manualLng, setManualLng] = useState(String(activeProperty?.location?.lng || activeProperty?.geo?.lng || fallbackEmirate.lng));

    useEffect(() => {
        if (!activeProperty?.emirate) {
            updateProperty(0, { emirate: fallbackEmirate.id, city: fallbackEmirate.id });
        }
        if (!activeProperty?.location?.lat && !activeProperty?.geo?.lat) {
            setManualLat(String(fallbackEmirate.lat));
            setManualLng(String(fallbackEmirate.lng));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const isManual = payload.source === 'admin_manual' || !payload.placeId || payload.placeId === 'MANUAL';
            const resolvedEmirate = payload.emirate || activeProperty?.emirate || fallbackEmirate.id;
            const resolvedCity = payload.city || activeProperty?.city || resolvedEmirate;
            const resolvedArea = payload.area || activeProperty?.area || '';
            const resolvedAddress = payload.address || activeProperty?.address || `${resolvedEmirate}, UAE`;

            const geo = buildPersistableGeoAnchor({
                lat: payload.lat,
                lng: payload.lng,
                address: resolvedAddress,
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
                googlePlaceId: geo.placeId || 'MANUAL',
                geo: geo as any,
                location: { lat: geo.lat, lng: geo.lng }
            });

            setManualLat(String(payload.lat));
            setManualLng(String(payload.lng));
            setLocationError(null);
        } catch (err: any) {
            console.error('Geo Commit Error:', err);
            setLocationError(err?.message || 'Location verification failed.');
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
            if (!googleMaps) throw new Error('GOOGLE_MAPS_NOT_AVAILABLE');

            const mapsLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('maps') : googleMaps;
            const placesLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('places') : googleMaps.places;
            const geocodingLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('geocoding') : googleMaps;

            geocoderRef.current = new geocodingLibrary.Geocoder();

            if (autocompleteRef.current) {
                const autocomplete = new placesLibrary.Autocomplete(autocompleteRef.current, {
                    componentRestrictions: { country: 'ae' },
                    fields: ['address_components', 'geometry', 'formatted_address', 'place_id'],
                });

                autocomplete.addListener('place_changed', () => {
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
                const initial = {
                    lat: Number(manualLat) || fallbackEmirate.lat,
                    lng: Number(manualLng) || fallbackEmirate.lng,
                };
                mapInstanceRef.current = new mapsLibrary.Map(mapRef.current, {
                    center: initial,
                    zoom: activeProperty?.location?.lat ? 16 : 10,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    gestureHandling: 'greedy',
                    styles: [{ elementType: 'geometry', stylers: [{ color: '#212121' }] }]
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
                            commitGeoAnchor({ lat: pos.lat(), lng: pos.lng(), source: 'admin_manual' });
                        }
                    });
                });
            }
        } catch (e: any) {
            console.error('Map Init Error:', e);
            setMapFailed(true);
        } finally {
            setInitializing(false);
        }
    };

    useEffect(() => {
        if (isLoaded) initAutocomplete();
        else if (loadError) {
            setMapFailed(true);
            setInitializing(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoaded, loadError]);

    const handleEmirateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const emirateId = e.target.value;
        const emirateData = getEmirate(emirateId);

        updateProperty(0, { emirate: emirateId, city: emirateId });
        setManualLat(String(emirateData.lat));
        setManualLng(String(emirateData.lng));

        if (mapInstanceRef.current) {
            mapInstanceRef.current.setCenter({ lat: emirateData.lat, lng: emirateData.lng });
            mapInstanceRef.current.setZoom(12);
            markerRef.current?.setPosition({ lat: emirateData.lat, lng: emirateData.lng });
        }
    };

    const handleContinue = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);

        if (!activeProperty?.emirate) {
            setLocationError('Select the emirate before continuing.');
            return;
        }
        if (!activeProperty?.address || activeProperty.address.trim().length < 3) {
            setLocationError('Enter the property address before continuing.');
            return;
        }
        if (!isValidLatLng(lat, lng)) {
            setLocationError('Please enter valid coordinates.');
            return;
        }

        const isMapEntry = !!(activeProperty?.googlePlaceId && activeProperty?.googlePlaceId !== 'MANUAL');
        commitGeoAnchor({
            lat,
            lng,
            address: activeProperty?.address,
            emirate: activeProperty?.emirate,
            city: activeProperty?.city || activeProperty?.emirate,
            area: activeProperty?.area || '',
            source: isMapEntry ? 'google_maps' : 'admin_manual',
            placeId: isMapEntry ? activeProperty?.googlePlaceId : 'MANUAL',
            verified: isMapEntry,
            requiresGeoReview: !isMapEntry,
            dispatchReady: isMapEntry
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNext();
    };

    const canProceed = Boolean(activeProperty?.emirate && activeProperty?.address && isValidLatLng(Number(manualLat), Number(manualLng)));

    return (
        <Box sx={{ py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 6 } }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, fontSize: { xs: '1.65rem', md: '2.125rem' } }}>
                    {readable(t('onboarding.location_title'), 'Property Location')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    {readable(t('onboarding.location_subtitle'), 'Enter the property address. Google Maps is optional; manual location works for onboarding.')}
                </Typography>
            </Box>

            <Container maxWidth="md" sx={{ px: { xs: 0, sm: 3 } }}>
                <Paper sx={{ p: { xs: 2, sm: 3, md: 6 }, borderRadius: { xs: 3, md: 6 }, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'visible' }}>
                    <Stack spacing={{ xs: 2.5, md: 4 }}>
                        <Stack spacing={2.5}>
                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MapPin size={18} /> {readable(t('onboarding.property_address'), 'Property Address')}
                            </Typography>

                            <TextField
                                select
                                fullWidth
                                label={readable(t('onboarding.emirate'), 'Emirate')}
                                value={activeProperty?.emirate || fallbackEmirate.id}
                                onChange={handleEmirateChange}
                                sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                            >
                                {EMIRATES_LIST.map(e => <MenuItem key={e.id} value={e.id}>{readable(t(e.key), e.label)}</MenuItem>)}
                            </TextField>

                            <TextField
                                fullWidth
                                label={readable(t('onboarding.address'), 'Property Address')}
                                placeholder={readable(t('onboarding.address_placeholder'), 'Building name, street, area, emirate')}
                                value={activeProperty?.address || ''}
                                onChange={(e) => updateProperty(0, { address: e.target.value })}
                                inputRef={autocompleteRef}
                                multiline
                                minRows={2}
                                sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                            />

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        label="Latitude"
                                        value={manualLat}
                                        onChange={(e) => setManualLat(e.target.value)}
                                        sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
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

                        {!mapFailed ? (
                            <Box sx={{ position: 'relative' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Globe size={14} /> {readable(t('onboarding.map_optional'), 'Optional map verification')}
                                    </Typography>
                                    {initializing && <CircularProgress size={16} sx={{ color: binThemeTokens.gold }} />}
                                </Box>
                                <Box ref={mapRef} sx={{ width: '100%', height: { xs: 220, md: 300 }, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: '#000' }} />
                            </Box>
                        ) : (
                            <Alert severity="info" icon={<Info size={18}/>} sx={{ bgcolor: 'rgba(198,167,94,0.05)', color: binThemeTokens.gold, border: '1px solid rgba(198,167,94,0.2)' }}>
                                {readable(t('onboarding.location_manual_info'), 'Map is optional. Manual location will be saved and reviewed by Admin before dispatch.')}
                            </Alert>
                        )}

                        {locationError && <Alert severity="warning">{locationError}</Alert>}

                        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 2 }}>
                            <Button
                                variant="outlined"
                                onClick={onBack}
                                fullWidth
                                startIcon={!isRTL ? <ArrowLeft /> : null}
                                endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null}
                                sx={{ borderRadius: 100, px: 4, color: '#FFF' }}
                            >
                                {readable(t('onboarding.back'), 'Back')}
                            </Button>
                            <Button
                                variant="contained"
                                size="large"
                                onClick={handleContinue}
                                fullWidth
                                disabled={!canProceed}
                                endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />}
                                sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}
                            >
                                {readable(t('onboarding.continue'), 'Continue')}
                            </Button>
                        </Stack>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;

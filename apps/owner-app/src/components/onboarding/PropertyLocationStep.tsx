import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Container,
    Grid,
    InputAdornment,
    Paper,
    Stack,
    TextField,
    Typography,
    alpha
} from '@mui/material';
import { ArrowLeft, ArrowRight, Crosshair, Navigation, Search } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useOnboardingStore } from '../../store/onboardingStore';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';

type GeoPayload = {
    lat: number;
    lng: number;
    address?: string;
    emirate?: string;
    city?: string;
    area?: string;
    placeId?: string;
    source?: 'google_maps' | 'title_deed' | 'admin_manual';
    verified?: boolean;
};

const UAE_CENTER = { lat: 24.4539, lng: 54.3773 };

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx } = useLanguage();
    const activeProperty = properties[0];

    const autocompleteRef = useRef<HTMLInputElement>(null);
    const googleAutocompleteRef = useRef<any>(null);
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const geocoderRef = useRef<any>(null);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [mapsReady, setMapsReady] = useState(false);

    const commitGeoAnchor = (payload: GeoPayload) => {
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

    const commitAdminReviewGeo = (lat: number, lng: number) => {
        const emirate = activeProperty?.emirate || 'Dubai';
        const city = activeProperty?.city || activeProperty?.area || emirate;
        const area = activeProperty?.area || city;
        const address = activeProperty?.address?.trim() || `${area}, ${emirate}, UAE`;

        commitGeoAnchor({
            lat,
            lng,
            address,
            emirate,
            city,
            area,
            source: 'admin_manual',
            verified: false
        });
        setLocationError('We could not detect the area. The pin was saved for admin review.');
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

        return {
            emirate,
            city: city || area || emirate,
            area: area || city || emirate
        };
    };

    const reverseGeocode = (lat: number, lng: number) => {
        if (!geocoderRef.current) {
            commitAdminReviewGeo(lat, lng);
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
                return;
            }

            commitAdminReviewGeo(lat, lng);
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
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;

        const waitForGoogleMaps = () => new Promise<any>((resolve, reject) => {
            const startedAt = Date.now();
            const poll = () => {
                if (cancelled) return;
                const googleMaps = (window as any).google?.maps;
                if (googleMaps?.importLibrary) {
                    resolve(googleMaps);
                    return;
                }
                if (Date.now() - startedAt > 8000) {
                    reject(new Error('Google Maps did not finish loading.'));
                    return;
                }
                retryTimer = setTimeout(poll, 250);
            };
            poll();
        });

        const initMap = async () => {
            try {
                const googleMaps = await waitForGoogleMaps();
                const { Autocomplete } = await googleMaps.importLibrary('places') as any;
                const { Map } = await googleMaps.importLibrary('maps') as any;
                const { Marker } = await googleMaps.importLibrary('marker') as any;

                if (!autocompleteRef.current || !mapRef.current || cancelled) return;

                const initialPosition = activeProperty?.location || UAE_CENTER;
                geocoderRef.current = new googleMaps.Geocoder();
                mapInstanceRef.current = new Map(mapRef.current, {
                    center: initialPosition,
                    zoom: activeProperty?.location ? 16 : 7,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: true
                });

                markerRef.current = new Marker({
                    map: mapInstanceRef.current,
                    position: initialPosition,
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

                const autocomplete = new Autocomplete(autocompleteRef.current, {
                    componentRestrictions: { country: 'ae' },
                    fields: ['address_components', 'geometry', 'formatted_address', 'place_id']
                });

                autocomplete.addListener('place_changed', () => {
                    const place = autocomplete.getPlace();
                    if (!place.geometry) {
                        setLocationError('Please select the property location from Google Maps.');
                        return;
                    }

                    const lat = place.geometry.location.lat();
                    const lng = place.geometry.location.lng();
                    const parts = extractAddressParts(place.address_components || []);

                    commitGeoAnchor({
                        lat,
                        lng,
                        address: place.formatted_address || activeProperty?.address,
                        placeId: place.place_id,
                        ...parts,
                        source: 'google_maps',
                        verified: true
                    });

                    mapInstanceRef.current?.setZoom(16);
                    markerRef.current?.setPosition({ lat, lng });
                    mapInstanceRef.current?.setCenter({ lat, lng });
                });

                googleAutocompleteRef.current = autocomplete;
                setMapsReady(true);
            } catch (err) {
                console.error('Google Maps initialization failed:', err);
                setLocationError('Map could not load. Please check your connection or contact support.');
            }
        };

        initMap();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (googleAutocompleteRef.current) {
                (window as any).google?.maps?.event?.clearInstanceListeners(googleAutocompleteRef.current);
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

    const canProceed = Boolean(activeProperty?.address && activeProperty?.emirate && activeProperty?.geo?.lat && activeProperty?.geo?.lng);

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
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
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
                                placeholder="Search for property address, building, or area in UAE..."
                                value={activeProperty?.address || ''}
                                onChange={(event) => updateProperty(0, { address: event.target.value })}
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
                                disabled={!mapsReady}
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
                                bgcolor: alpha(activeProperty.geo.verified ? '#10b981' : '#f59e0b', 0.05),
                                border: `1px solid ${activeProperty.geo.verified ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 2
                            }}>
                                <Navigation color={activeProperty.geo.verified ? '#10b981' : '#f59e0b'} size={24} />
                                <Box>
                                    <Typography variant="body2" sx={{ color: activeProperty.geo.verified ? '#10b981' : '#f59e0b', fontWeight: 900 }}>
                                        {activeProperty.geo.verified ? 'GEO-DATA LOCKED' : 'GEO-DATA SAVED FOR ADMIN REVIEW'}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.62)' }}>
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
                            sx={{ borderRadius: 100, px: 4, color: 'rgba(255,255,255,0.72)', borderColor: 'rgba(255,255,255,0.16)' }}
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
                                borderRadius: 100,
                                px: 6,
                                bgcolor: binThemeTokens.gold,
                                color: '#000',
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

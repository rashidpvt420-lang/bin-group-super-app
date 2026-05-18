import React, { useRef, useEffect, useState } from 'react';
import {
    Box, Typography, Grid, Paper, TextField,
    Button, Stack, Divider, Container, Alert, MenuItem, CircularProgress, alpha
} from '@mui/material';
import { MapPin, ArrowRight, ArrowLeft, Info, Globe, ExternalLink, LocateFixed, Navigation } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';
import { buildGoogleMapsSearchUrl, useGoogleMaps } from '../../lib/maps';

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
    const mapHealthTimerRef = useRef<number | null>(null);

    const activeProperty = properties[0];
    const fallbackEmirate = getEmirate(activeProperty?.emirate);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [mapFailed, setMapFailed] = useState(false);
    const [mapFailureReason, setMapFailureReason] = useState<string | null>(null);
    const [initializing, setInitializing] = useState(true);
    const [locating, setLocating] = useState(false);
    const [manualLat, setManualLat] = useState(String(activeProperty?.location?.lat || activeProperty?.geo?.lat || fallbackEmirate.lat));
    const [manualLng, setManualLng] = useState(String(activeProperty?.location?.lng || activeProperty?.geo?.lng || fallbackEmirate.lng));

    const googleMapsUrl = buildGoogleMapsSearchUrl({
        lat: manualLat,
        lng: manualLng,
        address: activeProperty?.address,
        emirate: activeProperty?.emirate || fallbackEmirate.id
    });

    useEffect(() => {
        if (!activeProperty?.emirate) {
            updateProperty(0, { emirate: fallbackEmirate.id, city: fallbackEmirate.id });
        }
        if (!activeProperty?.location?.lat && !activeProperty?.geo?.lat) {
            setManualLat(String(fallbackEmirate.lat));
            setManualLng(String(fallbackEmirate.lng));
        }
        return () => {
            if (mapHealthTimerRef.current) window.clearTimeout(mapHealthTimerRef.current);
        };
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
            if (component.types.includes('administrative_area_level_1')) emirate = component.long_name.replace('Emirate of ', '').replace(' Emirate', '');
            if (component.types.includes('locality') || component.types.includes('administrative_area_level_2')) city = component.long_name;
            if (component.types.includes('sublocality') || component.types.includes('neighborhood')) area = component.long_name;
        });
        return { emirate, city, area };
    };

    const { isLoaded, loadError, apiKey, authFailed } = useGoogleMaps();

    const failMap = (reason: string) => {
        console.warn('[PropertyLocationStep] Map fallback activated:', reason);
        setMapFailed(true);
        setMapFailureReason(reason);
        setInitializing(false);
    };

    const validateMapRender = () => {
        if (mapHealthTimerRef.current) window.clearTimeout(mapHealthTimerRef.current);
        mapHealthTimerRef.current = window.setTimeout(() => {
            if (!mapRef.current) return;
            const errorText = mapRef.current.textContent || '';
            const hasGoogleError = errorText.includes('Something went wrong') || errorText.includes("didn't load Google Maps correctly");
            if (hasGoogleError || authFailed || (window as any).__BIN_GOOGLE_MAPS_AUTH_FAILED__ === true) {
                failMap('GOOGLE_MAPS_RENDER_AUTH_OR_BILLING_FAILURE');
            }
        }, 1200);
    };

    const initAutocomplete = async () => {
        if (!isLoaded || !apiKey) return;

        setInitializing(true);
        setMapFailed(false);
        setMapFailureReason(null);
        try {
            const googleMaps = (window as any).google?.maps;
            if (!googleMaps) throw new Error('GOOGLE_MAPS_NOT_AVAILABLE');

            const mapsLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('maps') : googleMaps;
            const placesLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('places') : googleMaps.places;
            const geocodingLibrary = googleMaps.importLibrary ? await googleMaps.importLibrary('geocoding') : googleMaps;

            if (!mapsLibrary?.Map || !placesLibrary?.Autocomplete) throw new Error('GOOGLE_MAPS_LIBRARY_MISSING');
            geocoderRef.current = new geocodingLibrary.Geocoder();

            if (autocompleteRef.current && placesLibrary?.Autocomplete) {
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
                    commitGeoAnchor({ address: place.formatted_address, placeId: place.place_id, lat, lng, ...parts, source: 'google_maps' });
                    mapInstanceRef.current?.setCenter({ lat, lng });
                    markerRef.current?.setPosition({ lat, lng });
                });
            }

            if (mapRef.current) {
                const initial = { lat: Number(manualLat) || fallbackEmirate.lat, lng: Number(manualLng) || fallbackEmirate.lng };
                mapInstanceRef.current = new mapsLibrary.Map(mapRef.current, {
                    center: initial,
                    zoom: activeProperty?.location?.lat ? 16 : 10,
                    mapTypeControl: false,
                    streetViewControl: false,
                    fullscreenControl: false,
                    gestureHandling: 'greedy',
                    styles: [{ elementType: 'geometry', stylers: [{ color: '#212121' }] }]
                });
                markerRef.current = new googleMaps.Marker({ map: mapInstanceRef.current, position: initial, draggable: true });
                markerRef.current.addListener('dragend', () => {
                    const pos = markerRef.current.getPosition();
                    if (!pos) return;
                    geocoderRef.current?.geocode({ location: pos }, (results: any[]) => {
                        if (results?.[0]) {
                            const parts = extractAddressParts(results[0].address_components);
                            commitGeoAnchor({ lat: pos.lat(), lng: pos.lng(), address: results[0].formatted_address, ...parts, source: 'google_maps' });
                        } else {
                            commitGeoAnchor({ lat: pos.lat(), lng: pos.lng(), source: 'admin_manual' });
                        }
                    });
                });
                validateMapRender();
            }
        } catch (e: any) {
            console.error('Map Init Error:', e);
            failMap(e?.message || 'GOOGLE_MAPS_INIT_FAILED');
        } finally {
            setInitializing(false);
        }
    };

    useEffect(() => {
        if (isLoaded && !authFailed) initAutocomplete();
        else if (loadError || authFailed) failMap(loadError?.message || 'GOOGLE_MAPS_NOT_AVAILABLE');
    }, [isLoaded, loadError, authFailed]);

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

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError('Current location is not available on this device. Enter latitude and longitude manually.');
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = Number(position.coords.latitude.toFixed(7));
                const lng = Number(position.coords.longitude.toFixed(7));
                commitGeoAnchor({
                    lat,
                    lng,
                    address: activeProperty?.address || `${activeProperty?.emirate || fallbackEmirate.id}, UAE`,
                    emirate: activeProperty?.emirate || fallbackEmirate.id,
                    city: activeProperty?.city || activeProperty?.emirate || fallbackEmirate.id,
                    area: activeProperty?.area || '',
                    source: 'admin_manual',
                    placeId: 'MANUAL',
                    verified: false,
                    requiresGeoReview: true,
                    dispatchReady: false
                });
                mapInstanceRef.current?.setCenter({ lat, lng });
                markerRef.current?.setPosition({ lat, lng });
                setLocating(false);
            },
            (error) => {
                setLocating(false);
                setLocationError(error.message || 'Unable to read current location.');
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
        );
    };

    const handleManualCoordinateCommit = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!isValidLatLng(lat, lng)) {
            setLocationError('Please enter valid coordinates.');
            return;
        }
        commitGeoAnchor({
            lat,
            lng,
            address: activeProperty?.address || `${activeProperty?.emirate || fallbackEmirate.id}, UAE`,
            emirate: activeProperty?.emirate || fallbackEmirate.id,
            city: activeProperty?.city || activeProperty?.emirate || fallbackEmirate.id,
            area: activeProperty?.area || '',
            source: 'admin_manual',
            placeId: 'MANUAL',
            verified: false,
            requiresGeoReview: true,
            dispatchReady: false
        });
        mapInstanceRef.current?.setCenter({ lat, lng });
        markerRef.current?.setPosition({ lat, lng });
    };

    const handleContinue = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!activeProperty?.emirate) return setLocationError('Select the emirate before continuing.');
        if (!activeProperty?.address || activeProperty.address.trim().length < 3) return setLocationError('Enter the property address before continuing.');
        if (!isValidLatLng(lat, lng)) return setLocationError('Please enter valid coordinates.');

        const isMapEntry = !!(activeProperty?.googlePlaceId && activeProperty?.googlePlaceId !== 'MANUAL' && !mapFailed);
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

                            <TextField select fullWidth label={readable(t('onboarding.emirate'), 'Emirate')} value={activeProperty?.emirate || fallbackEmirate.id} onChange={handleEmirateChange} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                {EMIRATES_LIST.map(e => <MenuItem key={e.id} value={e.id}>{readable(t(e.key), e.label)}</MenuItem>)}
                            </TextField>

                            <TextField fullWidth label={readable(t('onboarding.address'), 'Property Address')} placeholder={readable(t('onboarding.address_placeholder'), 'Building name, street, area, emirate')} value={activeProperty?.address || ''} onChange={(e) => updateProperty(0, { address: e.target.value })} inputRef={autocompleteRef} multiline minRows={2} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField fullWidth label="Latitude" value={manualLat} onChange={(e) => setManualLat(e.target.value)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField fullWidth label="Longitude" value={manualLng} onChange={(e) => setManualLng(e.target.value)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                </Grid>
                            </Grid>

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                <Button variant="outlined" onClick={handleManualCoordinateCommit} startIcon={<MapPin size={16} />} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.35), fontWeight: 900 }}>Save Coordinates</Button>
                                <Button variant="outlined" onClick={useCurrentLocation} disabled={locating} startIcon={locating ? <CircularProgress size={14} /> : <LocateFixed size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>Use My Location</Button>
                                <Button variant="outlined" href={googleMapsUrl} target="_blank" rel="noreferrer" startIcon={<ExternalLink size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>Open in Google Maps</Button>
                            </Stack>
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
                                <Box ref={mapRef} sx={{ width: '100%', height: { xs: 220, md: 300 }, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: '#000', overflow: 'hidden' }} />
                            </Box>
                        ) : (
                            <Paper sx={{ p: 3, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.22)' }}>
                                <Stack spacing={2.2} alignItems="center" textAlign="center">
                                    <Navigation size={38} color={binThemeTokens.gold} />
                                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950 }}>Map preview is unavailable, but location capture still works</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)', maxWidth: 620 }}>
                                        Google Maps rejected the embedded preview. Save the address and coordinates here; technicians can still open the exact property location in Google Maps.
                                    </Typography>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                        <Button href={googleMapsUrl} target="_blank" rel="noreferrer" variant="contained" startIcon={<ExternalLink size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Open Navigation</Button>
                                        <Button variant="outlined" onClick={useCurrentLocation} disabled={locating} startIcon={locating ? <CircularProgress size={14} /> : <LocateFixed size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>Use Current GPS</Button>
                                    </Stack>
                                    {mapFailureReason && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>Diagnostic: {mapFailureReason}</Typography>}
                                </Stack>
                            </Paper>
                        )}

                        {locationError && <Alert severity="warning">{locationError}</Alert>}

                        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 2 }}>
                            <Button variant="outlined" onClick={onBack} fullWidth startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>{readable(t('onboarding.back'), 'Back')}</Button>
                            <Button variant="contained" size="large" onClick={handleContinue} fullWidth disabled={!canProceed} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}>{readable(t('onboarding.continue'), 'Continue')}</Button>
                        </Stack>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;
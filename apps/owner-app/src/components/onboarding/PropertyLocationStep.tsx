import React, { useRef, useEffect, useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, TextField, 
    InputAdornment, Button, Stack, Divider, Container, Alert, MenuItem, Checkbox, FormControlLabel, CircularProgress
} from '@mui/material';
import { MapPin, Search, Navigation, ArrowRight, ArrowLeft, Crosshair, AlertTriangle, RefreshCcw, Info } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';

const EMIRATES_LIST = [
    { id: 'Dubai', key: 'onboarding.emirate.dubai' },
    { id: 'Abu Dhabi', key: 'onboarding.emirate.abudhabi' },
    { id: 'Sharjah', key: 'onboarding.emirate.sharjah' },
    { id: 'Ajman', key: 'onboarding.emirate.ajman' },
    { id: 'Umm Al Quwain', key: 'onboarding.emirate.ummalquwain' },
    { id: 'Ras Al Khaimah', key: 'onboarding.emirate.rasalkhaimah' },
    { id: 'Fujairah', key: 'onboarding.emirate.fujairah' }
];

const GOOGLE_MAPS_SCRIPT_ID = 'bin-google-maps-js';

const getGoogleMapsApiKey = (): string | null => {
    const key = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
    if (!key || key.includes('%') || key === 'YOUR_PRODUCTION_API_KEY_HERE' || key === 'REPLACE_ME') return null;
    return key;
};

const loadGoogleMapsScript = (apiKey: string): Promise<void> => {
    if ((window as any).google?.maps) return Promise.resolve();
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
        return new Promise((resolve) => {
            existing.addEventListener('load', () => resolve(), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = GOOGLE_MAPS_SCRIPT_ID;
        script.async = true;
        script.defer = true;
        script.src = `https://maps.googleapis.com/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&v=weekly`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('GOOGLE_MAPS_SCRIPT_ERROR'));
        document.head.appendChild(script);
    });
};

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
    const [manualEntry, setManualEntry] = useState(false);
    const [manualLat, setManualLat] = useState('');
    const [manualLng, setManualLng] = useState('');
    const [initializing, setInitializing] = useState(true);

    const activeProperty = properties[0];
    const isManualMode = manualEntry || mapFailed;

    const commitGeoAnchor = (payload: { lat: number; lng: number; address?: string; emirate?: string; city?: string; area?: string; placeId?: string; source?: 'google_maps' | 'title_deed' | 'admin_manual'; verified?: boolean; requiresGeoReview?: boolean; dispatchReady?: boolean }) => {
        try {
            const isManual = payload.source === 'admin_manual' || manualEntry;
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
                placeId: payload.placeId || activeProperty?.googlePlaceId || (isManual ? 'MANUAL' : undefined),
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
            setManualLat(String(geo.lat));
            setManualLng(String(geo.lng));
            setLocationError(null);
        } catch (err: any) {
            console.error("Geo Commit Error:", err);
            setLocationError(err?.message || 'Verification failed. Manual entry required.');
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

    const initAutocomplete = async () => {
        setInitializing(true);
        setMapFailed(false);
        try {
            const apiKey = getGoogleMapsApiKey();
            if (!apiKey) throw new Error("MISSING_GOOGLE_MAPS_API_KEY");

            await loadGoogleMapsScript(apiKey);
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
                    commitGeoAnchor({ address: place.formatted_address, placeId: place.place_id, lat, lng, ...parts });
                    mapInstanceRef.current?.setCenter({ lat, lng });
                    markerRef.current?.setPosition({ lat, lng });
                });
            }

            if (mapRef.current) {
                const initial = activeProperty?.location || { lat: 25.2048, lng: 55.2708 };
                mapInstanceRef.current = new mapsLibrary.Map(mapRef.current, {
                    center: initial, zoom: activeProperty?.location ? 16 : 10,
                    mapTypeControl: false, streetViewControl: false,
                    styles: [{ "elementType": "geometry", "stylers": [{ "color": "#212121" }] }]
                });
                markerRef.current = new googleMaps.Marker({
                    map: mapInstanceRef.current, position: initial, draggable: true
                });
                markerRef.current.addListener('dragend', () => {
                    const pos = markerRef.current.getPosition();
                    geocoderRef.current.geocode({ location: pos }, (results: any[]) => {
                        if (results?.[0]) {
                            const parts = extractAddressParts(results[0].address_components);
                            commitGeoAnchor({ lat: pos.lat(), lng: pos.lng(), address: results[0].formatted_address, ...parts });
                        }
                    });
                });
            }
            setManualEntry(false);
        } catch (e: any) {
            setMapFailed(true);
            setManualEntry(true);
            setLocationError("Google Maps unavailable. Falling back to manual entry.");
        } finally {
            setInitializing(false);
        }
    };

    useEffect(() => { initAutocomplete(); }, []);

    const handleManualCommit = () => {
        const lat = Number(manualLat); const lng = Number(manualLng);
        if (!isValidLatLng(lat, lng)) { setLocationError("Enter valid coordinates."); return; }
        commitGeoAnchor({ lat, lng, source: 'admin_manual', verified: false, requiresGeoReview: true, dispatchReady: false });
        onNext();
    };

    const canProceed = (activeProperty?.address && activeProperty?.emirate && activeProperty?.geo && !isManualMode) || (isManualMode && activeProperty?.emirate && activeProperty?.address && isValidLatLng(Number(manualLat), Number(manualLng)));

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1 }}>{t('onboarding.location_title')}</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>{t('onboarding.location_desc')}</Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        {mapFailed && (
                            <Alert severity="warning" action={<Button size="small" color="inherit" onClick={initAutocomplete} startIcon={<RefreshCcw size={14}/>}>{t('onboarding.retry_scan')}</Button>}>
                                {locationError}
                            </Alert>
                        )}

                        {!isManualMode ? (
                            <>
                                <TextField fullWidth inputRef={autocompleteRef} placeholder={t('onboarding.location_placeholder')} value={activeProperty?.address || ''} onChange={(e) => updateProperty(0, { address: e.target.value })} 
                                    InputProps={{ startAdornment: (<InputAdornment position="start"><Search color={binThemeTokens.gold} size={20} /></InputAdornment>), sx: { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)', color: '#FFF' } }}
                                />
                                <Box sx={{ position: 'relative' }}>
                                    <Box ref={mapRef} sx={{ width: '100%', height: 350, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: '#000' }} />
                                    {initializing && (
                                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 4 }}>
                                            <CircularProgress sx={{ color: binThemeTokens.gold }} />
                                        </Box>
                                    )}
                                </Box>
                                <Button onClick={() => setManualEntry(true)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>{t('onboarding.location_manual')}</Button>
                            </>
                        ) : (
                            <Stack spacing={3}>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>{t('onboarding.location_manual_title')}</Typography>
                                <TextField select fullWidth label={t('onboarding.emirate')} value={activeProperty?.emirate || ''} onChange={(e) => updateProperty(0, { emirate: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }}>
                                    {EMIRATES_LIST.map(e => <MenuItem key={e.id} value={e.id}>{t(e.key)}</MenuItem>)}
                                </TextField>
                                <TextField fullWidth label={t('onboarding.address')} value={activeProperty?.address || ''} onChange={(e) => updateProperty(0, { address: e.target.value })} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} />
                                <Grid container spacing={2}>
                                    <Grid item xs={6}><TextField fullWidth label="Latitude" value={manualLat} onChange={(e) => setManualLat(e.target.value)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                    <Grid item xs={6}><TextField fullWidth label="Longitude" value={manualLng} onChange={(e) => setManualLng(e.target.value)} sx={{ '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' }, '& .MuiOutlinedInput-root': { color: '#FFF' } }} /></Grid>
                                </Grid>
                                <Alert severity="info" icon={<Info size={18}/>}>{t('onboarding.location_manual_info')}</Alert>
                            </Stack>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <Button variant="outlined" onClick={onBack} startIcon={!isRTL ? <ArrowLeft /> : null} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : null} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>{t('onboarding.back')}</Button>
                            <Button variant="contained" size="large" onClick={isManualMode ? handleManualCommit : onNext} disabled={!canProceed} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
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

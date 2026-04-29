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

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'];

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { tx } = useLanguage();
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

            const combined = `${resolvedEmirate} ${resolvedCity} ${resolvedArea}`.toLowerCase();

            if (combined.includes("falaj hazza")) {
                resolvedEmirate = "Abu Dhabi";
                resolvedCity = "Al Ain";
                resolvedArea = "Falaj Hazza";
            } else if (combined.includes("al ain")) {
                resolvedEmirate = "Abu Dhabi";
                resolvedCity = "Al Ain";
                resolvedArea = resolvedArea || "Al Ain Central";
            }

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
            const waitForGoogleMaps = async () => {
                const startedAt = Date.now();
                while (!(window as any).google?.maps?.importLibrary && Date.now() - startedAt < 8000) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
                return (window as any).google?.maps;
            };

            const googleMaps = await waitForGoogleMaps();
            if (!googleMaps) throw new Error("TIMEOUT");

            const mapsLibrary = await googleMaps.importLibrary('maps');
            const placesLibrary = await googleMaps.importLibrary('places');
            const geocodingLibrary = await googleMaps.importLibrary('geocoding');
            
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
            const apiKey = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || (window as any).VITE_GOOGLE_MAPS_API_KEY;
            const isPlaceholder = apiKey === 'YOUR_PRODUCTION_API_KEY_HERE' || !apiKey;
            
            console.error("GOOGLE_MAPS_LOAD_FAILED", {
                reason: isPlaceholder ? "MISSING_API_KEY" : (e?.message || "Unknown initialization error"),
                apiKeyPresent: !isPlaceholder,
                currentDomain: window.location.hostname
            });
            setMapFailed(true);
            setManualEntry(true);
            if (isPlaceholder) {
                setLocationError("Google Maps API Key not configured. Using manual fallback.");
            }
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
                <Typography variant="overline" sx={{ color: binThemeTokens.gold, fontWeight: 950, letterSpacing: 4 }}>SOVEREIGN SPATIAL NODE</Typography>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>LOCATION IDENTIFICATION</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>Identify geographic coordinates for dispatch optimization.</Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        {mapFailed && (
                            <Alert 
                                severity="warning" 
                                icon={<AlertTriangle />} 
                                sx={{ bgcolor: 'rgba(198, 167, 94, 0.05)', color: binThemeTokens.gold, border: `1px solid ${alpha(binThemeTokens.gold, 0.2)}` }} 
                                action={<Button size="small" color="inherit" onClick={initAutocomplete} startIcon={<RefreshCcw size={14}/>}>RETRY</Button>}
                            >
                                {locationError || "Map unavailable. Please configure Google Maps API key or use manual entry below."}
                            </Alert>
                        )}

                        {!isManualMode ? (
                            <>
                                <TextField fullWidth inputRef={autocompleteRef} placeholder="Search for property address in UAE..." value={activeProperty?.address || ''} onChange={(e) => updateProperty(0, { address: e.target.value })} 
                                    InputProps={{ startAdornment: (<InputAdornment position="start"><Search color={binThemeTokens.gold} size={20} /></InputAdornment>), sx: { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)' } }}
                                />
                                <Box sx={{ position: 'relative' }}>
                                    <Box ref={mapRef} sx={{ width: '100%', height: 350, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)', bgcolor: '#000' }} />
                                    {initializing && (
                                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.5)', borderRadius: 4 }}>
                                            <CircularProgress sx={{ color: binThemeTokens.gold }} />
                                        </Box>
                                    )}
                                </Box>
                                <Stack direction="row" spacing={2}>
                                    <Button onClick={() => setManualEntry(true)} sx={{ color: binThemeTokens.gold, fontWeight: 900 }}>Manual Review Mode</Button>
                                </Stack>
                            </>
                        ) : (
                            <Stack spacing={3}>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>MANUAL LOCATION ENTRY</Typography>
                                <TextField select fullWidth label="Emirate" value={activeProperty?.emirate || ''} onChange={(e) => updateProperty(0, { emirate: e.target.value })}>
                                    {EMIRATES.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                                </TextField>
                                <TextField fullWidth label="City / Area" value={activeProperty?.area || ''} onChange={(e) => updateProperty(0, { area: e.target.value, city: e.target.value })} />
                                <TextField fullWidth multiline rows={3} label="Full Address / Landmark" value={activeProperty?.address || ''} onChange={(e) => updateProperty(0, { address: e.target.value })} />
                                <Grid container spacing={2}>
                                    <Grid item xs={6}><TextField fullWidth label="Latitude" value={manualLat} onChange={(e) => setManualLat(e.target.value)} /></Grid>
                                    <Grid item xs={6}><TextField fullWidth label="Longitude" value={manualLng} onChange={(e) => setManualLng(e.target.value)} /></Grid>
                                </Grid>
                                <Alert severity="info" icon={<Info size={18}/>}>Manual geo requires Administrative Review before technician dispatch.</Alert>
                            </Stack>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                            <Button variant="outlined" onClick={onBack} startIcon={<ArrowLeft />} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>BACK</Button>
                            <Button variant="contained" size="large" onClick={isManualMode ? handleManualCommit : onNext} disabled={!canProceed} endIcon={<ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>
                                CONTINUE
                            </Button>
                        </Box>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;

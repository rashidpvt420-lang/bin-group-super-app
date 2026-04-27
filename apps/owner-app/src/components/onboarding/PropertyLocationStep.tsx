import React, { useRef, useEffect, useState } from 'react';
import { 
    Box, Typography, Grid, Paper, alpha, TextField, 
    InputAdornment, Button, Stack, Divider, Container, Alert, MenuItem, Checkbox, FormControlLabel
} from '@mui/material';
import { MapPin, Search, Navigation, ArrowRight, ArrowLeft, Crosshair, AlertTriangle } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '../../context/LanguageContext';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';

const EMIRATES = ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah', 'Al Ain'];

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
    const [mapFailed, setMapFailed] = useState(false);
    const [manualEntry, setManualEntry] = useState(false);

    const activeProperty = properties[0];

    const commitGeoAnchor = (payload: { lat: number; lng: number; address?: string; emirate?: string; city?: string; area?: string; placeId?: string; source?: 'google_maps' | 'title_deed' | 'admin_manual'; verified?: boolean; requiresGeoReview?: boolean }) => {
        try {
            const isManual = payload.source === 'admin_manual' || manualEntry;
            const geo = buildPersistableGeoAnchor({
                lat: payload.lat ?? 0,
                lng: payload.lng ?? 0,
                address: payload.address || activeProperty?.address,
                emirate: payload.emirate || activeProperty?.emirate,
                city: payload.city || activeProperty?.city || payload.area || activeProperty?.area,
                area: payload.area || activeProperty?.area || payload.city,
                placeId: payload.placeId || activeProperty?.googlePlaceId || 'MANUAL',
                source: payload.source || (isManual ? 'admin_manual' : 'google_maps'),
                verified: payload.verified ?? !isManual,
                verifiedBy: null
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
            setLocationError(null);
        } catch (err: any) {
            console.error("Geo Commit Error:", err);
            setLocationError(err?.message || 'We could not verify this location. Manual entry required.');
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
            commitGeoAnchor({ lat, lng, source: 'admin_manual', verified: false, requiresGeoReview: true });
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
                commitGeoAnchor({ lat, lng, source: 'admin_manual', verified: false, requiresGeoReview: true });
            }
        });
    };

    const moveMarker = (lat: number, lng: number) => {
        if (!isValidLatLng(lat, lng)) return;
        const position = { lat, lng };
        mapInstanceRef.current?.setCenter(position);
        markerRef.current?.setPosition(position);
        reverseGeocode(lat, lng);
    };

    useEffect(() => {
        const initAutocomplete = async () => {
            try {
                if (!(window as any).google?.maps) {
                    setTimeout(() => { if (!(window as any).google?.maps) setMapFailed(true); }, 5000);
                    return;
                }
                const googleMaps = (window as any).google.maps;
                
                // Using standard Geocoder instead of importLibrary for broader compatibility
                geocoderRef.current = new googleMaps.Geocoder();

                if (autocompleteRef.current) {
                    const autocomplete = new googleMaps.places.Autocomplete(autocompleteRef.current, {
                        componentRestrictions: { country: "ae" },
                        fields: ["address_components", "geometry", "formatted_address", "place_id"],
                        types: ["address"]
                    });

                    autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry) return;
                        const address = place.formatted_address;
                        const parts = extractAddressParts(place.address_components || []);
                        const lat = place.geometry.location.lat();
                        const lng = place.geometry.location.lng();
                        commitGeoAnchor({ address, placeId: place.place_id, lat, lng, ...parts });
                        mapInstanceRef.current?.setZoom(16);
                        markerRef.current?.setPosition({ lat, lng });
                        mapInstanceRef.current?.setCenter({ lat, lng });
                    });
                    googleAutocompleteRef.current = autocomplete;
                }

                if (mapRef.current && !mapInstanceRef.current) {
                    const initial = activeProperty?.location || { lat: 24.4539, lng: 54.3773 };
                    mapInstanceRef.current = new googleMaps.Map(mapRef.current, {
                        center: initial,
                        zoom: activeProperty?.location ? 16 : 7,
                        mapTypeControl: false,
                        streetViewControl: false
                    });
                    markerRef.current = new googleMaps.Marker({
                        map: mapInstanceRef.current,
                        position: initial,
                        draggable: true
                    });
                    markerRef.current.addListener('dragend', () => {
                        const pos = markerRef.current.getPosition();
                        moveMarker(pos.lat(), pos.lng());
                    });
                }
                setManualEntry(false);
            } catch (e) {
                console.error("Maps fail:", e);
                setMapFailed(true);
            }
        };

        initAutocomplete();
    }, []);

    const handleManualCommit = () => {
        if (!activeProperty?.address || !activeProperty?.emirate) {
            setLocationError("Emirate and Address are required for manual entry.");
            return;
        }
        commitGeoAnchor({
            lat: activeProperty?.location?.lat || 0,
            lng: activeProperty?.location?.lng || 0,
            source: 'admin_manual',
            verified: false,
            requiresGeoReview: true
        });
        onNext();
    };

    const canProceed = (activeProperty?.address && activeProperty?.emirate && activeProperty?.geo && !manualEntry) || (manualEntry && activeProperty?.emirate && activeProperty?.address);

    return (
        <Box sx={{ py: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF' }}>LOCATION IDENTIFICATION</Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>Identify geographic coordinates for dispatch optimization.</Typography>
            </Box>

            <Container maxWidth="md">
                <Paper sx={{ p: { xs: 3, md: 6 }, borderRadius: 6, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <Stack spacing={4}>
                        {(mapFailed || (window as any).google_maps_error) && (
                            <Alert severity="error" icon={<AlertTriangle />} sx={{ bgcolor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                                Google Maps failed to load. Please use manual entry below to continue.
                            </Alert>
                        )}

                        {!manualEntry && !mapFailed ? (
                            <>
                                <TextField
                                    fullWidth
                                    inputRef={autocompleteRef}
                                    placeholder="Search for property address in UAE..."
                                    value={activeProperty?.address || ''}
                                    onChange={(e) => updateProperty(0, { address: e.target.value })}
                                    InputProps={{
                                        startAdornment: (<InputAdornment position="start"><Search color={binThemeTokens.gold} size={20} /></InputAdornment>),
                                        sx: { borderRadius: 3, bgcolor: 'rgba(255,255,255,0.02)' }
                                    }}
                                />
                                <Box ref={mapRef} sx={{ width: '100%', height: 350, borderRadius: 4, border: '1px solid rgba(198,167,94,0.18)' }} />
                                <Button onClick={() => setManualEntry(true)} sx={{ color: binThemeTokens.gold }}>Switch to Manual Entry</Button>
                            </>
                        ) : (
                            <Stack spacing={3}>
                                <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold }}>MANUAL LOCATION ENTRY</Typography>
                                <TextField 
                                    select fullWidth label="Emirate" 
                                    value={activeProperty?.emirate || ''} 
                                    onChange={(e) => updateProperty(0, { emirate: e.target.value })}
                                >
                                    {EMIRATES.map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
                                </TextField>
                                <TextField 
                                    fullWidth label="City / Area" 
                                    value={activeProperty?.area || ''} 
                                    onChange={(e) => updateProperty(0, { area: e.target.value, city: e.target.value })} 
                                />
                                <TextField 
                                    fullWidth multiline rows={3} label="Full Address / Landmark" 
                                    value={activeProperty?.address || ''} 
                                    onChange={(e) => updateProperty(0, { address: e.target.value })} 
                                />
                                {locationError && <Typography variant="caption" color="error">{locationError}</Typography>}
                                <FormControlLabel 
                                    control={<Checkbox checked={true} disabled />} 
                                    label={<Typography variant="caption">Mark for Administrative Geo-Review (Required for activation)</Typography>} 
                                />
                                {!mapFailed && <Button onClick={() => setManualEntry(false)} sx={{ color: binThemeTokens.gold }}>Return to Map</Button>}
                            </Stack>
                        )}

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
                            <Button variant="outlined" onClick={onBack} startIcon={<ArrowLeft />} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>BACK</Button>
                            <Button 
                                variant="contained" size="large" 
                                onClick={manualEntry ? handleManualCommit : onNext} 
                                disabled={!canProceed}
                                endIcon={<ArrowRight />}
                                sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}
                            >
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Typography, Grid, Paper, TextField,
    Button, Stack, Divider, Container, Alert, MenuItem, CircularProgress, alpha
} from '@mui/material';
import { MapPin, ArrowRight, ArrowLeft, ExternalLink, LocateFixed, Navigation, Search } from 'lucide-react';
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

const GOOGLE_MAPS_URL_PATTERN = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[^\s/]+\/maps|maps\.google\.[^\s/]+)/i;
const GOOGLE_MAPS_SHORT_URL_PATTERN = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;

const readable = (value: string | undefined, fallback: string) => {
    if (!value || value.includes('.')) return fallback;
    return value;
};

const getEmirate = (emirate?: string) => EMIRATES_LIST.find((em) => em.id === emirate) || EMIRATES_LIST[0];

const safeDecode = (value: string) => {
    try {
        return decodeURIComponent(value || '');
    } catch {
        return value || '';
    }
};

const looksLikeGoogleMapsUrl = (value?: string | null) => GOOGLE_MAPS_URL_PATTERN.test(value || '');
const isShortGoogleMapsUrl = (value?: string | null) => GOOGLE_MAPS_SHORT_URL_PATTERN.test(value || '');

const findGoogleMapsInput = (...values: Array<string | undefined | null>) => (
    values.find((value) => looksLikeGoogleMapsUrl(value)) || ''
).trim();

type RemoteAddressResult = {
    lat: number;
    lng: number;
    address: string;
    emirate?: string;
    city?: string;
    area?: string;
    placeId?: string;
};

const parseCoordinatesFromText = (value: string): { lat: number; lng: number } | null => {
    const decoded = safeDecode(value || '');

    const googleLatLng = decoded.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (googleLatLng) {
        const lat = Number(googleLatLng[1]);
        const lng = Number(googleLatLng[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng };
    }

    const googleLngLat = decoded.match(/!4d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)/);
    if (googleLngLat) {
        const lat = Number(googleLngLat[2]);
        const lng = Number(googleLngLat[1]);
        if (isValidLatLng(lat, lng)) return { lat, lng };
    }

    const patterns = [
        /@(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
        /[?&](?:q|ll|query|center|destination|origin)=loc:(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
        /[?&](?:q|ll|query|center|destination|origin)=(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/,
        /(?:^|\s)(-?\d{1,2}\.\d{4,})\s*,\s*(-?\d{1,3}\.\d{4,})(?:\s|$)/
    ];

    for (const pattern of patterns) {
        const match = decoded.match(pattern);
        if (!match) continue;
        const lat = Number(match[1]);
        const lng = Number(match[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng };
    }
    return null;
};

const fieldSx = {
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
    '& .MuiOutlinedInput-root': {
        color: '#FFF',
        bgcolor: 'rgba(255,255,255,0.03)',
        '& fieldset': { borderColor: 'rgba(198,167,94,0.18)' },
        '&:hover fieldset': { borderColor: 'rgba(198,167,94,0.38)' },
        '&.Mui-focused fieldset': { borderColor: binThemeTokens.gold }
    }
};

const PropertyLocationStep: React.FC<{ onNext: () => void; onBack: () => void }> = ({ onNext, onBack }) => {
    const { properties, updateProperty } = useOnboardingStore();
    const { t, isRTL } = useLanguage();

    const activeProperty = properties[0];
    const fallbackEmirate = getEmirate(activeProperty?.emirate);

    const [locationError, setLocationError] = useState<string | null>(null);
    const [locating, setLocating] = useState(false);
    const [resolvingAddress, setResolvingAddress] = useState(false);
    const [manualLat, setManualLat] = useState(String(activeProperty?.location?.lat || activeProperty?.geo?.lat || fallbackEmirate.lat));
    const [manualLng, setManualLng] = useState(String(activeProperty?.location?.lng || activeProperty?.geo?.lng || fallbackEmirate.lng));
    const [googleMapsUrlField, setGoogleMapsUrlField] = useState(activeProperty?.googleMapsUrl || activeProperty?.location?.googleMapsUrl || '');
    const [plusCodeField, setPlusCodeField] = useState(activeProperty?.plusCode || activeProperty?.location?.plusCode || '');

    const { isLoaded: mapsLoaded } = useGoogleMaps();
    const mapDivRef = useRef<HTMLDivElement | null>(null);
    const mapObjRef = useRef<any>(null);
    const markerObjRef = useRef<any>(null);
    const commitGeoAnchorRef = useRef<(payload: any) => void>(() => {});

    useEffect(() => {
        if (!activeProperty?.emirate) {
            updateProperty(0, { emirate: fallbackEmirate.id, city: fallbackEmirate.id } as any);
        }
        if (!activeProperty?.location?.lat && !activeProperty?.geo?.lat) {
            setManualLat(String(fallbackEmirate.lat));
            setManualLng(String(fallbackEmirate.lng));
        }
    }, []);

    const directGoogleMapsInput = useMemo(
        () => findGoogleMapsInput(googleMapsUrlField, activeProperty?.address),
        [googleMapsUrlField, activeProperty?.address]
    );
    const hasShortGoogleMapsLink = isShortGoogleMapsUrl(directGoogleMapsInput);

    const googleMapsUrl = useMemo(() => directGoogleMapsInput || buildGoogleMapsSearchUrl({
        lat: manualLat,
        lng: manualLng,
        address: activeProperty?.address,
        emirate: activeProperty?.emirate || fallbackEmirate.id
    }), [directGoogleMapsInput, manualLat, manualLng, activeProperty?.address, activeProperty?.emirate, fallbackEmirate.id]);

    const osmPreviewUrl = useMemo(() => {
        const lat = Number(manualLat) || fallbackEmirate.lat;
        const lng = Number(manualLng) || fallbackEmirate.lng;
        const padding = 0.004;
        return `https://www.openstreetmap.org/export/embed.html?bbox=${lng - padding},${lat - padding},${lng + padding},${lat + padding}&layer=mapnik&marker=${lat},${lng}`;
    }, [manualLat, manualLng, fallbackEmirate.lat, fallbackEmirate.lng]);

    const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const patch: any = { address: val };
        if (looksLikeGoogleMapsUrl(val)) {
            setGoogleMapsUrlField(val);
            patch.googleMapsUrl = val;
            patch.location = {
                ...(activeProperty?.location || {}),
                googleMapsUrl: val
            };
        }
        updateProperty(0, patch);
    };

    const handleGoogleMapsUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setGoogleMapsUrlField(val);
        updateProperty(0, {
            googleMapsUrl: val,
            location: {
                ...(activeProperty?.location || {}),
                googleMapsUrl: val
            } as any
        } as any);
    };

    const handlePlusCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setPlusCodeField(val);
        updateProperty(0, {
            plusCode: val,
            location: {
                ...(activeProperty?.location || {}),
                plusCode: val
            } as any
        } as any);
    };

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
        dispatchReady?: boolean;
    }) => {
        try {
            const isManual = payload.source === 'admin_manual' || !payload.placeId || payload.placeId === 'MANUAL' || payload.placeId === 'REMOTE_ADDRESS';
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
                location: {
                    lat: geo.lat,
                    lng: geo.lng,
                    latitude: geo.lat,
                    longitude: geo.lng,
                    address: geo.address,
                    emirate: geo.emirate,
                    googleMapsUrl: googleMapsUrlField || directGoogleMapsInput,
                    plusCode: plusCodeField,
                    quality: 'EXACT_GPS',
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'owner'
                },
                lat: geo.lat,
                lng: geo.lng,
                latitude: geo.lat,
                longitude: geo.lng,
                googleMapsUrl: googleMapsUrlField || directGoogleMapsInput,
                plusCode: plusCodeField
            } as any);

            setManualLat(String(Number(payload.lat.toFixed(7))));
            setManualLng(String(Number(payload.lng.toFixed(7))));
            setLocationError(null);
        } catch (err: any) {
            console.error('Geo Commit Error:', err);
            setLocationError(err?.message || 'Location verification failed.');
        }
    };

    useEffect(() => {
        commitGeoAnchorRef.current = commitGeoAnchor;
    });

    useEffect(() => {
        if (!mapsLoaded || !mapDivRef.current) return;
        const g = (window as any).google;
        if (!g?.maps) return;

        const initialLat = Number(manualLat) || fallbackEmirate.lat;
        const initialLng = Number(manualLng) || fallbackEmirate.lng;
        const hasPreciseAnchor = Boolean(activeProperty?.geo?.lat || activeProperty?.location?.lat);

        const map = new g.maps.Map(mapDivRef.current, {
            center: { lat: initialLat, lng: initialLng },
            zoom: hasPreciseAnchor ? 18 : 12,
            mapTypeId: 'hybrid',
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: true,
            clickableIcons: false
        });

        const marker = new g.maps.Marker({
            position: { lat: initialLat, lng: initialLng },
            map,
            draggable: true,
            title: 'Drag to the exact property location'
        });

        const geocoder = new g.maps.Geocoder();

        const applyPin = (lat: number, lng: number) => {
            geocoder.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
                const resolved = status === 'OK' ? results?.[0] : null;
                commitGeoAnchorRef.current({
                    lat,
                    lng,
                    address: resolved?.formatted_address,
                    placeId: resolved?.place_id || 'MAP_PIN',
                    source: 'google_maps',
                    verified: true,
                    requiresGeoReview: false,
                    dispatchReady: true
                });
            });
        };

        marker.addListener('dragend', () => {
            const pos = marker.getPosition();
            if (!pos) return;
            applyPin(Number(pos.lat().toFixed(7)), Number(pos.lng().toFixed(7)));
        });

        map.addListener('click', (event: any) => {
            if (!event.latLng) return;
            const lat = Number(event.latLng.lat().toFixed(7));
            const lng = Number(event.latLng.lng().toFixed(7));
            marker.setPosition({ lat, lng });
            applyPin(lat, lng);
        });

        mapObjRef.current = map;
        markerObjRef.current = marker;

        return () => {
            g.maps.event.clearInstanceListeners(marker);
            g.maps.event.clearInstanceListeners(map);
            mapObjRef.current = null;
            markerObjRef.current = null;
        };
    }, [mapsLoaded]);

    useEffect(() => {
        if (!mapObjRef.current || !markerObjRef.current) return;
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!isValidLatLng(lat, lng)) return;
        const position = { lat, lng };
        markerObjRef.current.setPosition(position);
        mapObjRef.current.panTo(position);
    }, [manualLat, manualLng]);

    const handleEmirateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const emirateId = e.target.value;
        const emirateData = getEmirate(emirateId);
        updateProperty(0, { emirate: emirateId, city: emirateId } as any);
        setManualLat(String(emirateData.lat));
        setManualLng(String(emirateData.lng));
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
    };

    const resolveWithOpenStreetMap = async (queryText: string): Promise<RemoteAddressResult | null> => {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ae&addressdetails=1&q=${encodeURIComponent(queryText)}`, {
            headers: { Accept: 'application/json' }
        });
        if (!response.ok) return null;
        const results = await response.json();
        const first = Array.isArray(results) ? results[0] : null;
        if (!first?.lat || !first?.lon) return null;
        const address = first.address || {};
        return {
            lat: Number(first.lat),
            lng: Number(first.lon),
            address: first.display_name || queryText,
            emirate: address.state || activeProperty?.emirate || fallbackEmirate.id,
            city: address.city || address.town || address.village || address.county || activeProperty?.city || activeProperty?.emirate || fallbackEmirate.id,
            area: address.suburb || address.neighbourhood || address.road || activeProperty?.area || '',
            placeId: 'REMOTE_ADDRESS'
        };
    };

    const handleRemotePropertySearch = async () => {
        const enteredAddress = (activeProperty?.address || '').trim();
        const selectedEmirate = activeProperty?.emirate || fallbackEmirate.id;
        const mapsInput = findGoogleMapsInput(enteredAddress, googleMapsUrlField);
        const searchableText = [enteredAddress, googleMapsUrlField, plusCodeField].filter(Boolean).join(' ');

        if (!enteredAddress && !googleMapsUrlField && !plusCodeField) {
            setLocationError('Enter the property address, paste a Google Maps link, or add a Plus Code. You do not need to be at the property.');
            return;
        }

        setResolvingAddress(true);
        setLocationError(null);
        try {
            const parsed = parseCoordinatesFromText(searchableText);
            if (parsed) {
                const addressIsMapLink = looksLikeGoogleMapsUrl(enteredAddress);
                commitGeoAnchor({
                    lat: parsed.lat,
                    lng: parsed.lng,
                    address: addressIsMapLink ? `${selectedEmirate}, UAE` : enteredAddress || `${selectedEmirate}, UAE`,
                    emirate: selectedEmirate,
                    city: activeProperty?.city || selectedEmirate,
                    area: activeProperty?.area || '',
                    source: mapsInput ? 'google_maps' : 'admin_manual',
                    placeId: mapsInput ? 'GOOGLE_MAPS_LINK' : 'MANUAL',
                    verified: Boolean(mapsInput),
                    requiresGeoReview: !mapsInput,
                    dispatchReady: Boolean(mapsInput)
                });
                return;
            }

            if (mapsInput) {
                if (isShortGoogleMapsUrl(mapsInput)) {
                    setLocationError('This is a short Google Maps share link. Open it in Google Maps, copy the full expanded URL that includes @latitude,longitude, or paste the coordinates directly. The Open Google Maps button can still open this link.');
                } else {
                    setLocationError('This Google Maps link does not expose coordinates. Copy the full URL after the map loads, or paste exact latitude and longitude manually.');
                }
                return;
            }

            const cleanAddress = looksLikeGoogleMapsUrl(enteredAddress) ? '' : enteredAddress;
            const queryText = `${cleanAddress || plusCodeField}, ${selectedEmirate}, UAE`;
            const resolved = await resolveWithOpenStreetMap(queryText);

            if (!resolved || !isValidLatLng(resolved.lat, resolved.lng)) {
                setLocationError('Could not find this property address. Add building name, street, area, emirate, or paste a Google Maps link with coordinates.');
                return;
            }

            commitGeoAnchor({
                lat: Number(resolved.lat.toFixed(7)),
                lng: Number(resolved.lng.toFixed(7)),
                address: resolved.address,
                emirate: resolved.emirate || selectedEmirate,
                city: resolved.city || selectedEmirate,
                area: resolved.area || activeProperty?.area || '',
                placeId: 'REMOTE_ADDRESS',
                source: 'admin_manual',
                verified: false,
                requiresGeoReview: true,
                dispatchReady: false
            });
        } catch (error: any) {
            console.error('Remote property lookup failed:', error);
            setLocationError(error?.message || 'Property address lookup failed. Paste a Google Maps link or enter coordinates manually.');
        } finally {
            setResolvingAddress(false);
        }
    };

    const handleContinue = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!activeProperty?.emirate) return setLocationError('Select the emirate before continuing.');
        if (!activeProperty?.address || activeProperty.address.trim().length < 3) return setLocationError('Enter the property address before continuing.');
        if (!isValidLatLng(lat, lng)) return setLocationError('Please enter valid coordinates.');

        commitGeoAnchor({
            lat,
            lng,
            address: activeProperty?.address,
            emirate: activeProperty?.emirate,
            city: activeProperty?.city || activeProperty?.emirate,
            area: activeProperty?.area || '',
            source: 'admin_manual',
            placeId: activeProperty?.googlePlaceId || 'MANUAL',
            verified: false,
            requiresGeoReview: true,
            dispatchReady: false
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNext();
    };

    const canProceed = Boolean(activeProperty?.emirate && activeProperty?.address && isValidLatLng(Number(manualLat), Number(manualLng)));

    return (
        <Box sx={{ py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <style>{`
                .pac-container, .gm-err-container, .gm-err-icon, .gm-err-title, .gm-err-message {
                    display: none !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `}</style>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 6 } }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, fontSize: { xs: '1.65rem', md: '2.125rem' } }}>
                    {readable(t('onboarding.location_title'), 'Property Location')}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Search by property address, drag the pin on the map below, paste a Google Maps link, or enter coordinates. You do not need to be at the property.
                </Typography>
            </Box>

            <Container maxWidth="md" sx={{ px: { xs: 0, sm: 3 } }}>
                <Paper sx={{ p: { xs: 2, sm: 3, md: 6 }, borderRadius: { xs: 3, md: 6 }, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'visible' }}>
                    <Stack spacing={{ xs: 2.5, md: 4 }}>
                        <Stack spacing={2.5}>
                            <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MapPin size={18} /> {readable(t('onboarding.property_address'), 'Property Address')}
                            </Typography>

                            <TextField select fullWidth label={readable(t('onboarding.emirate'), 'Emirate')} value={activeProperty?.emirate || fallbackEmirate.id} onChange={handleEmirateChange} sx={fieldSx}>
                                {EMIRATES_LIST.map(e => <MenuItem key={e.id} value={e.id}>{readable(t(e.key), e.label)}</MenuItem>)}
                            </TextField>

                            <TextField
                                fullWidth
                                name="address"
                                inputProps={{ 'data-testid': 'property-address-input' }}
                                label={readable(t('onboarding.address'), 'Property Address')}
                                placeholder="Building name, street, area, emirate — or paste a Google Maps link"
                                value={activeProperty?.address || ''}
                                onChange={handleAddressChange}
                                autoComplete="off"
                                helperText="Owner can be at home. Paste full Google Maps URLs with @latitude,longitude for auto-preview. Short maps.app.goo.gl links can be opened but must be expanded first."
                                FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.48)', fontWeight: 700 } }}
                                sx={fieldSx}
                            />

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        name="latitude"
                                        inputProps={{ 'data-testid': 'property-latitude-input' }}
                                        label="Latitude"
                                        value={manualLat}
                                        onChange={(e) => setManualLat(e.target.value)}
                                        helperText="Exact property pin. Auto-filled by Find Property Address, map link, or manual entry."
                                        FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.45)', fontWeight: 800 } }}
                                        sx={fieldSx}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        name="longitude"
                                        inputProps={{ 'data-testid': 'property-longitude-input' }}
                                        label="Longitude"
                                        value={manualLng}
                                        onChange={(e) => setManualLng(e.target.value)}
                                        helperText="Exact property pin. Auto-filled by Find Property Address, map link, or manual entry."
                                        FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.45)', fontWeight: 800 } }}
                                        sx={fieldSx}
                                    />
                                </Grid>
                            </Grid>

                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        label="Google Maps URL"
                                        placeholder="Paste full link if the property is elsewhere"
                                        value={googleMapsUrlField}
                                        onChange={handleGoogleMapsUrlChange}
                                        autoComplete="off"
                                        sx={fieldSx}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        label="Plus Code"
                                        placeholder="e.g. 785P+GH Dubai"
                                        value={plusCodeField}
                                        onChange={handlePlusCodeChange}
                                        autoComplete="off"
                                        sx={fieldSx}
                                    />
                                </Grid>
                            </Grid>

                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                                <Button variant="contained" onClick={handleRemotePropertySearch} disabled={resolvingAddress} startIcon={resolvingAddress ? <CircularProgress size={14} /> : <Search size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>Find Property Address</Button>
                                <Button variant="outlined" onClick={handleManualCoordinateCommit} startIcon={<MapPin size={16} />} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.35), fontWeight: 900 }}>Save Coordinates</Button>
                                <Button variant="outlined" onClick={useCurrentLocation} disabled={locating} startIcon={locating ? <CircularProgress size={14} /> : <LocateFixed size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>Use My Current Location</Button>
                                <Button variant="outlined" href={googleMapsUrl} target="_blank" rel="noreferrer" startIcon={<ExternalLink size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>Open in Google Maps</Button>
                            </Stack>

                            {hasShortGoogleMapsLink && (
                                <Alert severity="info">
                                    Short Google Maps share links open correctly, but browsers cannot read their hidden coordinates. Open the link, copy the full URL after Google Maps loads, or paste exact coordinates to update the preview.
                                </Alert>
                            )}
                        </Stack>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.22)', overflow: 'hidden' }}>
                            <Box sx={{ p: 2.5, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
                                <Box>
                                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Navigation size={20} color={binThemeTokens.gold} /> {mapsLoaded ? 'Tap or drag the pin to mark the exact property' : 'Live coordinate map preview'}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                                        {mapsLoaded
                                            ? 'Click anywhere on the map, or drag the gold pin, to set the exact property location. The address and coordinates fields above update automatically.'
                                            : 'Type the property address, paste a full Google Maps URL, or enter coordinates, then click Find Property Address. The owner does not need to be physically at the property.'}
                                    </Typography>
                                </Box>
                                <Button href={googleMapsUrl} target="_blank" rel="noreferrer" variant="contained" startIcon={<ExternalLink size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>
                                    Open Google Maps
                                </Button>
                            </Box>

                            <Box sx={{ height: { xs: 320, md: 420 }, width: '100%', bgcolor: '#050505', borderTop: '1px solid rgba(198,167,94,0.16)' }}>
                                {mapsLoaded ? (
                                    <Box ref={mapDivRef} sx={{ width: '100%', height: '100%' }} />
                                ) : (
                                    <Box
                                        component="iframe"
                                        title="Property coordinate map preview"
                                        src={osmPreviewUrl}
                                        loading="lazy"
                                        sx={{ width: '100%', height: '100%', border: 0 }}
                                    />
                                )}
                            </Box>
                        </Paper>

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

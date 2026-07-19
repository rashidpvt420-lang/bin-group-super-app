import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Box, Typography, Grid, Paper, TextField,
    Button, Stack, Divider, Container, Alert, MenuItem, CircularProgress, alpha, Chip
} from '@mui/material';
import { MapPin, ArrowRight, ArrowLeft, ExternalLink, LocateFixed, Navigation, Search, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useLanguage } from '@bin/shared';
import { binThemeTokens } from '../../theme/binGroupTheme';
import { buildPersistableGeoAnchor, isValidLatLng } from '../../utils/geoAnchor';
import { buildGoogleMapsSearchUrl, useGoogleMaps } from '../../lib/maps';

const EMIRATES_LIST = [
    { id: 'Dubai', key: 'onboarding.emirate.dubai', en: 'Dubai', ar: 'دبي', lat: 25.2048, lng: 55.2708 },
    { id: 'Abu Dhabi', key: 'onboarding.emirate.abudhabi', en: 'Abu Dhabi', ar: 'أبوظبي', lat: 24.4539, lng: 54.3773 },
    { id: 'Sharjah', key: 'onboarding.emirate.sharjah', en: 'Sharjah', ar: 'الشارقة', lat: 25.3463, lng: 55.4209 },
    { id: 'Ajman', key: 'onboarding.emirate.ajman', en: 'Ajman', ar: 'عجمان', lat: 25.4052, lng: 55.5136 },
    { id: 'Umm Al Quwain', key: 'onboarding.emirate.ummalquwain', en: 'Umm Al Quwain', ar: 'أم القيوين', lat: 25.5647, lng: 55.5552 },
    { id: 'Ras Al Khaimah', key: 'onboarding.emirate.rasalkhaimah', en: 'Ras Al Khaimah', ar: 'رأس الخيمة', lat: 25.8007, lng: 55.9762 },
    { id: 'Fujairah', key: 'onboarding.emirate.fujairah', en: 'Fujairah', ar: 'الفجيرة', lat: 25.1288, lng: 56.3265 }
];

const GOOGLE_MAPS_URL_PATTERN = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[^\s/]+\/maps|maps\.google\.[^\s/]+)/i;
const GOOGLE_MAPS_SHORT_URL_PATTERN = /https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;
const readable = (value: string | undefined, fallback: string) => (!value || value.includes('.') ? fallback : value);
const getEmirate = (emirate?: string) => EMIRATES_LIST.find((item) => item.id === emirate) || EMIRATES_LIST[0];
const sameCoordinate = (left: unknown, right: unknown) => Math.abs(Number(left) - Number(right)) < 0.0000002;

const safeDecode = (value: string) => {
    try { return decodeURIComponent(value || ''); } catch { return value || ''; }
};
const looksLikeGoogleMapsUrl = (value?: string | null) => GOOGLE_MAPS_URL_PATTERN.test(value || '');
const isShortGoogleMapsUrl = (value?: string | null) => GOOGLE_MAPS_SHORT_URL_PATTERN.test(value || '');
const findGoogleMapsInput = (...values: Array<string | undefined | null>) => (values.find((value) => looksLikeGoogleMapsUrl(value)) || '').trim();

type RemoteAddressResult = {
    lat: number;
    lng: number;
    address: string;
    emirate?: string;
    city?: string;
    area?: string;
    placeId?: string;
};

type GeoSource = 'google_maps' | 'title_deed' | 'admin_manual' | 'device_gps';

const parseCoordinatesFromText = (value: string): { lat: number; lng: number } | null => {
    const decoded = safeDecode(value || '');
    const embedded = decoded.match(/!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/);
    if (embedded) {
        const lat = Number(embedded[1]);
        const lng = Number(embedded[2]);
        if (isValidLatLng(lat, lng)) return { lat, lng };
    }
    const reverseEmbedded = decoded.match(/!4d(-?\d{1,3}(?:\.\d+)?)!3d(-?\d{1,2}(?:\.\d+)?)/);
    if (reverseEmbedded) {
        const lat = Number(reverseEmbedded[2]);
        const lng = Number(reverseEmbedded[1]);
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
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.64)' },
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
    const { t, isRTL, lang } = useLanguage();
    const copy = (en: string, ar: string) => lang === 'ar' ? ar : en;
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
        if (!activeProperty?.emirate) updateProperty(0, { emirate: fallbackEmirate.id, city: fallbackEmirate.id } as any);
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

    const handleAddressChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        const patch: any = { address: value };
        if (looksLikeGoogleMapsUrl(value)) {
            setGoogleMapsUrlField(value);
            patch.googleMapsUrl = value;
            patch.location = { ...(activeProperty?.location || {}), googleMapsUrl: value };
        }
        updateProperty(0, patch);
    };

    const handleGoogleMapsUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setGoogleMapsUrlField(value);
        updateProperty(0, { googleMapsUrl: value, location: { ...(activeProperty?.location || {}), googleMapsUrl: value } } as any);
    };

    const handlePlusCodeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setPlusCodeField(value);
        updateProperty(0, { plusCode: value, location: { ...(activeProperty?.location || {}), plusCode: value } } as any);
    };

    const commitGeoAnchor = (payload: {
        lat: number;
        lng: number;
        address?: string;
        emirate?: string;
        city?: string;
        area?: string;
        placeId?: string;
        source?: GeoSource;
        verified?: boolean;
        requiresGeoReview?: boolean;
        dispatchReady?: boolean;
        accuracyMeters?: number;
        capturedAt?: string;
    }) => {
        try {
            const source = payload.source || 'admin_manual';
            const isManual = source === 'admin_manual' || !payload.placeId || payload.placeId === 'MANUAL' || payload.placeId === 'REMOTE_ADDRESS';
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
                source,
                verified: payload.verified ?? !isManual,
                requiresGeoReview: payload.requiresGeoReview ?? isManual,
                dispatchReady: payload.dispatchReady ?? !isManual,
                accuracyMeters: payload.accuracyMeters,
                capturedAt: payload.capturedAt,
            });
            updateProperty(0, {
                address: geo.address,
                emirate: geo.emirate,
                city: geo.city,
                area: geo.area,
                googlePlaceId: geo.placeId || 'MANUAL',
                geo: geo as any,
                location: {
                    ...(activeProperty?.location || {}),
                    lat: geo.lat,
                    lng: geo.lng,
                    latitude: geo.lat,
                    longitude: geo.lng,
                    address: geo.address,
                    emirate: geo.emirate,
                    googleMapsUrl: googleMapsUrlField || directGoogleMapsInput,
                    plusCode: plusCodeField,
                    quality: geo.verified ? 'VERIFIED_EXACT_GPS' : 'REVIEW_REQUIRED',
                    source: geo.source,
                    verified: geo.verified,
                    dispatchReady: geo.dispatchReady,
                    requiresGeoReview: geo.requiresGeoReview,
                    accuracyMeters: geo.accuracyMeters,
                    capturedAt: geo.capturedAt,
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
        } catch (error: any) {
            console.error('Geo Commit Error:', error);
            setLocationError(error?.message || copy('Location verification failed.', 'فشل التحقق من الموقع.'));
        }
    };

    useEffect(() => { commitGeoAnchorRef.current = commitGeoAnchor; });

    useEffect(() => {
        if (!mapsLoaded || !mapDivRef.current) return;
        const google = (window as any).google;
        if (!google?.maps) return;
        const initialLat = Number(manualLat) || fallbackEmirate.lat;
        const initialLng = Number(manualLng) || fallbackEmirate.lng;
        const map = new google.maps.Map(mapDivRef.current, {
            center: { lat: initialLat, lng: initialLng },
            zoom: activeProperty?.geo?.lat || activeProperty?.location?.lat ? 18 : 12,
            mapTypeId: 'hybrid',
            streetViewControl: false,
            fullscreenControl: true,
            mapTypeControl: true,
            clickableIcons: false
        });
        const marker = new google.maps.Marker({
            position: { lat: initialLat, lng: initialLng },
            map,
            draggable: true,
            title: copy('Drag to the exact property location', 'اسحب العلامة إلى موقع العقار الدقيق')
        });
        const geocoder = new google.maps.Geocoder();
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
            const position = marker.getPosition();
            if (position) applyPin(Number(position.lat().toFixed(7)), Number(position.lng().toFixed(7)));
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
            google.maps.event.clearInstanceListeners(marker);
            google.maps.event.clearInstanceListeners(map);
            mapObjRef.current = null;
            markerObjRef.current = null;
        };
    }, [mapsLoaded, lang]);

    useEffect(() => {
        if (!mapObjRef.current || !markerObjRef.current) return;
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!isValidLatLng(lat, lng)) return;
        const position = { lat, lng };
        markerObjRef.current.setPosition(position);
        mapObjRef.current.panTo(position);
    }, [manualLat, manualLng]);

    const handleEmirateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const emirateId = event.target.value;
        const emirate = getEmirate(emirateId);
        updateProperty(0, { emirate: emirateId, city: emirateId } as any);
        setManualLat(String(emirate.lat));
        setManualLng(String(emirate.lng));
    };

    const useCurrentLocation = () => {
        if (!navigator.geolocation) {
            setLocationError(copy('Current location is not available on this device. Enter the coordinates manually.', 'الموقع الحالي غير متاح على هذا الجهاز. أدخل الإحداثيات يدوياً.'));
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = Number(position.coords.latitude.toFixed(7));
                const lng = Number(position.coords.longitude.toFixed(7));
                const accuracyMeters = Math.round(position.coords.accuracy || 0);
                const accurateEnough = accuracyMeters > 0 && accuracyMeters <= 50;
                commitGeoAnchor({
                    lat,
                    lng,
                    address: activeProperty?.address || `${activeProperty?.emirate || fallbackEmirate.id}, UAE`,
                    emirate: activeProperty?.emirate || fallbackEmirate.id,
                    city: activeProperty?.city || activeProperty?.emirate || fallbackEmirate.id,
                    area: activeProperty?.area || '',
                    source: 'device_gps',
                    placeId: 'DEVICE_GPS',
                    verified: accurateEnough,
                    requiresGeoReview: !accurateEnough,
                    dispatchReady: accurateEnough,
                    accuracyMeters,
                    capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
                });
                setLocating(false);
            },
            (error) => {
                setLocating(false);
                setLocationError(error.message || copy('Unable to read the current location.', 'تعذر قراءة الموقع الحالي.'));
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
        );
    };

    const handleManualCoordinateCommit = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!isValidLatLng(lat, lng)) {
            setLocationError(copy('Enter valid coordinates.', 'أدخل إحداثيات صحيحة.'));
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
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ae&addressdetails=1&q=${encodeURIComponent(queryText)}`, { headers: { Accept: 'application/json' } });
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
            setLocationError(copy('Enter the property address, a Google Maps link, or a Plus Code.', 'أدخل عنوان العقار أو رابط خرائط Google أو الرمز المكاني Plus Code.'));
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
                setLocationError(isShortGoogleMapsUrl(mapsInput)
                    ? copy('Open the short Google Maps link and paste the expanded URL containing latitude and longitude.', 'افتح رابط خرائط Google المختصر والصق الرابط الكامل الذي يحتوي على خط العرض وخط الطول.')
                    : copy('This Google Maps link does not expose coordinates. Paste the expanded URL or exact coordinates.', 'لا يعرض رابط خرائط Google هذا الإحداثيات. الصق الرابط الكامل أو الإحداثيات الدقيقة.'));
                return;
            }
            const cleanAddress = looksLikeGoogleMapsUrl(enteredAddress) ? '' : enteredAddress;
            const resolved = await resolveWithOpenStreetMap(`${cleanAddress || plusCodeField}, ${selectedEmirate}, UAE`);
            if (!resolved || !isValidLatLng(resolved.lat, resolved.lng)) {
                setLocationError(copy('The property address could not be found. Add the building, street, area and emirate.', 'تعذر العثور على عنوان العقار. أضف اسم المبنى والشارع والمنطقة والإمارة.'));
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
            setLocationError(error?.message || copy('Property-address lookup failed.', 'فشل البحث عن عنوان العقار.'));
        } finally {
            setResolvingAddress(false);
        }
    };

    const handleContinue = () => {
        const lat = Number(manualLat);
        const lng = Number(manualLng);
        if (!activeProperty?.emirate) return setLocationError(copy('Select the emirate before continuing.', 'اختر الإمارة قبل المتابعة.'));
        if (!activeProperty?.address || activeProperty.address.trim().length < 3) return setLocationError(copy('Enter the property address before continuing.', 'أدخل عنوان العقار قبل المتابعة.'));
        if (!isValidLatLng(lat, lng)) return setLocationError(copy('Enter valid coordinates.', 'أدخل إحداثيات صحيحة.'));

        const currentGeo = activeProperty?.geo;
        const coordinatesUnchanged = currentGeo && sameCoordinate(currentGeo.lat, lat) && sameCoordinate(currentGeo.lng, lng);
        if (coordinatesUnchanged) {
            updateProperty(0, {
                address: activeProperty.address,
                emirate: activeProperty.emirate,
                city: activeProperty.city || activeProperty.emirate,
                area: activeProperty.area || '',
                geo: {
                    ...currentGeo,
                    address: activeProperty.address,
                    emirate: activeProperty.emirate,
                    city: activeProperty.city || activeProperty.emirate,
                    area: activeProperty.area || '',
                },
                location: {
                    ...(activeProperty.location || {}),
                    lat,
                    lng,
                    latitude: lat,
                    longitude: lng,
                    address: activeProperty.address,
                    emirate: activeProperty.emirate,
                    googleMapsUrl: googleMapsUrlField || directGoogleMapsInput,
                    plusCode: plusCodeField,
                    source: currentGeo.source,
                    verified: currentGeo.verified,
                    dispatchReady: currentGeo.dispatchReady,
                    requiresGeoReview: currentGeo.requiresGeoReview,
                    updatedAt: new Date().toISOString(),
                },
            } as any);
        } else {
            commitGeoAnchor({
                lat,
                lng,
                address: activeProperty.address,
                emirate: activeProperty.emirate,
                city: activeProperty.city || activeProperty.emirate,
                area: activeProperty.area || '',
                source: 'admin_manual',
                placeId: 'MANUAL',
                verified: false,
                requiresGeoReview: true,
                dispatchReady: false
            });
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        onNext();
    };

    const canProceed = Boolean(activeProperty?.emirate && activeProperty?.address && isValidLatLng(Number(manualLat), Number(manualLng)));
    const locationVerified = activeProperty?.geo?.verified === true;
    const dispatchReady = activeProperty?.geo?.dispatchReady === true;

    return (
        <Box dir={isRTL ? 'rtl' : 'ltr'} sx={{ py: { xs: 1, md: 4 }, pb: { xs: 12, md: 4 }, overflow: 'visible' }}>
            <style>{`.pac-container, .gm-err-container, .gm-err-icon, .gm-err-title, .gm-err-message { display: none !important; visibility: hidden !important; pointer-events: none !important; }`}</style>
            <Box sx={{ textAlign: 'center', mb: { xs: 3, md: 6 } }}>
                <Typography variant="h4" fontWeight="950" sx={{ color: '#FFF', mb: 1, fontSize: { xs: '1.65rem', md: '2.125rem' } }}>
                    {readable(t('onboarding.location_title'), copy('Property Location', 'موقع العقار'))}
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.62)' }}>
                    {copy('Search by address, drag the map pin, paste a Google Maps link, or enter exact coordinates. You do not need to be at the property.', 'ابحث بالعنوان أو اسحب علامة الخريطة أو الصق رابط خرائط Google أو أدخل الإحداثيات الدقيقة. لا يلزم وجودك في العقار.')}
                </Typography>
            </Box>

            <Container maxWidth="md" sx={{ px: { xs: 0, sm: 3 } }}>
                <Paper sx={{ p: { xs: 2, sm: 3, md: 6 }, borderRadius: { xs: 3, md: 6 }, bgcolor: 'rgba(22, 22, 24, 0.6)', border: '1px solid rgba(255,255,255,0.05)', overflow: 'visible' }}>
                    <Stack spacing={{ xs: 2.5, md: 4 }}>
                        <Stack direction={isRTL ? 'row-reverse' : 'row'} spacing={1} flexWrap="wrap" useFlexGap>
                            <Chip icon={locationVerified ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />} label={locationVerified ? copy('Location verified', 'الموقع موثّق') : copy('Location review required', 'مراجعة الموقع مطلوبة')} color={locationVerified ? 'success' : 'warning'} />
                            <Chip label={dispatchReady ? copy('Dispatch ready', 'جاهز للإرسال') : copy('Dispatch locked until review', 'الإرسال مقفل حتى المراجعة')} color={dispatchReady ? 'success' : 'default'} />
                            {activeProperty?.geo?.source && <Chip label={`${copy('Source', 'المصدر')}: ${activeProperty.geo.source}`} />}
                        </Stack>

                        <Typography variant="subtitle1" fontWeight="900" sx={{ color: binThemeTokens.gold, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
                            <MapPin size={18} /> {readable(t('onboarding.property_address'), copy('Property Address', 'عنوان العقار'))}
                        </Typography>

                        <TextField select fullWidth label={readable(t('onboarding.emirate'), copy('Emirate', 'الإمارة'))} value={activeProperty?.emirate || fallbackEmirate.id} onChange={handleEmirateChange} sx={fieldSx}>
                            {EMIRATES_LIST.map((item) => <MenuItem key={item.id} value={item.id}>{readable(t(item.key), copy(item.en, item.ar))}</MenuItem>)}
                        </TextField>

                        <TextField fullWidth name="address" inputProps={{ 'data-testid': 'property-address-input' }} label={readable(t('onboarding.address'), copy('Property Address', 'عنوان العقار'))} placeholder={copy('Building, street, area, emirate — or a Google Maps link', 'المبنى، الشارع، المنطقة، الإمارة — أو رابط خرائط Google')} value={activeProperty?.address || ''} onChange={handleAddressChange} autoComplete="off" helperText={copy('Paste an expanded Google Maps URL containing @latitude,longitude for automatic verification.', 'الصق رابط خرائط Google كاملاً يحتوي على خط العرض والطول للتحقق التلقائي.')} FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.56)', fontWeight: 700 } }} sx={fieldSx} />

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}><TextField fullWidth name="latitude" inputProps={{ 'data-testid': 'property-latitude-input' }} label={copy('Latitude', 'خط العرض')} value={manualLat} onChange={(event) => setManualLat(event.target.value)} helperText={copy('Exact property pin latitude.', 'خط عرض علامة العقار الدقيقة.')} FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.5)', fontWeight: 800 } }} sx={fieldSx} /></Grid>
                            <Grid item xs={12} sm={6}><TextField fullWidth name="longitude" inputProps={{ 'data-testid': 'property-longitude-input' }} label={copy('Longitude', 'خط الطول')} value={manualLng} onChange={(event) => setManualLng(event.target.value)} helperText={copy('Exact property pin longitude.', 'خط طول علامة العقار الدقيقة.')} FormHelperTextProps={{ sx: { color: 'rgba(255,255,255,0.5)', fontWeight: 800 } }} sx={fieldSx} /></Grid>
                        </Grid>

                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={6}><TextField fullWidth label={copy('Google Maps URL', 'رابط خرائط Google')} placeholder={copy('Paste the expanded property link', 'الصق رابط العقار الكامل')} value={googleMapsUrlField} onChange={handleGoogleMapsUrlChange} autoComplete="off" sx={fieldSx} /></Grid>
                            <Grid item xs={12} sm={6}><TextField fullWidth label={copy('Plus Code', 'الرمز المكاني Plus Code')} placeholder={copy('Example: 785P+GH Dubai', 'مثال: 785P+GH دبي')} value={plusCodeField} onChange={handlePlusCodeChange} autoComplete="off" sx={fieldSx} /></Grid>
                        </Grid>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                            <Button variant="contained" onClick={handleRemotePropertySearch} disabled={resolvingAddress} startIcon={resolvingAddress ? <CircularProgress size={14} /> : <Search size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950 }}>{copy('Find Property Address', 'البحث عن عنوان العقار')}</Button>
                            <Button variant="outlined" onClick={handleManualCoordinateCommit} startIcon={<MapPin size={16} />} sx={{ color: binThemeTokens.gold, borderColor: alpha(binThemeTokens.gold, 0.35), fontWeight: 900 }}>{copy('Save Coordinates', 'حفظ الإحداثيات')}</Button>
                            <Button variant="outlined" onClick={useCurrentLocation} disabled={locating} startIcon={locating ? <CircularProgress size={14} /> : <LocateFixed size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{copy('Use My Current Location', 'استخدام موقعي الحالي')}</Button>
                            <Button variant="outlined" href={googleMapsUrl} target="_blank" rel="noreferrer" startIcon={<ExternalLink size={16} />} sx={{ color: '#FFF', borderColor: 'rgba(255,255,255,0.16)', fontWeight: 900 }}>{copy('Open Google Maps', 'فتح خرائط Google')}</Button>
                        </Stack>

                        {hasShortGoogleMapsLink && <Alert severity="info">{copy('Short share links hide coordinates. Open the link and paste the expanded URL after Google Maps loads.', 'تخفي روابط المشاركة المختصرة الإحداثيات. افتح الرابط والصق الرابط الكامل بعد تحميل خرائط Google.')}</Alert>}

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
                        <Paper sx={{ p: 0, borderRadius: 4, bgcolor: 'rgba(198,167,94,0.06)', border: '1px solid rgba(198,167,94,0.22)', overflow: 'hidden' }}>
                            <Box sx={{ p: 2.5, display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2, flexDirection: { xs: 'column', sm: isRTL ? 'row-reverse' : 'row' } }}>
                                <Box sx={{ textAlign: isRTL ? 'right' : 'left' }}>
                                    <Typography variant="h6" sx={{ color: '#FFF', fontWeight: 950, display: 'flex', alignItems: 'center', gap: 1, flexDirection: isRTL ? 'row-reverse' : 'row' }}><Navigation size={20} color={binThemeTokens.gold} />{mapsLoaded ? copy('Tap or drag the pin to mark the exact property', 'اضغط أو اسحب العلامة لتحديد العقار بدقة') : copy('Live coordinate map preview', 'معاينة مباشرة لخريطة الإحداثيات')}</Typography>
                                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.62)' }}>{mapsLoaded ? copy('Click the map or drag the gold pin. Verified map selections remain verified when you continue.', 'اضغط على الخريطة أو اسحب العلامة الذهبية. تبقى المواقع الموثقة موثقة عند المتابعة.') : copy('Enter an address, expanded map link or coordinates, then select Find Property Address.', 'أدخل عنواناً أو رابط خريطة كاملاً أو إحداثيات، ثم اختر البحث عن عنوان العقار.')}</Typography>
                                </Box>
                                <Button href={googleMapsUrl} target="_blank" rel="noreferrer" variant="contained" startIcon={<ExternalLink size={16} />} sx={{ bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, whiteSpace: 'nowrap' }}>{copy('Open Google Maps', 'فتح خرائط Google')}</Button>
                            </Box>
                            <Box sx={{ height: { xs: 320, md: 420 }, width: '100%', bgcolor: '#050505', borderTop: '1px solid rgba(198,167,94,0.16)' }}>
                                {mapsLoaded ? <Box ref={mapDivRef} sx={{ width: '100%', height: '100%' }} /> : <Box component="iframe" title={copy('Property coordinate map preview', 'معاينة خريطة إحداثيات العقار')} src={osmPreviewUrl} loading="lazy" sx={{ width: '100%', height: '100%', border: 0 }} />}
                            </Box>
                        </Paper>

                        {locationError && <Alert severity="warning">{locationError}</Alert>}
                        <Stack direction={{ xs: 'column', sm: isRTL ? 'row-reverse' : 'row' }} spacing={2} sx={{ mt: 2 }}>
                            <Button variant="outlined" onClick={onBack} fullWidth startIcon={!isRTL ? <ArrowLeft /> : undefined} endIcon={isRTL ? <ArrowLeft style={{ transform: 'rotate(180deg)' }} /> : undefined} sx={{ borderRadius: 100, px: 4, color: '#FFF' }}>{readable(t('onboarding.back'), copy('Back', 'رجوع'))}</Button>
                            <Button variant="contained" size="large" onClick={handleContinue} fullWidth disabled={!canProceed} endIcon={isRTL ? <ArrowRight style={{ transform: 'rotate(180deg)' }} /> : <ArrowRight />} sx={{ borderRadius: 100, px: 6, bgcolor: binThemeTokens.gold, color: '#000', fontWeight: 950, py: 1.5 }}>{readable(t('onboarding.continue'), copy('Continue', 'متابعة'))}</Button>
                        </Stack>
                    </Stack>
                </Paper>
            </Container>
        </Box>
    );
};

export default PropertyLocationStep;

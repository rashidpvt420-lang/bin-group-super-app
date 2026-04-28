import { GeoPoint, serverTimestamp } from 'firebase/firestore';
import { GeoAnchor } from '@bin/shared';

type GeoInput = {
    lat: unknown;
    lng: unknown;
    address?: string;
    emirate?: string;
    city?: string;
    area?: string;
    placeId?: string;
    source?: "google_maps" | "title_deed" | "admin_manual";
    verified?: boolean;
    verifiedBy?: string | null;
    requiresGeoReview?: boolean;
    dispatchReady?: boolean;
};

const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export const geohashForLocation = ([latitude, longitude]: [number, number], precision = 9) => {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let geohash = '';
    let latMin = -90;
    let latMax = 90;
    let lonMin = -180;
    let lonMax = 180;

    while (geohash.length < precision) {
        if (evenBit) {
            const lonMid = (lonMin + lonMax) / 2;
            if (longitude >= lonMid) {
                idx = idx * 2 + 1;
                lonMin = lonMid;
            } else {
                idx *= 2;
                lonMax = lonMid;
            }
        } else {
            const latMid = (latMin + latMax) / 2;
            if (latitude >= latMid) {
                idx = idx * 2 + 1;
                latMin = latMid;
            } else {
                idx *= 2;
                latMax = latMid;
            }
        }

        evenBit = !evenBit;
        if (++bit === 5) {
            geohash += base32.charAt(idx);
            bit = 0;
            idx = 0;
        }
    }

    return geohash;
};

export const parseCoordinate = (value: unknown) => {
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
};

export const isValidLatLng = (lat: unknown, lng: unknown) => {
    const latitude = parseCoordinate(lat);
    const longitude = parseCoordinate(lng);
    return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};

export const buildGeoAnchor = (input: GeoInput) => {
    const lat = parseCoordinate(input.lat);
    const lng = parseCoordinate(input.lng);
    const isManual = input.source === 'admin_manual';

    if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
        throw new Error('Please select the property location from Google Maps.');
    }

    if (lat === 0 && lng === 0) {
        throw new Error('Please select the real property location. Default coordinates cannot be used.');
    }

    const address = input.address?.trim() || '';
    if (!address && !input.placeId) {
        throw new Error('Address is required for verification.');
    }

    if (!input.emirate?.trim()) {
        throw new Error('Emirate is required for institutional tracking.');
    }

    return {
        point: new GeoPoint(lat, lng),
        lat,
        lng,
        geohash: geohashForLocation([lat, lng]),
        address,
        emirate: input.emirate.trim(),
        city: input.city?.trim() || input.area?.trim() || input.emirate.trim(),
        area: input.area?.trim() || input.city?.trim() || input.emirate.trim(),
        placeId: input.placeId || (isManual ? 'MANUAL' : null),
        source: input.source || 'google_maps',
        verified: input.verified ?? !isManual,
        verifiedBy: input.verifiedBy || null,
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        requiresGeoReview: !!input.requiresGeoReview || isManual,
        dispatchReady: input.dispatchReady ?? (!isManual && (input.verified ?? true))
    };
};

export const buildPersistableGeoAnchor = (input: GeoInput) => {
    const geo = buildGeoAnchor(input);
    return {
        ...geo,
        point: geo.point ? { latitude: geo.lat, longitude: geo.lng } : null,
        verifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
};

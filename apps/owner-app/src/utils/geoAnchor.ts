import { GeoPoint, serverTimestamp } from 'firebase/firestore';

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
                idx = idx * 2;
                lonMax = lonMid;
            }
        } else {
            const latMid = (latMin + latMax) / 2;
            if (latitude >= latMid) {
                idx = idx * 2 + 1;
                latMin = latMid;
            } else {
                idx = idx * 2;
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

export interface GeoInput {
    lat: string | number;
    lng: string | number;
    address?: string;
    emirate?: string;
    city?: string;
    area?: string;
    placeId?: string;
    source?: string;
    verified?: boolean;
    verifiedBy?: string | null;
    requiresGeoReview?: boolean;
    dispatchReady?: boolean;
}

export interface GeoAnchor {
    point: GeoPoint;
    lat: number;
    lng: number;
    geohash: string;
    address: string;
    emirate: string;
    city: string;
    area: string;
    placeId: string | null;
    source: string;
    verified: boolean;
    requiresGeoReview: boolean;
    dispatchReady: boolean;
    verifiedBy: string | null;
    verifiedAt: any;
    updatedAt: any;
}

const parseCoordinate = (val: any): number | null => {
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
};

export const isValidLatLng = (lat: number, lng: number) => {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const buildPersistableGeoAnchor = (input: GeoInput): GeoAnchor => {
    const source = input.source || "google_maps";
    const isManual = source === "admin_manual";

    const lat = parseCoordinate(input.lat);
    const lng = parseCoordinate(input.lng);

    if (lat === null || lng === null || !isValidLatLng(lat, lng)) {
        throw new Error("Please select the property location from Google Maps or enter valid manual coordinates.");
    }

    const address = input.address?.trim();
    if (!address) {
        throw new Error("Address is required for verification.");
    }

    let emirate = input.emirate?.trim() || "";
    let city = input.city?.trim() || input.area?.trim() || emirate;
    let area = input.area?.trim() || input.city?.trim() || emirate;

    if (!emirate) {
        throw new Error("Emirate is required for institutional tracking.");
    }

    const combined = `${emirate} ${city} ${area}`.toLowerCase();

    // Institutional Correction for Al Ain
    if (combined.includes("falaj hazza")) {
        emirate = "Abu Dhabi";
        city = "Al Ain";
        area = "Falaj Hazza";
    } else if (combined.includes("al ain")) {
        emirate = "Abu Dhabi";
        city = "Al Ain";
        area = area || "Al Ain Central";
    }

    return {
        point: new GeoPoint(lat, lng),
        lat,
        lng,
        geohash: geohashForLocation([lat, lng]),
        address,
        emirate,
        city,
        area,
        placeId: input.placeId || (isManual ? "MANUAL" : null),
        source,
        verified: input.verified ?? !isManual,
        requiresGeoReview: isManual ? true : Boolean(input.requiresGeoReview),
        dispatchReady: isManual ? false : input.dispatchReady ?? true,
        verifiedBy: input.verifiedBy || null,
        verifiedAt: input.verified ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
    };
};

export const buildGeoAnchor = buildPersistableGeoAnchor;

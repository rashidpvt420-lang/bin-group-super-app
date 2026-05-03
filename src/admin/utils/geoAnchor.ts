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

export const buildGeoAnchor = (input: {
    lat: string | number;
    lng: string | number;
    address: string;
    emirate: string;
    city?: string;
    area?: string;
    placeId?: string;
    verifiedBy?: string;
    source?: string;
    verified?: boolean;
}) => {
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new Error('Please select the property location from Google Maps.');
    }
    if (lat === 0 && lng === 0) {
        throw new Error('Default coordinates cannot be used for a property geo-anchor.');
    }
    if (!input.address?.trim() || !input.emirate?.trim()) {
        throw new Error('We could not verify this location. Admin review is required.');
    }
    return {
        point: new GeoPoint(lat, lng),
        lat,
        lng,
        geohash: geohashForLocation([lat, lng]),
        source: input.source || 'admin_verified',
        placeId: input.placeId || '',
        address: input.address.trim(),
        emirate: input.emirate.trim(),
        city: input.city?.trim() || input.area?.trim() || input.emirate.trim(),
        area: input.area?.trim() || input.city?.trim() || input.emirate.trim(),
        verified: input.verified ?? true,
        verifiedBy: input.verifiedBy || 'ADMIN',
        verifiedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };
};

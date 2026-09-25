import { GeoPoint, Timestamp } from 'firebase/firestore';

export interface GeoAnchor {
  point: GeoPoint | null;
  lat: number;
  lng: number;
  geohash: string;
  address: string;
  emirate: string;
  city: string;
  area: string;
  placeId: string | null;
  source: "google_maps" | "title_deed" | "admin_manual" | "device_gps";
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: Timestamp | null;
  updatedAt: Timestamp;
  requiresGeoReview?: boolean;
  dispatchReady?: boolean;
  accuracyMeters?: number | null;
  capturedAt?: Timestamp | null;
}

export function validateGeoAnchor(geo: Partial<GeoAnchor>): string[] {
  const errors: string[] = [];
  if (typeof geo.lat !== 'number' || geo.lat < -90 || geo.lat > 90) errors.push('Invalid latitude');
  if (typeof geo.lng !== 'number' || geo.lng < -180 || geo.lng > 180) errors.push('Invalid longitude');
  if (typeof geo.lat === 'number' && typeof geo.lng === 'number') {
    if (geo.lat === 0 && geo.lng === 0) errors.push('Default zero coordinates are not valid');
    if (looksLikeReversedUaeLatLng(geo.lat, geo.lng)) errors.push('Latitude and longitude appear reversed for a UAE property');
  }
  if (!geo.emirate) errors.push('Emirate is required');
  if (!geo.city && !geo.area) errors.push('City or Area is required');
  if (!geo.address) errors.push('Address is required');
  if (!geo.geohash) errors.push('Geohash is required');
  return errors;
}

const timestampOrNull = (value: unknown): Timestamp | null => {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
};

export function normalizeGeoAnchor(input: any): Partial<GeoAnchor> {
    return {
        lat: input.lat || input.latitude || 0,
        lng: input.lng || input.longitude || 0,
        address: input.address || '',
        emirate: input.emirate || '',
        city: input.city || '',
        area: input.area || '',
        placeId: input.placeId || null,
        source: input.source || 'google_maps',
        verified: !!input.verified,
        verifiedBy: input.verifiedBy || null,
        requiresGeoReview: !!input.requiresGeoReview,
        dispatchReady: input.dispatchReady === true,
        accuracyMeters: Number.isFinite(Number(input.accuracyMeters)) ? Number(input.accuracyMeters) : null,
        capturedAt: timestampOrNull(input.capturedAt),
    };
}

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

export function looksLikeReversedUaeLatLng(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= 51 && lat <= 57 &&
        lng >= 22 && lng <= 27;
}

export function isValidLatLng(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng) &&
           lat >= -90 && lat <= 90 &&
           lng >= -180 && lng <= 180 &&
           !(lat === 0 && lng === 0) &&
           !looksLikeReversedUaeLatLng(lat, lng);
}

export function buildPersistableGeoAnchor(payload: any): GeoAnchor {
    const lat = Number(payload.lat ?? payload.latitude);
    const lng = Number(payload.lng ?? payload.longitude);
    if (!isValidLatLng(lat, lng)) {
        throw new Error(looksLikeReversedUaeLatLng(lat, lng)
            ? 'Latitude and longitude appear reversed for a UAE property.'
            : 'Please select a valid non-zero property coordinate.');
    }
    return {
        point: null,
        lat,
        lng,
        geohash: payload.geohash || '',
        address: payload.address || '',
        emirate: payload.emirate || '',
        city: payload.city || '',
        area: payload.area || '',
        placeId: payload.placeId || null,
        source: payload.source || 'google_maps',
        verified: !!payload.verified,
        verifiedBy: payload.verifiedBy || null,
        verifiedAt: timestampOrNull(payload.verifiedAt),
        updatedAt: Timestamp.now(),
        requiresGeoReview: !!payload.requiresGeoReview,
        dispatchReady: payload.dispatchReady === true,
        accuracyMeters: Number.isFinite(Number(payload.accuracyMeters)) ? Number(payload.accuracyMeters) : null,
        capturedAt: timestampOrNull(payload.capturedAt),
    };
}

export const buildGeoAnchor = buildPersistableGeoAnchor;

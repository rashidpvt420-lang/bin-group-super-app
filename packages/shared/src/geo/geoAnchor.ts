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
  source: "google_maps" | "title_deed" | "admin_manual";
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: Timestamp | null;
  updatedAt: Timestamp;
  requiresGeoReview?: boolean;
}

export function validateGeoAnchor(geo: Partial<GeoAnchor>): string[] {
  const errors: string[] = [];
  if (typeof geo.lat !== 'number' || geo.lat < -90 || geo.lat > 90) errors.push('Invalid latitude');
  if (typeof geo.lng !== 'number' || geo.lng < -180 || geo.lng > 180) errors.push('Invalid longitude');
  if (!geo.emirate) errors.push('Emirate is required');
  if (!geo.city && !geo.area) errors.push('City or Area is required');
  if (!geo.address) errors.push('Address is required');
  if (!geo.geohash) errors.push('Geohash is required');
  return errors;
}

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
    };
}

export function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

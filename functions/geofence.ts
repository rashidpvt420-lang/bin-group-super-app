/** Haversine geofence helpers for technician arrival validation. */

export const DEFAULT_GEOFENCE_RADIUS_M = 150;
export const MAX_GEOFENCE_RADIUS_M = 500;

export function haversineDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function extractCoords(source: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!source || typeof source !== 'object') return null;
  const lat = Number((source as any).lat ?? (source as any).latitude);
  const lng = Number((source as any).lng ?? (source as any).longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function extractPropertyCoords(ticket: Record<string, unknown>): { lat: number; lng: number } | null {
  const keys = ['propertyLocation', 'jobLocation', 'location', 'geo', 'propertyGeo'];
  for (const key of keys) {
    const coords = extractCoords(ticket[key] as Record<string, unknown>);
    if (coords) return coords;
  }
  return null;
}

export function resolveGeofenceRadiusM(ticket: Record<string, unknown>): number {
  const raw = Number(ticket.geofenceRadiusM ?? ticket.arrivalGeofenceM ?? DEFAULT_GEOFENCE_RADIUS_M);
  if (!Number.isFinite(raw)) return DEFAULT_GEOFENCE_RADIUS_M;
  return Math.min(Math.max(raw, 50), MAX_GEOFENCE_RADIUS_M);
}

export function assertWithinGeofence(
  arrival: { lat: number; lng: number },
  property: { lat: number; lng: number },
  radiusM = DEFAULT_GEOFENCE_RADIUS_M
): { ok: true; distanceM: number } | { ok: false; distanceM: number; radiusM: number } {
  const distanceM = haversineDistanceMeters(arrival.lat, arrival.lng, property.lat, property.lng);
  if (distanceM <= radiusM) return { ok: true, distanceM };
  return { ok: false, distanceM, radiusM };
}

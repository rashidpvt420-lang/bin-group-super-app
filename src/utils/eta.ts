export type GeoPointLike = {
  lat?: number | string | null;
  lng?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

const R = 6371;

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readLatLng(point?: GeoPointLike | null) {
  if (!point) return null;
  const lat = toNumber(point.lat ?? point.latitude);
  const lng = toNumber(point.lng ?? point.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function distanceKm(a?: GeoPointLike | null, b?: GeoPointLike | null) {
  const start = readLatLng(a);
  const end = readLatLng(b);
  if (!start || !end) return null;
  const dLat = ((end.lat - start.lat) * Math.PI) / 180;
  const dLng = ((end.lng - start.lng) * Math.PI) / 180;
  const lat1 = (start.lat * Math.PI) / 180;
  const lat2 = (end.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function etaMinutes(a?: GeoPointLike | null, b?: GeoPointLike | null, averageKmh = 35) {
  const km = distanceKm(a, b);
  if (km === null) return null;
  return Math.max(1, Math.round((km / Math.max(averageKmh, 1)) * 60));
}

export function staleLocationLabel(updatedAt?: any) {
  if (!updatedAt) return 'Location pending';
  const ms = updatedAt?.seconds ? updatedAt.seconds * 1000 : Date.parse(String(updatedAt));
  if (!Number.isFinite(ms)) return 'Location pending';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin <= 1) return 'Updated now';
  return `Updated ${diffMin} min ago`;
}

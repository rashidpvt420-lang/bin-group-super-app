export type NormalizedUaeCoordinate = {
  lat: number;
  lng: number;
  swapped: boolean;
};

export const UAE_COORDINATE_BOUNDS = Object.freeze({
  minLat: 22,
  maxLat: 27,
  minLng: 51,
  maxLng: 57,
});

const finite = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  const latitude = finite(lat);
  const longitude = finite(lng);
  return latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0);
}

export function isValidUaeLatLng(lat: unknown, lng: unknown): boolean {
  const latitude = finite(lat);
  const longitude = finite(lng);
  if (latitude === null || longitude === null || !isValidLatLng(latitude, longitude)) return false;
  return latitude >= UAE_COORDINATE_BOUNDS.minLat &&
    latitude <= UAE_COORDINATE_BOUNDS.maxLat &&
    longitude >= UAE_COORDINATE_BOUNDS.minLng &&
    longitude <= UAE_COORDINATE_BOUNDS.maxLng;
}

/**
 * UAE launch coordinate parser.
 *
 * Reversal is corrected only when it is unambiguous: the supplied pair is
 * outside the UAE bounds but its swapped order is inside them. Arbitrary
 * out-of-country points are rejected rather than silently trusted.
 */
export function normalizeUaeCoordinatePair(lat: unknown, lng: unknown): NormalizedUaeCoordinate | null {
  const latitude = finite(lat);
  const longitude = finite(lng);
  if (latitude === null || longitude === null) return null;
  if (isValidUaeLatLng(latitude, longitude)) {
    return { lat: latitude, lng: longitude, swapped: false };
  }
  if (isValidUaeLatLng(longitude, latitude)) {
    return { lat: longitude, lng: latitude, swapped: true };
  }
  return null;
}

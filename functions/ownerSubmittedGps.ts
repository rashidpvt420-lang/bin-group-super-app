export function isValidOwnerSubmittedGps(rawLat: unknown, rawLng: unknown): boolean {
  if (rawLat == null || rawLng == null || String(rawLat).trim() === "" || String(rawLng).trim() === "") return false;
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0) &&
    !(lat >= 51 && lat <= 57 && lng >= 22 && lng <= 27);
}

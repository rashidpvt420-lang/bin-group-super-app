export type MapCoordinate = { lat: number; lng: number };

export type VerifiedPropertyPin = {
  point: MapCoordinate;
  propertyId: string;
  verifiedBy: string;
  verifiedAtMs: number;
  source: string;
};

const ALLOWED_VERIFICATION_SOURCES = new Set([
  'google_maps',
  'title_deed',
  'admin_manual',
  'device_gps',
]);

export const timestampMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapCoordinate = (value: any): MapCoordinate | null => {
  if (!value) return null;
  const source = value.point || value.location || value;
  const lat = Number(source.lat ?? source.latitude);
  const lng = Number(source.lng ?? source.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

export const recordedTicketCoordinate = (ticket: any): MapCoordinate | null =>
  mapCoordinate(ticket?.jobLocation) ||
  mapCoordinate(ticket?.propertyLocation) ||
  mapCoordinate(ticket?.location) ||
  null;

const canonicalGeo = (property: any) => property?.geo || property?.geoAnchor || property?.verifiedGeo || null;

/**
 * Fail-closed production property-pin contract.
 *
 * A numeric coordinate alone is never a verified pin. The canonical property
 * record must prove review completion, dispatch readiness, verifier identity,
 * verification time and an approved capture source.
 */
export const resolveVerifiedPropertyPin = (property: any): VerifiedPropertyPin | null => {
  if (!property || typeof property !== 'object') return null;
  const propertyId = String(property.id || property.propertyId || '').trim();
  const geo = canonicalGeo(property);
  if (!propertyId || !geo || typeof geo !== 'object') return null;
  if (geo.verified !== true) return null;
  if (geo.dispatchReady !== true) return null;
  if (geo.requiresGeoReview === true) return null;

  const verifiedBy = String(geo.verifiedBy || '').trim();
  const verifiedAtMs = timestampMillis(geo.verifiedAt);
  const source = String(geo.source || '').trim().toLowerCase();
  const point = mapCoordinate(geo);
  if (!verifiedBy || verifiedAtMs === null || verifiedAtMs <= 0 || !point) return null;
  if (!ALLOWED_VERIFICATION_SOURCES.has(source)) return null;

  return { point, propertyId, verifiedBy, verifiedAtMs, source };
};

export const ticketPropertyId = (ticket: any) => String(
  ticket?.propertyId ||
  ticket?.propertyUid ||
  ticket?.property?.id ||
  '',
).trim();

export const verifiedPinForTicket = (
  ticket: any,
  propertiesById: ReadonlyMap<string, any>,
): VerifiedPropertyPin | null => {
  const propertyId = ticketPropertyId(ticket);
  if (!propertyId) return null;
  return resolveVerifiedPropertyPin(propertiesById.get(propertyId));
};

export const liveLocationIsFreshAt = (location: any, nowMs: number) => {
  if (location?.isTracking !== true) return false;
  const expiresAt = timestampMillis(location?.expiresAt);
  const updatedAt = timestampMillis(location?.serverUpdatedAt || location?.location?.serverUpdatedAt);
  if (expiresAt !== null && expiresAt <= nowMs) return false;
  if (updatedAt === null || nowMs - updatedAt > 120_000) return false;
  return Boolean(mapCoordinate(location?.location));
};

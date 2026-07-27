export type MapCoordinate = { lat: number; lng: number };

export type VerifiedPropertyPin = {
  point: MapCoordinate;
  propertyId: string;
  verifiedBy: string;
  verifiedAtMs: number;
  source: string;
  verificationVersion: 1;
};

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

/**
 * Fail-closed production property-pin contract.
 *
 * Browser aliases and numeric coordinates are evidence only. A rendered pin
 * requires canonical `geo` plus matching versioned Founder-MFA verification.
 */
export const resolveVerifiedPropertyPin = (property: any): VerifiedPropertyPin | null => {
  if (!property || typeof property !== 'object') return null;
  const propertyId = String(property.id || property.propertyId || '').trim();
  const geo = property.geo;
  const verification = property.geoVerification;
  if (!propertyId || !geo || typeof geo !== 'object' || !verification || typeof verification !== 'object') return null;
  if (geo.verified !== true || geo.dispatchReady !== true || geo.requiresGeoReview === true) return null;
  if (geo.source !== 'admin_manual' || Number(geo.verificationVersion) !== 1) return null;
  if (verification.state !== 'VERIFIED' || verification.source !== 'FOUNDER_MFA_REVIEW' || Number(verification.verificationVersion) !== 1) return null;

  const verifiedBy = String(geo.verifiedBy || '').trim();
  const verificationActor = String(verification.verifiedBy || '').trim();
  const verifiedAtMs = timestampMillis(geo.verifiedAt);
  const verificationAtMs = timestampMillis(verification.verifiedAt);
  const point = mapCoordinate(geo);
  if (
    !verifiedBy ||
    verifiedBy !== verificationActor ||
    verifiedAtMs === null ||
    verificationAtMs === null ||
    verifiedAtMs <= 0 ||
    verifiedAtMs !== verificationAtMs ||
    !point
  ) return null;

  return {
    point,
    propertyId,
    verifiedBy,
    verifiedAtMs,
    source: geo.source,
    verificationVersion: 1,
  };
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

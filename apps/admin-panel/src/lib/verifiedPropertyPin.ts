export type MapCoordinate = { lat: number; lng: number };

export type VerifiedPropertyPin = {
  point: MapCoordinate;
  propertyId: string;
  verifiedBy: string;
  verifiedAtMs: number;
  source: 'admin_manual' | 'physical_inspection';
  verificationVersion: 1 | 2;
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

const text = (value: unknown, max = 500) => String(value ?? '').trim().slice(0, max);

/**
 * Fail-closed production property-pin contract.
 *
 * Browser aliases and numeric coordinates are evidence only. A rendered pin
 * requires canonical `geo` plus a matching server-authored verification record.
 * Version 1 is controlled Founder-MFA legacy compatibility. Version 2 is the
 * canonical inspection-first contract and is bound to immutable physical visit
 * evidence plus the inspection that supplied the verified arrival coordinate.
 */
export const resolveVerifiedPropertyPin = (property: any): VerifiedPropertyPin | null => {
  if (!property || typeof property !== 'object') return null;
  const propertyId = text(property.id || property.propertyId, 240);
  const geo = property.geo;
  const verification = property.geoVerification;
  if (!propertyId || !geo || typeof geo !== 'object' || !verification || typeof verification !== 'object') return null;
  if (geo.verified !== true || geo.dispatchReady !== true || geo.requiresGeoReview === true) return null;
  if (verification.state !== 'VERIFIED') return null;

  const verifiedBy = text(geo.verifiedBy, 240);
  const verificationActor = text(verification.verifiedBy, 240);
  const verifiedAtMs = timestampMillis(geo.verifiedAt);
  const verificationAtMs = timestampMillis(verification.verifiedAt);
  const geoVersion = Number(geo.verificationVersion);
  const verificationVersion = Number(verification.verificationVersion);
  const point = mapCoordinate(geo);
  if (
    !verifiedBy ||
    verifiedBy !== verificationActor ||
    verifiedAtMs === null ||
    verificationAtMs === null ||
    verifiedAtMs <= 0 ||
    verifiedAtMs !== verificationAtMs ||
    geoVersion !== verificationVersion ||
    !point
  ) return null;

  const founderVerified =
    geoVersion === 1 &&
    geo.source === 'admin_manual' &&
    verification.source === 'FOUNDER_MFA_REVIEW';

  const inspectionId = text(verification.inspectionId, 240);
  const evidenceHash = text(verification.evidenceHash, 128).toLowerCase();
  const evidenceGeneration = text(verification.evidenceGeneration, 180);
  const physicalVerified =
    geoVersion === 2 &&
    geo.source === 'physical_inspection' &&
    verification.source === 'PHYSICAL_INSPECTION_EVIDENCE' &&
    Boolean(inspectionId) &&
    /^[a-f0-9]{64}$/.test(evidenceHash) &&
    Boolean(evidenceGeneration) &&
    text(geo.inspectionId, 240) === inspectionId &&
    text(geo.evidenceHash, 128).toLowerCase() === evidenceHash &&
    text(geo.evidenceGeneration, 180) === evidenceGeneration;

  if (!founderVerified && !physicalVerified) return null;

  return {
    point,
    propertyId,
    verifiedBy,
    verifiedAtMs,
    source: geo.source,
    verificationVersion: geoVersion as 1 | 2,
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

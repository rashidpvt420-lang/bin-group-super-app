export type Coordinate = { lat: number; lng: number };

export type LiveLocationLike = {
  isTracking?: boolean;
  expiresAt?: unknown;
  serverUpdatedAt?: unknown;
  location?: unknown;
};

export type VerifiedPropertyPin = {
  propertyId: string;
  point: Coordinate;
  verifiedBy: string;
  verifiedAtMs: number;
  source: string;
};

const text = (value: unknown) => String(value ?? '').trim();
const upper = (value: unknown) => text(value).toUpperCase();

export const timestampMillis = (value: any): number | null => {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
  if (Number.isFinite(value._seconds)) return Number(value._seconds) * 1000;
  if (Number.isFinite(value)) return Number(value);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

export const coordinate = (value: any): Coordinate | null => {
  if (!value) return null;
  const source = value.point || value.location || value;
  const lat = Number(source.latitude ?? source.lat ?? source._latitude);
  const lng = Number(source.longitude ?? source.lng ?? source._longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

const trustedSource = (value: unknown) => {
  const source = text(value).toLowerCase();
  return (
    source === 'admin_verified_owner_onboarding' ||
    source === 'admin_approved_owner_onboarding' ||
    source === 'title_deed' ||
    source === 'device_gps' ||
    source === 'google_maps' ||
    source.startsWith('admin_verified')
  );
};

export function verifiedPropertyPin(property: any): VerifiedPropertyPin | null {
  if (!property || typeof property !== 'object') return null;
  const propertyId = text(property.id || property.propertyId);
  if (!propertyId) return null;

  const geo = property.geo && typeof property.geo === 'object' ? property.geo : {};
  const location = property.location && typeof property.location === 'object' ? property.location : {};
  const point = coordinate(geo) || coordinate(location);
  if (!point) return null;

  const verified = geo.verified === true || location.verified === true || property.verified === true;
  const dispatchReady = geo.dispatchReady === true || location.dispatchReady === true || property.dispatchReady === true;
  const requiresReview = geo.requiresGeoReview === true || location.requiresGeoReview === true || property.requiresGeoReview === true;
  const active = ['ACTIVE', 'APPROVED'].includes(upper(property.status || property.activationState));
  const adminApproved = property.approved === true || property.adminApproved === true || upper(property.source) === 'ADMIN_APPROVED_OWNER_ONBOARDING';
  const source = text(geo.source || location.source || property.source);
  const verifiedBy = text(
    geo.verifiedBy ||
    location.verifiedBy ||
    property.verifiedBy ||
    property.approvedBy ||
    property.activatedBy ||
    (upper(property.source) === 'ADMIN_APPROVED_OWNER_ONBOARDING' ? 'admin-approved-owner-onboarding' : ''),
  );
  const verifiedAtMs = timestampMillis(
    geo.verifiedAt ||
    location.verifiedAt ||
    property.verifiedAt ||
    property.activatedAt ||
    property.activatedAtIso ||
    property.updatedAt,
  );

  if (!verified || !dispatchReady || requiresReview || !active || !adminApproved) return null;
  if (!trustedSource(source) || !verifiedBy || verifiedAtMs === null) return null;

  return { propertyId, point, verifiedBy, verifiedAtMs, source };
}

export const ticketPropertyId = (ticket: any) => text(
  ticket?.propertyId ||
  ticket?.property?.id ||
  ticket?.propertyRefId ||
  ticket?.propertyDocumentId,
);

export function resolveVerifiedTicketPin(
  ticket: any,
  propertiesById: ReadonlyMap<string, any>,
): VerifiedPropertyPin | null {
  const propertyId = ticketPropertyId(ticket);
  if (!propertyId) return null;
  const property = propertiesById.get(propertyId);
  return verifiedPropertyPin(property);
}

export const recordedTicketCoordinate = (ticket: any): Coordinate | null => (
  coordinate(ticket?.jobLocation) ||
  coordinate(ticket?.propertyLocation) ||
  coordinate(ticket?.location) ||
  null
);

export function liveLocationIsFresh(location: LiveLocationLike, nowMs = Date.now()) {
  if (location.isTracking !== true) return false;
  const expiresAt = timestampMillis(location.expiresAt);
  const source: any = location.location || {};
  const updatedAt = timestampMillis(location.serverUpdatedAt || source.serverUpdatedAt);
  if (expiresAt !== null && expiresAt <= nowMs) return false;
  if (updatedAt === null || nowMs - updatedAt > 120_000) return false;
  return Boolean(coordinate(location.location));
}

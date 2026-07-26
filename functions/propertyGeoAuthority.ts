export type CanonicalPropertyGeo = {
  lat: number;
  lng: number;
  latitude: number;
  longitude: number;
  address: string;
  emirate: string;
  city: string;
  area: string;
  placeId: string | null;
  geohash: string;
  source: "admin_manual";
  submittedSource: string;
  verified: true;
  verifiedBy: string;
  verifiedAt: unknown;
  dispatchReady: true;
  requiresGeoReview: false;
  accuracyMeters: number | null;
  capturedAt: unknown;
  verificationVersion: 1;
};

export type PropertyGeoVerification = {
  state: "VERIFIED";
  source: "FOUNDER_MFA_REVIEW";
  verifiedBy: string;
  verifiedAt: unknown;
  submittedSource: string;
  verificationVersion: 1;
};

export type DispatchReadyPropertyGeo = {
  lat: number;
  lng: number;
  address: string;
  emirate: string;
  city: string;
  area: string;
  placeId: string | null;
  verifiedBy: string;
  verifiedAtMs: number;
  verificationVersion: 1;
};

export class PropertyGeoAuthorityError extends Error {
  readonly code = "PROPERTY_GEO_NOT_VERIFIED";
}

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const timestampMillis = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: unknown };
    if (typeof candidate.toMillis === "function") {
      const parsed = candidate.toMillis();
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (Number.isFinite(Number(candidate.seconds))) return Number(candidate.seconds) * 1000;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
};

const validCoordinate = (lat: number | null, lng: number | null) =>
  lat !== null &&
  lng !== null &&
  lat >= -90 && lat <= 90 &&
  lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0);

const fail = (message: string): never => {
  throw new PropertyGeoAuthorityError(message);
};

export function buildFounderVerifiedPropertyGeo(
  property: Record<string, any>,
  actorUid: string,
  now: unknown,
): { geo: CanonicalPropertyGeo; geoVerification: PropertyGeoVerification } {
  const candidate = property.submittedGeo || property.geo || property.location;
  if (!candidate || typeof candidate !== "object") {
    fail("A submitted property location is required before Founder verification.");
  }

  const lat = finite(candidate.lat ?? candidate.latitude);
  const lng = finite(candidate.lng ?? candidate.longitude);
  if (!validCoordinate(lat, lng)) fail("The submitted property coordinates are invalid.");

  const address = text(candidate.address || property.address, 500);
  const emirate = text(candidate.emirate || property.emirate, 120);
  const city = text(candidate.city || property.city, 120);
  const area = text(candidate.area || property.area, 160);
  if (!address || !emirate || (!city && !area)) {
    fail("Address, emirate, and city or area are required before Founder verification.");
  }

  const verifiedBy = text(actorUid, 240);
  if (!verifiedBy) fail("Founder identity is required for property geo verification.");

  const submittedSource = text(candidate.submittedSource || candidate.source, 80) || "owner_submission";
  const accuracy = finite(candidate.accuracyMeters ?? candidate.accuracy);
  const geo: CanonicalPropertyGeo = {
    lat: lat!,
    lng: lng!,
    latitude: lat!,
    longitude: lng!,
    address,
    emirate,
    city,
    area,
    placeId: text(candidate.placeId || property.googlePlaceId, 240) || null,
    geohash: text(candidate.geohash, 120),
    source: "admin_manual",
    submittedSource,
    verified: true,
    verifiedBy,
    verifiedAt: now,
    dispatchReady: true,
    requiresGeoReview: false,
    accuracyMeters: accuracy === null ? null : Math.max(0, accuracy),
    capturedAt: candidate.capturedAt || now,
    verificationVersion: 1,
  };
  return {
    geo,
    geoVerification: {
      state: "VERIFIED",
      source: "FOUNDER_MFA_REVIEW",
      verifiedBy,
      verifiedAt: now,
      submittedSource,
      verificationVersion: 1,
    },
  };
}

export function resolveDispatchReadyPropertyGeo(property: Record<string, any>): DispatchReadyPropertyGeo {
  const geo = property?.geo;
  const verification = property?.geoVerification;
  if (!geo || typeof geo !== "object" || !verification || typeof verification !== "object") {
    fail("Founder-verified property geography is required before dispatch.");
  }

  const lat = finite(geo.lat ?? geo.latitude);
  const lng = finite(geo.lng ?? geo.longitude);
  if (!validCoordinate(lat, lng)) fail("Canonical property coordinates are invalid.");

  const verifiedBy = text(geo.verifiedBy, 240);
  const verificationActor = text(verification.verifiedBy, 240);
  const geoVerifiedAtMs = timestampMillis(geo.verifiedAt);
  const verificationAtMs = timestampMillis(verification.verifiedAt);
  if (
    geo.verified !== true ||
    geo.dispatchReady !== true ||
    geo.requiresGeoReview === true ||
    geo.source !== "admin_manual" ||
    Number(geo.verificationVersion) !== 1 ||
    verification.state !== "VERIFIED" ||
    verification.source !== "FOUNDER_MFA_REVIEW" ||
    Number(verification.verificationVersion) !== 1 ||
    !verifiedBy ||
    verifiedBy !== verificationActor ||
    geoVerifiedAtMs === null ||
    verificationAtMs === null ||
    geoVerifiedAtMs <= 0 ||
    geoVerifiedAtMs !== verificationAtMs
  ) {
    fail("Property geography has not passed the canonical Founder-MFA verification contract.");
  }

  const address = text(geo.address || property.address, 500);
  const emirate = text(geo.emirate || property.emirate, 120);
  const city = text(geo.city || property.city, 120);
  const area = text(geo.area || property.area, 160);
  if (!address || !emirate || (!city && !area)) {
    fail("Canonical property geography is missing required address evidence.");
  }

  return {
    lat: lat!,
    lng: lng!,
    address,
    emirate,
    city,
    area,
    placeId: text(geo.placeId, 240) || null,
    verifiedBy,
    verifiedAtMs: geoVerifiedAtMs!,
    verificationVersion: 1,
  };
}

export function hasDispatchReadyPropertyGeo(property: Record<string, any>): boolean {
  try {
    resolveDispatchReadyPropertyGeo(property);
    return true;
  } catch {
    return false;
  }
}

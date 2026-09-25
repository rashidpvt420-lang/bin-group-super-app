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
  source: "admin_manual" | "physical_inspection";
  submittedSource: string;
  verified: true;
  verifiedBy: string;
  verifiedAt: unknown;
  dispatchReady: true;
  requiresGeoReview: false;
  accuracyMeters: number | null;
  capturedAt: unknown;
  verificationVersion: 1 | 2;
  inspectionId?: string;
  evidenceHash?: string;
  evidenceGeneration?: string;
};

export type PropertyGeoVerification = {
  state: "VERIFIED";
  source: "FOUNDER_MFA_REVIEW" | "PHYSICAL_INSPECTION_EVIDENCE";
  verifiedBy: string;
  verifiedAt: unknown;
  submittedSource: string;
  verificationVersion: 1 | 2;
  inspectionId?: string;
  evidenceHash?: string;
  evidenceGeneration?: string;
  arrivalDistanceMetres?: number;
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
  verificationVersion: 1 | 2;
  verificationSource: "FOUNDER_MFA_REVIEW" | "PHYSICAL_INSPECTION_EVIDENCE";
  inspectionId: string | null;
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

const looksLikeReversedUaeLatLng = (lat: number | null, lng: number | null) =>
  lat !== null &&
  lng !== null &&
  lat >= 51 && lat <= 57 &&
  lng >= 22 && lng <= 27;

const validCoordinate = (lat: number | null, lng: number | null) =>
  lat !== null &&
  lng !== null &&
  lat >= -90 && lat <= 90 &&
  lng >= -180 && lng <= 180 &&
  !(lat === 0 && lng === 0) &&
  !looksLikeReversedUaeLatLng(lat, lng);

const fail = (message: string): never => {
  throw new PropertyGeoAuthorityError(message);
};

function propertyAddressEvidence(property: Record<string, any>, candidate: Record<string, any>) {
  const address = text(candidate.address || property.address, 500);
  const emirate = text(candidate.emirate || property.emirate, 120);
  const city = text(candidate.city || property.city, 120);
  const area = text(candidate.area || property.area, 160);
  if (!address || !emirate || (!city && !area)) {
    fail("Address, emirate, and city or area are required before property geo verification.");
  }
  return { address, emirate, city, area };
}

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

  const { address, emirate, city, area } = propertyAddressEvidence(property, candidate);
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

export function buildInspectionVerifiedPropertyGeo(
  property: Record<string, any>,
  inspection: Record<string, any>,
  actorUid: string,
  now: unknown,
): { geo: CanonicalPropertyGeo; geoVerification: PropertyGeoVerification } {
  const evidenceHash = text(inspection.evidenceHash, 128).toLowerCase();
  const evidenceGeneration = text(inspection.evidenceGeneration, 180);
  const inspectionId = text(inspection.id || inspection.inspectionId, 240);
  const arrival = inspection.arrivalLocation;
  if (
    !inspectionId ||
    String(inspection.status || "").trim().toUpperCase() !== "COMPLETED" ||
    String(inspection.evidenceStatus || "").trim().toUpperCase() !== "VERIFIED" ||
    !/^[a-f0-9]{64}$/.test(evidenceHash) ||
    !evidenceGeneration ||
    inspection.checklistVerified !== true ||
    arrival?.withinRadius !== true ||
    !inspection.visitStartedAt ||
    !inspection.visitCompletedAt
  ) {
    fail("Completed physical inspection evidence is required before dispatch geography can be verified.");
  }

  const lat = finite(arrival?.lat);
  const lng = finite(arrival?.lng);
  if (!validCoordinate(lat, lng)) fail("Physical inspection arrival coordinates are invalid.");

  const submitted = property.submittedGeo || property.geo || property.location || {};
  const { address, emirate, city, area } = propertyAddressEvidence(property, submitted);
  const verifiedBy = text(actorUid, 240);
  if (!verifiedBy) fail("Inspector identity is required for physical property geo verification.");

  const submittedSource = text(submitted.submittedSource || submitted.source, 80) || "owner_submission";
  const distanceMetres = finite(arrival?.distanceMetres);
  const geo: CanonicalPropertyGeo = {
    lat: lat!,
    lng: lng!,
    latitude: lat!,
    longitude: lng!,
    address,
    emirate,
    city,
    area,
    placeId: text(submitted.placeId || property.googlePlaceId, 240) || null,
    geohash: text(submitted.geohash, 120),
    source: "physical_inspection",
    submittedSource,
    verified: true,
    verifiedBy,
    verifiedAt: now,
    dispatchReady: true,
    requiresGeoReview: false,
    accuracyMeters: null,
    capturedAt: inspection.visitCompletedAt,
    verificationVersion: 2,
    inspectionId,
    evidenceHash,
    evidenceGeneration,
  };
  return {
    geo,
    geoVerification: {
      state: "VERIFIED",
      source: "PHYSICAL_INSPECTION_EVIDENCE",
      verifiedBy,
      verifiedAt: now,
      submittedSource,
      verificationVersion: 2,
      inspectionId,
      evidenceHash,
      evidenceGeneration,
      arrivalDistanceMetres: distanceMetres === null ? undefined : Math.max(0, distanceMetres),
    },
  };
}

export function resolveDispatchReadyPropertyGeo(property: Record<string, any>): DispatchReadyPropertyGeo {
  const geo = property?.geo;
  const verification = property?.geoVerification;
  if (!geo || typeof geo !== "object" || !verification || typeof verification !== "object") {
    fail("Server-verified property geography is required before dispatch.");
  }

  const lat = finite(geo.lat ?? geo.latitude);
  const lng = finite(geo.lng ?? geo.longitude);
  if (!validCoordinate(lat, lng)) fail("Canonical property coordinates are invalid.");

  const verifiedBy = text(geo.verifiedBy, 240);
  const verificationActor = text(verification.verifiedBy, 240);
  const geoVerifiedAtMs = timestampMillis(geo.verifiedAt);
  const verificationAtMs = timestampMillis(verification.verifiedAt);
  const geoVersion = Number(geo.verificationVersion);
  const verificationVersion = Number(verification.verificationVersion);
  const commonValid =
    geo.verified === true &&
    geo.dispatchReady === true &&
    geo.requiresGeoReview !== true &&
    verification.state === "VERIFIED" &&
    !verifiedBy === false &&
    verifiedBy === verificationActor &&
    geoVerifiedAtMs !== null &&
    verificationAtMs !== null &&
    geoVerifiedAtMs > 0 &&
    geoVerifiedAtMs === verificationAtMs &&
    geoVersion === verificationVersion;
  if (!commonValid) {
    fail("Property geography has not passed a canonical server verification contract.");
  }

  const founderVerified =
    geoVersion === 1 &&
    geo.source === "admin_manual" &&
    verification.source === "FOUNDER_MFA_REVIEW";
  const physicalVerified =
    geoVersion === 2 &&
    geo.source === "physical_inspection" &&
    verification.source === "PHYSICAL_INSPECTION_EVIDENCE" &&
    Boolean(text(verification.inspectionId, 240)) &&
    /^[a-f0-9]{64}$/.test(text(verification.evidenceHash, 128).toLowerCase()) &&
    Boolean(text(verification.evidenceGeneration, 180)) &&
    text(geo.inspectionId, 240) === text(verification.inspectionId, 240) &&
    text(geo.evidenceHash, 128).toLowerCase() === text(verification.evidenceHash, 128).toLowerCase() &&
    text(geo.evidenceGeneration, 180) === text(verification.evidenceGeneration, 180);
  if (!founderVerified && !physicalVerified) {
    fail("Property geography verification source or evidence binding is invalid.");
  }

  const { address, emirate, city, area } = propertyAddressEvidence(property, geo);
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
    verificationVersion: geoVersion as 1 | 2,
    verificationSource: verification.source,
    inspectionId: text(verification.inspectionId, 240) || null,
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

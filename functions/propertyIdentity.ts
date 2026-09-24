import { createHash } from "crypto";

export const PROPERTY_IDENTITY_VERSION = "PROPERTY_IDENTITY_V1";

export type PropertyIdentity = {
  raw: string;
  hash: string;
  kind: "TITLE_DEED" | "PLACE_UNIT" | "ADDRESS_UNIT" | "GEO_UNIT";
};

type PlainRecord = Record<string, any>;

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const record = (value: unknown): PlainRecord => (
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : {}
);

export function normalizePropertyIdentityText(value: unknown, max = 500) {
  return text(value, max)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function finiteCoordinate(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function identityHash(raw: string) {
  return createHash("sha256").update(`${PROPERTY_IDENTITY_VERSION}\n${raw}`).digest("hex");
}

export function buildPropertyIdentities(property: PlainRecord): PropertyIdentity[] {
  const geo = record(property.submittedGeo || property.geo || property.location);
  const point = record(geo.point);
  const lat = finiteCoordinate(geo.lat ?? geo.latitude ?? point.latitude ?? property.lat ?? property.latitude, -90, 90);
  const lng = finiteCoordinate(geo.lng ?? geo.longitude ?? point.longitude ?? property.lng ?? property.longitude, -180, 180);
  const deed = normalizePropertyIdentityText(
    property.titleDeedNumber ||
    property.titleDeedId ||
    property.titleDeedReference ||
    property.propertyDocumentNumber ||
    property.propertyReference,
    180,
  );
  const unit = normalizePropertyIdentityText(
    property.unitNumber || property.unitNo || property.unit || property.unitId,
    120,
  );
  const placeId = normalizePropertyIdentityText(geo.placeId || property.googlePlaceId, 220);
  const address = normalizePropertyIdentityText(geo.address || property.address || property.propertyAddress, 500);
  const emirate = normalizePropertyIdentityText(geo.emirate || property.emirate, 120);
  const area = normalizePropertyIdentityText(geo.area || property.area || property.community, 180);
  const propertyType = normalizePropertyIdentityText(property.propertyType || property.type || property.subType, 120);
  const unitToken = unit || "whole-property";
  const identities: Array<{ raw: string; kind: PropertyIdentity["kind"] }> = [];

  if (deed) identities.push({ raw: `deed|${deed}`, kind: "TITLE_DEED" });
  if (placeId) identities.push({ raw: `place|${placeId}|unit|${unitToken}`, kind: "PLACE_UNIT" });
  if (address) {
    identities.push({
      raw: `address|${emirate}|${area}|${address}|unit|${unitToken}`,
      kind: "ADDRESS_UNIT",
    });
  }
  if (lat !== null && lng !== null) {
    identities.push({
      raw: `geo|${lat.toFixed(5)}|${lng.toFixed(5)}|unit|${unitToken}|type|${unit ? "" : propertyType}`,
      kind: "GEO_UNIT",
    });
  }

  const deduplicated = new Map<string, PropertyIdentity>();
  for (const identity of identities) {
    if (!identity.raw.replace(/[|\s]/g, "")) continue;
    deduplicated.set(identity.raw, {
      ...identity,
      hash: identityHash(identity.raw),
    });
  }
  return [...deduplicated.values()];
}

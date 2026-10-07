/**
 * Human-readable property labels for owner-facing surfaces (ticket list,
 * ticket detail, notifications).
 *
 * Canonical onboarding writes property records keyed
 * `${intakeId}_property_${n}` and does not always store a `name` /
 * `propertyName` — only the address, area/city/emirate and property type.
 * Callers previously fell back to the document ID, so owners saw labels such as
 * "d8bcdb8b-…_property_1". These helpers derive a readable label from the
 * property record and never return a raw document identifier.
 *
 * Dependency-free so it can be shared by Cloud Functions and the web client.
 */

type PlainRecord = Record<string, any>;

export const DEFAULT_PROPERTY_LABEL = "Property";

// `${intakeId}_property_${n}` / `owner_${uid}_property_${n}` canonical IDs.
const GENERATED_PROPERTY_ID = /_property_\d+$/i;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
// Firestore auto-generated document IDs.
const FIRESTORE_AUTO_ID = /^[A-Za-z0-9]{20}$/;
const RAW_PROPERTY_ID_IN_TEXT = /[A-Za-z0-9-]+(?:_[A-Za-z0-9-]+)*_property_\d+/g;

const NAME_FIELDS = ["propertyName", "name", "buildingName", "title", "propertyTitle", "displayName"];

function clean(value: unknown, max = 240): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

/** True when the value is (or looks like) a raw property document ID. */
export function isRawPropertyIdentifier(value: unknown, knownIds: unknown[] = []): boolean {
  const candidate = clean(value, 1000);
  if (!candidate) return false;
  const ids = knownIds.map((id) => clean(id, 1000)).filter(Boolean);
  if (ids.includes(candidate)) return true;
  if (/\s/.test(candidate)) return false;
  if (GENERATED_PROPERTY_ID.test(candidate)) return true;
  if (UUID_PREFIX.test(candidate)) return true;
  return FIRESTORE_AUTO_ID.test(candidate) && /\d/.test(candidate) && /[a-z]/.test(candidate) && /[A-Z]/.test(candidate);
}

function readable(value: unknown, knownIds: unknown[]): string {
  const candidate = clean(value);
  return candidate && !isRawPropertyIdentifier(candidate, knownIds) ? candidate : "";
}

function firstReadable(values: unknown[], knownIds: unknown[]): string {
  for (const value of values) {
    const candidate = readable(value, knownIds);
    if (candidate) return candidate;
  }
  return "";
}

function includesFolded(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Readable label for a property record: its name if it has one, otherwise
 * "<type> · <area>, <address>" built from the stored address fields.
 */
export function resolvePropertyDisplayName(
  property: PlainRecord | null | undefined,
  options: { propertyId?: unknown; fallback?: string } = {},
): string {
  const fallback = options.fallback ?? DEFAULT_PROPERTY_LABEL;
  if (!property || typeof property !== "object") return fallback;
  const ids = [options.propertyId, property.id, property.propertyId];

  const name = firstReadable(NAME_FIELDS.map((key) => property[key]), ids);
  if (name) return name;

  const address = firstReadable([
    property.addressLine,
    property.address,
    property.propertyAddress,
    property.locationAddress,
    property.geo?.address,
    property.location?.address,
    property.propertyLocation?.address,
  ], ids);
  const locality = firstReadable([property.community, property.area, property.district, property.city], ids);
  const emirate = firstReadable([property.emirate], ids);
  const type = firstReadable([property.propertyType, property.type], ids);

  let place = address;
  if (locality && !(place && includesFolded(place, locality))) place = place ? `${locality}, ${place}` : locality;
  if (emirate && !(place && includesFolded(place, emirate))) place = place ? `${place}, ${emirate}` : emirate;

  if (place) return type ? `${type} · ${place}` : place;
  return type || fallback;
}

/**
 * Readable property label for a maintenance ticket. Prefers the property
 * record, then a readable stored snapshot on the ticket, then the verified job
 * address. Never returns the raw property document ID.
 */
export function resolveTicketPropertyDisplayName(
  ticket: PlainRecord | null | undefined,
  property?: PlainRecord | null,
  fallback: string = DEFAULT_PROPERTY_LABEL,
): string {
  const record = ticket && typeof ticket === "object" ? ticket : {};
  const ids = [record.propertyId, record.propertyUid, property?.id, property?.propertyId];
  if (property && typeof property === "object") {
    const fromRecord = resolvePropertyDisplayName(property, { propertyId: record.propertyId, fallback: "" });
    if (fromRecord) return fromRecord;
  }
  const stored = firstReadable([
    record.propertyName,
    record.property?.name,
    record.propertyLocation?.propertyName,
  ], ids);
  if (stored) return stored;
  const address = firstReadable([
    record.jobLocation?.address,
    record.propertyLocation?.address,
    record.propertyAddress,
  ], ids);
  return address || fallback;
}

/** True when a ticket's stored property label is missing or a raw ID. */
export function ticketNeedsPropertyLabelLookup(ticket: PlainRecord | null | undefined): boolean {
  const record = ticket && typeof ticket === "object" ? ticket : {};
  return !readable(record.propertyName, [record.propertyId, record.propertyUid]);
}

/**
 * Replace raw property IDs inside already-written text (e.g. stored
 * notification bodies) with readable labels.
 */
export function replaceRawPropertyIds(
  text: unknown,
  labelsById: Record<string, string> = {},
  fallback = "your property",
): string {
  let output = typeof text === "string" ? text : clean(text, 5000);
  if (!output) return output;
  const entries = Object.entries(labelsById || {})
    .filter(([id, label]) => clean(id) && clean(label))
    .sort((a, b) => b[0].length - a[0].length);
  for (const [id, label] of entries) output = output.split(id).join(label);
  return output.replace(RAW_PROPERTY_ID_IN_TEXT, fallback);
}
